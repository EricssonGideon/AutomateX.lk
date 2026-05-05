const express = require("express");

const { chatValidators, createChatReply } = require("../controllers/chatController");
const { verifyToken } = require("../middleware/auth");
const { requirePlan } = require("../middleware/planGate");

const router = express.Router();

router.post("/", verifyToken, requirePlan("standard"), chatValidators, createChatReply);

module.exports = router;
