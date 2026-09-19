const mongoose = require("mongoose");

const { classifyRuntimeEnvironment } = require("../config/runtimeEnvironment");
const {
  validatePosLicensingMongoConfiguration
} = require("../config/posLicensingMongo");
const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  resolveConfiguredRateLimitStoreFactory
} = require("../licensing/upstashRateLimitStore");
const {
  requireLicencePermission,
  verifyToken
} = require("../middleware/auth");
const {
  createStagingPosActivationFixtureService
} = require("../services/stagingPosActivationFixtureService");
const { connectToDatabase } = require("../utils/db");
const {
  readinessAllowsStagingRouteMount
} = require("./stagingPosLicensing");

const STAGING_TEST_FIXTURE_PATH = "/internal/pos-licensing-staging-test-fixture";

function clean(value) {
  return String(value || "").trim();
}

function unavailableOutput(code = "staging_test_fixture_unavailable") {
  return Object.freeze({ created: false, code });
}

function shouldMountStagingTestFixtureEndpoint(env = process.env) {
  let runtime;
  try {
    runtime = classifyRuntimeEnvironment(env);
  } catch {
    return false;
  }
  return runtime.mode === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    env.VERCEL === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.POS_LICENSING_ENABLED).toLowerCase() === "true";
}

function stagingTestFixtureIsEnabled(env = process.env) {
  return Boolean(env) && env.POS_LICENSING_STAGING_TEST_FIXTURE_ENABLED === "true";
}

function createStagingTestFixturePrecondition(options = {}) {
  const env = options.env || process.env;
  return function stagingTestFixturePrecondition(_req, res, next) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingTestFixtureIsEnabled(env)) {
      return res.status(503).json(unavailableOutput());
    }
    return next();
  };
}

function validateConnectedStagingDatabase(env, connection) {
  const mongo = validatePosLicensingMongoConfiguration(env, "staging");
  const connectedName = clean(connection && (connection.name || connection.db && connection.db.databaseName));
  if (!connectedName || connectedName !== mongo.databaseName) {
    throw new Error("Staging POS database identity does not match the connected database.");
  }
  return mongo;
}

function createStagingTestFixtureConnectionMiddleware(options = {}) {
  const env = options.env || process.env;
  const suppliedConnection = options.connection || null;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const validateDatabase = options.validateDatabase || validateConnectedStagingDatabase;

  return async function stagingTestFixtureConnection(req, res, next) {
    try {
      let connection = suppliedConnection;
      if (!connection) {
        const connected = await connectionProvider();
        connection = connected && connected.connection ? connected.connection : mongoose.connection;
      }
      if (!connection || !connection.db) {
        return res.status(503).json(unavailableOutput("staging_test_fixture_database_unavailable"));
      }
      validateDatabase(env, connection);
      req.posLicensingStagingConnection = connection;
      return next();
    } catch {
      return res.status(503).json(unavailableOutput("staging_test_fixture_database_rejected"));
    }
  };
}

function createStagingTestFixtureHandler(options = {}) {
  const env = options.env || process.env;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;

  return async function stagingTestFixtureHandler(req, res) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingTestFixtureIsEnabled(env)) {
      return res.status(503).json(unavailableOutput());
    }
    if (req.body && Object.keys(req.body).length > 0) {
      return res.status(400).json(unavailableOutput("staging_test_fixture_body_not_allowed"));
    }

    try {
      const connection = req.posLicensingStagingConnection || options.connection;
      if (!connection || !connection.db) {
        return res.status(503).json(unavailableOutput("staging_test_fixture_database_unavailable"));
      }

      const rateLimitStoreFactory = options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options);
      const readiness = await runReadinessGate({
        env,
        connection,
        rateLimitStoreFactory,
        fetchImpl: options.fetchImpl
      });
      if (!readinessAllowsStagingRouteMount(readiness)) {
        return res.status(503).json(unavailableOutput("staging_test_fixture_readiness_failed"));
      }

      const fixtureService = options.fixtureService || createStagingPosActivationFixtureService({ connection });
      const result = await fixtureService.createFixture(req.user);
      if (!result || result.created !== true) {
        return res.status(409).json(Object.freeze({
          created: false,
          code: "staging_test_fixture_already_exists"
        }));
      }

      return res.status(201).json(Object.freeze({
        created: true,
        code: "staging_test_fixture_created",
        activationCode: result.activationCode,
        edition: "standard",
        maxInstallations: 1,
        maxRedemptions: 1
      }));
    } catch {
      return res.status(503).json(unavailableOutput("staging_test_fixture_failed"));
    }
  };
}

function mountStagingTestFixtureEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestFixtureEndpoint(env)) {
    return false;
  }

  router.post(
    STAGING_TEST_FIXTURE_PATH,
    createStagingTestFixturePrecondition({ ...options, env }),
    createStagingTestFixtureConnectionMiddleware({ ...options, env }),
    options.verifyToken || verifyToken,
    options.requireManagePermission || requireLicencePermission("licences:manage"),
    createStagingTestFixtureHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_TEST_FIXTURE_PATH,
  createStagingTestFixtureConnectionMiddleware,
  createStagingTestFixtureHandler,
  createStagingTestFixturePrecondition,
  mountStagingTestFixtureEndpoint,
  shouldMountStagingTestFixtureEndpoint,
  stagingTestFixtureIsEnabled,
  unavailableOutput,
  validateConnectedStagingDatabase
};
