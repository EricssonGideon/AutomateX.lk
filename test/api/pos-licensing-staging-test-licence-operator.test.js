const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-test-licence-operator-test-only";

const {
  applyStagingLicencePlan,
  executeStagingTestLicenceOperatorCommand,
  parseCliArguments,
  runStagingTestLicenceOperator,
  validateExecutionContext,
  validatePrerequisites
} = require("../../scripts/createPosLicensingStagingTestLicence");
const {
  FIXTURE_CLIENT_EMAIL,
  FIXTURE_CLIENT_NAME,
  FIXTURE_MARKER,
  FIXTURE_PACKAGE_CODE,
  FIXTURE_PACKAGE_NAME,
  FIXTURE_PROJECT_TITLE
} = require("../../server/services/stagingPosActivationEligibilityService");
const { POS_STANDARD_MODULE_IDS } = require("../../server/utils/posLicenceContract");

const ADMIN_ID = "64b64c88c4a2f7781a123456";
const MARKER = "automatex-pos-staging-test-tauri-e2e-001";

function objectId(value) {
  return { toString: () => value };
}

function stagingEnv(overrides = {}) {
  return {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    ...overrides
  };
}

function prerequisites(overrides = {}) {
  const clientId = objectId("client1");
  return {
    admins: [{
      _id: objectId(ADMIN_ID),
      name: "Staging Admin",
      email: "admin@staging.invalid",
      role: "admin",
      status: "active",
      isActive: true
    }],
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
      _id: objectId("project1"),
      clientId,
      projectTitle: FIXTURE_PROJECT_TITLE,
      projectType: "POS System",
      status: "Testing",
      isArchived: false,
      adminNotes: FIXTURE_MARKER
    }],
    packages: [{
      _id: objectId("package1"),
      packageCode: FIXTURE_PACKAGE_CODE,
      name: FIXTURE_PACKAGE_NAME,
      edition: "standard",
      status: "active",
      moduleIds: [...POS_STANDARD_MODULE_IDS],
      updateChannels: ["stable"],
      notes: FIXTURE_MARKER
    }],
    markerMatches: [],
    ...overrides
  };
}

function transactionCapability(overrides = {}) {
  return {
    supported: true,
    verified: true,
    probePassed: true,
    ...overrides
  };
}

function runnerOptions(overrides = {}) {
  return {
    env: stagingEnv(),
    argv: ["--admin-id", ADMIN_ID, "--test-marker", MARKER],
    connection: {
      name: "automatex_pos_staging",
      db: { databaseName: "automatex_pos_staging" }
    },
    loadEnvironment() {},
    validateConfig() {
      return {
        environment: "staging",
        mode: "staging",
        clientScope: "staging-only",
        databaseName: "automatex_pos_staging"
      };
    },
    readPrerequisites: async () => prerequisites(),
    inspectTransactions: async () => transactionCapability(),
    ...overrides
  };
}

test("requires exact staging preview branch guards", () => {
  assert.doesNotThrow(() => validateExecutionContext(stagingEnv()));
  for (const overrides of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" }
  ]) {
    assert.throws(
      () => validateExecutionContext(stagingEnv(overrides)),
      (error) => error.code === "staging_execution_context_rejected"
    );
  }
});

test("requires explicit admin ID and uniquely prefixed staging marker", () => {
  assert.deepEqual(parseCliArguments([
    "--admin-id", ADMIN_ID,
    "--test-marker", MARKER
  ]), {
    apply: false,
    adminId: ADMIN_ID,
    testMarker: MARKER
  });
  assert.throws(
    () => parseCliArguments(["--test-marker", MARKER]),
    (error) => error.code === "invalid_admin_id"
  );
  assert.throws(
    () => parseCliArguments(["--admin-id", ADMIN_ID, "--test-marker", "production-test"]),
    (error) => error.code === "invalid_test_marker"
  );
});

test("dry-run performs zero writes and never returns activation plaintext", async () => {
  let applyCalls = 0;
  const output = await runStagingTestLicenceOperator(runnerOptions({
    applyPlan: async () => {
      applyCalls += 1;
    }
  }));

  assert.equal(output.ok, true);
  assert.equal(output.mode, "dry-run");
  assert.equal(output.writesPerformed, false);
  assert.equal(applyCalls, 0);
  assert.equal("activationCode" in output, false);
  assert.equal(JSON.stringify(output).includes("codeHash"), false);
});

test("persisted staging admin must be active and authorized", () => {
  assert.throws(
    () => validatePrerequisites(prerequisites({
      admins: [{ _id: objectId(ADMIN_ID), role: "admin", status: "suspended", isActive: false }]
    }), transactionCapability()),
    (error) => error.code === "staging_admin_inactive"
  );
  assert.throws(
    () => validatePrerequisites(prerequisites({
      admins: [{ _id: objectId(ADMIN_ID), role: "manager", status: "active", isActive: true }]
    }), transactionCapability()),
    (error) => error.code === "staging_admin_unauthorized"
  );
});

test("reusable package must be active Standard with every Standard module", () => {
  const records = prerequisites();
  records.packages[0].moduleIds = POS_STANDARD_MODULE_IDS.slice(0, -1);
  assert.throws(
    () => validatePrerequisites(records, transactionCapability()),
    (error) => error.code === "fixture_package_standard_contract_invalid"
  );

  const inactive = prerequisites();
  inactive.packages[0].status = "archived";
  assert.throws(
    () => validatePrerequisites(inactive, transactionCapability()),
    (error) => error.code === "fixture_package_identity_mismatch"
  );
});

test("transaction capability is mandatory before either mode can proceed", async () => {
  await assert.rejects(
    runStagingTestLicenceOperator(runnerOptions({
      inspectTransactions: async () => transactionCapability({ supported: false, probePassed: false })
    })),
    (error) => error.code === "mongodb_transaction_requirement_failed"
  );
});

test("writes require --apply", async () => {
  await assert.rejects(
    applyStagingLicencePlan({
      connection: {},
      input: { apply: false }
    }),
    (error) => error.code === "apply_required_for_writes"
  );
});

test("apply plan returns plaintext only after the outer transaction commits", async () => {
  const events = [];
  let releaseCommit;
  const commitGate = new Promise((resolve) => {
    releaseCommit = resolve;
  });
  const session = {
    async withTransaction(callback) {
      events.push("transaction-started");
      await callback();
      events.push("callback-complete");
      await commitGate;
      events.push("committed");
    },
    async endSession() {
      events.push("session-ended");
    }
  };
  const records = prerequisites();
  const initial = validatePrerequisites(records, transactionCapability());
  const repositories = {
    posLicences: {
      async findOneAndUpdate() {
        events.push("renewal-policy-written");
        return { __v: 1 };
      }
    }
  };
  const auditLogger = {
    async create() {
      events.push("renewal-audited");
      return {};
    }
  };
  const createAdminService = () => ({
    async createDraftLicence(_actor, input, options) {
      assert.equal(options.session, session);
      assert.equal(input.maxInstallations, 1);
      assert.deepEqual(input.entitledModules, POS_STANDARD_MODULE_IDS);
      events.push("draft-created");
      return { licence: { id: "licence1", version: 0 }, audit: { ok: true } };
    }
  });
  const createLifecycleService = ({ runInTransaction }) => ({
    async approveDraftLicence() {
      await runInTransaction(async (nestedSession) => {
        assert.equal(nestedSession, session);
      });
      events.push("licence-approved");
      return { licence: { id: "licence1" } };
    }
  });
  const createActivationService = ({ runInTransaction }) => ({
    async issueActivationCode(_actor, _licenceId, input) {
      await runInTransaction(async (nestedSession) => {
        assert.equal(nestedSession, session);
      });
      assert.equal(input.maxRedemptions, 1);
      events.push("activation-issued");
      return {
        activationCode: "plaintext-only-after-commit",
        activationCodeMetadata: { id: "activation1" }
      };
    }
  });

  let resolved = false;
  const resultPromise = applyStagingLicencePlan({
    connection: { startSession: async () => session },
    input: { apply: true, adminId: ADMIN_ID, testMarker: MARKER },
    repositories,
    initialPrerequisites: initial,
    readPrerequisites: async () => records,
    auditLogger,
    createAdminService,
    createLifecycleService,
    createActivationService,
    clock: () => new Date("2030-01-01T00:00:00.000Z")
  }).then((result) => {
    resolved = true;
    return result;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  assert.equal(events.includes("callback-complete"), true);
  releaseCommit();
  const result = await resultPromise;
  assert.equal(result.activationCode, "plaintext-only-after-commit");
  assert.ok(events.indexOf("committed") < events.indexOf("session-ended"));
});

test("failed commit never writes activation plaintext to command output", async () => {
  let stdout = "";
  let stderr = "";
  const result = await executeStagingTestLicenceOperatorCommand(runnerOptions({
    argv: ["--admin-id", ADMIN_ID, "--test-marker", MARKER, "--apply"],
    applyPlan: async () => {
      throw new Error("transaction commit failed after generating hidden plaintext");
    },
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } }
  }));

  assert.equal(result.exitCode, 1);
  assert.equal(stdout, "");
  assert.equal(stderr.includes("hidden plaintext"), false);
  assert.equal(stderr.includes("staging_test_licence_operator_failed_closed"), true);
});

test("main branch and production environments are rejected before database reads", async () => {
  let reads = 0;
  for (const env of [
    stagingEnv({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingEnv({ VERCEL_ENV: "production", AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" })
  ]) {
    await assert.rejects(
      runStagingTestLicenceOperator(runnerOptions({
        env,
        readPrerequisites: async () => {
          reads += 1;
          return prerequisites();
        }
      })),
      (error) => error.code === "staging_execution_context_rejected"
    );
  }
  assert.equal(reads, 0);
});
