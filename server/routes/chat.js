const express = require("express");

const { chatValidators, createChatReply } = require("../controllers/chatController");

const router = express.Router();

router.post("/", chatValidators, createChatReply);

module.exports = router;
