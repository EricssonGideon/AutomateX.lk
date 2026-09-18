const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licensing-production-readiness-test-secret";

const {
  APPROVED_PRODUCTION_KEY_ID,
  assertProductionLicensingStartupConfig,
  loadProductionSigningKeyProvider,
  validateProductionLicensingConfig
} = require("../../server/config/posLicensingProduction");
const {
  getPosLicensingProvisioningPlan,
  provisionPosLicensingDatabase,
  validatePosLicensingProvisioningPlan
} = require("../../server/licensing/posLicensingProvisioning");
const {
  createProductionMachineRateLimitOptions
} = require("../../server/licensing/posLicensingRateLimit");
const {
  runProductionLicensingReadiness
} = require("../../server/licensing/posLicensingReadiness");
const {
  inspectMongoTransactionCapability
} = require("../../server/licensing/posLicensingTransactions");
const {
  requireTrustedLicenceAdmin,
  verifyToken
} = require("../../server/middleware/auth");
const { safeSummary } = require("../../server/utils/auditLog");
const {
  POS_LIFECYCLE_AUTHORITY_FIELDS,
  assertMonotonicLifecycleSequence,
  getLifecycleAuthoritySignatureData,
  signLifecycleAuthorityEnvelope
} = require("../../server/utils/posLifecycleAuthorityEnvelope");

function keyMaterial() {
  const pair = crypto.generateKeyPairSync("ed25519");
  const privateJwk = pair.privateKey.export({ format: "jwk" });
  const publicJwk = pair.publicKey.export({ format: "jwk" });
  return {
    pair,
    privateJwk,
    publicJwk,
    privateJwkB64: Buffer.from(JSON.stringify(privateJwk), "utf8").toString("base64")
  };
}

function productionEnv(material = keyMaterial()) {
  return {
    AUTOMATEX_ENV: "production",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "production",
    MONGO_URI: "mongodb+srv://" + "production_user:production_password" + "@production-cluster.example/automatex_pos_production",
    POS_LICENSING_DATABASE_NAME: "automatex_pos_production",
    POS_LICENSING_ENVIRONMENT: "production",
    POS_LICENSING_CLIENT_SCOPE: "production-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "production",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: material.privateJwkB64,
    POS_LICENSING_EXPECTED_PUBLIC_JWK: JSON.stringify(material.publicJwk),
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
    POS_LICENSING_RATE_LIMIT_BACKEND: "redis",
    POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: "automatex-pos-production-distributed-v1",
    POS_LICENSING_RATE_LIMIT_NAMESPACE: "automatex:pos-licensing:production",
    POS_LICENSING_RATE_LIMIT_STORE_URI: "rediss://rate-limit.example:6380",
    POS_LICENSING_RATE_LIMIT_WINDOW_MS: "60000",
    POS_LICENSING_ACTIVATION_RATE_LIMIT: "10",
    POS_LICENSING_BOOTSTRAP_RATE_LIMIT: "20",
    POS_LICENSING_RENEWAL_RATE_LIMIT: "60",
    POS_LICENSING_AUDIT_ENABLED: "true",
    POS_LICENSING_AUDIT_RETENTION: "indefinite",
    POS_LICENSING_MONGODB_TRANSACTIONS_REQUIRED: "true"
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
    async healthCheck() { return { healthy: true }; },
    async increment() { return { totalHits: 1, resetTime: new Date(Date.now() + 60000) }; },
    async decrement() {},
    async resetKey() {}
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
}

test("production startup fails closed when the signing key is missing", () => {
  const env = productionEnv();
  delete env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64;
  assert.throws(
    () => assertProductionLicensingStartupConfig(env),
    (error) => error.code === "missing_configuration" && !String(error.message).includes("posrc_")
  );
});

test("malformed production signing keys and unapproved key IDs fail", () => {
  const malformed = productionEnv();
  malformed.POS_LICENSING_SIGNING_PRIVATE_JWK_B64 = Buffer.from("not-json").toString("base64");
  assert.throws(() => loadProductionSigningKeyProvider(malformed), (error) => error.code === "invalid_signing_key");

  const wrongKeyId = productionEnv();
  wrongKeyId.POS_LICENSING_SIGNING_KEY_ID = "automatex-pos-development-key";
  assert.throws(() => loadProductionSigningKeyProvider(wrongKeyId), (error) => error.code === "unapproved_key_id");
});

test("expected public key mismatch fails before signing operations can start", () => {
  const env = productionEnv();
  env.POS_LICENSING_EXPECTED_PUBLIC_JWK = JSON.stringify(keyMaterial().publicJwk);
  assert.throws(() => loadProductionSigningKeyProvider(env), (error) => error.code === "signing_key_mismatch");
});

test("valid server-only Ed25519 configuration passes production readiness", async () => {
  const env = productionEnv();
  const config = validateProductionLicensingConfig(env);
  const privateKey = await config.keyProvider.getPrivateKey();
  assert.equal(privateKey.asymmetricKeyType, "ed25519");

  const report = await runProductionLicensingReadiness({
    env,
    rateLimitStoreFactory: distributedStoreFactory,
    transactionCapability: {
      supported: true,
      verified: true,
      logicalSessions: true,
      transactionalTopology: true,
      probePassed: true,
      reason: "transaction_probe_passed"
    }
  });
  assert.equal(report.ready, true);
  assert.equal(report.checks.every((check) => check.passed), true);
  assert.equal(JSON.stringify(report).includes(env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64), false);
  assert.equal(JSON.stringify(report).includes(env.POS_LICENSING_RATE_LIMIT_STORE_URI), false);
  assert.equal(JSON.stringify(report).includes(env.MONGO_URI), false);
});

test("production never falls back to test, development, local database, CORS, or memory limits", () => {
  assert.throws(
    () => assertProductionLicensingStartupConfig({ AUTOMATEX_ENV: "production", NODE_ENV: "production", POS_LICENSING_MODE: "test" }),
    (error) => error.code === "environment_fallback_forbidden"
  );

  const local = productionEnv();
  local.MONGO_URI = "mongodb://127.0.0.1/automatex_pos_test";
  local.POS_LICENSING_DATABASE_NAME = "automatex_pos_test";
  assert.throws(() => validateProductionLicensingConfig(local), /Production POS licensing/);

  const mismatchedDatabase = productionEnv();
  mismatchedDatabase.MONGO_URI = "mongodb+srv://" + "production_user:production_password" + "@production-cluster.example/wrong_production_database";
  assert.throws(() => validateProductionLicensingConfig(mismatchedDatabase), (error) => error.code === "database_name_mismatch");

  const permissive = productionEnv();
  permissive.ALLOWED_ORIGINS = "*";
  assert.throws(() => validateProductionLicensingConfig(permissive), (error) => error.code === "cors_allowlist_invalid");

  const memory = productionEnv();
  memory.POS_LICENSING_RATE_LIMIT_BACKEND = "memory";
  assert.throws(() => validateProductionLicensingConfig(memory), (error) => error.code === "unsafe_rate_limit_backend");
});

test("POS Control authorization rejects anonymous, client, staff, employee, manager and machine callers", async () => {
  for (const role of [null, "client", "staff", "employee", "manager", "pos-machine"]) {
    const req = { user: role ? { role, email: `${role}@example.com` } : null };
    const res = responseRecorder();
    let nextCalled = false;
    requireTrustedLicenceAdmin(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  }

  const anonymousResponse = responseRecorder();
  await verifyToken({ method: "GET", headers: {} }, anonymousResponse, () => {});
  assert.equal(anonymousResponse.statusCode, 401);

  const machineRequest = {
    method: "GET",
    headers: { authorization: "Bearer posrc_" + "a".repeat(64) }
  };
  const machineResponse = responseRecorder();
  let nextCalled = false;
  await verifyToken(machineRequest, machineResponse, () => { nextCalled = true; });
  assert.equal(machineResponse.statusCode, 401);
  assert.equal(nextCalled, false);

  const adminResponse = responseRecorder();
  requireTrustedLicenceAdmin({ user: { role: "admin" } }, adminResponse, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("standalone MongoDB topology fails transaction-required readiness", async () => {
  let startedSession = false;
  const connection = {
    db: {
      admin() {
        return { async command() { return { logicalSessionTimeoutMinutes: 30 }; } };
      }
    },
    async startSession() {
      startedSession = true;
    }
  };
  const capability = await inspectMongoTransactionCapability(connection);
  assert.deepEqual(capability, {
    supported: false,
    verified: true,
    logicalSessions: true,
    transactionalTopology: false,
    probePassed: false,
    reason: "transaction_topology_unsupported"
  });
  assert.equal(startedSession, false);

  const report = await runProductionLicensingReadiness({ env: productionEnv(), transactionCapability: capability });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((check) => check.name === "transaction_capability").passed, false);
});

test("distributed machine limiter preparation requires independent server-backed stores", () => {
  const config = validateProductionLicensingConfig(productionEnv());
  const namespaces = [];
  const options = createProductionMachineRateLimitOptions(config, (contract) => {
    namespaces.push(contract.namespace);
    return distributedStoreFactory(contract);
  });
  assert.equal(new Set(namespaces).size, 3);
  assert.notEqual(options.activation.store, options.renewal.store);
  assert.throws(() => createProductionMachineRateLimitOptions(config), /store factory/);
});

test("audit summaries remove credentials, activation codes, private keys, and authorization headers", () => {
  const secretValues = ["posac_secret", "posrc_secret", "private-secret", "Bearer machine-secret"];
  const summary = safeSummary({
    activationCode: secretValues[0],
    renewalCredential: secretValues[1],
    privateKey: secretValues[2],
    authorization: secretValues[3],
    reason: "approved_reason_code"
  });
  const serialized = JSON.stringify(summary);
  for (const secret of secretValues) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(summary.reason, "approved_reason_code");
});

test("provisioning definitions are complete, contain no TTL, and apply idempotently", async () => {
  const plan = getPosLicensingProvisioningPlan();
  const validation = validatePosLicensingProvisioningPlan(plan);
  assert.equal(validation.valid, true);
  assert.equal(plan.some((entry) => entry.indexes.some((index) => "expireAfterSeconds" in index.options)), false);

  const collections = new Map();
  const connection = {
    db: {
      async createCollection(name) {
        if (collections.has(name)) {
          const error = new Error("exists");
          error.code = 48;
          throw error;
        }
        collections.set(name, new Map());
      },
      collection(name) {
        return {
          async createIndex(key, options) {
            collections.get(name).set(options.name, JSON.stringify(key));
            return options.name;
          }
        };
      }
    }
  };

  await provisionPosLicensingDatabase(connection, { apply: true });
  const firstSnapshot = JSON.stringify([...collections].map(([name, indexes]) => [name, [...indexes]]));
  await provisionPosLicensingDatabase(connection, { apply: true });
  const secondSnapshot = JSON.stringify([...collections].map(([name, indexes]) => [name, [...indexes]]));
  assert.equal(secondSnapshot, firstSnapshot);
});

test("future lifecycle authority envelopes use the approved key, canonical JSON, identities, sequence, and validity", async () => {
  const env = productionEnv();
  const provider = loadProductionSigningKeyProvider(env);
  const signed = await signLifecycleAuthorityEnvelope({
    keyId: APPROVED_PRODUCTION_KEY_ID,
    commandId: "018f47f2-cf41-7b8d-8ad8-1c54579b0084",
    previousSequence: 6,
    sequence: 7,
    clientId: "507f1f77bcf86cd799439011",
    installationId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
    action: "deactivate",
    issuedAt: "2026-09-15T00:00:00.000Z",
    notAfter: "2026-09-15T00:05:00.000Z",
    payload: { reasonCode: "owner_approved" }
  }, provider);
  assert.deepEqual(Object.keys(signed), [...POS_LIFECYCLE_AUTHORITY_FIELDS]);
  assert.equal(signed.keyId, APPROVED_PRODUCTION_KEY_ID);
  assert.equal(signed.sequence, 7);
  assert.equal(assertMonotonicLifecycleSequence(7, 8), 8);
  assert.throws(() => assertMonotonicLifecycleSequence(7, 9), (error) => error.code === "non_monotonic_sequence");
  assert.equal(crypto.verify(
    null,
    Buffer.from(getLifecycleAuthoritySignatureData(signed), "utf8"),
    await provider.getPublicKey(),
    Buffer.from(signed.signature, "base64")
  ), true);
});
