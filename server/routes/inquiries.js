const express = require("express");

const {
  inquiryValidators,
  createInquiry,
  getInquiries,
  updateInquiryStatus
} = require("../controllers/inquiryController");
const {
  verifyToken,
  requireClient,
  requireActiveAccount,
  requireFeature
} = require("../middleware/auth");
const { publicFormLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/", publicFormLimiter, inquiryValidators, createInquiry);
router.use(verifyToken, requireClient, requireActiveAccount, requireFeature("inquiry-management"));
router.get("/", getInquiries);
router.patch("/:inquiryId/status", updateInquiryStatus);

module.exports = router;
