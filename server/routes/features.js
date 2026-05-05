const express = require("express");

const {
  runFacebookAutomation,
  runInstagramAutomation,
  runAiChatbot,
  runBusinessManagementSystem
} = require("../controllers/featureController");
const { verifyToken } = require("../middleware/auth");
const { requirePlan } = require("../middleware/planGate");

const router = express.Router();

router.post("/facebook-automation", verifyToken, requirePlan("standard"), runFacebookAutomation);
router.post("/instagram-automation", verifyToken, requirePlan("standard"), runInstagramAutomation);
router.post("/ai-chatbot", verifyToken, requirePlan("pro"), runAiChatbot);
router.post("/business-management-system", verifyToken, requirePlan("pro"), runBusinessManagementSystem);

module.exports = router;
