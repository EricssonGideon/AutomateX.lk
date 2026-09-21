const crypto = require("node:crypto");
const mongoose = require("mongoose");

const {
  validatePosLicensingMongoConfiguration
} = require("../config/posLicensingMongo");
const {
  EXPECTED_OLD_ACTIVATION_CODE_ID,
  MINIMUM_REPLACEMENT_VALIDITY_MS,
  REPLACEMENT_DURATION_MS,
  replaceStagingActivationCode
} = require("../services/stagingPosActivationCodeReplacementService");
const { isActivationCodeFormat } = require("../utils/posActivationCodeToken");
const { connectToDatabase } = require("../utils/db");

const STAGING_REPLACE_ACTIVATION_CODE_PATH =
  "/internal/pos-licensing-staging-replace-activation-code";
const SUCCESS_FIELDS = Object.freeze([
  "replaced",
  "revokedActivationCodeId",
  "replacementActivationCode",
  "expiresAt",
  "maxRedemptions"
]);
const NOT_FOUND_RESPONSE = Object.freeze({ message: "Not found." });
const UNAUTHORIZED_RESPONSE = Object.freeze({ message: "Unauthorized." });
const INVALID_REQUEST_RESPONSE = Object.freeze({ message: "Invalid request." });
const ALREADY_COMPLETED_RESPONSE = Object.freeze({ code: "replacement_already_completed" });
const UNAVAILABLE_RESPONSE = Object.freeze({ code: "replacement_unavailable" });

function clean(value) {
  return String(value || "").trim();
}

function readConfiguredToken(env) {
  const token = env && env.POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_TOKEN;
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

function shouldMountStagingReplaceActivationCodeEndpoint(env = process.env) {
  return clean(env.VERCEL) === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.AUTOMATEX_ENV).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_ENABLED).toLowerCase() === "true" &&
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
  const connectedName = clean(connection && (
    connection.name || connection.db && connection.db.databaseName
  ));
  if (!connectedName || connectedName !== databaseName) {
    throw new Error("Connected database is not the configured staging database.");
  }
}

function projectSuccess(result, now = new Date()) {
  if (
    !result ||
    result.replaced !== true ||
    result.revokedActivationCodeId !== EXPECTED_OLD_ACTIVATION_CODE_ID ||
    !isActivationCodeFormat(result.replacementActivationCode) ||
    result.maxRedemptions !== 1
  ) {
    return null;
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return null;
  }
  const expiry = new Date(result.expiresAt);
  const remainingMs = expiry.getTime() - now.getTime();
  if (
    Number.isNaN(expiry.getTime()) ||
    remainingMs < MINIMUM_REPLACEMENT_VALIDITY_MS ||
    remainingMs > REPLACEMENT_DURATION_MS + 5 * 60 * 1000
  ) {
    return null;
  }
  return {
    replaced: true,
    revokedActivationCodeId: EXPECTED_OLD_ACTIVATION_CODE_ID,
    replacementActivationCode: result.replacementActivationCode,
    expiresAt: expiry.toISOString(),
    maxRedemptions: 1
  };
}

function createStagingReplaceActivationCodeHandler(options = {}) {
  const env = options.env || process.env;
  const validateMongoConfig = options.validateMongoConfig || validatePosLicensingMongoConfiguration;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const runReplacement = options.runReplacement || replaceStagingActivationCode;
  const clock = options.clock || (() => new Date());

  return async function stagingReplaceActivationCodeHandler(req, res) {
    res.set("Cache-Control", "no-store");
    if (!shouldMountStagingReplaceActivationCodeEndpoint(env)) {
      return res.status(404).json(NOT_FOUND_RESPONSE);
    }
    if (!tokensMatch(readBearerToken(req), readConfiguredToken(env))) {
      return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }
    if (!validRequestBody(req && req.body)) {
      return res.status(400).json(INVALID_REQUEST_RESPONSE);
    }

    try {
      const mongoConfig = validateMongoConfig(env, "staging");
      if (!mongoConfig || mongoConfig.environment !== "staging") {
        return res.status(503).json(UNAVAILABLE_RESPONSE);
      }
      let connection = options.connection || null;
      if (!connection) {
        const connected = await connectionProvider();
        connection = connected && connected.connection ? connected.connection : mongoose.connection;
      }
      validateConnectedStagingDatabase(connection, mongoConfig.databaseName);

      const result = await runReplacement({
        ...(options.replacementOptions || {}),
        connection,
        clock
      });
      const response = projectSuccess(result, clock());
      return response
        ? res.status(201).json(response)
        : res.status(503).json(UNAVAILABLE_RESPONSE);
    } catch (error) {
      return clean(error && error.code) === "replacement_already_completed"
        ? res.status(409).json(ALREADY_COMPLETED_RESPONSE)
        : res.status(503).json(UNAVAILABLE_RESPONSE);
    }
  };
}

function mountStagingReplaceActivationCodeEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingReplaceActivationCodeEndpoint(env)) {
    return false;
  }
  router.post(
    STAGING_REPLACE_ACTIVATION_CODE_PATH,
    createStagingReplaceActivationCodeHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_REPLACE_ACTIVATION_CODE_PATH,
  SUCCESS_FIELDS,
  createStagingReplaceActivationCodeHandler,
  mountStagingReplaceActivationCodeEndpoint,
  projectSuccess,
  shouldMountStagingReplaceActivationCodeEndpoint,
  tokensMatch,
  validRequestBody,
  validateConnectedStagingDatabase
};
