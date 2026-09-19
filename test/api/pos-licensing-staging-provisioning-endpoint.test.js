const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-provisioning-endpoint-test-only";

const {
  STAGING_PROVISIONING_PATH,
  createStagingProvisioningHandler,
  mountStagingProvisioningEndpoint,
  shouldMountStagingProvisioningEndpoint,
  stagingProvisioningIsEnabled,
  unavailableOutput
} = require("../../server/routes/internalStagingProvisioning");

function stagingPreviewEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    POS_LICENSING_STAGING_PROVISION_ENABLED: "true",
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

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function routerRecorder() {
  return {
    registrations: [],
    post(path, handler) { this.registrations.push({ method: "POST", path, handler }); }
  };
}

test("temporary provisioning endpoint mounts only on the exact staging Vercel Preview branch", () => {
  const router = routerRecorder();
  assert.equal(mountStagingProvisioningEndpoint(router, { env: stagingPreviewEnvironment() }), true);
  assert.deepEqual(router.registrations.map(({ method, path }) => ({ method, path })), [{
    method: "POST",
    path: STAGING_PROVISIONING_PATH
  }]);
  assert.equal(STAGING_PROVISIONING_PATH, "/internal/pos-licensing-staging-provision");

  for (const env of [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL: "" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ AUTOMATEX_ENV: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_MODE: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_ENABLED: "false" }),
    stagingPreviewEnvironment({
      AUTOMATEX_ENV: "production",
      POS_LICENSING_MODE: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main"
    })
  ]) {
    const invalidRouter = routerRecorder();
    assert.equal(shouldMountStagingProvisioningEndpoint(env), false);
    assert.equal(mountStagingProvisioningEndpoint(invalidRouter, { env }), false);
    assert.equal(invalidRouter.registrations.length, 0);
  }
});

test("disabled or malformed branch-only flag cannot provision", async () => {
  for (const value of ["false", "", "yes", "1", "TRUE "]) {
    const env = stagingPreviewEnvironment({ POS_LICENSING_STAGING_PROVISION_ENABLED: value });
    const counters = {};
    const response = responseRecorder();
    assert.equal(stagingProvisioningIsEnabled(env), false, value);
    await createStagingProvisioningHandler({
      env,
      connection: { db: {} },
      async runReadinessGate() { counters.readiness = 1; return eligibleReadiness(); },
      async applyProvisioning() { counters.provisioning = 1; return {}; }
    })({}, response);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, unavailableOutput());
    assert.deepEqual(counters, {});
  }
});

test("failed staging readiness cannot provision", async () => {
  const counters = {};
  const response = responseRecorder();
  await createStagingProvisioningHandler({
    env: stagingPreviewEnvironment(),
    connection: { db: {} },
    async runReadinessGate() {
      counters.readiness = (counters.readiness || 0) + 1;
      return eligibleReadiness({
        ready: false,
        eligibleForRouteMount: false,
        eligibleForStagingRouteMount: false,
        checks: [{ name: "transaction_probe", passed: false, code: "transaction_probe_not_passed" }]
      });
    },
    async applyProvisioning() {
      counters.provisioning = (counters.provisioning || 0) + 1;
      return {};
    }
  })({}, response);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, unavailableOutput("staging_readiness_failed"));
  assert.deepEqual(counters, { readiness: 1 });
});

test("valid staging Preview readiness can apply only the expected provisioning result", async () => {
  const env = stagingPreviewEnvironment();
  const connection = { db: {} };
  const counters = {};
  const response = responseRecorder();
  await createStagingProvisioningHandler({
    env,
    connection,
    async runReadinessGate(options) {
      counters.readiness = (counters.readiness || 0) + 1;
      assert.strictEqual(options.env, env);
      assert.strictEqual(options.connection, connection);
      return eligibleReadiness();
    },
    async applyProvisioning(options) {
      counters.provisioning = (counters.provisioning || 0) + 1;
      assert.strictEqual(options.env, env);
      assert.strictEqual(options.connection, connection);
      return { applied: true, collectionCount: 7, indexCount: 40 };
    }
  })({ body: { environment: "production" } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    applied: true,
    collectionCount: 7,
    indexCount: 40,
    code: "staging_provisioning_applied"
  });
  assert.deepEqual(Object.keys(response.body), ["applied", "collectionCount", "indexCount", "code"]);
  assert.deepEqual(counters, { readiness: 1, provisioning: 1 });
});

test("provisioning failures return only sanitized generic output", async () => {
  const secret = "mongodb-secret-" + "x".repeat(48);
  const response = responseRecorder();
  await createStagingProvisioningHandler({
    env: stagingPreviewEnvironment(),
    connection: { db: {} },
    async runReadinessGate() { return eligibleReadiness(); },
    async applyProvisioning() { throw new Error(`database rejected ${secret}`); }
  })({}, response);
  const serialized = JSON.stringify(response.body);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, unavailableOutput("staging_provisioning_failed"));
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("stack"), false);
  assert.deepEqual(Object.keys(response.body), ["applied", "collectionCount", "indexCount", "code"]);
});
