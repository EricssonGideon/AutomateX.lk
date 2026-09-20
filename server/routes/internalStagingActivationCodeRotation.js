const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  resolveConfiguredRateLimitStoreFactory
} = require("../licensing/upstashRateLimitStore");
const {
  createStagingPosActivationCodeRotationService
} = require("../services/stagingPosActivationCodeRotationService");
const {
  createStagingTestFixtureConnectionMiddleware,
  createStagingTestFixtureOperatorAuthorization,
  shouldMountStagingTestFixtureEndpoint
} = require("./internalStagingActivationFixture");
const {
  readinessAllowsStagingRouteMount
} = require("./stagingPosLicensing");

const STAGING_ACTIVATION_CODE_ROTATION_PATH = "/internal/pos-licensing-staging-test-fixture/rotate-activation-code";
const STAGING_ACTIVATION_CODE_ROTATION_FLAG = "POS_LICENSING_STAGING_TEST_FIXTURE_ROTATION_ENABLED";

function rotationOutput(rotated, code, extra = {}) {
  return Object.freeze({
    rotated: rotated === true,
    code,
    ...extra
  });
}

function stagingActivationCodeRotationIsEnabled(env = process.env) {
  return Boolean(env) && env[STAGING_ACTIVATION_CODE_ROTATION_FLAG] === "true";
}

function createStagingActivationCodeRotationPrecondition(options = {}) {
  const env = options.env || process.env;
  return function stagingActivationCodeRotationPrecondition(_req, res, next) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingActivationCodeRotationIsEnabled(env)) {
      return res.status(503).json(rotationOutput(false, "staging_activation_code_rotation_unavailable"));
    }
    return next();
  };
}

function createStagingActivationCodeRotationHandler(options = {}) {
  const env = options.env || process.env;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;

  return async function stagingActivationCodeRotationHandler(req, res) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingActivationCodeRotationIsEnabled(env)) {
      return res.status(503).json(rotationOutput(false, "staging_activation_code_rotation_unavailable"));
    }
    if (req.body && Object.keys(req.body).length > 0) {
      return res.status(400).json(rotationOutput(false, "staging_activation_code_rotation_body_not_allowed"));
    }

    try {
      const connection = req.posLicensingStagingConnection || options.connection;
      if (!connection || !connection.db) {
        return res.status(503).json(rotationOutput(false, "staging_activation_code_rotation_database_unavailable"));
      }

      const rateLimitStoreFactory = options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options);
      const readiness = await runReadinessGate({
        env,
        connection,
        rateLimitStoreFactory,
        fetchImpl: options.fetchImpl
      });
      if (!readinessAllowsStagingRouteMount(readiness)) {
        return res.status(503).json(rotationOutput(false, "staging_activation_code_rotation_readiness_failed"));
      }

      const rotationService = options.rotationService || createStagingPosActivationCodeRotationService({ connection });
      const result = await rotationService.rotateFixtureActivationCode(req.user);
      if (!result || result.rotated !== true) {
        return res.status(409).json(rotationOutput(false, "staging_activation_code_already_rotated"));
      }

      return res.status(201).json(rotationOutput(true, "staging_activation_code_rotated", {
        activationCode: result.activationCode,
        activationCodeExpiresAt: result.activationCodeExpiresAt,
        maxRedemptions: 1
      }));
    } catch {
      return res.status(503).json(rotationOutput(false, "staging_activation_code_rotation_failed"));
    }
  };
}

function mountStagingActivationCodeRotationEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestFixtureEndpoint(env)) {
    return false;
  }

  router.post(
    STAGING_ACTIVATION_CODE_ROTATION_PATH,
    createStagingActivationCodeRotationPrecondition({ ...options, env }),
    createStagingTestFixtureOperatorAuthorization({ ...options, env }),
    createStagingTestFixtureConnectionMiddleware({ ...options, env }),
    createStagingActivationCodeRotationHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_ACTIVATION_CODE_ROTATION_FLAG,
  STAGING_ACTIVATION_CODE_ROTATION_PATH,
  createStagingActivationCodeRotationHandler,
  createStagingActivationCodeRotationPrecondition,
  mountStagingActivationCodeRotationEndpoint,
  rotationOutput,
  stagingActivationCodeRotationIsEnabled
};
