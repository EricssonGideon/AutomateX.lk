const { body, validationResult } = require("express-validator");

const Inquiry = require("../models/Inquiry");
const { sendInquiryNotification } = require("../utils/email");
const { resolvePublicAudienceUser } = require("../utils/publicAudience");
const { sendSuccess, sendValidationError, sendError } = require("../utils/response");
const CLIENT_INQUIRY_STATUS_OPTIONS = ["new", "contacted", "converted", "closed", "in_progress"];

/**
 * Trims unknown input into a predictable string.
 *
 * @param {unknown} value - The value to normalize.
 * @returns {string} A trimmed string.
 */
function cleanString(value) {
  return String(value || "").trim();
}

function normalizeInquiryNotes(value) {
  return cleanString(value).slice(0, 2000);
}

function serializeClientInquiry(inquiry) {
  return {
    id: inquiry._id,
    _id: inquiry._id,
    clientId: inquiry.clientId,
    name: inquiry.name,
    email: inquiry.email,
    message: inquiry.message,
    status: inquiry.status,
    source: inquiry.source || "website",
    clientNotes: inquiry.clientNotes || "",
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt
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
    .optional({ checkFalsy: true })
    .trim()
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
      client = await resolvePublicAudienceUser(cleanString(req.body.publicProfileUrl));
    } catch (error) {
      return sendError(res, 400, error.message);
    }

    const inquiry = await Inquiry.create({
      clientId: client._id,
      name: cleanString(req.body.name),
      email: cleanString(req.body.email).toLowerCase(),
      message: cleanString(req.body.message),
      source: cleanString(req.body.publicProfileUrl) ? "public-client-page" : "public-website"
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
 * Returns inquiries for the logged-in client only.
 *
 * @param {import("express").Request} req - The incoming request with `req.user`.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Tenant-scoped inquiry list.
 */
async function getInquiries(req, res) {
  try {
    const query = {
      clientId: req.user.id,
      source: { $ne: "public-website" }
    };
    const inquiries = await Inquiry.find(query).sort({ createdAt: -1 }).lean();

    return sendSuccess(res, 200, {
      inquiries: inquiries.map(serializeClientInquiry)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load inquiries right now.");
  }
}

/**
 * Updates the status and client notes of an inquiry owned by the authenticated client.
 *
 * @param {import("express").Request} req - The incoming authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Updated inquiry response.
 */
async function updateInquiryStatus(req, res) {
  try {
    const allowedStatuses = CLIENT_INQUIRY_STATUS_OPTIONS;
    const status = cleanString(req.body.status);

    if (!allowedStatuses.includes(status)) {
      return sendError(res, 400, "Inquiry status must be new, contacted, converted, closed, or in_progress.");
    }

    const query = {
      _id: req.params.inquiryId,
      clientId: req.user.id,
      source: { $ne: "public-website" }
    };

    const updates = {
      status
    };

    if (typeof req.body.clientNotes === "string") {
      updates.clientNotes = normalizeInquiryNotes(req.body.clientNotes);
    }

    const inquiry = await Inquiry.findOneAndUpdate(
      query,
      updates,
      { new: true }
    ).lean();

    if (!inquiry) {
      return sendError(res, 404, "Inquiry not found.");
    }

    return sendSuccess(res, 200, {
      message: "Inquiry updated successfully.",
      inquiry: serializeClientInquiry(inquiry)
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
