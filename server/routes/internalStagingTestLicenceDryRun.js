const crypto = require("node:crypto");
const mongoose = require("mongoose");

const {
  StagingTestLicenceOperatorError,
  runStagingTestLicenceOperator
} = require("../../scripts/createPosLicensingStagingTestLicence");
const {
  inspectMongoTransactionCapability
} = require("../licensing/posLicensingTransactions");
const { connectToDatabase } = require("../utils/db");

const STAGING_TEST_LICENCE_DRY_RUN_PATH = "/internal/pos-licensing-staging-test-licence-dry-run";
const FIXED_STAGING_ADMIN_ID = "6ab0a078e2b1d24644d368ad";
const FIXED_TEST_MARKER = "automatex-pos-staging-tauri-e2e-20260921";
const REQUEST_FIELDS = Object.freeze(["adminId", "testMarker"]);
const SORTED_REQUEST_FIELDS = Object.freeze([...REQUEST_FIELDS].sort());
const RESPONSE_FIELDS = Object.freeze([
  "dryRun",
  "adminValid",
  "clientValid",
  "projectValid",
  "packageValid",
  "transactionCapability",
  "markerUnique",
  "safeToApply",
  "blocker"
]);
const NOT_FOUND_RESPONSE = Object.freeze({ message: "Not found." });
const UNAUTHORIZED_RESPONSE = Object.freeze({ message: "Unauthorized." });
const INVALID_REQUEST_RESPONSE = Object.freeze({ message: "Invalid request." });

function clean(value) {
  return String(value || "").trim();
}

function readConfiguredToken(env) {
  const token = env && env.POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN;
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

function shouldMountStagingTestLicenceDryRunEndpoint(env = process.env) {
  return clean(env.VERCEL) === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.AUTOMATEX_ENV).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_ENABLED).toLowerCase() === "true" &&
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
    adminId === FIXED_STAGING_ADMIN_ID &&
    body.adminId === FIXED_STAGING_ADMIN_ID &&
    body.testMarker === FIXED_TEST_MARKER &&
    /^automatex-pos-staging-tauri-e2e-[0-9]{8}$/.test(body.testMarker);
}

function emptyResponse(blocker) {
  return {
    dryRun: true,
    adminValid: false,
    clientValid: false,
    projectValid: false,
    packageValid: false,
    transactionCapability: false,
    markerUnique: false,
    safeToApply: false,
    blocker
  };
}

function failureResponse(error) {
  const response = emptyResponse("dry_run_unavailable");
  if (!(error instanceof StagingTestLicenceOperatorError)) {
    return response;
  }

  const code = error.code;
  if (["staging_admin_missing_or_ambiguous", "staging_admin_inactive", "staging_admin_unauthorized"].includes(code)) {
    response.blocker = "admin_invalid";
  } else if (code === "fixture_client_missing_or_ambiguous") {
    response.blocker = "client_invalid";
  } else if (code === "fixture_client_identity_mismatch") {
    response.adminValid = true;
    response.blocker = "client_invalid";
  } else if (code === "fixture_project_missing_or_ambiguous") {
    response.blocker = "project_invalid";
  } else if (code === "fixture_project_identity_mismatch") {
    response.adminValid = true;
    response.clientValid = true;
    response.blocker = "project_invalid";
  } else if (code === "fixture_package_missing_or_ambiguous") {
    response.blocker = "package_invalid";
  } else if ([
    "fixture_package_identity_mismatch",
    "fixture_package_standard_contract_invalid"
  ].includes(code)) {
    response.adminValid = true;
    response.clientValid = true;
    response.projectValid = true;
    response.blocker = "package_invalid";
  } else if (code === "test_marker_already_exists") {
    response.adminValid = true;
    response.clientValid = true;
    response.projectValid = true;
    response.packageValid = true;
    response.blocker = "marker_not_unique";
  } else if (code === "mongodb_transaction_requirement_failed") {
    response.adminValid = true;
    response.clientValid = true;
    response.projectValid = true;
    response.packageValid = true;
    response.markerUnique = true;
    response.blocker = "transaction_unavailable";
  }
  return response;
}

function successResponse(result) {
  const checks = result && result.checks;
  if (
    !result ||
    result.ok !== true ||
    result.mode !== "dry-run" ||
    result.writesPerformed !== false ||
    result.marker !== FIXED_TEST_MARKER ||
    !checks ||
    checks.exactStagingEnvironment !== true ||
    checks.stagingDatabaseIdentity !== true
  ) {
    return null;
  }
  const response = {
    dryRun: true,
    adminValid: checks.persistedAdminAuthorized === true,
    clientValid: checks.controlledClientPresent === true,
    projectValid: checks.controlledProjectPresent === true,
    packageValid: checks.reusableStandardPackagePresent === true && checks.allStandardModulesPresent === true,
    transactionCapability: checks.transactionCapability === true,
    markerUnique: checks.uniqueMarkerAvailable === true,
    safeToApply: false,
    blocker: ""
  };
  response.safeToApply = RESPONSE_FIELDS
    .filter((field) => field.endsWith("Valid") || ["transactionCapability", "markerUnique"].includes(field))
    .every((field) => response[field] === true);
  if (!response.safeToApply) {
    return null;
  }
  return response;
}

function createStagingTestLicenceDryRunHandler(options = {}) {
  const env = options.env || process.env;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const runOperator = options.runOperator || runStagingTestLicenceOperator;

  return async function stagingTestLicenceDryRunHandler(req, res) {
    res.set("Cache-Control", "no-store");
    if (!shouldMountStagingTestLicenceDryRunEndpoint(env)) {
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
          apply: false,
          adminId: FIXED_STAGING_ADMIN_ID,
          testMarker: FIXED_TEST_MARKER
        }),
        connection,
        inspectTransactions: async (activeConnection) => inspectMongoTransactionCapability(
          activeConnection,
          { abortAfterProbe: true }
        ),
        applyPlan: async () => {
          throw new Error("Dry-run write path is forbidden.");
        }
      });
      const response = successResponse(result);
      return response
        ? res.status(200).json(response)
        : res.status(503).json(emptyResponse("dry_run_unavailable"));
    } catch (error) {
      return res.status(503).json(failureResponse(error));
    }
  };
}

function mountStagingTestLicenceDryRunEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestLicenceDryRunEndpoint(env)) {
    return false;
  }
  router.post(
    STAGING_TEST_LICENCE_DRY_RUN_PATH,
    createStagingTestLicenceDryRunHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  FIXED_STAGING_ADMIN_ID,
  FIXED_TEST_MARKER,
  RESPONSE_FIELDS,
  STAGING_TEST_LICENCE_DRY_RUN_PATH,
  createStagingTestLicenceDryRunHandler,
  mountStagingTestLicenceDryRunEndpoint,
  shouldMountStagingTestLicenceDryRunEndpoint,
  tokensMatch,
  validRequestBody
};
