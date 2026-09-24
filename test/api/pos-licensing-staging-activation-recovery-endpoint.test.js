const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-activation-recovery-endpoint-test-only";

const {
  STAGING_ACTIVATION_RECOVERY_PATH,
  SUCCESS_FIELDS,
  createStagingActivationRecoveryHandler,
  mountStagingActivationRecoveryEndpoint,
  shouldMountStagingActivationRecoveryEndpoint
} = require("../../server/routes/internalStagingActivationRecovery");
const {
  TARGET_LICENCE_ID
} = require("../../server/services/stagingPosCommittedActivationRecoveryService");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const { POS_STANDARD_MODULE_IDS } = require("../../server/utils/posLicenceContract");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");

const RECOVERY_TOKEN = "staging-activation-recovery-token-" + "r".repeat(48);
const STAGING_KEY_ID = "automatex-pos-staging-ed25519-v1";
const INSTALLATION_ID = "6ab0af64058d4881f5e3d6da";
const PREVIOUS_ISSUE_ID = "6ab0af64058d4881f5e3d6db";
const NEW_ISSUE_ID = "6ab0af64058d4881f5e3d6dc";
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function stagingEnvironment(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_STAGING_ACTIVATION_RECOVERY_ENABLED: "true",
    POS_LICENSING_STAGING_ACTIVATION_RECOVERY_TOKEN: RECOVERY_TOKEN,
    ...overrides
  };
}

function signedLicence(overrides = {}) {
  return {
    schemaVersion: 1,
    clientId: "6ab0a078e2b1d24644d368ab",
    installationId: DEVICE_INSTALLATION_ID,
    edition: "standard",
    licenceStatus: "active",
    licenceExpiry: "2026-10-24T00:00:00.000Z",
    enabledModules: [...POS_STANDARD_MODULE_IDS],
    updateChannel: "stable",
    supportExpiry: "2026-10-24T00:00:00.000Z",
    issuedAt: "2026-09-24T10:00:00.000Z",
    offlineValidUntil: "2026-09-25T10:00:00.000Z",
    keyId: STAGING_KEY_ID,
    signature: Buffer.from("safe-public-signature").toString("base64"),
    ...overrides
  };
}

function serviceResult(overrides = {}) {
  return {
    licenceId: TARGET_LICENCE_ID,
    installationId: INSTALLATION_ID,
    previousIssueId: PREVIOUS_ISSUE_ID,
    newIssueId: NEW_ISSUE_ID,
    signedLicence: signedLicence(),
    ...overrides
  };
}

function request(authorization, body = {}) {
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

function keyProvider() {
  return {
    keyId: STAGING_KEY_ID,
    async getPrivateKey() { throw new Error("stub service must own signing"); }
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const configuredKeyProvider = keyProvider();
  const handler = createStagingActivationRecoveryHandler({
    env,
    connection: {
      name: "automatex_pos_staging",
      db: { databaseName: "automatex_pos_staging" }
    },
    validateConfig: () => ({
      environment: "staging",
      databaseName: "automatex_pos_staging",
      keyId: STAGING_KEY_ID,
      keyProvider: configuredKeyProvider
    }),
    runRecovery: async () => serviceResult(),
    logger: { warn() {} },
    ...options
  });
  await handler(request(authorization, options.body), response);
  return response;
}

test("endpoint mounts as POST only on the exact staging Preview branch", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingActivationRecoveryEndpoint(env), true);
  assert.equal(mountStagingActivationRecoveryEndpoint(router, { env }), true);
  assert.equal(router.registrations.length, 1);
  assert.deepEqual(router.registrations[0], {
    method: "POST",
    path: STAGING_ACTIVATION_RECOVERY_PATH,
    handler: router.registrations[0].handler
  });
  assert.equal(`/api${STAGING_ACTIVATION_RECOVERY_PATH}`, "/api/internal/pos-licensing-staging-activation-recovery");
});

test("every staging guard, enablement flag, and configured token are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_ACTIVATION_RECOVERY_ENABLED: "false" },
    { POS_LICENSING_STAGING_ACTIVATION_RECOVERY_TOKEN: "" },
    { POS_LICENSING_STAGING_ACTIVATION_RECOVERY_TOKEN: "too-short" },
    { POS_LICENSING_STAGING_ACTIVATION_RECOVERY_TOKEN: "invalid+" + "x".repeat(40) }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingActivationRecoveryEndpoint(env), false);
    assert.equal(mountStagingActivationRecoveryEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("disabled, main, and production requests return 404 before configuration or service access", async () => {
  let configCalls = 0;
  let serviceCalls = 0;
  for (const env of [
    stagingEnvironment({ POS_LICENSING_STAGING_ACTIVATION_RECOVERY_ENABLED: "false" }),
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

test("missing, malformed, wrong, and URL-only tokens are rejected before configuration access", async () => {
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
  const urlOnly = await invoke(stagingEnvironment(), undefined, { ...options, body: {} });
  assert.equal(urlOnly.statusCode, 401);
  assert.equal(configCalls, 0);
});

test("valid token returns the exact safe allowlist with no-store headers", async () => {
  let receivedOptions;
  const configuredKeyProvider = keyProvider();
  const response = await invoke(stagingEnvironment(), `Bearer ${RECOVERY_TOKEN}`, {
    validateConfig: () => ({
      environment: "staging",
      databaseName: "automatex_pos_staging",
      keyId: STAGING_KEY_ID,
      keyProvider: configuredKeyProvider
    }),
    runRecovery: async (options) => {
      receivedOptions = options;
      return serviceResult({
        activationCode: "posac_must-not-be-returned",
        codeHash: "sha256:v1:must-not-be-returned",
        privateKey: "must-not-be-returned"
      });
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonCalls, 1);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers.pragma, "no-cache");
  assert.deepEqual(Object.keys(response.body), SUCCESS_FIELDS);
  assert.deepEqual(response.body, serviceResult());
  assert.equal(receivedOptions.env.POS_LICENSING_MODE, "staging");
  assert.equal(receivedOptions.keyProvider, configuredKeyProvider);
  assert.equal(receivedOptions.connection.name, "automatex_pos_staging");
  const serialized = JSON.stringify(response.body);
  for (const forbidden of [RECOVERY_TOKEN, "posac_", "codeHash", "privateKey", "mongodb"] ) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("request fields cannot override the fixed target or supply activation and signing material", async () => {
  let serviceCalls = 0;
  for (const body of [
    { licenceId: TARGET_LICENCE_ID },
    { installationId: INSTALLATION_ID },
    { activationCode: "posac_forbidden" },
    { codeHash: "sha256:v1:forbidden" },
    { keyId: STAGING_KEY_ID },
    { signingKey: "forbidden" },
    []
  ]) {
    const response = await invoke(stagingEnvironment(), `Bearer ${RECOVERY_TOKEN}`, {
      body,
      runRecovery() { serviceCalls += 1; }
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { message: "Invalid request." });
  }
  assert.equal(serviceCalls, 0);
});

test("service failures and malformed success results return only generic 503 responses", async () => {
  const warnings = [];
  const failed = await invoke(stagingEnvironment(), `Bearer ${RECOVERY_TOKEN}`, {
    logger: { warn(message) { warnings.push(message); } },
    runRecovery: async () => {
      throw new Error(`token=${RECOVERY_TOKEN} codeHash=secret privateKey=secret mongodb+srv://user:pass@host/db`);
    }
  });
  const malformed = await invoke(stagingEnvironment(), `Bearer ${RECOVERY_TOKEN}`, {
    logger: { warn(message) { warnings.push(message); } },
    runRecovery: async () => serviceResult({ signedLicence: signedLicence({ codeHash: "forbidden" }) })
  });

  for (const response of [failed, malformed]) {
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "Activation recovery is unavailable." });
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers.pragma, "no-cache");
  }
  assert.deepEqual(warnings, [
    "[staging-activation-recovery] reason=service_failed",
    "[staging-activation-recovery] reason=invalid_service_result"
  ]);
  const serialized = JSON.stringify({ warnings, responses: [failed.body, malformed.body] });
  for (const forbidden of [RECOVERY_TOKEN, "codeHash", "privateKey", "mongodb+srv://", "user:pass"]) {
    assert.equal(serialized.includes(forbidden), false);
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
    assert.deepEqual(response.body, { message: "Activation recovery is unavailable." });
    assert.deepEqual(warnings, [`[staging-activation-recovery] reason=${reason}`]);
    assert.equal(JSON.stringify(warnings).includes(RECOVERY_TOKEN), false);
  }
});

test("recovery token participates in server secret rejection and log sanitization", () => {
  const sanitized = sanitizeSensitiveText(`token=${RECOVERY_TOKEN}`, {
    env: { POS_LICENSING_STAGING_ACTIVATION_RECOVERY_TOKEN: RECOVERY_TOKEN }
  });
  assert.equal(sanitized.includes(RECOVERY_TOKEN), false);
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_ACTIVATION_RECOVERY_TOKEN: RECOVERY_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
});
