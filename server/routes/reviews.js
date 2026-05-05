const express = require("express");

const {
  reviewValidators,
  getReviews,
  getClientReviews,
  createReview,
  getAllReviews,
  updateReviewStatus
} = require("../controllers/reviewController");
const { verifyToken, requireAdmin } = require("../middleware/auth");
const { publicFormLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.get("/", verifyToken, getReviews);
router.get("/manage", verifyToken, getClientReviews);
router.get("/admin/all", verifyToken, requireAdmin, getAllReviews);
router.post("/", verifyToken, publicFormLimiter, reviewValidators, createReview);
router.patch("/:reviewId/status", verifyToken, requireAdmin, updateReviewStatus);

module.exports = router;
