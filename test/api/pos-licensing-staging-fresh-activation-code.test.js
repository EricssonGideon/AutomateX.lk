const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-fresh-activation-code-test-only";

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
  FRESH_ACTIVATION_CODE_AUDIT_ACTION,
  FRESH_ACTIVATION_CODE_LIFETIME_MS,
  createStagingPosFreshActivationCodeService
} = require("../../server/services/stagingPosFreshActivationCodeService");
const {
  STAGING_TEST_FIXTURE_OPERATOR_ACTOR,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER
} = require("../../server/routes/internalStagingActivationFixture");
const {
  STAGING_FRESH_ACTIVATION_CODE_FLAG,
  STAGING_FRESH_ACTIVATION_CODE_PATH,
  freshCodeOutput,
  mountStagingFreshActivationCodeEndpoint,
  stagingFreshActivationCodeIsEnabled
} = require("../../server/routes/internalStagingFreshActivationCode");

const NOW = new Date("2026-09-20T04:00:00.000Z");
const PACKAGE_ID = "507f1f77bcf86cd799439041";
const LICENCE_ID = "507f1f77bcf86cd799439042";
const INSTALLATION_ID = "507f1f77bcf86cd799439043";
const ISSUE_ID = "507f1f77bcf86cd799439044";
const EXPIRED_CODE_ID = "507f1f77bcf86cd799439045";
const USABLE_CODE_ID = "507f1f77bcf86cd799439046";
const DEVICE_ID = "11111111-2222-4333-8444-555555555555";
const FRESH_CODE = "posac_" + "aaaabbbbccccdddd".repeat(2);
const OPERATOR_TOKEN = "fresh-code-operator-" + "f".repeat(48);

function stagingPreviewEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    [STAGING_FRESH_ACTIVATION_CODE_FLAG]: "true",
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

function operatorRequest() {
  return { headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: OPERATOR_TOKEN } };
}

function mountedHandlers(options = {}) {
  const router = routerRecorder();
  assert.equal(mountStagingFreshActivationCodeEndpoint(router, {
    env: stagingPreviewEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateDatabase() {},
    async runReadinessGate() { return eligibleReadiness(); },
    freshCodeService: {
      async issueFreshFixtureActivationCode() {
        return {
          issued: true,
          activationCode: FRESH_CODE,
          activationCodeExpiresAt: new Date(NOW.getTime() + FRESH_ACTIVATION_CODE_LIFETIME_MS),
          maxRedemptions: 1
        };
      }
    },
    rateLimitStoreFactory: {},
    ...options
  }), true);
  return router.registrations[0].handlers;
}

test("fresh-code endpoint mounts only on the exact staging Vercel Preview branch", () => {
  const router = routerRecorder();
  assert.equal(mountStagingFreshActivationCodeEndpoint(router, { env: stagingPreviewEnvironment() }), true);
  assert.equal(
    STAGING_FRESH_ACTIVATION_CODE_PATH,
    "/internal/pos-licensing-staging-test-fixture/issue-fresh-activation-code"
  );

  for (const env of [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_ENABLED: "false" })
  ]) {
    const rejected = routerRecorder();
    assert.equal(mountStagingFreshActivationCodeEndpoint(rejected, { env }), false);
    assert.equal(rejected.registrations.length, 0);
  }
});

test("disabled fresh-code flag rejects before authorization, database, readiness, or writes", async () => {
  const counters = {};
  const env = stagingPreviewEnvironment({ [STAGING_FRESH_ACTIVATION_CODE_FLAG]: "false" });
  const router = routerRecorder();
  mountStagingFreshActivationCodeEndpoint(router, {
    env,
    async connectionProvider() { counters.connection = 1; },
    async runReadinessGate() { counters.readiness = 1; },
    freshCodeService: { async issueFreshFixtureActivationCode() { counters.issue = 1; } }
  });

  assert.equal(stagingFreshActivationCodeIsEnabled(env), false);
  const response = await invoke(router.registrations[0].handlers);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, freshCodeOutput(false, "staging_fresh_activation_code_unavailable"));
  assert.deepEqual(counters, {});
});

test("wrong operator token and failed readiness cannot issue a fresh code", async () => {
  let issueCalls = 0;
  const wrongToken = await invoke(mountedHandlers({
    freshCodeService: { async issueFreshFixtureActivationCode() { issueCalls += 1; } }
  }), {
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: "wrong-" + "w".repeat(48) }
  });
  assert.equal(wrongToken.statusCode, 401);
  assert.equal(wrongToken.body.code, "staging_test_fixture_operator_unauthorized");
  assert.equal(issueCalls, 0);

  const failedReadiness = await invoke(mountedHandlers({
    async runReadinessGate() {
      return eligibleReadiness({
        ready: false,
        eligibleForRouteMount: false,
        eligibleForStagingRouteMount: false
      });
    },
    freshCodeService: { async issueFreshFixtureActivationCode() { issueCalls += 1; } }
  }), operatorRequest());
  assert.equal(failedReadiness.statusCode, 503);
  assert.deepEqual(failedReadiness.body, freshCodeOutput(false, "staging_fresh_activation_code_readiness_failed"));
  assert.equal(issueCalls, 0);
});

test("plaintext is returned once and retry returns only the idempotent result", async () => {
  const response = await invoke(mountedHandlers(), operatorRequest());
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.activationCode, FRESH_CODE);
  assert.equal(response.body.maxRedemptions, 1);

  const repeated = await invoke(mountedHandlers({
    freshCodeService: {
      async issueFreshFixtureActivationCode() {
        return { issued: false, alreadyIssued: true, maxRedemptions: 1 };
      }
    }
  }), operatorRequest());
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(repeated.body, freshCodeOutput(false, "staging_fresh_activation_code_already_issued"));
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

function comparable(value) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

function matches(record, query = {}) {
  return Object.entries(query).every(([field, expected]) => comparable(record[field]) === comparable(expected));
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
    async findOneAndUpdate(query, update, options = {}) {
      calls.findOneAndUpdate.push({ query, update, options });
      const existing = [...records.values()].find((record) => matches(record, query));
      if (!existing) {
        return null;
      }
      const updated = {
        ...existing,
        ...(update.$set || {}),
        __v: Number(existing.__v || 0) + Number(update.$inc && update.$inc.__v || 0)
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
      clientId: "507f1f77bcf86cd799439047",
      projectId: "507f1f77bcf86cd799439048",
      packageId: PACKAGE_ID,
      edition: "standard",
      status: "active",
      entitledModules: [...POS_STANDARD_MODULE_IDS],
      updateChannel: "stable",
      licenceExpiry: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
      supportExpiry: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
      offlineValidUntil: new Date(NOW.getTime() + 6 * 60 * 60 * 1000),
      maxInstallations: 1,
      activationCount: 1,
      notes: STAGING_FIXTURE_MARKER,
      __v: 2
    }]),
    posInstallations: memoryRepository([{
      _id: INSTALLATION_ID,
      licenceId: LICENCE_ID,
      deviceInstallationId: DEVICE_ID,
      status: "active",
      firstActivatedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
      lastRenewedAt: null,
      renewalCredentialHash: "",
      renewalCredentialVersion: 0,
      renewalCredentialBoundAt: null,
      lastIssueId: ISSUE_ID,
      __v: 1
    }]),
    posLicenceIssues: memoryRepository([{
      _id: ISSUE_ID,
      licenceId: LICENCE_ID,
      installationId: INSTALLATION_ID,
      activationCodeId: EXPIRED_CODE_ID,
      status: "issued",
      issueReason: "activation",
      signedPayload: { signature: "preserved" }
    }]),
    posActivationCodes: memoryRepository([{
      _id: EXPIRED_CODE_ID,
      licenceId: LICENCE_ID,
      codeHash: "sha256:v1:" + "1".repeat(64),
      status: "redeemed",
      expiresAt: new Date(NOW.getTime() - 30 * 60 * 1000),
      maxRedemptions: 1,
      redeemedCount: 1,
      __v: 1
    }, {
      _id: USABLE_CODE_ID,
      licenceId: LICENCE_ID,
      codeHash: "sha256:v1:" + "2".repeat(64),
      status: "active",
      expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
      maxRedemptions: 1,
      redeemedCount: 0,
      __v: 0
    }])
  };
}

function snapshot(repository) {
  return JSON.stringify([...repository.records.values()]);
}

test("transaction expires stale codes, revokes usable codes, and issues one 60-minute hash-only code", async () => {
  const repositories = fixtureRepositories();
  const licenceBefore = snapshot(repositories.posLicences);
  const installationBefore = snapshot(repositories.posInstallations);
  const issuesBefore = snapshot(repositories.posLicenceIssues);
  let transactionCalls = 0;
  const service = createStagingPosFreshActivationCodeService({
    repositories,
    clock: () => NOW,
    generateCode: () => FRESH_CODE,
    async runInTransaction(callback) {
      transactionCalls += 1;
      return callback({ freshCodeSession: true });
    }
  });

  const first = await service.issueFreshFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.equal(first.issued, true);
  assert.equal(first.activationCode, FRESH_CODE);
  assert.equal(first.maxRedemptions, 1);
  assert.equal(
    new Date(first.activationCodeExpiresAt).getTime() - NOW.getTime(),
    FRESH_ACTIVATION_CODE_LIFETIME_MS
  );
  assert.equal(repositories.posActivationCodes.records.get(EXPIRED_CODE_ID).status, "expired");
  assert.equal(repositories.posActivationCodes.records.get(USABLE_CODE_ID).status, "revoked");

  const freshRecord = [...repositories.posActivationCodes.records.values()]
    .find((record) => ![EXPIRED_CODE_ID, USABLE_CODE_ID].includes(String(record._id)));
  assert.ok(freshRecord);
  assert.equal(freshRecord.status, "active");
  assert.equal(freshRecord.maxRedemptions, 1);
  assert.equal(freshRecord.redeemedCount, 0);
  assert.equal(freshRecord.codeHash, digestActivationCode(FRESH_CODE));
  assert.equal(new Date(freshRecord.expiresAt).getTime() - NOW.getTime(), FRESH_ACTIVATION_CODE_LIFETIME_MS);
  assert.equal(Object.prototype.hasOwnProperty.call(freshRecord, "activationCode"), false);
  assert.equal(snapshot(repositories.posLicences), licenceBefore);
  assert.equal(snapshot(repositories.posInstallations), installationBefore);
  assert.equal(snapshot(repositories.posLicenceIssues), issuesBefore);
  assert.equal(JSON.stringify([...repositories.auditLogs.records.values()]).includes(FRESH_CODE), false);
  assert.equal(
    [...repositories.auditLogs.records.values()].filter((audit) => audit.action === FRESH_ACTIVATION_CODE_AUDIT_ACTION).length,
    1
  );
  assert.equal(repositories.posActivationCodes.calls.create[0].options.session.freshCodeSession, true);

  const installationAfterBootstrap = repositories.posInstallations.records.get(INSTALLATION_ID);
  installationAfterBootstrap.renewalCredentialHash = "sha256:v1:" + "b".repeat(64);
  installationAfterBootstrap.renewalCredentialVersion = 1;
  installationAfterBootstrap.renewalCredentialBoundAt = NOW;
  const repeated = await service.issueFreshFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.deepEqual(repeated, { issued: false, alreadyIssued: true, maxRedemptions: 1 });
  assert.equal(repositories.posActivationCodes.records.size, 3);
  assert.equal(repositories.posActivationCodes.calls.create.length, 1);
  assert.equal(transactionCalls, 2);
});

test("fresh-code issuance rejects non-controlled and credential-bound installations", async () => {
  const wrongLicence = fixtureRepositories();
  wrongLicence.posLicences.records.get(LICENCE_ID).notes = "not-the-controlled-fixture";
  const wrongLicenceService = createStagingPosFreshActivationCodeService({
    repositories: wrongLicence,
    clock: () => NOW,
    async runInTransaction(callback) { return callback({}); }
  });
  await assert.rejects(
    () => wrongLicenceService.issueFreshFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    (error) => error && error.code === "fixture_licence_ambiguous"
  );

  const credentialBound = fixtureRepositories();
  const installation = credentialBound.posInstallations.records.get(INSTALLATION_ID);
  installation.renewalCredentialHash = "sha256:v1:" + "a".repeat(64);
  installation.renewalCredentialVersion = 1;
  installation.renewalCredentialBoundAt = NOW;
  const credentialBoundService = createStagingPosFreshActivationCodeService({
    repositories: credentialBound,
    clock: () => NOW,
    async runInTransaction(callback) { return callback({}); }
  });
  await assert.rejects(
    () => credentialBoundService.issueFreshFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    (error) => error && error.code === "fixture_credential_not_reset"
  );
  assert.equal(credentialBound.posActivationCodes.calls.create.length, 0);
});
