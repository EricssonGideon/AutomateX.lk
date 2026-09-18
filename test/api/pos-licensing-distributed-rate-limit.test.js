const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-rate-limit-contract-test-only";

const {
  APPROVED_PRODUCTION_KEY_ID,
  validateProductionLicensingConfig,
  validateStagingLicensingConfig
} = require("../../server/config/posLicensingProduction");
const {
  MACHINE_RATE_LIMIT_OPERATIONS,
  createMachineRateLimitKey,
  createMachineRateLimitOptions,
  createProductionMachineRateLimitOptions,
  inspectProductionRateLimitReadiness
} = require("../../server/licensing/posLicensingRateLimit");
const {
  runProductionLicensingReadiness
} = require("../../server/licensing/posLicensingReadiness");
const createPosActivationRouter = require("../../server/routes/posActivation");
const { handleActivationRouterError } = createPosActivationRouter;

function signingMaterial() {
  const pair = crypto.generateKeyPairSync("ed25519");
  const privateJwk = pair.privateKey.export({ format: "jwk" });
  return {
    privateJwkB64: Buffer.from(JSON.stringify(privateJwk), "utf8").toString("base64"),
    publicJwk: JSON.stringify(pair.publicKey.export({ format: "jwk" }))
  };
}

function productionEnv(overrides = {}) {
  const signing = signingMaterial();
  return {
    AUTOMATEX_ENV: "production",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "production",
    POS_LICENSING_ENVIRONMENT: "production",
    POS_LICENSING_CLIENT_SCOPE: "production-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "production",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: "mongodb+srv://production_user:production_password@production-cluster.example/automatex_pos_production",
    POS_LICENSING_DATABASE_NAME: "automatex_pos_production",
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: signing.privateJwkB64,
    POS_LICENSING_EXPECTED_PUBLIC_JWK: signing.publicJwk,
    POS_LICENSING_SIGNING_KEY_ID: APPROVED_PRODUCTION_KEY_ID,
    POS_LICENSING_MACHINE_API_BASE_PATH: "/api/pos-machine/v1",
    POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing.example.com",
    POS_LICENSING_PRODUCTION_HOSTNAME: "licensing.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "direct",
    ALLOWED_ORIGINS: "https://company.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    POS_LICENSING_RATE_LIMIT_BACKEND: "vendor-neutral-kv",
    POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: "automatex-pos-production-distributed-v1",
    POS_LICENSING_RATE_LIMIT_NAMESPACE: "automatex:pos-licensing:production",
    POS_LICENSING_RATE_LIMIT_STORE_URI: "kv+tls://rate_user:rate_password@rate-limit.example:443/production",
    POS_LICENSING_RATE_LIMIT_WINDOW_MS: "60000",
    POS_LICENSING_ACTIVATION_RATE_LIMIT: "10",
    POS_LICENSING_BOOTSTRAP_RATE_LIMIT: "20",
    POS_LICENSING_RENEWAL_RATE_LIMIT: "60",
    POS_LICENSING_AUDIT_ENABLED: "true",
    POS_LICENSING_AUDIT_RETENTION: "indefinite",
    POS_LICENSING_MONGODB_TRANSACTIONS_REQUIRED: "true",
    ...overrides
  };
}

function stagingEnv(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENVIRONMENT: "staging",
    POS_LICENSING_CLIENT_SCOPE: "staging-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "staging",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: "mongodb+srv://staging_user:staging_password@staging-cluster.example/automatex_pos_staging",
    POS_LICENSING_DATABASE_NAME: "automatex_pos_staging",
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
    POS_LICENSING_RATE_LIMIT_STORE_URI: "kv+tls://staging_user:staging_password@rate-limit-staging.example:443/staging",
    POS_LICENSING_RATE_LIMIT_WINDOW_MS: "60000",
    POS_LICENSING_ACTIVATION_RATE_LIMIT: "10",
    POS_LICENSING_BOOTSTRAP_RATE_LIMIT: "20",
    POS_LICENSING_RENEWAL_RATE_LIMIT: "60",
    ...overrides
  };
}

function distributedStoreFactory(contract, overrides = {}) {
  return {
    distributed: true,
    localKeys: false,
    backend: contract.backend,
    environment: contract.environment,
    storeIdentity: contract.storeIdentity,
    namespace: contract.namespace,
    async healthCheck() { return { healthy: true }; },
    async increment() { return { totalHits: 1, resetTime: new Date(Date.now() + 60000) }; },
    async decrement() {},
    async resetKey() {},
    ...overrides
  };
}

const verifiedTransactions = Object.freeze({
  supported: true,
  verified: true,
  logicalSessions: true,
  transactionalTopology: true,
  probePassed: true,
  reason: "transaction_probe_passed"
});

test("production rejects memory, missing, local, and test limiter configuration", () => {
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_RATE_LIMIT_BACKEND: "memory" })),
    (error) => error.code === "unsafe_rate_limit_backend"
  );
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_RATE_LIMIT_BACKEND: "" })),
    (error) => error.code === "missing_configuration"
  );
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_RATE_LIMIT_STORE_URI: "" })),
    (error) => error.code === "missing_configuration"
  );
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: "automatex-pos-production-local-v1" })),
    (error) => error.code === "rate_limit_environment_mismatch"
  );
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: "automatex-pos-production-test-v1" })),
    (error) => error.code === "rate_limit_environment_mismatch"
  );
});

test("staging rejects production limiter identity and namespace", () => {
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({
      POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: "automatex-pos-production-distributed-v1"
    })),
    (error) => error.code === "rate_limit_identity_invalid" || error.code === "rate_limit_environment_mismatch"
  );
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({
      POS_LICENSING_RATE_LIMIT_NAMESPACE: "automatex:pos-licensing:production"
    })),
    (error) => error.code === "rate_limit_identity_invalid" || error.code === "rate_limit_environment_mismatch"
  );
});

test("activation, bootstrap, and renewal receive distinct namespaces and stores", () => {
  const config = validateProductionLicensingConfig(productionEnv());
  const contracts = [];
  const options = createProductionMachineRateLimitOptions(config, (contract) => {
    contracts.push(contract);
    return distributedStoreFactory(contract);
  });
  assert.deepEqual(Object.keys(options), MACHINE_RATE_LIMIT_OPERATIONS);
  assert.equal(new Set(contracts.map(({ namespace }) => namespace)).size, 3);
  assert.equal(new Set(MACHINE_RATE_LIMIT_OPERATIONS.map((operation) => options[operation].store)).size, 3);
  assert.deepEqual(contracts.map(({ namespace }) => namespace), [
    "automatex:pos-licensing:production:activation",
    "automatex:pos-licensing:production:bootstrap",
    "automatex:pos-licensing:production:renewal"
  ]);
  assert.equal(MACHINE_RATE_LIMIT_OPERATIONS.every((operation) => options[operation].passOnStoreError === false), true);
  assert.doesNotThrow(() => createPosActivationRouter({
    rateLimit: options.activation,
    bootstrapRateLimit: options.bootstrap,
    renewalRateLimit: options.renewal,
    service: { async redeemStandardActivation() {} }
  }));
});

test("machine limiter keys are opaque, operation-specific, and exclude raw credentials", () => {
  const activationCode = "posac_" + "a".repeat(48);
  const renewalCredential = "posrc_" + "r".repeat(48);
  const authorization = "Bearer " + "secret-token-" + "z".repeat(40);
  const request = {
    ip: "2001:db8:1234:5678::1",
    body: { activationCode, renewalCredential },
    headers: { authorization }
  };
  const keys = MACHINE_RATE_LIMIT_OPERATIONS.map((operation) => createMachineRateLimitKey(operation, request));
  assert.equal(new Set(keys).size, 3);
  for (const key of keys) {
    assert.match(key, /^(activation|bootstrap|renewal):[a-f0-9]{64}$/);
    assert.equal(key.includes(activationCode), false);
    assert.equal(key.includes(renewalCredential), false);
    assert.equal(key.includes(authorization), false);
    assert.equal(key.includes(request.ip), false);
  }
});

test("adapter failures are sanitized and never reveal raw backend errors", async () => {
  const env = productionEnv();
  const config = validateProductionLicensingConfig(env);
  const rawFailure = `connection refused for ${env.POS_LICENSING_RATE_LIMIT_STORE_URI}`;
  const options = createProductionMachineRateLimitOptions(config, (contract) => distributedStoreFactory(contract, {
    async increment() { throw new Error(rawFailure); }
  }));
  await assert.rejects(
    () => options.activation.store.increment("opaque-key"),
    (error) => error.code === "rate_limit_backend_unavailable" && !error.message.includes(rawFailure) && !error.message.includes(env.POS_LICENSING_RATE_LIMIT_STORE_URI)
  );
});

test("machine route backend failures return a sanitized fail-closed response", () => {
  const env = productionEnv();
  const rawFailure = `adapter credential failure at ${env.POS_LICENSING_RATE_LIMIT_STORE_URI}`;
  const response = {
    headersSent: false,
    statusCode: 200,
    body: null,
    set() { return this; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; }
  };
  handleActivationRouterError(
    new Error(rawFailure),
    { posMachineOperation: "activation" },
    response,
    () => { throw new Error("error handler must not delegate"); }
  );
  const body = JSON.stringify(response.body);
  assert.equal(response.statusCode, 503);
  assert.match(body, /Activation service is unavailable/);
  assert.equal(body.includes(rawFailure), false);
  assert.equal(body.includes(env.POS_LICENSING_RATE_LIMIT_STORE_URI), false);
});

test("valid simulated distributed adapters pass configuration and readiness", async () => {
  const config = validateProductionLicensingConfig(productionEnv());
  const adapterReadiness = await inspectProductionRateLimitReadiness(
    config,
    (contract) => distributedStoreFactory(contract)
  );
  assert.deepEqual(adapterReadiness, { ready: true, code: "distributed_rate_limit_verified" });

  const staging = validateStagingLicensingConfig(stagingEnv());
  const stagingOptions = createMachineRateLimitOptions(staging, (contract) => distributedStoreFactory(contract));
  assert.equal(stagingOptions.activation.store.environment, "staging");
  assert.match(stagingOptions.activation.store.namespace, /:staging:activation$/);
});

test("missing, memory-only, reused, or unhealthy stores never fall back to memory", async () => {
  const config = validateProductionLicensingConfig(productionEnv());
  assert.throws(
    () => createProductionMachineRateLimitOptions(config),
    (error) => error.code === "rate_limit_store_factory_missing"
  );
  assert.throws(
    () => createProductionMachineRateLimitOptions(config, (contract) => distributedStoreFactory(contract, { distributed: false, localKeys: true })),
    (error) => error.code === "rate_limit_adapter_not_distributed"
  );
  const shared = distributedStoreFactory({
    backend: config.rateLimit.backend,
    environment: "production",
    storeIdentity: config.rateLimit.storeIdentity,
    namespace: config.rateLimit.namespaces.activation
  });
  assert.throws(
    () => createProductionMachineRateLimitOptions(config, () => shared),
    (error) => ["rate_limit_adapter_identity_mismatch", "rate_limit_namespace_collision"].includes(error.code)
  );
  const unhealthy = await inspectProductionRateLimitReadiness(config, (contract) => distributedStoreFactory(contract, {
    async healthCheck() { return { healthy: false, detail: "do-not-report" }; }
  }));
  assert.deepEqual(unhealthy, { ready: false, code: "rate_limit_backend_unhealthy" });
});

test("production readiness fails without an adapter and exposes no limiter credentials", async () => {
  const env = productionEnv();
  const report = await runProductionLicensingReadiness({ env, transactionCapability: verifiedTransactions });
  assert.equal(report.ready, false);
  assert.deepEqual(report.checks.find(({ name }) => name === "rate_limit_adapter"), {
    name: "rate_limit_adapter",
    passed: false,
    code: "rate_limit_store_factory_missing"
  });
  const output = JSON.stringify(report);
  assert.equal(output.includes(env.POS_LICENSING_RATE_LIMIT_STORE_URI), false);
  assert.equal(output.includes("rate_password"), false);
});

test("production readiness passes a healthy vendor-neutral adapter contract", async () => {
  const report = await runProductionLicensingReadiness({
    env: productionEnv(),
    transactionCapability: verifiedTransactions,
    rateLimitStoreFactory: (contract) => distributedStoreFactory(contract)
  });
  assert.equal(report.ready, true);
  for (const name of ["distributed_rate_limiter", "rate_limit_backend", "namespace_isolation", "rate_limit_adapter"]) {
    assert.equal(report.checks.find((check) => check.name === name).passed, true, name);
  }
});
