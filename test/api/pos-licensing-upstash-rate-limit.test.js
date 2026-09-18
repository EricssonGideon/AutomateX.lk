const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-upstash-rate-limit-test-only";

const {
  APPROVED_PRODUCTION_KEY_ID,
  validateProductionLicensingConfig,
  validateStagingLicensingConfig
} = require("../../server/config/posLicensingProduction");
const {
  createMachineRateLimitOptions,
  inspectMachineRateLimitReadiness
} = require("../../server/licensing/posLicensingRateLimit");
const {
  runProductionLicensingReadinessGate,
  runStagingLicensingReadinessGate
} = require("../../server/licensing/posLicensingReadinessGate");
const {
  UPSTASH_REST_BACKEND,
  createUpstashRateLimitStore,
  createUpstashRateLimitStoreFactory,
  loadUpstashRestCredentials,
  resolveConfiguredRateLimitStoreFactory
} = require("../../server/licensing/upstashRateLimitStore");
const {
  SECRET_CATEGORIES,
  scanTextForPosSecrets,
  summarizeSecretScan
} = require("../../server/security/posSecretScanner");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");

function signingMaterial() {
  const pair = crypto.generateKeyPairSync("ed25519");
  return {
    privateJwkB64: Buffer.from(JSON.stringify(pair.privateKey.export({ format: "jwk" })), "utf8").toString("base64"),
    publicJwk: JSON.stringify(pair.publicKey.export({ format: "jwk" }))
  };
}

function environment(name, overrides = {}) {
  const production = name === "production";
  const signing = signingMaterial();
  const databaseName = `automatex_pos_${name}`;
  return {
    AUTOMATEX_ENV: name,
    NODE_ENV: "production",
    POS_LICENSING_MODE: name,
    POS_LICENSING_ENABLED: "false",
    POS_LICENSING_ENVIRONMENT: name,
    POS_LICENSING_CLIENT_SCOPE: `${name}-only`,
    POS_LICENSING_SECRET_ENVIRONMENT: name,
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: `mongodb+srv://${name}_user:${name}_password@${name}-cluster.example/${databaseName}`,
    POS_LICENSING_DATABASE_NAME: databaseName,
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: signing.privateJwkB64,
    POS_LICENSING_EXPECTED_PUBLIC_JWK: signing.publicJwk,
    POS_LICENSING_SIGNING_KEY_ID: production ? APPROVED_PRODUCTION_KEY_ID : "automatex-pos-staging-ed25519-v1",
    POS_LICENSING_MACHINE_API_BASE_PATH: "/api/pos-machine/v1",
    POS_LICENSING_MACHINE_API_ORIGIN: production ? "https://licensing.example.com" : "https://licensing-staging.example.com",
    POS_LICENSING_PRODUCTION_HOSTNAME: "licensing.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "direct",
    ALLOWED_ORIGINS: production ? "https://company.example.com" : "https://company-staging.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    POS_LICENSING_RATE_LIMIT_BACKEND: UPSTASH_REST_BACKEND,
    POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: `automatex-pos-${name}-upstash-v1`,
    POS_LICENSING_RATE_LIMIT_NAMESPACE: `automatex:pos-licensing:${name}`,
    POS_LICENSING_RATE_LIMIT_WINDOW_MS: "60000",
    POS_LICENSING_ACTIVATION_RATE_LIMIT: "10",
    POS_LICENSING_BOOTSTRAP_RATE_LIMIT: "20",
    POS_LICENSING_RENEWAL_RATE_LIMIT: "60",
    UPSTASH_REDIS_REST_URL: `https://${name}-rate-limit.example.invalid`,
    UPSTASH_REDIS_REST_TOKEN: `${name}-token-${"x".repeat(48)}`,
    POS_LICENSING_AUDIT_ENABLED: "true",
    POS_LICENSING_AUDIT_RETENTION: "indefinite",
    POS_LICENSING_MONGODB_TRANSACTIONS_REQUIRED: "true",
    ...overrides
  };
}

function contract(name = "staging", operation = "activation") {
  return {
    backend: UPSTASH_REST_BACKEND,
    distributed: true,
    environment: name,
    storeIdentity: `automatex-pos-${name}-upstash-v1`,
    namespace: `automatex:pos-licensing:${name}:${operation}`,
    windowMs: 60000,
    limit: 10
  };
}

function okResponse(result) {
  return {
    ok: true,
    async json() { return { result }; }
  };
}

function successfulFetch(calls = []) {
  return async (url, options) => {
    const command = JSON.parse(options.body);
    calls.push({ url, options, command });
    if (command[0] === "PING") return okResponse("PONG");
    if (command[0] === "DEL") return okResponse(1);
    if (command[0] === "EVAL" && command[1].includes("INCR")) return okResponse([1, 60000]);
    return okResponse(0);
  };
}

const transactionsReady = Object.freeze({
  supported: true,
  verified: true,
  logicalSessions: true,
  transactionalTopology: true,
  probePassed: true,
  reason: "transaction_probe_passed"
});

test("valid simulated Upstash adapter implements the distributed store contract over REST", async () => {
  const env = environment("staging");
  const calls = [];
  const store = createUpstashRateLimitStore(contract(), {
    env,
    fetchImpl: successfulFetch(calls)
  });

  assert.equal(store.distributed, true);
  assert.equal(store.localKeys, false);
  assert.equal(store.backend, UPSTASH_REST_BACKEND);
  for (const method of ["increment", "decrement", "resetKey", "healthCheck"]) {
    assert.equal(typeof store[method], "function", method);
  }

  const rawKey = "activation:raw-value-that-must-not-be-stored";
  const incremented = await store.increment(rawKey);
  await store.decrement(rawKey);
  await store.resetKey(rawKey);
  assert.deepEqual(await store.healthCheck(), { healthy: true });
  assert.equal(incremented.totalHits, 1);
  assert.equal(incremented.resetTime instanceof Date, true);
  assert.equal(calls.every(({ url }) => url === env.UPSTASH_REDIS_REST_URL), true);
  assert.equal(calls.every(({ options }) => options.method === "POST"), true);
  assert.equal(calls.every(({ options }) => options.headers.authorization === `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`), true);
  assert.equal(JSON.stringify(calls.map(({ command }) => command)).includes(rawKey), false);
  assert.equal(calls.some(({ command }) => command[0] === "PING"), true);
});

test("Upstash credentials fail closed when missing or malformed", () => {
  const env = environment("staging");
  assert.throws(
    () => loadUpstashRestCredentials({ ...env, UPSTASH_REDIS_REST_URL: "" }),
    (error) => error.code === "upstash_rest_url_missing"
  );
  assert.throws(
    () => loadUpstashRestCredentials({ ...env, UPSTASH_REDIS_REST_TOKEN: "" }),
    (error) => error.code === "upstash_rest_token_missing"
  );
  assert.throws(
    () => loadUpstashRestCredentials({ ...env, UPSTASH_REDIS_REST_URL: "http://localhost:8079" }),
    (error) => error.code === "upstash_rest_url_invalid"
  );
  assert.throws(
    () => createUpstashRateLimitStore({ ...contract(), backend: "redis" }, { env, fetchImpl: successfulFetch() }),
    (error) => error.code === "upstash_backend_invalid"
  );
});

test("production and staging Upstash identities and namespaces remain isolated", async () => {
  const stagingEnv = environment("staging");
  const productionEnv = environment("production");
  const stagingConfig = validateStagingLicensingConfig(stagingEnv);
  const productionConfig = validateProductionLicensingConfig(productionEnv);
  const calls = [];

  const stagingOptions = createMachineRateLimitOptions(
    stagingConfig,
    createUpstashRateLimitStoreFactory({ env: stagingEnv, fetchImpl: successfulFetch(calls) })
  );
  const productionOptions = createMachineRateLimitOptions(
    productionConfig,
    createUpstashRateLimitStoreFactory({ env: productionEnv, fetchImpl: successfulFetch(calls) })
  );
  await stagingOptions.activation.store.increment("same-request-identity");
  await productionOptions.activation.store.increment("same-request-identity");

  assert.match(stagingOptions.activation.store.storeIdentity, /staging/);
  assert.match(productionOptions.activation.store.storeIdentity, /production/);
  const storedKeys = calls.map(({ command }) => command[3]);
  assert.match(storedKeys[0], /:staging:activation:/);
  assert.match(storedKeys[1], /:production:activation:/);
  assert.notEqual(storedKeys[0], storedKeys[1]);
});

test("health-check failures are sanitized and never fall back to memory", async () => {
  const env = environment("staging");
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const rawFailure = `backend rejected ${token} at ${env.UPSTASH_REDIS_REST_URL}`;
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error(rawFailure);
  };
  const config = validateStagingLicensingConfig(env);
  const result = await inspectMachineRateLimitReadiness(
    config,
    createUpstashRateLimitStoreFactory({ env, fetchImpl })
  );
  assert.deepEqual(result, { ready: false, code: "rate_limit_backend_unavailable" });
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(JSON.stringify(result).includes(env.UPSTASH_REDIS_REST_URL), false);
  assert.equal(calls, 1);

  const directStore = createUpstashRateLimitStore(contract(), { env, fetchImpl });
  await assert.rejects(
    () => directStore.healthCheck(),
    (error) => error.code === "upstash_request_failed" && !error.message.includes(token) && !error.message.includes(rawFailure)
  );
  assert.equal(resolveConfiguredRateLimitStoreFactory({ POS_LICENSING_RATE_LIMIT_BACKEND: "memory" }), undefined);
});

test("Upstash tokens are absent from logs and scanner reports only safe categories", async () => {
  const env = environment("staging");
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const logLines = [];
  const originalError = console.error;
  console.error = (...values) => logLines.push(values.join(" "));
  try {
    const store = createUpstashRateLimitStore(contract(), {
      env,
      fetchImpl: async () => { throw new Error(`request failed for ${token}`); }
    });
    await assert.rejects(() => store.healthCheck());
  } finally {
    console.error = originalError;
  }
  assert.equal(logLines.some((line) => line.includes(token)), false);
  assert.equal(sanitizeSensitiveText(`UPSTASH_REDIS_REST_TOKEN=${token}`, { env }).includes(token), false);

  const findings = scanTextForPosSecrets(
    "fixtures/upstash.env",
    "UPSTASH_REDIS_REST_TOKEN=" + token
  );
  assert.deepEqual(findings, [{
    file: "fixtures/upstash.env",
    category: SECRET_CATEGORIES.RATE_LIMITER_CREDENTIALS
  }]);
  assert.equal(JSON.stringify(summarizeSecretScan(findings)).includes(token), false);
});

test("configured Upstash factory integrates with production and staging readiness without route activation", async () => {
  const fetchImpl = successfulFetch();
  const productionEnv = environment("production");
  const production = await runProductionLicensingReadinessGate({
    env: productionEnv,
    fetchImpl,
    transactionCapability: transactionsReady
  });
  assert.equal(production.technicalReadinessPassed, true);
  assert.equal(production.ready, false);
  assert.equal(production.active, false);
  assert.equal(production.decisionCode, "production_enablement_disabled");

  const stagingEnv = environment("staging", { POS_LICENSING_ENABLED: "true" });
  const staging = await runStagingLicensingReadinessGate({
    env: stagingEnv,
    fetchImpl,
    transactionCapability: transactionsReady
  });
  assert.equal(staging.ready, true);
  assert.equal(staging.eligibleForProductionRouteMount, false);
  assert.equal(staging.active, false);

  const output = JSON.stringify({ production, staging });
  for (const env of [productionEnv, stagingEnv]) {
    assert.equal(output.includes(env.UPSTASH_REDIS_REST_URL), false);
    assert.equal(output.includes(env.UPSTASH_REDIS_REST_TOKEN), false);
  }
});

test("missing Upstash credentials fail readiness without requests or fallback", async () => {
  const env = environment("production", { UPSTASH_REDIS_REST_TOKEN: "" });
  let called = false;
  const report = await runProductionLicensingReadinessGate({
    env,
    fetchImpl: async () => { called = true; return okResponse("PONG"); },
    transactionCapability: transactionsReady
  });
  assert.equal(report.ready, false);
  assert.equal(report.eligibleForRouteMount, false);
  assert.equal(report.active, false);
  assert.equal(called, false);
  assert.equal(JSON.stringify(report).includes("memory"), false);
});
