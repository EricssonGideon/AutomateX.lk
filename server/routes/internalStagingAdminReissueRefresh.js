const crypto = require("node:crypto");
const mongoose = require("mongoose");

const {
  validateStagingLicensingConfig
} = require("../config/posLicensingProduction");
const {
  TARGET_LICENCE_ID,
  refreshStagingAdminReissue
} = require("../services/stagingPosAdminReissueRefreshService");
const {
  validateStandardSignedResponseFieldSet
} = require("../utils/posLicenceContract");
const { connectToDatabase } = require("../utils/db");

const STAGING_ADMIN_REISSUE_REFRESH_PATH =
  "/internal/pos-licensing-staging-admin-reissue-refresh";
const SUCCESS_FIELDS = Object.freeze([
  "licenceId",
  "installationId",
  "previousIssueId",
  "newIssueId",
  "signedLicence"
]);
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
const UNAVAILABLE_RESPONSE = Object.freeze({ message: "Admin reissue refresh is unavailable." });

function clean(value) {
  return String(value || "").trim();
}

function readConfiguredToken(env) {
  const token = env && env.POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_TOKEN;
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

function shouldMountStagingAdminReissueRefreshEndpoint(env = process.env) {
  return clean(env.VERCEL) === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.AUTOMATEX_ENV).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_ENABLED).toLowerCase() === "true" &&
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

function validRequestBody(body) {
  if (typeof body === "undefined" || body === null) {
    return true;
  }
  return typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0;
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

function canonicalObjectId(value) {
  const text = clean(value).toLowerCase();
  if (!mongoose.Types.ObjectId.isValid(text)) {
    return "";
  }
  const canonical = String(new mongoose.Types.ObjectId(text));
  return canonical === text ? canonical : "";
}

function projectSuccess(result, expectedKeyId) {
  if (
    !result ||
    result.licenceId !== TARGET_LICENCE_ID ||
    !canonicalObjectId(result.installationId) ||
    !canonicalObjectId(result.previousIssueId) ||
    !canonicalObjectId(result.newIssueId) ||
    result.previousIssueId === result.newIssueId ||
    !result.signedLicence ||
    typeof result.signedLicence !== "object" ||
    Array.isArray(result.signedLicence) ||
    result.signedLicence.keyId !== expectedKeyId ||
    validateStandardSignedResponseFieldSet(result.signedLicence).length
  ) {
    return null;
  }
  return {
    licenceId: TARGET_LICENCE_ID,
    installationId: canonicalObjectId(result.installationId),
    previousIssueId: canonicalObjectId(result.previousIssueId),
    newIssueId: canonicalObjectId(result.newIssueId),
    signedLicence: { ...result.signedLicence }
  };
}

function logSafeFailure(logger, reason) {
  if (!SAFE_FAILURE_REASONS.has(reason)) {
    return;
  }
  try {
    if (logger && typeof logger.warn === "function") {
      logger.warn(`[staging-admin-reissue-refresh] reason=${reason}`);
    }
  } catch {
    // Logging must not alter the generic fail-closed response.
  }
}

function createStagingAdminReissueRefreshHandler(options = {}) {
  const env = options.env || process.env;
  const validateConfig = options.validateConfig || validateStagingLicensingConfig;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const runRefresh = options.runRefresh || refreshStagingAdminReissue;
  const logger = options.logger || console;
  const clock = options.clock || (() => new Date());

  return async function stagingAdminReissueRefreshHandler(req, res) {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    if (!shouldMountStagingAdminReissueRefreshEndpoint(env)) {
      return res.status(404).json(NOT_FOUND_RESPONSE);
    }
    if (!tokensMatch(readBearerToken(req), readConfiguredToken(env))) {
      return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }
    if (!validRequestBody(req && req.body)) {
      return res.status(400).json(INVALID_REQUEST_RESPONSE);
    }

    let config;
    try {
      config = validateConfig(env);
    } catch {
      logSafeFailure(logger, "config_invalid");
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }
    if (
      !config ||
      config.environment !== "staging" ||
      !config.databaseName ||
      !config.keyProvider ||
      typeof config.keyProvider.getPrivateKey !== "function" ||
      typeof config.keyProvider.getPublicKey !== "function" ||
      config.keyId !== config.keyProvider.keyId
    ) {
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
      result = await runRefresh({
        ...(options.refreshOptions || {}),
        clock,
        connection,
        env,
        keyProvider: config.keyProvider
      });
    } catch {
      logSafeFailure(logger, "service_failed");
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }
    const response = projectSuccess(result, config.keyId);
    if (!response) {
      logSafeFailure(logger, "invalid_service_result");
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }
    return res.status(200).json(response);
  };
}

function mountStagingAdminReissueRefreshEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingAdminReissueRefreshEndpoint(env)) {
    return false;
  }
  router.post(
    STAGING_ADMIN_REISSUE_REFRESH_PATH,
    createStagingAdminReissueRefreshHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_ADMIN_REISSUE_REFRESH_PATH,
  SUCCESS_FIELDS,
  createStagingAdminReissueRefreshHandler,
  mountStagingAdminReissueRefreshEndpoint,
  projectSuccess,
  shouldMountStagingAdminReissueRefreshEndpoint,
  tokensMatch,
  validRequestBody,
  validateConnectedStagingDatabase
};
