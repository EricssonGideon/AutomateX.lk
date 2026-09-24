const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-admin-reissue-readback-service-test-only";

const {
  TARGET_LICENCE_ID,
  readStagingAdminReissue
} = require("../../server/services/stagingPosAdminReissueReadbackService");
const {
  TARGET_LICENCE_ID: RECOVERY_TARGET_LICENCE_ID
} = require("../../server/services/stagingPosCommittedActivationRecoveryService");
const {
  POS_STANDARD_MODULE_IDS,
  getStandardLicenceSignatureData
} = require("../../server/utils/posLicenceContract");

const CLIENT_ID = "6ab0a078e2b1d24644d368ab";
const INSTALLATION_RECORD_ID = "6ab0af64058d4881f5e3d6da";
const ISSUE_ID = "6ab0af64058d4881f5e3d6dc";
const OTHER_ID = "6ab0af64058d4881f5e3d6dd";
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const STAGING_KEY_ID = "automatex-pos-staging-ed25519-v1";
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

function createSignedPayload(overrides = {}) {
  const payload = {
    schemaVersion: 1,
    clientId: CLIENT_ID,
    installationId: DEVICE_INSTALLATION_ID,
    edition: "standard",
    licenceStatus: "active",
    licenceExpiry: "2026-10-24T00:00:00.000Z",
    enabledModules: [...POS_STANDARD_MODULE_IDS],
    updateChannel: "stable",
    supportExpiry: "2026-10-24T00:00:00.000Z",
    issuedAt: "2026-09-24T10:00:00.000Z",
    offlineValidUntil: "2026-09-25T10:00:00.000Z",
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
    licence: {
      _id: TARGET_LICENCE_ID,
      clientId: CLIENT_ID,
      activationCount: 1,
      maxInstallations: 1
    },
    installations: [{
      _id: INSTALLATION_RECORD_ID,
      licenceId: TARGET_LICENCE_ID,
      deviceInstallationId: DEVICE_INSTALLATION_ID,
      status: "active",
      lastIssueId: ISSUE_ID
    }],
    issue: {
      _id: ISSUE_ID,
      licenceId: TARGET_LICENCE_ID,
      installationId: INSTALLATION_RECORD_ID,
      status: "issued",
      issueReason: "admin-reissue",
      keyId: STAGING_KEY_ID,
      signedPayload: createSignedPayload()
    },
    projections: [],
    writes: 0
  };
}

function queryValue(state, label, read) {
  return {
    select(projection) {
      state.projections.push({ label, projection });
      return this;
    },
    lean() { return Promise.resolve(read()); },
    then(resolve, reject) { return Promise.resolve(read()).then(resolve, reject); }
  };
}

function createFixture(mutate) {
  const state = initialState();
  if (mutate) {
    mutate(state);
  }
  function forbiddenWrite() {
    state.writes += 1;
    throw new Error("readback must not write");
  }
  const repositories = {
    posLicences: {
      findById(id) {
        return queryValue(state, "licence", () => String(id) === TARGET_LICENCE_ID ? state.licence : null);
      },
      create: forbiddenWrite,
      updateOne: forbiddenWrite
    },
    posInstallations: {
      find(filter) {
        return queryValue(state, "installations", () => state.installations.filter((record) =>
          String(record.licenceId) === String(filter.licenceId) && record.status === filter.status
        ));
      },
      create: forbiddenWrite,
      updateOne: forbiddenWrite
    },
    posLicenceIssues: {
      findById() { return queryValue(state, "issue", () => state.issue); },
      create: forbiddenWrite,
      updateOne: forbiddenWrite
    }
  };
  return { repositories, state };
}

function provider(overrides = {}) {
  return {
    keyId: STAGING_KEY_ID,
    async getPublicKey() { return publicKey; },
    ...overrides
  };
}

async function runFixture(fixture, options = {}) {
  return readStagingAdminReissue({
    env: stagingEnvironment(),
    repositories: fixture.repositories,
    keyProvider: provider(),
    ...options
  });
}

function readbackError(code) {
  return (error) => error && error.code === code;
}

test("valid readback returns the committed admin-reissue payload without writes", async () => {
  assert.equal(TARGET_LICENCE_ID, RECOVERY_TARGET_LICENCE_ID);
  const fixture = createFixture();
  const before = structuredClone({
    licence: fixture.state.licence,
    installations: fixture.state.installations,
    issue: fixture.state.issue
  });
  const result = await runFixture(fixture);

  assert.deepEqual(Object.keys(result), [
    "licenceId",
    "installationRecordId",
    "issueId",
    "signedLicence"
  ]);
  assert.equal(result.licenceId, TARGET_LICENCE_ID);
  assert.equal(result.installationRecordId, INSTALLATION_RECORD_ID);
  assert.equal(result.issueId, ISSUE_ID);
  assert.deepEqual(result.signedLicence, fixture.state.issue.signedPayload);
  assert.equal(fixture.state.writes, 0);
  assert.deepEqual({
    licence: fixture.state.licence,
    installations: fixture.state.installations,
    issue: fixture.state.issue
  }, before);
  assert.deepEqual(fixture.state.projections, [
    { label: "licence", projection: "_id clientId activationCount maxInstallations" },
    { label: "installations", projection: "_id licenceId deviceInstallationId status lastIssueId" },
    { label: "issue", projection: "_id licenceId installationId status issueReason keyId +signedPayload" }
  ]);
  assert.equal(JSON.stringify(fixture.state.projections).includes("activationCode"), false);
  assert.equal(JSON.stringify(fixture.state.projections).includes("renewalCredential"), false);
});

test("issue reason must be admin-reissue", async () => {
  const fixture = createFixture((state) => { state.issue.issueReason = "activation"; });
  await assert.rejects(() => runFixture(fixture), readbackError("issue_invalid"));
});

test("installation lastIssueId must resolve to the same issue", async () => {
  const fixture = createFixture((state) => { state.issue._id = OTHER_ID; });
  await assert.rejects(() => runFixture(fixture), readbackError("installation_or_issue_invalid"));
});

test("issue and signed payload must match the active installation", async () => {
  for (const mutate of [
    (state) => { state.issue.installationId = OTHER_ID; },
    (state) => { state.issue.signedPayload = createSignedPayload({ installationId: "223e4567-e89b-42d3-a456-426614174000" }); }
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture));
    assert.equal(fixture.state.writes, 0);
  }
});

test("licence, installation, issue, and payload client linkage must match the fixed licence", async () => {
  for (const mutate of [
    (state) => { state.licence._id = OTHER_ID; },
    (state) => { state.installations[0].licenceId = OTHER_ID; },
    (state) => { state.issue.licenceId = OTHER_ID; },
    (state) => { state.issue.signedPayload = createSignedPayload({ clientId: OTHER_ID }); }
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture));
  }
});

test("missing signed payload fails closed", async () => {
  const fixture = createFixture((state) => { state.issue.signedPayload = null; });
  await assert.rejects(() => runFixture(fixture), readbackError("signed_payload_invalid"));
});

test("wrong or missing issue and signed-payload key IDs fail closed", async () => {
  for (const mutate of [
    (state) => { state.issue.keyId = ""; },
    (state) => { state.issue.keyId = "automatex-pos-staging-ed25519-v2"; },
    (state) => { state.issue.signedPayload = createSignedPayload({ keyId: "" }); },
    (state) => { state.issue.signedPayload = createSignedPayload({ keyId: "automatex-pos-staging-ed25519-v2" }); }
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture));
  }
});

test("invalid signatures fail closed", async () => {
  const fixture = createFixture((state) => {
    state.issue.signedPayload.signature = Buffer.alloc(64, 7).toString("base64");
  });
  await assert.rejects(() => runFixture(fixture), readbackError("signature_verification_failed"));
});

test("licence counters and exactly one active installation are mandatory", async () => {
  for (const mutate of [
    (state) => { state.licence.activationCount = 0; },
    (state) => { state.licence.maxInstallations = 2; },
    (state) => { state.installations = []; },
    (state) => { state.installations.push({ ...state.installations[0], _id: OTHER_ID }); }
  ]) {
    const fixture = createFixture(mutate);
    await assert.rejects(() => runFixture(fixture));
  }
});

test("runtime and public verification provider must be staging-only", async () => {
  await assert.rejects(
    () => runFixture(createFixture(), { env: stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }) }),
    readbackError("staging_runtime_required")
  );
  await assert.rejects(
    () => runFixture(createFixture(), { keyProvider: provider({ keyId: "automatex-pos-prod-ed25519-v1" }) }),
    readbackError("staging_verification_provider_invalid")
  );
  await assert.rejects(
    () => runFixture(createFixture(), { keyProvider: provider({ getPublicKey: undefined }) }),
    readbackError("staging_verification_provider_invalid")
  );
});
