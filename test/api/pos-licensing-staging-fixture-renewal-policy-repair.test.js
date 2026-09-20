const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-renewal-policy-repair-test-only";

const {
  POS_STANDARD_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  STAGING_FIXTURE_MARKER
} = require("../../server/services/stagingPosActivationFixtureService");
const {
  STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_AUDIT_ACTION,
  STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES,
  createStagingPosFixtureRenewalPolicyRepairService
} = require("../../server/services/stagingPosFixtureRenewalPolicyRepairService");
const {
  STAGING_TEST_FIXTURE_OPERATOR_ACTOR,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER
} = require("../../server/routes/internalStagingActivationFixture");
const {
  STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_FLAG,
  STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_PATH,
  mountStagingFixtureRenewalPolicyRepairEndpoint,
  repairOutput,
  stagingFixtureRenewalPolicyRepairIsEnabled
} = require("../../server/routes/internalStagingFixtureRenewalPolicyRepair");

const LICENCE_ID = "507f1f77bcf86cd799439081";
const OTHER_LICENCE_ID = "507f1f77bcf86cd799439082";
const OPERATOR_TOKEN = "renewal-policy-repair-" + "r".repeat(48);
const SECRET_SENTINEL = "representative-secret-not-for-output";

function stagingPreviewEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    [STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_FLAG]: "true",
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
    post(routePath, ...handlers) { this.registrations.push({ method: "POST", path: routePath, handlers }); }
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

function operatorRequest() {
  return { headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: OPERATOR_TOKEN } };
}

function mountedHandlers(options = {}) {
  const router = routerRecorder();
  assert.equal(mountStagingFixtureRenewalPolicyRepairEndpoint(router, {
    env: stagingPreviewEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateDatabase() {},
    async runReadinessGate() { return eligibleReadiness(); },
    repairService: {
      async repairFixtureRenewalPolicy() {
        return { repaired: true, alreadyRepaired: false, renewalWindowDurationMinutes: 60 };
      }
    },
    rateLimitStoreFactory: {},
    ...options
  }), true);
  return router.registrations[0].handlers;
}

function clone(record) {
  return record ? {
    ...record,
    entitledModules: Array.isArray(record.entitledModules) ? [...record.entitledModules] : record.entitledModules
  } : null;
}

function comparable(value) {
  return value instanceof Date ? value.toISOString() : String(value && (value._id || value.id || value) || "");
}

function matchesExpected(value, expected) {
  if (expected && typeof expected === "object" && !(expected instanceof Date)) {
    if (Object.prototype.hasOwnProperty.call(expected, "$exists")) {
      const exists = typeof value !== "undefined";
      if (exists !== expected.$exists) {
        return false;
      }
    }
    if (Object.prototype.hasOwnProperty.call(expected, "$eq")) {
      return comparable(value) === comparable(expected.$eq);
    }
  }
  return comparable(value) === comparable(expected);
}

function matches(record, query = {}) {
  return Object.entries(query).every(([field, expected]) => matchesExpected(record[field], expected));
}

function memoryRepository(initialRecords = []) {
  const records = new Map(initialRecords.map((record) => [String(record._id), clone(record)]));
  const calls = { create: [], findOneAndUpdate: [] };
  return {
    records,
    calls,
    async create(input, options = {}) {
      calls.create.push({ input, options });
      const candidates = Array.isArray(input) ? input : [input];
      const created = candidates.map((candidate, index) => {
        const record = { ...candidate, _id: candidate._id || `audit-${records.size + index + 1}` };
        records.set(String(record._id), clone(record));
        return clone(record);
      });
      return Array.isArray(input) ? created : created[0];
    },
    async find(query) {
      return [...records.values()].filter((record) => matches(record, query)).map(clone);
    },
    async findOneAndUpdate(query, update, options = {}) {
      calls.findOneAndUpdate.push({ query, update, options });
      const existing = [...records.values()].find((record) => matches(record, query));
      if (!existing) {
        return null;
      }
      const updated = { ...existing, ...(update.$set || {}) };
      records.set(String(existing._id), clone(updated));
      return clone(updated);
    }
  };
}

function controlledLicence(overrides = {}) {
  return {
    _id: LICENCE_ID,
    clientId: "507f1f77bcf86cd799439083",
    projectId: "507f1f77bcf86cd799439084",
    packageId: "507f1f77bcf86cd799439085",
    notes: STAGING_FIXTURE_MARKER,
    edition: "standard",
    status: "active",
    entitledModules: [...POS_STANDARD_MODULE_IDS],
    updateChannel: "stable",
    licenceExpiry: new Date("2026-09-21T08:00:00.000Z"),
    supportExpiry: new Date("2026-09-21T08:00:00.000Z"),
    offlineValidUntil: new Date("2026-09-20T14:00:00.000Z"),
    renewalWindowDurationMinutes: null,
    maxInstallations: 1,
    activationCount: 1,
    createdBy: "507f1f77bcf86cd799439086",
    updatedBy: "507f1f77bcf86cd799439086",
    createdAt: new Date("2026-09-20T06:00:00.000Z"),
    updatedAt: new Date("2026-09-20T07:00:00.000Z"),
    __v: 4,
    ...overrides
  };
}

function fixtureRepositories(licenceOverrides = {}) {
  return {
    auditLogs: memoryRepository(),
    posLicences: memoryRepository([
      controlledLicence(licenceOverrides),
      controlledLicence({
        _id: OTHER_LICENCE_ID,
        notes: "unrelated-staging-licence",
        renewalWindowDurationMinutes: 30
      })
    ])
  };
}

test("renewal-policy repair endpoint mounts only on the exact staging Vercel Preview branch", () => {
  const router = routerRecorder();
  assert.equal(mountStagingFixtureRenewalPolicyRepairEndpoint(router, { env: stagingPreviewEnvironment() }), true);
  assert.equal(
    STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_PATH,
    "/internal/pos-licensing-staging-test-fixture/repair-renewal-policy"
  );

  for (const env of [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_ENABLED: "false" })
  ]) {
    const rejected = routerRecorder();
    assert.equal(mountStagingFixtureRenewalPolicyRepairEndpoint(rejected, { env }), false);
    assert.equal(rejected.registrations.length, 0);
  }
});

test("disabled repair flag rejects before authorization, database, readiness, or writes", async () => {
  const counters = {};
  const env = stagingPreviewEnvironment({ [STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_FLAG]: "false" });
  const router = routerRecorder();
  mountStagingFixtureRenewalPolicyRepairEndpoint(router, {
    env,
    async connectionProvider() { counters.connection = 1; },
    async runReadinessGate() { counters.readiness = 1; },
    repairService: { async repairFixtureRenewalPolicy() { counters.repair = 1; } }
  });

  assert.equal(stagingFixtureRenewalPolicyRepairIsEnabled(env), false);
  const response = await invoke(router.registrations[0].handlers);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, repairOutput(false, "staging_fixture_renewal_policy_repair_unavailable"));
  assert.deepEqual(counters, {});
});

test("wrong operator token and failed readiness cannot repair the policy", async () => {
  let repairCalls = 0;
  const wrongToken = await invoke(mountedHandlers({
    repairService: { async repairFixtureRenewalPolicy() { repairCalls += 1; } }
  }), {
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: "wrong-" + "w".repeat(48) }
  });
  assert.equal(wrongToken.statusCode, 401);
  assert.equal(wrongToken.body.code, "staging_test_fixture_operator_unauthorized");
  assert.equal(repairCalls, 0);

  const failedReadiness = await invoke(mountedHandlers({
    async runReadinessGate() {
      return eligibleReadiness({
        ready: false,
        eligibleForRouteMount: false,
        eligibleForStagingRouteMount: false
      });
    },
    repairService: { async repairFixtureRenewalPolicy() { repairCalls += 1; } }
  }), operatorRequest());
  assert.equal(failedReadiness.statusCode, 503);
  assert.deepEqual(
    failedReadiness.body,
    repairOutput(false, "staging_fixture_renewal_policy_repair_readiness_failed")
  );
  assert.equal(repairCalls, 0);
});

test("valid guarded request returns only the sanitized repair result", async () => {
  const response = await invoke(mountedHandlers(), operatorRequest());
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    repaired: true,
    renewalWindowDurationMinutes: 60,
    code: "staging_fixture_renewal_policy_repaired"
  });
  assert.equal(JSON.stringify(response.body).includes(SECRET_SENTINEL), false);
});

test("transaction changes only renewalWindowDurationMinutes from null to 60 and audits safely", async () => {
  const repositories = fixtureRepositories();
  const before = clone(repositories.posLicences.records.get(LICENCE_ID));
  const unrelatedBefore = clone(repositories.posLicences.records.get(OTHER_LICENCE_ID));
  const service = createStagingPosFixtureRenewalPolicyRepairService({
    repositories,
    async runInTransaction(callback) { return callback({ repairSession: true }); }
  });

  const result = await service.repairFixtureRenewalPolicy(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.deepEqual(result, {
    repaired: true,
    alreadyRepaired: false,
    renewalWindowDurationMinutes: STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES
  });

  const after = clone(repositories.posLicences.records.get(LICENCE_ID));
  assert.equal(before.renewalWindowDurationMinutes, null);
  assert.equal(after.renewalWindowDurationMinutes, 60);
  delete before.renewalWindowDurationMinutes;
  delete after.renewalWindowDurationMinutes;
  assert.deepEqual(after, before);
  assert.deepEqual(repositories.posLicences.records.get(OTHER_LICENCE_ID), unrelatedBefore);

  const update = repositories.posLicences.calls.findOneAndUpdate[0];
  assert.deepEqual(update.query, {
    _id: LICENCE_ID,
    notes: STAGING_FIXTURE_MARKER,
    renewalWindowDurationMinutes: { $eq: null, $exists: true }
  });
  assert.deepEqual(update.update, { $set: { renewalWindowDurationMinutes: 60 } });
  assert.equal(update.options.timestamps, false);
  assert.equal(update.options.session.repairSession, true);
  assert.equal(repositories.auditLogs.records.size, 1);
  const audit = [...repositories.auditLogs.records.values()][0];
  assert.equal(audit.action, STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_AUDIT_ACTION);
  assert.equal(audit.targetId, LICENCE_ID);
  assert.equal(audit.targetLabel, STAGING_FIXTURE_MARKER);
  assert.equal(JSON.stringify(audit).includes(SECRET_SENTINEL), false);
});

test("an existing 60-minute policy is idempotent and any other value fails closed", async () => {
  const alreadyRepositories = fixtureRepositories({ renewalWindowDurationMinutes: 60 });
  const alreadyService = createStagingPosFixtureRenewalPolicyRepairService({
    repositories: alreadyRepositories,
    async runInTransaction(callback) { return callback({}); }
  });
  assert.deepEqual(
    await alreadyService.repairFixtureRenewalPolicy(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    { repaired: false, alreadyRepaired: true, renewalWindowDurationMinutes: 60 }
  );
  assert.equal(alreadyRepositories.posLicences.calls.findOneAndUpdate.length, 0);
  assert.equal(alreadyRepositories.auditLogs.records.size, 0);

  const conflictingRepositories = fixtureRepositories({ renewalWindowDurationMinutes: 30 });
  const conflictingService = createStagingPosFixtureRenewalPolicyRepairService({
    repositories: conflictingRepositories,
    async runInTransaction(callback) { return callback({}); }
  });
  await assert.rejects(
    () => conflictingService.repairFixtureRenewalPolicy(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    (error) => error && error.code === "fixture_renewal_policy_conflict"
  );
  assert.equal(conflictingRepositories.posLicences.calls.findOneAndUpdate.length, 0);
  assert.equal(conflictingRepositories.auditLogs.records.size, 0);
});

test("only the exact fixture-marked licence is eligible and related record types are unreachable", async () => {
  const repositories = fixtureRepositories();
  repositories.posLicences.records.get(LICENCE_ID).notes = "not-the-controlled-fixture";
  const service = createStagingPosFixtureRenewalPolicyRepairService({
    repositories,
    async runInTransaction(callback) { return callback({}); }
  });
  await assert.rejects(
    () => service.repairFixtureRenewalPolicy(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    (error) => error && error.code === "fixture_licence_ambiguous"
  );
  assert.equal(repositories.posLicences.calls.findOneAndUpdate.length, 0);
  assert.equal(repositories.auditLogs.records.size, 0);

  const serviceSource = fs.readFileSync(path.join(
    __dirname,
    "..",
    "..",
    "server",
    "services",
    "stagingPosFixtureRenewalPolicyRepairService.js"
  ), "utf8");
  assert.doesNotMatch(serviceSource, /PosInstallation|PosActivationCode|PosLicenceIssue/);
  assert.doesNotMatch(serviceSource, /deleteMany|deleteOne|drop\s*\(/);
});
