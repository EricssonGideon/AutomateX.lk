const crypto = require("node:crypto");
const mongoose = require("mongoose");

const { validatePosLicensingMongoConfiguration } = require("../config/posLicensingMongo");
const {
  createStagingPosAdminBootstrapService
} = require("../services/stagingPosAdminBootstrapService");
const { connectToDatabase } = require("../utils/db");

const STAGING_ADMIN_BOOTSTRAP_PATH = "/internal/pos-licensing-staging-admin-bootstrap";
const NOT_FOUND_RESPONSE = Object.freeze({ message: "Not found." });
const UNAUTHORIZED_RESPONSE = Object.freeze({ message: "Unauthorized." });
const INVALID_REQUEST_RESPONSE = Object.freeze({ message: "Invalid request." });
const UNAVAILABLE_RESPONSE = Object.freeze({ message: "Staging administrator bootstrap is unavailable." });

function clean(value) {
  return String(value || "").trim();
}

function readConfiguredToken(env) {
  const token = env && env.POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_TOKEN;
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

function shouldMountStagingAdminBootstrapEndpoint(env = process.env) {
  return clean(env.VERCEL) === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.AUTOMATEX_ENV).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_ENABLED).toLowerCase() === "true" &&
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

function hasRequestFields(req) {
  if (!req || req.body === null || typeof req.body === "undefined") {
    return false;
  }
  return typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length > 0;
}

function createStagingAdminBootstrapHandler(options = {}) {
  const env = options.env || process.env;
  const validateMongoConfig = options.validateMongoConfig || validatePosLicensingMongoConfiguration;
  const connectionProvider = options.connectionProvider || connectToDatabase;

  return async function stagingAdminBootstrapHandler(req, res) {
    res.set("Cache-Control", "no-store");
    if (!shouldMountStagingAdminBootstrapEndpoint(env)) {
      return res.status(404).json(NOT_FOUND_RESPONSE);
    }
    if (!tokensMatch(readBearerToken(req), readConfiguredToken(env))) {
      return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }
    if (hasRequestFields(req)) {
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

      const service = options.bootstrapService || createStagingPosAdminBootstrapService({ connection });
      const result = await service.bootstrap();
      if (
        !result ||
        typeof result.created !== "boolean" ||
        !mongoose.Types.ObjectId.isValid(String(result.adminId || "")) ||
        result.role !== "admin" ||
        result.status !== "active" ||
        result.licencesManage !== true
      ) {
        return res.status(503).json(UNAVAILABLE_RESPONSE);
      }
      return res.status(200).json({
        created: result.created,
        adminId: String(result.adminId),
        role: result.role,
        status: result.status,
        licencesManage: result.licencesManage
      });
    } catch {
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }
  };
}

function mountStagingAdminBootstrapEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingAdminBootstrapEndpoint(env)) {
    return false;
  }
  router.post(
    STAGING_ADMIN_BOOTSTRAP_PATH,
    createStagingAdminBootstrapHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_ADMIN_BOOTSTRAP_PATH,
  createStagingAdminBootstrapHandler,
  mountStagingAdminBootstrapEndpoint,
  shouldMountStagingAdminBootstrapEndpoint,
  tokensMatch,
  validateConnectedStagingDatabase
};
