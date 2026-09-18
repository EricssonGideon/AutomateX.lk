const express = require("express");
const mongoose = require("mongoose");

const { classifyRuntimeEnvironment } = require("../config/runtimeEnvironment");
const { validateStagingLicensingConfig } = require("../config/posLicensingProduction");
const { createPosTransportGuard } = require("../config/posLicensingTransport");
const {
  createMachineRateLimitOptions
} = require("../licensing/posLicensingRateLimit");
const {
  runStagingLicensingReadinessGate
} = require("../licensing/posLicensingReadinessGate");
const {
  MACHINE_ROUTE_GROUP
} = require("../licensing/posLicensingRouteGroups");
const {
  resolveConfiguredRateLimitStoreFactory
} = require("../licensing/upstashRateLimitStore");
const { connectToDatabase } = require("../utils/db");
const createPosActivationRouter = require("./posActivation");

const STAGING_POS_MACHINE_BASE_PATH = MACHINE_ROUTE_GROUP.basePath;

function clean(value) {
  return String(value || "").trim();
}

function shouldPrepareStagingPosMachineRoutes(env = process.env) {
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
    clean(env.POS_LICENSING_ENABLED).toLowerCase() === "true" &&
    clean(env.POS_LICENSING_MACHINE_API_BASE_PATH) === STAGING_POS_MACHINE_BASE_PATH;
}

function readinessAllowsStagingRouteMount(report) {
  return Boolean(
    report &&
    report.environment === "staging" &&
    report.ready === true &&
    report.technicalReadinessPassed === true &&
    report.enablementRequested === true &&
    report.eligibleForRouteMount === true &&
    report.eligibleForStagingRouteMount === true &&
    report.eligibleForProductionRouteMount !== true &&
    Array.isArray(report.checks) &&
    report.checks.every((check) => check && check.passed === true)
  );
}

function createProtectedStagingMachineRouter(config, rateLimits, options = {}) {
  const router = express.Router();
  router.use(createPosTransportGuard(config.transport));
  router.use((options.createMachineRouter || createPosActivationRouter)({
    allowedOrigins: config.transport.cors.machine.allowedOrigins,
    rateLimit: rateLimits.activation,
    renewalRateLimit: rateLimits.renewal,
    bootstrapRateLimit: rateLimits.bootstrap,
    serviceOptions: { keyProvider: config.keyProvider },
    renewalServiceOptions: { keyProvider: config.keyProvider }
  }));
  return router;
}

function createStagingPosMachineGate(options = {}) {
  const env = options.env || process.env;
  const connectionProvider = options.connectionProvider || connectToDatabase;
  const runReadinessGate = options.runReadinessGate || runStagingLicensingReadinessGate;
  const validateConfig = options.validateConfig || validateStagingLicensingConfig;
  const rateLimitOptionsFactory = options.rateLimitOptionsFactory || createMachineRateLimitOptions;
  const protectedRouterFactory = options.protectedRouterFactory || createProtectedStagingMachineRouter;
  let preparedRouterPromise = null;

  async function prepareRouter() {
    if (!shouldPrepareStagingPosMachineRoutes(env)) {
      return null;
    }
    if (!options.connection) {
      await connectionProvider();
    }
    const connection = options.connection || mongoose.connection;
    const rateLimitStoreFactory = options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options);
    const report = await runReadinessGate({
      env,
      connection,
      rateLimitStoreFactory,
      fetchImpl: options.fetchImpl
    });
    if (!readinessAllowsStagingRouteMount(report)) {
      return null;
    }
    const config = validateConfig(env);
    if (config.environment !== "staging" || config.machineApiOrigin !== config.transport.machineApiOrigin) {
      return null;
    }
    const rateLimits = rateLimitOptionsFactory(config, rateLimitStoreFactory);
    return protectedRouterFactory(config, rateLimits, options);
  }

  return async function stagingPosMachineGate(req, res, next) {
    if (!shouldPrepareStagingPosMachineRoutes(env)) {
      return next();
    }
    try {
      preparedRouterPromise = preparedRouterPromise || prepareRouter();
      const router = await preparedRouterPromise;
      if (!router) {
        return res.status(503).json({ message: "POS licensing service is unavailable." });
      }
      return router(req, res, next);
    } catch {
      return res.status(503).json({ message: "POS licensing service is unavailable." });
    }
  };
}

function mountStagingPosMachineRoutes(app, options = {}) {
  const env = options.env || process.env;
  if (!shouldPrepareStagingPosMachineRoutes(env)) {
    return false;
  }
  app.use(STAGING_POS_MACHINE_BASE_PATH, createStagingPosMachineGate({ ...options, env }));
  return true;
}

module.exports = {
  STAGING_POS_MACHINE_BASE_PATH,
  createProtectedStagingMachineRouter,
  createStagingPosMachineGate,
  mountStagingPosMachineRoutes,
  readinessAllowsStagingRouteMount,
  shouldPrepareStagingPosMachineRoutes
};
