const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  createMachineRateLimitKeyGenerator
} = require("../licensing/posLicensingRateLimit");

const {
  GENERIC_ACTIVATION_DENIED_MESSAGE,
  GENERIC_BOOTSTRAP_DENIED_MESSAGE,
  GENERIC_RENEWAL_DENIED_MESSAGE,
  INVALID_ACTIVATION_REQUEST_MESSAGE,
  INVALID_BOOTSTRAP_REQUEST_MESSAGE,
  INVALID_RENEWAL_REQUEST_MESSAGE,
  RETRYABLE_BOOTSTRAP_FAILURE_MESSAGE,
  createPosActivationController,
  sendMachineError
} = require("../controllers/posActivationController");

const DEFAULT_BODY_LIMIT = "8kb";
const DEFAULT_RATE_LIMIT = 30;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Accept";

function isJsonRequest(req) {
  return req.is("application/json") || req.is("application/*+json");
}

function rejectQueryStrings(req, res, next) {
  if (Object.keys(req.query || {}).length) {
    return sendMachineError(res, 400, invalidMessageForRequest(req));
  }
  return next();
}

function requireJsonContent(req, res, next) {
  if (!isJsonRequest(req)) {
    return sendMachineError(res, 415, invalidMessageForRequest(req));
  }
  return next();
}

function markMachineOperation(operation) {
  return function mark(req, _res, next) {
    req.posMachineOperation = operation;
    return next();
  };
}

function invalidMessageForRequest(req) {
  if (req.posMachineOperation === "renewal") {
    return INVALID_RENEWAL_REQUEST_MESSAGE;
  }
  if (req.posMachineOperation === "bootstrap") {
    return INVALID_BOOTSTRAP_REQUEST_MESSAGE;
  }
  return INVALID_ACTIVATION_REQUEST_MESSAGE;
}

function deniedMessageForRequest(req) {
  if (req.path.endsWith("/renew") || req.posMachineOperation === "renewal") {
    return GENERIC_RENEWAL_DENIED_MESSAGE;
  }
  if (req.path.endsWith("/renewal-credentials/bootstrap") || req.posMachineOperation === "bootstrap") {
    return GENERIC_BOOTSTRAP_DENIED_MESSAGE;
  }
  return GENERIC_ACTIVATION_DENIED_MESSAGE;
}

function createScopedCorsMiddleware(options = {}) {
  const allowedOrigins = new Set(options.allowedOrigins || []);

  return function scopedCors(req, res, next) {
    const origin = req.get("origin");
    if (!origin) {
      return next();
    }

    res.vary("Origin");
    if (!allowedOrigins.has(origin)) {
      return sendMachineError(res, 403, deniedMessageForRequest(req));
    }

    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS);
    res.set("Access-Control-Allow-Headers", DEFAULT_ALLOWED_HEADERS);
    res.set("Access-Control-Max-Age", "600");

    if (req.method === "OPTIONS") {
      res.set("Cache-Control", "no-store");
      return res.status(204).send();
    }

    return next();
  };
}

function createMachineRateLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || DEFAULT_RATE_LIMIT_WINDOW_MS,
    limit: options.limit || DEFAULT_RATE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    ...(options.store ? { store: options.store } : {}),
    keyGenerator: options.keyGenerator || createMachineRateLimitKeyGenerator(options.operation || "activation"),
    passOnStoreError: options.passOnStoreError === true,
    skip: (req) => req.method === "OPTIONS",
    handler(_req, res) {
      return sendMachineError(res, 429, options.message || "Too many activation attempts. Try again later.", { retryable: true });
    }
  });
}

function handleActivationRouterError(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }
  if (error && error.type === "entity.too.large") {
    return sendMachineError(res, 413, invalidMessageForRequest(req));
  }
  if (error instanceof SyntaxError || error && error.type === "entity.parse.failed") {
    return sendMachineError(res, 400, invalidMessageForRequest(req));
  }
  return sendMachineError(
    res,
    503,
    req.posMachineOperation === "renewal"
      ? "Renewal service is unavailable."
      : req.posMachineOperation === "bootstrap"
        ? RETRYABLE_BOOTSTRAP_FAILURE_MESSAGE
        : "Activation service is unavailable.",
    { retryable: true }
  );
}

function createPosActivationRouter(options = {}) {
  const router = express.Router();
  const controller = createPosActivationController({
    service: options.service,
    serviceOptions: options.serviceOptions,
    renewalService: options.renewalService,
    renewalServiceOptions: options.renewalServiceOptions,
    bootstrapService: options.bootstrapService,
    bootstrapServiceOptions: options.bootstrapServiceOptions
  });
  const scopedCors = createScopedCorsMiddleware({
    allowedOrigins: options.allowedOrigins || []
  });
  const limiter = createMachineRateLimiter({
    ...(options.rateLimit || {}),
    operation: "activation"
  });
  const renewalLimiter = createMachineRateLimiter({
    ...(options.renewalRateLimit || options.rateLimit || {}),
    operation: "renewal",
    message: (options.renewalRateLimit && options.renewalRateLimit.message) || "Too many renewal attempts. Try again later."
  });
  const bootstrapLimiter = createMachineRateLimiter({
    ...(options.bootstrapRateLimit || options.rateLimit || {}),
    operation: "bootstrap",
    message: (options.bootstrapRateLimit && options.bootstrapRateLimit.message) || "Too many renewal credential bootstrap attempts. Try again later."
  });

  router.options("/standard/activate", scopedCors);
  router.options("/standard/renew", scopedCors);
  router.options("/standard/renewal-credentials/bootstrap", scopedCors);
  router.post(
    "/standard/activate",
    markMachineOperation("activation"),
    scopedCors,
    limiter,
    rejectQueryStrings,
    requireJsonContent,
    express.json({
      limit: options.bodyLimit || DEFAULT_BODY_LIMIT,
      strict: true,
      type: ["application/json", "application/*+json"]
    }),
    controller.activateStandard
  );
  router.post(
    "/standard/renew",
    markMachineOperation("renewal"),
    scopedCors,
    renewalLimiter,
    rejectQueryStrings,
    requireJsonContent,
    express.json({
      limit: options.bodyLimit || DEFAULT_BODY_LIMIT,
      strict: true,
      type: ["application/json", "application/*+json"]
    }),
    controller.renewStandard
  );
  router.post(
    "/standard/renewal-credentials/bootstrap",
    markMachineOperation("bootstrap"),
    scopedCors,
    bootstrapLimiter,
    rejectQueryStrings,
    requireJsonContent,
    express.json({
      limit: options.bodyLimit || DEFAULT_BODY_LIMIT,
      strict: true,
      type: ["application/json", "application/*+json"]
    }),
    controller.bootstrapRenewalCredential
  );
  router.use(handleActivationRouterError);

  return router;
}

module.exports = createPosActivationRouter;
module.exports.DEFAULT_BODY_LIMIT = DEFAULT_BODY_LIMIT;
module.exports.DEFAULT_RATE_LIMIT = DEFAULT_RATE_LIMIT;
module.exports.createMachineRateLimiter = createMachineRateLimiter;
module.exports.createScopedCorsMiddleware = createScopedCorsMiddleware;
module.exports.handleActivationRouterError = handleActivationRouterError;
