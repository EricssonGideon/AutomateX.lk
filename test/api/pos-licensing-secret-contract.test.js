const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-secret-contract-test-only";

const AuditLog = require("../../server/models/AuditLog");
const {
  APPROVED_PRODUCTION_KEY_ID,
  validateProductionLicensingConfig,
  validateStagingLicensingConfig
} = require("../../server/config/posLicensingProduction");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const {
  loadRuntimeEnvironment,
  mayLoadLocalDotenv
} = require("../../server/config/loadRuntimeEnvironment");
const {
  runProductionLicensingReadiness
} = require("../../server/licensing/posLicensingReadiness");
const {
  SECRET_CATEGORIES,
  scanTextForPosSecrets,
  summarizeSecretScan
} = require("../../server/security/posSecretScanner");
const {
  createDraftPackage
} = require("../../server/controllers/posLicenceAdminController");
const { buildHealthPayload } = require("../../server/controllers/indexController");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");

function keyMaterial() {
  const pair = crypto.generateKeyPairSync("ed25519");
  const privateJwk = pair.privateKey.export({ format: "jwk" });
  const publicJwk = pair.publicKey.export({ format: "jwk" });
  return {
    privateJwk,
    publicJwk,
    privateJwkB64: Buffer.from(JSON.stringify(privateJwk), "utf8").toString("base64")
  };
}

function secretUris(environment) {
  const mongoPassword = `${environment}-mongo-credential-${"m".repeat(24)}`;
  const limiterPassword = `${environment}-limiter-credential-${"r".repeat(24)}`;
  return {
    mongoPassword,
    limiterPassword,
    mongoUri: "mongodb+srv://" + `${environment}_user:` + mongoPassword + `@${environment}-cluster.example/automatex_pos_${environment}`,
    rateLimitStoreUri: "rediss://" + `${environment}_user:` + limiterPassword + `@${environment}-limiter.example:6380`
  };
}

function productionEnv(overrides = {}) {
  const material = keyMaterial();
  const uris = secretUris("production");
  return {
    AUTOMATEX_ENV: "production",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "production",
    POS_LICENSING_ENVIRONMENT: "production",
    POS_LICENSING_CLIENT_SCOPE: "production-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "production",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: uris.mongoUri,
    POS_LICENSING_DATABASE_NAME: "automatex_pos_production",
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
    POS_LICENSING_RATE_LIMIT_STORE_URI: uris.rateLimitStoreUri,
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
    async healthCheck() { return { healthy: true }; },
    async increment() { return { totalHits: 1, resetTime: new Date(Date.now() + 60000) }; },
    async decrement() {},
    async resetKey() {}
  };
}

function stagingEnv(overrides = {}) {
  const material = keyMaterial();
  const uris = secretUris("staging");
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENVIRONMENT: "staging",
    POS_LICENSING_CLIENT_SCOPE: "staging-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "staging",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: uris.mongoUri,
    POS_LICENSING_DATABASE_NAME: "automatex_pos_staging",
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: material.privateJwkB64,
    POS_LICENSING_EXPECTED_PUBLIC_JWK: JSON.stringify(material.publicJwk),
    POS_LICENSING_SIGNING_KEY_ID: "automatex-pos-staging-ed25519-v1",
    POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing-staging.example.com",
    POS_LICENSING_PRODUCTION_HOSTNAME: "licensing.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "direct",
    ALLOWED_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    ...overrides
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
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test("missing and malformed production signing secrets fail closed", () => {
  const missing = productionEnv();
  delete missing.POS_LICENSING_SIGNING_PRIVATE_JWK_B64;
  assert.throws(() => validateProductionLicensingConfig(missing), (error) => error.code === "missing_configuration");

  const malformed = productionEnv({
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: Buffer.from("not-a-jwk", "utf8").toString("base64")
  });
  assert.throws(() => validateProductionLicensingConfig(malformed), (error) => error.code === "invalid_signing_key");
});

test("production rejects staging/test identities and staging rejects production identity", () => {
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_SIGNING_KEY_ID: "automatex-pos-staging-ed25519-v1" })),
    (error) => error.code === "unapproved_key_id"
  );
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_SECRET_ENVIRONMENT: "test" })),
    (error) => error.code === "secret_environment_mismatch"
  );
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({ POS_LICENSING_SECRET_ENVIRONMENT: "production" })),
    (error) => error.code === "secret_environment_mismatch"
  );
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({ POS_LICENSING_SIGNING_KEY_ID: APPROVED_PRODUCTION_KEY_ID })),
    (error) => error.code === "production_signing_fallback_forbidden"
  );
});

test("production and staging reject unapproved secret-source declarations", () => {
  for (const env of [productionEnv({ POS_LICENSING_SECRET_SOURCE: "request-body" }), stagingEnv({ POS_LICENSING_SECRET_SOURCE: "mongodb" })]) {
    assert.throws(
      () => env.AUTOMATEX_ENV === "production" ? validateProductionLicensingConfig(env) : validateStagingLicensingConfig(env),
      (error) => error.code === "unapproved_secret_source"
    );
  }
});

test("secure runtimes never load local dotenv files", () => {
  assert.equal(mayLoadLocalDotenv({ AUTOMATEX_ENV: "production", NODE_ENV: "production" }), false);
  assert.equal(mayLoadLocalDotenv({ AUTOMATEX_ENV: "staging", NODE_ENV: "production" }), false);
  assert.equal(mayLoadLocalDotenv({ AUTOMATEX_ENV: "test", NODE_ENV: "test" }), true);
  let called = false;
  const result = loadRuntimeEnvironment({
    env: { AUTOMATEX_ENV: "production", NODE_ENV: "production" },
    configureDotenv() {
      called = true;
    }
  });
  assert.equal(result.loaded, false);
  assert.equal(called, false);

  const localEnv = { AUTOMATEX_ENV: "development", NODE_ENV: "development" };
  assert.throws(
    () => loadRuntimeEnvironment({
      env: localEnv,
      configureDotenv() {
        localEnv.AUTOMATEX_ENV = "production";
        localEnv.NODE_ENV = "production";
      }
    }),
    (error) => error.code === "secure_dotenv_forbidden"
  );
});

test("configuration and readiness serialization never contain secret values", async () => {
  const env = productionEnv();
  const config = validateProductionLicensingConfig(env);
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
  const serialized = JSON.stringify({ config, report });
  for (const secret of [
    env.MONGO_URI,
    env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64,
    env.POS_LICENSING_EXPECTED_PUBLIC_JWK,
    env.POS_LICENSING_RATE_LIMIT_STORE_URI
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(report.ready, true);
});

test("targeted log sanitization removes representative POS secret values", () => {
  const env = productionEnv();
  const bearer = "Bearer " + "authorization-token-" + "a".repeat(32);
  const renewal = "posrc_" + "z".repeat(48);
  const output = sanitizeSensitiveText(
    `db=${env.MONGO_URI} limiter=${env.POS_LICENSING_RATE_LIMIT_STORE_URI} auth=${bearer} renewal=${renewal}`,
    { env }
  );
  for (const secret of [env.MONGO_URI, env.POS_LICENSING_RATE_LIMIT_STORE_URI, bearer, renewal]) {
    assert.equal(output.includes(secret), false);
  }
  assert.match(output, /\[REDACTED\]/);
});

test("audit records remove representative secrets before validation", async () => {
  const env = productionEnv();
  const renewal = "posrc_" + "q".repeat(48);
  const record = new AuditLog({
    action: "licences.secret-safety-check",
    module: "Licences",
    targetLabel: env.MONGO_URI,
    newValue: {
      note: `limiter=${env.POS_LICENSING_RATE_LIMIT_STORE_URI} renewal=${renewal}`,
      signingPrivateJwkB64: env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64,
      expectedPublicJwk: env.POS_LICENSING_EXPECTED_PUBLIC_JWK,
      harmlessReason: "configuration validated"
    }
  });
  await record.validate();
  const serialized = JSON.stringify(record.toObject());
  for (const secret of [env.MONGO_URI, env.POS_LICENSING_RATE_LIMIT_STORE_URI, env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64, env.POS_LICENSING_EXPECTED_PUBLIC_JWK, renewal]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(record.newValue.harmlessReason, "configuration validated");
});

test("health and POS admin error responses do not expose server secrets", async () => {
  const env = productionEnv();
  const health = JSON.stringify(buildHealthPayload(false));
  assert.equal(health.includes(env.MONGO_URI), false);
  assert.equal(health.includes(env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64), false);

  const res = responseRecorder();
  await createDraftPackage({
    user: { id: "507f1f77bcf86cd799439011", role: "admin" },
    body: { name: "unsafe", POS_LICENSING_SIGNING_PRIVATE_JWK_B64: env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64 }
  }, res);
  const adminBody = JSON.stringify(res.body);
  assert.equal(res.statusCode, 400);
  assert.equal(adminBody.includes(env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64), false);
});

test("request-body signing fields cannot become trusted configuration", () => {
  const secret = keyMaterial().privateJwkB64;
  const requestBody = { nested: { POS_LICENSING_SIGNING_PRIVATE_JWK_B64: secret } };
  assert.throws(
    () => assertNoPosLicensingServerSecretFields(requestBody),
    (error) => error.code === "untrusted_secret_source" && !error.message.includes(secret)
  );
});

test("accidental-secret fixtures are detected without echoing their contents", () => {
  const material = keyMaterial();
  const uris = secretUris("fixture");
  const bearerToken = "fixture-auth-" + "b".repeat(40);
  const renewalCredential = "posrc_" + "c".repeat(48);
  const fixture = [
    JSON.stringify(material.privateJwk),
    `MONGO_URI=${uris.mongoUri}`,
    `POS_LICENSING_RATE_LIMIT_STORE_URI=${uris.rateLimitStoreUri}`,
    "Authorization: Bearer " + bearerToken,
    "renewalCredential=" + renewalCredential
  ].join("\n");
  const findings = scanTextForPosSecrets("fixtures/accidental.env", fixture);
  const categories = new Set(findings.map((finding) => finding.category));
  for (const category of Object.values(SECRET_CATEGORIES)) {
    assert.equal(categories.has(category), true, category);
  }

  const safeOutput = JSON.stringify(summarizeSecretScan(findings, process.cwd()));
  for (const secret of [material.privateJwk.d, uris.mongoPassword, uris.limiterPassword, bearerToken, renewalCredential]) {
    assert.equal(safeOutput.includes(secret), false);
  }
  assert.match(safeOutput, /accidental\.env/);
});
