const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

const User = require("../models/User");
const {
  resolveTrustedRole,
  normalizeEmailAddress,
  isOfficialAdminEmail
} = require("../utils/authRole");
const {
  normalizePlan,
  resolveAccountStatus,
  normalizePaymentStatus,
  resolveAllowedFeatures,
  normalizeMonthlyFee,
  resolveOnboardingStatus,
  hasCompletedBusinessProfile,
  buildFeatureAccess
} = require("../utils/account");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../utils/email");
const { logAdminAction } = require("../utils/auditLog");
const { sendSuccess, sendValidationError, sendError } = require("../utils/response");
const { getJwtSecret } = require("../utils/env");
const { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } = require("../middleware/auth");

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";
const SALT_ROUNDS = 12;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 30;
const DEFAULT_AUTH_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CLIENT_PROFILE_FIELDS = new Set([
  "name",
  "businessName",
  "businessType",
  "phone",
  "location",
  "services",
  "workingHours",
  "chatbotLanguage"
]);

/**
 * Builds the JWT payload from a persisted user record.
 *
 * @param {import("../models/User")} user - The user document or plain object.
 * @returns {{sub: string, email: string, role: string, plan: string}} JWT payload fields.
 */
function buildTokenPayload(user) {
  return {
    sub: String(user._id),
    email: user.email,
    role: resolveTrustedRole(user),
    plan: user.plan
  };
}

/**
 * Extracts human-readable validation messages from express-validator.
 *
 * @param {import("express").Request} req - The incoming request.
 * @returns {string[]} A flat list of validation messages.
 */
function validationMessages(req) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return [];
  }

  return result.array().map((error) => error.msg);
}

/**
 * Signs an authentication token for a user.
 *
 * @param {import("../models/User")} user - The user document or plain object.
 * @returns {string} A signed JWT.
 */
function signToken(user) {
  return jwt.sign(buildTokenPayload(user), JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function parseDurationMs(value, fallback = DEFAULT_AUTH_COOKIE_MAX_AGE_MS) {
  const match = String(value || "").trim().match(/^(\d+)([smhd])?$/i);
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1]);
  const unit = String(match[2] || "s").toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * (multipliers[unit] || multipliers.s);
}

function getCookieOptions(options = {}) {
  return {
    httpOnly: Boolean(options.httpOnly),
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: parseDurationMs(JWT_EXPIRES_IN)
  };
}

function setAuthCookies(res, token) {
  if (!res || typeof res.cookie !== "function") {
    return "";
  }

  const csrfToken = crypto.randomBytes(24).toString("hex");
  res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions({ httpOnly: true }));
  res.cookie(CSRF_COOKIE_NAME, csrfToken, getCookieOptions({ httpOnly: false }));
  return csrfToken;
}

function clearAuthCookies(res) {
  if (!res || typeof res.clearCookie !== "function") {
    return;
  }

  const clearOptions = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  };
  res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
  res.clearCookie(CSRF_COOKIE_NAME, clearOptions);
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function buildPasswordResetUrl(req, token) {
  const configuredBase = process.env.PASSWORD_RESET_URL || process.env.LOGIN_URL || "";
  const baseUrl = configuredBase || `${req.protocol}://${req.get("host")}/login.html`;
  const url = new URL(baseUrl);
  url.searchParams.set("resetToken", token);
  return url.toString();
}

/**
 * Converts a user document into a safe API payload without password data.
 *
 * @param {import("../models/User")} user - The user document or plain object.
 * @returns {{id: string, name: string, email: string, role: string, plan: string, isActive: boolean, stripeCustomerId: string, stripeSubscriptionId: string, businessName: string, businessType: string, phone: string, location: string, services: string[], workingHours: string, bookingUrl: string, chatbotLanguage: string, planExpiresAt: Date|null, createdAt: Date}} Safe user data.
 */
function serializeUser(user) {
  const trustedRole = resolveTrustedRole(user);
  const accountStatus = resolveAccountStatus(user);
  const paymentStatus = normalizePaymentStatus(user.paymentStatus);
  const normalizedPlan = normalizePlan(user.plan);
  const allowedFeatures = resolveAllowedFeatures(user);
  const monthlyFee = normalizeMonthlyFee(user.monthlyFee);
  const onboardingStatus = user.onboardingStatus || resolveOnboardingStatus({
    ...user,
    accountStatus,
    paymentStatus,
    allowedFeatures
  });

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: trustedRole,
    status: user.status || (user.isActive ? "active" : "inactive"),
    plan: normalizedPlan,
    packageName: normalizedPlan,
    monthlyFee,
    accountStatus,
    paymentStatus,
    nextPaymentDate: user.nextPaymentDate || null,
    allowedFeatures,
    onboardingStatus,
    featureAccess: buildFeatureAccess({
      ...user,
      accountStatus,
      allowedFeatures
    }),
    profileCompleted: hasCompletedBusinessProfile(user),
    isActive: user.isActive,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    businessName: user.businessName || "",
    businessType: user.businessType || "",
    phone: user.phone || "",
    location: user.location || "",
    services: Array.isArray(user.services) ? user.services : [],
    workingHours: user.workingHours || "",
    bookingUrl: user.bookingUrl || "",
    chatbotLanguage: user.chatbotLanguage || "",
    planExpiresAt: user.planExpiresAt,
    createdAt: user.createdAt
  };
}

const signupValidators = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required.")
    .isLength({ max: 100 })
    .withMessage("Name must be 100 characters or fewer.")
    .escape(),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required.")
    .isEmail()
    .withMessage("Enter a valid email address.")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters."),
  body("businessName")
    .trim()
    .notEmpty()
    .withMessage("Business name is required.")
    .isLength({ max: 120 })
    .withMessage("Business name must be 120 characters or fewer."),
  body("businessType")
    .trim()
    .notEmpty()
    .withMessage("Business type is required.")
    .isLength({ max: 120 })
    .withMessage("Business type must be 120 characters or fewer."),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone is required.")
    .isLength({ max: 30 })
    .withMessage("Phone must be 30 characters or fewer.")
];

const loginValidators = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required.")
    .isEmail()
    .withMessage("Enter a valid email address.")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required.")
];

const forgotPasswordValidators = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required.")
    .isEmail()
    .withMessage("Enter a valid email address.")
    .normalizeEmail()
];

const resetPasswordValidators = [
  body("token")
    .trim()
    .notEmpty()
    .withMessage("Reset token is required."),
  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters.")
    .matches(/[a-z]/)
    .withMessage("Password must include a lowercase letter.")
    .matches(/[A-Z]/)
    .withMessage("Password must include an uppercase letter.")
    .matches(/[0-9]/)
    .withMessage("Password must include a number.")
];

const updateProfileValidators = [
  body("name")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Name must be 100 characters or fewer."),
  body("businessName")
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage("Business name must be 120 characters or fewer."),
  body("businessType")
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage("Business type must be 120 characters or fewer."),
  body("phone")
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage("Phone must be 30 characters or fewer."),
  body("location")
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage("Location must be 120 characters or fewer."),
  body("workingHours")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Working hours must be 200 characters or fewer."),
  body("chatbotLanguage")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Chatbot language must be 50 characters or fewer."),
  body("services")
    .optional()
    .isArray({ max: 30 })
    .withMessage("Services must be an array with at most 30 entries.")
];

/**
 * Creates a new client account, hashes the password, sends a welcome email,
 * and returns a signed JWT plus the safe user profile.
 *
 * @param {import("express").Request} req - The incoming request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} API response with token and user profile.
 */
async function signup(req, res) {
  try {
    const details = validationMessages(req);
    if (details.length) {
      return sendValidationError(res, "Please fix the signup form and try again.", details);
    }

    const email = normalizeEmailAddress(req.body.email);
    const existingUser = await User.findOne({ email }).lean();

    if (existingUser) {
      return sendError(res, 409, "An account with this email already exists.");
    }

    if (isOfficialAdminEmail(email)) {
      return sendError(
        res,
        403,
        "The official AutomateX owner account cannot be created from public signup."
      );
    }

    const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    const user = await User.create({
      name: String(req.body.name || "").trim(),
      email,
      passwordHash,
      role: "client",
      businessName: String(req.body.businessName || "").trim(),
      businessType: String(req.body.businessType || "").trim(),
      phone: String(req.body.phone || "").trim(),
      plan: "not_assigned",
      monthlyFee: 0,
      accountStatus: "pending",
      paymentStatus: "pending",
      allowedFeatures: [],
      onboardingStatus: "pending"
    });

    const token = signToken(user);
    const csrfToken = setAuthCookies(res, token);
    await sendWelcomeEmail(user);

    return sendSuccess(res, 201, {
      message: "Signup successful.",
      token,
      csrfToken,
      user: serializeUser(user)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to create your account right now.");
  }
}

/**
 * Verifies login credentials and returns a signed JWT plus the safe user profile.
 *
 * @param {import("express").Request} req - The incoming request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} API response with token and user profile.
 */
async function login(req, res) {
  try {
    const details = validationMessages(req);
    if (details.length) {
      return sendValidationError(res, "Please fix the login form and try again.", details);
    }

    const email = normalizeEmailAddress(req.body.email);
    const user = await User.findOne({ email });

    if (!user) {
      await logAdminAction(req, {
        module: "Auth",
        action: "auth.login_failed",
        targetType: "User",
        targetLabel: email,
        severity: "Medium"
      });
      return sendError(res, 401, "Invalid email or password.");
    }

    const passwordMatches = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!passwordMatches) {
      await logAdminAction(req, {
        module: "Auth",
        action: "auth.login_failed",
        targetType: "User",
        targetId: String(user._id),
        targetLabel: user.email,
        severity: "Medium"
      });
      return sendError(res, 401, "Invalid email or password.");
    }

    if (!user.isActive || user.status === "suspended" || user.status === "inactive") {
      return sendError(res, 403, "This account has been deactivated.");
    }

    const trustedRole = resolveTrustedRole(user);
    if (user.role !== trustedRole) {
      user.role = trustedRole;
      await user.save();
    }

    const token = signToken(user);
    const csrfToken = setAuthCookies(res, token);

    return sendSuccess(res, 200, {
      message: "Login successful.",
      token,
      csrfToken,
      user: serializeUser(user)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to log you in right now.");
  }
}

async function forgotPassword(req, res) {
  const genericMessage = "If an account exists for that email, password reset instructions will be sent shortly.";

  try {
    const details = validationMessages(req);
    if (details.length) {
      return sendValidationError(res, "Please provide a valid email address.", details);
    }

    const email = normalizeEmailAddress(req.body.email);
    const user = await User.findOne({ email });

    if (!user || !user.isActive) {
      return sendSuccess(res, 200, { message: genericMessage });
    }

    const resetToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
    user.passwordResetTokenHash = hashResetToken(resetToken);
    user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
    await user.save();

    const delivery = await sendPasswordResetEmail(user, buildPasswordResetUrl(req, resetToken));
    if (delivery && delivery.skipped) {
      console.warn(`Password reset email skipped for ${email}: ${delivery.reason || "email service unavailable"}`);
    }

    return sendSuccess(res, 200, { message: genericMessage });
  } catch (_error) {
    return sendSuccess(res, 200, { message: genericMessage });
  }
}

async function resetPassword(req, res) {
  try {
    const details = validationMessages(req);
    if (details.length) {
      return sendValidationError(res, "Please fix the reset form and try again.", details);
    }

    const user = await User.findOne({
      passwordResetTokenHash: hashResetToken(req.body.token),
      passwordResetExpiresAt: { $gt: new Date() }
    }).select("+passwordResetTokenHash +passwordResetExpiresAt");

    if (!user || !user.isActive) {
      return sendError(res, 400, "This password reset link is invalid or has expired.");
    }

    user.passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    user.passwordResetTokenHash = "";
    user.passwordResetExpiresAt = null;
    await user.save();

    await logAdminAction(req, {
      module: "Auth",
      action: "auth.password_reset_completed",
      targetType: "User",
      targetId: String(user._id),
      targetLabel: user.email,
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Password reset successful. You can now sign in with your new password."
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to reset your password right now.");
  }
}

/**
 * Returns a success message for client-side token removal.
 *
 * @param {import("express").Request} _req - The incoming request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {import("express").Response} Success response indicating logout completed client-side.
 */
function logout(_req, res) {
  clearAuthCookies(res);
  return sendSuccess(res, 200, {
    message: "Logout successful. Remove the token on the client."
  });
}

/**
 * Returns the authenticated user's profile.
 *
 * @param {import("express").Request} req - The incoming request with `req.user`.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Safe user profile response.
 */
async function me(req, res) {
  try {
    const user = await User.findById(req.user.id).lean();

    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    return sendSuccess(res, 200, {
      user: serializeUser(user)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load the current user profile.");
  }
}

/**
 * Updates the authenticated client's business profile using a safe field allowlist.
 *
 * @param {import("express").Request} req - The incoming authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Updated safe user profile response.
 */
async function updateMe(req, res) {
  try {
    const unsupportedFields = Object.keys(req.body || {}).filter((field) => !CLIENT_PROFILE_FIELDS.has(field));
    if (unsupportedFields.length) {
      return sendError(
        res,
        400,
        "Only business profile fields can be updated here."
      );
    }

    const details = validationMessages(req);
    if (details.length) {
      return sendValidationError(res, "Please fix the settings form and try again.", details);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    if (typeof req.body.name === "string") {
      user.name = req.body.name.trim();
    }

    if (typeof req.body.businessName === "string") {
      user.businessName = req.body.businessName.trim();
    }

    if (typeof req.body.businessType === "string") {
      user.businessType = req.body.businessType.trim();
    }

    if (typeof req.body.phone === "string") {
      user.phone = req.body.phone.trim();
    }

    if (typeof req.body.location === "string") {
      user.location = req.body.location.trim();
    }

    if (typeof req.body.workingHours === "string") {
      user.workingHours = req.body.workingHours.trim();
    }

    if (typeof req.body.chatbotLanguage === "string") {
      user.chatbotLanguage = req.body.chatbotLanguage.trim();
    }

    if (Array.isArray(req.body.services)) {
      user.services = req.body.services
        .map((service) => String(service || "").trim())
        .filter(Boolean)
        .slice(0, 30);
    }

    user.onboardingStatus = resolveOnboardingStatus(user);

    await user.save();

    return sendSuccess(res, 200, {
      message: "Settings updated successfully.",
      user: serializeUser(user)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update your settings right now.");
  }
}

module.exports = {
  signupValidators,
  loginValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
  updateProfileValidators,
  clearAuthCookies,
  signup,
  login,
  forgotPassword,
  resetPassword,
  logout,
  me,
  updateMe
};
