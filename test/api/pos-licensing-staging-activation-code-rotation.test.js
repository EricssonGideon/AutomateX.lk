const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-activation-code-rotation-test-only";

const {
  digestActivationCode
} = require("../../server/utils/posActivationCodeToken");
const {
  POS_STANDARD_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  STAGING_FIXTURE_MARKER,
  STAGING_FIXTURE_PACKAGE_CODE
} = require("../../server/services/stagingPosActivationFixtureService");
const {
  createStagingPosActivationCodeRotationService
} = require("../../server/services/stagingPosActivationCodeRotationService");
const {
  STAGING_TEST_FIXTURE_OPERATOR_ACTOR,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER
} = require("../../server/routes/internalStagingActivationFixture");
const {
  STAGING_ACTIVATION_CODE_ROTATION_FLAG,
  STAGING_ACTIVATION_CODE_ROTATION_PATH,
  mountStagingActivationCodeRotationEndpoint,
  rotationOutput,
  stagingActivationCodeRotationIsEnabled
} = require("../../server/routes/internalStagingActivationCodeRotation");

const NOW = new Date("2026-09-20T00:00:00.000Z");
const PACKAGE_ID = "507f1f77bcf86cd799439021";
const LICENCE_ID = "507f1f77bcf86cd799439022";
const OLD_CODE_ID = "507f1f77bcf86cd799439023";
const OLD_CODE = "posac_" + "1111222233334444".repeat(2);
const REPLACEMENT_CODE = "posac_" + "aaaabbbbccccdddd".repeat(2);
const OPERATOR_TOKEN = "rotation-operator-" + "r".repeat(48);

function stagingPreviewEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    POS_LICENSING_STAGING_TEST_FIXTURE_ENABLED: "false",
    [STAGING_ACTIVATION_CODE_ROTATION_FLAG]: "true",
    [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV]: OPERATOR_TOKEN,
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
  const request = { body: {}, headers: {}, method: "POST", ...req };
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

function validOperatorRequest(overrides = {}) {
  return {
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: OPERATOR_TOKEN },
    ...overrides
  };
}

function mountedHandlers(options = {}) {
  const router = routerRecorder();
  assert.equal(mountStagingActivationCodeRotationEndpoint(router, {
    env: stagingPreviewEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateDatabase() {},
    async runReadinessGate() { return eligibleReadiness(); },
    rotationService: {
      async rotateFixtureActivationCode() {
        return {
          rotated: true,
          activationCode: REPLACEMENT_CODE,
          activationCodeExpiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
          maxRedemptions: 1
        };
      }
    },
    rateLimitStoreFactory: {},
    ...options
  }), true);
  return router.registrations[0].handlers;
}

test("rotation endpoint mounts only on the exact staging Vercel Preview branch", () => {
  const router = routerRecorder();
  assert.equal(mountStagingActivationCodeRotationEndpoint(router, { env: stagingPreviewEnvironment() }), true);
  assert.equal(STAGING_ACTIVATION_CODE_ROTATION_PATH, "/internal/pos-licensing-staging-test-fixture/rotate-activation-code");
  assert.deepEqual(router.registrations.map(({ method, path }) => ({ method, path })), [{
    method: "POST",
    path: STAGING_ACTIVATION_CODE_ROTATION_PATH
  }]);

  for (const env of [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_ENABLED: "false" })
  ]) {
    const rejected = routerRecorder();
    assert.equal(mountStagingActivationCodeRotationEndpoint(rejected, { env }), false);
    assert.equal(rejected.registrations.length, 0);
  }
});

test("disabled rotation flag rejects before operator authorization, database, readiness, or writes", async () => {
  const counters = {};
  const env = stagingPreviewEnvironment({ [STAGING_ACTIVATION_CODE_ROTATION_FLAG]: "false" });
  const router = routerRecorder();
  mountStagingActivationCodeRotationEndpoint(router, {
    env,
    async connectionProvider() { counters.connection = 1; },
    async runReadinessGate() { counters.readiness = 1; },
    rotationService: { async rotateFixtureActivationCode() { counters.rotation = 1; } }
  });

  assert.equal(stagingActivationCodeRotationIsEnabled(env), false);
  const response = await invoke(router.registrations[0].handlers);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, rotationOutput(false, "staging_activation_code_rotation_unavailable"));
  assert.deepEqual(counters, {});
});

test("missing and wrong operator tokens cannot rotate", async () => {
  for (const headers of [
    {},
    { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: "wrong-" + "w".repeat(48) }
  ]) {
    let rotationCalls = 0;
    const response = await invoke(mountedHandlers({
      rotationService: { async rotateFixtureActivationCode() { rotationCalls += 1; } }
    }), { headers });
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, "staging_test_fixture_operator_unauthorized");
    assert.equal(JSON.stringify(response.body).includes(OPERATOR_TOKEN), false);
    assert.equal(rotationCalls, 0);
  }
});

test("failed staging readiness cannot rotate", async () => {
  let rotationCalls = 0;
  const response = await invoke(mountedHandlers({
    async runReadinessGate() {
      return eligibleReadiness({
        ready: false,
        eligibleForRouteMount: false,
        eligibleForStagingRouteMount: false,
        checks: [{ name: "transaction_probe", passed: false, code: "transaction_probe_not_passed" }]
      });
    },
    rotationService: { async rotateFixtureActivationCode() { rotationCalls += 1; } }
  }), validOperatorRequest());
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, rotationOutput(false, "staging_activation_code_rotation_readiness_failed"));
  assert.equal(rotationCalls, 0);
});

test("valid operator token returns one replacement plaintext only on first rotation", async () => {
  const response = await invoke(mountedHandlers(), validOperatorRequest());
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.rotated, true);
  assert.equal(response.body.activationCode, REPLACEMENT_CODE);
  assert.equal(response.body.maxRedemptions, 1);

  const repeated = await invoke(mountedHandlers({
    rotationService: {
      async rotateFixtureActivationCode() {
        return { rotated: false, alreadyRotated: true, maxRedemptions: 1 };
      }
    }
  }), validOperatorRequest());
  assert.equal(repeated.statusCode, 409);
  assert.deepEqual(repeated.body, rotationOutput(false, "staging_activation_code_already_rotated"));
  assert.equal(Object.prototype.hasOwnProperty.call(repeated.body, "activationCode"), false);
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
    records,
    calls,
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

function fixtureRepositories() {
  return {
    auditLogs: memoryRepository(),
    posPackages: memoryRepository([{
      _id: PACKAGE_ID,
      packageCode: STAGING_FIXTURE_PACKAGE_CODE,
      name: "[STAGING TEST] POS Standard",
      edition: "standard",
      status: "active",
      moduleIds: [...POS_STANDARD_MODULE_IDS],
      updateChannels: ["stable"],
      notes: STAGING_FIXTURE_MARKER,
      __v: 1
    }]),
    posLicences: memoryRepository([{
      _id: LICENCE_ID,
      clientId: "507f1f77bcf86cd799439024",
      projectId: "507f1f77bcf86cd799439025",
      packageId: PACKAGE_ID,
      edition: "standard",
      status: "active",
      entitledModules: [...POS_STANDARD_MODULE_IDS],
      updateChannel: "stable",
      licenceExpiry: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
      supportExpiry: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
      offlineValidUntil: new Date(NOW.getTime() + 6 * 60 * 60 * 1000),
      maxInstallations: 1,
      activationCount: 0,
      notes: STAGING_FIXTURE_MARKER,
      __v: 1
    }]),
    posActivationCodes: memoryRepository([{
      _id: OLD_CODE_ID,
      licenceId: LICENCE_ID,
      codeHash: digestActivationCode(OLD_CODE),
      status: "active",
      expiresAt: new Date(NOW.getTime() + 20 * 60 * 1000),
      maxRedemptions: 1,
      redeemedCount: 0,
      __v: 0
    }])
  };
}

test("rotation revokes the exposed code and persists exactly one hash-only replacement", async () => {
  const repositories = fixtureRepositories();
  let transactionCalls = 0;
  const service = createStagingPosActivationCodeRotationService({
    repositories,
    clock: () => NOW,
    generateCode: () => REPLACEMENT_CODE,
    async runInTransaction(callback) {
      transactionCalls += 1;
      return callback({ rotationSession: true });
    }
  });

  const first = await service.rotateFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.equal(first.rotated, true);
  assert.equal(first.activationCode, REPLACEMENT_CODE);
  assert.equal(first.maxRedemptions, 1);
  assert.equal(repositories.posActivationCodes.records.size, 2);

  const oldRecord = repositories.posActivationCodes.records.get(OLD_CODE_ID);
  const replacement = [...repositories.posActivationCodes.records.values()]
    .find((record) => String(record._id) !== OLD_CODE_ID);
  assert.equal(oldRecord.status, "revoked");
  assert.equal(replacement.status, "active");
  assert.equal(replacement.maxRedemptions, 1);
  assert.equal(replacement.codeHash, digestActivationCode(REPLACEMENT_CODE));
  assert.equal(Object.prototype.hasOwnProperty.call(replacement, "activationCode"), false);
  assert.equal(JSON.stringify([...repositories.auditLogs.records.values()]).includes(OLD_CODE), false);
  assert.equal(JSON.stringify([...repositories.auditLogs.records.values()]).includes(REPLACEMENT_CODE), false);
  assert.equal(JSON.stringify([...repositories.auditLogs.records.values()]).includes(replacement.codeHash), false);
  assert.equal(repositories.posActivationCodes.calls.findOneAndUpdate[0].session.rotationSession, true);
  assert.equal(repositories.posActivationCodes.calls.create[0].session.rotationSession, true);

  const repeated = await service.rotateFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.deepEqual(repeated, { rotated: false, alreadyRotated: true, maxRedemptions: 1 });
  assert.equal(Object.prototype.hasOwnProperty.call(repeated, "activationCode"), false);
  assert.equal(repositories.posActivationCodes.records.size, 2);
  assert.equal(transactionCalls, 2);
});
