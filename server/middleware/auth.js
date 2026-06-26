const jwt = require("jsonwebtoken");

const User = require("../models/User");
const {
  ADMIN_ROLE_OPTIONS,
  isAdminRole,
  isEmployeeRole,
  isOfficialAdminEmail,
  resolveTrustedRole
} = require("../utils/authRole");
const {
  normalizePlan,
  resolveAccountStatus,
  normalizePaymentStatus,
  resolveAllowedFeatures
} = require("../utils/account");
const { getJwtSecret } = require("../utils/env");

const JWT_SECRET = getJwtSecret();
const AUTH_COOKIE_NAME = "automatex_auth";
const CSRF_COOKIE_NAME = "automatex_csrf";
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const MANAGER_PERMISSIONS = [
  "stats:view",
  "reports:view",
  "reports:export",
  "clients:view",
  "clients:manage",
  "invoices:view",
  "invoices:manage",
  "invoices:payment-update",
  "invoices:send-email",
  "bookings:view",
  "bookings:manage",
  "inquiries:view",
  "inquiries:manage",
  "reviews:view",
  "reviews:manage",
  "projects:view",
  "projects:manage",
  "projects:update-status",
  "files:view",
  "files:manage",
  "maintenance:view",
  "maintenance:manage",
  "sales:view",
  "sales:manage",
  "leads:view",
  "leads:manage",
  "commissions:view",
  "commissions:manage",
  "commissions:approve",
  "support:view",
  "support:manage"
];

const STAFF_PERMISSIONS = [
  "stats:view",
  "reports:view",
  "clients:view",
  "invoices:view",
  "bookings:view",
  "inquiries:view",
  "reviews:view",
  "projects:view",
  "projects:update-status",
  "files:view",
  "maintenance:view",
  "sales:view",
  "leads:view",
  "commissions:view",
  "support:view",
  "support:manage"
];

const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze(["*"]),
  manager: Object.freeze(MANAGER_PERMISSIONS),
  staff: Object.freeze(STAFF_PERMISSIONS),
  employee: Object.freeze([]),
  client: Object.freeze([])
});

function getRolePermissions(role) {
  return ROLE_PERMISSIONS[String(role || "").trim().toLowerCase()] || ROLE_PERMISSIONS.client;
}

function hasPermission(user, permission) {
  const permissions = getRolePermissions(user && user.role);

  return permissions.includes("*") || permissions.includes(permission);
}

function requireRole(allowedRoles = []) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : Array.from(arguments);
  const allowed = new Set(roles.map((role) => String(role || "").trim().toLowerCase()));

  return (req, res, next) => {
    if (!req.user || !allowed.has(String(req.user.role || "").trim().toLowerCase())) {
      return res.status(403).json({ message: "You do not have access to this admin action." });
    }

    return next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ message: "You do not have access to this admin action." });
    }

    return next();
  };
}

function requireAnyPermission(permissions = []) {
  return (req, res, next) => {
    if (!permissions.some((permission) => hasPermission(req.user, permission))) {
      return res.status(403).json({ message: "You do not have access to this admin action." });
    }

    return next();
  };
}

function parseCookies(header = "") {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      try {
        const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
        const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
        cookies[key] = value;
      } catch {
        return cookies;
      }
      return cookies;
    }, {});
}

function getCsrfHeader(req) {
  return req.headers["x-csrf-token"] || req.headers["x-xsrf-token"] || "";
}

function hasValidCsrfToken(req, cookies) {
  const csrfCookie = cookies[CSRF_COOKIE_NAME] || "";
  const csrfHeader = getCsrfHeader(req);

  return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader);
}

function getRequestToken(req) {
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cookies = parseCookies(req.headers.cookie || "");
  const cookieToken = cookies[AUTH_COOKIE_NAME] || null;
  const method = String(req.method || "GET").toUpperCase();

  if (cookieToken && (SAFE_HTTP_METHODS.has(method) || hasValidCsrfToken(req, cookies))) {
    return { token: cookieToken, source: "cookie", cookies };
  }

  if (bearerToken) {
    return { token: bearerToken, source: "authorization", cookies };
  }

  return { token: cookieToken, source: cookieToken ? "cookie" : "", cookies };
}

/**
 * Verifies a bearer token and attaches the decoded user payload to the request.
 *
 * @param {import("express").Request} req - The incoming request.
 * @param {import("express").Response} res - The outgoing response.
 * @param {import("express").NextFunction} next - The next middleware callback.
 * @returns {Promise<void|import("express").Response>} Continues the chain or returns an auth error.
 */
async function verifyToken(req, res, next) {
  const { token, source, cookies } = getRequestToken(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication token is required." });
  }

  if (source === "cookie" && !SAFE_HTTP_METHODS.has(String(req.method || "GET").toUpperCase()) && !hasValidCsrfToken(req, cookies)) {
    return res.status(403).json({ message: "A valid CSRF token is required for this request." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.sub).lean();

    if (!user) {
      return res.status(401).json({ message: "User account no longer exists." });
    }

    if (!user.isActive || user.status === "suspended" || user.status === "inactive") {
      return res.status(403).json({ message: "This account has been deactivated." });
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: resolveTrustedRole(user),
      status: user.status || (user.isActive ? "active" : "inactive"),
      plan: normalizePlan(user.plan),
      packageName: normalizePlan(user.plan),
      accountStatus: resolveAccountStatus(user),
      paymentStatus: normalizePaymentStatus(user.paymentStatus),
      allowedFeatures: resolveAllowedFeatures(user),
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      isActive: user.isActive
    };
    req.authTokenSource = source;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired authentication token." });
  }
}

/**
 * Ensures the authenticated user has the admin role.
 *
 * @param {import("express").Request} req - The incoming request.
 * @param {import("express").Response} res - The outgoing response.
 * @param {import("express").NextFunction} next - The next middleware callback.
 * @returns {void|import("express").Response} Continues the chain or returns an authorization error.
 */
function requireAdmin(req, res, next) {
  if (!req.user || !isAdminRole(req.user.role)) {
    return res.status(403).json({ message: "Admin access is required." });
  }

  return next();
}

function requireSystemAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Full admin access is required." });
  }

  return next();
}

function requireEmployee(req, res, next) {
  if (!req.user || !isEmployeeRole(req.user.role) || isOfficialAdminEmail(req.user.email)) {
    return res.status(403).json({
      error: "Employee access required",
      message: "Only active AutomateX employee accounts can access this route."
    });
  }

  return next();
}

function requireAdminRole(allowedRoles = ADMIN_ROLE_OPTIONS) {
  return requireRole(allowedRoles);
}

/**
 * Ensures the authenticated user has the client role.
 *
 * @param {import("express").Request} req - The incoming request.
 * @param {import("express").Response} res - The outgoing response.
 * @param {import("express").NextFunction} next - The next middleware callback.
 * @returns {void|import("express").Response} Continues the chain or returns an authorization error.
 */
function requireClient(req, res, next) {
  if (!req.user || req.user.role !== "client" || isOfficialAdminEmail(req.user.email)) {
    return res.status(403).json({
      error: "Client access required",
      message: "Only client accounts can access this route."
    });
  }

  return next();
}

/**
 * Blocks access for client accounts that are not currently active.
 *
 * @param {import("express").Request} req - The incoming request.
 * @param {import("express").Response} res - The outgoing response.
 * @param {import("express").NextFunction} next - The next middleware callback.
 * @returns {void|import("express").Response} Continues the chain or returns an account-status error.
 */
function requireActiveAccount(req, res, next) {
  const accountStatus = req.user && req.user.accountStatus ? req.user.accountStatus : "pending";

  if (accountStatus !== "active") {
    return res.status(403).json({
      error: accountStatus === "suspended" ? "Account suspended" : "Pending admin approval",
      message: accountStatus === "suspended"
        ? "Your account is suspended. Please contact AutomateX support."
        : "Your account is pending admin approval. AutomateX will review your business details and activate your package soon.",
      accountStatus
    });
  }

  return next();
}

/**
 * Enforces client feature access using the normalized feature keys on `req.user`.
 *
 * @param {string} featureKey - The required feature key.
 * @returns {import("express").RequestHandler} Middleware enforcing feature access.
 */
function requireFeature(featureKey) {
  return (req, res, next) => {
    const allowedFeatures = Array.isArray(req.user && req.user.allowedFeatures)
      ? req.user.allowedFeatures
      : [];

    if (!allowedFeatures.includes(featureKey)) {
      return res.status(403).json({
        error: "Feature not enabled",
        message: "Your current package does not include access to this feature.",
        feature: featureKey,
        accountStatus: req.user && req.user.accountStatus ? req.user.accountStatus : "pending"
      });
    }

    return next();
  };
}

module.exports = {
  verifyToken,
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  ROLE_PERMISSIONS,
  parseCookies,
  getRolePermissions,
  hasPermission,
  requireAdmin,
  requireSystemAdmin,
  requireEmployee,
  requireAdminRole,
  requireRole,
  requirePermission,
  requireAnyPermission,
  requireClient,
  requireActiveAccount,
  requireFeature
};
