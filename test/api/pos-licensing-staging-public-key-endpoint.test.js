const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-public-key-endpoint-test-only";

const {
  STAGING_PUBLIC_KEY_ID,
  STAGING_PUBLIC_KEY_PATH,
  createStagingPublicKeyHandler,
  mountStagingPublicKeyEndpoint,
  shouldMountStagingPublicKeyEndpoint
} = require("../../server/routes/internalStagingPublicKey");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");

const DIAGNOSTIC_TOKEN = "staging-public-key-diagnostic-test-token-" + "t".repeat(32);

function signingMaterial() {
  const pair = crypto.generateKeyPairSync("ed25519");
  const privateJwk = pair.privateKey.export({ format: "jwk" });
  const publicJwk = pair.publicKey.export({ format: "jwk" });
  return {
    privateJwk,
    privateJwkB64: Buffer.from(JSON.stringify(privateJwk), "utf8").toString("base64"),
    publicJwk
  };
}

function stagingEnvironment(material = signingMaterial(), overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    POS_LICENSING_ENVIRONMENT: "staging",
    POS_LICENSING_CLIENT_SCOPE: "staging-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "staging",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: "mongodb+srv://staging_user:staging_password@staging-cluster.example/automatex_pos_staging",
    POS_LICENSING_DATABASE_NAME: "automatex_pos_staging",
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: material.privateJwkB64,
    POS_LICENSING_EXPECTED_PUBLIC_JWK: JSON.stringify(material.publicJwk),
    POS_LICENSING_SIGNING_KEY_ID: STAGING_PUBLIC_KEY_ID,
    POS_LICENSING_MACHINE_API_BASE_PATH: "/api/pos-machine/v1",
    POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing-staging.example.com",
    POS_LICENSING_PRODUCTION_HOSTNAME: "licensing.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "direct",
    ALLOWED_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    POS_LICENSING_RATE_LIMIT_BACKEND: "vendor-neutral-kv",
    POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: "automatex-pos-staging-distributed-v1",
    POS_LICENSING_RATE_LIMIT_NAMESPACE: "automatex:pos-licensing:staging",
    POS_LICENSING_RATE_LIMIT_STORE_URI: "kv+tls://staging_user:staging_password@staging-rate-limit.example:443/staging",
    POS_LICENSING_RATE_LIMIT_WINDOW_MS: "60000",
    POS_LICENSING_ACTIVATION_RATE_LIMIT: "10",
    POS_LICENSING_BOOTSTRAP_RATE_LIMIT: "20",
    POS_LICENSING_RENEWAL_RATE_LIMIT: "60",
    POS_LICENSING_AUDIT_ENABLED: "true",
    POS_LICENSING_AUDIT_RETENTION: "indefinite",
    POS_LICENSING_MONGODB_TRANSACTIONS_REQUIRED: "true",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_ENABLED: "true",
    POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_TOKEN: DIAGNOSTIC_TOKEN,
    ...overrides
  };
}

function request(authorization, query = {}) {
  return {
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
    headers: {},
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function routerRecorder() {
  return {
    registrations: [],
    get(path, handler) { this.registrations.push({ path, handler }); }
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const handler = createStagingPublicKeyHandler({ env, ...options });
  await handler(request(authorization, options.query), response);
  return response;
}

test("exact staging Preview guard mounts the temporary endpoint", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingPublicKeyEndpoint(env), true);
  assert.equal(mountStagingPublicKeyEndpoint(router, { env }), true);
  assert.equal(router.registrations.length, 1);
  assert.equal(router.registrations[0].path, STAGING_PUBLIC_KEY_PATH);
  assert.equal(STAGING_PUBLIC_KEY_PATH, "/internal/pos-licensing-staging-public-key");
});

test("every staging diagnostic runtime condition is mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_ENABLED: "false" },
    { POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_TOKEN: "" }
  ]) {
    assert.equal(
      shouldMountStagingPublicKeyEndpoint(stagingEnvironment(undefined, overrides)),
      false,
      JSON.stringify(overrides)
    );
  }
});

test("correct staging branch, enabled flag, and operator token return only the authentic public JWK", async () => {
  const material = signingMaterial();
  const env = stagingEnvironment(material);
  const response = await invoke(env, `Bearer ${DIAGNOSTIC_TOKEN}`);
  const serialized = JSON.stringify(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(Object.keys(response.body), ["kty", "crv", "x", "keyId"]);
  assert.deepEqual(response.body, {
    kty: "OKP",
    crv: "Ed25519",
    x: material.publicJwk.x,
    keyId: STAGING_PUBLIC_KEY_ID
  });
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, "d"), false);
  assert.equal(serialized.includes(material.privateJwk.d), false);
  assert.equal(serialized.includes(material.privateJwkB64), false);
  assert.match(response.body.x, /^[A-Za-z0-9_-]{43}$/);
});

test("disabled flag fails closed and does not validate signing configuration", async () => {
  const env = stagingEnvironment(undefined, {
    POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_ENABLED: "false"
  });
  const router = routerRecorder();
  let validationCalls = 0;
  assert.equal(shouldMountStagingPublicKeyEndpoint(env), false);
  assert.equal(mountStagingPublicKeyEndpoint(router, { env }), false);
  assert.equal(router.registrations.length, 0);

  const response = await invoke(env, `Bearer ${DIAGNOSTIC_TOKEN}`, {
    validateConfig() { validationCalls += 1; }
  });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { message: "Not found." });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(validationCalls, 0);
});

test("wrong, missing, and URL-only tokens are unauthorized before configuration access", async () => {
  const env = stagingEnvironment();
  let validationCalls = 0;
  const options = {
    validateConfig() { validationCalls += 1; }
  };

  const wrong = await invoke(env, "Bearer incorrect-token", options);
  const missing = await invoke(env, undefined, options);
  const urlOnly = await invoke(env, undefined, { ...options, query: { token: DIAGNOSTIC_TOKEN } });
  for (const response of [wrong, missing, urlOnly]) {
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Unauthorized." });
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(validationCalls, 0);
});

test("main branch and production environment cannot mount or respond", async () => {
  const environments = [
    stagingEnvironment(undefined, { VERCEL_GIT_COMMIT_REF: "main" }),
    stagingEnvironment(undefined, {
      AUTOMATEX_ENV: "production",
      POS_LICENSING_MODE: "production",
      POS_LICENSING_ENVIRONMENT: "production",
      POS_LICENSING_CLIENT_SCOPE: "production-only",
      POS_LICENSING_SECRET_ENVIRONMENT: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main"
    })
  ];

  for (const env of environments) {
    const router = routerRecorder();
    assert.equal(shouldMountStagingPublicKeyEndpoint(env), false);
    assert.equal(mountStagingPublicKeyEndpoint(router, { env }), false);
    const response = await invoke(env, `Bearer ${DIAGNOSTIC_TOKEN}`, {
      validateConfig() { throw new Error("must not validate outside staging"); }
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { message: "Not found." });
  }
});

test("wrong key ID returns only a generic unavailable response", async () => {
  const env = stagingEnvironment(undefined, {
    POS_LICENSING_SIGNING_KEY_ID: "automatex-pos-staging-ed25519-v2"
  });
  const response = await invoke(env, `Bearer ${DIAGNOSTIC_TOKEN}`);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { message: "POS licensing public key is unavailable." });
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, "d"), false);
  assert.equal(JSON.stringify(response.body).includes("ed25519-v2"), false);
});

test("missing server-side diagnostic token prevents the endpoint from mounting", () => {
  const env = stagingEnvironment(undefined, {
    POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_TOKEN: ""
  });
  const router = routerRecorder();
  assert.equal(shouldMountStagingPublicKeyEndpoint(env), false);
  assert.equal(mountStagingPublicKeyEndpoint(router, { env }), false);
  assert.equal(router.registrations.length, 0);
});

test("diagnostic operator token is covered by runtime log sanitization", () => {
  const sanitized = sanitizeSensitiveText(`diagnostic=${DIAGNOSTIC_TOKEN}`, {
    env: {
      POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_TOKEN: DIAGNOSTIC_TOKEN
    }
  });
  assert.equal(sanitized.includes(DIAGNOSTIC_TOKEN), false);
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_TOKEN: DIAGNOSTIC_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
});
