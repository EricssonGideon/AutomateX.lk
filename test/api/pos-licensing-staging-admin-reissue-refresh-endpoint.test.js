const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-admin-reissue-refresh-endpoint-test-only";

const {
  STAGING_ADMIN_REISSUE_REFRESH_PATH,
  SUCCESS_FIELDS,
  createStagingAdminReissueRefreshHandler,
  mountStagingAdminReissueRefreshEndpoint,
  shouldMountStagingAdminReissueRefreshEndpoint
} = require("../../server/routes/internalStagingAdminReissueRefresh");
const {
  TARGET_LICENCE_ID
} = require("../../server/services/stagingPosAdminReissueRefreshService");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const { POS_STANDARD_MODULE_IDS } = require("../../server/utils/posLicenceContract");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");

const REFRESH_TOKEN = "staging-admin-reissue-refresh-token-" + "r".repeat(48);
const STAGING_KEY_ID = "automatex-pos-staging-ed25519-v1";
const INSTALLATION_ID = "6ab0af64058d4881f5e3d6da";
const PREVIOUS_ISSUE_ID = "6ab0af64058d4881f5e3d6dc";
const NEW_ISSUE_ID = "6ab0af64058d4881f5e3d6de";
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function stagingEnvironment(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_ENABLED: "true",
    POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_TOKEN: REFRESH_TOKEN,
    ...overrides
  };
}

function signedLicence() {
  return {
    schemaVersion: 1,
    clientId: "6ab0a078e2b1d24644d368ab",
    installationId: DEVICE_INSTALLATION_ID,
    edition: "standard",
    licenceStatus: "active",
    licenceExpiry: "2026-09-25T07:03:17.579Z",
    enabledModules: [...POS_STANDARD_MODULE_IDS],
    updateChannel: "stable",
    supportExpiry: "2026-09-25T07:03:17.579Z",
    issuedAt: "2026-09-24T14:15:00.000Z",
    offlineValidUntil: "2026-09-24T15:15:00.000Z",
    keyId: STAGING_KEY_ID,
    signature: Buffer.alloc(64, 3).toString("base64")
  };
}

function refreshResult(overrides = {}) {
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
    headers: {},
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
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
    async getPrivateKey() { throw new Error("stub service owns signing"); },
    async getPublicKey() { throw new Error("stub service owns verification"); }
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const configuredKeyProvider = keyProvider();
  const handler = createStagingAdminReissueRefreshHandler({
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
    runRefresh: async () => refreshResult(),
    logger: { warn() {} },
    ...options
  });
  await handler(request(authorization, options.body), response);
  return response;
}

test("endpoint mounts as POST only at the requested staging path", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingAdminReissueRefreshEndpoint(env), true);
  assert.equal(mountStagingAdminReissueRefreshEndpoint(router, { env }), true);
  assert.equal(router.registrations.length, 1);
  assert.equal(router.registrations[0].method, "POST");
  assert.equal(router.registrations[0].path, STAGING_ADMIN_REISSUE_REFRESH_PATH);
  assert.equal(
    `/api${STAGING_ADMIN_REISSUE_REFRESH_PATH}`,
    "/api/internal/pos-licensing-staging-admin-reissue-refresh"
  );
});

test("every staging guard, enablement flag, and valid configured token are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_ENABLED: "false" },
    { POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_TOKEN: "" },
    { POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_TOKEN: "too-short" },
    { POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_TOKEN: "invalid+" + "x".repeat(40) }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingAdminReissueRefreshEndpoint(env), false);
    assert.equal(mountStagingAdminReissueRefreshEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("unmounted request returns 404 before configuration or service access", async () => {
  let configCalls = 0;
  let refreshCalls = 0;
  const response = await invoke(
    stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    `Bearer ${REFRESH_TOKEN}`,
    {
      validateConfig() { configCalls += 1; },
      runRefresh() { refreshCalls += 1; }
    }
  );
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { message: "Not found." });
  assert.equal(configCalls, 0);
  assert.equal(refreshCalls, 0);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers.pragma, "no-cache");
});

test("bearer authentication failures are generic and precede configuration", async () => {
  let configCalls = 0;
  for (const authorization of [
    undefined,
    "",
    "Basic abc",
    "Bearer wrong-token",
    `Bearer ${REFRESH_TOKEN} trailing`
  ]) {
    const response = await invoke(stagingEnvironment(), authorization, {
      validateConfig() { configCalls += 1; }
    });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Unauthorized." });
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(configCalls, 0);
});

test("only an empty request body is accepted", async () => {
  let refreshCalls = 0;
  for (const body of [
    [],
    { licenceId: TARGET_LICENCE_ID },
    { installationId: INSTALLATION_ID },
    { offlineValidUntil: "2030-01-01T00:00:00.000Z" },
    { signingKey: "forbidden" },
    { activationCode: "forbidden" }
  ]) {
    const response = await invoke(stagingEnvironment(), `Bearer ${REFRESH_TOKEN}`, {
      body,
      runRefresh() { refreshCalls += 1; }
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { message: "Invalid request." });
  }
  assert.equal(refreshCalls, 0);
});

test("success response uses the exact allowlist with no-store headers and no secrets", async () => {
  let receivedOptions;
  const response = await invoke(stagingEnvironment(), `Bearer ${REFRESH_TOKEN}`, {
    runRefresh: async (options) => {
      receivedOptions = options;
      return refreshResult({
        activationCode: "posac_must-not-be-returned",
        codeHash: "sha256:v1:must-not-be-returned",
        renewalCredentialHash: "must-not-be-returned",
        mongoUri: "must-not-be-returned",
        privateKey: "must-not-be-returned",
        bearerToken: REFRESH_TOKEN
      });
    }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.body), SUCCESS_FIELDS);
  assert.deepEqual(response.body, refreshResult());
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers.pragma, "no-cache");
  assert.equal(receivedOptions.env.POS_LICENSING_MODE, "staging");
  assert.equal(receivedOptions.keyProvider.keyId, STAGING_KEY_ID);
  assert.equal(receivedOptions.connection.name, "automatex_pos_staging");

  const serialized = JSON.stringify(response.body);
  for (const forbidden of [
    REFRESH_TOKEN,
    "posac_",
    "codeHash",
    "renewalCredential",
    "mongoUri",
    "privateKey",
    "bearerToken"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("configuration, database, service, and malformed-result failures are generic 503", async () => {
  const cases = [
    { validateConfig() { throw new Error(`token=${REFRESH_TOKEN}`); } },
    { connection: { name: "automatex_pos_production" } },
    { runRefresh() { throw new Error("mongodb+srv://user:password@host/db"); } },
    { runRefresh: async () => refreshResult({ newIssueId: "invalid" }) }
  ];
  for (const options of cases) {
    const warnings = [];
    const response = await invoke(stagingEnvironment(), `Bearer ${REFRESH_TOKEN}`, {
      ...options,
      logger: { warn(message) { warnings.push(message); } }
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "Admin reissue refresh is unavailable." });
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /^\[staging-admin-reissue-refresh\] reason=(config_invalid|database_mismatch|service_failed|invalid_service_result)$/);
    const serialized = JSON.stringify({ body: response.body, warnings });
    assert.equal(serialized.includes(REFRESH_TOKEN), false);
    assert.equal(serialized.includes("mongodb+srv"), false);
  }
});

test("refresh token is rejected from request data and sanitized from logs", () => {
  const sanitized = sanitizeSensitiveText(`token=${REFRESH_TOKEN}`, {
    env: { POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_TOKEN: REFRESH_TOKEN }
  });
  assert.equal(sanitized.includes(REFRESH_TOKEN), false);
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_ADMIN_REISSUE_REFRESH_TOKEN: REFRESH_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
});
