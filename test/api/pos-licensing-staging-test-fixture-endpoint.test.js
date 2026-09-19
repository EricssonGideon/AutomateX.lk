const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-test-fixture-endpoint-test-only";

const {
  digestActivationCode
} = require("../../server/utils/posActivationCodeToken");
const {
  STAGING_FIXTURE_CLIENT_EMAIL,
  STAGING_FIXTURE_MARKER,
  STAGING_FIXTURE_PACKAGE_CODE,
  createStagingPosActivationFixtureService
} = require("../../server/services/stagingPosActivationFixtureService");
const {
  STAGING_TEST_FIXTURE_PATH,
  STAGING_TEST_FIXTURE_OPERATOR_ACTOR,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER,
  mountStagingTestFixtureEndpoint,
  operatorTokensMatch,
  readConfiguredOperatorToken,
  shouldMountStagingTestFixtureEndpoint,
  stagingTestFixtureIsEnabled,
  unavailableOutput,
  validateConnectedStagingDatabase
} = require("../../server/routes/internalStagingActivationFixture");

const ADMIN = Object.freeze({
  id: "507f1f77bcf86cd799439011",
  name: "Trusted Admin",
  email: "admin@example.com",
  role: "admin"
});
const FIXTURE_CODE = "posac_" + "0123456789abcdef".repeat(2);
const OPERATOR_TOKEN = "fixture-operator-" + "a".repeat(48);
const NOW = new Date("2026-09-19T00:00:00.000Z");

function stagingPreviewEnvironment(overrides = {}) {
  const databaseName = "automatex_pos_staging";
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    POS_LICENSING_STAGING_TEST_FIXTURE_ENABLED: "true",
    [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV]: OPERATOR_TOKEN,
    POS_LICENSING_ENVIRONMENT: "staging",
    POS_LICENSING_CLIENT_SCOPE: "staging-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "staging",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: "mongodb+srv://" + "staging_fixture_user:staging_fixture_password" + `@staging.example/${databaseName}`,
    POS_LICENSING_DATABASE_NAME: databaseName,
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    ...overrides
  };
}

function eligibleReadiness(overrides = {}) {
  return {
    environment: "staging",
    ready: true,
    technicalReadinessPassed: true,
    enablementRequested: true,
    eligibleForRouteMount: true,
    eligibleForStagingRouteMount: true,
    eligibleForProductionRouteMount: false,
    checks: [{ name: "staging_enablement", passed: true, code: "staging_enablement_explicit" }],
    ...overrides
  };
}

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function routerRecorder() {
  return {
    registrations: [],
    post(path, ...handlers) { this.registrations.push({ method: "POST", path, handlers }); }
  };
}

async function invoke(handlers, req = {}) {
  const response = responseRecorder();
  const request = {
    body: {},
    headers: {},
    method: "POST",
    ...req
  };
  let index = 0;
  async function next() {
    const handler = handlers[index++];
    if (handler) {
      return handler(request, response, next);
    }
  }
  await next();
  return response;
}

function mountedHandlers(options = {}) {
  const router = routerRecorder();
  const mounted = mountStagingTestFixtureEndpoint(router, {
    env: stagingPreviewEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateDatabase() {},
    async runReadinessGate() { return eligibleReadiness(); },
    fixtureService: {
      async createFixture() {
        return { created: true, activationCode: FIXTURE_CODE };
      }
    },
    rateLimitStoreFactory: {},
    ...options
  });
  assert.equal(mounted, true);
  return router.registrations[0].handlers;
}

function validOperatorRequest(overrides = {}) {
  return {
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: OPERATOR_TOKEN },
    ...overrides
  };
}

test("temporary fixture endpoint mounts only on the exact staging Preview branch", () => {
  const router = routerRecorder();
  assert.equal(mountStagingTestFixtureEndpoint(router, { env: stagingPreviewEnvironment() }), true);
  assert.equal(STAGING_TEST_FIXTURE_PATH, "/internal/pos-licensing-staging-test-fixture");
  assert.deepEqual(router.registrations.map(({ method, path }) => ({ method, path })), [{
    method: "POST",
    path: STAGING_TEST_FIXTURE_PATH
  }]);

  for (const env of [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ VERCEL: "" }),
    stagingPreviewEnvironment({ AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_ENABLED: "false" })
  ]) {
    assert.equal(shouldMountStagingTestFixtureEndpoint(env), false);
    const rejected = routerRecorder();
    assert.equal(mountStagingTestFixtureEndpoint(rejected, { env }), false);
    assert.equal(rejected.registrations.length, 0);
  }
});

test("disabled fixture flag returns unavailable before database, auth, readiness, or writes", async () => {
  const counters = {};
  const env = stagingPreviewEnvironment({ POS_LICENSING_STAGING_TEST_FIXTURE_ENABLED: "false" });
  const router = routerRecorder();
  mountStagingTestFixtureEndpoint(router, {
    env,
    async connectionProvider() { counters.connection = 1; },
    async runReadinessGate() { counters.readiness = 1; },
    fixtureService: { async createFixture() { counters.fixture = 1; } }
  });

  assert.equal(stagingTestFixtureIsEnabled(env), false);
  const response = await invoke(router.registrations[0].handlers);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, unavailableOutput());
  assert.deepEqual(counters, {});
});

test("missing and wrong staging operator tokens are rejected before database, readiness, or writes", async () => {
  const secret = OPERATOR_TOKEN;
  for (const headers of [
    {},
    { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: "wrong-" + "b".repeat(48) }
  ]) {
    const response = await invoke(mountedHandlers(), { headers });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, unavailableOutput("staging_test_fixture_operator_unauthorized"));
    assert.equal(JSON.stringify(response.body).includes(secret), false);
  }
});

test("operator token configuration requires a high-entropy server-only value", async () => {
  for (const value of [undefined, "", "short", "contains spaces " + "x".repeat(40)]) {
    const env = stagingPreviewEnvironment({ [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV]: value });
    assert.equal(readConfiguredOperatorToken(env), "");
    const response = await invoke(mountedHandlers({ env }), validOperatorRequest());
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, unavailableOutput("staging_test_fixture_operator_unavailable"));
  }
  assert.equal(readConfiguredOperatorToken(stagingPreviewEnvironment()), OPERATOR_TOKEN);
  assert.equal(operatorTokensMatch(OPERATOR_TOKEN, OPERATOR_TOKEN), true);
  assert.equal(operatorTokensMatch(OPERATOR_TOKEN, "wrong-" + "c".repeat(48)), false);
});

test("valid staging operator token supplies only the fixed internal actor", async () => {
  let receivedActor = null;
  const response = await invoke(mountedHandlers({
    fixtureService: {
      async createFixture(actor) {
        receivedActor = actor;
        return { created: true, activationCode: FIXTURE_CODE };
      }
    }
  }), validOperatorRequest());
  assert.equal(response.statusCode, 201);
  assert.deepEqual(receivedActor, STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.equal(JSON.stringify(receivedActor).includes(OPERATOR_TOKEN), false);
});

test("failed staging readiness cannot create a fixture", async () => {
  let fixtureCalls = 0;
  const response = await invoke(mountedHandlers({
    async runReadinessGate() {
      return eligibleReadiness({
        ready: false,
        eligibleForRouteMount: false,
        eligibleForStagingRouteMount: false,
        checks: [{ name: "transaction_probe", passed: false, code: "transaction_probe_not_passed" }]
      });
    },
    fixtureService: { async createFixture() { fixtureCalls += 1; } }
  }), validOperatorRequest());

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, unavailableOutput("staging_test_fixture_readiness_failed"));
  assert.equal(fixtureCalls, 0);
});

test("production or mismatched connected database identity is rejected", () => {
  const env = stagingPreviewEnvironment();
  assert.throws(
    () => validateConnectedStagingDatabase(env, {
      name: "automatex_pos_production",
      db: { databaseName: "automatex_pos_production" }
    }),
    /does not match/
  );
  assert.doesNotThrow(() => validateConnectedStagingDatabase(env, {
    name: "automatex_pos_staging",
    db: { databaseName: "automatex_pos_staging" }
  }));
});

test("successful response returns the activation plaintext once with controlled limits", async () => {
  const response = await invoke(mountedHandlers(), validOperatorRequest());
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, {
    created: true,
    code: "staging_test_fixture_created",
    activationCode: FIXTURE_CODE,
    edition: "standard",
    maxInstallations: 1,
    maxRedemptions: 1
  });

  const repeat = await invoke(mountedHandlers({
    fixtureService: { async createFixture() { return { created: false, alreadyExists: true }; } }
  }), validOperatorRequest());
  assert.equal(repeat.statusCode, 409);
  assert.deepEqual(repeat.body, { created: false, code: "staging_test_fixture_already_exists" });
  assert.equal(Object.prototype.hasOwnProperty.call(repeat.body, "activationCode"), false);
});

function clone(record) {
  return record ? {
    ...record,
    moduleIds: Array.isArray(record.moduleIds) ? [...record.moduleIds] : record.moduleIds,
    updateChannels: Array.isArray(record.updateChannels) ? [...record.updateChannels] : record.updateChannels,
    entitledModules: Array.isArray(record.entitledModules) ? [...record.entitledModules] : record.entitledModules
  } : null;
}

function matches(record, query = {}) {
  return Object.entries(query).every(([field, expected]) => String(record[field] || "") === String(expected || ""));
}

function memoryRepository(initialRecords = []) {
  const records = new Map(initialRecords.map((record) => [String(record._id), clone(record)]));
  const calls = { create: [], findOneAndUpdate: [] };
  return {
    calls,
    records,
    async create(input, options = {}) {
      calls.create.push(options);
      const candidates = Array.isArray(input) ? input : [input];
      const created = candidates.map((candidate) => {
        const _id = candidate._id || new mongoose.Types.ObjectId().toString();
        const record = { __v: 0, createdAt: NOW, updatedAt: NOW, ...candidate, _id };
        records.set(String(_id), clone(record));
        return clone(record);
      });
      return Array.isArray(input) ? created : created[0];
    },
    async find(query) {
      return [...records.values()].filter((record) => matches(record, query)).map(clone);
    },
    async findById(id) {
      return clone(records.get(String(id)));
    },
    async findOne(query) {
      return clone([...records.values()].find((record) => matches(record, query)));
    },
    async findOneAndUpdate(query, update, options = {}) {
      calls.findOneAndUpdate.push(options);
      const existing = [...records.values()].find((record) => matches(record, query));
      if (!existing) {
        return null;
      }
      const updated = {
        ...existing,
        ...(update.$set || {}),
        __v: Number(existing.__v || 0) + Number(update.$inc && update.$inc.__v || 0),
        updatedAt: NOW
      };
      records.set(String(existing._id), clone(updated));
      return clone(updated);
    }
  };
}

test("transactional service creates one controlled fixture and persists only the activation hash", async () => {
  const repositories = {
    users: memoryRepository(),
    projects: memoryRepository(),
    auditLogs: memoryRepository(),
    posPackages: memoryRepository(),
    posLicences: memoryRepository(),
    posActivationCodes: memoryRepository()
  };
  let transactionCalls = 0;
  const service = createStagingPosActivationFixtureService({
    repositories,
    clock: () => NOW,
    generateCode: () => FIXTURE_CODE,
    hashPassword: async () => "non-login-test-hash",
    async runInTransaction(callback) {
      transactionCalls += 1;
      return callback({ fixtureSession: true });
    }
  });

  const first = await service.createFixture(ADMIN);
  assert.equal(first.created, true);
  assert.equal(first.activationCode, FIXTURE_CODE);
  assert.equal(first.maxInstallations, 1);
  assert.equal(first.maxRedemptions, 1);
  assert.equal(repositories.users.records.size, 1);
  assert.equal(repositories.projects.records.size, 1);
  assert.equal(repositories.posPackages.records.size, 1);
  assert.equal(repositories.posLicences.records.size, 1);
  assert.equal(repositories.posActivationCodes.records.size, 1);

  const client = [...repositories.users.records.values()][0];
  const posPackage = [...repositories.posPackages.records.values()][0];
  const licence = [...repositories.posLicences.records.values()][0];
  const activationCode = [...repositories.posActivationCodes.records.values()][0];
  assert.equal(client.email, STAGING_FIXTURE_CLIENT_EMAIL);
  assert.equal(client.businessName, STAGING_FIXTURE_MARKER);
  assert.equal(posPackage.packageCode, STAGING_FIXTURE_PACKAGE_CODE);
  assert.equal(posPackage.status, "active");
  assert.equal(licence.status, "active");
  assert.equal(licence.maxInstallations, 1);
  assert.equal(activationCode.maxRedemptions, 1);
  assert.equal(activationCode.codeHash, digestActivationCode(FIXTURE_CODE));
  assert.equal(Object.prototype.hasOwnProperty.call(activationCode, "activationCode"), false);
  assert.equal(JSON.stringify([...repositories.auditLogs.records.values()]).includes(FIXTURE_CODE), false);
  assert.equal(JSON.stringify([...repositories.auditLogs.records.values()]).includes(activationCode.codeHash), false);
  [
    repositories.users,
    repositories.projects,
    repositories.posPackages,
    repositories.posLicences,
    repositories.posActivationCodes,
    repositories.auditLogs
  ].forEach((repository) => {
    assert.equal(repository.calls.create.every((options) => options.session && options.session.fixtureSession), true);
  });
  assert.equal(repositories.posPackages.calls.findOneAndUpdate[0].session.fixtureSession, true);
  assert.equal(repositories.posLicences.calls.findOneAndUpdate[0].session.fixtureSession, true);

  const second = await service.createFixture(ADMIN);
  assert.deepEqual(second, {
    created: false,
    alreadyExists: true,
    maxInstallations: 1,
    maxRedemptions: 1
  });
  assert.equal(Object.prototype.hasOwnProperty.call(second, "activationCode"), false);
  assert.equal(repositories.users.records.size, 1);
  assert.equal(repositories.projects.records.size, 1);
  assert.equal(repositories.posPackages.records.size, 1);
  assert.equal(repositories.posLicences.records.size, 1);
  assert.equal(repositories.posActivationCodes.records.size, 1);
  assert.equal(transactionCalls, 2);
});
