const express = require("express");

const {
  reviewValidators,
  getReviews,
  getPublicReviews,
  getClientReviews,
  createReview,
  createPublicReview,
  getAllReviews,
  updateReviewStatus
} = require("../controllers/reviewController");
const {
  verifyToken,
  requireAdmin,
  requireClient,
  requireActiveAccount,
  requireFeature
} = require("../middleware/auth");
const {
  authenticatedApiLimiter,
  publicFormLimiter,
  publicReadLimiter
} = require("../middleware/rateLimit");

const router = express.Router();

router.get("/public", publicReadLimiter, getPublicReviews);
router.post("/public", publicFormLimiter, reviewValidators, createPublicReview);
router.get("/admin/all", authenticatedApiLimiter, verifyToken, requireAdmin, getAllReviews);
router.patch("/:reviewId/status", authenticatedApiLimiter, verifyToken, requireAdmin, updateReviewStatus);
router.use(verifyToken, requireClient, requireActiveAccount, requireFeature("review-management"));
router.use(authenticatedApiLimiter);
router.get("/", getReviews);
router.get("/manage", getClientReviews);
router.post("/", reviewValidators, createReview);

module.exports = router;
