const crypto = require("node:crypto");
const mongoose = require("mongoose");

const {
  validatePosLicensingMongoConfiguration
} = require("../config/posLicensingMongo");
const {
  createStagingPosActivationEligibilityService
} = require("../services/stagingPosActivationEligibilityService");
const { connectToDatabase } = require("../utils/db");

const STAGING_ACTIVATION_ELIGIBILITY_PATH =
  "/internal/pos-licensing-staging-activation-eligibility";
const RESPONSE_FIELDS = Object.freeze([
  "licenceIdPresent",
  "packageStatus",
  "licenceStatus",
  "licenceExpiry",
  "maxInstallations",
  "activeInstallationCount",
  "activationCount",
  "freshInstallationAllowed",
  "activationCodeIssuanceEligible",
  "validStagingAdminAvailable",
  "overallPass",
  "blocker"
]);
const NOT_FOUND_RESPONSE = Object.freeze({ message: "Not found." });
const UNAUTHORIZED_RESPONSE = Object.freeze({ message: "Unauthorized." });

function clean(value) {
  return String(value || "").trim();
}

function readConfiguredToken(env) {
  const token = env && env.POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_TOKEN;
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

function shouldMountStagingActivationEligibilityEndpoint(env = process.env) {
  return clean(env.VERCEL) === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.AUTOMATEX_ENV).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_ENABLED).toLowerCase() === "true" &&
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

function projectEligibilityResponse(result = {}) {
  const blockers = Array.isArray(result.blockers) ? result.blockers : [];
  return Object.freeze({
    licenceIdPresent: Boolean(result.fixtureLicenceId),
    packageStatus: typeof result.packageStatus === "string" ? result.packageStatus : "unavailable",
    licenceStatus: typeof result.licenceStatus === "string" ? result.licenceStatus : "unavailable",
    licenceExpiry: typeof result.licenceExpiry === "string" ? result.licenceExpiry : "",
    maxInstallations: Number.isSafeInteger(result.maxInstallations) ? result.maxInstallations : 0,
    activeInstallationCount: Number.isSafeInteger(result.activeInstallationCount)
      ? result.activeInstallationCount
      : 0,
    activationCount: Number.isSafeInteger(result.activationCount) ? result.activationCount : 0,
    freshInstallationAllowed: result.freshInstallationAllowed === true,
    activationCodeIssuanceEligible: result.activationCodeIssuanceEligible === true,
    validStagingAdminAvailable: result.validStagingAdminAvailable === true,
    overallPass: result.safeToProceedWithOneNewActivationCode === true,
    blocker: typeof blockers[0] === "string" && blockers[0] ? blockers[0] : ""
  });
}

function unavailableResponse() {
  return projectEligibilityResponse({ blockers: ["diagnostic_unavailable"] });
}

function validateConnectedStagingDatabase(connection, databaseName) {
  const connectedName = clean(connection && (
    connection.name || connection.db && connection.db.databaseName
  ));
  if (!connectedName || connectedName !== databaseName) {
    throw new Error("Connected database is not the configured staging database.");
  }
}

function createStagingActivationEligibilityHandler(options = {}) {
  const env = options.env || process.env;
  const validateMongoConfig = options.validateMongoConfig || validatePosLicensingMongoConfiguration;
  const connectionProvider = options.connectionProvider || connectToDatabase;

  return async function stagingActivationEligibilityHandler(req, res) {
    res.set("Cache-Control", "no-store");
    if (!shouldMountStagingActivationEligibilityEndpoint(env)) {
      return res.status(404).json(NOT_FOUND_RESPONSE);
    }

    const expectedToken = readConfiguredToken(env);
    if (!tokensMatch(readBearerToken(req), expectedToken)) {
      return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }

    try {
      const mongoConfig = validateMongoConfig(env, "staging");
      if (!mongoConfig || mongoConfig.environment !== "staging") {
        return res.status(503).json(unavailableResponse());
      }

      let connection = options.connection || null;
      if (!connection) {
        const connected = await connectionProvider();
        connection = connected && connected.connection ? connected.connection : mongoose.connection;
      }
      validateConnectedStagingDatabase(connection, mongoConfig.databaseName);

      const service = options.eligibilityService ||
        createStagingPosActivationEligibilityService(options.serviceOptions);
      const result = await service.checkEligibility();
      return res.status(200).json(projectEligibilityResponse(result));
    } catch {
      return res.status(503).json(unavailableResponse());
    }
  };
}

function mountStagingActivationEligibilityEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingActivationEligibilityEndpoint(env)) {
    return false;
  }
  router.get(
    STAGING_ACTIVATION_ELIGIBILITY_PATH,
    createStagingActivationEligibilityHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  RESPONSE_FIELDS,
  STAGING_ACTIVATION_ELIGIBILITY_PATH,
  createStagingActivationEligibilityHandler,
  mountStagingActivationEligibilityEndpoint,
  projectEligibilityResponse,
  shouldMountStagingActivationEligibilityEndpoint,
  tokensMatch,
  validateConnectedStagingDatabase
};
