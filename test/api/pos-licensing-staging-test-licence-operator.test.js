const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-test-licence-operator-test-only";

const {
  applyStagingLicencePlan,
  executeStagingTestLicenceOperatorCommand,
  parseCliArguments,
  runStagingTestLicenceOperator,
  stagingLicenceDocumentId,
  stagingValidationEnvironment,
  validateExecutionContext,
  validatePrerequisites
} = require("../../scripts/createPosLicensingStagingTestLicence");
const {
  validateStagingLicensingConfig
} = require("../../server/config/posLicensingProduction");
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

function vercelStagingConfigEnv(overrides = {}) {
  return {
    ...stagingEnv(),
    VERCEL: "1",
    NODE_ENV: "production",
    POS_LICENSING_ENVIRONMENT: "staging",
    POS_LICENSING_CLIENT_SCOPE: "staging-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "staging",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: "mongodb+srv://staging_user:staging_password@staging.example/automatex_pos_staging",
    POS_LICENSING_DATABASE_NAME: "automatex_pos_staging",
    POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing-staging.example.com",
    POS_LICENSING_PRODUCTION_HOSTNAME: "licensing.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "vercel",
    ALLOWED_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
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

test("Vercel runtime identity survives the safe staging configuration projection", () => {
  const projected = stagingValidationEnvironment(vercelStagingConfigEnv({
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: "excluded-private-material",
    POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN: "excluded-operator-token"
  }));
  assert.equal(projected.VERCEL, "1");
  assert.equal("POS_LICENSING_SIGNING_PRIVATE_JWK_B64" in projected, false);
  assert.equal("POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN" in projected, false);
  const config = validateStagingLicensingConfig(projected);
  assert.equal(config.environment, "staging");
  assert.equal(config.transport.proxy.mode, "vercel");
  assert.equal(config.transport.proxy.verifiedVercelRuntime, true);
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
  const now = new Date("2030-01-01T00:00:00.000Z");
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
      async findOneAndUpdate(_query, update, options) {
        assert.equal(options.session, session);
        assert.equal(update.$set.renewalWindowDurationMinutes, 60);
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
      assert.equal(options.internalDocumentId, stagingLicenceDocumentId(MARKER));
      assert.equal(input.maxInstallations, 1);
      assert.deepEqual(input.entitledModules, POS_STANDARD_MODULE_IDS);
      assert.equal(input.edition, "standard");
      assert.equal(input.licenceExpiry.getTime() - now.getTime(), 24 * 60 * 60 * 1000);
      assert.equal(input.supportExpiry.getTime() - now.getTime(), 24 * 60 * 60 * 1000);
      assert.equal(input.offlineValidUntil.getTime() - now.getTime(), 6 * 60 * 60 * 1000);
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
      return { licence: { id: "licence1", status: "active" } };
    }
  });
  const createActivationService = ({ runInTransaction }) => ({
    async issueActivationCode(_actor, _licenceId, input) {
      await runInTransaction(async (nestedSession) => {
        assert.equal(nestedSession, session);
      });
      assert.equal(input.maxRedemptions, 1);
      assert.equal(input.expiresAt.getTime() - now.getTime(), 60 * 60 * 1000);
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
    clock: () => now
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
  assert.equal(result.licenceStatus, "active");
  assert.equal(result.maxInstallations, 1);
  assert.deepEqual(events, [
    "transaction-started",
    "draft-created",
    "renewal-policy-written",
    "renewal-audited",
    "licence-approved",
    "activation-issued",
    "callback-complete",
    "committed",
    "session-ended"
  ]);
});

test("apply transaction revalidates prerequisites before its first write", async () => {
  const session = {
    async withTransaction(callback) { await callback(); },
    async endSession() {}
  };
  let writeServiceCalls = 0;
  const initialRecords = prerequisites();
  await assert.rejects(
    applyStagingLicencePlan({
      connection: { async startSession() { return session; } },
      input: { apply: true, adminId: ADMIN_ID, testMarker: MARKER },
      repositories: {},
      initialPrerequisites: validatePrerequisites(initialRecords, transactionCapability()),
      readPrerequisites: async () => prerequisites({ clients: [] }),
      createAdminService: () => {
        writeServiceCalls += 1;
        return {};
      }
    }),
    (error) => error.code === "fixture_client_missing_or_ambiguous"
  );
  assert.equal(writeServiceCalls, 0);
});

test("duplicate marker is rejected before writes and deterministic-ID races fail closed", async () => {
  let applyCalls = 0;
  await assert.rejects(
    runStagingTestLicenceOperator(runnerOptions({
      argv: ["--admin-id", ADMIN_ID, "--test-marker", MARKER, "--apply"],
      readPrerequisites: async () => prerequisites({ markerMatches: [{ _id: objectId("existing") }] }),
      applyPlan: async () => { applyCalls += 1; }
    })),
    (error) => error.code === "test_marker_already_exists"
  );
  assert.equal(applyCalls, 0);

  const duplicate = new Error("duplicate deterministic staging licence identity");
  duplicate.code = "internal_document_id_conflict";
  const session = {
    async withTransaction() { throw duplicate; },
    async endSession() {}
  };
  await assert.rejects(
    applyStagingLicencePlan({
      connection: { async startSession() { return session; } },
      input: { apply: true, adminId: ADMIN_ID, testMarker: MARKER },
      repositories: {},
      initialPrerequisites: validatePrerequisites(prerequisites(), transactionCapability())
    }),
    (error) => error.code === "test_marker_already_exists"
  );
});

test("transaction rollback returns no activation plaintext or partial result", async () => {
  const events = [];
  const session = {
    async withTransaction(callback) {
      events.push("transaction-started");
      await callback();
      events.push("rollback");
      throw new Error("simulated commit failure");
    },
    async endSession() { events.push("session-ended"); }
  };
  const records = prerequisites();
  const initial = validatePrerequisites(records, transactionCapability());
  const repositories = {
    posLicences: {
      async findOneAndUpdate() { return { __v: 1 }; }
    }
  };
  const auditLogger = { async create() { return {}; } };
  const createAdminService = () => ({
    async createDraftLicence() {
      events.push("licence-staged");
      return { licence: { id: "licence1", version: 0 }, audit: { ok: true } };
    }
  });
  const createLifecycleService = () => ({
    async approveDraftLicence() {
      events.push("approval-staged");
      return { licence: { id: "licence1", status: "active" } };
    }
  });
  const createActivationService = () => ({
    async issueActivationCode() {
      events.push("activation-staged");
      return {
        activationCode: "plaintext-must-be-discarded",
        activationCodeMetadata: { id: "activation1" }
      };
    }
  });

  await assert.rejects(
    applyStagingLicencePlan({
      connection: { async startSession() { return session; } },
      input: { apply: true, adminId: ADMIN_ID, testMarker: MARKER },
      repositories,
      initialPrerequisites: initial,
      readPrerequisites: async () => records,
      auditLogger,
      createAdminService,
      createLifecycleService,
      createActivationService,
      clock: () => new Date("2030-01-01T00:00:00.000Z")
    }),
    /simulated commit failure/
  );
  assert.deepEqual(events, [
    "transaction-started",
    "licence-staged",
    "approval-staged",
    "activation-staged",
    "rollback",
    "session-ended"
  ]);
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
