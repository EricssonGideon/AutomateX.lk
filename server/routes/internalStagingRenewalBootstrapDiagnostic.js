const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  resolveConfiguredRateLimitStoreFactory
} = require("../licensing/upstashRateLimitStore");
const {
  createBootstrapDiagnosticResult,
  createStagingPosRenewalBootstrapDiagnosticService
} = require("../services/stagingPosRenewalBootstrapDiagnosticService");
const {
  createStagingTestFixtureConnectionMiddleware,
  createStagingTestFixtureOperatorAuthorization,
  shouldMountStagingTestFixtureEndpoint
} = require("./internalStagingActivationFixture");
const {
  readinessAllowsStagingRouteMount
} = require("./stagingPosLicensing");

const STAGING_BOOTSTRAP_DIAGNOSTIC_PATH = "/internal/pos-licensing-staging-test-fixture/bootstrap-diagnostic";
const STAGING_BOOTSTRAP_DIAGNOSTIC_FLAG = "POS_LICENSING_STAGING_TEST_FIXTURE_BOOTSTRAP_DIAGNOSTIC_ENABLED";
const SAFE_DIAGNOSTIC_RESULT_CODES = new Set([
  "staging_bootstrap_diagnostic_passed",
  "staging_bootstrap_diagnostic_failed",
  "staging_bootstrap_diagnostic_invalid_request"
]);

function unavailableOutput(code = "staging_bootstrap_diagnostic_unavailable") {
  return Object.freeze({ code });
}

function stagingBootstrapDiagnosticIsEnabled(env = process.env) {
  return Boolean(env) && env[STAGING_BOOTSTRAP_DIAGNOSTIC_FLAG] === "true";
}

function diagnosticOutput(result = {}) {
  const code = SAFE_DIAGNOSTIC_RESULT_CODES.has(result.code) ? result.code : "";
  return createBootstrapDiagnosticResult(result, code);
}

function createStagingBootstrapDiagnosticPrecondition(options = {}) {
  const env = options.env || process.env;
  return function stagingBootstrapDiagnosticPrecondition(_req, res, next) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingBootstrapDiagnosticIsEnabled(env)) {
      return res.status(503).json(unavailableOutput());
    }
    return next();
  };
}

function createStagingBootstrapDiagnosticHandler(options = {}) {
  const env = options.env || process.env;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;

  return async function stagingBootstrapDiagnosticHandler(req, res) {
    if (!shouldMountStagingTestFixtureEndpoint(env) || !stagingBootstrapDiagnosticIsEnabled(env)) {
      return res.status(503).json(unavailableOutput());
    }

    try {
      const connection = req.posLicensingStagingConnection || options.connection;
      if (!connection || !connection.db) {
        return res.status(503).json(unavailableOutput("staging_bootstrap_diagnostic_database_unavailable"));
      }

      const rateLimitStoreFactory = options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options);
      const readiness = await runReadinessGate({
        env,
        connection,
        rateLimitStoreFactory,
        fetchImpl: options.fetchImpl
      });
      if (!readinessAllowsStagingRouteMount(readiness)) {
        return res.status(503).json(unavailableOutput("staging_bootstrap_diagnostic_readiness_failed"));
      }

      const diagnosticService = options.diagnosticService ||
        createStagingPosRenewalBootstrapDiagnosticService();
      const result = await diagnosticService.diagnoseBootstrap(req.body);
      return res.status(200).json(diagnosticOutput(result));
    } catch {
      return res.status(503).json(unavailableOutput("staging_bootstrap_diagnostic_unavailable"));
    }
  };
}

function mountStagingBootstrapDiagnosticEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingTestFixtureEndpoint(env)) {
    return false;
  }

  router.post(
    STAGING_BOOTSTRAP_DIAGNOSTIC_PATH,
    createStagingBootstrapDiagnosticPrecondition({ ...options, env }),
    createStagingTestFixtureOperatorAuthorization({ ...options, env }),
    createStagingTestFixtureConnectionMiddleware({ ...options, env }),
    createStagingBootstrapDiagnosticHandler({ ...options, env })
  );
  return true;
}

module.exports = {
  STAGING_BOOTSTRAP_DIAGNOSTIC_FLAG,
  STAGING_BOOTSTRAP_DIAGNOSTIC_PATH,
  createStagingBootstrapDiagnosticHandler,
  createStagingBootstrapDiagnosticPrecondition,
  diagnosticOutput,
  mountStagingBootstrapDiagnosticEndpoint,
  stagingBootstrapDiagnosticIsEnabled,
  unavailableOutput
};
