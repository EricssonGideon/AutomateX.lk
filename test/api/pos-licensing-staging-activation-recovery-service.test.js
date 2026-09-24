const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-activation-recovery-test-only";

const {
  FIXED_STAGING_ADMIN_ID,
  TARGET_LICENCE_ID,
  recoverStagingCommittedActivation
} = require("../../server/services/stagingPosCommittedActivationRecoveryService");
const {
  FIXED_STAGING_ADMIN_ID: REPLACEMENT_ADMIN_ID,
  TARGET_LICENCE_ID: REPLACEMENT_TARGET_LICENCE_ID
} = require("../../server/services/stagingPosActivationCodeReplacementService");
const { REQUIRED_POS_TRANSACTION_OPTIONS } = require("../../server/licensing/posLicensingTransactions");
const {
  POS_STANDARD_MODULE_IDS,
  getStandardLicenceSignatureData
} = require("../../server/utils/posLicenceContract");

const PACKAGE_ID = "6ab0a078e2b1d24644d368ac";
const CLIENT_ID = "6ab0a078e2b1d24644d368ab";
const PROJECT_ID = "6ab0a078e2b1d24644d368aa";
const INSTALLATION_ID = "6ab0af64058d4881f5e3d6da";
const PREVIOUS_ISSUE_ID = "6ab0af64058d4881f5e3d6db";
const NEW_ISSUE_ID = "6ab0af64058d4881f5e3d6dc";
const ACTIVATION_CODE_ID = "6ab0af64058d4881f5e3d6dd";
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const STAGING_KEY_ID = "automatex-pos-staging-ed25519-v1";
const NOW = new Date("2026-09-24T10:00:00.000Z");
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
    ...overrides
  };
}

function originalSignedPayload() {
  return {
    schemaVersion: 1,
    clientId: CLIENT_ID,
    installationId: DEVICE_INSTALLATION_ID,
    edition: "standard",
    licenceStatus: "active",
    licenceExpiry: "2026-10-24T00:00:00.000Z",
    enabledModules: [...POS_STANDARD_MODULE_IDS],
    updateChannel: "stable",
    supportExpiry: "2026-10-24T00:00:00.000Z",
    issuedAt: "2026-09-24T07:03:17.579Z",
    offlineValidUntil: "2026-09-25T10:00:00.000Z",
    signature: Buffer.from("original-signature").toString("base64")
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
      clientId: CLIENT_ID,
      projectId: PROJECT_ID,
      packageId: PACKAGE_ID,
      edition: "standard",
      status: "active",
      entitledModules: [...POS_STANDARD_MODULE_IDS],
      updateChannel: "stable",
      licenceExpiry: new Date("2026-10-24T00:00:00.000Z"),
      supportExpiry: new Date("2026-10-24T00:00:00.000Z"),
      offlineValidUntil: new Date("2026-09-25T10:00:00.000Z"),
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
      renewalCredentialVersion: 0,
      renewalCredentialBoundAt: null,
      lastIssueId: PREVIOUS_ISSUE_ID,
      __v: 3
    }],
    issues: [{
      _id: PREVIOUS_ISSUE_ID,
      licenceId: TARGET_LICENCE_ID,
      installationId: INSTALLATION_ID,
      activationCodeId: ACTIVATION_CODE_ID,
      status: "issued",
      issueReason: "activation",
      keyId: STAGING_KEY_ID,
      issuedAt: new Date("2026-09-24T07:03:17.579Z"),
      licenceExpiry: new Date("2026-10-24T00:00:00.000Z"),
      offlineValidUntil: new Date("2026-09-25T10:00:00.000Z"),
      payloadDigest: "sha256:original-payload-digest",
      signedPayload: originalSignedPayload(),
      createdBy: null,
      __v: 0
    }],
    activationCodeSentinel: {
      _id: ACTIVATION_CODE_ID,
      status: "redeemed",
      redeemedCount: 1,
      maxRedemptions: 1,
      activationCode: "posac_must-never-be-returned",
      codeHash: "sha256:v1:must-never-be-returned"
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
  return recoverStagingCommittedActivation({
    env: stagingEnvironment(),
    connection: fixture.connection,
    repositories: fixture.repositories,
    keyProvider: keyProvider(),
    clock: () => new Date(NOW),
    ...options
  });
}

function assertRecoveryError(code) {
  return (error) => error && error.code === code;
}

test("recovery constants reuse the existing staging admin and fixed target licence", () => {
  assert.equal(FIXED_STAGING_ADMIN_ID, REPLACEMENT_ADMIN_ID);
  assert.equal(TARGET_LICENCE_ID, REPLACEMENT_TARGET_LICENCE_ID);
});

test("successful recovery appends an admin reissue for the same installation", async () => {
  const fixture = createFixture();
  const originalIssue = structuredClone(fixture.state.issues[0]);
  const originalActivationCode = structuredClone(fixture.state.activationCodeSentinel);
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
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(getStandardLicenceSignatureData(result.signedLicence), "utf8"),
      publicKey,
      Buffer.from(result.signedLicence.signature, "base64")
    ),
    true
  );
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(getStandardLicenceSignatureData({
        ...result.signedLicence,
        keyId: "automatex-pos-staging-ed25519-v2"
      }), "utf8"),
      publicKey,
      Buffer.from(result.signedLicence.signature, "base64")
    ),
    false
  );

  assert.equal(fixture.state.transactionCount, 1);
  assert.deepEqual(fixture.state.transactionOptions, REQUIRED_POS_TRANSACTION_OPTIONS);
  assert.equal(fixture.state.committed, true);
  assert.equal(fixture.state.ended, true);
  assert.equal(fixture.state.installations.length, 1);
  assert.equal(fixture.state.licence.activationCount, 1);
  assert.equal(fixture.state.licence.maxInstallations, 1);
  assert.deepEqual(fixture.state.issues[0], originalIssue);
  assert.deepEqual(fixture.state.activationCodeSentinel, originalActivationCode);
  assert.equal(fixture.state.issues.length, 2);
  assert.equal(fixture.state.issues[1].issueReason, "admin-reissue");
  assert.equal(fixture.state.issues[1].activationCodeId, ACTIVATION_CODE_ID);
  assert.equal(fixture.state.issues[1].installationId, INSTALLATION_ID);
  assert.equal(fixture.state.issues[1].keyId, STAGING_KEY_ID);
  assert.equal(fixture.state.issues[1].signedPayload.keyId, STAGING_KEY_ID);
  assert.match(fixture.state.issues[1].predecessorSignatureHash, /^sha256:v1:[a-f0-9]{64}$/);
  assert.equal(fixture.state.installations[0].lastIssueId, NEW_ISSUE_ID);
  assert.equal(fixture.state.installations[0].__v, 4);
  assert.equal(fixture.state.installations[0].renewalCredentialVersion, 0);
  assert.equal(fixture.state.audits.length, 1);
  assert.equal(fixture.state.audits[0].action, "licences.activation.admin-reissue");

  const serialized = JSON.stringify({ result, audits: fixture.state.audits });
  for (const forbidden of ["codeHash", "posac_must", "sha256:v1:must-never"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("recovery requires the original stored payload to be the legacy contract without keyId", async () => {
  for (const mutate of [
    (state) => { state.issues[0].signedPayload = null; },
    (state) => { state.issues[0].signedPayload.keyId = STAGING_KEY_ID; }
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture), assertRecoveryError("original_activation_issue_invalid"));
    assert.equal(fixture.state.issues.length, 1);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("wrong licence and invalid fixed staging admin fail closed", async () => {
  for (const mutate of [
    (state) => { state.licence._id = CLIENT_ID; },
    (state) => { state.admin.status = "inactive"; }
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture));
    assert.equal(fixture.state.issues.length, 1);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("zero or multiple active installations fail closed", async () => {
  for (const count of [0, 2]) {
    const fixture = createFixture((state) => {
      if (count === 0) {
        state.installations = [];
      } else {
        state.installations.push({
          ...structuredClone(state.installations[0]),
          _id: "6ab0af64058d4881f5e3d6de",
          deviceInstallationId: "223e4567-e89b-42d3-a456-426614174000"
        });
      }
    });
    await assert.rejects(() => runFixture(fixture), assertRecoveryError("active_installation_ambiguous"));
    assert.equal(fixture.state.issues.length, 1);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("lastIssueId and original issue linkage mismatches fail closed", async () => {
  const fixtures = [
    createFixture((state) => { state.installations[0].lastIssueId = NEW_ISSUE_ID; }),
    createFixture((state) => { state.issues[0].issueReason = "renewal"; }),
    createFixture((state) => { state.issues[0].installationId = PACKAGE_ID; }),
    createFixture((state) => { state.issues[0].licenceId = CLIENT_ID; })
  ];
  for (const fixture of fixtures) {
    await assert.rejects(() => runFixture(fixture));
    assert.equal(fixture.state.issues.length, 1);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("installation CAS includes prior issue and version and rolls back on conflict", async () => {
  const fixture = createFixture((state) => { state.forceCasConflict = true; });
  await assert.rejects(() => runFixture(fixture), assertRecoveryError("installation_cas_conflict"));
  assert.equal(fixture.state.issues.length, 1);
  assert.equal(fixture.state.installations[0].lastIssueId, PREVIOUS_ISSUE_ID);
  assert.equal(fixture.state.installations[0].__v, 3);
  assert.equal(fixture.state.audits.length, 0);
  assert.equal(fixture.state.updateFilter.lastIssueId, PREVIOUS_ISSUE_ID);
  assert.equal(fixture.state.updateFilter.__v, 3);
  assert.equal(fixture.state.updateFilter.licenceId, TARGET_LICENCE_ID);
  assert.equal(fixture.state.updateFilter.deviceInstallationId, DEVICE_INSTALLATION_ID);
});

test("licence and package ineligibility fail before writes", async () => {
  const fixtures = [
    createFixture((state) => { state.licence.status = "suspended"; }),
    createFixture((state) => { state.licence.activationCount = 0; }),
    createFixture((state) => { state.licence.maxInstallations = 2; }),
    createFixture((state) => { state.licence.licenceExpiry = new Date("2026-09-23T00:00:00.000Z"); }),
    createFixture((state) => { state.posPackage.status = "draft"; }),
    createFixture((state) => { state.posPackage.updateChannels = ["beta"]; })
  ];
  for (const fixture of fixtures) {
    await assert.rejects(() => runFixture(fixture));
    assert.equal(fixture.state.issues.length, 1);
    assert.equal(fixture.state.installations[0].lastIssueId, PREVIOUS_ISSUE_ID);
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("original issue key metadata must match the configured staging provider when present", async () => {
  const mismatch = createFixture((state) => { state.issues[0].keyId = "automatex-pos-staging-ed25519-v2"; });
  await assert.rejects(() => runFixture(mismatch), assertRecoveryError("original_issue_key_mismatch"));
  assert.equal(mismatch.state.issues.length, 1);
  assert.equal(mismatch.state.audits.length, 0);

  const legacyBlank = createFixture((state) => { state.issues[0].keyId = ""; });
  const result = await runFixture(legacyBlank);
  assert.equal(result.signedLicence.keyId, STAGING_KEY_ID);
});

test("staging runtime, staging signing provider, and transaction support are mandatory", async () => {
  const fixture = createFixture();
  await assert.rejects(
    () => runFixture(fixture, { env: stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }) }),
    assertRecoveryError("staging_runtime_required")
  );
  await assert.rejects(
    () => runFixture(fixture, { keyProvider: keyProvider({ keyId: "automatex-pos-prod-ed25519-v1" }) }),
    assertRecoveryError("staging_signing_provider_invalid")
  );
  await assert.rejects(
    () => runFixture(fixture, { connection: {} }),
    assertRecoveryError("transaction_unavailable")
  );
  assert.equal(fixture.state.transactionCount, 0);
  assert.equal(fixture.state.issues.length, 1);
  assert.equal(fixture.state.audits.length, 0);
});

test("audit is committed only with a successful recovery transaction", async () => {
  const fixture = createFixture((state) => { state.failAudit = true; });
  const originalIssue = structuredClone(fixture.state.issues[0]);
  await assert.rejects(() => runFixture(fixture), /audit write failed/);
  assert.equal(fixture.state.committed, false);
  assert.equal(fixture.state.issues.length, 1);
  assert.deepEqual(fixture.state.issues[0], originalIssue);
  assert.equal(fixture.state.installations[0].lastIssueId, PREVIOUS_ISSUE_ID);
  assert.equal(fixture.state.installations[0].__v, 3);
  assert.equal(fixture.state.audits.length, 0);
});
