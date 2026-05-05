const jwt = require("jsonwebtoken");

const User = require("../models/User");

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
      role: user.role,
      plan: user.plan,
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
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access is required." });
  }

  return next();
}

module.exports = {
  verifyToken,
  requireAdmin
};
