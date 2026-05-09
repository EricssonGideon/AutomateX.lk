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
const { publicFormLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.get("/public", publicFormLimiter, getPublicReviews);
router.post("/public", publicFormLimiter, reviewValidators, createPublicReview);
router.get("/admin/all", verifyToken, requireAdmin, getAllReviews);
router.patch("/:reviewId/status", verifyToken, requireAdmin, updateReviewStatus);
router.use(verifyToken, requireClient, requireActiveAccount, requireFeature("review-management"));
router.get("/", getReviews);
router.get("/manage", getClientReviews);
router.post("/", publicFormLimiter, reviewValidators, createReview);

module.exports = router;
