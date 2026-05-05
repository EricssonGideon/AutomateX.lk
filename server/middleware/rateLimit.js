const rateLimit = require("express-rate-limit");

// Shared limiter for all API routes.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
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

function handleCorsError(error, _req, res, next) {
  if (error && error.message === "Origin not allowed by CORS.") {
    return res.status(403).json({ message: error.message });
  }

  return next(error);
}

module.exports = {
  apiLimiter,
  publicFormLimiter,
  handleCorsError
};
