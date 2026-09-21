const crypto = require("node:crypto");
const mongoose = require("mongoose");

const {
  runStagingTestLicenceOperator,
  stagingLicenceDocumentId
} = require("../../scripts/createPosLicensingStagingTestLicence");
const {
  inspectMongoTransactionCapability
} = require("../licensing/posLicensingTransactions");
const { isActivationCodeFormat } = require("../utils/posActivationCodeToken");
const { connectToDatabase } = require("../utils/db");

const STAGING_TEST_LICENCE_APPLY_PATH = "/internal/pos-licensing-staging-test-licence-apply";
const FIXED_STAGING_ADMIN_ID = "6ab0a078e2b1d24644d368ad";
const FIXED_TEST_MARKER = "automatex-pos-staging-tauri-e2e-20260921";
const REQUEST_FIELDS = Object.freeze(["adminId", "testMarker"]);
const SORTED_REQUEST_FIELDS = Object.freeze([...REQUEST_FIELDS].sort());
const SUCCESS_FIELDS = Object.freeze([
  "created",
  "licenceId",
  "testMarker",
  "licenceStatus",
  "activationCode",
  "activationCodeExpiresAt",
  "maxInstallations"
]);
const NOT_FOUND_RESPONSE = Object.freeze({ message: "Not found." });
const UNAUTHORIZED_RESPONSE = Object.freeze({ message: "Unauthorized." });
const INVALID_REQUEST_RESPONSE = Object.freeze({ message: "Invalid request." });
const MARKER_CONFLICT_RESPONSE = Object.freeze({ code: "marker_conflict" });
const UNAVAILABLE_RESPONSE = Object.freeze({ code: "apply_unavailable" });

function clean(value) {
  return String(value || "").trim();
}

function readConfiguredToken(env) {
  const token = env && env.POS_LICENSING_STAGING_TEST_LICENCE_APPLY_TOKEN;
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

function shouldMountStagingTestLicenceApplyEndpoint(env = process.env) {
  return clean(env.VERCEL) === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.AUTOMATEX_ENV).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_STAGING_TEST_LICENCE_APPLY_ENABLED).toLowerCase() === "true" &&
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  const keys = Object.keys(body).sort();
  if (keys.length !== SORTED_REQUEST_FIELDS.length || keys.some((key, index) => key !== SORTED_REQUEST_FIELDS[index])) {
    return false;
  }
  const adminId = clean(body.adminId).toLowerCase();
  return mongoose.Types.ObjectId.isValid(adminId) &&
    String(new mongoose.Types.ObjectId(adminId)) === adminId &&
    body.adminId === FIXED_STAGING_ADMIN_ID &&
    body.testMarker === FIXED_TEST_MARKER;
}

function isMarkerConflict(error) {
  return clean(error && error.code) === "test_marker_already_exists";
}

function projectSuccess(result) {
  const expectedLicenceId = stagingLicenceDocumentId(FIXED_TEST_MARKER);
  if (
    !result ||
    result.ok !== true ||
    result.mode !== "apply" ||
    result.writesPerformed !== true ||
    result.marker !== FIXED_TEST_MARKER ||
    clean(result.licenceId) !== expectedLicenceId ||
    !mongoose.Types.ObjectId.isValid(clean(result.activationCodeId)) ||
    result.licenceStatus !== "active" ||
    result.maxInstallations !== 1 ||
    !isActivationCodeFormat(result.activationCode)
  ) {
    return null;
  }
  const expiry = new Date(result.activationCodeExpiresAt);
  const licenceExpiry = new Date(result.licenceExpiry);
  const activationRemainingMs = expiry.getTime() - Date.now();
  const licenceRemainingMs = licenceExpiry.getTime() - Date.now();
  if (
    Number.isNaN(expiry.getTime()) ||
    Number.isNaN(licenceExpiry.getTime()) ||
    activationRemainingMs < 50 * 60 * 1000 ||
    activationRemainingMs > 65 * 60 * 1000 ||
    licenceRemainingMs < 23 * 60 * 60 * 1000 ||
    licenceRemainingMs > 25 * 60 * 60 * 1000
  ) {
    return null;
  }
  return {
    created: true,
    licenceId: clean(result.licenceId),
    testMarker: result.marker,
    licenceStatus: result.licenceStatus,
    activationCode: result.activationCode,
    activationCodeExpiresAt: expiry.toISOString(),
    maxInstallations: result.maxInstallations
  };
}

function createStagingTestLicenceApplyHandler(options = {}) {
  const env = options.env || process.env;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const runOperator = options.runOperator || runStagingTestLicenceOperator;

  return async function stagingTestLicenceApplyHandler(req, res) {
    res.set("Cache-Control", "no-store");
    if (!shouldMountStagingTestLicenceApplyEndpoint(env)) {
      return res.status(404).json(NOT_FOUND_RESPONSE);
    }
    if (!tokensMatch(readBearerToken(req), readConfiguredToken(env))) {
      return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }
    if (!validRequestBody(req && req.body)) {
      return res.status(400).json(INVALID_REQUEST_RESPONSE);
    }

    try {
      let connection = options.connection || null;
      if (!connection) {
        const connected = await connectionProvider();
        connection = connected && connected.connection ? connected.connection : mongoose.connection;
      }
      const result = await runOperator({
        ...(options.operatorOptions || {}),
        env,
        input: Object.freeze({
          apply: true,
          adminId: FIXED_STAGING_ADMIN_ID,
          testMarker: FIXED_TEST_MARKER
        }),
        connection,
        inspectTransactions: async (activeConnection) => inspectMongoTransactionCapability(
          activeConnection,
          { abortAfterProbe: true }
        )
      });
      const response = projectSuccess(result);
      return response
        ? res.status(201).json(response)
        : res.status(503).json(UNAVAILABLE_RESPONSE);
    } catch (error) {
      return isMarkerConflict(error)
        ? res.status(409).json(MARKER_CONFLICT_RESPONSE)
        : res.status(503).json(UNAVAILABLE_RESPONSE);
    }
  };
}

function mountStagingTestLicenceApplyEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestLicenceApplyEndpoint(env)) {
    return false;
  }
  router.post(
    STAGING_TEST_LICENCE_APPLY_PATH,
    createStagingTestLicenceApplyHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  FIXED_STAGING_ADMIN_ID,
  FIXED_TEST_MARKER,
  STAGING_TEST_LICENCE_APPLY_PATH,
  SUCCESS_FIELDS,
  createStagingTestLicenceApplyHandler,
  mountStagingTestLicenceApplyEndpoint,
  projectSuccess,
  shouldMountStagingTestLicenceApplyEndpoint,
  tokensMatch,
  validRequestBody
};
