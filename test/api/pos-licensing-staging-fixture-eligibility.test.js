const assert = require("node:assert/strict");
const test = require("node:test");

const {
  APPROVED_LOCAL_ARGUMENT,
  FIXTURE_CLIENT_EMAIL,
  FIXTURE_CLIENT_NAME,
  FIXTURE_MARKER,
  FIXTURE_PACKAGE_CODE,
  FIXTURE_PACKAGE_NAME,
  FIXTURE_PROJECT_TITLE,
  evaluateFixtureEligibility,
  runStagingFixtureEligibilityCheck,
  stagingValidationEnvironment,
  validateExecutionContext
} = require("../../scripts/checkPosLicensingStagingFixtureEligibility");
const {
  POS_STANDARD_MODULE_IDS
} = require("../../server/utils/posLicenceContract");

function objectId(value) {
  return { toString: () => value };
}

function authenticatedMongoUri(environment, databaseName) {
  return "mongodb+srv://" + `${environment}_user:` +
    `${environment}_password` + `@${environment}.example/${databaseName}`;
}

function eligibleRecords(overrides = {}) {
  const clientId = objectId("client1");
  const projectId = objectId("project1");
  const packageId = objectId("package1");
  const licenceId = objectId("licence1");
  return {
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
      _id: projectId,
      clientId,
      projectTitle: FIXTURE_PROJECT_TITLE,
      projectType: "POS System",
      status: "Testing",
      adminNotes: FIXTURE_MARKER
    }],
    packages: [{
      _id: packageId,
      packageCode: FIXTURE_PACKAGE_CODE,
      name: FIXTURE_PACKAGE_NAME,
      edition: "standard",
      status: "active",
      moduleIds: [...POS_STANDARD_MODULE_IDS],
      updateChannels: ["stable"],
      notes: FIXTURE_MARKER
    }],
    licences: [{
      _id: licenceId,
      clientId,
      projectId,
      packageId,
      edition: "standard",
      status: "active",
      entitledModules: [...POS_STANDARD_MODULE_IDS],
      updateChannel: "stable",
      licenceExpiry: new Date("2030-01-02T00:00:00.000Z"),
      maxInstallations: 2,
      activationCount: 1,
      notes: FIXTURE_MARKER
    }],
    installations: [{ _id: objectId("installation1"), licenceId, status: "active" }],
    admins: [{ _id: objectId("admin1"), role: "admin", status: "active", isActive: true }],
    ...overrides
  };
}

function stagingEnv(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENVIRONMENT: "staging",
    POS_LICENSING_CLIENT_SCOPE: "staging-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "staging",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: authenticatedMongoUri("staging", "automatex_pos_staging"),
    POS_LICENSING_DATABASE_NAME: "automatex_pos_staging",
    POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing-staging.example.com",
    POS_LICENSING_PRODUCTION_HOSTNAME: "licensing.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "direct",
    ALLOWED_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    ...overrides
  };
}

test("eligible controlled fixture permits one additional fresh installation", () => {
  const result = evaluateFixtureEligibility(eligibleRecords(), new Date("2030-01-01T00:00:00.000Z"));
  assert.deepEqual(result, {
    fixtureLicenceId: "licence1",
    packageStatus: "active",
    licenceStatus: "active",
    licenceExpiry: "2030-01-02T00:00:00.000Z",
    maxInstallations: 2,
    activationCount: 1,
    activeInstallationCount: 1,
    freshInstallationAllowed: true,
    activationCodeIssuanceEligible: true,
    validStagingAdminAvailable: true,
    safeToProceedWithOneNewActivationCode: true,
    blockers: []
  });
});

test("installation limit blocks a fresh activation without changing history", () => {
  const records = eligibleRecords();
  records.licences[0].maxInstallations = 1;
  const result = evaluateFixtureEligibility(records, new Date("2030-01-01T00:00:00.000Z"));
  assert.equal(result.activationCount, 1);
  assert.equal(result.activeInstallationCount, 1);
  assert.equal(result.freshInstallationAllowed, false);
  assert.equal(result.safeToProceedWithOneNewActivationCode, false);
  assert.deepEqual(result.blockers, ["fixture_installation_limit_reached"]);
});

test("expired or inactive records and a missing admin fail closed", () => {
  const records = eligibleRecords({ admins: [] });
  records.packages[0].status = "retired";
  records.licences[0].status = "expired";
  records.licences[0].licenceExpiry = new Date("2029-12-31T00:00:00.000Z");
  const result = evaluateFixtureEligibility(records, new Date("2030-01-01T00:00:00.000Z"));
  assert.equal(result.safeToProceedWithOneNewActivationCode, false);
  assert.deepEqual(result.blockers, [
    "fixture_package_not_active",
    "fixture_licence_not_active",
    "fixture_licence_expired",
    "fixture_licence_not_issuance_eligible",
    "staging_admin_unavailable"
  ]);
});

test("execution context accepts only the exact preview branch or explicit local read-only approval", () => {
  assert.doesNotThrow(() => validateExecutionContext({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging"
  }, []));
  assert.doesNotThrow(() => validateExecutionContext({}, [APPROVED_LOCAL_ARGUMENT]));
  assert.doesNotThrow(() => validateExecutionContext({ VERCEL_ENV: "preview" }, [APPROVED_LOCAL_ARGUMENT]));
  assert.doesNotThrow(() => validateExecutionContext({ VERCEL: "1", VERCEL_ENV: "preview" }, [APPROVED_LOCAL_ARGUMENT]));
  assert.throws(
    () => validateExecutionContext({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, []),
    (error) => error.code === "staging_execution_context_rejected"
  );
  assert.throws(
    () => validateExecutionContext({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" }, [APPROVED_LOCAL_ARGUMENT]),
    (error) => error.code === "staging_execution_context_rejected"
  );
});

test("configuration projection never includes signing or rate-limit secrets", () => {
  const projected = stagingValidationEnvironment(stagingEnv({
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: "private-material",
    POS_LICENSING_EXPECTED_PUBLIC_JWK: "public-material",
    UPSTASH_REDIS_REST_TOKEN: "rate-limit-token"
  }));
  assert.equal(projected.MONGO_URI.includes("staging_password"), true);
  assert.equal("POS_LICENSING_SIGNING_PRIVATE_JWK_B64" in projected, false);
  assert.equal("POS_LICENSING_EXPECTED_PUBLIC_JWK" in projected, false);
  assert.equal("UPSTASH_REDIS_REST_TOKEN" in projected, false);
});

test("runner performs only injected reads and rejects a non-staging connected database", async () => {
  let reads = 0;
  const good = await runStagingFixtureEligibilityCheck({
    env: stagingEnv(),
    argv: [APPROVED_LOCAL_ARGUMENT],
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    loadEnvironment() {},
    readRecords: async () => {
      reads += 1;
      return eligibleRecords();
    },
    now: new Date("2030-01-01T00:00:00.000Z")
  });
  assert.equal(reads, 1);
  assert.equal(good.safeToProceedWithOneNewActivationCode, true);

  const rejected = await runStagingFixtureEligibilityCheck({
    env: stagingEnv(),
    argv: [APPROVED_LOCAL_ARGUMENT],
    connection: { name: "automatex_pos_production", db: { databaseName: "automatex_pos_production" } },
    loadEnvironment() {},
    readRecords: async () => {
      reads += 1;
      return eligibleRecords();
    }
  });
  assert.equal(reads, 1);
  assert.deepEqual(rejected.blockers, ["staging_database_identity_mismatch"]);
});

test("runner rejects production configuration before reading records", async () => {
  let reads = 0;
  const result = await runStagingFixtureEligibilityCheck({
    env: stagingEnv({
      AUTOMATEX_ENV: "production",
      POS_LICENSING_MODE: "production",
      POS_LICENSING_ENVIRONMENT: "production",
      POS_LICENSING_CLIENT_SCOPE: "production-only",
      POS_LICENSING_SECRET_ENVIRONMENT: "production",
      POS_LICENSING_DATABASE_NAME: "automatex_pos_production",
      MONGO_URI: authenticatedMongoUri("production", "automatex_pos_production")
    }),
    argv: [APPROVED_LOCAL_ARGUMENT],
    connection: { name: "automatex_pos_production" },
    loadEnvironment() {},
    readRecords: async () => {
      reads += 1;
      return eligibleRecords();
    }
  });
  assert.equal(reads, 0);
  assert.equal(result.safeToProceedWithOneNewActivationCode, false);
  assert.deepEqual(result.blockers, ["staging_configuration_environment_mismatch"]);
});
