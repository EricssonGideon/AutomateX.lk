const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-replace-activation-code-test-only";

const {
  STAGING_REPLACE_ACTIVATION_CODE_PATH,
  SUCCESS_FIELDS,
  createStagingReplaceActivationCodeHandler,
  mountStagingReplaceActivationCodeEndpoint,
  shouldMountStagingReplaceActivationCodeEndpoint
} = require("../../server/routes/internalStagingReplaceActivationCode");
const {
  EXPECTED_OLD_ACTIVATION_CODE_ID,
  FIXED_STAGING_ADMIN_ID,
  TARGET_LICENCE_ID,
  replaceStagingActivationCode
} = require("../../server/services/stagingPosActivationCodeReplacementService");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const { REQUIRED_POS_TRANSACTION_OPTIONS } = require("../../server/licensing/posLicensingTransactions");
const { POS_STANDARD_MODULE_IDS } = require("../../server/utils/posLicenceContract");
const {
  digestActivationCode,
  isActivationCodeFormat
} = require("../../server/utils/posActivationCodeToken");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");

const OPERATOR_TOKEN = "staging-replace-activation-code-operator-" + "r".repeat(40);
const PACKAGE_ID = "6ab0a078e2b1d24644d368ac";
const CLIENT_ID = "6ab0a078e2b1d24644d368ab";
const PROJECT_ID = "6ab0a078e2b1d24644d368aa";
const REPLACEMENT_ID = "6ab0af64058d4881f5e3d6de";
const REPLACEMENT_CODE = "posac_" + "b".repeat(32);
const NOW = new Date("2030-01-01T00:00:00.000Z");
const REPLACEMENT_EXPIRY = "2030-01-01T01:00:00.000Z";

function stagingEnvironment(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_ENABLED: "true",
    POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_TOKEN: OPERATOR_TOKEN,
    ...overrides
  };
}

function successResult() {
  return {
    replaced: true,
    revokedActivationCodeId: EXPECTED_OLD_ACTIVATION_CODE_ID,
    replacementActivationCode: REPLACEMENT_CODE,
    expiresAt: REPLACEMENT_EXPIRY,
    maxRedemptions: 1,
    codeHash: "must-not-be-returned",
    admin: { email: "must-not-be-returned@example.invalid" }
  };
}

function request(authorization, body = {}, query = {}) {
  return {
    body,
    query,
    get(name) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    }
  };
}

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    jsonCalls: 0,
    headers: {},
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.jsonCalls += 1; this.body = body; return this; }
  };
}

function routerRecorder() {
  return {
    registrations: [],
    post(path, handler) { this.registrations.push({ method: "POST", path, handler }); }
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const handler = createStagingReplaceActivationCodeHandler({
    env,
    connection: options.connection || {
      name: "automatex_pos_staging",
      db: { databaseName: "automatex_pos_staging" }
    },
    validateMongoConfig: options.validateMongoConfig || (() => ({
      environment: "staging",
      databaseName: "automatex_pos_staging"
    })),
    runReplacement: options.runReplacement || (async () => successResult()),
    clock: options.clock || (() => new Date(NOW)),
    replacementOptions: options.replacementOptions,
    connectionProvider: options.connectionProvider
  });
  await handler(request(authorization, options.body, options.query), response);
  return response;
}

function queryValue(read) {
  const query = {
    select() { return this; },
    session() { return this; },
    lean() { return Promise.resolve(read()); },
    then(resolve, reject) { return Promise.resolve(read()).then(resolve, reject); }
  };
  return query;
}

function initialState(overrides = {}) {
  const state = {
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
      licenceExpiry: new Date("2030-01-02T00:00:00.000Z"),
      supportExpiry: new Date("2030-01-02T00:00:00.000Z"),
      offlineValidUntil: new Date("2030-01-01T06:00:00.000Z"),
      renewalWindowDurationMinutes: 60,
      maxInstallations: 1,
      activationCount: 0
    },
    posPackage: {
      _id: PACKAGE_ID,
      edition: "standard",
      status: "active",
      moduleIds: [...POS_STANDARD_MODULE_IDS],
      updateChannels: ["stable"]
    },
    codes: [{
      _id: EXPECTED_OLD_ACTIVATION_CODE_ID,
      licenceId: TARGET_LICENCE_ID,
      codeHash: "sha256:v1:" + "a".repeat(64),
      status: "active",
      expiresAt: new Date("2030-01-01T00:30:00.000Z"),
      maxRedemptions: 1,
      redeemedCount: 0,
      __v: 0
    }],
    audits: [],
    transactions: 0,
    committed: false,
    ended: false,
    transactionOptions: null,
    failAuditAction: "",
    ...overrides
  };
  return state;
}

function matches(record, filter) {
  return Object.entries(filter).every(([key, value]) => String(record[key]) === String(value));
}

function createFixture(overrides = {}) {
  const state = initialState(overrides);
  const repositories = {
    users: {
      findById(id) { return queryValue(() => id === FIXED_STAGING_ADMIN_ID ? state.admin : null); }
    },
    posLicences: {
      findById(id) { return queryValue(() => id === TARGET_LICENCE_ID ? state.licence : null); }
    },
    posPackages: {
      findById(id) { return queryValue(() => String(id) === PACKAGE_ID ? state.posPackage : null); }
    },
    posActivationCodes: {
      findById(id) { return queryValue(() => state.codes.find((code) => code._id === String(id)) || null); },
      find(filter) { return queryValue(() => state.codes.filter((code) => matches(code, filter))); },
      async findOneAndUpdate(filter, update, options) {
        assert.equal(options.session, session);
        const code = state.codes.find((record) => matches(record, filter));
        if (!code) return null;
        Object.assign(code, update.$set || {});
        code.__v = Number(code.__v || 0) + Number(update.$inc && update.$inc.__v || 0);
        return code;
      },
      async create(candidates, options) {
        assert.equal(options.session, session);
        const created = candidates.map((candidate) => ({
          ...candidate,
          _id: REPLACEMENT_ID,
          createdAt: new Date(NOW),
          updatedAt: new Date(NOW),
          __v: 0
        }));
        state.codes.push(...created);
        return created;
      }
    },
    auditLogs: {
      async create(entries, options) {
        assert.equal(options.session, session);
        if (state.failAuditAction && entries[0].action === state.failAuditAction) {
          throw new Error("audit failure");
        }
        state.audits.push(...entries);
        return entries;
      }
    }
  };
  const session = {
    async withTransaction(callback, transactionOptions) {
      state.transactions += 1;
      state.transactionOptions = transactionOptions;
      const snapshot = structuredClone({
        audits: state.audits,
        codes: state.codes,
        committed: state.committed
      });
      try {
        const result = await callback();
        state.committed = true;
        return result;
      } catch (error) {
        state.audits = snapshot.audits;
        state.codes = snapshot.codes;
        state.committed = snapshot.committed;
        throw error;
      }
    },
    async endSession() { state.ended = true; }
  };
  const connection = {
    async startSession() { return session; }
  };
  return { connection, repositories, session, state };
}

async function runFixture(fixture) {
  return replaceStagingActivationCode({
    connection: fixture.connection,
    repositories: fixture.repositories,
    clock: () => new Date(NOW),
    generateCode: () => REPLACEMENT_CODE
  });
}

test("exact staging Preview guards mount only the POST replacement endpoint", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(TARGET_LICENCE_ID, "3e50bcf4c418d82b7663e655");
  assert.equal(shouldMountStagingReplaceActivationCodeEndpoint(env), true);
  assert.equal(mountStagingReplaceActivationCodeEndpoint(router, { env }), true);
  assert.deepEqual(router.registrations, [{
    method: "POST",
    path: STAGING_REPLACE_ACTIVATION_CODE_PATH,
    handler: router.registrations[0].handler
  }]);
  assert.equal(STAGING_REPLACE_ACTIVATION_CODE_PATH, "/internal/pos-licensing-staging-replace-activation-code");
});

test("every guard, enable flag, and configured token are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_ENABLED: "false" },
    { POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_TOKEN: "" },
    { POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_TOKEN: "too-short" }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingReplaceActivationCodeEndpoint(env), false);
    assert.equal(mountStagingReplaceActivationCodeEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("disabled, main, and production reject before replacement access", async () => {
  let calls = 0;
  for (const env of [
    stagingEnvironment({ POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_ENABLED: "false" }),
    stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingEnvironment({ VERCEL_ENV: "production", AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" })
  ]) {
    const response = await invoke(env, `Bearer ${OPERATOR_TOKEN}`, {
      runReplacement: async () => { calls += 1; }
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { message: "Not found." });
  }
  assert.equal(calls, 0);
});

test("missing, wrong, and URL-only tokens reject before database access", async () => {
  let validationCalls = 0;
  const options = {
    validateMongoConfig() { validationCalls += 1; }
  };
  for (const response of [
    await invoke(stagingEnvironment(), undefined, options),
    await invoke(stagingEnvironment(), "Bearer wrong-token", options),
    await invoke(stagingEnvironment(), undefined, { ...options, query: { token: OPERATOR_TOKEN } })
  ]) {
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Unauthorized." });
  }
  assert.equal(validationCalls, 0);
});

test("request cannot override the fixed licence, old code, admin, or token", async () => {
  for (const body of [
    { licenceId: TARGET_LICENCE_ID },
    { activationCodeId: EXPECTED_OLD_ACTIVATION_CODE_ID },
    { adminId: FIXED_STAGING_ADMIN_ID },
    { token: OPERATOR_TOKEN }
  ]) {
    const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, { body });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { message: "Invalid request." });
  }
});

test("successful replacement revokes the exact old code and creates one digest-only replacement atomically", async () => {
  const fixture = createFixture();
  const result = await runFixture(fixture);
  assert.deepEqual(result, {
    replaced: true,
    revokedActivationCodeId: EXPECTED_OLD_ACTIVATION_CODE_ID,
    replacementActivationCode: REPLACEMENT_CODE,
    expiresAt: REPLACEMENT_EXPIRY,
    maxRedemptions: 1
  });
  assert.equal(fixture.state.transactions, 1);
  assert.equal(fixture.state.committed, true);
  assert.equal(fixture.state.ended, true);
  assert.deepEqual(fixture.state.transactionOptions, REQUIRED_POS_TRANSACTION_OPTIONS);
  assert.equal(fixture.state.codes.length, 2);
  assert.equal(fixture.state.codes[0]._id, EXPECTED_OLD_ACTIVATION_CODE_ID);
  assert.equal(fixture.state.codes[0].status, "revoked");
  assert.equal(fixture.state.codes[1]._id, REPLACEMENT_ID);
  assert.equal(fixture.state.codes[1].licenceId, TARGET_LICENCE_ID);
  assert.equal(fixture.state.codes[1].maxRedemptions, 1);
  assert.equal(fixture.state.codes[1].redeemedCount, 0);
  assert.equal(fixture.state.codes[1].codeHash, digestActivationCode(REPLACEMENT_CODE));
  assert.equal(JSON.stringify(fixture.state).includes(REPLACEMENT_CODE), false);
  assert.deepEqual(fixture.state.audits.map((audit) => audit.action), [
    "licences.activation-code.revoke-unused",
    "licences.activation-code.issue"
  ]);
  assert.equal(JSON.stringify(fixture.state.audits).includes(REPLACEMENT_CODE), false);
});

test("audit failure rolls back revocation, replacement, and both audits without returning plaintext", async () => {
  const fixture = createFixture({ failAuditAction: "licences.activation-code.issue" });
  await assert.rejects(() => runFixture(fixture), /audit failure/);
  assert.equal(fixture.state.committed, false);
  assert.equal(fixture.state.codes.length, 1);
  assert.equal(fixture.state.codes[0].status, "active");
  assert.equal(fixture.state.audits.length, 0);
  assert.equal(JSON.stringify(fixture.state).includes(REPLACEMENT_CODE), false);
});

test("retry after success fails closed without issuing another replacement", async () => {
  const fixture = createFixture();
  await runFixture(fixture);
  await assert.rejects(
    () => runFixture(fixture),
    (error) => error.code === "replacement_already_completed"
  );
  assert.equal(fixture.state.codes.length, 2);
  assert.equal(fixture.state.audits.length, 2);
  assert.equal(fixture.state.codes.filter((code) => code._id === REPLACEMENT_ID).length, 1);
});

test("a revoked record is classified as completed only when its fixed licence binding remains valid", async () => {
  const fixture = createFixture({
    codes: [{
      ...initialState().codes[0],
      licenceId: CLIENT_ID,
      status: "revoked"
    }]
  });
  await assert.rejects(
    () => runFixture(fixture),
    (error) => error.code === "old_activation_code_invalid"
  );
  assert.equal(fixture.state.codes.length, 1);
  assert.equal(fixture.state.audits.length, 0);
});

test("admin, licence, package, and exact old-code validation fail before writes", async () => {
  const fixtures = [
    createFixture({ admin: { ...initialState().admin, status: "inactive" } }),
    createFixture({ licence: { ...initialState().licence, status: "suspended" } }),
    createFixture({ posPackage: { ...initialState().posPackage, status: "draft" } }),
    createFixture({ codes: [{ ...initialState().codes[0], licenceId: CLIENT_ID }] }),
    createFixture({ codes: [{ ...initialState().codes[0], redeemedCount: 1 }] })
  ];
  for (const fixture of fixtures) {
    await assert.rejects(() => runFixture(fixture));
    assert.equal(fixture.state.codes.length, 1);
    assert.notEqual(fixture.state.codes[0].status, "revoked");
    assert.equal(fixture.state.audits.length, 0);
  }
});

test("response is emitted once after replacement completes and contains only the allowlist", async () => {
  let finishReplacement;
  const gate = new Promise((resolve) => { finishReplacement = resolve; });
  const response = responseRecorder();
  const handler = createStagingReplaceActivationCodeHandler({
    env: stagingEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateMongoConfig: () => ({ environment: "staging", databaseName: "automatex_pos_staging" }),
    clock: () => new Date(NOW),
    runReplacement: async () => { await gate; return successResult(); }
  });
  const pending = handler(request(`Bearer ${OPERATOR_TOKEN}`), response);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(response.jsonCalls, 0);
  finishReplacement();
  await pending;
  assert.equal(response.statusCode, 201);
  assert.equal(response.jsonCalls, 1);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(Object.keys(response.body), SUCCESS_FIELDS);
  assert.deepEqual(response.body, {
    replaced: true,
    revokedActivationCodeId: EXPECTED_OLD_ACTIVATION_CODE_ID,
    replacementActivationCode: REPLACEMENT_CODE,
    expiresAt: REPLACEMENT_EXPIRY,
    maxRedemptions: 1
  });
  assert.equal(isActivationCodeFormat(response.body.replacementActivationCode), true);
  const serialized = JSON.stringify(response.body);
  for (const forbidden of [OPERATOR_TOKEN, "codeHash", "password", "jwt", "mongodb+srv://", "privateKey", "@automatex.invalid"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});

test("completed retry and all other failures use sanitized fixed responses", async () => {
  const completed = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    runReplacement: async () => {
      const error = new Error("private completion detail");
      error.code = "replacement_already_completed";
      throw error;
    }
  });
  const unavailable = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    connection: { name: "automatex_pos_production" },
    runReplacement: async () => { throw new Error(`secret=${OPERATOR_TOKEN}`); }
  });
  assert.equal(completed.statusCode, 409);
  assert.deepEqual(completed.body, { code: "replacement_already_completed" });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.body, { code: "replacement_unavailable" });
  assert.equal(JSON.stringify([completed.body, unavailable.body]).includes(OPERATOR_TOKEN), false);
  assert.equal(JSON.stringify(completed.body).includes(REPLACEMENT_CODE), false);
});

test("replacement token is rejected from secret fields and runtime logs", () => {
  const sanitized = sanitizeSensitiveText(`token=${OPERATOR_TOKEN}`, {
    env: { POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_TOKEN: OPERATOR_TOKEN }
  });
  assert.equal(sanitized.includes(OPERATOR_TOKEN), false);
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_TOKEN: OPERATOR_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
});
