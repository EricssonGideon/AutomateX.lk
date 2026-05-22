const express = require("express");

const {
  checkoutValidators,
  createCheckoutSession,
  handleBillingSuccess,
  createBillingPortal,
  handleBillingWebhook
} = require("../controllers/billingController");
const { verifyToken, requireClient } = require("../middleware/auth");
const {
  authenticatedApiLimiter,
  webhookLimiter
} = require("../middleware/rateLimit");

const router = express.Router();

router.post("/webhook", webhookLimiter, handleBillingWebhook);
router.post("/create-checkout", authenticatedApiLimiter, verifyToken, requireClient, checkoutValidators, createCheckoutSession);
router.get("/success", handleBillingSuccess);
router.get("/portal", authenticatedApiLimiter, verifyToken, requireClient, createBillingPortal);

module.exports = router;
