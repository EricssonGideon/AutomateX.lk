const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-readiness-endpoint-test-only";

const {
  failedStagingReadinessOutput,
  projectSafeStagingReadiness
} = require("../../scripts/checkPosLicensingStagingReadiness");
const {
  STAGING_READINESS_PATH,
  createStagingReadinessHandler,
  mountStagingReadinessEndpoint,
  shouldMountStagingReadinessEndpoint
} = require("../../server/routes/internalStagingReadiness");

function previewEnvironment(overrides = {}) {
  return {
    POS_LICENSING_MODE: "staging",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
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

function readyOutput() {
  return projectSafeStagingReadiness({
    environment: "staging",
    ready: true,
    technicalReadinessPassed: true,
    enablementRequested: true,
    eligibleForRouteMount: true,
    eligibleForProductionRouteMount: false,
    active: false,
    decisionCode: "staging_route_mount_eligible",
    checks: [{ name: "environment", passed: true, code: "staging_environment_valid" }]
  });
}

test("temporary endpoint guard requires staging mode, Vercel Preview, and the staging branch", () => {
  assert.equal(shouldMountStagingReadinessEndpoint(previewEnvironment()), true);
  for (const overrides of [
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_MODE: "disabled" },
    { VERCEL_ENV: "production" },
    { VERCEL_ENV: "development" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_GIT_COMMIT_REF: "another-preview" },
    { POS_LICENSING_MODE: "" },
    { VERCEL_ENV: "" },
    { VERCEL_GIT_COMMIT_REF: "" }
  ]) {
    assert.equal(shouldMountStagingReadinessEndpoint(previewEnvironment(overrides)), false, JSON.stringify(overrides));
  }
});

test("endpoint is registered only when the complete staging-preview guard passes", () => {
  const registrations = [];
  const router = {
    get(path, handler) { registrations.push({ path, handler }); }
  };
  assert.equal(mountStagingReadinessEndpoint(router, { env: previewEnvironment({ VERCEL_ENV: "production" }) }), false);
  assert.equal(registrations.length, 0);

  assert.equal(mountStagingReadinessEndpoint(router, {
    env: previewEnvironment(),
    connection: {},
    runReadinessCheck: async () => readyOutput()
  }), true);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].path, STAGING_READINESS_PATH);
  assert.equal(registrations[0].path, "/internal/pos-licensing-staging-readiness");
});

test("handler returns only sanitized readiness output with status derived from ready", async () => {
  const env = previewEnvironment();
  const connection = Object.freeze({ name: "existing-preview-connection" });
  const expected = readyOutput();
  let receivedOptions;
  const handler = createStagingReadinessHandler({
    env,
    connection,
    async runReadinessCheck(options) {
      receivedOptions = options;
      return expected;
    }
  });
  const response = responseRecorder();
  await handler({}, response);

  assert.equal(response.statusCode, 200);
  assert.strictEqual(response.body, expected);
  assert.deepEqual(receivedOptions, { env, connection });
  assert.deepEqual(Object.keys(response.body), [
    "environment",
    "ready",
    "technicalReadinessPassed",
    "enablementRequested",
    "eligibleForRouteMount",
    "active",
    "decisionCode",
    "checks"
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, "eligibleForProductionRouteMount"), false);
});

test("not-ready and thrown checks return sanitized 503 responses", async () => {
  const unavailable = failedStagingReadinessOutput("staging_readiness_failed");
  const unavailableResponse = responseRecorder();
  await createStagingReadinessHandler({
    env: previewEnvironment(),
    connection: {},
    runReadinessCheck: async () => unavailable
  })({}, unavailableResponse);
  assert.equal(unavailableResponse.statusCode, 503);
  assert.strictEqual(unavailableResponse.body, unavailable);

  const secret = "upstash-token-" + "s".repeat(48);
  const failureResponse = responseRecorder();
  await createStagingReadinessHandler({
    env: previewEnvironment(),
    connection: {},
    runReadinessCheck: async () => { throw new Error(`backend failed with ${secret}`); }
  })({}, failureResponse);
  const serialized = JSON.stringify(failureResponse.body);
  assert.equal(failureResponse.statusCode, 503);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("stack"), false);
  assert.deepEqual(failureResponse.body, failedStagingReadinessOutput());
});
