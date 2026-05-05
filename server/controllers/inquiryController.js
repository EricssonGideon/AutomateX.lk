const { URL } = require("url");
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");

const Inquiry = require("../models/Inquiry");
const User = require("../models/User");
const { sendInquiryNotification } = require("../utils/email");
const { sendSuccess, sendValidationError, sendError } = require("../utils/response");

/**
 * Trims unknown input into a predictable string.
 *
 * @param {unknown} value - The value to normalize.
 * @returns {string} A trimmed string.
 */
function cleanString(value) {
  return String(value || "").trim();
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
 * Resolves a client record from a public profile URL by reading the final path segment as a user ID.
 *
 * @param {string} publicProfileUrl - The public profile URL supplied by the inquiry source.
 * @returns {Promise<import("../models/User")>} The matching active client user.
 */
async function resolveClientFromPublicProfileUrl(publicProfileUrl) {
  const parsedUrl = new URL(publicProfileUrl);
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const candidateId = segments[segments.length - 1];

  if (!mongoose.Types.ObjectId.isValid(candidateId)) {
    throw new Error("Invalid public profile URL.");
  }

  const client = await User.findOne({
    _id: candidateId,
    role: "client",
    isActive: true
  });

  if (!client) {
    throw new Error("Target client not found.");
  }

  return client;
}

const inquiryValidators = [
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
  body("message")
    .trim()
    .notEmpty()
    .withMessage("Project details are required.")
    .isLength({ max: 2000 })
    .withMessage("Project details must be 2000 characters or fewer.")
    .escape(),
  body("publicProfileUrl")
    .trim()
    .notEmpty()
    .withMessage("A target client public profile URL is required.")
    .isURL()
    .withMessage("Enter a valid public profile URL.")
];

/**
 * Creates an inquiry for the tenant identified by a public profile URL.
 *
 * @param {import("express").Request} req - The incoming public inquiry request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Inquiry creation response.
 */
async function createInquiry(req, res) {
  try {
    const details = validationMessages(req);

    if (details.length) {
      return sendValidationError(res, "Please fix the contact form and try again.", details);
    }

    let client;
    try {
      client = await resolveClientFromPublicProfileUrl(cleanString(req.body.publicProfileUrl));
    } catch (error) {
      return sendError(res, 400, error.message);
    }

    const inquiry = await Inquiry.create({
      clientId: client._id,
      name: cleanString(req.body.name),
      email: cleanString(req.body.email).toLowerCase(),
      message: cleanString(req.body.message)
    });

    await sendInquiryNotification(inquiry, client);

    return sendSuccess(res, 201, {
      message: "Inquiry sent successfully.",
      inquiry: {
        id: inquiry._id,
        clientId: inquiry.clientId,
        name: inquiry.name,
        email: inquiry.email,
        status: inquiry.status,
        createdAt: inquiry.createdAt
      }
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to send your inquiry right now.");
  }
}

/**
 * Returns inquiries for the logged-in client, or all inquiries for admins.
 *
 * @param {import("express").Request} req - The incoming request with `req.user`.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Tenant-scoped inquiry list.
 */
async function getInquiries(req, res) {
  try {
    const query = req.user.role === "admin" ? {} : { clientId: req.user.id };
    const inquiries = await Inquiry.find(query).sort({ createdAt: -1 }).lean();

    return sendSuccess(res, 200, { inquiries });
  } catch (_error) {
    return sendError(res, 500, "Unable to load inquiries right now.");
  }
}

/**
 * Updates the status of an inquiry owned by the authenticated client.
 *
 * @param {import("express").Request} req - The incoming authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Updated inquiry response.
 */
async function updateInquiryStatus(req, res) {
  try {
    const allowedStatuses = ["new", "in_progress", "closed"];
    const status = cleanString(req.body.status);

    if (!allowedStatuses.includes(status)) {
      return sendError(res, 400, "Inquiry status must be new, in_progress, or closed.");
    }

    const query = { _id: req.params.inquiryId };
    if (req.user.role !== "admin") {
      query.clientId = req.user.id;
    }

    const inquiry = await Inquiry.findOneAndUpdate(
      query,
      { status },
      { new: true }
    ).lean();

    if (!inquiry) {
      return sendError(res, 404, "Inquiry not found.");
    }

    return sendSuccess(res, 200, {
      message: "Inquiry updated successfully.",
      inquiry
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the inquiry right now.");
  }
}

module.exports = {
  inquiryValidators,
  createInquiry,
  getInquiries,
  updateInquiryStatus
};
