const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-original-code-recovery-test-only";

const {
  STAGING_FIXTURE_MARKER
} = require("../../server/services/stagingPosActivationFixtureService");
const {
  ORIGINAL_CODE_RECOVERY_AUDIT_ACTION,
  ORIGINAL_CODE_REOPEN_AUDIT_ACTION,
  ORIGINAL_CODE_RECOVERY_LIFETIME_MS,
  createStagingPosOriginalActivationCodeRecoveryService
} = require("../../server/services/stagingPosOriginalActivationCodeRecoveryService");
const {
  STAGING_TEST_FIXTURE_OPERATOR_ACTOR,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER
} = require("../../server/routes/internalStagingActivationFixture");
const {
  STAGING_ORIGINAL_CODE_RECOVERY_FLAG,
  STAGING_ORIGINAL_CODE_RECOVERY_PATH,
  mountStagingOriginalActivationCodeRecoveryEndpoint,
  recoveryOutput,
  stagingOriginalCodeRecoveryIsEnabled
} = require("../../server/routes/internalStagingOriginalActivationCodeRecovery");

const NOW = new Date("2026-09-20T05:00:00.000Z");
const LICENCE_ID = "507f1f77bcf86cd799439051";
const INSTALLATION_ID = "507f1f77bcf86cd799439052";
const ISSUE_ID = "507f1f77bcf86cd799439053";
const ORIGINAL_CODE_ID = "507f1f77bcf86cd799439054";
const OTHER_CODE_ID = "507f1f77bcf86cd799439055";
const DEVICE_ID = "11111111-2222-4333-8444-555555555555";
const ORIGINAL_HASH = "sha256:v1:" + "1".repeat(64);
const OTHER_HASH = "sha256:v1:" + "2".repeat(64);
const ORIGINAL_EXPIRY = new Date(NOW.getTime() - 10 * 60 * 1000);
const RECOVERY_EXPIRY = new Date(NOW.getTime() + ORIGINAL_CODE_RECOVERY_LIFETIME_MS);
const OPERATOR_TOKEN = "original-code-recovery-" + "o".repeat(48);

function stagingPreviewEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    [STAGING_ORIGINAL_CODE_RECOVERY_FLAG]: "true",
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
  assert.equal(mountStagingOriginalActivationCodeRecoveryEndpoint(router, {
    env: stagingPreviewEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateDatabase() {},
    async runReadinessGate() { return eligibleReadiness(); },
    recoveryService: {
      async recoverOriginalFixtureActivationCode() {
        return { recovered: true, alreadyRecovered: false, recoveryExpiresAt: RECOVERY_EXPIRY };
      }
    },
    rateLimitStoreFactory: {},
    ...options
  }), true);
  return router.registrations[0].handlers;
}

test("original-code recovery endpoint mounts only on the exact staging Vercel Preview branch", () => {
  const router = routerRecorder();
  assert.equal(mountStagingOriginalActivationCodeRecoveryEndpoint(router, { env: stagingPreviewEnvironment() }), true);
  assert.equal(
    STAGING_ORIGINAL_CODE_RECOVERY_PATH,
    "/internal/pos-licensing-staging-test-fixture/recover-original-activation-code"
  );

  for (const env of [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_ENABLED: "false" })
  ]) {
    const rejected = routerRecorder();
    assert.equal(mountStagingOriginalActivationCodeRecoveryEndpoint(rejected, { env }), false);
    assert.equal(rejected.registrations.length, 0);
  }
});

test("disabled recovery flag rejects before authorization, database, readiness, or writes", async () => {
  const counters = {};
  const env = stagingPreviewEnvironment({ [STAGING_ORIGINAL_CODE_RECOVERY_FLAG]: "false" });
  const router = routerRecorder();
  mountStagingOriginalActivationCodeRecoveryEndpoint(router, {
    env,
    async connectionProvider() { counters.connection = 1; },
    async runReadinessGate() { counters.readiness = 1; },
    recoveryService: { async recoverOriginalFixtureActivationCode() { counters.recovery = 1; } }
  });

  assert.equal(stagingOriginalCodeRecoveryIsEnabled(env), false);
  const response = await invoke(router.registrations[0].handlers);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, recoveryOutput(false, "staging_original_code_recovery_unavailable"));
  assert.deepEqual(counters, {});
});

test("wrong operator token and failed readiness cannot recover the code", async () => {
  let recoveryCalls = 0;
  const wrongToken = await invoke(mountedHandlers({
    recoveryService: { async recoverOriginalFixtureActivationCode() { recoveryCalls += 1; } }
  }), {
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: "wrong-" + "w".repeat(48) }
  });
  assert.equal(wrongToken.statusCode, 401);
  assert.equal(wrongToken.body.code, "staging_test_fixture_operator_unauthorized");
  assert.equal(recoveryCalls, 0);

  const failedReadiness = await invoke(mountedHandlers({
    async runReadinessGate() {
      return eligibleReadiness({
        ready: false,
        eligibleForRouteMount: false,
        eligibleForStagingRouteMount: false
      });
    },
    recoveryService: { async recoverOriginalFixtureActivationCode() { recoveryCalls += 1; } }
  }), operatorRequest());
  assert.equal(failedReadiness.statusCode, 503);
  assert.deepEqual(failedReadiness.body, recoveryOutput(false, "staging_original_code_recovery_readiness_failed"));
  assert.equal(recoveryCalls, 0);
});

test("recovery responses never contain activation code or hash material", async () => {
  const response = await invoke(mountedHandlers(), operatorRequest());
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, recoveryOutput(true, "staging_original_code_recovered", {
    recoveryExpiresAt: RECOVERY_EXPIRY
  }));
  assert.equal(JSON.stringify(response.body).includes(ORIGINAL_HASH), false);

  const repeated = await invoke(mountedHandlers({
    recoveryService: {
      async recoverOriginalFixtureActivationCode() {
        return { recovered: false, alreadyRecovered: true, recoveryExpiresAt: RECOVERY_EXPIRY };
      }
    }
  }), operatorRequest());
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(repeated.body, recoveryOutput(false, "staging_original_code_already_recovered", {
    recoveryExpiresAt: RECOVERY_EXPIRY
  }));
});

function clone(record) {
  return record ? { ...record, signedPayload: record.signedPayload ? { ...record.signedPayload } : record.signedPayload } : null;
}

function comparable(value) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

function matches(record, query = {}) {
  return Object.entries(query).every(([field, expected]) => comparable(record[field]) === comparable(expected));
}

function memoryRepository(initialRecords = [], selectFalseFields = []) {
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
    findOneAndUpdate(query, update, options = {}) {
      const call = { query, update, options, selection: "" };
      calls.findOneAndUpdate.push(call);
      let execution;
      const queryResult = {
        select(selection) {
          call.selection = selection;
          return queryResult;
        },
        then(resolve, reject) {
          if (!execution) {
            execution = Promise.resolve().then(() => {
              const existing = [...records.values()].find((record) => matches(record, query));
              if (!existing) {
                return null;
              }
              const updated = { ...existing, ...(update.$set || {}) };
              records.set(String(existing._id), clone(updated));
              const projected = clone(updated);
              const explicitlySelected = new Set(
                String(call.selection || "")
                  .split(/\s+/)
                  .filter((field) => field.startsWith("+"))
                  .map((field) => field.slice(1))
              );
              for (const field of selectFalseFields) {
                if (!explicitlySelected.has(field)) {
                  delete projected[field];
                }
              }
              return projected;
            });
          }
          return execution.then(resolve, reject);
        }
      };
      return queryResult;
    }
  };
}

function fixtureRepositories() {
  return {
    auditLogs: memoryRepository(),
    posLicences: memoryRepository([{
      _id: LICENCE_ID,
      notes: STAGING_FIXTURE_MARKER,
      edition: "standard",
      status: "active",
      licenceExpiry: new Date(NOW.getTime() + 12 * 60 * 60 * 1000),
      offlineValidUntil: new Date(NOW.getTime() + 6 * 60 * 60 * 1000),
      maxInstallations: 1,
      activationCount: 1,
      __v: 2
    }]),
    posInstallations: memoryRepository([{
      _id: INSTALLATION_ID,
      licenceId: LICENCE_ID,
      deviceInstallationId: DEVICE_ID,
      status: "active",
      firstActivatedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
      lastRenewedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
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
      activationCodeId: ORIGINAL_CODE_ID,
      issueReason: "activation",
      status: "issued",
      licenceExpiry: new Date(NOW.getTime() + 12 * 60 * 60 * 1000),
      offlineValidUntil: new Date(NOW.getTime() + 6 * 60 * 60 * 1000),
      signedPayload: {
        installationId: DEVICE_ID,
        signature: "preserved-signature"
      }
    }]),
    posActivationCodes: memoryRepository([{
      _id: ORIGINAL_CODE_ID,
      licenceId: LICENCE_ID,
      codeHash: ORIGINAL_HASH,
      status: "expired",
      expiresAt: ORIGINAL_EXPIRY,
      maxRedemptions: 1,
      redeemedCount: 1,
      lastRedeemedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
      updatedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
      __v: 2
    }, {
      _id: OTHER_CODE_ID,
      licenceId: LICENCE_ID,
      codeHash: OTHER_HASH,
      status: "active",
      expiresAt: new Date(NOW.getTime() + 20 * 60 * 1000),
      maxRedemptions: 1,
      redeemedCount: 0,
      __v: 0
    }], ["codeHash"])
  };
}

function snapshot(repository) {
  return JSON.stringify([...repository.records.values()]);
}

function addRecoveryAudit(repository, action) {
  repository.records.set(`audit-${repository.records.size + 1}`, {
    _id: `audit-${repository.records.size + 1}`,
    action,
    targetType: "PosActivationCode",
    targetId: ORIGINAL_CODE_ID,
    targetLabel: STAGING_FIXTURE_MARKER
  });
}

test("only the expired issue-linked record status and expiry change and repeat execution is idempotent", async () => {
  const repositories = fixtureRepositories();
  const licenceBefore = snapshot(repositories.posLicences);
  const installationBefore = snapshot(repositories.posInstallations);
  const issueBefore = snapshot(repositories.posLicenceIssues);
  const originalBefore = clone(repositories.posActivationCodes.records.get(ORIGINAL_CODE_ID));
  const otherBefore = clone(repositories.posActivationCodes.records.get(OTHER_CODE_ID));
  let transactionCalls = 0;
  const service = createStagingPosOriginalActivationCodeRecoveryService({
    repositories,
    clock: () => NOW,
    async runInTransaction(callback) {
      transactionCalls += 1;
      return callback({ recoverySession: true });
    }
  });

  const first = await service.recoverOriginalFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.deepEqual(first, {
    recovered: true,
    alreadyRecovered: false,
    recoveryExpiresAt: RECOVERY_EXPIRY
  });
  const originalAfter = repositories.posActivationCodes.records.get(ORIGINAL_CODE_ID);
  assert.equal(originalAfter._id, originalBefore._id);
  assert.equal(originalAfter.codeHash, originalBefore.codeHash);
  assert.equal(originalBefore.status, "expired");
  assert.equal(originalAfter.status, "redeemed");
  assert.equal(originalAfter.redeemedCount, originalBefore.redeemedCount);
  assert.equal(originalAfter.maxRedemptions, originalBefore.maxRedemptions);
  assert.equal(originalAfter.lastRedeemedAt, originalBefore.lastRedeemedAt);
  assert.equal(originalAfter.createdBy, originalBefore.createdBy);
  assert.equal(originalAfter.updatedBy, originalBefore.updatedBy);
  assert.equal(originalAfter.createdAt, originalBefore.createdAt);
  assert.equal(originalAfter.updatedAt, originalBefore.updatedAt);
  assert.equal(originalAfter.__v, originalBefore.__v);
  assert.equal(new Date(originalAfter.expiresAt).getTime(), RECOVERY_EXPIRY.getTime());
  assert.deepEqual(repositories.posActivationCodes.records.get(OTHER_CODE_ID), otherBefore);
  assert.equal(snapshot(repositories.posLicences), licenceBefore);
  assert.equal(snapshot(repositories.posInstallations), installationBefore);
  assert.equal(snapshot(repositories.posLicenceIssues), issueBefore);

  const update = repositories.posActivationCodes.calls.findOneAndUpdate[0];
  assert.deepEqual(Object.keys(update.update.$set).sort(), ["expiresAt", "status"]);
  assert.equal(update.query._id, ORIGINAL_CODE_ID);
  assert.equal(update.query.licenceId, LICENCE_ID);
  assert.equal(update.query.codeHash, ORIGINAL_HASH);
  assert.equal(update.query.status, "expired");
  assert.equal(update.query.redeemedCount, 1);
  assert.equal(update.query.maxRedemptions, 1);
  assert.equal(update.update.$set.status, "redeemed");
  assert.equal(new Date(update.update.$set.expiresAt).getTime(), RECOVERY_EXPIRY.getTime());
  assert.equal(Object.prototype.hasOwnProperty.call(update.update, "$inc"), false);
  assert.equal(update.options.timestamps, false);
  assert.equal(update.options.session.recoverySession, true);
  assert.equal(update.selection, "+codeHash");
  assert.equal(JSON.stringify([...repositories.auditLogs.records.values()]).includes(ORIGINAL_HASH), false);
  assert.equal(
    [...repositories.auditLogs.records.values()].filter((audit) => audit.action === ORIGINAL_CODE_RECOVERY_AUDIT_ACTION).length,
    1
  );

  const repeated = await service.recoverOriginalFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.deepEqual(repeated, {
    recovered: false,
    alreadyRecovered: true,
    recoveryExpiresAt: RECOVERY_EXPIRY
  });
  assert.equal(repositories.posActivationCodes.calls.findOneAndUpdate.length, 1);
  assert.equal(repositories.auditLogs.records.size, 1);
  assert.equal(transactionCalls, 2);
});

test("activation-code update results omit select:false hash material unless explicitly selected", async () => {
  const repository = memoryRepository([{
    _id: ORIGINAL_CODE_ID,
    codeHash: ORIGINAL_HASH,
    status: "expired"
  }], ["codeHash"]);

  const defaultResult = await repository.findOneAndUpdate(
    { _id: ORIGINAL_CODE_ID },
    { $set: { status: "expired" } }
  );
  assert.equal(Object.prototype.hasOwnProperty.call(defaultResult, "codeHash"), false);

  const selectedResult = await repository.findOneAndUpdate(
    { _id: ORIGINAL_CODE_ID },
    { $set: { status: "expired" } }
  ).select("+codeHash");
  assert.equal(selectedResult.codeHash, ORIGINAL_HASH);
});

test("one expired first recovery window can be reopened once by changing only expiresAt", async () => {
  const repositories = fixtureRepositories();
  const original = repositories.posActivationCodes.records.get(ORIGINAL_CODE_ID);
  original.status = "redeemed";
  addRecoveryAudit(repositories.auditLogs, ORIGINAL_CODE_RECOVERY_AUDIT_ACTION);
  const originalBefore = clone(original);
  const otherBefore = clone(repositories.posActivationCodes.records.get(OTHER_CODE_ID));
  const licenceBefore = snapshot(repositories.posLicences);
  const installationBefore = snapshot(repositories.posInstallations);
  const issueBefore = snapshot(repositories.posLicenceIssues);
  const service = createStagingPosOriginalActivationCodeRecoveryService({
    repositories,
    clock: () => NOW,
    async runInTransaction(callback) { return callback({ reopenSession: true }); }
  });

  const reopened = await service.recoverOriginalFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.deepEqual(reopened, {
    recovered: true,
    alreadyRecovered: false,
    recoveryExpiresAt: RECOVERY_EXPIRY
  });

  const originalAfter = repositories.posActivationCodes.records.get(ORIGINAL_CODE_ID);
  assert.equal(originalAfter._id, originalBefore._id);
  assert.equal(originalAfter.codeHash, originalBefore.codeHash);
  assert.equal(originalAfter.status, "redeemed");
  assert.equal(originalAfter.redeemedCount, originalBefore.redeemedCount);
  assert.equal(originalAfter.maxRedemptions, originalBefore.maxRedemptions);
  assert.equal(originalAfter.lastRedeemedAt, originalBefore.lastRedeemedAt);
  assert.equal(originalAfter.createdBy, originalBefore.createdBy);
  assert.equal(originalAfter.updatedBy, originalBefore.updatedBy);
  assert.equal(originalAfter.createdAt, originalBefore.createdAt);
  assert.equal(originalAfter.updatedAt, originalBefore.updatedAt);
  assert.equal(originalAfter.__v, originalBefore.__v);
  assert.equal(new Date(originalAfter.expiresAt).getTime(), RECOVERY_EXPIRY.getTime());
  assert.deepEqual(repositories.posActivationCodes.records.get(OTHER_CODE_ID), otherBefore);
  assert.equal(snapshot(repositories.posLicences), licenceBefore);
  assert.equal(snapshot(repositories.posInstallations), installationBefore);
  assert.equal(snapshot(repositories.posLicenceIssues), issueBefore);

  const update = repositories.posActivationCodes.calls.findOneAndUpdate[0];
  assert.deepEqual(Object.keys(update.update.$set), ["expiresAt"]);
  assert.equal(update.query._id, ORIGINAL_CODE_ID);
  assert.equal(update.query.licenceId, LICENCE_ID);
  assert.equal(update.query.codeHash, ORIGINAL_HASH);
  assert.equal(update.query.status, "redeemed");
  assert.equal(update.query.redeemedCount, 1);
  assert.equal(update.query.maxRedemptions, 1);
  assert.equal(update.options.timestamps, false);
  assert.equal(update.options.session.reopenSession, true);
  assert.equal(update.selection, "+codeHash");
  assert.equal(
    [...repositories.auditLogs.records.values()].filter((audit) => audit.action === ORIGINAL_CODE_REOPEN_AUDIT_ACTION).length,
    1
  );
  assert.equal(JSON.stringify([...repositories.auditLogs.records.values()]).includes(ORIGINAL_HASH), false);

  const afterReopenExpiry = new Date(RECOVERY_EXPIRY.getTime() + 1000);
  const repeatService = createStagingPosOriginalActivationCodeRecoveryService({
    repositories,
    clock: () => afterReopenExpiry,
    async runInTransaction(callback) { return callback({}); }
  });
  const repeated = await repeatService.recoverOriginalFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.deepEqual(repeated, {
    recovered: false,
    alreadyRecovered: true,
    recoveryExpiresAt: RECOVERY_EXPIRY
  });
  assert.equal(repositories.posActivationCodes.calls.findOneAndUpdate.length, 1);
  assert.equal(
    [...repositories.auditLogs.records.values()].filter((audit) => audit.action === ORIGINAL_CODE_REOPEN_AUDIT_ACTION).length,
    1
  );
});

test("an expired redeemed window cannot reopen without the successful first recovery audit", async () => {
  const repositories = fixtureRepositories();
  repositories.posActivationCodes.records.get(ORIGINAL_CODE_ID).status = "redeemed";
  const service = createStagingPosOriginalActivationCodeRecoveryService({
    repositories,
    clock: () => NOW,
    async runInTransaction(callback) { return callback({}); }
  });

  await assert.rejects(
    () => service.recoverOriginalFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    (error) => error && error.code === "fixture_activation_code_not_expired"
  );
  assert.equal(repositories.posActivationCodes.calls.findOneAndUpdate.length, 0);
  assert.equal(repositories.auditLogs.records.size, 0);
});

test("a qualifying expired code not linked by the activation issue cannot be recovered", async () => {
  const repositories = fixtureRepositories();
  repositories.posActivationCodes.records.delete(ORIGINAL_CODE_ID);
  const unrelated = repositories.posActivationCodes.records.get(OTHER_CODE_ID);
  unrelated.status = "expired";
  unrelated.expiresAt = ORIGINAL_EXPIRY;
  unrelated.redeemedCount = 1;
  const unrelatedBefore = clone(unrelated);
  const service = createStagingPosOriginalActivationCodeRecoveryService({
    repositories,
    clock: () => NOW,
    async runInTransaction(callback) { return callback({}); }
  });

  await assert.rejects(
    () => service.recoverOriginalFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    (error) => error && error.code === "fixture_activation_code_ambiguous"
  );
  assert.equal(repositories.posActivationCodes.calls.findOneAndUpdate.length, 0);
  assert.deepEqual(repositories.posActivationCodes.records.get(OTHER_CODE_ID), unrelatedBefore);
});

test("an issue-linked record in a state other than expired cannot start recovery", async () => {
  const repositories = fixtureRepositories();
  repositories.posActivationCodes.records.get(ORIGINAL_CODE_ID).status = "active";
  const service = createStagingPosOriginalActivationCodeRecoveryService({
    repositories,
    clock: () => NOW,
    async runInTransaction(callback) { return callback({}); }
  });

  await assert.rejects(
    () => service.recoverOriginalFixtureActivationCode(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    (error) => error && error.code === "fixture_activation_code_invalid"
  );
  assert.equal(repositories.posActivationCodes.calls.findOneAndUpdate.length, 0);
});
