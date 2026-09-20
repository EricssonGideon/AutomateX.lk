const mongoose = require("mongoose");

const { loadRuntimeEnvironment } = require("../server/config/loadRuntimeEnvironment");
const {
  validateStagingLicensingConfig
} = require("../server/config/posLicensingProduction");
const {
  getPosLicensingMongoConnectionOptions
} = require("../server/config/posLicensingMongo");
const {
  FIXTURE_CLIENT_EMAIL,
  FIXTURE_CLIENT_NAME,
  FIXTURE_MARKER,
  FIXTURE_PACKAGE_CODE,
  FIXTURE_PACKAGE_NAME,
  FIXTURE_PROJECT_TITLE,
  MINIMUM_CODE_LIFETIME_MS,
  defaultRepositories,
  evaluateFixtureEligibility,
  readFixtureRecords
} = require("../server/services/stagingPosActivationEligibilityService");

const APPROVED_LOCAL_ARGUMENT = "--approved-local-staging-read-only";
const EXPECTED_BRANCH = "pos-licensing-staging";
const CONFIG_ENV_NAMES = Object.freeze([
  "ALLOWED_ORIGINS",
  "AUTOMATEX_ENV",
  "MONGO_URI",
  "NODE_ENV",
  "POS_LICENSING_CLIENT_SCOPE",
  "POS_LICENSING_DATABASE_NAME",
  "POS_LICENSING_ENVIRONMENT",
  "POS_LICENSING_MACHINE_ALLOWED_ORIGINS",
  "POS_LICENSING_MACHINE_API_ORIGIN",
  "POS_LICENSING_MODE",
  "POS_LICENSING_PRODUCTION_ADMIN_ORIGINS",
  "POS_LICENSING_PRODUCTION_HOSTNAME",
  "POS_LICENSING_PROXY_TRUST_MODE",
  "POS_LICENSING_SECRET_ENVIRONMENT",
  "POS_LICENSING_SECRET_SOURCE",
  "POS_LICENSING_SIGNING_KEY_ID",
  "POS_LICENSING_STAGING_ADMIN_ORIGINS",
  "POS_LICENSING_STAGING_HOSTNAME",
  "POS_LICENSING_TRUSTED_PROXY_CIDRS",
  "VERCEL",
  "VERCEL_ENV"
]);

class StagingFixtureEligibilityError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingFixtureEligibilityError";
    this.code = code;
  }
}

function clean(value) {
  return String(value || "").trim();
}

function safeFailure(blocker) {
  return Object.freeze({
    fixtureLicenceId: null,
    packageStatus: null,
    licenceStatus: null,
    licenceExpiry: null,
    maxInstallations: null,
    activationCount: null,
    activeInstallationCount: null,
    freshInstallationAllowed: false,
    activationCodeIssuanceEligible: false,
    validStagingAdminAvailable: false,
    safeToProceedWithOneNewActivationCode: false,
    blockers: Object.freeze([blocker])
  });
}

function classifyFailure(error) {
  if (error instanceof StagingFixtureEligibilityError) {
    return error.code;
  }
  const code = clean(error && error.code);
  const configurationErrors = new Set([
    "database_name_mismatch",
    "environment_mismatch",
    "explicit_environment_required",
    "hostname_environment_collision",
    "invalid_environment",
    "invalid_secret_environment",
    "machine_origin_hostname_mismatch",
    "missing_configuration",
    "missing_transport_configuration",
    "proxy_trust_environment_mismatch",
    "proxy_trust_vercel_runtime_invalid",
    "secret_environment_mismatch",
    "unsafe_client_scope",
    "unsafe_database_name",
    "unsafe_mongodb_configuration"
  ]);
  if (configurationErrors.has(code)) {
    return `staging_configuration_${code}`;
  }
  if (/Mongo|Mongoose/i.test(clean(error && error.name))) {
    return "staging_database_unavailable";
  }
  return "staging_eligibility_check_failed_closed";
}

function stagingValidationEnvironment(env) {
  const selected = {};
  for (const name of CONFIG_ENV_NAMES) {
    if (typeof env[name] !== "undefined") {
      selected[name] = env[name];
    }
  }
  return selected;
}

function validateExecutionContext(env, argv) {
  const vercel = clean(env.VERCEL);
  const vercelEnvironment = clean(env.VERCEL_ENV).toLowerCase();
  const commitRef = clean(env.VERCEL_GIT_COMMIT_REF);
  const verifiedPreview = vercel === "1" &&
    vercelEnvironment === "preview" && commitRef === EXPECTED_BRANCH;
  const approvedLocal = argv.includes(APPROVED_LOCAL_ARGUMENT) && (
    vercel !== "1" || vercelEnvironment === "preview" && !commitRef
  );

  if (!verifiedPreview && !approvedLocal) {
    throw new StagingFixtureEligibilityError("staging_execution_context_rejected");
  }
}

function validateConnectedDatabase(connection, databaseName) {
  const connectedName = clean(connection && (
    connection.name || connection.db && connection.db.databaseName
  ));
  if (!connectedName || connectedName !== databaseName) {
    throw new StagingFixtureEligibilityError("staging_database_identity_mismatch");
  }
}

async function runStagingFixtureEligibilityCheck(options = {}) {
  const env = options.env || process.env;
  const argv = options.argv || process.argv.slice(2);
  const mongo = options.mongo || mongoose;
  const suppliedConnection = options.connection || null;
  let connectionAttempted = false;

  try {
    (options.loadEnvironment || loadRuntimeEnvironment)({ env });
    validateExecutionContext(env, argv);
    const config = (options.validateConfig || validateStagingLicensingConfig)(
      stagingValidationEnvironment(env)
    );
    if (config.environment !== "staging" || config.mode !== "staging" || config.clientScope !== "staging-only") {
      throw new StagingFixtureEligibilityError("staging_configuration_rejected");
    }

    let connection = suppliedConnection;
    if (!connection) {
      connectionAttempted = true;
      await mongo.connect(
        config.secrets.getMongoUri(),
        getPosLicensingMongoConnectionOptions(config.databaseName)
      );
      connection = mongo.connection;
    }
    validateConnectedDatabase(connection, config.databaseName);

    const records = await (options.readRecords || readFixtureRecords)(
      options.repositories || defaultRepositories()
    );
    return evaluateFixtureEligibility(records, options.now || new Date());
  } catch (error) {
    return safeFailure(classifyFailure(error));
  } finally {
    if (connectionAttempted && typeof mongo.disconnect === "function") {
      await mongo.disconnect().catch(() => null);
    }
  }
}

async function executeStagingFixtureEligibilityCommand(options = {}) {
  const output = await runStagingFixtureEligibilityCheck(options);
  (options.stdout || process.stdout).write(`${JSON.stringify(output, null, 2)}\n`);
  return Object.freeze({ output, exitCode: output.fixtureLicenceId ? 0 : 1 });
}

if (require.main === module) {
  executeStagingFixtureEligibilityCommand()
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      process.stdout.write(`${JSON.stringify(safeFailure("staging_eligibility_check_failed_closed"), null, 2)}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  APPROVED_LOCAL_ARGUMENT,
  EXPECTED_BRANCH,
  FIXTURE_CLIENT_EMAIL,
  FIXTURE_CLIENT_NAME,
  FIXTURE_MARKER,
  FIXTURE_PACKAGE_CODE,
  FIXTURE_PACKAGE_NAME,
  FIXTURE_PROJECT_TITLE,
  MINIMUM_CODE_LIFETIME_MS,
  classifyFailure,
  evaluateFixtureEligibility,
  executeStagingFixtureEligibilityCommand,
  readFixtureRecords,
  runStagingFixtureEligibilityCheck,
  safeFailure,
  stagingValidationEnvironment,
  validateConnectedDatabase,
  validateExecutionContext
};
