const express = require("express");

const {
  inquiryValidators,
  createInquiry,
  getInquiries,
  updateInquiryStatus
} = require("../controllers/inquiryController");
const { verifyToken } = require("../middleware/auth");
const { publicFormLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.get("/", verifyToken, getInquiries);
router.post("/", publicFormLimiter, inquiryValidators, createInquiry);
router.patch("/:inquiryId/status", verifyToken, updateInquiryStatus);

module.exports = router;
