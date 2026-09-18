const mongoose = require("mongoose");

const { loadRuntimeEnvironment } = require("../server/config/loadRuntimeEnvironment");
const {
  validateStagingLicensingConfig
} = require("../server/config/posLicensingProduction");
const {
  getPosLicensingMongoConnectionOptions
} = require("../server/config/posLicensingMongo");
const {
  runStagingLicensingReadinessGate
} = require("../server/licensing/posLicensingReadinessGate");

const SAFE_CODE_PATTERN = /^[a-z0-9_]{1,100}$/;
const FAILED_TRANSACTION_CAPABILITY = Object.freeze({
  supported: false,
  verified: false,
  logicalSessions: false,
  transactionalTopology: false,
  probePassed: false,
  reason: "database_connection_or_configuration_failed"
});

function safeCode(value, fallback) {
  return typeof value === "string" && SAFE_CODE_PATTERN.test(value) ? value : fallback;
}

function safeChecks(checks) {
  if (!Array.isArray(checks)) {
    return Object.freeze([]);
  }
  return Object.freeze(checks.map((check) => Object.freeze({
    name: safeCode(check && check.name, "readiness_check_invalid"),
    passed: Boolean(check && check.passed),
    code: safeCode(check && check.code, "readiness_code_invalid")
  })));
}

function projectSafeStagingReadiness(report = {}) {
  const stagingOnly = report.environment === "staging" && report.eligibleForProductionRouteMount !== true;
  const technicalReadinessPassed = stagingOnly && report.technicalReadinessPassed === true;
  const eligibleForRouteMount = stagingOnly && report.eligibleForRouteMount === true;
  const ready = technicalReadinessPassed && eligibleForRouteMount && report.ready === true;
  return Object.freeze({
    environment: "staging",
    ready,
    technicalReadinessPassed,
    enablementRequested: stagingOnly && report.enablementRequested === true,
    eligibleForRouteMount,
    active: false,
    decisionCode: stagingOnly
      ? safeCode(report.decisionCode, "staging_readiness_failed")
      : "staging_environment_required",
    checks: safeChecks(report.checks)
  });
}

function failedStagingReadinessOutput(code = "staging_readiness_failed") {
  return projectSafeStagingReadiness({
    environment: "staging",
    ready: false,
    technicalReadinessPassed: false,
    enablementRequested: false,
    eligibleForRouteMount: false,
    eligibleForProductionRouteMount: false,
    active: false,
    decisionCode: code,
    checks: [{ name: "staging_readiness", passed: false, code }]
  });
}

async function runStagingReadinessCheck(options = {}) {
  const env = options.env || process.env;
  const mongo = options.mongo || mongoose;
  const loadEnvironment = options.loadEnvironment || loadRuntimeEnvironment;
  const validateConfig = options.validateConfig || validateStagingLicensingConfig;
  const runGate = options.runGate || runStagingLicensingReadinessGate;
  let connection = null;
  let transactionCapability = options.transactionCapability || null;

  try {
    loadEnvironment({ env });
  } catch {
    return failedStagingReadinessOutput("staging_environment_source_invalid");
  }

  try {
    const config = validateConfig(env);
    await mongo.connect(
      config.secrets.getMongoUri(),
      getPosLicensingMongoConnectionOptions(config.databaseName)
    );
    connection = mongo.connection;
  } catch {
    transactionCapability = FAILED_TRANSACTION_CAPABILITY;
  }

  try {
    const report = await runGate({
      env,
      connection,
      transactionCapability,
      rateLimitStoreFactory: options.rateLimitStoreFactory,
      fetchImpl: options.fetchImpl
    });
    return projectSafeStagingReadiness(report);
  } catch {
    return failedStagingReadinessOutput();
  } finally {
    if (typeof mongo.disconnect === "function") {
      await mongo.disconnect().catch(() => null);
    }
  }
}

async function executeStagingReadinessCommand(options = {}) {
  const output = await runStagingReadinessCheck(options);
  const stdout = options.stdout || process.stdout;
  stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return Object.freeze({ output, exitCode: output.ready ? 0 : 1 });
}

if (require.main === module) {
  executeStagingReadinessCommand()
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      process.stdout.write(`${JSON.stringify(failedStagingReadinessOutput(), null, 2)}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  executeStagingReadinessCommand,
  failedStagingReadinessOutput,
  projectSafeStagingReadiness,
  runStagingReadinessCheck
};
