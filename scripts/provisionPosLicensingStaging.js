const mongoose = require("mongoose");

const { loadRuntimeEnvironment } = require("../server/config/loadRuntimeEnvironment");
const {
  validateStagingLicensingConfig
} = require("../server/config/posLicensingProduction");
const {
  getPosLicensingMongoConnectionOptions
} = require("../server/config/posLicensingMongo");
const { classifyRuntimeEnvironment } = require("../server/config/runtimeEnvironment");
const {
  getPosLicensingProvisioningPlan,
  provisionPosLicensingDatabase,
  validatePosLicensingProvisioningPlan
} = require("../server/licensing/posLicensingProvisioning");

const STAGING_APPLY_CONFIRMATION = "PROVISION_AUTOMATEX_POS_LICENSING_STAGING";
const STAGING_LOCAL_EXECUTION_MODE = "approved-local";
const EXPECTED_COLLECTION_COUNT = 7;
const EXPECTED_INDEX_COUNT = 40;

class PosLicensingStagingProvisioningError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PosLicensingStagingProvisioningError";
    this.code = code;
  }
}

function clean(value) {
  return String(value || "").trim();
}

function fail(code, message) {
  throw new PosLicensingStagingProvisioningError(code, message);
}

function validateStagingExecutionContext(env = process.env) {
  const runtime = classifyRuntimeEnvironment(env);
  if (runtime.mode !== "staging" || clean(env.POS_LICENSING_MODE).toLowerCase() !== "staging") {
    fail("staging_environment_required", "POS licensing staging provisioning requires staging runtime identity.");
  }

  const vercel = clean(env.VERCEL);
  const vercelEnvironment = clean(env.VERCEL_ENV).toLowerCase();
  const localExecution = clean(env.POS_LICENSING_STAGING_PROVISION_EXECUTION).toLowerCase();
  const verifiedVercelPreview = vercel === "1" && vercelEnvironment === "preview";
  const approvedLocalExecution = !vercel && !vercelEnvironment && localExecution === STAGING_LOCAL_EXECUTION_MODE;

  if (!verifiedVercelPreview && !approvedLocalExecution) {
    fail(
      "staging_execution_context_rejected",
      "Staging provisioning requires Vercel Preview or explicitly approved local staging execution."
    );
  }

  return Object.freeze({
    environment: "staging",
    execution: verifiedVercelPreview ? "vercel-preview" : STAGING_LOCAL_EXECUTION_MODE
  });
}

function getValidatedPlan() {
  const plan = getPosLicensingProvisioningPlan();
  const validation = validatePosLicensingProvisioningPlan(plan);
  const indexCount = plan.reduce((total, entry) => total + entry.indexes.length, 0);
  if (!validation.valid || plan.length !== EXPECTED_COLLECTION_COUNT || indexCount !== EXPECTED_INDEX_COUNT) {
    fail("staging_provisioning_definitions_invalid", "POS licensing staging provisioning definitions require review.");
  }
  return Object.freeze({ plan, validation, indexCount });
}

function safePlanOutput(validatedPlan, applyRequested) {
  return Object.freeze({
    environment: "staging",
    mode: applyRequested ? "apply" : "dry-run",
    applyRequested,
    applied: false,
    valid: validatedPlan.validation.valid,
    collectionCount: validatedPlan.plan.length,
    indexCount: validatedPlan.indexCount,
    collections: validatedPlan.plan.map((entry) => Object.freeze({
      collection: entry.collection,
      indexes: entry.indexes.map((index) => Object.freeze({
        name: index.options.name,
        unique: index.options.unique === true
      }))
    }))
  });
}

async function runStagingProvisioning(options = {}) {
  const env = options.env || process.env;
  const argv = options.argv || process.argv.slice(2);
  const mongo = options.mongo || mongoose;
  const suppliedConnection = options.connection || null;
  const loadEnvironment = options.loadEnvironment || loadRuntimeEnvironment;
  const validateConfig = options.validateConfig || validateStagingLicensingConfig;
  const applyRequested = argv.includes("--apply");
  let connectionAttempted = false;

  loadEnvironment({ env });
  validateStagingExecutionContext(env);

  if (applyRequested && clean(env.POS_LICENSING_STAGING_PROVISION_CONFIRM) !== STAGING_APPLY_CONFIRMATION) {
    fail("staging_apply_confirmation_required", "Explicit staging-only provisioning confirmation is required.");
  }

  const config = validateConfig(env);
  if (config.environment !== "staging" || config.mode !== "staging") {
    fail("staging_configuration_required", "The validated POS licensing configuration is not staging-only.");
  }

  const validatedPlan = getValidatedPlan();
  if (!applyRequested) {
    return safePlanOutput(validatedPlan, false);
  }

  try {
    let connection = suppliedConnection;
    if (!connection) {
      connectionAttempted = true;
      await mongo.connect(
        config.secrets.getMongoUri(),
        getPosLicensingMongoConnectionOptions(config.databaseName)
      );
      connection = mongo.connection;
    }
    const result = await provisionPosLicensingDatabase(connection, { apply: true });
    return Object.freeze({
      environment: "staging",
      mode: "apply",
      applyRequested: true,
      applied: result.applied === true,
      valid: result.validation.valid === true,
      collectionCount: result.results.length,
      indexCount: result.results.reduce((total, entry) => total + entry.indexes, 0),
      results: result.results.map((entry) => Object.freeze({
        collection: entry.collection,
        indexes: entry.indexes
      }))
    });
  } finally {
    if (connectionAttempted && typeof mongo.disconnect === "function") {
      await mongo.disconnect().catch(() => null);
    }
  }
}

async function executeStagingProvisioningCommand(options = {}) {
  const output = await runStagingProvisioning(options);
  const stdout = options.stdout || process.stdout;
  stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (require.main === module) {
  executeStagingProvisioningCommand().catch(async () => {
    process.stderr.write("POS licensing staging provisioning failed closed.\n");
    await mongoose.disconnect().catch(() => null);
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_COLLECTION_COUNT,
  EXPECTED_INDEX_COUNT,
  PosLicensingStagingProvisioningError,
  STAGING_APPLY_CONFIRMATION,
  STAGING_LOCAL_EXECUTION_MODE,
  executeStagingProvisioningCommand,
  runStagingProvisioning,
  validateStagingExecutionContext
};
