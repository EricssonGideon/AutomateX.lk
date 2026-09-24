const crypto = require("node:crypto");
const mongoose = require("mongoose");

const {
  validatePosLicensingMongoConfiguration
} = require("../config/posLicensingMongo");
const PosActivationCode = require("../models/PosActivationCode");
const { POS_ACTIVATION_CODE_STATES } = require("../utils/posLicencePolicy");
const { connectToDatabase } = require("../utils/db");

const STAGING_CURRENT_ACTIVATION_CODE_PATH =
  "/internal/pos-licensing-staging-current-activation-code";
const TARGET_LICENCE_ID = "3e50bcf4c418d82b7663e655";
const RESPONSE_FIELDS = Object.freeze([
  "activationCodeId",
  "status",
  "redeemedCount",
  "maxRedemptions",
  "expiresAt",
  "expired",
  "unused"
]);
const NOT_FOUND_RESPONSE = Object.freeze({ message: "Not found." });
const UNAUTHORIZED_RESPONSE = Object.freeze({ message: "Unauthorized." });
const UNAVAILABLE_RESPONSE = Object.freeze({ message: "Activation-code diagnostic unavailable." });
const SAFE_REASON_CODES = Object.freeze([
  "mongo_config_invalid",
  "database_mismatch",
  "database_connection_failed",
  "no_records",
  "query_failed",
  "malformed_record",
  "invalid_clock"
]);
const SAFE_REASON_CODE_SET = new Set(SAFE_REASON_CODES);

class StagingCurrentActivationCodeDiagnosticError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "StagingCurrentActivationCodeDiagnosticError";
    this.reasonCode = reasonCode;
  }
}

function fail(reasonCode) {
  throw new StagingCurrentActivationCodeDiagnosticError(reasonCode);
}

function safeReasonCode(error) {
  return error instanceof StagingCurrentActivationCodeDiagnosticError &&
    SAFE_REASON_CODE_SET.has(error.reasonCode)
    ? error.reasonCode
    : "query_failed";
}

function logSafeReason(logger, reasonCode) {
  if (!SAFE_REASON_CODE_SET.has(reasonCode)) {
    return;
  }
  try {
    if (logger && typeof logger.warn === "function") {
      logger.warn(`[staging-current-activation-code] reason=${reasonCode}`);
    }
  } catch {
    // Diagnostic logging must not alter fail-closed HTTP behaviour.
  }
}

function clean(value) {
  return String(value || "").trim();
}

function readConfiguredToken(env) {
  const token = env && env.POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_TOKEN;
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

function shouldMountStagingCurrentActivationCodeEndpoint(env = process.env) {
  return clean(env.VERCEL) === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.AUTOMATEX_ENV).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_ENABLED).toLowerCase() === "true" &&
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
  const connectedName = clean(connection && (
    connection.name || connection.db && connection.db.databaseName
  ));
  if (!connectedName || connectedName !== databaseName) {
    throw new Error("Connected database is not the configured staging database.");
  }
}

function canonicalObjectId(value) {
  const text = clean(value && (value._id || value.id || value)).toLowerCase();
  if (!mongoose.Types.ObjectId.isValid(text)) {
    return "";
  }
  const canonical = String(new mongoose.Types.ObjectId(text));
  return canonical === text ? canonical : "";
}

async function resolveCurrentActivationCode(options = {}) {
  const repository = options.repository || PosActivationCode;
  const clock = options.clock || (() => new Date());
  let records;
  try {
    let query = repository.find({
      licenceId: TARGET_LICENCE_ID
    });
    if (query && typeof query.select === "function") {
      query = query.select("_id licenceId status redeemedCount maxRedemptions expiresAt");
    }
    if (query && typeof query.sort === "function") {
      query = query.sort({ _id: 1 });
    }
    if (query && typeof query.lean === "function") {
      query = query.lean();
    }
    records = await query || [];
  } catch {
    fail("query_failed");
  }
  if (!Array.isArray(records) || records.length < 1) {
    fail("no_records");
  }

  let now;
  try {
    now = clock();
  } catch {
    fail("invalid_clock");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    fail("invalid_clock");
  }

  const sanitizedRecords = records.map((record) => {
    const activationCodeId = canonicalObjectId(record);
    const licenceId = canonicalObjectId(record && record.licenceId);
    const expiresAtValue = record && record.expiresAt;
    const missingExpiresAt = expiresAtValue === null ||
      expiresAtValue === undefined ||
      typeof expiresAtValue === "string" && expiresAtValue.trim() === "";
    const expiresAt = missingExpiresAt ? null : new Date(expiresAtValue);
    const status = record && record.status;
    const redeemedCount = record && record.redeemedCount;
    const maxRedemptions = record && record.maxRedemptions;
    if (
      !activationCodeId ||
      licenceId !== TARGET_LICENCE_ID ||
      !POS_ACTIVATION_CODE_STATES.includes(status) ||
      !Number.isInteger(redeemedCount) ||
      redeemedCount < 0 ||
      !Number.isInteger(maxRedemptions) ||
      maxRedemptions < 1 ||
      redeemedCount > maxRedemptions ||
      !expiresAt ||
      Number.isNaN(expiresAt.getTime())
    ) {
      fail("malformed_record");
    }

    return Object.freeze({
      activationCodeId,
      status,
      redeemedCount,
      maxRedemptions,
      expiresAt: expiresAt.toISOString(),
      expired: status === "expired" || expiresAt.getTime() <= now.getTime(),
      unused: redeemedCount === 0
    });
  }).sort((left, right) => left.activationCodeId.localeCompare(right.activationCodeId));

  if (new Set(sanitizedRecords.map((record) => record.activationCodeId)).size !== sanitizedRecords.length) {
    fail("malformed_record");
  }

  return Object.freeze(sanitizedRecords);
}

function createStagingCurrentActivationCodeHandler(options = {}) {
  const env = options.env || process.env;
  const validateMongoConfig = options.validateMongoConfig || validatePosLicensingMongoConfiguration;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const logger = options.logger || console;

  return async function stagingCurrentActivationCodeHandler(req, res) {
    res.set("Cache-Control", "no-store");
    if (!shouldMountStagingCurrentActivationCodeEndpoint(env)) {
      return res.status(404).json(NOT_FOUND_RESPONSE);
    }
    if (!tokensMatch(readBearerToken(req), readConfiguredToken(env))) {
      return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }

    try {
      let mongoConfig;
      try {
        mongoConfig = validateMongoConfig(env, "staging");
      } catch {
        fail("mongo_config_invalid");
      }
      if (!mongoConfig || mongoConfig.environment !== "staging") {
        fail("mongo_config_invalid");
      }

      let connection = options.connection || null;
      if (!connection) {
        try {
          const connected = await connectionProvider();
          connection = connected && connected.connection ? connected.connection : mongoose.connection;
        } catch {
          fail("database_connection_failed");
        }
      }
      try {
        validateConnectedStagingDatabase(connection, mongoConfig.databaseName);
      } catch {
        fail("database_mismatch");
      }

      const result = await resolveCurrentActivationCode({
        repository: options.repository,
        clock: options.clock
      });
      return res.status(200).json(result);
    } catch (error) {
      logSafeReason(logger, safeReasonCode(error));
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }
  };
}

function mountStagingCurrentActivationCodeEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingCurrentActivationCodeEndpoint(env)) {
    return false;
  }
  router.get(
    STAGING_CURRENT_ACTIVATION_CODE_PATH,
    createStagingCurrentActivationCodeHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  RESPONSE_FIELDS,
  SAFE_REASON_CODES,
  STAGING_CURRENT_ACTIVATION_CODE_PATH,
  TARGET_LICENCE_ID,
  createStagingCurrentActivationCodeHandler,
  mountStagingCurrentActivationCodeEndpoint,
  resolveCurrentActivationCode,
  shouldMountStagingCurrentActivationCodeEndpoint,
  tokensMatch,
  validateConnectedStagingDatabase
};
