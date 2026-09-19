const mongoose = require("mongoose");

const { classifyRuntimeEnvironment } = require("../config/runtimeEnvironment");
const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  readinessAllowsStagingRouteMount
} = require("./stagingPosLicensing");
const { connectToDatabase } = require("../utils/db");
const {
  EXPECTED_COLLECTION_COUNT,
  EXPECTED_INDEX_COUNT,
  STAGING_APPLY_CONFIRMATION,
  runStagingProvisioning
} = require("../../scripts/provisionPosLicensingStaging");

const STAGING_PROVISIONING_PATH = "/internal/pos-licensing-staging-provision";

function clean(value) {
  return String(value || "").trim();
}

function safeOutput(applied, collectionCount, indexCount, code) {
  return Object.freeze({
    applied: applied === true,
    collectionCount: Number.isSafeInteger(collectionCount) ? collectionCount : 0,
    indexCount: Number.isSafeInteger(indexCount) ? indexCount : 0,
    code
  });
}

function unavailableOutput(code = "staging_provisioning_unavailable") {
  return safeOutput(false, 0, 0, code);
}

function shouldMountStagingProvisioningEndpoint(env = process.env) {
  let runtime;
  try {
    runtime = classifyRuntimeEnvironment(env);
  } catch {
    return false;
  }
  return runtime.mode === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    env.VERCEL === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.POS_LICENSING_ENABLED).toLowerCase() === "true";
}

function stagingProvisioningIsEnabled(env = process.env) {
  return Boolean(env) && env.POS_LICENSING_STAGING_PROVISION_ENABLED === "true";
}

async function defaultProvisioningApply(options) {
  const env = Object.freeze({
    ...options.env,
    POS_LICENSING_STAGING_PROVISION_CONFIRM: STAGING_APPLY_CONFIRMATION
  });
  return runStagingProvisioning({
    env,
    argv: ["--apply"],
    connection: options.connection
  });
}

function createStagingProvisioningHandler(options = {}) {
  const env = options.env || process.env;
  const suppliedConnection = options.connection || null;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;
  const applyProvisioning = options.applyProvisioning || defaultProvisioningApply;

  return async function stagingProvisioningHandler(_req, res) {
    if (!shouldMountStagingProvisioningEndpoint(env) || !stagingProvisioningIsEnabled(env)) {
      return res.status(503).json(unavailableOutput());
    }

    try {
      let connection = suppliedConnection;
      if (!connection) {
        const connected = await connectionProvider();
        connection = connected && connected.connection ? connected.connection : mongoose.connection;
      }
      if (!connection || !connection.db) {
        return res.status(503).json(unavailableOutput("staging_database_unavailable"));
      }

      const readiness = await runReadinessGate({
        env,
        connection,
        rateLimitStoreFactory: options.rateLimitStoreFactory,
        fetchImpl: options.fetchImpl
      });
      if (!readinessAllowsStagingRouteMount(readiness)) {
        return res.status(503).json(unavailableOutput("staging_readiness_failed"));
      }

      const result = await applyProvisioning({ env, connection });
      if (
        !result ||
        result.applied !== true ||
        result.collectionCount !== EXPECTED_COLLECTION_COUNT ||
        result.indexCount !== EXPECTED_INDEX_COUNT
      ) {
        return res.status(503).json(unavailableOutput("staging_provisioning_failed"));
      }
      return res.status(200).json(safeOutput(
        true,
        EXPECTED_COLLECTION_COUNT,
        EXPECTED_INDEX_COUNT,
        "staging_provisioning_applied"
      ));
    } catch {
      return res.status(503).json(unavailableOutput("staging_provisioning_failed"));
    }
  };
}

function mountStagingProvisioningEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingProvisioningEndpoint(env)) {
    return false;
  }
  router.post(STAGING_PROVISIONING_PATH, createStagingProvisioningHandler({
    ...options,
    env
  }));
  return true;
}

module.exports = {
  STAGING_PROVISIONING_PATH,
  createStagingProvisioningHandler,
  mountStagingProvisioningEndpoint,
  shouldMountStagingProvisioningEndpoint,
  stagingProvisioningIsEnabled,
  unavailableOutput
};
