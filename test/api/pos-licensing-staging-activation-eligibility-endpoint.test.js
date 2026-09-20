const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-activation-eligibility-test-only";

const {
  RESPONSE_FIELDS,
  STAGING_ACTIVATION_ELIGIBILITY_PATH,
  createStagingActivationEligibilityHandler,
  mountStagingActivationEligibilityEndpoint,
  shouldMountStagingActivationEligibilityEndpoint
} = require("../../server/routes/internalStagingActivationEligibility");
const {
  FIXTURE_CLIENT_EMAIL,
  FIXTURE_CLIENT_NAME,
  FIXTURE_MARKER,
  FIXTURE_PACKAGE_CODE,
  FIXTURE_PACKAGE_NAME,
  FIXTURE_PROJECT_TITLE,
  createStagingPosActivationEligibilityService
} = require("../../server/services/stagingPosActivationEligibilityService");
const {
  POS_STANDARD_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");

const DIAGNOSTIC_TOKEN = "staging-activation-eligibility-token-" + "e".repeat(32);

function stagingEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_ENABLED: "true",
    POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_TOKEN: DIAGNOSTIC_TOKEN,
    ...overrides
  };
}

function request(authorization, query = {}) {
  return {
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
    get(path, handler) { this.registrations.push({ path, handler }); }
  };
}

function eligibleResult(overrides = {}) {
  return {
    fixtureLicenceId: "fixture-licence-id",
    packageStatus: "active",
    licenceStatus: "active",
    licenceExpiry: "2030-01-02T00:00:00.000Z",
    maxInstallations: 2,
    activeInstallationCount: 1,
    activationCount: 1,
    freshInstallationAllowed: true,
    activationCodeIssuanceEligible: true,
    validStagingAdminAvailable: true,
    safeToProceedWithOneNewActivationCode: true,
    blockers: [],
    ...overrides
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const handler = createStagingActivationEligibilityHandler({
    env,
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateMongoConfig() {
      return { environment: "staging", databaseName: "automatex_pos_staging" };
    },
    eligibilityService: {
      async checkEligibility() { return eligibleResult(); }
    },
    ...options
  });
  await handler(request(authorization, options.query), response);
  return response;
}

test("exact staging Preview guard mounts the GET endpoint", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingActivationEligibilityEndpoint(env), true);
  assert.equal(mountStagingActivationEligibilityEndpoint(router, { env }), true);
  assert.equal(router.registrations.length, 1);
  assert.equal(router.registrations[0].path, STAGING_ACTIVATION_ELIGIBILITY_PATH);
  assert.equal(
    STAGING_ACTIVATION_ELIGIBILITY_PATH,
    "/internal/pos-licensing-staging-activation-eligibility"
  );
});

test("every staging guard and a valid configured token are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_ENABLED: "false" },
    { POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_TOKEN: "" },
    { POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_TOKEN: "too-short" }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingActivationEligibilityEndpoint(env), false);
    assert.equal(mountStagingActivationEligibilityEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("authorized response contains exactly the sanitized allowlist and no sensitive values", async () => {
  const privateValue = "private-value-that-must-not-appear";
  const response = await invoke(stagingEnvironment(), `Bearer ${DIAGNOSTIC_TOKEN}`, {
    eligibilityService: {
      async checkEligibility() {
        return eligibleResult({
          client: { email: "client@example.invalid" },
          admin: { id: "admin-id" },
          activationCode: "posac_not-allowed",
          codeHash: privateValue,
          jwt: privateValue,
          databaseCredential: privateValue
        });
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(Object.keys(response.body), RESPONSE_FIELDS);
  assert.deepEqual(response.body, {
    licenceIdPresent: true,
    packageStatus: "active",
    licenceStatus: "active",
    licenceExpiry: "2030-01-02T00:00:00.000Z",
    maxInstallations: 2,
    activeInstallationCount: 1,
    activationCount: 1,
    freshInstallationAllowed: true,
    activationCodeIssuanceEligible: true,
    validStagingAdminAvailable: true,
    overallPass: true,
    blocker: ""
  });
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("client@example.invalid"), false);
  assert.equal(serialized.includes("admin-id"), false);
  assert.equal(serialized.includes("posac_"), false);
  assert.equal(serialized.includes(privateValue), false);
  assert.equal(serialized.includes(DIAGNOSTIC_TOKEN), false);
});

test("wrong, missing, and URL-only bearer tokens are rejected before database access", async () => {
  let validationCalls = 0;
  const options = {
    validateMongoConfig() {
      validationCalls += 1;
      throw new Error("must not run");
    }
  };
  const responses = [
    await invoke(stagingEnvironment(), "Bearer wrong-token", options),
    await invoke(stagingEnvironment(), undefined, options),
    await invoke(stagingEnvironment(), undefined, { ...options, query: { token: DIAGNOSTIC_TOKEN } })
  ];
  for (const response of responses) {
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Unauthorized." });
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(validationCalls, 0);
});

test("main and production fail closed before database access", async () => {
  const environments = [
    stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingEnvironment({
      AUTOMATEX_ENV: "production",
      POS_LICENSING_MODE: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main"
    })
  ];
  let validationCalls = 0;
  for (const env of environments) {
    const router = routerRecorder();
    assert.equal(shouldMountStagingActivationEligibilityEndpoint(env), false);
    assert.equal(mountStagingActivationEligibilityEndpoint(router, { env }), false);
    const response = await invoke(env, `Bearer ${DIAGNOSTIC_TOKEN}`, {
      validateMongoConfig() { validationCalls += 1; }
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { message: "Not found." });
  }
  assert.equal(validationCalls, 0);
});

function objectId(value) {
  return { toString: () => value };
}

function queryResult(records) {
  return {
    select() { return this; },
    lean() { return Promise.resolve(records); }
  };
}

test("eligibility service performs read operations only", async () => {
  const clientId = objectId("client1");
  const projectId = objectId("project1");
  const packageId = objectId("package1");
  const licenceId = objectId("licence1");
  const calls = [];
  const readOnlyRepository = (name, resolveRecords) => ({
    find(query) {
      calls.push({ name, operation: "find", query });
      return queryResult(resolveRecords(query));
    },
    create() { throw new Error("write attempted"); },
    updateOne() { throw new Error("write attempted"); },
    findOneAndUpdate() { throw new Error("write attempted"); },
    deleteOne() { throw new Error("write attempted"); }
  });
  const repositories = {
    users: readOnlyRepository("users", (query) => query.role === "admin" ? [{
      _id: objectId("admin1"), role: "admin", status: "active", isActive: true
    }] : [{
      _id: clientId,
      name: FIXTURE_CLIENT_NAME,
      email: FIXTURE_CLIENT_EMAIL,
      role: "client",
      status: "active",
      accountStatus: "active",
      isActive: true,
      businessName: FIXTURE_MARKER
    }]),
    projects: readOnlyRepository("projects", () => [{
      _id: projectId,
      clientId,
      projectTitle: FIXTURE_PROJECT_TITLE,
      projectType: "POS System",
      status: "Testing",
      adminNotes: FIXTURE_MARKER
    }]),
    posPackages: readOnlyRepository("packages", () => [{
      _id: packageId,
      packageCode: FIXTURE_PACKAGE_CODE,
      name: FIXTURE_PACKAGE_NAME,
      edition: "standard",
      status: "active",
      moduleIds: [...POS_STANDARD_MODULE_IDS],
      updateChannels: ["stable"],
      notes: FIXTURE_MARKER
    }]),
    posLicences: readOnlyRepository("licences", () => [{
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
    }]),
    posInstallations: readOnlyRepository("installations", () => [{
      _id: objectId("installation1"), licenceId, status: "active"
    }])
  };

  const service = createStagingPosActivationEligibilityService({
    repositories,
    clock: () => new Date("2030-01-01T00:00:00.000Z")
  });
  const result = await service.checkEligibility();
  assert.equal(result.safeToProceedWithOneNewActivationCode, true);
  assert.equal(result.activationCodeIssuanceEligible, true);
  assert.equal(result.freshInstallationAllowed, true);
  assert.equal(calls.length, 6);
  assert.equal(calls.every((call) => call.operation === "find"), true);
});

test("database mismatch and service failures return only the sanitized unavailable shape", async () => {
  const mismatch = await invoke(stagingEnvironment(), `Bearer ${DIAGNOSTIC_TOKEN}`, {
    connection: { name: "automatex_pos_production" }
  });
  const failure = await invoke(stagingEnvironment(), `Bearer ${DIAGNOSTIC_TOKEN}`, {
    eligibilityService: {
      async checkEligibility() { throw new Error(`secret=${DIAGNOSTIC_TOKEN}`); }
    }
  });
  for (const response of [mismatch, failure]) {
    assert.equal(response.statusCode, 503);
    assert.deepEqual(Object.keys(response.body), RESPONSE_FIELDS);
    assert.equal(response.body.overallPass, false);
    assert.equal(response.body.blocker, "diagnostic_unavailable");
    assert.equal(JSON.stringify(response.body).includes(DIAGNOSTIC_TOKEN), false);
  }
});

test("diagnostic token is covered by secret-field rejection and log sanitization", () => {
  const sanitized = sanitizeSensitiveText(`token=${DIAGNOSTIC_TOKEN}`, {
    env: { POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_TOKEN: DIAGNOSTIC_TOKEN }
  });
  assert.equal(sanitized.includes(DIAGNOSTIC_TOKEN), false);
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_TOKEN: DIAGNOSTIC_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
});
