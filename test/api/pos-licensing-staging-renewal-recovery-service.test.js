const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-renewal-recovery-test-only";

const {
  FIXED_STAGING_ADMIN_ID,
  TARGET_LICENCE_ID
} = require("../../server/services/stagingPosCommittedActivationRecoveryService");
const {
  recoverStagingRenewalCredential
} = require("../../server/services/stagingPosRenewalCredentialRecoveryService");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../../server/licensing/posLicensingTransactions");
const {
  digestRenewalCredential
} = require("../../server/utils/posRenewalCredentialToken");

const INSTALLATION_ID = "6ab0af64058d4881f5e3d6da";
const CURRENT_ISSUE_ID = "6ab0af64058d4881f5e3d6dc";
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const RAW_CREDENTIAL = `posrc_${"a".repeat(64)}`;
const CREDENTIAL_DIGEST = digestRenewalCredential(RAW_CREDENTIAL);
const NOW = new Date("2026-09-24T11:00:00.000Z");

function stagingEnvironment(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    ...overrides
  };
}

function initialState() {
  return {
    admin: {
      _id: FIXED_STAGING_ADMIN_ID,
      name: "AutomateX Staging Licensing Operator",
      email: "pos-licensing-staging-operator@automatex.invalid",
      role: "admin",
      status: "active",
      isActive: true
    },
    licence: {
      _id: TARGET_LICENCE_ID,
      status: "active",
      activationCount: 1,
      maxInstallations: 1
    },
    installations: [{
      _id: INSTALLATION_ID,
      licenceId: TARGET_LICENCE_ID,
      deviceInstallationId: DEVICE_INSTALLATION_ID,
      status: "active",
      firstActivatedAt: new Date("2026-09-24T07:03:17.579Z"),
      lastRenewedAt: new Date("2026-09-24T07:03:17.579Z"),
      renewalCredentialHash: "",
      renewalCredentialVersion: 0,
      renewalCredentialBoundAt: null,
      lastIssueId: CURRENT_ISSUE_ID,
      __v: 4
    }],
    issues: [{
      _id: CURRENT_ISSUE_ID,
      licenceId: TARGET_LICENCE_ID,
      installationId: INSTALLATION_ID,
      status: "issued",
      issueReason: "admin-reissue",
      immutableMarker: "must-remain-unchanged",
      __v: 0
    }],
    activationCodeSentinel: {
      status: "redeemed",
      redeemedCount: 1,
      maxRedemptions: 1,
      activationCode: "posac_must-never-be-read-or-returned",
      codeHash: "sha256:v1:must-never-be-read-or-returned"
    },
    audits: [],
    transactionCount: 0,
    transactionOptions: null,
    committed: false,
    ended: false,
    forceCasConflict: false,
    failAudit: false,
    updateFilter: null,
    update: null
  };
}

function queryValue(read) {
  return {
    select() { return this; },
    session() { return this; },
    lean() { return Promise.resolve(read()); },
    then(resolve, reject) { return Promise.resolve(read()).then(resolve, reject); }
  };
}

function same(left, right) {
  return String(left || "") === String(right || "");
}

function matches(record, filter) {
  return Object.entries(filter).every(([field, expected]) => {
    if (expected && typeof expected === "object" && Array.isArray(expected.$in)) {
      return expected.$in.some((candidate) => same(record[field], candidate));
    }
    return same(record[field], expected);
  });
}

function createFixture(mutate = null) {
  let state = initialState();
  if (typeof mutate === "function") {
    mutate(state);
  }

  let session;
  const repositories = {
    users: {
      findById(id) { return queryValue(() => same(id, FIXED_STAGING_ADMIN_ID) ? state.admin : null); }
    },
    posLicences: {
      findById(id) { return queryValue(() => same(id, TARGET_LICENCE_ID) ? state.licence : null); }
    },
    posInstallations: {
      find(filter) { return queryValue(() => state.installations.filter((record) => matches(record, filter))); },
      async updateOne(filter, update, options) {
        assert.equal(options.session, session);
        assert.equal(options.runValidators, true);
        state.updateFilter = structuredClone(filter);
        state.update = structuredClone(update);
        if (state.forceCasConflict) {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }
        const installation = state.installations.find((record) => matches(record, filter));
        if (!installation) {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }
        Object.assign(installation, update.$set || {});
        installation.__v += Number(update.$inc && update.$inc.__v || 0);
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
      }
    },
    posLicenceIssues: {
      findById(id) {
        return queryValue(() => state.issues.find((record) => same(record._id, id)) || null);
      }
    },
    auditLogs: {
      async create(entries, options) {
        assert.equal(options.session, session);
        if (state.failAudit) {
          throw new Error("audit write failed");
        }
        state.audits.push(...structuredClone(entries));
        return entries;
      }
    }
  };

  session = {
    async withTransaction(callback, transactionOptions) {
      state.transactionCount += 1;
      state.transactionOptions = transactionOptions;
      const snapshot = structuredClone(state);
      try {
        const result = await callback();
        state.committed = true;
        return result;
      } catch (error) {
        const ended = state.ended;
        const updateFilter = state.updateFilter;
        const update = state.update;
        state = snapshot;
        state.ended = ended;
        state.updateFilter = updateFilter;
        state.update = update;
        throw error;
      }
    },
    async endSession() { state.ended = true; }
  };
  const connection = {
    async startSession() { return session; }
  };

  return {
    connection,
    repositories,
    get state() { return state; }
  };
}

async function runFixture(fixture, input = { renewalCredentialDigest: CREDENTIAL_DIGEST }, options = {}) {
  return recoverStagingRenewalCredential(input, {
    env: stagingEnvironment(),
    connection: fixture.connection,
    repositories: fixture.repositories,
    clock: () => new Date(NOW),
    ...options
  });
}

function assertRecoveryError(code) {
  return (error) => error && error.code === code;
}

test("successful recovery binds the existing native credential digest to the same installation", async () => {
  const fixture = createFixture();
  const originalIssue = structuredClone(fixture.state.issues[0]);
  const originalActivationCode = structuredClone(fixture.state.activationCodeSentinel);
  const result = await runFixture(fixture);

  assert.deepEqual(result, {
    schemaVersion: 1,
    status: "bound",
    installationId: DEVICE_INSTALLATION_ID,
    credentialVersion: 1
  });
  assert.equal(fixture.state.transactionCount, 1);
  assert.deepEqual(fixture.state.transactionOptions, REQUIRED_POS_TRANSACTION_OPTIONS);
  assert.equal(fixture.state.committed, true);
  assert.equal(fixture.state.ended, true);
  assert.equal(fixture.state.installations.length, 1);
  assert.equal(Object.hasOwn(fixture.repositories, "posActivationCodes"), false);
  assert.equal(fixture.state.installations[0]._id, INSTALLATION_ID);
  assert.equal(fixture.state.installations[0].renewalCredentialHash, CREDENTIAL_DIGEST);
  assert.equal(fixture.state.installations[0].renewalCredentialVersion, 1);
  assert.deepEqual(fixture.state.installations[0].renewalCredentialBoundAt, NOW);
  assert.equal(fixture.state.installations[0].lastIssueId, CURRENT_ISSUE_ID);
  assert.equal(fixture.state.installations[0].__v, 5);
  assert.equal(fixture.state.licence.activationCount, 1);
  assert.equal(fixture.state.licence.maxInstallations, 1);
  assert.deepEqual(fixture.state.issues[0], originalIssue);
  assert.deepEqual(fixture.state.activationCodeSentinel, originalActivationCode);
  assert.equal(fixture.state.audits.length, 1);
  assert.equal(fixture.state.audits[0].action, "licences.renewal-credential.staging-recovery");

  assert.equal(fixture.state.updateFilter.__v, 4);
  assert.equal(fixture.state.updateFilter.lastIssueId, CURRENT_ISSUE_ID);
  assert.equal(fixture.state.updateFilter.renewalCredentialVersion, 0);
  assert.deepEqual(fixture.state.updateFilter.renewalCredentialHash, { $in: ["", null] });
  const exposed = JSON.stringify({ result, audits: fixture.state.audits });
  for (const forbidden of [RAW_CREDENTIAL, CREDENTIAL_DIGEST, "activationCode", "codeHash", "renewalCredentialHash"]) {
    assert.equal(exposed.includes(forbidden), false);
  }
});

test("recovery requires the fixed eligible licence and one active installation", async () => {
  const cases = [
    [(state) => { state.licence._id = "6ab0a078e2b1d24644d368ae"; }, "licence_invalid"],
    [(state) => { state.licence.status = "expired"; }, "licence_invalid"],
    [(state) => { state.licence.activationCount = 0; }, "licence_invalid"],
    [(state) => { state.licence.maxInstallations = 2; }, "licence_invalid"],
    [(state) => { state.installations = []; }, "active_installation_ambiguous"],
    [(state) => { state.installations.push({ ...state.installations[0], _id: "6ab0af64058d4881f5e3d6de" }); }, "active_installation_ambiguous"]
  ];
  for (const [mutate, code] of cases) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture), assertRecoveryError(code));
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("recovery requires the fixed active staging admin and a canonical installation identity", async () => {
  const cases = [
    [(state) => { state.admin._id = "6ab0a078e2b1d24644d368ae"; }, "staging_admin_invalid"],
    [(state) => { state.admin.status = "inactive"; }, "staging_admin_invalid"],
    [(state) => { state.admin.role = "staff"; }, "staging_admin_invalid"],
    [(state) => { state.installations[0].deviceInstallationId = "malformed"; }, "installation_or_issue_invalid"]
  ];
  for (const [mutate, code] of cases) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture), assertRecoveryError(code));
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("recovery requires the current immutable admin-reissue for the same licence and installation", async () => {
  const cases = [
    (state) => { state.installations[0].lastIssueId = "6ab0af64058d4881f5e3d6df"; },
    (state) => { state.issues[0].issueReason = "activation"; },
    (state) => { state.issues[0].licenceId = "6ab0a078e2b1d24644d368ae"; },
    (state) => { state.issues[0].installationId = "6ab0af64058d4881f5e3d6de"; }
  ];
  for (const mutate of cases) {
    const fixture = createFixture(mutate);
    await assert.rejects(
      () => runFixture(fixture),
      (error) => ["installation_or_issue_invalid", "current_issue_invalid"].includes(error && error.code)
    );
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("already-bound or structurally inconsistent credential state fails closed", async () => {
  for (const mutate of [
    (state) => { state.installations[0].renewalCredentialVersion = 1; },
    (state) => { state.installations[0].renewalCredentialHash = CREDENTIAL_DIGEST; },
    (state) => { state.installations[0].renewalCredentialBoundAt = NOW; }
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(
      () => runFixture(fixture),
      assertRecoveryError("renewal_credential_already_bound")
    );
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("installation version and lastIssueId are protected by an exact one-row CAS", async () => {
  const fixture = createFixture((state) => { state.forceCasConflict = true; });
  await assert.rejects(
    () => runFixture(fixture),
    assertRecoveryError("installation_cas_conflict")
  );
  assert.equal(fixture.state.installations[0].renewalCredentialVersion, 0);
  assert.equal(fixture.state.installations[0].renewalCredentialHash, "");
  assert.equal(fixture.state.audits.length, 0);
  assert.equal(fixture.state.updateFilter.__v, 4);
  assert.equal(fixture.state.updateFilter.lastIssueId, CURRENT_ISSUE_ID);
});

test("malformed and protected credential input fails before transaction access", async () => {
  for (const input of [
    null,
    {},
    [],
    { renewalCredentialDigest: "not-a-digest" },
    { renewalCredentialDigest: CREDENTIAL_DIGEST, licenceId: TARGET_LICENCE_ID },
    { renewalCredential: RAW_CREDENTIAL },
    { renewalCredentialHash: CREDENTIAL_DIGEST },
    { renewalCredentialDigest: CREDENTIAL_DIGEST, POS_LICENSING_STAGING_RENEWAL_RECOVERY_TOKEN: "x".repeat(48) }
  ]) {
    const fixture = createFixture();
    await assert.rejects(() => runFixture(fixture, input));
    assert.equal(fixture.state.transactionCount, 0);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("a real transaction-capable connection is mandatory", async () => {
  const fixture = createFixture();
  for (const connection of [{}, { startSession: async () => ({}) }]) {
    await assert.rejects(
      () => runFixture(fixture, { renewalCredentialDigest: CREDENTIAL_DIGEST }, { connection }),
      assertRecoveryError("transaction_unavailable")
    );
  }
});

test("audit failure rolls back credential binding and creates no successful audit", async () => {
  const fixture = createFixture((state) => { state.failAudit = true; });
  await assert.rejects(() => runFixture(fixture), /audit write failed/);
  assert.equal(fixture.state.installations[0].renewalCredentialVersion, 0);
  assert.equal(fixture.state.installations[0].renewalCredentialHash, "");
  assert.equal(fixture.state.installations[0].lastIssueId, CURRENT_ISSUE_ID);
  assert.equal(fixture.state.audits.length, 0);
  assert.equal(fixture.state.committed, false);
});

test("service is unavailable outside the exact staging Preview branch", async () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" }
  ]) {
    const fixture = createFixture();
    await assert.rejects(
      () => runFixture(fixture, { renewalCredentialDigest: CREDENTIAL_DIGEST }, {
        env: stagingEnvironment(overrides)
      }),
      assertRecoveryError("staging_runtime_required")
    );
    assert.equal(fixture.state.transactionCount, 0);
  }
});
