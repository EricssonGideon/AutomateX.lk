const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-final-readiness-gate-test-only";

const {
  APPROVED_PRODUCTION_KEY_ID,
  assertPosLicensingStartupConfig
} = require("../../server/config/posLicensingProduction");
const {
  REQUIRED_PRODUCTION_READINESS_CHECKS,
  assertPosLicensingEnablementEligible,
  runProductionLicensingReadinessGate,
  runStagingLicensingReadinessGate
} = require("../../server/licensing/posLicensingReadinessGate");

function keyMaterial() {
  const pair = crypto.generateKeyPairSync("ed25519");
  return {
    privateJwkB64: Buffer.from(JSON.stringify(pair.privateKey.export({ format: "jwk" })), "utf8").toString("base64"),
    publicJwk: JSON.stringify(pair.publicKey.export({ format: "jwk" }))
  };
}

function environment(name, overrides = {}) {
  const signing = keyMaterial();
  const production = name === "production";
  const companyOrigin = production ? "https://company.example.com" : "https://company-staging.example.com";
  const databaseName = production ? "automatex_pos_production" : "automatex_pos_staging";
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
    ALLOWED_ORIGINS: companyOrigin,
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    POS_LICENSING_RATE_LIMIT_BACKEND: "vendor-neutral-kv",
    POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: `automatex-pos-${name}-distributed-v1`,
    POS_LICENSING_RATE_LIMIT_NAMESPACE: `automatex:pos-licensing:${name}`,
    POS_LICENSING_RATE_LIMIT_STORE_URI: `kv+tls://${name}_rate_user:${name}_rate_password@${name}-rate-limit.example:443/${name}`,
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

function storeFactory(contract, healthy = true) {
  return {
    distributed: true,
    localKeys: false,
    backend: contract.backend,
    environment: contract.environment,
    storeIdentity: contract.storeIdentity,
    namespace: contract.namespace,
    async healthCheck() { return { healthy }; },
    async increment() { return { totalHits: 1, resetTime: new Date(Date.now() + 60000) }; },
    async decrement() {},
    async resetKey() {}
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

function gateOptions(env, healthy = true) {
  return {
    env,
    transactionCapability: transactionsReady,
    rateLimitStoreFactory: (contract) => storeFactory(contract, healthy)
  };
}

test("all simulated production checks pass but explicit enablement false remains inactive", async () => {
  const result = await runProductionLicensingReadinessGate(gateOptions(environment("production")));
  assert.equal(result.technicalReadinessPassed, true);
  assert.equal(result.ready, false);
  assert.equal(result.eligibleForRouteMount, false);
  assert.equal(result.active, false);
  assert.equal(result.decisionCode, "production_enablement_disabled");
});

test("all simulated checks plus explicit enablement true become eligible, never automatically active", async () => {
  const env = environment("production", { POS_LICENSING_ENABLED: "true" });
  const result = await runProductionLicensingReadinessGate(gateOptions(env));
  assert.equal(result.ready, true);
  assert.equal(result.eligibleForRouteMount, true);
  assert.equal(result.eligibleForProductionRouteMount, true);
  assert.equal(result.active, false);
  assert.equal(result.decisionCode, "production_route_mount_eligible");

  const startup = assertPosLicensingStartupConfig(env);
  assert.equal(startup.enablementRequested, true);
  assert.equal(startup.active, false);
});

test("one failed required check prevents eligibility and partial activation", async () => {
  const env = environment("production", { POS_LICENSING_ENABLED: "true" });
  const result = await runProductionLicensingReadinessGate(gateOptions(env, false));
  assert.equal(result.checks.find((check) => check.name === "rate_limit_adapter").passed, false);
  assert.equal(result.technicalReadinessPassed, false);
  assert.equal(result.ready, false);
  assert.equal(result.eligibleForRouteMount, false);
  assert.equal(result.active, false);
  assert.equal(result.decisionCode, "production_readiness_failed");
  assert.throws(
    () => assertPosLicensingEnablementEligible(result),
    (error) => error.code === "pos_licensing_enablement_refused"
  );
});

test("missing and malformed enablement values remain inactive", async () => {
  const missing = environment("production");
  delete missing.POS_LICENSING_ENABLED;
  const missingResult = await runProductionLicensingReadinessGate(gateOptions(missing));
  assert.equal(missingResult.ready, false);
  assert.equal(missingResult.decisionCode, "production_enablement_missing");

  const malformed = environment("production", { POS_LICENSING_ENABLED: "yes" });
  const malformedResult = await runProductionLicensingReadinessGate(gateOptions(malformed));
  assert.equal(malformedResult.ready, false);
  assert.equal(malformedResult.decisionCode, "production_enablement_invalid");
  assert.equal(malformedResult.active, false);
});

test("staging can be staging-eligible but can never become production-enabled", async () => {
  const env = environment("staging", { POS_LICENSING_ENABLED: "true" });
  const staging = await runStagingLicensingReadinessGate(gateOptions(env));
  assert.equal(staging.ready, true);
  assert.equal(staging.eligibleForStagingRouteMount, true);
  assert.equal(staging.eligibleForProductionRouteMount, false);
  assert.equal(staging.active, false);

  const production = await runProductionLicensingReadinessGate(gateOptions(env));
  assert.equal(production.ready, false);
  assert.equal(production.eligibleForProductionRouteMount, false);
  assert.equal(production.active, false);
});

test("development and test runtimes cannot become production-enabled", async () => {
  for (const runtime of ["development", "test"]) {
    const result = await runProductionLicensingReadinessGate({
      env: {
        AUTOMATEX_ENV: runtime,
        NODE_ENV: runtime,
        POS_LICENSING_MODE: runtime,
        POS_LICENSING_ENABLED: "true"
      },
      transactionCapability: transactionsReady,
      rateLimitStoreFactory: (contract) => storeFactory(contract)
    });
    assert.equal(result.ready, false, runtime);
    assert.equal(result.eligibleForProductionRouteMount, false, runtime);
    assert.equal(result.active, false, runtime);
  }
});

test("aggregate output uses only stable safe check names and reason codes", async () => {
  const result = await runProductionLicensingReadinessGate(gateOptions(environment("production")));
  assert.match(result.decisionCode, /^[a-z0-9_]+$/);
  for (const check of result.checks) {
    assert.deepEqual(Object.keys(check), ["name", "passed", "code"]);
    assert.match(check.name, /^[a-z0-9_]{1,100}$/);
    assert.match(check.code, /^[a-z0-9_]{1,100}$/);
    assert.equal(typeof check.passed, "boolean");
  }
});

test("aggregate output contains no secrets, URIs, hostnames, origins, CIDRs, or stacks", async () => {
  const env = environment("production");
  const output = JSON.stringify(await runProductionLicensingReadinessGate(gateOptions(env)));
  for (const value of [
    env.MONGO_URI,
    env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64,
    env.POS_LICENSING_EXPECTED_PUBLIC_JWK,
    env.POS_LICENSING_RATE_LIMIT_STORE_URI,
    env.POS_LICENSING_MACHINE_API_ORIGIN,
    env.POS_LICENSING_PRODUCTION_HOSTNAME,
    env.POS_LICENSING_STAGING_HOSTNAME,
    env.ALLOWED_ORIGINS
  ]) {
    assert.equal(output.includes(value), false);
  }
  assert.equal(output.includes("stack"), false);
});

test("every Part 77 through Part 78E readiness concern is represented once", async () => {
  const result = await runProductionLicensingReadinessGate(gateOptions(environment("production", {
    POS_LICENSING_ENABLED: "true"
  })));
  const names = result.checks.map((check) => check.name);
  for (const requiredName of REQUIRED_PRODUCTION_READINESS_CHECKS) {
    assert.equal(names.filter((name) => name === requiredName).length, 1, requiredName);
  }
  assert.equal(names.filter((name) => name === "production_enablement").length, 1);
});

test("route mounting remains absent and the startup gate cannot partially activate routes", () => {
  const root = path.join(__dirname, "..", "..");
  const routes = fs.readFileSync(path.join(root, "server", "routes", "index.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
  const startup = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.doesNotMatch(routes, /posActivation|posLicenceAdmin|pos-machine|pos-licensing/);
  assert.doesNotMatch(app, /require\(["'].\/routes\/pos(?:Activation|LicenceAdmin)["']\)/);
  assert.doesNotMatch(app, /app\.use\([^\n]*(?:pos-machine|admin\/pos-licensing)/);
  assert.match(startup, /assertPosLicensingEnablementEligible/);
});
