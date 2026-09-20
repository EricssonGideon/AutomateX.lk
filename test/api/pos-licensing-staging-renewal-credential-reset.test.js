const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-credential-reset-test-only";

const {
  STAGING_FIXTURE_MARKER
} = require("../../server/services/stagingPosActivationFixtureService");
const {
  RESET_CREDENTIAL_FIELDS,
  createStagingPosRenewalCredentialResetService
} = require("../../server/services/stagingPosRenewalCredentialResetService");
const {
  STAGING_TEST_FIXTURE_OPERATOR_ACTOR,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER
} = require("../../server/routes/internalStagingActivationFixture");
const {
  STAGING_RENEWAL_CREDENTIAL_RESET_FLAG,
  STAGING_RENEWAL_CREDENTIAL_RESET_PATH,
  mountStagingRenewalCredentialResetEndpoint,
  resetOutput,
  stagingRenewalCredentialResetIsEnabled
} = require("../../server/routes/internalStagingRenewalCredentialReset");

const LICENCE_ID = "507f1f77bcf86cd799439031";
const INSTALLATION_ID = "507f1f77bcf86cd799439032";
const ISSUE_ID = "507f1f77bcf86cd799439033";
const CODE_ID = "507f1f77bcf86cd799439034";
const UNRELATED_INSTALLATION_ID = "507f1f77bcf86cd799439035";
const DEVICE_ID = "11111111-2222-4333-8444-555555555555";
const OPERATOR_TOKEN = "credential-reset-operator-" + "r".repeat(48);
const BOUND_DIGEST = "sha256:v1:" + "a".repeat(64);
const BOUND_AT = new Date("2026-09-20T01:00:00.000Z");

function stagingPreviewEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    [STAGING_RENEWAL_CREDENTIAL_RESET_FLAG]: "true",
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

function mountedHandlers(options = {}) {
  const router = routerRecorder();
  assert.equal(mountStagingRenewalCredentialResetEndpoint(router, {
    env: stagingPreviewEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateDatabase() {},
    async runReadinessGate() { return eligibleReadiness(); },
    resetService: {
      async resetFixtureRenewalCredential() {
        return { reset: true, alreadyReset: false };
      }
    },
    rateLimitStoreFactory: {},
    ...options
  }), true);
  return router.registrations[0].handlers;
}

function operatorRequest(overrides = {}) {
  return {
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: OPERATOR_TOKEN },
    ...overrides
  };
}

test("credential-reset endpoint mounts only on the exact staging Vercel Preview branch", () => {
  const router = routerRecorder();
  assert.equal(mountStagingRenewalCredentialResetEndpoint(router, { env: stagingPreviewEnvironment() }), true);
  assert.equal(
    STAGING_RENEWAL_CREDENTIAL_RESET_PATH,
    "/internal/pos-licensing-staging-test-fixture/reset-renewal-credential"
  );
  assert.deepEqual(router.registrations.map(({ method, path }) => ({ method, path })), [{
    method: "POST",
    path: STAGING_RENEWAL_CREDENTIAL_RESET_PATH
  }]);

  for (const env of [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_ENABLED: "false" })
  ]) {
    const rejected = routerRecorder();
    assert.equal(mountStagingRenewalCredentialResetEndpoint(rejected, { env }), false);
    assert.equal(rejected.registrations.length, 0);
  }
});

test("disabled credential-reset flag fails before authorization, database, readiness, or writes", async () => {
  const counters = {};
  const env = stagingPreviewEnvironment({ [STAGING_RENEWAL_CREDENTIAL_RESET_FLAG]: "false" });
  const router = routerRecorder();
  mountStagingRenewalCredentialResetEndpoint(router, {
    env,
    async connectionProvider() { counters.connection = 1; },
    async runReadinessGate() { counters.readiness = 1; },
    resetService: { async resetFixtureRenewalCredential() { counters.reset = 1; } }
  });

  assert.equal(stagingRenewalCredentialResetIsEnabled(env), false);
  const response = await invoke(router.registrations[0].handlers);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, resetOutput(false, "staging_renewal_credential_reset_unavailable"));
  assert.deepEqual(counters, {});
});

test("wrong staging operator token cannot reset a credential", async () => {
  let resetCalls = 0;
  const response = await invoke(mountedHandlers({
    resetService: { async resetFixtureRenewalCredential() { resetCalls += 1; } }
  }), {
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: "wrong-" + "w".repeat(48) }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, "staging_test_fixture_operator_unauthorized");
  assert.equal(JSON.stringify(response.body).includes(OPERATOR_TOKEN), false);
  assert.equal(resetCalls, 0);
});

test("failed staging readiness cannot reset a credential", async () => {
  let resetCalls = 0;
  const response = await invoke(mountedHandlers({
    async runReadinessGate() {
      return eligibleReadiness({
        ready: false,
        eligibleForRouteMount: false,
        eligibleForStagingRouteMount: false
      });
    },
    resetService: { async resetFixtureRenewalCredential() { resetCalls += 1; } }
  }), operatorRequest());

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, resetOutput(false, "staging_renewal_credential_reset_readiness_failed"));
  assert.equal(resetCalls, 0);
});

test("valid staging operator receives only a sanitized reset result", async () => {
  const response = await invoke(mountedHandlers(), operatorRequest());
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, resetOutput(true, "staging_renewal_credential_reset"));
  assert.equal(JSON.stringify(response.body).includes(BOUND_DIGEST), false);

  const repeated = await invoke(mountedHandlers({
    resetService: {
      async resetFixtureRenewalCredential() {
        return { reset: false, alreadyReset: true };
      }
    }
  }), operatorRequest());
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(repeated.body, resetOutput(false, "staging_renewal_credential_already_reset"));
});

function clone(record) {
  return record ? { ...record } : null;
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

function fixtureRepositories(overrides = {}) {
  const repositories = {
    auditLogs: memoryRepository(),
    posLicences: memoryRepository([{
      _id: LICENCE_ID,
      notes: STAGING_FIXTURE_MARKER,
      edition: "standard",
      status: "active",
      maxInstallations: 1,
      activationCount: 1,
      __v: 2
    }]),
    posInstallations: memoryRepository([{
      _id: INSTALLATION_ID,
      licenceId: LICENCE_ID,
      deviceInstallationId: DEVICE_ID,
      status: "active",
      firstActivatedAt: new Date("2026-09-20T00:30:00.000Z"),
      lastRenewedAt: null,
      renewalCredentialHash: BOUND_DIGEST,
      renewalCredentialVersion: 1,
      renewalCredentialBoundAt: BOUND_AT,
      lastIssueId: ISSUE_ID,
      createdBy: null,
      updatedBy: null,
      createdAt: new Date("2026-09-20T00:30:00.000Z"),
      updatedAt: BOUND_AT,
      __v: 1
    }]),
    posLicenceIssues: memoryRepository([{
      _id: ISSUE_ID,
      licenceId: LICENCE_ID,
      installationId: INSTALLATION_ID,
      activationCodeId: CODE_ID,
      status: "issued",
      issueReason: "activation",
      signatureMarker: "preserved-signed-licence-history"
    }]),
    posActivationCodes: memoryRepository([{
      _id: CODE_ID,
      licenceId: LICENCE_ID,
      status: "redeemed",
      redeemedCount: 1,
      activationMarker: "preserved-activation-history"
    }])
  };
  return { ...repositories, ...overrides };
}

function snapshot(repository) {
  return JSON.stringify([...repository.records.values()]);
}

test("reset clears only credential binding fields on the same controlled installation and is idempotent", async () => {
  const repositories = fixtureRepositories();
  const licenceBefore = snapshot(repositories.posLicences);
  const issuesBefore = snapshot(repositories.posLicenceIssues);
  const codesBefore = snapshot(repositories.posActivationCodes);
  const installationBefore = clone(repositories.posInstallations.records.get(INSTALLATION_ID));
  const unrelatedInstallation = {
    ...installationBefore,
    _id: UNRELATED_INSTALLATION_ID,
    licenceId: "507f1f77bcf86cd799439036",
    deviceInstallationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  };
  repositories.posInstallations.records.set(UNRELATED_INSTALLATION_ID, unrelatedInstallation);
  const unrelatedBefore = clone(unrelatedInstallation);
  let transactionCalls = 0;
  const service = createStagingPosRenewalCredentialResetService({
    repositories,
    async runInTransaction(callback) {
      transactionCalls += 1;
      return callback({ credentialResetSession: true });
    }
  });

  const first = await service.resetFixtureRenewalCredential(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.deepEqual(first, { reset: true, alreadyReset: false });
  assert.equal(repositories.posInstallations.records.size, 2);
  const installationAfter = repositories.posInstallations.records.get(INSTALLATION_ID);
  assert.equal(installationAfter._id, installationBefore._id);
  assert.equal(installationAfter.licenceId, installationBefore.licenceId);
  assert.equal(installationAfter.deviceInstallationId, installationBefore.deviceInstallationId);
  assert.equal(installationAfter.status, installationBefore.status);
  assert.equal(installationAfter.firstActivatedAt, installationBefore.firstActivatedAt);
  assert.equal(installationAfter.lastRenewedAt, installationBefore.lastRenewedAt);
  assert.equal(installationAfter.lastIssueId, installationBefore.lastIssueId);
  assert.equal(installationAfter.createdAt, installationBefore.createdAt);
  assert.equal(installationAfter.updatedAt, installationBefore.updatedAt);
  assert.equal(installationAfter.__v, installationBefore.__v);
  assert.equal(installationAfter.renewalCredentialHash, "");
  assert.equal(installationAfter.renewalCredentialVersion, 0);
  assert.equal(installationAfter.renewalCredentialBoundAt, null);
  assert.deepEqual(repositories.posInstallations.records.get(UNRELATED_INSTALLATION_ID), unrelatedBefore);

  const updateCall = repositories.posInstallations.calls.findOneAndUpdate[0];
  assert.deepEqual(Object.keys(updateCall.update.$set).sort(), [...RESET_CREDENTIAL_FIELDS].sort());
  assert.equal(updateCall.options.timestamps, false);
  assert.equal(updateCall.options.session.credentialResetSession, true);
  assert.equal(snapshot(repositories.posLicences), licenceBefore);
  assert.equal(snapshot(repositories.posLicenceIssues), issuesBefore);
  assert.equal(snapshot(repositories.posActivationCodes), codesBefore);
  assert.equal(JSON.stringify([...repositories.auditLogs.records.values()]).includes(BOUND_DIGEST), false);

  const repeated = await service.resetFixtureRenewalCredential(STAGING_TEST_FIXTURE_OPERATOR_ACTOR);
  assert.deepEqual(repeated, { reset: false, alreadyReset: true });
  assert.equal(repositories.posInstallations.calls.findOneAndUpdate.length, 1);
  assert.equal(repositories.auditLogs.records.size, 1);
  assert.equal(transactionCalls, 2);
});

test("only the fixture-marked licence's sole installation can be reset", async () => {
  const wrongLicenceRepositories = fixtureRepositories({
    posLicences: memoryRepository([{
      _id: LICENCE_ID,
      notes: "not-the-controlled-fixture",
      edition: "standard",
      status: "active",
      maxInstallations: 1
    }])
  });
  const wrongLicenceService = createStagingPosRenewalCredentialResetService({
    repositories: wrongLicenceRepositories,
    async runInTransaction(callback) { return callback({}); }
  });
  await assert.rejects(
    () => wrongLicenceService.resetFixtureRenewalCredential(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    (error) => error && error.code === "fixture_licence_ambiguous"
  );
  assert.equal(wrongLicenceRepositories.posInstallations.calls.findOneAndUpdate.length, 0);

  const ambiguousRepositories = fixtureRepositories();
  ambiguousRepositories.posInstallations.records.set("507f1f77bcf86cd799439039", {
    ...clone(ambiguousRepositories.posInstallations.records.get(INSTALLATION_ID)),
    _id: "507f1f77bcf86cd799439039",
    deviceInstallationId: "99999999-8888-4777-8666-555555555555"
  });
  const ambiguousService = createStagingPosRenewalCredentialResetService({
    repositories: ambiguousRepositories,
    async runInTransaction(callback) { return callback({}); }
  });
  await assert.rejects(
    () => ambiguousService.resetFixtureRenewalCredential(STAGING_TEST_FIXTURE_OPERATOR_ACTOR),
    (error) => error && error.code === "fixture_installation_ambiguous"
  );
  assert.equal(ambiguousRepositories.posInstallations.calls.findOneAndUpdate.length, 0);
});
