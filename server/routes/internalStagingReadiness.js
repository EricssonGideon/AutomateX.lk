const mongoose = require("mongoose");

const {
  failedStagingReadinessOutput,
  runStagingReadinessCheck
} = require("../../scripts/checkPosLicensingStagingReadiness");

const STAGING_READINESS_PATH = "/internal/pos-licensing-staging-readiness";

// TEMPORARY: expose only on the dedicated staging Vercel Preview branch.
function shouldMountStagingReadinessEndpoint(env = process.env) {
  return String(env.POS_LICENSING_MODE || "").trim().toLowerCase() === "staging" &&
    String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview" &&
    String(env.VERCEL_GIT_COMMIT_REF || "").trim() === "pos-licensing-staging";
}

function createStagingReadinessHandler(options = {}) {
  const env = options.env || process.env;
  const connection = options.connection || mongoose.connection;
  const runReadinessCheck = options.runReadinessCheck || runStagingReadinessCheck;
  return async function stagingReadinessHandler(_req, res) {
    let output;
    try {
      output = await runReadinessCheck({ env, connection });
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
    runReadinessCheck: options.runReadinessCheck
  }));
  return true;
}

module.exports = {
  STAGING_READINESS_PATH,
  createStagingReadinessHandler,
  mountStagingReadinessEndpoint,
  shouldMountStagingReadinessEndpoint
};
