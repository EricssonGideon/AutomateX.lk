const OpenAI = require("openai");
const { body, validationResult } = require("express-validator");

const User = require("../models/User");
const { sendSuccess, sendValidationError, sendError } = require("../utils/response");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const chatValidators = [
  body("message")
    .trim()
    .notEmpty()
    .withMessage("Message is required.")
    .isLength({ max: 2000 })
    .withMessage("Message must be 2000 characters or fewer."),
  body("conversationHistory")
    .optional()
    .isArray({ max: 10 })
    .withMessage("Conversation history must be an array with at most 10 messages.")
];

/**
 * Extracts validation errors from express-validator.
 *
 * @param {import("express").Request} req - The incoming request.
 * @returns {string[]} Flat validation message list.
 */
function validationMessages(req) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return [];
  }

  return result.array().map((error) => error.msg);
}

/**
 * Builds the client-specific system prompt used for the AI chatbot.
 *
 * @param {import("../models/User")} user - Tenant user with business profile fields.
 * @returns {string} Dynamic system prompt.
 */
function buildSystemPrompt(user) {
  const businessName = user.businessName || user.name || "this business";
  const businessType = user.businessType || "service business";
  const location = user.location || "their local area";
  const services = Array.isArray(user.services) && user.services.length
    ? user.services.join(", ")
    : "general customer support, bookings, and inquiries";
  const workingHours = user.workingHours || "Please ask the business directly for availability.";
  const bookingUrl = user.bookingUrl || `${process.env.PUBLIC_APP_URL || "http://localhost:5000"}#booking`;
  const languageHint = user.chatbotLanguage
    ? `Preferred default language: ${user.chatbotLanguage}.`
    : "Respond in the same language the customer uses.";

  return `You are a helpful assistant for ${businessName}, a ${businessType} located in ${location}. Your services include: ${services}. Working hours: ${workingHours}. Always be friendly, brief, and helpful. If asked about booking, direct them to: ${bookingUrl}. ${languageHint} Respond in the same language the customer uses.`;
}

/**
 * Converts raw conversation history into safe Chat Completions message objects.
 *
 * @param {unknown} history - Raw conversation history from the request body.
 * @returns {Array<{role: "user"|"assistant", content: string}>} Sanitized message history.
 */
function sanitizeConversationHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: String(entry.content || "").trim()
    }))
    .filter((entry) => entry.content)
    .slice(-10);
}

/**
 * Sends the tenant-aware conversation to OpenAI and returns a short AI reply.
 *
 * @param {import("express").Request} req - The authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Chat response payload.
 */
async function createChatReply(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return sendError(res, 500, "Missing OPENAI_API_KEY environment variable.");
    }

    const details = validationMessages(req);
    if (details.length) {
      return sendValidationError(res, "Please fix the chat request and try again.", details);
    }

    const user = await User.findOne({
      _id: req.user.id,
      role: "client"
    }).lean();

    if (!user) {
      return sendError(res, 404, "Client profile not found.");
    }

    const message = String(req.body.message || "").trim();
    const history = sanitizeConversationHistory(req.body.conversationHistory);
    const systemPrompt = buildSystemPrompt(user);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        ...history,
        {
          role: "user",
          content: message
        }
      ]
    });

    const reply = completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      completion.choices[0].message.content
      ? completion.choices[0].message.content.trim()
      : "";

    if (!reply) {
      return sendError(res, 502, "The AI chatbot returned an empty response.");
    }

    return sendSuccess(res, 200, {
      reply
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Unable to get an AI response right now.");
  }
}

module.exports = {
  chatValidators,
  createChatReply
};
