const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  resolveConfiguredRateLimitStoreFactory
} = require("../licensing/upstashRateLimitStore");
const {
  STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES,
  createStagingPosFixtureRenewalPolicyRepairService
} = require("../services/stagingPosFixtureRenewalPolicyRepairService");
const {
  createStagingTestFixtureConnectionMiddleware,
  createStagingTestFixtureOperatorAuthorization,
  shouldMountStagingTestFixtureEndpoint
} = require("./internalStagingActivationFixture");
const {
  readinessAllowsStagingRouteMount
} = require("./stagingPosLicensing");

const STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_PATH =
  "/internal/pos-licensing-staging-test-fixture/repair-renewal-policy";
const STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_FLAG =
  "POS_LICENSING_STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_ENABLED";

function repairOutput(repaired, code) {
  return Object.freeze({
    repaired: repaired === true,
    renewalWindowDurationMinutes: repaired === true
      ? STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES
      : null,
    code
  });
}

function stagingFixtureRenewalPolicyRepairIsEnabled(env = process.env) {
  return Boolean(env) && env[STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_FLAG] === "true";
}

function createStagingFixtureRenewalPolicyRepairPrecondition(options = {}) {
  const env = options.env || process.env;
  return function stagingFixtureRenewalPolicyRepairPrecondition(_req, res, next) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingFixtureRenewalPolicyRepairIsEnabled(env)) {
      return res.status(503).json(repairOutput(false, "staging_fixture_renewal_policy_repair_unavailable"));
    }
    return next();
  };
}

function createStagingFixtureRenewalPolicyRepairHandler(options = {}) {
  const env = options.env || process.env;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;

  return async function stagingFixtureRenewalPolicyRepairHandler(req, res) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingFixtureRenewalPolicyRepairIsEnabled(env)) {
      return res.status(503).json(repairOutput(false, "staging_fixture_renewal_policy_repair_unavailable"));
    }
    if (req.body && Object.keys(req.body).length > 0) {
      return res.status(400).json(repairOutput(false, "staging_fixture_renewal_policy_repair_body_not_allowed"));
    }

    try {
      const connection = req.posLicensingStagingConnection || options.connection;
      if (!connection || !connection.db) {
        return res.status(503).json(repairOutput(false, "staging_fixture_renewal_policy_repair_database_unavailable"));
      }

      const rateLimitStoreFactory = options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options);
      const readiness = await runReadinessGate({
        env,
        connection,
        rateLimitStoreFactory,
        fetchImpl: options.fetchImpl
      });
      if (!readinessAllowsStagingRouteMount(readiness)) {
        return res.status(503).json(repairOutput(false, "staging_fixture_renewal_policy_repair_readiness_failed"));
      }

      const repairService = options.repairService ||
        createStagingPosFixtureRenewalPolicyRepairService({ connection });
      const result = await repairService.repairFixtureRenewalPolicy(req.user);
      if (!result || result.repaired !== true) {
        return res.status(200).json(Object.freeze({
          repaired: false,
          renewalWindowDurationMinutes: STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES,
          code: "staging_fixture_renewal_policy_already_repaired"
        }));
      }
      return res.status(200).json(repairOutput(true, "staging_fixture_renewal_policy_repaired"));
    } catch {
      return res.status(503).json(repairOutput(false, "staging_fixture_renewal_policy_repair_failed"));
    }
  };
}

function mountStagingFixtureRenewalPolicyRepairEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestFixtureEndpoint(env)) {
    return false;
  }

  router.post(
    STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_PATH,
    createStagingFixtureRenewalPolicyRepairPrecondition({ ...options, env }),
    createStagingTestFixtureOperatorAuthorization({ ...options, env }),
    createStagingTestFixtureConnectionMiddleware({ ...options, env }),
    createStagingFixtureRenewalPolicyRepairHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_FLAG,
  STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_PATH,
  createStagingFixtureRenewalPolicyRepairHandler,
  createStagingFixtureRenewalPolicyRepairPrecondition,
  mountStagingFixtureRenewalPolicyRepairEndpoint,
  repairOutput,
  stagingFixtureRenewalPolicyRepairIsEnabled
};
