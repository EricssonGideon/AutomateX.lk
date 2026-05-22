const rateLimit = require("express-rate-limit");

// Higher limiter for authenticated dashboard/API usage.
const authenticatedApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many API requests. Please try again in 15 minutes."
  }
});

// Tighter limiter for the public lead-capture endpoints.
const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many submissions from this IP. Please try again in an hour."
  }
});

// Relaxed limiter for public read-only data used by the website.
const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests. Please try again in a few minutes."
  }
});

// Separate limiter for the public chatbot endpoint.
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many chat messages. Please try again in a few minutes."
  }
});

// Dedicated limiter for billing webhooks so normal dashboard limits do not affect Stripe retries.
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many webhook requests. Please try again later."
  }
});

// Keep auth attempts limited without throttling authenticated dashboard page loads.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many authentication attempts. Please try again in 15 minutes."
  }
});

function handleCorsError(error, _req, res, next) {
  if (error && error.message === "Origin not allowed by CORS.") {
    return res.status(403).json({ message: error.message });
  }

  return next(error);
}

module.exports = {
  authenticatedApiLimiter,
  authLimiter,
  chatLimiter,
  publicFormLimiter,
  publicReadLimiter,
  webhookLimiter,
  handleCorsError
};
