const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  assertPosLicensingStartupConfig,
  validateProductionLicensingConfig,
  validateStagingLicensingConfig
} = require("../../server/config/posLicensingProduction");
const {
  classifyRuntimeEnvironment
} = require("../../server/config/runtimeEnvironment");

function authenticatedMongoUri(environment, databaseName) {
  return "mongodb+srv://" + `${environment}_user:` + `${environment}_password` + `@${environment}-cluster.example/${databaseName}`;
}

function productionEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "production",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "production",
    POS_LICENSING_ENVIRONMENT: "production",
    POS_LICENSING_CLIENT_SCOPE: "production-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "production",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: authenticatedMongoUri("production", "automatex_pos_production"),
    POS_LICENSING_DATABASE_NAME: "automatex_pos_production",
    POS_LICENSING_MACHINE_API_BASE_PATH: "/api/pos-machine/v1",
    POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing.example.com",
    POS_LICENSING_PRODUCTION_HOSTNAME: "licensing.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "direct",
    ALLOWED_ORIGINS: "https://company.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    ...overrides
  };
}

function stagingEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENVIRONMENT: "staging",
    POS_LICENSING_CLIENT_SCOPE: "staging-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "staging",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: authenticatedMongoUri("staging", "automatex_pos_staging"),
    POS_LICENSING_DATABASE_NAME: "automatex_pos_staging",
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

test("development, test, staging, and production modes classify deterministically", () => {
  assert.deepEqual(classifyRuntimeEnvironment({}), {
    mode: "development",
    nodeEnv: "development",
    explicit: false,
    secureRuntime: false
  });
  assert.equal(classifyRuntimeEnvironment({ AUTOMATEX_ENV: "development", NODE_ENV: "development" }).mode, "development");
  assert.equal(classifyRuntimeEnvironment({ AUTOMATEX_ENV: "test", NODE_ENV: "test" }).mode, "test");
  assert.equal(classifyRuntimeEnvironment({ AUTOMATEX_ENV: "staging", NODE_ENV: "production" }).mode, "staging");
  assert.equal(classifyRuntimeEnvironment({ AUTOMATEX_ENV: "production", NODE_ENV: "production" }).mode, "production");
  assert.equal(classifyRuntimeEnvironment({ AUTOMATEX_ENV: "staging", NODE_ENV: "production" }).secureRuntime, true);
});

test("staging and production require explicit, matching runtime identities", () => {
  assert.throws(
    () => classifyRuntimeEnvironment({ NODE_ENV: "production" }),
    (error) => error.code === "explicit_environment_required"
  );
  assert.throws(
    () => classifyRuntimeEnvironment({ AUTOMATEX_ENV: "staging", NODE_ENV: "development" }),
    (error) => error.code === "environment_mismatch"
  );
  assert.throws(
    () => assertPosLicensingStartupConfig({ ...stagingEnvironment(), AUTOMATEX_ENV: "production" }),
    (error) => error.code === "environment_fallback_forbidden"
  );
});

test("production rejects localhost MongoDB", () => {
  assert.throws(
    () => validateProductionLicensingConfig(productionEnvironment({
      MONGO_URI: "mongodb://127.0.0.1/automatex_pos_production"
    })),
    (error) => error.code === "unsafe_mongodb_configuration"
  );
});

test("production rejects development, test, staging, local, and mock database names", () => {
  for (const databaseName of [
    "automatex_pos_development",
    "automatex_pos_test",
    "automatex_pos_staging",
    "automatex_pos_local",
    "automatex_pos_mock"
  ]) {
    assert.throws(
      () => validateProductionLicensingConfig(productionEnvironment({
        MONGO_URI: `mongodb+srv://production-cluster.example/${databaseName}`,
        POS_LICENSING_DATABASE_NAME: databaseName
      })),
      (error) => error.code === "unsafe_database_name"
    );
  }
});

test("missing production MongoDB configuration never falls back to a development alias", () => {
  const env = productionEnvironment({
    MONGO_URI: "",
    MONGODB_URI: "mongodb://127.0.0.1/automatex_pos_development"
  });
  assert.throws(
    () => assertPosLicensingStartupConfig(env),
    (error) => error.code === "missing_configuration" && /MONGO_URI/.test(error.message)
  );
});

test("production rejects insecure HTTP machine API configuration before key loading", () => {
  assert.throws(
    () => validateProductionLicensingConfig(productionEnvironment({
      POS_LICENSING_MACHINE_API_ORIGIN: "http://licensing.example.com"
    })),
    (error) => error.code === "https_origin_invalid"
  );
});

test("staging requires separate database, client scope, origin, and non-production signing identity", () => {
  const valid = validateStagingLicensingConfig(stagingEnvironment());
  assert.equal(valid.environment, "staging");
  assert.equal(valid.databaseName, "automatex_pos_staging");
  assert.equal(valid.clientScope, "staging-only");

  assert.throws(
    () => validateStagingLicensingConfig(stagingEnvironment({
      MONGO_URI: "mongodb+srv://production-cluster.example/automatex_pos_production",
      POS_LICENSING_DATABASE_NAME: "automatex_pos_production"
    })),
    (error) => error.code === "unsafe_database_name"
  );
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnvironment({
      POS_LICENSING_CLIENT_SCOPE: "production-only"
    })),
    (error) => error.code === "unsafe_client_scope"
  );
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnvironment({
      POS_LICENSING_SIGNING_KEY_ID: "automatex-pos-prod-ed25519-v1"
    })),
    (error) => error.code === "production_signing_fallback_forbidden"
  );
});

test("staging never falls back to MONGODB_URI or production data", () => {
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnvironment({
      MONGO_URI: "",
      MONGODB_URI: "mongodb+srv://production-cluster.example/automatex_pos_production"
    })),
    (error) => error.code === "missing_configuration"
  );
});

test("environment preparation does not mount POS licensing routes", () => {
  const root = path.join(__dirname, "..", "..");
  const routes = fs.readFileSync(path.join(root, "server", "routes", "index.js"), "utf8");
  assert.doesNotMatch(routes, /posActivation|posLicenceAdmin|pos-machine|pos-licensing/);
});
