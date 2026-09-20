const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  resolveConfiguredRateLimitStoreFactory
} = require("../licensing/upstashRateLimitStore");
const {
  createStagingPosRenewalCredentialResetService
} = require("../services/stagingPosRenewalCredentialResetService");
const {
  createStagingTestFixtureConnectionMiddleware,
  createStagingTestFixtureOperatorAuthorization,
  shouldMountStagingTestFixtureEndpoint
} = require("./internalStagingActivationFixture");
const {
  readinessAllowsStagingRouteMount
} = require("./stagingPosLicensing");

const STAGING_RENEWAL_CREDENTIAL_RESET_PATH = "/internal/pos-licensing-staging-test-fixture/reset-renewal-credential";
const STAGING_RENEWAL_CREDENTIAL_RESET_FLAG = "POS_LICENSING_STAGING_TEST_FIXTURE_CREDENTIAL_RESET_ENABLED";

function resetOutput(reset, code) {
  return Object.freeze({ reset: reset === true, code });
}

function stagingRenewalCredentialResetIsEnabled(env = process.env) {
  return Boolean(env) && env[STAGING_RENEWAL_CREDENTIAL_RESET_FLAG] === "true";
}

function createStagingRenewalCredentialResetPrecondition(options = {}) {
  const env = options.env || process.env;
  return function stagingRenewalCredentialResetPrecondition(_req, res, next) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingRenewalCredentialResetIsEnabled(env)) {
      return res.status(503).json(resetOutput(false, "staging_renewal_credential_reset_unavailable"));
    }
    return next();
  };
}

function createStagingRenewalCredentialResetHandler(options = {}) {
  const env = options.env || process.env;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;

  return async function stagingRenewalCredentialResetHandler(req, res) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingRenewalCredentialResetIsEnabled(env)) {
      return res.status(503).json(resetOutput(false, "staging_renewal_credential_reset_unavailable"));
    }
    if (req.body && Object.keys(req.body).length > 0) {
      return res.status(400).json(resetOutput(false, "staging_renewal_credential_reset_body_not_allowed"));
    }

    try {
      const connection = req.posLicensingStagingConnection || options.connection;
      if (!connection || !connection.db) {
        return res.status(503).json(resetOutput(false, "staging_renewal_credential_reset_database_unavailable"));
      }

      const rateLimitStoreFactory = options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options);
      const readiness = await runReadinessGate({
        env,
        connection,
        rateLimitStoreFactory,
        fetchImpl: options.fetchImpl
      });
      if (!readinessAllowsStagingRouteMount(readiness)) {
        return res.status(503).json(resetOutput(false, "staging_renewal_credential_reset_readiness_failed"));
      }

      const resetService = options.resetService || createStagingPosRenewalCredentialResetService({ connection });
      const result = await resetService.resetFixtureRenewalCredential(req.user);
      if (!result || result.reset !== true) {
        return res.status(200).json(resetOutput(false, "staging_renewal_credential_already_reset"));
      }
      return res.status(200).json(resetOutput(true, "staging_renewal_credential_reset"));
    } catch {
      return res.status(503).json(resetOutput(false, "staging_renewal_credential_reset_failed"));
    }
  };
}

function mountStagingRenewalCredentialResetEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestFixtureEndpoint(env)) {
    return false;
  }

  router.post(
    STAGING_RENEWAL_CREDENTIAL_RESET_PATH,
    createStagingRenewalCredentialResetPrecondition({ ...options, env }),
    createStagingTestFixtureOperatorAuthorization({ ...options, env }),
    createStagingTestFixtureConnectionMiddleware({ ...options, env }),
    createStagingRenewalCredentialResetHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_RENEWAL_CREDENTIAL_RESET_FLAG,
  STAGING_RENEWAL_CREDENTIAL_RESET_PATH,
  createStagingRenewalCredentialResetHandler,
  createStagingRenewalCredentialResetPrecondition,
  mountStagingRenewalCredentialResetEndpoint,
  resetOutput,
  stagingRenewalCredentialResetIsEnabled
};
