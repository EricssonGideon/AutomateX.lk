const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-renewal-recovery-endpoint-test-only";

const {
  STAGING_RENEWAL_RECOVERY_PATH,
  SUCCESS_FIELDS,
  createStagingRenewalRecoveryHandler,
  mountStagingRenewalRecoveryEndpoint,
  shouldMountStagingRenewalRecoveryEndpoint
} = require("../../server/routes/internalStagingRenewalRecovery");
const {
  TARGET_LICENCE_ID
} = require("../../server/services/stagingPosCommittedActivationRecoveryService");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const {
  digestRenewalCredential
} = require("../../server/utils/posRenewalCredentialToken");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");

const RECOVERY_TOKEN = "staging-renewal-recovery-token-" + "r".repeat(48);
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const RAW_CREDENTIAL = `posrc_${"b".repeat(64)}`;
const CREDENTIAL_DIGEST = digestRenewalCredential(RAW_CREDENTIAL);

function stagingEnvironment(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_STAGING_RENEWAL_RECOVERY_ENABLED: "true",
    POS_LICENSING_STAGING_RENEWAL_RECOVERY_TOKEN: RECOVERY_TOKEN,
    ...overrides
  };
}

function serviceResult(overrides = {}) {
  return {
    schemaVersion: 1,
    status: "bound",
    installationId: DEVICE_INSTALLATION_ID,
    credentialVersion: 1,
    ...overrides
  };
}

function request(authorization, body) {
  return {
    body,
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
    post(path, handler) { this.registrations.push({ method: "POST", path, handler }); },
    get() { throw new Error("GET route must not be registered"); },
    put() { throw new Error("PUT route must not be registered"); },
    patch() { throw new Error("PATCH route must not be registered"); },
    delete() { throw new Error("DELETE route must not be registered"); }
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const handler = createStagingRenewalRecoveryHandler({
    env,
    connection: {
      name: "automatex_pos_staging",
      db: { databaseName: "automatex_pos_staging" }
    },
    validateConfig: () => ({
      environment: "staging",
      databaseName: "automatex_pos_staging"
    }),
    runRecovery: async () => serviceResult(),
    logger: { warn() {} },
    ...options
  });
  const body = Object.prototype.hasOwnProperty.call(options, "body")
    ? options.body
    : { renewalCredentialDigest: CREDENTIAL_DIGEST };
  await handler(request(authorization, body), response);
  return response;
}

test("endpoint mounts as POST only on the exact staging Preview branch", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingRenewalRecoveryEndpoint(env), true);
  assert.equal(mountStagingRenewalRecoveryEndpoint(router, { env }), true);
  assert.equal(router.registrations.length, 1);
  assert.deepEqual(router.registrations[0], {
    method: "POST",
    path: STAGING_RENEWAL_RECOVERY_PATH,
    handler: router.registrations[0].handler
  });
  assert.equal(
    `/api${STAGING_RENEWAL_RECOVERY_PATH}`,
    "/api/internal/pos-licensing-staging-renewal-recovery"
  );
});

test("every staging guard, enablement flag, and configured token are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_RENEWAL_RECOVERY_ENABLED: "false" },
    { POS_LICENSING_STAGING_RENEWAL_RECOVERY_TOKEN: "" },
    { POS_LICENSING_STAGING_RENEWAL_RECOVERY_TOKEN: "too-short" },
    { POS_LICENSING_STAGING_RENEWAL_RECOVERY_TOKEN: "invalid+" + "x".repeat(40) }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingRenewalRecoveryEndpoint(env), false);
    assert.equal(mountStagingRenewalRecoveryEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("disabled, main, and production requests return generic 404 before service access", async () => {
  let configCalls = 0;
  let serviceCalls = 0;
  for (const env of [
    stagingEnvironment({ POS_LICENSING_STAGING_RENEWAL_RECOVERY_ENABLED: "false" }),
    stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingEnvironment({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      AUTOMATEX_ENV: "production",
      POS_LICENSING_MODE: "production"
    })
  ]) {
    const response = await invoke(env, `Bearer ${RECOVERY_TOKEN}`, {
      validateConfig() { configCalls += 1; },
      runRecovery() { serviceCalls += 1; }
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { message: "Not found." });
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers.pragma, "no-cache");
  }
  assert.equal(configCalls, 0);
  assert.equal(serviceCalls, 0);
});

test("missing, malformed, and wrong bearer tokens are rejected before configuration", async () => {
  let configCalls = 0;
  const options = {
    validateConfig() { configCalls += 1; throw new Error("must not run"); }
  };
  for (const authorization of [
    undefined,
    "",
    "Basic abc",
    "Bearer wrong-token",
    `Bearer ${RECOVERY_TOKEN} trailing`
  ]) {
    const response = await invoke(stagingEnvironment(), authorization, options);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Unauthorized." });
  }
  assert.equal(configCalls, 0);
});

test("valid request passes only the normalized digest and returns the exact safe allowlist", async () => {
  let receivedInput;
  let receivedOptions;
  const response = await invoke(stagingEnvironment(), `Bearer ${RECOVERY_TOKEN}`, {
    body: { renewalCredentialDigest: CREDENTIAL_DIGEST.toUpperCase() },
    runRecovery: async (input, options) => {
      receivedInput = input;
      receivedOptions = options;
      return serviceResult({
        licenceId: TARGET_LICENCE_ID,
        activationCode: "posac_must-not-be-returned",
        codeHash: "sha256:v1:must-not-be-returned",
        renewalCredentialHash: CREDENTIAL_DIGEST,
        token: RECOVERY_TOKEN
      });
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonCalls, 1);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers.pragma, "no-cache");
  assert.deepEqual(Object.keys(response.body), SUCCESS_FIELDS);
  assert.deepEqual(response.body, serviceResult());
  assert.deepEqual(receivedInput, { renewalCredentialDigest: CREDENTIAL_DIGEST });
  assert.equal(receivedOptions.env.POS_LICENSING_MODE, "staging");
  assert.equal(receivedOptions.connection.name, "automatex_pos_staging");
  const exposed = JSON.stringify(response.body);
  for (const forbidden of [
    RECOVERY_TOKEN,
    RAW_CREDENTIAL,
    CREDENTIAL_DIGEST,
    "activationCode",
    "codeHash",
    "renewalCredentialHash",
    "licenceId"
  ]) {
    assert.equal(exposed.includes(forbidden), false);
  }
});

test("malformed input and target or protected-field overrides return generic 400", async () => {
  let configCalls = 0;
  let serviceCalls = 0;
  for (const body of [
    undefined,
    null,
    {},
    [],
    { renewalCredentialDigest: "invalid" },
    { renewalCredentialDigest: CREDENTIAL_DIGEST, licenceId: TARGET_LICENCE_ID },
    { renewalCredentialDigest: CREDENTIAL_DIGEST, installationId: DEVICE_INSTALLATION_ID },
    { renewalCredential: RAW_CREDENTIAL },
    { renewalCredentialHash: CREDENTIAL_DIGEST },
    { renewalCredentialDigest: CREDENTIAL_DIGEST, codeHash: "forbidden" },
    { renewalCredentialDigest: CREDENTIAL_DIGEST, privateKey: "forbidden" }
  ]) {
    const response = await invoke(stagingEnvironment(), `Bearer ${RECOVERY_TOKEN}`, {
      body,
      validateConfig() { configCalls += 1; },
      runRecovery() { serviceCalls += 1; }
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { message: "Invalid request." });
  }
  assert.equal(configCalls, 0);
  assert.equal(serviceCalls, 0);
});

test("service and malformed-result failures return only generic 503 with fixed logs", async () => {
  const warnings = [];
  const failed = await invoke(stagingEnvironment(), `Bearer ${RECOVERY_TOKEN}`, {
    logger: { warn(message) { warnings.push(message); } },
    runRecovery: async () => {
      throw new Error(`token=${RECOVERY_TOKEN} digest=${CREDENTIAL_DIGEST} mongodb+srv://user:pass@host/db`);
    }
  });
  const malformed = await invoke(stagingEnvironment(), `Bearer ${RECOVERY_TOKEN}`, {
    logger: { warn(message) { warnings.push(message); } },
    runRecovery: async () => serviceResult({ credentialVersion: 2 })
  });

  for (const response of [failed, malformed]) {
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "Renewal recovery is unavailable." });
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers.pragma, "no-cache");
  }
  assert.deepEqual(warnings, [
    "[staging-renewal-recovery] reason=service_failed",
    "[staging-renewal-recovery] reason=invalid_service_result"
  ]);
  const exposed = JSON.stringify({ warnings, responses: [failed.body, malformed.body] });
  for (const forbidden of [RECOVERY_TOKEN, CREDENTIAL_DIGEST, "mongodb+srv://", "user:pass"]) {
    assert.equal(exposed.includes(forbidden), false);
  }
});

test("configuration, connection, and database failures use fixed safe reason logs", async () => {
  const cases = [
    {
      reason: "config_invalid",
      options: { validateConfig() { throw new Error(`token=${RECOVERY_TOKEN}`); } }
    },
    {
      reason: "database_connection_failed",
      options: {
        connection: null,
        connectionProvider() { throw new Error("mongodb+srv://user:password@host/db"); }
      }
    },
    {
      reason: "database_mismatch",
      options: { connection: { name: "automatex_pos_production" } }
    }
  ];
  for (const { reason, options } of cases) {
    const warnings = [];
    const response = await invoke(stagingEnvironment(), `Bearer ${RECOVERY_TOKEN}`, {
      ...options,
      logger: { warn(message) { warnings.push(message); } }
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "Renewal recovery is unavailable." });
    assert.deepEqual(warnings, [`[staging-renewal-recovery] reason=${reason}`]);
    assert.equal(JSON.stringify(warnings).includes(RECOVERY_TOKEN), false);
  }
});

test("renewal recovery token participates in server secret rejection and log sanitization", () => {
  const sanitized = sanitizeSensitiveText(`token=${RECOVERY_TOKEN}`, {
    env: { POS_LICENSING_STAGING_RENEWAL_RECOVERY_TOKEN: RECOVERY_TOKEN }
  });
  assert.equal(sanitized.includes(RECOVERY_TOKEN), false);
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_RENEWAL_RECOVERY_TOKEN: RECOVERY_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
});
