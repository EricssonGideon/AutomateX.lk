const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  EXPECTED_COLLECTION_COUNT,
  EXPECTED_INDEX_COUNT,
  STAGING_APPLY_CONFIRMATION,
  STAGING_LOCAL_EXECUTION_MODE,
  executeStagingProvisioningCommand,
  runStagingProvisioning,
  validateStagingExecutionContext
} = require("../../scripts/provisionPosLicensingStaging");

function stagingEnvironment(overrides = {}) {
  const databaseName = "automatex_pos_staging";
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENVIRONMENT: "staging",
    POS_LICENSING_CLIENT_SCOPE: "staging-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "staging",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: "mongodb+srv://" + "staging_user:staging_password" + `@staging-cluster.example/${databaseName}`,
    POS_LICENSING_DATABASE_NAME: databaseName,
    POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing-staging.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "direct",
    ALLOWED_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    POS_LICENSING_STAGING_PROVISION_EXECUTION: STAGING_LOCAL_EXECUTION_MODE,
    ...overrides
  };
}

function mongoStub() {
  const collections = new Map();
  const connection = {
    db: {
      async createCollection(name) {
        if (collections.has(name)) {
          const error = new Error("already exists");
          error.code = 48;
          throw error;
        }
        collections.set(name, new Map());
      },
      collection(name) {
        return {
          async createIndex(key, options) {
            collections.get(name).set(options.name, { key, options });
          }
        };
      }
    }
  };
  return {
    connection,
    collections,
    connectCalls: 0,
    disconnectCalls: 0,
    async connect(_uri, options) {
      this.connectCalls += 1;
      assert.equal(options.dbName, "automatex_pos_staging");
    },
    async disconnect() {
      this.disconnectCalls += 1;
    }
  };
}

test("package exposes a separate staging provisioner and leaves production command unchanged", () => {
  const root = path.join(__dirname, "..", "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const productionScript = fs.readFileSync(path.join(root, "scripts", "provisionPosLicensing.js"), "utf8");
  assert.equal(packageJson.scripts["provision:pos-licensing"], "node scripts/provisionPosLicensing.js");
  assert.equal(packageJson.scripts["provision:pos-licensing-staging"], "node scripts/provisionPosLicensingStaging.js");
  assert.match(productionScript, /validateProductionLicensingConfig/);
  assert.doesNotMatch(productionScript, /validateStagingLicensingConfig/);
});

test("staging dry run validates the fixed seven-collection and 40-index plan without connecting", async () => {
  const mongo = mongoStub();
  const output = await runStagingProvisioning({
    env: stagingEnvironment(),
    argv: [],
    mongo
  });
  assert.equal(output.environment, "staging");
  assert.equal(output.mode, "dry-run");
  assert.equal(output.applied, false);
  assert.equal(output.valid, true);
  assert.equal(output.collectionCount, EXPECTED_COLLECTION_COUNT);
  assert.equal(output.indexCount, EXPECTED_INDEX_COUNT);
  assert.equal(output.collections.reduce((total, entry) => total + entry.indexes.length, 0), EXPECTED_INDEX_COUNT);
  assert.equal(mongo.connectCalls, 0);
  assert.equal(mongo.disconnectCalls, 0);
});

test("execution requires verified Vercel Preview or explicit approved local staging mode", () => {
  assert.equal(validateStagingExecutionContext(stagingEnvironment()).execution, STAGING_LOCAL_EXECUTION_MODE);
  assert.equal(validateStagingExecutionContext(stagingEnvironment({
    POS_LICENSING_STAGING_PROVISION_EXECUTION: "",
    VERCEL: "1",
    VERCEL_ENV: "preview"
  })).execution, "vercel-preview");

  for (const overrides of [
    { POS_LICENSING_STAGING_PROVISION_EXECUTION: "", VERCEL_ENV: "preview" },
    { POS_LICENSING_STAGING_PROVISION_EXECUTION: STAGING_LOCAL_EXECUTION_MODE, VERCEL: "1", VERCEL_ENV: "production" },
    { POS_LICENSING_STAGING_PROVISION_EXECUTION: "" }
  ]) {
    assert.throws(
      () => validateStagingExecutionContext(stagingEnvironment(overrides)),
      (error) => error.code === "staging_execution_context_rejected"
    );
  }
});

test("production runtime and production database identities are rejected before connection", async () => {
  const productionMongo = mongoStub();
  await assert.rejects(
    runStagingProvisioning({
      env: stagingEnvironment({
        AUTOMATEX_ENV: "production",
        POS_LICENSING_MODE: "production"
      }),
      mongo: productionMongo
    }),
    (error) => error.code === "staging_environment_required"
  );
  assert.equal(productionMongo.connectCalls, 0);

  const ambiguousMongo = mongoStub();
  const ambiguousDatabase = "automatex_pos_staging_production";
  await assert.rejects(
    runStagingProvisioning({
      env: stagingEnvironment({
        MONGO_URI: "mongodb+srv://" + "staging_user:staging_password" + `@staging-cluster.example/${ambiguousDatabase}`,
        POS_LICENSING_DATABASE_NAME: ambiguousDatabase
      }),
      mongo: ambiguousMongo
    }),
    (error) => error.code === "unsafe_database_name"
  );
  assert.equal(ambiguousMongo.connectCalls, 0);
});

test("staging apply requires its separate confirmation and uses only the shared idempotent plan", async () => {
  const unconfirmedMongo = mongoStub();
  await assert.rejects(
    runStagingProvisioning({
      env: stagingEnvironment(),
      argv: ["--apply"],
      mongo: unconfirmedMongo
    }),
    (error) => error.code === "staging_apply_confirmation_required"
  );
  assert.equal(unconfirmedMongo.connectCalls, 0);

  const mongo = mongoStub();
  const env = stagingEnvironment({
    POS_LICENSING_STAGING_PROVISION_CONFIRM: STAGING_APPLY_CONFIRMATION
  });
  const first = await runStagingProvisioning({ env, argv: ["--apply"], mongo });
  const second = await runStagingProvisioning({ env, argv: ["--apply"], mongo });
  assert.equal(first.applied, true);
  assert.equal(first.collectionCount, EXPECTED_COLLECTION_COUNT);
  assert.equal(first.indexCount, EXPECTED_INDEX_COUNT);
  assert.equal(second.collectionCount, EXPECTED_COLLECTION_COUNT);
  assert.equal(second.indexCount, EXPECTED_INDEX_COUNT);
  assert.equal(mongo.collections.size, EXPECTED_COLLECTION_COUNT);
  assert.equal([...mongo.collections.values()].reduce((total, indexes) => total + indexes.size, 0), EXPECTED_INDEX_COUNT);
  assert.equal(mongo.connectCalls, 2);
  assert.equal(mongo.disconnectCalls, 2);
});

test("staging apply can reuse a readiness-verified connection without reconnecting or disconnecting it", async () => {
  const mongo = mongoStub();
  const env = stagingEnvironment({
    POS_LICENSING_STAGING_PROVISION_CONFIRM: STAGING_APPLY_CONFIRMATION
  });
  const result = await runStagingProvisioning({
    env,
    argv: ["--apply"],
    mongo,
    connection: mongo.connection
  });
  assert.equal(result.applied, true);
  assert.equal(result.collectionCount, EXPECTED_COLLECTION_COUNT);
  assert.equal(result.indexCount, EXPECTED_INDEX_COUNT);
  assert.equal(mongo.connectCalls, 0);
  assert.equal(mongo.disconnectCalls, 0);
});

test("staging provisioning output never includes MongoDB credentials or URI", async () => {
  const env = stagingEnvironment();
  const written = [];
  await executeStagingProvisioningCommand({
    env,
    argv: [],
    mongo: mongoStub(),
    stdout: { write(value) { written.push(value); } }
  });
  const output = written.join("");
  assert.equal(output.includes(env.MONGO_URI), false);
  assert.equal(output.includes("staging_password"), false);
  assert.equal(output.includes("secret-manager"), false);
});
