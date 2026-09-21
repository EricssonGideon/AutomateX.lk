const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-test-licence-apply-test-only";

const {
  FIXED_STAGING_ADMIN_ID,
  FIXED_TEST_MARKER,
  STAGING_TEST_LICENCE_APPLY_PATH,
  SUCCESS_FIELDS,
  createStagingTestLicenceApplyHandler,
  mountStagingTestLicenceApplyEndpoint,
  shouldMountStagingTestLicenceApplyEndpoint
} = require("../../server/routes/internalStagingTestLicenceApply");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");
const {
  stagingLicenceDocumentId
} = require("../../scripts/createPosLicensingStagingTestLicence");

const OPERATOR_TOKEN = "staging-test-licence-apply-operator-" + "t".repeat(40);
const LICENCE_ID = stagingLicenceDocumentId(FIXED_TEST_MARKER);
const ACTIVATION_CODE_ID = "507f1f77bcf86cd799439098";
const ACTIVATION_CODE = "posac_" + "a".repeat(32);
const ACTIVATION_EXPIRY = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const LICENCE_EXPIRY = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function stagingEnvironment(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_STAGING_TEST_LICENCE_APPLY_ENABLED: "true",
    POS_LICENSING_STAGING_TEST_LICENCE_APPLY_TOKEN: OPERATOR_TOKEN,
    ...overrides
  };
}

function validBody(overrides = {}) {
  return {
    adminId: FIXED_STAGING_ADMIN_ID,
    testMarker: FIXED_TEST_MARKER,
    ...overrides
  };
}

function request(authorization, body = validBody(), query = {}) {
  return {
    body,
    query,
    get(name) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    }
  };
}

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    jsonCalls: 0,
    headers: {},
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.jsonCalls += 1; this.body = body; return this; }
  };
}

function routerRecorder() {
  return {
    registrations: [],
    post(path, handler) { this.registrations.push({ method: "POST", path, handler }); }
  };
}

function successResult() {
  return {
    ok: true,
    mode: "apply",
    writesPerformed: true,
    marker: FIXED_TEST_MARKER,
    licenceId: LICENCE_ID,
    licenceExpiry: LICENCE_EXPIRY,
    licenceStatus: "active",
    activationCode: ACTIVATION_CODE,
    activationCodeId: ACTIVATION_CODE_ID,
    activationCodeExpiresAt: ACTIVATION_EXPIRY,
    maxInstallations: 1
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const handler = createStagingTestLicenceApplyHandler({
    env,
    connection: options.connection || {
      name: "automatex_pos_staging",
      db: { databaseName: "automatex_pos_staging" }
    },
    runOperator: options.runOperator || (async () => successResult()),
    operatorOptions: options.operatorOptions,
    connectionProvider: options.connectionProvider
  });
  await handler(request(authorization, options.body, options.query), response);
  return response;
}

test("exact staging Preview guards mount only the POST apply endpoint", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingTestLicenceApplyEndpoint(env), true);
  assert.equal(mountStagingTestLicenceApplyEndpoint(router, { env }), true);
  assert.deepEqual(router.registrations.map(({ method, path }) => ({ method, path })), [{
    method: "POST",
    path: STAGING_TEST_LICENCE_APPLY_PATH
  }]);
  assert.equal(STAGING_TEST_LICENCE_APPLY_PATH, "/internal/pos-licensing-staging-test-licence-apply");
});

test("every staging guard, enable flag, and configured token are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_TEST_LICENCE_APPLY_ENABLED: "false" },
    { POS_LICENSING_STAGING_TEST_LICENCE_APPLY_TOKEN: "" },
    { POS_LICENSING_STAGING_TEST_LICENCE_APPLY_TOKEN: "too-short" }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingTestLicenceApplyEndpoint(env), false);
    assert.equal(mountStagingTestLicenceApplyEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("disabled, main, and production requests fail before operator access", async () => {
  let calls = 0;
  for (const env of [
    stagingEnvironment({ POS_LICENSING_STAGING_TEST_LICENCE_APPLY_ENABLED: "false" }),
    stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingEnvironment({ VERCEL_ENV: "production", AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" })
  ]) {
    const response = await invoke(env, `Bearer ${OPERATOR_TOKEN}`, {
      runOperator: async () => { calls += 1; }
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { message: "Not found." });
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(calls, 0);
});

test("missing, wrong, and URL-only tokens are rejected before operator access", async () => {
  let calls = 0;
  const runOperator = async () => { calls += 1; };
  const responses = [
    await invoke(stagingEnvironment(), undefined, { runOperator }),
    await invoke(stagingEnvironment(), "Bearer wrong-token", { runOperator }),
    await invoke(stagingEnvironment(), undefined, { runOperator, query: { token: OPERATOR_TOKEN } })
  ];
  responses.forEach((response) => {
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Unauthorized." });
  });
  assert.equal(calls, 0);
});

test("fixed request identity is required and missing or extra fields are rejected", async () => {
  for (const body of [
    { adminId: FIXED_STAGING_ADMIN_ID },
    validBody({ adminId: "not-an-object-id" }),
    validBody({ adminId: "64b64c88c4a2f7781a123456" }),
    validBody({ testMarker: "automatex-pos-staging-tauri-e2e-20260922" }),
    { ...validBody(), apply: true },
    { ...validBody(), token: OPERATOR_TOKEN }
  ]) {
    const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, { body });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { message: "Invalid request." });
  }
});

test("route invokes the existing operator with immutable apply input", async () => {
  let calls = 0;
  const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    runOperator: async (options) => {
      calls += 1;
      assert.deepEqual(options.input, {
        apply: true,
        adminId: FIXED_STAGING_ADMIN_ID,
        testMarker: FIXED_TEST_MARKER
      });
      assert.equal(Object.isFrozen(options.input), true);
      assert.equal(typeof options.inspectTransactions, "function");
      return successResult();
    }
  });
  assert.equal(calls, 1);
  assert.equal(response.statusCode, 201);
});

test("successful response is returned exactly once after operator completion and uses only the allowlist", async () => {
  let finishOperator;
  const operatorGate = new Promise((resolve) => { finishOperator = resolve; });
  const response = responseRecorder();
  const handler = createStagingTestLicenceApplyHandler({
    env: stagingEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    runOperator: async () => {
      await operatorGate;
      return successResult();
    }
  });
  const pending = handler(request(`Bearer ${OPERATOR_TOKEN}`), response);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(response.jsonCalls, 0);
  finishOperator();
  await pending;

  assert.equal(response.statusCode, 201);
  assert.equal(response.jsonCalls, 1);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(Object.keys(response.body), SUCCESS_FIELDS);
  assert.deepEqual(response.body, {
    created: true,
    licenceId: LICENCE_ID,
    testMarker: FIXED_TEST_MARKER,
    licenceStatus: "active",
    activationCode: ACTIVATION_CODE,
    activationCodeExpiresAt: ACTIVATION_EXPIRY,
    maxInstallations: 1
  });
  assert.equal("activationCodeId" in response.body, false);
  assert.equal("licenceExpiry" in response.body, false);
  const serialized = JSON.stringify(response.body);
  for (const forbidden of [OPERATOR_TOKEN, "codeHash", "password", "jwt", "mongodb+srv://", "privateKey"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});

test("duplicate marker rejects the retry without returning plaintext", async () => {
  const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    runOperator: async () => {
      const error = new Error("internal duplicate detail");
      error.code = "test_marker_already_exists";
      throw error;
    }
  });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, { code: "marker_conflict" });
  assert.equal(JSON.stringify(response.body).includes(ACTIVATION_CODE), false);
  assert.equal(JSON.stringify(response.body).includes("internal duplicate detail"), false);
});

test("validation and malformed operator output fail closed without leakage", async () => {
  for (const runOperator of [
    async () => { throw new Error("database-uri-and-secret-detail"); },
    async () => ({ ...successResult(), licenceStatus: "draft" }),
    async () => ({ ...successResult(), activationCode: "not-an-activation-code" })
  ]) {
    const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, { runOperator });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { code: "apply_unavailable" });
    assert.equal(JSON.stringify(response.body).includes("secret"), false);
  }
});

test("apply token is rejected from request fields and redacted from runtime logs", () => {
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_TEST_LICENCE_APPLY_TOKEN: OPERATOR_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
  const sanitized = sanitizeSensitiveText(`apply=${OPERATOR_TOKEN}`, {
    env: { POS_LICENSING_STAGING_TEST_LICENCE_APPLY_TOKEN: OPERATOR_TOKEN }
  });
  assert.equal(sanitized.includes(OPERATOR_TOKEN), false);
});
