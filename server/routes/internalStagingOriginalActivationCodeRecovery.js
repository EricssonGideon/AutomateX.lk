const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  resolveConfiguredRateLimitStoreFactory
} = require("../licensing/upstashRateLimitStore");
const {
  createStagingPosOriginalActivationCodeRecoveryService
} = require("../services/stagingPosOriginalActivationCodeRecoveryService");
const {
  createStagingTestFixtureConnectionMiddleware,
  createStagingTestFixtureOperatorAuthorization,
  shouldMountStagingTestFixtureEndpoint
} = require("./internalStagingActivationFixture");
const {
  readinessAllowsStagingRouteMount
} = require("./stagingPosLicensing");

const STAGING_ORIGINAL_CODE_RECOVERY_PATH = "/internal/pos-licensing-staging-test-fixture/recover-original-activation-code";
const STAGING_ORIGINAL_CODE_RECOVERY_FLAG = "POS_LICENSING_STAGING_TEST_FIXTURE_ORIGINAL_CODE_RECOVERY_ENABLED";

function recoveryOutput(recovered, code, extra = {}) {
  return Object.freeze({ recovered: recovered === true, code, ...extra });
}

function stagingOriginalCodeRecoveryIsEnabled(env = process.env) {
  return Boolean(env) && env[STAGING_ORIGINAL_CODE_RECOVERY_FLAG] === "true";
}

function createStagingOriginalCodeRecoveryPrecondition(options = {}) {
  const env = options.env || process.env;
  return function stagingOriginalCodeRecoveryPrecondition(_req, res, next) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingOriginalCodeRecoveryIsEnabled(env)) {
      return res.status(503).json(recoveryOutput(false, "staging_original_code_recovery_unavailable"));
    }
    return next();
  };
}

function createStagingOriginalCodeRecoveryHandler(options = {}) {
  const env = options.env || process.env;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;

  return async function stagingOriginalCodeRecoveryHandler(req, res) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingOriginalCodeRecoveryIsEnabled(env)) {
      return res.status(503).json(recoveryOutput(false, "staging_original_code_recovery_unavailable"));
    }
    if (req.body && Object.keys(req.body).length > 0) {
      return res.status(400).json(recoveryOutput(false, "staging_original_code_recovery_body_not_allowed"));
    }

    try {
      const connection = req.posLicensingStagingConnection || options.connection;
      if (!connection || !connection.db) {
        return res.status(503).json(recoveryOutput(false, "staging_original_code_recovery_database_unavailable"));
      }

      const rateLimitStoreFactory = options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options);
      const readiness = await runReadinessGate({
        env,
        connection,
        rateLimitStoreFactory,
        fetchImpl: options.fetchImpl
      });
      if (!readinessAllowsStagingRouteMount(readiness)) {
        return res.status(503).json(recoveryOutput(false, "staging_original_code_recovery_readiness_failed"));
      }

      const recoveryService = options.recoveryService || createStagingPosOriginalActivationCodeRecoveryService({ connection });
      const result = await recoveryService.recoverOriginalFixtureActivationCode(req.user);
      if (!result || result.recovered !== true) {
        return res.status(200).json(recoveryOutput(false, "staging_original_code_already_recovered", {
          recoveryExpiresAt: result && result.recoveryExpiresAt
        }));
      }
      return res.status(200).json(recoveryOutput(true, "staging_original_code_recovered", {
        recoveryExpiresAt: result.recoveryExpiresAt
      }));
    } catch {
      return res.status(503).json(recoveryOutput(false, "staging_original_code_recovery_failed"));
    }
  };
}

function mountStagingOriginalActivationCodeRecoveryEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestFixtureEndpoint(env)) {
    return false;
  }

  router.post(
    STAGING_ORIGINAL_CODE_RECOVERY_PATH,
    createStagingOriginalCodeRecoveryPrecondition({ ...options, env }),
    createStagingTestFixtureOperatorAuthorization({ ...options, env }),
    createStagingTestFixtureConnectionMiddleware({ ...options, env }),
    createStagingOriginalCodeRecoveryHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_ORIGINAL_CODE_RECOVERY_FLAG,
  STAGING_ORIGINAL_CODE_RECOVERY_PATH,
  createStagingOriginalCodeRecoveryHandler,
  createStagingOriginalCodeRecoveryPrecondition,
  mountStagingOriginalActivationCodeRecoveryEndpoint,
  recoveryOutput,
  stagingOriginalCodeRecoveryIsEnabled
};
