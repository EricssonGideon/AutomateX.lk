const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-test-licence-dry-run-test-only";

const {
  FIXED_STAGING_ADMIN_ID,
  FIXED_TEST_MARKER,
  RESPONSE_FIELDS,
  STAGING_TEST_LICENCE_DRY_RUN_PATH,
  createStagingTestLicenceDryRunHandler,
  mountStagingTestLicenceDryRunEndpoint,
  shouldMountStagingTestLicenceDryRunEndpoint
} = require("../../server/routes/internalStagingTestLicenceDryRun");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const {
  FIXTURE_CLIENT_EMAIL,
  FIXTURE_CLIENT_NAME,
  FIXTURE_MARKER,
  FIXTURE_PACKAGE_CODE,
  FIXTURE_PACKAGE_NAME,
  FIXTURE_PROJECT_TITLE
} = require("../../server/services/stagingPosActivationEligibilityService");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");
const { POS_STANDARD_MODULE_IDS } = require("../../server/utils/posLicenceContract");
const {
  runStagingTestLicenceOperator
} = require("../../scripts/createPosLicensingStagingTestLicence");

const OPERATOR_TOKEN = "staging-test-licence-dry-run-operator-" + "t".repeat(40);

function stagingEnvironment(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_ENABLED: "true",
    POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN: OPERATOR_TOKEN,
    ...overrides
  };
}

function validBody(overrides = {}) {
  return {
    adminId: FIXED_STAGING_ADMIN_ID,
    testMarker: FIXED_TEST_MARKER,
    ...overrides
  };
}

function request(authorization, body = validBody(), query = {}) {
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
    headers: {},
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function routerRecorder() {
  return {
    registrations: [],
    post(path, handler) { this.registrations.push({ method: "POST", path, handler }); }
  };
}

function successfulOperatorResult() {
  return {
    ok: true,
    mode: "dry-run",
    writesPerformed: false,
    marker: FIXED_TEST_MARKER,
    checks: {
      exactStagingEnvironment: true,
      stagingDatabaseIdentity: true,
      persistedAdminAuthorized: true,
      controlledClientPresent: true,
      controlledProjectPresent: true,
      reusableStandardPackagePresent: true,
      allStandardModulesPresent: true,
      transactionCapability: true,
      uniqueMarkerAvailable: true
    }
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const handler = createStagingTestLicenceDryRunHandler({
    env,
    connection: options.connection || {
      name: "automatex_pos_staging",
      db: { databaseName: "automatex_pos_staging" }
    },
    runOperator: options.runOperator || (async () => successfulOperatorResult()),
    operatorOptions: options.operatorOptions,
    connectionProvider: options.connectionProvider
  });
  await handler(
    request(authorization, options.body, options.query),
    response
  );
  return response;
}

test("exact staging Preview guards mount only the POST dry-run endpoint", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingTestLicenceDryRunEndpoint(env), true);
  assert.equal(mountStagingTestLicenceDryRunEndpoint(router, { env }), true);
  assert.deepEqual(router.registrations.map(({ method, path }) => ({ method, path })), [{
    method: "POST",
    path: STAGING_TEST_LICENCE_DRY_RUN_PATH
  }]);
  assert.equal(STAGING_TEST_LICENCE_DRY_RUN_PATH, "/internal/pos-licensing-staging-test-licence-dry-run");
});

test("every staging guard, explicit enable flag, and configured token are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_ENABLED: "false" },
    { POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN: "" },
    { POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN: "too-short" }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingTestLicenceDryRunEndpoint(env), false);
    assert.equal(mountStagingTestLicenceDryRunEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("disabled, main, and production requests fail before operator access", async () => {
  let operatorCalls = 0;
  for (const env of [
    stagingEnvironment({ POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_ENABLED: "false" }),
    stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingEnvironment({ VERCEL_ENV: "production", AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" })
  ]) {
    const response = await invoke(env, `Bearer ${OPERATOR_TOKEN}`, {
      runOperator: async () => { operatorCalls += 1; }
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { message: "Not found." });
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(operatorCalls, 0);
});

test("missing, wrong, and URL-only tokens are rejected before operator access", async () => {
  let operatorCalls = 0;
  const runOperator = async () => { operatorCalls += 1; };
  const responses = [
    await invoke(stagingEnvironment(), undefined, { runOperator }),
    await invoke(stagingEnvironment(), "Bearer wrong-token", { runOperator }),
    await invoke(stagingEnvironment(), undefined, { runOperator, query: { token: OPERATOR_TOKEN } })
  ];
  responses.forEach((response) => {
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Unauthorized." });
  });
  assert.equal(operatorCalls, 0);
});

test("invalid admin IDs and markers are rejected", async () => {
  for (const body of [
    validBody({ adminId: "not-an-object-id" }),
    validBody({ adminId: "64b64c88c4a2f7781a123456" }),
    validBody({ testMarker: "automatex-pos-staging-tauri-e2e-20260922" }),
    validBody({ testMarker: "../automatex-pos-staging-tauri-e2e-20260921" })
  ]) {
    const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, { body });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { message: "Invalid request." });
  }
});

test("missing and extra request fields are rejected", async () => {
  for (const body of [
    { adminId: FIXED_STAGING_ADMIN_ID },
    { ...validBody(), apply: true },
    { ...validBody(), token: OPERATOR_TOKEN }
  ]) {
    const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, { body });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { message: "Invalid request." });
  }
});

test("route invokes the existing operator with immutable dry-run input only", async () => {
  let calls = 0;
  const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    runOperator: async (options) => {
      calls += 1;
      assert.deepEqual(options.input, {
        apply: false,
        adminId: FIXED_STAGING_ADMIN_ID,
        testMarker: FIXED_TEST_MARKER
      });
      assert.equal(Object.isFrozen(options.input), true);
      assert.equal(typeof options.inspectTransactions, "function");
      assert.equal(typeof options.applyPlan, "function");
      return successfulOperatorResult();
    }
  });
  assert.equal(calls, 1);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("success response is the exact sanitized allowlist", async () => {
  const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`);
  const serialized = JSON.stringify(response.body).toLowerCase();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.body), RESPONSE_FIELDS);
  assert.deepEqual(response.body, {
    dryRun: true,
    adminValid: true,
    clientValid: true,
    projectValid: true,
    packageValid: true,
    transactionCapability: true,
    markerUnique: true,
    safeToApply: true,
    blocker: ""
  });
  for (const sensitive of [OPERATOR_TOKEN, "mongo", "secret", "jwt", "hash", "activationcode", "activationCode"]) {
    assert.equal(serialized.includes(sensitive.toLowerCase()), false);
  }
});

test("actual operator dry-run performs zero writes and aborts its capability transaction", async () => {
  const events = [];
  const session = {
    startTransaction(transactionOptions) { events.push(["startTransaction", transactionOptions]); },
    async abortTransaction() { events.push(["abortTransaction"]); },
    async endSession() { events.push(["endSession"]); }
  };
  const clientId = { toString: () => "client-id" };
  const connection = {
    name: "automatex_pos_staging",
    db: {
      databaseName: "automatex_pos_staging",
      admin() { return { async command() { return { logicalSessionTimeoutMinutes: 30, setName: "rs0" }; } }; },
      collection() {
        return { async findOne() { events.push(["findOne"]); return null; } };
      }
    },
    async startSession() { events.push(["startSession"]); return session; }
  };
  let writeCalls = 0;
  const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    connection,
    runOperator: runStagingTestLicenceOperator,
    operatorOptions: {
      loadEnvironment() {},
      validateConfig() {
        return {
          environment: "staging",
          mode: "staging",
          clientScope: "staging-only",
          databaseName: "automatex_pos_staging"
        };
      },
      readPrerequisites: async () => ({
        admins: [{ _id: FIXED_STAGING_ADMIN_ID, role: "admin", status: "active", isActive: true }],
        clients: [{
          _id: clientId,
          name: FIXTURE_CLIENT_NAME,
          email: FIXTURE_CLIENT_EMAIL,
          role: "client",
          status: "active",
          isActive: true,
          businessName: FIXTURE_MARKER
        }],
        projects: [{
          _id: "project-id",
          clientId,
          projectTitle: FIXTURE_PROJECT_TITLE,
          projectType: "POS System",
          status: "Testing",
          isArchived: false,
          adminNotes: FIXTURE_MARKER
        }],
        packages: [{
          _id: "package-id",
          packageCode: FIXTURE_PACKAGE_CODE,
          name: FIXTURE_PACKAGE_NAME,
          edition: "standard",
          status: "active",
          moduleIds: [...POS_STANDARD_MODULE_IDS],
          updateChannels: ["stable"],
          notes: FIXTURE_MARKER
        }],
        markerMatches: []
      }),
      applyPlan: async () => { writeCalls += 1; }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.safeToApply, true);
  assert.equal(writeCalls, 0);
  assert.deepEqual(events.map(([event]) => event), [
    "startSession",
    "startTransaction",
    "findOne",
    "abortTransaction",
    "endSession"
  ]);
  assert.equal(events.some(([event]) => event === "commitTransaction" || event === "withTransaction"), false);
});

test("operator failures return fixed sanitized fields only", async () => {
  const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    runOperator: async () => {
      const error = new Error("sensitive internal detail");
      error.code = "staging_admin_unauthorized";
      throw error;
    }
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(Object.keys(response.body), RESPONSE_FIELDS);
  assert.equal(response.body.adminValid, false);
  assert.equal(response.body.safeToApply, false);
  assert.equal(response.body.blocker, "admin_invalid");
  assert.equal(JSON.stringify(response.body).includes("sensitive internal detail"), false);
});

test("known failures map to fixed sanitized blocker codes", async () => {
  const cases = [
    ["staging_admin_missing_or_ambiguous", "admin_missing"],
    ["fixture_client_missing_or_ambiguous", "client_missing"],
    ["fixture_project_missing_or_ambiguous", "project_missing"],
    ["fixture_package_missing_or_ambiguous", "package_missing"],
    ["mongodb_transaction_requirement_failed", "transaction_unavailable"],
    ["test_marker_already_exists", "marker_conflict"],
    ["proxy_trust_vercel_runtime_invalid", "environment_mismatch"],
    ["staging_database_identity_mismatch", "environment_mismatch"]
  ];

  for (const [code, blocker] of cases) {
    const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
      runOperator: async () => {
        const error = new Error("must not be returned");
        error.code = code;
        throw error;
      }
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(Object.keys(response.body), RESPONSE_FIELDS);
    assert.equal(response.body.blocker, blocker);
    assert.equal(JSON.stringify(response.body).includes(code), false);
    assert.equal(JSON.stringify(response.body).includes("must not be returned"), false);
  }

  const unknown = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    runOperator: async () => {
      const error = new Error("unknown internal failure");
      error.code = "unrecognized_internal_code";
      throw error;
    }
  });
  assert.equal(unknown.statusCode, 503);
  assert.equal(unknown.body.blocker, "dry_run_unavailable");
  assert.equal(JSON.stringify(unknown.body).includes("unrecognized_internal_code"), false);
});

test("operator token is rejected from request fields and redacted from runtime logs", () => {
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN: OPERATOR_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
  const sanitized = sanitizeSensitiveText(`dry-run=${OPERATOR_TOKEN}`, {
    env: { POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN: OPERATOR_TOKEN }
  });
  assert.equal(sanitized.includes(OPERATOR_TOKEN), false);
});
