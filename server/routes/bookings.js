const express = require("express");

const {
  bookingValidators,
  getBookings,
  getAvailability,
  getPublicAvailability,
  createBooking,
  createPublicBooking,
  cancelBooking
} = require("../controllers/bookingController");
const {
  verifyToken,
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

router.get("/public/availability", publicReadLimiter, getPublicAvailability);
router.post("/public", publicFormLimiter, bookingValidators, createPublicBooking);
router.use(verifyToken, requireClient, requireActiveAccount, requireFeature("booking-system"));
router.use(authenticatedApiLimiter);
router.get("/", getBookings);
router.get("/availability", getAvailability);
router.post("/", bookingValidators, createBooking);
router.patch("/:bookingId/cancel", cancelBooking);

module.exports = router;
