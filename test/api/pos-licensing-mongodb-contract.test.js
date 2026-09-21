const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-mongodb-contract-test-only";

const {
  APPROVED_PRODUCTION_KEY_ID
} = require("../../server/config/posLicensingProduction");
const {
  POS_LICENSING_MONGO_CONNECTION_OPTIONS,
  getPosLicensingMongoConnectionOptions,
  validatePosLicensingMongoConfiguration
} = require("../../server/config/posLicensingMongo");
const {
  getPosLicensingProvisioningPlan,
  provisionPosLicensingDatabase,
  validatePosLicensingProvisioningPlan
} = require("../../server/licensing/posLicensingProvisioning");
const {
  runProductionLicensingReadiness
} = require("../../server/licensing/posLicensingReadiness");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS,
  inspectMongoTransactionCapability
} = require("../../server/licensing/posLicensingTransactions");
const {
  resolveDatabaseConnectionConfiguration
} = require("../../server/utils/db");

function authenticatedMongoUri(environment, databaseName, query = "") {
  const credentials = `${environment}_user:` + `${environment}_password`;
  return "mongodb+srv://" + credentials + `@${environment}-cluster.example/${databaseName}${query}`;
}

function mongoEnvironment(environment, overrides = {}) {
  const databaseName = environment === "production" ? "automatex_pos_production" : "automatex_pos_staging";
  return {
    AUTOMATEX_ENV: environment,
    NODE_ENV: "production",
    POS_LICENSING_MODE: environment,
    POS_LICENSING_ENVIRONMENT: environment,
    POS_LICENSING_CLIENT_SCOPE: `${environment}-only`,
    POS_LICENSING_SECRET_ENVIRONMENT: environment,
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: authenticatedMongoUri(environment, databaseName),
    POS_LICENSING_DATABASE_NAME: databaseName,
    ...overrides
  };
}

function productionEnvironment(overrides = {}) {
  const pair = crypto.generateKeyPairSync("ed25519");
  const privateJwk = pair.privateKey.export({ format: "jwk" });
  const publicJwk = pair.publicKey.export({ format: "jwk" });
  return {
    ...mongoEnvironment("production"),
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: Buffer.from(JSON.stringify(privateJwk), "utf8").toString("base64"),
    POS_LICENSING_EXPECTED_PUBLIC_JWK: JSON.stringify(publicJwk),
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
    POS_LICENSING_RATE_LIMIT_STORE_URI: "rediss://" + "rate_user:rate_password" + "@rate-limit.example:6380",
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

function transactionConnection(hello, options = {}) {
  const events = options.events || [];
  const session = {
    async withTransaction(callback, transactionOptions) {
      events.push(["withTransaction", transactionOptions]);
      if (options.probeError) {
        throw options.probeError;
      }
      await callback();
    },
    async endSession() {
      events.push(["endSession"]);
    }
  };
  return {
    db: {
      admin() {
        return { async command() { return hello; } };
      },
      collection(name) {
        return {
          async findOne(filter, findOptions) {
            events.push(["findOne", name, filter, findOptions]);
            return null;
          }
        };
      }
    },
    ...(options.noSessionApi ? {} : {
      async startSession() {
        events.push(["startSession"]);
        return options.session || session;
      }
    })
  };
}

test("production rejects localhost and unauthenticated MongoDB", () => {
  assert.throws(
    () => validatePosLicensingMongoConfiguration(mongoEnvironment("production", {
      MONGO_URI: "mongodb://127.0.0.1/automatex_pos_production?tls=true"
    }), "production"),
    (error) => error.code === "unsafe_mongodb_configuration"
  );
  assert.throws(
    () => validatePosLicensingMongoConfiguration(mongoEnvironment("production", {
      MONGO_URI: "mongodb+srv://production-cluster.example/automatex_pos_production"
    }), "production"),
    (error) => error.code === "unauthenticated_mongodb_configuration"
  );
});

test("production rejects development, test, staging, reserved, and ambiguous database names", () => {
  for (const databaseName of [
    "automatex_pos_development",
    "automatex_pos_test",
    "automatex_pos_staging",
    "local",
    "automatex_pos"
  ]) {
    assert.throws(
      () => validatePosLicensingMongoConfiguration(mongoEnvironment("production", {
        MONGO_URI: authenticatedMongoUri("production", databaseName),
        POS_LICENSING_DATABASE_NAME: databaseName
      }), "production"),
      (error) => error.code === "unsafe_database_name"
    );
  }
});

test("staging rejects production database and conflicting database identity", () => {
  assert.throws(
    () => validatePosLicensingMongoConfiguration(mongoEnvironment("staging", {
      MONGO_URI: authenticatedMongoUri("production", "automatex_pos_production"),
      POS_LICENSING_DATABASE_NAME: "automatex_pos_production"
    }), "staging"),
    (error) => error.code === "unsafe_database_name"
  );
  assert.throws(
    () => validatePosLicensingMongoConfiguration(mongoEnvironment("staging", {
      POS_LICENSING_SECRET_ENVIRONMENT: "production"
    }), "staging"),
    (error) => error.code === "secret_environment_mismatch"
  );
});

test("missing, implicit, and mismatched database names fail closed", () => {
  assert.throws(
    () => validatePosLicensingMongoConfiguration(mongoEnvironment("production", {
      POS_LICENSING_DATABASE_NAME: ""
    }), "production"),
    (error) => error.code === "missing_configuration"
  );
  assert.throws(
    () => validatePosLicensingMongoConfiguration(mongoEnvironment("production", {
      MONGO_URI: "mongodb+srv://" + "production_user:production_password" + "@production-cluster.example/"
    }), "production"),
    (error) => error.code === "implicit_database_forbidden"
  );
  assert.throws(
    () => validatePosLicensingMongoConfiguration(mongoEnvironment("production", {
      MONGO_URI: authenticatedMongoUri("production", "another_pos_production")
    }), "production"),
    (error) => error.code === "database_name_mismatch"
  );
});

test("production requires certificate-validating TLS and retry-safe URI policy", () => {
  const credentials = "production_user:production_password";
  assert.throws(
    () => validatePosLicensingMongoConfiguration(mongoEnvironment("production", {
      MONGO_URI: "mongodb://" + credentials + "@production-cluster.example/automatex_pos_production"
    }), "production"),
    (error) => error.code === "insecure_mongodb_transport"
  );
  for (const query of ["?tls=false", "?tlsInsecure=true", "?tlsAllowInvalidCertificates=true"] ) {
    assert.throws(
      () => validatePosLicensingMongoConfiguration(mongoEnvironment("production", {
        MONGO_URI: authenticatedMongoUri("production", "automatex_pos_production", query)
      }), "production"),
      (error) => error.code === "insecure_mongodb_transport"
    );
  }
  assert.throws(
    () => validatePosLicensingMongoConfiguration(mongoEnvironment("production", {
      MONGO_URI: authenticatedMongoUri("production", "automatex_pos_production", "?retryWrites=false")
    }), "production"),
    (error) => error.code === "unsafe_mongodb_retry_configuration"
  );
});

test("secure connection selection uses explicit database, bounded pool, timeouts, and retries", () => {
  const env = mongoEnvironment("production");
  const resolved = resolveDatabaseConnectionConfiguration(env);
  assert.equal(resolved.isolatedLicensingEnvironment, true);
  assert.equal(resolved.mongoUri, env.MONGO_URI);
  assert.equal(resolved.options.dbName, "automatex_pos_production");
  assert.equal(resolved.options.bufferCommands, false);
  assert.equal(resolved.options.autoCreate, false);
  assert.equal(resolved.options.autoIndex, false);
  assert.equal(resolved.options.serverSelectionTimeoutMS, 5000);
  assert.equal(resolved.options.connectTimeoutMS, 10000);
  assert.equal(resolved.options.minPoolSize, 0);
  assert.equal(resolved.options.maxPoolSize, 20);
  assert.equal(resolved.options.retryReads, true);
  assert.equal(resolved.options.retryWrites, true);
  assert.deepEqual(getPosLicensingMongoConnectionOptions("automatex_pos_production"), resolved.options);
  assert.equal(POS_LICENSING_MONGO_CONNECTION_OPTIONS.maxPoolSize, 20);
});

test("logical-session and transaction-topology failures block readiness", async () => {
  const noSessions = await inspectMongoTransactionCapability(transactionConnection({ setName: "rs0" }));
  assert.equal(noSessions.reason, "logical_sessions_unsupported");
  assert.equal(noSessions.supported, false);

  const standalone = await inspectMongoTransactionCapability(transactionConnection({ logicalSessionTimeoutMinutes: 30 }));
  assert.equal(standalone.reason, "transaction_topology_unsupported");
  assert.equal(standalone.supported, false);

  for (const capability of [noSessions, standalone]) {
    const report = await runProductionLicensingReadiness({ env: productionEnvironment(), transactionCapability: capability });
    assert.equal(report.ready, false);
    assert.equal(report.checks.find((check) => check.name === "transaction_capability").passed, false);
  }
});

test("missing session API and failed probe never downgrade to non-transactional access", async () => {
  const noSessionEvents = [];
  const noSession = await inspectMongoTransactionCapability(transactionConnection(
    { logicalSessionTimeoutMinutes: 30, setName: "rs0" },
    { noSessionApi: true, events: noSessionEvents }
  ));
  assert.equal(noSession.reason, "session_api_unavailable");
  assert.equal(noSessionEvents.some(([event]) => event === "findOne"), false);

  const failedEvents = [];
  const failedProbe = await inspectMongoTransactionCapability(transactionConnection(
    { logicalSessionTimeoutMinutes: 30, msg: "isdbgrid" },
    { probeError: new Error("simulated probe failure"), events: failedEvents }
  ));
  assert.equal(failedProbe.reason, "transaction_probe_failed");
  assert.equal(failedProbe.probePassed, false);
  assert.equal(failedEvents.some(([event]) => event === "findOne"), false);
});

test("successful simulated transaction probe uses required safety options and passes readiness", async () => {
  const events = [];
  const capability = await inspectMongoTransactionCapability(transactionConnection(
    { logicalSessionTimeoutMinutes: 30, setName: "rs0" },
    { events }
  ));
  assert.deepEqual(capability, {
    supported: true,
    verified: true,
    logicalSessions: true,
    transactionalTopology: true,
    probePassed: true,
    reason: "transaction_probe_passed"
  });
  assert.deepEqual(events.find(([event]) => event === "withTransaction")[1], REQUIRED_POS_TRANSACTION_OPTIONS);
  assert.equal(events.filter(([event]) => event === "findOne").length, 1);
  assert.equal(events.filter(([event]) => event === "endSession").length, 1);

  const report = await runProductionLicensingReadiness({
    env: productionEnvironment(),
    transactionCapability: capability,
    rateLimitStoreFactory: distributedStoreFactory
  });
  assert.equal(report.ready, true);
  for (const checkName of ["mongodb_config", "database_identity", "logical_sessions", "transaction_topology", "transaction_probe", "provisioning_definitions", "required_indexes"]) {
    assert.equal(report.checks.find((check) => check.name === checkName).passed, true, checkName);
  }
});

test("abort-only transaction probe verifies capability without a commit", async () => {
  const events = [];
  const session = {
    startTransaction(transactionOptions) {
      events.push(["startTransaction", transactionOptions]);
    },
    async abortTransaction() {
      events.push(["abortTransaction"]);
    },
    async endSession() {
      events.push(["endSession"]);
    }
  };
  const connection = transactionConnection(
    { logicalSessionTimeoutMinutes: 30, setName: "rs0" },
    { events, session }
  );
  const result = await inspectMongoTransactionCapability(connection, { abortAfterProbe: true });

  assert.equal(result.supported, true);
  assert.equal(result.probePassed, true);
  assert.deepEqual(events.find(([event]) => event === "startTransaction")[1], REQUIRED_POS_TRANSACTION_OPTIONS);
  assert.equal(events.filter(([event]) => event === "findOne").length, 1);
  assert.equal(events.filter(([event]) => event === "abortTransaction").length, 1);
  assert.equal(events.filter(([event]) => event === "withTransaction").length, 0);
  assert.equal(events.filter(([event]) => event === "endSession").length, 1);
});

test("provisioning dry run is repeatable, non-writing, and definitions stay valid", async () => {
  const connection = new Proxy({}, {
    get() {
      throw new Error("dry run touched the database connection");
    }
  });
  const first = await provisionPosLicensingDatabase(connection, { apply: false });
  const second = await provisionPosLicensingDatabase(connection, { apply: false });
  assert.equal(first.applied, false);
  assert.equal(second.applied, false);
  assert.equal(first.validation.valid, true);
  assert.equal(JSON.stringify(first.plan), JSON.stringify(second.plan));
  assert.deepEqual(validatePosLicensingProvisioningPlan(getPosLicensingProvisioningPlan()), { valid: true, errors: [] });
});

test("audit and licensing history indexes contain no TTL and required unique indexes remain defined", () => {
  const plan = getPosLicensingProvisioningPlan();
  for (const modelName of ["AuditLog", "PosLicenceIssue", "PosLifecycleAuthorityEvent"]) {
    const entry = plan.find((candidate) => candidate.model === modelName);
    assert.ok(entry, modelName);
    assert.equal(entry.indexes.some((index) => Object.prototype.hasOwnProperty.call(index.options, "expireAfterSeconds")), false);
  }
  const validation = validatePosLicensingProvisioningPlan(plan);
  assert.equal(validation.valid, true);
});

test("readiness output contains no MongoDB credentials or URI", async () => {
  const env = productionEnvironment();
  const capability = {
    supported: false,
    verified: true,
    logicalSessions: true,
    transactionalTopology: false,
    probePassed: false,
    reason: "transaction_topology_unsupported"
  };
  const report = await runProductionLicensingReadiness({ env, transactionCapability: capability });
  const output = JSON.stringify(report);
  assert.equal(output.includes(env.MONGO_URI), false);
  assert.equal(output.includes("production_password"), false);
  assert.match(output, /mongodb_configuration_valid/);
});

test("all default POS write services retain mandatory transaction wrappers", () => {
  const root = path.join(__dirname, "..", "..");
  for (const relativeFile of [
    "server/services/posActivationRedemptionService.js",
    "server/services/posActivationCodeAdminService.js",
    "server/services/posLicenceRenewalService.js",
    "server/services/posRenewalCredentialBootstrapService.js",
    "server/services/posLicenceLifecycleService.js"
  ]) {
    const source = fs.readFileSync(path.join(root, relativeFile), "utf8");
    assert.match(source, /MongoDB transactions are required/);
    assert.match(source, /session\.withTransaction/);
    assert.match(source, /REQUIRED_POS_TRANSACTION_OPTIONS/);
  }
});
