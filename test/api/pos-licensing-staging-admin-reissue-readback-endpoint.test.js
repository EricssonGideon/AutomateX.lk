const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-admin-reissue-readback-endpoint-test-only";

const {
  STAGING_ADMIN_REISSUE_READBACK_PATH,
  SUCCESS_FIELDS,
  createStagingAdminReissueReadbackHandler,
  mountStagingAdminReissueReadbackEndpoint,
  shouldMountStagingAdminReissueReadbackEndpoint
} = require("../../server/routes/internalStagingAdminReissueReadback");
const {
  TARGET_LICENCE_ID
} = require("../../server/services/stagingPosAdminReissueReadbackService");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const { POS_STANDARD_MODULE_IDS } = require("../../server/utils/posLicenceContract");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");

const READBACK_TOKEN = "staging-admin-reissue-readback-token-" + "r".repeat(48);
const STAGING_KEY_ID = "automatex-pos-staging-ed25519-v1";
const INSTALLATION_RECORD_ID = "6ab0af64058d4881f5e3d6da";
const ISSUE_ID = "6ab0af64058d4881f5e3d6dc";
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function stagingEnvironment(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_STAGING_ADMIN_REISSUE_READBACK_ENABLED: "true",
    POS_LICENSING_STAGING_ADMIN_REISSUE_READBACK_TOKEN: READBACK_TOKEN,
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
    licenceExpiry: "2026-10-24T00:00:00.000Z",
    enabledModules: [...POS_STANDARD_MODULE_IDS],
    updateChannel: "stable",
    supportExpiry: "2026-10-24T00:00:00.000Z",
    issuedAt: "2026-09-24T10:00:00.000Z",
    offlineValidUntil: "2026-09-25T10:00:00.000Z",
    keyId: STAGING_KEY_ID,
    signature: Buffer.alloc(64, 3).toString("base64")
  };
}

function readbackResult(overrides = {}) {
  return {
    licenceId: TARGET_LICENCE_ID,
    installationRecordId: INSTALLATION_RECORD_ID,
    issueId: ISSUE_ID,
    signedLicence: signedLicence(),
    ...overrides
  };
}

function request(authorization) {
  return {
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
    get(path, handler) { this.registrations.push({ method: "GET", path, handler }); },
    post() { throw new Error("POST route must not be registered"); },
    put() { throw new Error("PUT route must not be registered"); },
    patch() { throw new Error("PATCH route must not be registered"); },
    delete() { throw new Error("DELETE route must not be registered"); }
  };
}

function keyProvider() {
  return {
    keyId: STAGING_KEY_ID,
    async getPublicKey() { throw new Error("stub readback service owns verification"); }
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const configuredKeyProvider = keyProvider();
  const handler = createStagingAdminReissueReadbackHandler({
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
    runReadback: async () => readbackResult(),
    logger: { warn() {} },
    ...options
  });
  await handler(request(authorization), response);
  return response;
}

test("endpoint mounts as GET only at the requested staging path", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingAdminReissueReadbackEndpoint(env), true);
  assert.equal(mountStagingAdminReissueReadbackEndpoint(router, { env }), true);
  assert.equal(router.registrations.length, 1);
  assert.equal(router.registrations[0].method, "GET");
  assert.equal(router.registrations[0].path, STAGING_ADMIN_REISSUE_READBACK_PATH);
  assert.equal(
    `/api${STAGING_ADMIN_REISSUE_READBACK_PATH}`,
    "/api/internal/pos-licensing-staging-admin-reissue-readback"
  );
});

test("every staging guard, enablement flag, and valid configured token are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_ADMIN_REISSUE_READBACK_ENABLED: "false" },
    { POS_LICENSING_STAGING_ADMIN_REISSUE_READBACK_TOKEN: "" },
    { POS_LICENSING_STAGING_ADMIN_REISSUE_READBACK_TOKEN: "too-short" },
    { POS_LICENSING_STAGING_ADMIN_REISSUE_READBACK_TOKEN: "invalid+" + "x".repeat(40) }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingAdminReissueReadbackEndpoint(env), false);
    assert.equal(mountStagingAdminReissueReadbackEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("unmounted requests return 404 before config or database access", async () => {
  let configCalls = 0;
  let readbackCalls = 0;
  const response = await invoke(
    stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    `Bearer ${READBACK_TOKEN}`,
    {
      validateConfig() { configCalls += 1; },
      runReadback() { readbackCalls += 1; }
    }
  );
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { message: "Not found." });
  assert.equal(configCalls, 0);
  assert.equal(readbackCalls, 0);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers.pragma, "no-cache");
});

test("bearer authentication failures are generic and precede config access", async () => {
  let configCalls = 0;
  for (const authorization of [
    undefined,
    "",
    "Basic abc",
    "Bearer wrong-token",
    `Bearer ${READBACK_TOKEN} trailing`
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

test("success response uses the exact allowlist and no-store headers", async () => {
  let receivedOptions;
  const response = await invoke(stagingEnvironment(), `Bearer ${READBACK_TOKEN}`, {
    runReadback: async (options) => {
      receivedOptions = options;
      return readbackResult({
        activationCode: "posac_must-not-be-returned",
        codeHash: "sha256:v1:must-not-be-returned",
        renewalCredentialHash: "must-not-be-returned",
        mongoUri: "must-not-be-returned",
        privateKey: "must-not-be-returned",
        bearerToken: READBACK_TOKEN
      });
    }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.body), SUCCESS_FIELDS);
  assert.deepEqual(response.body, readbackResult());
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers.pragma, "no-cache");
  assert.equal(receivedOptions.env.POS_LICENSING_MODE, "staging");
  assert.equal(receivedOptions.keyProvider.keyId, STAGING_KEY_ID);

  const serialized = JSON.stringify(response.body);
  for (const forbidden of [
    READBACK_TOKEN,
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

test("validation, configuration, and database failures return only generic 503 responses", async () => {
  const cases = [
    { validateConfig() { throw new Error(`token=${READBACK_TOKEN}`); } },
    { connection: { name: "automatex_pos_production" } },
    { runReadback() { throw new Error("mongodb+srv://user:password@host/db"); } },
    { runReadback: async () => readbackResult({ issueId: "invalid" }) }
  ];
  for (const options of cases) {
    const response = await invoke(stagingEnvironment(), `Bearer ${READBACK_TOKEN}`, options);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "Admin reissue readback is unavailable." });
    assert.equal(response.headers["cache-control"], "no-store");
    const serialized = JSON.stringify(response.body);
    assert.equal(serialized.includes(READBACK_TOKEN), false);
    assert.equal(serialized.includes("mongodb"), false);
  }
});

test("readback token is rejected from request data and sanitized from logs", () => {
  const sanitized = sanitizeSensitiveText(`token=${READBACK_TOKEN}`, {
    env: { POS_LICENSING_STAGING_ADMIN_REISSUE_READBACK_TOKEN: READBACK_TOKEN }
  });
  assert.equal(sanitized.includes(READBACK_TOKEN), false);
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_ADMIN_REISSUE_READBACK_TOKEN: READBACK_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
});
