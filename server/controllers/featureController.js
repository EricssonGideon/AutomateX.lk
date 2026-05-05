const { sendSuccess } = require("../utils/response");

/**
 * Returns a gated placeholder response for Facebook automation.
 *
 * @param {import("express").Request} req - The authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {import("express").Response} Success payload.
 */
function runFacebookAutomation(req, res) {
  return sendSuccess(res, 200, {
    message: "Facebook automation endpoint is enabled for this plan.",
    feature: "facebook-automation",
    plan: req.user.plan
  });
}

/**
 * Returns a gated placeholder response for Instagram automation.
 *
 * @param {import("express").Request} req - The authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {import("express").Response} Success payload.
 */
function runInstagramAutomation(req, res) {
  return sendSuccess(res, 200, {
    message: "Instagram automation endpoint is enabled for this plan.",
    feature: "instagram-automation",
    plan: req.user.plan
  });
}

/**
 * Returns a gated placeholder response for the AI chatbot feature.
 *
 * @param {import("express").Request} req - The authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {import("express").Response} Success payload.
 */
function runAiChatbot(req, res) {
  return sendSuccess(res, 200, {
    message: "AI chatbot endpoint is enabled for this plan.",
    feature: "ai-chatbot",
    plan: req.user.plan
  });
}

/**
 * Returns a gated placeholder response for the business management system feature.
 *
 * @param {import("express").Request} req - The authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {import("express").Response} Success payload.
 */
function runBusinessManagementSystem(req, res) {
  return sendSuccess(res, 200, {
    message: "Business management system endpoint is enabled for this plan.",
    feature: "business-management-system",
    plan: req.user.plan
  });
}

module.exports = {
  runFacebookAutomation,
  runInstagramAutomation,
  runAiChatbot,
  runBusinessManagementSystem
};
