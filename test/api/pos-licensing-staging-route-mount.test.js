const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-route-mount-test-only";

const {
  STAGING_POS_MACHINE_BASE_PATH,
  createProtectedStagingMachineRouter,
  mountStagingPosMachineRoutes,
  readinessAllowsStagingRouteMount,
  shouldPrepareStagingPosMachineRoutes
} = require("../../server/routes/stagingPosLicensing");

function stagingPreviewEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    POS_LICENSING_MACHINE_API_BASE_PATH: "/api/pos-machine/v1",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    ...overrides
  };
}

function eligibleReadiness(overrides = {}) {
  return {
    environment: "staging",
    ready: true,
    technicalReadinessPassed: true,
    enablementRequested: true,
    eligibleForRouteMount: true,
    eligibleForStagingRouteMount: true,
    eligibleForProductionRouteMount: false,
    checks: [{ name: "staging_enablement", passed: true, code: "staging_enablement_explicit" }],
    ...overrides
  };
}

function appRecorder() {
  return {
    registrations: [],
    use(path, handler) {
      this.registrations.push({ path, handler });
    }
  };
}

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function mountOptions(env, readiness, counters = {}) {
  return {
    env,
    connection: {},
    async runReadinessGate() {
      counters.readiness = (counters.readiness || 0) + 1;
      return readiness;
    },
    validateConfig() {
      counters.config = (counters.config || 0) + 1;
      return {
        environment: "staging",
        machineApiOrigin: "https://licensing-staging.example.com",
        transport: { machineApiOrigin: "https://licensing-staging.example.com" },
        rateLimit: {},
        secrets: {}
      };
    },
    rateLimitOptionsFactory() {
      counters.rateLimits = (counters.rateLimits || 0) + 1;
      return { activation: {}, bootstrap: {}, renewal: {} };
    },
    protectedRouterFactory() {
      counters.router = (counters.router || 0) + 1;
      return (_req, res) => res.status(418).json({ mounted: true });
    }
  };
}

test("staging machine routes stay unmounted while enablement is false or malformed", () => {
  for (const value of ["false", "", "yes", "1"]) {
    const env = stagingPreviewEnvironment({ POS_LICENSING_ENABLED: value });
    const app = appRecorder();
    assert.equal(shouldPrepareStagingPosMachineRoutes(env), false, value);
    assert.equal(mountStagingPosMachineRoutes(app, { env }), false, value);
    assert.equal(app.registrations.length, 0, value);
  }
});

test("real staging machine router is prepared only on the exact Vercel Preview branch after readiness passes", async () => {
  const env = stagingPreviewEnvironment();
  const app = appRecorder();
  const counters = {};
  assert.equal(mountStagingPosMachineRoutes(app, mountOptions(env, eligibleReadiness(), counters)), true);
  assert.equal(app.registrations.length, 1);
  assert.equal(app.registrations[0].path, STAGING_POS_MACHINE_BASE_PATH);
  assert.equal(app.registrations[0].path, "/api/pos-machine/v1");
  assert.deepEqual(counters, {});

  const response = responseRecorder();
  await app.registrations[0].handler({}, response, () => {
    throw new Error("eligible staging request bypassed the machine router");
  });
  assert.equal(response.statusCode, 418);
  assert.deepEqual(response.body, { mounted: true });
  assert.deepEqual(counters, { readiness: 1, config: 1, rateLimits: 1, router: 1 });

  const secondResponse = responseRecorder();
  await app.registrations[0].handler({}, secondResponse, () => {
    throw new Error("prepared staging request bypassed the machine router");
  });
  assert.equal(secondResponse.statusCode, 418);
  assert.deepEqual(counters, { readiness: 1, config: 1, rateLimits: 1, router: 1 });
});

test("prepared staging router retains transport, machine CORS, limiter, and signing dependencies", () => {
  const keyProvider = Object.freeze({ keyId: "automatex-pos-staging-ed25519-v1" });
  const rateLimits = {
    activation: { limit: 10 },
    bootstrap: { limit: 20 },
    renewal: { limit: 60 }
  };
  let received;
  const router = createProtectedStagingMachineRouter({
    keyProvider,
    transport: {
      approvedHostname: "licensing-staging.example.com",
      proxy: { mode: "direct", trusts() { return false; } },
      cors: { machine: { allowedOrigins: [] } }
    }
  }, rateLimits, {
    createMachineRouter(options) {
      received = options;
      return (_req, _res, next) => next();
    }
  });
  assert.equal(router.stack[0].handle.name, "posTransportGuard");
  assert.deepEqual(received.allowedOrigins, []);
  assert.equal(received.rateLimit, rateLimits.activation);
  assert.equal(received.bootstrapRateLimit, rateLimits.bootstrap);
  assert.equal(received.renewalRateLimit, rateLimits.renewal);
  assert.equal(received.serviceOptions.keyProvider, keyProvider);
  assert.equal(received.renewalServiceOptions.keyProvider, keyProvider);
});

test("main, production, non-Vercel, and wrong-base-path runtimes cannot mount staging machine routes", () => {
  const invalidEnvironments = [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ VERCEL: "" }),
    stagingPreviewEnvironment({ POS_LICENSING_MACHINE_API_BASE_PATH: "/api/pos-machine/v2" }),
    stagingPreviewEnvironment({
      AUTOMATEX_ENV: "production",
      POS_LICENSING_MODE: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main"
    })
  ];
  for (const env of invalidEnvironments) {
    const app = appRecorder();
    assert.equal(mountStagingPosMachineRoutes(app, { env }), false);
    assert.equal(app.registrations.length, 0);
  }
});

test("failed or production-eligible readiness cannot prepare or pass through to machine routes", async () => {
  for (const readiness of [
    eligibleReadiness({ ready: false, eligibleForRouteMount: false, checks: [{ name: "transaction_probe", passed: false, code: "transaction_probe_not_passed" }] }),
    eligibleReadiness({ eligibleForProductionRouteMount: true })
  ]) {
    const env = stagingPreviewEnvironment();
    const app = appRecorder();
    const counters = {};
    assert.equal(readinessAllowsStagingRouteMount(readiness), false);
    assert.equal(mountStagingPosMachineRoutes(app, mountOptions(env, readiness, counters)), true);
    const response = responseRecorder();
    let nextCalled = false;
    await app.registrations[0].handler({}, response, () => { nextCalled = true; });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "POS licensing service is unavailable." });
    assert.equal(nextCalled, false);
    assert.deepEqual(counters, { readiness: 1 });
  }
});
