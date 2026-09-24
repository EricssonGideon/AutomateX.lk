const crypto = require("node:crypto");
const mongoose = require("mongoose");

const {
  validateStagingLicensingConfig
} = require("../config/posLicensingProduction");
const {
  normalizeRecoveryRequest,
  recoverStagingRenewalCredential
} = require("../services/stagingPosRenewalCredentialRecoveryService");
const { connectToDatabase } = require("../utils/db");

const STAGING_RENEWAL_RECOVERY_PATH =
  "/internal/pos-licensing-staging-renewal-recovery";
const SUCCESS_FIELDS = Object.freeze([
  "schemaVersion",
  "status",
  "installationId",
  "credentialVersion"
]);
const DEVICE_INSTALLATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FAILURE_REASONS = new Set([
  "config_invalid",
  "database_connection_failed",
  "database_mismatch",
  "service_failed",
  "invalid_service_result"
]);
const NOT_FOUND_RESPONSE = Object.freeze({ message: "Not found." });
const UNAUTHORIZED_RESPONSE = Object.freeze({ message: "Unauthorized." });
const INVALID_REQUEST_RESPONSE = Object.freeze({ message: "Invalid request." });
const UNAVAILABLE_RESPONSE = Object.freeze({ message: "Renewal recovery is unavailable." });

function clean(value) {
  return String(value || "").trim();
}

function readConfiguredToken(env) {
  const token = env && env.POS_LICENSING_STAGING_RENEWAL_RECOVERY_TOKEN;
  if (
    typeof token !== "string" ||
    token.length < 43 ||
    token.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return "";
  }
  return token;
}

function shouldMountStagingRenewalRecoveryEndpoint(env = process.env) {
  return clean(env.VERCEL) === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.AUTOMATEX_ENV).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_STAGING_RENEWAL_RECOVERY_ENABLED).toLowerCase() === "true" &&
    Boolean(readConfiguredToken(env));
}

function readBearerToken(req) {
  const authorization = req && typeof req.get === "function"
    ? req.get("authorization")
    : "";
  const match = /^Bearer ([^\s]+)$/i.exec(String(authorization || ""));
  return match ? match[1] : "";
}

function tokensMatch(candidate, expected) {
  if (!candidate || !expected) {
    return false;
  }
  const candidateDigest = crypto.createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

function validateConnectedStagingDatabase(connection, databaseName) {
  const connectedNames = [
    connection && connection.name,
    connection && connection.db && connection.db.databaseName
  ].map(clean).filter(Boolean);
  if (!connectedNames.length || connectedNames.some((name) => name !== databaseName)) {
    throw new Error("Connected database identity mismatch.");
  }
}

function projectSuccess(result) {
  if (
    !result ||
    result.schemaVersion !== 1 ||
    result.status !== "bound" ||
    !DEVICE_INSTALLATION_ID_PATTERN.test(clean(result.installationId)) ||
    result.credentialVersion !== 1
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    status: "bound",
    installationId: clean(result.installationId).toLowerCase(),
    credentialVersion: 1
  };
}

function logSafeFailure(logger, reason) {
  if (!SAFE_FAILURE_REASONS.has(reason)) {
    return;
  }
  try {
    if (logger && typeof logger.warn === "function") {
      logger.warn(`[staging-renewal-recovery] reason=${reason}`);
    }
  } catch {
    // Logging must not alter the generic fail-closed response.
  }
}

function createStagingRenewalRecoveryHandler(options = {}) {
  const env = options.env || process.env;
  const validateConfig = options.validateConfig || validateStagingLicensingConfig;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const runRecovery = options.runRecovery || recoverStagingRenewalCredential;
  const logger = options.logger || console;
  const clock = options.clock || (() => new Date());

  return async function stagingRenewalRecoveryHandler(req, res) {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    if (!shouldMountStagingRenewalRecoveryEndpoint(env)) {
      return res.status(404).json(NOT_FOUND_RESPONSE);
    }
    if (!tokensMatch(readBearerToken(req), readConfiguredToken(env))) {
      return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }

    let request;
    try {
      request = normalizeRecoveryRequest(req && req.body);
    } catch {
      return res.status(400).json(INVALID_REQUEST_RESPONSE);
    }

    let config;
    try {
      config = validateConfig(env);
    } catch {
      logSafeFailure(logger, "config_invalid");
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }
    if (!config || config.environment !== "staging" || !config.databaseName) {
      logSafeFailure(logger, "config_invalid");
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }

    let connection = options.connection || null;
    if (!connection) {
      try {
        const connected = await connectionProvider();
        connection = connected && connected.connection ? connected.connection : mongoose.connection;
      } catch {
        logSafeFailure(logger, "database_connection_failed");
        return res.status(503).json(UNAVAILABLE_RESPONSE);
      }
    }
    try {
      validateConnectedStagingDatabase(connection, config.databaseName);
    } catch {
      logSafeFailure(logger, "database_mismatch");
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }

    let result;
    try {
      result = await runRecovery(request, {
        ...(options.recoveryOptions || {}),
        clock,
        connection,
        env
      });
    } catch {
      logSafeFailure(logger, "service_failed");
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }
    const response = projectSuccess(result);
    if (!response) {
      logSafeFailure(logger, "invalid_service_result");
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }
    return res.status(200).json(response);
  };
}

function mountStagingRenewalRecoveryEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingRenewalRecoveryEndpoint(env)) {
    return false;
  }
  router.post(
    STAGING_RENEWAL_RECOVERY_PATH,
    createStagingRenewalRecoveryHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_RENEWAL_RECOVERY_PATH,
  SUCCESS_FIELDS,
  createStagingRenewalRecoveryHandler,
  mountStagingRenewalRecoveryEndpoint,
  projectSuccess,
  shouldMountStagingRenewalRecoveryEndpoint,
  tokensMatch,
  validateConnectedStagingDatabase
};
