const express = require("express");

const {
  bookingValidators,
  getBookings,
  getAvailability,
  createBooking,
  cancelBooking
} = require("../controllers/bookingController");
const { verifyToken } = require("../middleware/auth");
const { publicFormLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.get("/", verifyToken, getBookings);
router.get("/availability", verifyToken, getAvailability);
router.post("/", verifyToken, publicFormLimiter, bookingValidators, createBooking);
router.patch("/:bookingId/cancel", verifyToken, cancelBooking);

module.exports = router;
