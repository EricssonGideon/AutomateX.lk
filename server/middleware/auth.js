const jwt = require("jsonwebtoken");

const User = require("../models/User");
const {
  isOfficialAdminEmail,
  resolveTrustedRole
} = require("../utils/authRole");
const {
  normalizePlan,
  resolveAccountStatus,
  normalizePaymentStatus,
  resolveAllowedFeatures
} = require("../utils/account");

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

/**
 * Verifies a bearer token and attaches the decoded user payload to the request.
 *
 * @param {import("express").Request} req - The incoming request.
 * @param {import("express").Response} res - The outgoing response.
 * @param {import("express").NextFunction} next - The next middleware callback.
 * @returns {Promise<void|import("express").Response>} Continues the chain or returns an auth error.
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication token is required." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.sub).lean();

    if (!user) {
      return res.status(401).json({ message: "User account no longer exists." });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "This account has been deactivated." });
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      role: resolveTrustedRole(user),
      plan: normalizePlan(user.plan),
      packageName: normalizePlan(user.plan),
      accountStatus: resolveAccountStatus(user),
      paymentStatus: normalizePaymentStatus(user.paymentStatus),
      allowedFeatures: resolveAllowedFeatures(user),
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      isActive: user.isActive
    };
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
  if (!req.user || req.user.role !== "admin" || !isOfficialAdminEmail(req.user.email)) {
    return res.status(403).json({ message: "Admin access is required." });
  }

  return next();
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
  requireAdmin,
  requireClient,
  requireActiveAccount,
  requireFeature
};
