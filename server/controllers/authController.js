const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

const User = require("../models/User");
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
const { sendWelcomeEmail } = require("../utils/email");
const { sendSuccess, sendValidationError, sendError } = require("../utils/response");

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const SALT_ROUNDS = 12;

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
    role: user.role,
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

/**
 * Converts a user document into a safe API payload without password data.
 *
 * @param {import("../models/User")} user - The user document or plain object.
 * @returns {{id: string, name: string, email: string, role: string, plan: string, isActive: boolean, stripeCustomerId: string, stripeSubscriptionId: string, businessName: string, businessType: string, location: string, services: string[], workingHours: string, bookingUrl: string, chatbotLanguage: string, planExpiresAt: Date|null, createdAt: Date}} Safe user data.
 */
function serializeUser(user) {
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
    role: user.role,
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
    .withMessage("Password must be between 8 and 128 characters.")
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

const updateProfileValidators = [
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
  body("bookingUrl")
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("Booking URL must be a valid URL."),
  body("chatbotLanguage")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Chatbot language must be 50 characters or fewer."),
  body("services")
    .optional()
    .isArray({ max: 30 })
    .withMessage("Services must be an array with at most 30 entries."),
  body("email")
    .optional()
    .trim()
    .isEmail()
    .withMessage("Enter a valid email address.")
    .normalizeEmail(),
  body("currentPassword")
    .optional()
    .isLength({ min: 8, max: 128 })
    .withMessage("Current password must be between 8 and 128 characters."),
  body("newPassword")
    .optional()
    .isLength({ min: 8, max: 128 })
    .withMessage("New password must be between 8 and 128 characters.")
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

    const email = String(req.body.email || "").toLowerCase().trim();
    const existingUser = await User.findOne({ email }).lean();

    if (existingUser) {
      return sendError(res, 409, "An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    const user = await User.create({
      name: String(req.body.name || "").trim(),
      email,
      passwordHash,
      plan: "not_assigned",
      monthlyFee: 0,
      accountStatus: "pending",
      paymentStatus: "pending",
      allowedFeatures: [],
      onboardingStatus: "pending"
    });

    const token = signToken(user);
    await sendWelcomeEmail(user);

    return sendSuccess(res, 201, {
      message: "Signup successful.",
      token,
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

    const email = String(req.body.email || "").toLowerCase().trim();
    const user = await User.findOne({ email });

    if (!user) {
      return sendError(res, 401, "Invalid email or password.");
    }

    const passwordMatches = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!passwordMatches) {
      return sendError(res, 401, "Invalid email or password.");
    }

    if (!user.isActive) {
      return sendError(res, 403, "This account has been deactivated.");
    }

    const token = signToken(user);

    return sendSuccess(res, 200, {
      message: "Login successful.",
      token,
      user: serializeUser(user)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to log you in right now.");
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
 * Updates the authenticated client's profile, credentials, and business settings.
 *
 * @param {import("express").Request} req - The incoming authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Updated safe user profile response.
 */
async function updateMe(req, res) {
  try {
    const details = validationMessages(req);
    if (details.length) {
      return sendValidationError(res, "Please fix the settings form and try again.", details);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({
        email: req.body.email,
        _id: { $ne: user._id }
      }).lean();

      if (existingUser) {
        return sendError(res, 409, "Another account already uses that email address.");
      }

      user.email = req.body.email;
    }

    if (req.body.newPassword) {
      if (!req.body.currentPassword) {
        return sendError(res, 400, "Current password is required to set a new password.");
      }

      const passwordMatches = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
      if (!passwordMatches) {
        return sendError(res, 401, "Current password is incorrect.");
      }

      user.passwordHash = await bcrypt.hash(req.body.newPassword, SALT_ROUNDS);
    }

    if (typeof req.body.businessName === "string") {
      user.businessName = req.body.businessName.trim();
    }

    if (typeof req.body.businessType === "string") {
      user.businessType = req.body.businessType.trim();
    }

    if (typeof req.body.location === "string") {
      user.location = req.body.location.trim();
    }

    if (typeof req.body.workingHours === "string") {
      user.workingHours = req.body.workingHours.trim();
    }

    if (typeof req.body.bookingUrl === "string") {
      user.bookingUrl = req.body.bookingUrl.trim();
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
  updateProfileValidators,
  signup,
  login,
  logout,
  me,
  updateMe
};
