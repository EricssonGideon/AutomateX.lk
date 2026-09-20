const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const { sanitizeSensitiveText } = require("./utils/sensitiveData");

const { loadRuntimeEnvironment } = require("./config/loadRuntimeEnvironment");

loadRuntimeEnvironment();

const {
  assertPosLicensingStartupConfig
} = require("./config/posLicensingProduction");
const {
  resolvePosProxyTrustConfiguration
} = require("./config/posLicensingTransport");
const {
  resolveStagingPreviewProxyTrust,
  resolveStagingPreviewStartup
} = require("./config/stagingPreviewReadinessRuntime");
const {
  mountStagingReadinessEndpoint
} = require("./routes/internalStagingReadiness");
const {
  mountStagingProvisioningEndpoint
} = require("./routes/internalStagingProvisioning");
const {
  mountStagingTestFixtureEndpoint
} = require("./routes/internalStagingActivationFixture");
const {
  mountStagingActivationCodeRotationEndpoint
} = require("./routes/internalStagingActivationCodeRotation");
const {
  mountStagingRenewalCredentialResetEndpoint
} = require("./routes/internalStagingRenewalCredentialReset");
const {
  mountStagingFreshActivationCodeEndpoint
} = require("./routes/internalStagingFreshActivationCode");
const {
  mountStagingOriginalActivationCodeRecoveryEndpoint
} = require("./routes/internalStagingOriginalActivationCodeRecovery");
const {
  mountStagingPosMachineRoutes
} = require("./routes/stagingPosLicensing");

// POS licensing remains disabled unless explicitly selected. If production mode is
// selected, validate the complete server-only contract before the app is created.
const posLicensingStartup = resolveStagingPreviewStartup(
  process.env,
  assertPosLicensingStartupConfig
);

const apiRoutes = require("./routes");
const { handleCorsError } = require("./middleware/rateLimit");
const { connectToDatabase } = require("./utils/db");

const app = express();
const proxyTrust = resolveStagingPreviewProxyTrust(
  process.env,
  (env) => resolvePosProxyTrustConfiguration(env, {
    environment: posLicensingStartup.runtimeEnvironment.mode
  })
);
app.set("trust proxy", proxyTrust.expressTrust);
app.locals.posLicensingStartup = posLicensingStartup;
app.locals.runtimeEnvironment = posLicensingStartup.runtimeEnvironment;
app.locals.proxyTrust = proxyTrust;

const publicDirectory = path.join(__dirname, "..", "public");
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isProduction = posLicensingStartup.runtimeEnvironment.secureRuntime;
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

function isSameOriginRequest(req, origin) {
  const host = req.get("host");

  if (!host) {
    return false;
  }

  return origin === `${req.protocol}://${host}`;
}

function isAllowedCorsOrigin(req, origin) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (isSameOriginRequest(req, origin)) {
    return true;
  }

  return !isProduction && localOriginPattern.test(origin);
}

function logStructuredError(payload) {
  const isPosLicensingRoute = /^\/api\/(?:pos-(?:machine|licensing)|admin\/pos-licensing)(?:\/|$)/.test(String(payload.route || ""));
  console.error(sanitizeSensitiveText(JSON.stringify({
    timestamp: new Date().toISOString(),
    route: payload.route,
    errorMessage: isPosLicensingRoute ? "POS licensing request failed." : payload.message,
    stack: isPosLicensingRoute || isProduction ? "" : payload.stack || ""
  })));
}

function corsOptionsDelegate(req, callback) {
  callback(null, {
    origin(requestOrigin, originCallback) {
      if (isAllowedCorsOrigin(req, requestOrigin)) {
        return originCallback(null, true);
      }

      return originCallback(new Error("Origin not allowed by CORS."));
    },
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "connect-src": ["'self'"],
      "font-src": ["'self'"],
      "img-src": ["'self'", "data:", "https:"],
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'self'"],
      "object-src": ["'none'"]
    }
  }
}));
morgan.token("safe-url", (req) => sanitizeSensitiveText(String(req.originalUrl || req.url || "").split("?")[0]));
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));
mountStagingPosMachineRoutes(app);
app.use(cors(corsOptionsDelegate));
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", async (_req, res) => {
  try {
    const connection = await connectToDatabase();
    const databaseConnected = Boolean(connection) && mongoose.connection.readyState === 1;

    res.status(databaseConnected ? 200 : 503).json({
      status: databaseConnected ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      database: databaseConnected ? "connected" : "disconnected"
    });
  } catch {
    res.status(503).json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      database: "disconnected"
    });
  }
});

const stagingReadinessRouter = express.Router();
mountStagingReadinessEndpoint(stagingReadinessRouter);
mountStagingProvisioningEndpoint(stagingReadinessRouter);
mountStagingTestFixtureEndpoint(stagingReadinessRouter);
mountStagingActivationCodeRotationEndpoint(stagingReadinessRouter);
mountStagingRenewalCredentialResetEndpoint(stagingReadinessRouter);
mountStagingFreshActivationCodeEndpoint(stagingReadinessRouter);
mountStagingOriginalActivationCodeRecoveryEndpoint(stagingReadinessRouter);
app.use("/api", stagingReadinessRouter);

app.use("/api", async (_req, _res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api", apiRoutes);
app.use(handleCorsError);

app.use("/api", (req, res) => {
  res.status(404).json({
    message: `API route not found: ${req.originalUrl}`
  });
});

app.use(express.static(publicDirectory));

app.use((req, res) => {
  res.status(404).send("Not found");
});

app.use((error, req, res, _next) => {
  logStructuredError({
    route: req.originalUrl,
    message: error.message || "Unhandled server error.",
    stack: error.stack
  });

  if (res.headersSent) {
    return;
  }

  res.status(error.statusCode || 500).json({
    message: "Internal server error."
  });
});

process.on("uncaughtException", (error) => {
  logStructuredError({
    route: "process:uncaughtException",
    message: error.message || "Uncaught exception.",
    stack: error.stack
  });
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logStructuredError({
    route: "process:unhandledRejection",
    message: error.message || "Unhandled rejection.",
    stack: error.stack
  });
});

module.exports = app;
module.exports.connectToDatabase = connectToDatabase;
