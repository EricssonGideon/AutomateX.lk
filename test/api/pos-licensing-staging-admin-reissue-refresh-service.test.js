const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-admin-reissue-refresh-service-test-only";

const {
  FIXED_STAGING_ADMIN_ID,
  PREDECESSOR_SIGNATURE_PURPOSE
} = require("../../server/services/stagingPosCommittedActivationRecoveryService");
const {
  MINIMUM_FRESH_VALIDITY_MINUTES,
  TARGET_LICENCE_ID,
  refreshStagingAdminReissue
} = require("../../server/services/stagingPosAdminReissueRefreshService");
const { REQUIRED_POS_TRANSACTION_OPTIONS } = require("../../server/licensing/posLicensingTransactions");
const {
  POS_STANDARD_MODULE_IDS,
  getStandardLicenceSignatureData
} = require("../../server/utils/posLicenceContract");

const PACKAGE_ID = "6ab0a078e2b1d24644d368ac";
const CLIENT_ID = "6ab0a078e2b1d24644d368ab";
const PROJECT_ID = "6ab0a078e2b1d24644d368aa";
const INSTALLATION_ID = "6ab0af64058d4881f5e3d6da";
const PREVIOUS_ISSUE_ID = "6ab0af64058d4881f5e3d6dc";
const NEW_ISSUE_ID = "6ab0af64058d4881f5e3d6de";
const OTHER_ID = "6ab0af64058d4881f5e3d6df";
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const STAGING_KEY_ID = "automatex-pos-staging-ed25519-v1";
const NOW = new Date("2026-09-24T14:15:00.000Z");
const PREDECESSOR_OFFLINE_VALID_UNTIL = new Date("2026-09-24T13:03:17.579Z");
const LICENCE_EXPIRY = new Date("2026-09-25T07:03:17.579Z");
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

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

function keyProvider(overrides = {}) {
  return {
    keyId: STAGING_KEY_ID,
    async getPrivateKey() { return privateKey; },
    async getPublicKey() { return publicKey; },
    ...overrides
  };
}

function signedPredecessor(overrides = {}) {
  const payload = {
    schemaVersion: 1,
    clientId: CLIENT_ID,
    installationId: DEVICE_INSTALLATION_ID,
    edition: "standard",
    licenceStatus: "active",
    licenceExpiry: LICENCE_EXPIRY.toISOString(),
    enabledModules: [...POS_STANDARD_MODULE_IDS],
    updateChannel: "stable",
    supportExpiry: LICENCE_EXPIRY.toISOString(),
    issuedAt: "2026-09-24T07:10:00.000Z",
    offlineValidUntil: PREDECESSOR_OFFLINE_VALID_UNTIL.toISOString(),
    keyId: STAGING_KEY_ID,
    signature: "",
    ...overrides
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "signature")) {
    payload.signature = crypto.sign(
      null,
      Buffer.from(getStandardLicenceSignatureData(payload), "utf8"),
      privateKey
    ).toString("base64");
  }
  return payload;
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
      clientId: CLIENT_ID,
      projectId: PROJECT_ID,
      packageId: PACKAGE_ID,
      edition: "standard",
      status: "active",
      entitledModules: [...POS_STANDARD_MODULE_IDS],
      updateChannel: "stable",
      licenceExpiry: new Date(LICENCE_EXPIRY),
      supportExpiry: new Date(LICENCE_EXPIRY),
      offlineValidUntil: new Date(PREDECESSOR_OFFLINE_VALID_UNTIL),
      renewalWindowDurationMinutes: 60,
      maxInstallations: 1,
      activationCount: 1
    },
    posPackage: {
      _id: PACKAGE_ID,
      edition: "standard",
      status: "active",
      moduleIds: [...POS_STANDARD_MODULE_IDS],
      updateChannels: ["stable"]
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
      lastIssueId: PREVIOUS_ISSUE_ID,
      __v: 4
    }],
    issues: [{
      _id: PREVIOUS_ISSUE_ID,
      licenceId: TARGET_LICENCE_ID,
      installationId: INSTALLATION_ID,
      status: "issued",
      issueReason: "admin-reissue",
      keyId: STAGING_KEY_ID,
      issuedAt: new Date("2026-09-24T07:10:00.000Z"),
      licenceExpiry: new Date(LICENCE_EXPIRY),
      offlineValidUntil: new Date(PREDECESSOR_OFFLINE_VALID_UNTIL),
      payloadDigest: "sha256:predecessor",
      signedPayload: signedPredecessor(),
      createdBy: FIXED_STAGING_ADMIN_ID,
      __v: 0
    }],
    activationCodeSentinel: {
      _id: OTHER_ID,
      status: "redeemed",
      redeemedCount: 1,
      maxRedemptions: 1,
      codeHash: "sha256:v1:must-never-be-accessed"
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
  return Object.entries(filter).every(([field, expected]) => same(record[field], expected));
}

function createFixture(mutate = null) {
  let state = initialState();
  if (typeof mutate === "function") {
    mutate(state);
  }

  const repositories = {
    users: {
      findById(id) { return queryValue(() => same(id, FIXED_STAGING_ADMIN_ID) ? state.admin : null); }
    },
    posLicences: {
      findById(id) { return queryValue(() => same(id, TARGET_LICENCE_ID) ? state.licence : null); }
    },
    posPackages: {
      findById(id) { return queryValue(() => same(id, PACKAGE_ID) ? state.posPackage : null); }
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
      },
      async create(candidates, options) {
        assert.equal(options.session, session);
        const created = candidates.map((candidate) => ({
          ...structuredClone(candidate),
          _id: NEW_ISSUE_ID,
          createdAt: new Date(NOW),
          updatedAt: new Date(NOW),
          __v: 0
        }));
        state.issues.push(...created);
        return created;
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

  const session = {
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

async function runFixture(fixture, options = {}) {
  return refreshStagingAdminReissue({
    env: stagingEnvironment(),
    connection: fixture.connection,
    repositories: fixture.repositories,
    keyProvider: keyProvider(),
    clock: () => new Date(NOW),
    ...options
  });
}

function refreshError(code) {
  return (error) => error && error.code === code;
}

test("successful refresh appends a fresh admin-reissue and preserves committed state", async () => {
  const fixture = createFixture();
  const previousIssue = structuredClone(fixture.state.issues[0]);
  const activationCode = structuredClone(fixture.state.activationCodeSentinel);
  const originalInstallation = structuredClone(fixture.state.installations[0]);
  const result = await runFixture(fixture);

  assert.deepEqual(Object.keys(result), [
    "licenceId",
    "installationId",
    "previousIssueId",
    "newIssueId",
    "signedLicence"
  ]);
  assert.equal(result.licenceId, TARGET_LICENCE_ID);
  assert.equal(result.installationId, INSTALLATION_ID);
  assert.equal(result.previousIssueId, PREVIOUS_ISSUE_ID);
  assert.equal(result.newIssueId, NEW_ISSUE_ID);
  assert.equal(result.signedLicence.installationId, DEVICE_INSTALLATION_ID);
  assert.equal(result.signedLicence.keyId, STAGING_KEY_ID);
  assert.equal(result.signedLicence.offlineValidUntil, "2026-09-24T15:15:00.000Z");
  assert.ok(new Date(result.signedLicence.offlineValidUntil) > PREDECESSOR_OFFLINE_VALID_UNTIL);
  assert.equal(crypto.verify(
    null,
    Buffer.from(getStandardLicenceSignatureData(result.signedLicence), "utf8"),
    publicKey,
    Buffer.from(result.signedLicence.signature, "base64")
  ), true);

  assert.equal(fixture.state.transactionCount, 1);
  assert.deepEqual(fixture.state.transactionOptions, REQUIRED_POS_TRANSACTION_OPTIONS);
  assert.equal(fixture.state.committed, true);
  assert.equal(fixture.state.ended, true);
  assert.equal(fixture.state.issues.length, 2);
  assert.deepEqual(fixture.state.issues[0], previousIssue);
  assert.equal(fixture.state.issues[1].issueReason, "admin-reissue");
  assert.equal(fixture.state.issues[1].activationCodeId, null);
  assert.equal(fixture.state.issues[1].installationId, INSTALLATION_ID);
  assert.equal(fixture.state.issues[1].renewalCredentialVersion, 0);
  assert.match(fixture.state.issues[1].predecessorSignatureHash, /^sha256:v1:[a-f0-9]{64}$/);
  assert.equal(fixture.state.issues[1].predecessorSignatureHash, `sha256:v1:${crypto
    .createHash("sha256")
    .update(`${PREDECESSOR_SIGNATURE_PURPOSE}${previousIssue.signedPayload.signature}`, "utf8")
    .digest("hex")}`);

  assert.equal(fixture.state.installations.length, 1);
  assert.equal(fixture.state.installations[0].lastIssueId, NEW_ISSUE_ID);
  assert.equal(fixture.state.installations[0].__v, originalInstallation.__v + 1);
  assert.equal(fixture.state.installations[0].renewalCredentialHash, originalInstallation.renewalCredentialHash);
  assert.equal(fixture.state.installations[0].renewalCredentialVersion, 0);
  assert.equal(fixture.state.installations[0].renewalCredentialBoundAt, null);
  assert.equal(fixture.state.licence.activationCount, 1);
  assert.equal(fixture.state.licence.maxInstallations, 1);
  assert.deepEqual(fixture.state.activationCodeSentinel, activationCode);
  assert.equal(Object.hasOwn(fixture.repositories, "posActivationCodes"), false);
  assert.equal(fixture.state.audits.length, 1);
  assert.equal(fixture.state.audits[0].action, "licences.admin-reissue.refresh");
});

test("expired predecessor is allowed when authentic and licence expiry remains future", async () => {
  assert.ok(PREDECESSOR_OFFLINE_VALID_UNTIL < NOW);
  const result = await runFixture(createFixture());
  assert.ok(new Date(result.signedLicence.offlineValidUntil) > NOW);
});

test("fresh offline window is capped by licenceExpiry", async () => {
  const cappedExpiry = new Date(NOW.getTime() + 30 * 60 * 1000);
  const fixture = createFixture((state) => {
    state.licence.licenceExpiry = cappedExpiry;
    state.licence.supportExpiry = cappedExpiry;
    state.issues[0].licenceExpiry = cappedExpiry;
    state.issues[0].signedPayload = signedPredecessor({
      licenceExpiry: cappedExpiry.toISOString(),
      supportExpiry: cappedExpiry.toISOString()
    });
  });
  const result = await runFixture(fixture);
  assert.equal(result.signedLicence.offlineValidUntil, cappedExpiry.toISOString());
});

test("wrong or missing predecessor keyId fails before writes", async () => {
  for (const mutate of [
    (state) => { state.issues[0].keyId = ""; },
    (state) => { state.issues[0].keyId = "automatex-pos-staging-ed25519-v2"; },
    (state) => { state.issues[0].signedPayload = signedPredecessor({ keyId: "" }); },
    (state) => { state.issues[0].signedPayload = signedPredecessor({ keyId: "automatex-pos-staging-ed25519-v2" }); }
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture), refreshError("predecessor_issue_invalid"));
    assert.equal(fixture.state.issues.length, 1);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("invalid predecessor signature fails before writes", async () => {
  const fixture = createFixture((state) => {
    state.issues[0].signedPayload.signature = Buffer.alloc(64, 5).toString("base64");
  });
  await assert.rejects(() => runFixture(fixture), refreshError("predecessor_signature_invalid"));
  assert.equal(fixture.state.issues.length, 1);
  assert.equal(fixture.state.audits.length, 0);
});

test("wrong issue reason and lastIssueId mismatch fail closed", async () => {
  for (const mutate of [
    (state) => { state.issues[0].issueReason = "activation"; },
    (state) => { state.issues[0]._id = OTHER_ID; }
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture));
    assert.equal(fixture.state.issues.length, 1);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("installation version and lastIssueId are exact CAS protections", async () => {
  const fixture = createFixture((state) => { state.forceCasConflict = true; });
  await assert.rejects(() => runFixture(fixture), refreshError("installation_cas_conflict"));
  assert.equal(fixture.state.issues.length, 1);
  assert.equal(fixture.state.installations[0].lastIssueId, PREVIOUS_ISSUE_ID);
  assert.equal(fixture.state.installations[0].__v, 4);
  assert.equal(fixture.state.audits.length, 0);
  assert.deepEqual(fixture.state.updateFilter, {
    _id: INSTALLATION_ID,
    licenceId: TARGET_LICENCE_ID,
    deviceInstallationId: DEVICE_INSTALLATION_ID,
    status: "active",
    lastIssueId: PREVIOUS_ISSUE_ID,
    __v: 4
  });
});

test("expired licence and insufficient remaining validity fail closed", async () => {
  const insufficientExpiry = new Date(NOW.getTime() + 4 * 60 * 1000);
  for (const [mutate, code] of [
    [(state) => { state.licence.licenceExpiry = new Date(NOW.getTime() - 1); }, "licence_expired"],
    [(state) => {
      state.licence.licenceExpiry = insufficientExpiry;
      state.licence.supportExpiry = insufficientExpiry;
      state.issues[0].licenceExpiry = insufficientExpiry;
      state.issues[0].signedPayload = signedPredecessor({
        licenceExpiry: insufficientExpiry.toISOString(),
        supportExpiry: insufficientExpiry.toISOString()
      });
    }, "fresh_validity_unusable"]
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture), refreshError(code));
    assert.equal(fixture.state.issues.length, 1);
    assert.equal(fixture.state.audits.length, 0);
  }
  assert.equal(MINIMUM_FRESH_VALIDITY_MINUTES, 5);
});

test("zero or multiple active installations fail closed", async () => {
  for (const count of [0, 2]) {
    const fixture = createFixture((state) => {
      if (count === 0) {
        state.installations = [];
      } else {
        state.installations.push({ ...state.installations[0], _id: OTHER_ID });
      }
    });
    await assert.rejects(() => runFixture(fixture), refreshError("active_installation_ambiguous"));
    assert.equal(fixture.state.issues.length, 1);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("fixed licence counters and unbound credential state are mandatory and unchanged on failure", async () => {
  for (const [mutate, code] of [
    [(state) => { state.licence.activationCount = 0; }, "licence_invalid"],
    [(state) => { state.licence.maxInstallations = 2; }, "licence_invalid"],
    [(state) => { state.installations[0].renewalCredentialVersion = 1; }, "renewal_credential_state_invalid"],
    [(state) => { state.installations[0].renewalCredentialHash = "sha256:v1:bound"; }, "renewal_credential_state_invalid"]
  ]) {
    const fixture = createFixture(mutate);
    const before = structuredClone(fixture.state);
    await assert.rejects(() => runFixture(fixture), refreshError(code));
    assert.equal(fixture.state.issues.length, before.issues.length);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("audit failure rolls back issue creation and installation update", async () => {
  const fixture = createFixture((state) => { state.failAudit = true; });
  await assert.rejects(() => runFixture(fixture), /audit write failed/);
  assert.equal(fixture.state.committed, false);
  assert.equal(fixture.state.issues.length, 1);
  assert.equal(fixture.state.installations[0].lastIssueId, PREVIOUS_ISSUE_ID);
  assert.equal(fixture.state.installations[0].__v, 4);
  assert.equal(fixture.state.audits.length, 0);
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
      () => runFixture(fixture, { env: stagingEnvironment(overrides) }),
      refreshError("staging_runtime_required")
    );
    assert.equal(fixture.state.transactionCount, 0);
  }
});
