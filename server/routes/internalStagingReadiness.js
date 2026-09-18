const mongoose = require("mongoose");

const {
  isStagingPreviewReadinessRuntime
} = require("../config/stagingPreviewReadinessRuntime");
const { connectToDatabase } = require("../utils/db");

const STAGING_READINESS_PATH = "/internal/pos-licensing-staging-readiness";

// TEMPORARY: expose only on the dedicated staging Vercel Preview branch.
function shouldMountStagingReadinessEndpoint(env = process.env) {
  return isStagingPreviewReadinessRuntime(env);
}

function failedStagingReadinessOutput() {
  return Object.freeze({
    environment: "staging",
    ready: false,
    technicalReadinessPassed: false,
    enablementRequested: false,
    eligibleForRouteMount: false,
    active: false,
    decisionCode: "staging_readiness_failed",
    checks: Object.freeze([Object.freeze({
      name: "staging_readiness",
      passed: false,
      code: "staging_readiness_failed"
    })])
  });
}

function defaultReadinessCheck(options) {
  const {
    runStagingReadinessCheck
  } = require("../../scripts/checkPosLicensingStagingReadiness");
  return runStagingReadinessCheck(options);
}

function createStagingReadinessHandler(options = {}) {
  const env = options.env || process.env;
  const suppliedConnection = options.connection || null;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const runReadinessCheck = options.runReadinessCheck || defaultReadinessCheck;
  return async function stagingReadinessHandler(_req, res) {
    let output;
    try {
      if (!suppliedConnection) {
        await connectionProvider();
      }
      output = await runReadinessCheck({
        env,
        connection: suppliedConnection || mongoose.connection
      });
    } catch {
      output = failedStagingReadinessOutput();
    }
    res.status(output.ready === true ? 200 : 503).json(output);
  };
}

function mountStagingReadinessEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingReadinessEndpoint(env)) {
    return false;
  }
  router.get(STAGING_READINESS_PATH, createStagingReadinessHandler({
    env,
    connection: options.connection,
    connectionProvider: options.connectionProvider,
    runReadinessCheck: options.runReadinessCheck
  }));
  return true;
}

module.exports = {
  STAGING_READINESS_PATH,
  createStagingReadinessHandler,
  failedStagingReadinessOutput,
  mountStagingReadinessEndpoint,
  shouldMountStagingReadinessEndpoint
};
