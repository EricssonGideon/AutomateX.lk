const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-readiness-command-test-only";

const {
  APPROVED_PRODUCTION_KEY_ID
} = require("../../server/config/posLicensingProduction");
const {
  executeStagingReadinessCommand,
  projectSafeStagingReadiness,
  runStagingReadinessCheck
} = require("../../scripts/checkPosLicensingStagingReadiness");

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
    POS_LICENSING_ENABLED: "true",
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
    POS_LICENSING_RATE_LIMIT_BACKEND: "vendor-neutral-kv",
    POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: `automatex-pos-${name}-distributed-v1`,
    POS_LICENSING_RATE_LIMIT_NAMESPACE: `automatex:pos-licensing:${name}`,
    POS_LICENSING_RATE_LIMIT_STORE_URI: `kv+tls://${name}_user:${name}_password@${name}-rate-limit.example:443/${name}`,
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

function distributedStoreFactory(contract) {
  return {
    distributed: true,
    localKeys: false,
    backend: contract.backend,
    environment: contract.environment,
    storeIdentity: contract.storeIdentity,
    namespace: contract.namespace,
    async increment() { return { totalHits: 1, resetTime: new Date(Date.now() + 60000) }; },
    async decrement() {},
    async resetKey() {},
    async healthCheck() { return { healthy: true }; }
  };
}

function mongoStub() {
  return {
    connection: Object.freeze({ name: "simulated-staging-connection" }),
    connectCalls: 0,
    disconnectCalls: 0,
    async connect() { this.connectCalls += 1; },
    async disconnect() { this.disconnectCalls += 1; }
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

function validOptions(env = environment("staging")) {
  return {
    env,
    mongo: mongoStub(),
    transactionCapability: transactionsReady,
    rateLimitStoreFactory: distributedStoreFactory
  };
}

test("package exposes the staging-only readiness command", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
  assert.equal(packageJson.scripts["check:pos-licensing-staging"], "node scripts/checkPosLicensingStagingReadiness.js");
});

test("valid simulated staging configuration emits the safe aggregate result", async () => {
  const written = [];
  const options = validOptions();
  const result = await executeStagingReadinessCommand({
    ...options,
    stdout: { write(value) { written.push(value); } }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.output.environment, "staging");
  assert.equal(result.output.ready, true);
  assert.equal(result.output.technicalReadinessPassed, true);
  assert.equal(result.output.enablementRequested, true);
  assert.equal(result.output.eligibleForRouteMount, true);
  assert.equal(result.output.active, false);
  assert.equal(result.output.decisionCode, "staging_route_mount_eligible");
  assert.deepEqual(Object.keys(JSON.parse(written.join(""))), [
    "environment",
    "ready",
    "technicalReadinessPassed",
    "enablementRequested",
    "eligibleForRouteMount",
    "active",
    "decisionCode",
    "checks"
  ]);
  assert.equal(options.mongo.connectCalls, 1);
  assert.equal(options.mongo.disconnectCalls, 1);
});

test("missing staging runtime configuration fails closed", async () => {
  const mongo = mongoStub();
  const output = await runStagingReadinessCheck({
    env: { AUTOMATEX_ENV: "staging", NODE_ENV: "production" },
    mongo,
    transactionCapability: transactionsReady,
    rateLimitStoreFactory: distributedStoreFactory
  });
  assert.equal(output.environment, "staging");
  assert.equal(output.ready, false);
  assert.equal(output.technicalReadinessPassed, false);
  assert.equal(output.eligibleForRouteMount, false);
  assert.equal(output.active, false);
  assert.equal(mongo.connectCalls, 0);
});

test("production configuration cannot satisfy the staging command", async () => {
  const output = await runStagingReadinessCheck(validOptions(environment("production")));
  assert.equal(output.environment, "staging");
  assert.equal(output.ready, false);
  assert.equal(output.technicalReadinessPassed, false);
  assert.equal(output.eligibleForRouteMount, false);
  assert.equal(output.active, false);
  assert.equal(output.decisionCode, "staging_readiness_failed");
});

test("existing runtime MongoDB connection is reused without connect or disconnect", async () => {
  const options = validOptions();
  const connection = Object.freeze({ name: "existing-preview-connection" });
  const output = await runStagingReadinessCheck({ ...options, connection });
  assert.equal(output.ready, true);
  assert.equal(options.mongo.connectCalls, 0);
  assert.equal(options.mongo.disconnectCalls, 0);
});

test("staging command output contains no secrets or infrastructure values", async () => {
  const env = environment("staging", {
    UPSTASH_REDIS_REST_URL: "https://staging-secret-endpoint.example.invalid",
    UPSTASH_REDIS_REST_TOKEN: "staging-token-" + "t".repeat(48),
    JWT_SECRET: "staging-jwt-" + "j".repeat(48)
  });
  const output = await runStagingReadinessCheck(validOptions(env));
  const serialized = JSON.stringify(output);
  for (const secret of [
    env.MONGO_URI,
    env.POS_LICENSING_RATE_LIMIT_STORE_URI,
    env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64,
    env.POS_LICENSING_EXPECTED_PUBLIC_JWK,
    env.UPSTASH_REDIS_REST_URL,
    env.UPSTASH_REDIS_REST_TOKEN,
    env.JWT_SECRET
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(serialized.includes("stack"), false);
  for (const check of output.checks) {
    assert.deepEqual(Object.keys(check), ["name", "passed", "code"]);
    assert.match(check.name, /^[a-z0-9_]{1,100}$/);
    assert.match(check.code, /^[a-z0-9_]{1,100}$/);
  }
});

test("staging projection can never report production route eligibility", () => {
  const output = projectSafeStagingReadiness({
    environment: "staging",
    ready: true,
    technicalReadinessPassed: true,
    enablementRequested: true,
    eligibleForRouteMount: true,
    eligibleForProductionRouteMount: true,
    active: true,
    decisionCode: "production_route_mount_eligible",
    checks: [{ name: "environment", passed: true, code: "production_environment_valid" }]
  });
  assert.equal(output.ready, false);
  assert.equal(output.eligibleForRouteMount, false);
  assert.equal(output.active, false);
  assert.equal(output.decisionCode, "staging_environment_required");
  assert.equal(Object.prototype.hasOwnProperty.call(output, "eligibleForProductionRouteMount"), false);
});
