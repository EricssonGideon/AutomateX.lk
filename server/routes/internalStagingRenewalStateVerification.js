const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  resolveConfiguredRateLimitStoreFactory
} = require("../licensing/upstashRateLimitStore");
const {
  createRenewalStateVerificationResult,
  createStagingPosRenewalStateVerificationService
} = require("../services/stagingPosRenewalStateVerificationService");
const {
  createStagingTestFixtureConnectionMiddleware,
  createStagingTestFixtureOperatorAuthorization,
  shouldMountStagingTestFixtureEndpoint
} = require("./internalStagingActivationFixture");
const {
  readinessAllowsStagingRouteMount
} = require("./stagingPosLicensing");

const STAGING_RENEWAL_STATE_VERIFY_PATH =
  "/internal/pos-licensing-staging-test-fixture/verify-renewal-state";
const STAGING_RENEWAL_STATE_VERIFY_FLAG =
  "POS_LICENSING_STAGING_RENEWAL_STATE_VERIFY_ENABLED";

function unavailableOutput() {
  return createRenewalStateVerificationResult();
}

function stagingRenewalStateVerifyIsEnabled(env = process.env) {
  return Boolean(env) && env[STAGING_RENEWAL_STATE_VERIFY_FLAG] === "true";
}

function createStagingRenewalStateVerifyPrecondition(options = {}) {
  const env = options.env || process.env;
  return function stagingRenewalStateVerifyPrecondition(_req, res, next) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingRenewalStateVerifyIsEnabled(env)) {
      return res.status(503).json(unavailableOutput());
    }
    return next();
  };
}

function safeVerificationOutput(result) {
  return createRenewalStateVerificationResult(result);
}

function createStagingRenewalStateVerifyHandler(options = {}) {
  const env = options.env || process.env;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;

  return async function stagingRenewalStateVerifyHandler(req, res) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingRenewalStateVerifyIsEnabled(env)) {
      return res.status(503).json(unavailableOutput());
    }

    try {
      const connection = req.posLicensingStagingConnection || options.connection;
      if (!connection || !connection.db) {
        return res.status(503).json(unavailableOutput());
      }

      const rateLimitStoreFactory = options.rateLimitStoreFactory ||
        resolveConfiguredRateLimitStoreFactory(env, options);
      const readiness = await runReadinessGate({
        env,
        connection,
        rateLimitStoreFactory,
        fetchImpl: options.fetchImpl
      });
      if (!readinessAllowsStagingRouteMount(readiness)) {
        return res.status(503).json(unavailableOutput());
      }

      const verificationService = options.verificationService ||
        createStagingPosRenewalStateVerificationService();
      const result = await verificationService.verifyRenewalState();
      return res.status(200).json(safeVerificationOutput(result));
    } catch {
      return res.status(503).json(unavailableOutput());
    }
  };
}

function mountStagingRenewalStateVerifyEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestFixtureEndpoint(env)) {
    return false;
  }

  const safeUnavailableOutput = () => unavailableOutput();
  router.get(
    STAGING_RENEWAL_STATE_VERIFY_PATH,
    createStagingRenewalStateVerifyPrecondition({ ...options, env }),
    createStagingTestFixtureOperatorAuthorization({
      ...options,
      env,
      unavailableOutput: safeUnavailableOutput
    }),
    createStagingTestFixtureConnectionMiddleware({
      ...options,
      env,
      unavailableOutput: safeUnavailableOutput
    }),
    createStagingRenewalStateVerifyHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_RENEWAL_STATE_VERIFY_FLAG,
  STAGING_RENEWAL_STATE_VERIFY_PATH,
  createStagingRenewalStateVerifyHandler,
  createStagingRenewalStateVerifyPrecondition,
  mountStagingRenewalStateVerifyEndpoint,
  safeVerificationOutput,
  stagingRenewalStateVerifyIsEnabled,
  unavailableOutput
};
