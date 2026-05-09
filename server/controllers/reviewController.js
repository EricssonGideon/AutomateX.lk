const { body, validationResult } = require("express-validator");

const Review = require("../models/Review");
const { resolvePublicAudienceUser } = require("../utils/publicAudience");
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

const reviewValidators = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required.")
    .isLength({ max: 100 })
    .withMessage("Name must be 100 characters or fewer.")
    .escape(),
  body("role")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Role must be 100 characters or fewer.")
    .escape(),
  body("text")
    .trim()
    .notEmpty()
    .withMessage("Review text is required.")
    .isLength({ max: 280 })
    .withMessage("Review must be 280 characters or fewer.")
    .escape(),
  body("rating")
    .toInt()
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be a whole number between 1 and 5.")
];

/**
 * Returns published reviews for the authenticated tenant only.
 *
 * @param {import("express").Request} req - The incoming request with `req.user`.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Tenant-scoped published reviews.
 */
async function getReviews(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);
    const reviews = await Review.find({
      clientId: req.user.id,
      status: "published"
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return sendSuccess(res, 200, {
      reviews: reviews.map((review) => ({
        id: review._id,
        clientId: review.clientId,
        name: review.name,
        role: review.role,
        text: review.text,
        rating: review.rating,
        status: review.status,
        createdAt: review.createdAt
      }))
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load reviews right now.");
  }
}

async function getPublicReviews(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);
    const owner = await resolvePublicAudienceUser(req.query.publicProfileUrl);
    const reviews = await Review.find({
      clientId: owner._id,
      status: "published"
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return sendSuccess(res, 200, {
      reviews: reviews.map((review) => ({
        id: review._id,
        clientId: review.clientId,
        name: review.name,
        role: review.role,
        text: review.text,
        rating: review.rating,
        status: review.status,
        createdAt: review.createdAt
      }))
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Unable to load reviews right now.");
  }
}

/**
 * Returns all reviews for the authenticated tenant, including moderation states.
 *
 * @param {import("express").Request} req - The incoming authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Tenant review management payload.
 */
async function getClientReviews(req, res) {
  try {
    const reviews = await Review.find({
      clientId: req.user.id
    })
      .sort({ createdAt: -1 })
      .lean();

    return sendSuccess(res, 200, { reviews });
  } catch (_error) {
    return sendError(res, 500, "Unable to load reviews right now.");
  }
}

/**
 * Creates a tenant-owned review and stores it in pending moderation status.
 *
 * @param {import("express").Request} req - The incoming request with `req.user`.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Review creation response.
 */
async function createReview(req, res) {
  try {
    const details = validationMessages(req);

    if (details.length) {
      return sendValidationError(res, "Please fix the review form and try again.", details);
    }

    const review = await Review.create({
      clientId: req.user.id,
      name: cleanString(req.body.name),
      role: cleanString(req.body.role),
      text: cleanString(req.body.text),
      rating: Number(req.body.rating),
      status: "pending"
    });

    return sendSuccess(res, 201, {
      message: "Review submitted successfully and is awaiting moderation.",
      review: {
        id: review._id,
        clientId: review.clientId,
        name: review.name,
        role: review.role,
        text: review.text,
        rating: review.rating,
        status: review.status,
        createdAt: review.createdAt
      }
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to save your review right now.");
  }
}

async function createPublicReview(req, res) {
  try {
    const details = validationMessages(req);

    if (details.length) {
      return sendValidationError(res, "Please fix the review form and try again.", details);
    }

    const owner = await resolvePublicAudienceUser(req.body.publicProfileUrl);
    const review = await Review.create({
      clientId: owner._id,
      name: cleanString(req.body.name),
      role: cleanString(req.body.role),
      text: cleanString(req.body.text),
      rating: Number(req.body.rating),
      status: "pending",
      source: "public-website"
    });

    return sendSuccess(res, 201, {
      message: "Review submitted successfully and is awaiting moderation.",
      review: {
        id: review._id,
        clientId: review.clientId,
        name: review.name,
        role: review.role,
        text: review.text,
        rating: review.rating,
        status: review.status,
        createdAt: review.createdAt
      }
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Unable to save your review right now.");
  }
}

/**
 * Lists all reviews across all tenants for admins.
 *
 * @param {import("express").Request} _req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Admin review list.
 */
async function getAllReviews(_req, res) {
  try {
    const reviews = await Review.find({}).sort({ createdAt: -1 }).lean();
    return sendSuccess(res, 200, { reviews });
  } catch (_error) {
    return sendError(res, 500, "Unable to load reviews right now.");
  }
}

/**
 * Allows an admin to publish or hide a tenant-owned review.
 *
 * @param {import("express").Request} req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Updated review moderation response.
 */
async function updateReviewStatus(req, res) {
  try {
    const status = cleanString(req.body.status);

    if (!["published", "hidden"].includes(status)) {
      return sendError(res, 400, "Review status must be either 'published' or 'hidden'.");
    }

    const review = await Review.findByIdAndUpdate(
      req.params.reviewId,
      { status },
      { new: true }
    ).lean();

    if (!review) {
      return sendError(res, 404, "Review not found.");
    }

    return sendSuccess(res, 200, {
      message: "Review status updated successfully.",
      review
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the review status right now.");
  }
}

module.exports = {
  reviewValidators,
  getReviews,
  getPublicReviews,
  getClientReviews,
  createReview,
  createPublicReview,
  getAllReviews,
  updateReviewStatus
};
