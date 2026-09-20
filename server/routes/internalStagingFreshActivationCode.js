const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  resolveConfiguredRateLimitStoreFactory
} = require("../licensing/upstashRateLimitStore");
const {
  createStagingPosFreshActivationCodeService
} = require("../services/stagingPosFreshActivationCodeService");
const {
  createStagingTestFixtureConnectionMiddleware,
  createStagingTestFixtureOperatorAuthorization,
  shouldMountStagingTestFixtureEndpoint
} = require("./internalStagingActivationFixture");
const {
  readinessAllowsStagingRouteMount
} = require("./stagingPosLicensing");

const STAGING_FRESH_ACTIVATION_CODE_PATH = "/internal/pos-licensing-staging-test-fixture/issue-fresh-activation-code";
const STAGING_FRESH_ACTIVATION_CODE_FLAG = "POS_LICENSING_STAGING_TEST_FIXTURE_FRESH_ACTIVATION_CODE_ENABLED";

function freshCodeOutput(issued, code, extra = {}) {
  return Object.freeze({ issued: issued === true, code, ...extra });
}

function stagingFreshActivationCodeIsEnabled(env = process.env) {
  return Boolean(env) && env[STAGING_FRESH_ACTIVATION_CODE_FLAG] === "true";
}

function createStagingFreshActivationCodePrecondition(options = {}) {
  const env = options.env || process.env;
  return function stagingFreshActivationCodePrecondition(_req, res, next) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingFreshActivationCodeIsEnabled(env)) {
      return res.status(503).json(freshCodeOutput(false, "staging_fresh_activation_code_unavailable"));
    }
    return next();
  };
}

function createStagingFreshActivationCodeHandler(options = {}) {
  const env = options.env || process.env;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;

  return async function stagingFreshActivationCodeHandler(req, res) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingFreshActivationCodeIsEnabled(env)) {
      return res.status(503).json(freshCodeOutput(false, "staging_fresh_activation_code_unavailable"));
    }
    if (req.body && Object.keys(req.body).length > 0) {
      return res.status(400).json(freshCodeOutput(false, "staging_fresh_activation_code_body_not_allowed"));
    }

    try {
      const connection = req.posLicensingStagingConnection || options.connection;
      if (!connection || !connection.db) {
        return res.status(503).json(freshCodeOutput(false, "staging_fresh_activation_code_database_unavailable"));
      }

      const rateLimitStoreFactory = options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options);
      const readiness = await runReadinessGate({
        env,
        connection,
        rateLimitStoreFactory,
        fetchImpl: options.fetchImpl
      });
      if (!readinessAllowsStagingRouteMount(readiness)) {
        return res.status(503).json(freshCodeOutput(false, "staging_fresh_activation_code_readiness_failed"));
      }

      const freshCodeService = options.freshCodeService || createStagingPosFreshActivationCodeService({ connection });
      const result = await freshCodeService.issueFreshFixtureActivationCode(req.user);
      if (!result || result.issued !== true) {
        return res.status(200).json(freshCodeOutput(false, "staging_fresh_activation_code_already_issued"));
      }
      return res.status(201).json(freshCodeOutput(true, "staging_fresh_activation_code_issued", {
        activationCode: result.activationCode,
        activationCodeExpiresAt: result.activationCodeExpiresAt,
        maxRedemptions: 1
      }));
    } catch {
      return res.status(503).json(freshCodeOutput(false, "staging_fresh_activation_code_failed"));
    }
  };
}

function mountStagingFreshActivationCodeEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestFixtureEndpoint(env)) {
    return false;
  }

  router.post(
    STAGING_FRESH_ACTIVATION_CODE_PATH,
    createStagingFreshActivationCodePrecondition({ ...options, env }),
    createStagingTestFixtureOperatorAuthorization({ ...options, env }),
    createStagingTestFixtureConnectionMiddleware({ ...options, env }),
    createStagingFreshActivationCodeHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_FRESH_ACTIVATION_CODE_FLAG,
  STAGING_FRESH_ACTIVATION_CODE_PATH,
  createStagingFreshActivationCodeHandler,
  createStagingFreshActivationCodePrecondition,
  freshCodeOutput,
  mountStagingFreshActivationCodeEndpoint,
  stagingFreshActivationCodeIsEnabled
};
