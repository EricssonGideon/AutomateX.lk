const express = require("express");

const {
  checkoutValidators,
  createCheckoutSession,
  handleBillingSuccess,
  createBillingPortal,
  handleBillingWebhook
} = require("../controllers/billingController");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

router.post("/webhook", handleBillingWebhook);
router.post("/create-checkout", verifyToken, checkoutValidators, createCheckoutSession);
router.get("/success", handleBillingSuccess);
router.get("/portal", verifyToken, createBillingPortal);

module.exports = router;
