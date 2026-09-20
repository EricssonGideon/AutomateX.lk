const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-bootstrap-diagnostic-test-only";

const {
  POS_STANDARD_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  digestActivationCode,
  generateActivationCode
} = require("../../server/utils/posActivationCodeToken");
const {
  STAGING_FIXTURE_MARKER
} = require("../../server/services/stagingPosActivationFixtureService");
const {
  BOOTSTRAP_REQUEST_FIELDS
} = require("../../server/services/posRenewalCredentialBootstrapService");
const {
  STAGING_BOOTSTRAP_DIAGNOSTIC_BOOLEAN_FIELDS,
  createStagingPosRenewalBootstrapDiagnosticService
} = require("../../server/services/stagingPosRenewalBootstrapDiagnosticService");
const {
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER
} = require("../../server/routes/internalStagingActivationFixture");
const {
  STAGING_BOOTSTRAP_DIAGNOSTIC_FLAG,
  STAGING_BOOTSTRAP_DIAGNOSTIC_PATH,
  mountStagingBootstrapDiagnosticEndpoint,
  stagingBootstrapDiagnosticIsEnabled
} = require("../../server/routes/internalStagingRenewalBootstrapDiagnostic");

const NOW = new Date("2026-09-20T08:00:00.000Z");
const LICENCE_ID = "507f1f77bcf86cd799439071";
const PACKAGE_ID = "507f1f77bcf86cd799439072";
const ACTIVATION_CODE_ID = "507f1f77bcf86cd799439073";
const INSTALLATION_ID = "507f1f77bcf86cd799439074";
const ISSUE_ID = "507f1f77bcf86cd799439075";
const DEVICE_ID = "22222222-3333-4444-8555-666666666666";
const OTHER_DEVICE_ID = "33333333-4444-4555-8666-777777777777";
const ACTIVATION_CODE = generateActivationCode();
const SIGNATURE = Buffer.from(crypto.randomBytes(64)).toString("base64");
const OTHER_SIGNATURE = Buffer.from(crypto.randomBytes(64)).toString("base64");
const RENEWAL_DIGEST = "sha256:v1:" + "d".repeat(64);
const OPERATOR_TOKEN = "bootstrap-diagnostic-" + "o".repeat(48);

function stagingPreviewEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    [STAGING_BOOTSTRAP_DIAGNOSTIC_FLAG]: "true",
    [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV]: OPERATOR_TOKEN,
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    ...overrides
  };
}

function eligibleReadiness(overrides = {}) {
  return {
    environment: "staging",
    ready: true,
    technicalReadinessPassed: true,
    enablementRequested: true,
    eligibleForRouteMount: true,
    eligibleForStagingRouteMount: true,
    eligibleForProductionRouteMount: false,
    checks: [{ name: "staging_enablement", passed: true, code: "staging_enablement_explicit" }],
    ...overrides
  };
}

function bootstrapRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    edition: "standard",
    activationCode: ACTIVATION_CODE,
    deviceInstallationId: DEVICE_ID,
    signedLicenceSignature: SIGNATURE,
    renewalCredentialDigest: RENEWAL_DIGEST,
    ...overrides
  };
}

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function routerRecorder() {
  return {
    registrations: [],
    post(path, ...handlers) { this.registrations.push({ method: "POST", path, handlers }); }
  };
}

async function invoke(handlers, req = {}) {
  const response = responseRecorder();
  const request = { body: bootstrapRequest(), headers: {}, method: "POST", ...req };
  let index = 0;
  async function next() {
    const handler = handlers[index++];
    if (handler) {
      return handler(request, response, next);
    }
  }
  await next();
  return response;
}

function operatorRequest(overrides = {}) {
  return {
    body: bootstrapRequest(),
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: OPERATOR_TOKEN },
    ...overrides
  };
}

function passingDiagnostic() {
  return {
    code: "staging_bootstrap_diagnostic_passed",
    activationCodeMatchesIssueLinkedRecord: true,
    activationCodeUsableNow: true,
    installationMatches: true,
    signedLicenceSignatureMatchesOriginalActivationIssue: true,
    activationIssueStillValid: true,
    renewalCredentialStateIsClear: true,
    renewalCredentialDigestFormatValid: true,
    finalBootstrapPreconditionsPass: true
  };
}

function mountedHandlers(options = {}) {
  const router = routerRecorder();
  assert.equal(mountStagingBootstrapDiagnosticEndpoint(router, {
    env: stagingPreviewEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateDatabase() {},
    async runReadinessGate() { return eligibleReadiness(); },
    diagnosticService: {
      async diagnoseBootstrap() { return passingDiagnostic(); }
    },
    rateLimitStoreFactory: {},
    ...options
  }), true);
  return router.registrations[0].handlers;
}

function idText(value) {
  return String(value && (value._id || value.id || value) || "");
}

function comparable(value) {
  return value instanceof Date ? value.toISOString() : idText(value);
}

function matches(record, query = {}) {
  return Object.entries(query).every(([field, expected]) => comparable(record[field]) === comparable(expected));
}

function memoryRepository(records = []) {
  const stored = records.map((record) => ({
    ...record,
    signedPayload: record.signedPayload ? { ...record.signedPayload } : record.signedPayload
  }));
  return {
    records: stored,
    async find(query) {
      return stored.filter((record) => matches(record, query));
    },
    async findOne(query) {
      return stored.find((record) => matches(record, query)) || null;
    },
    async findById(id) {
      return stored.find((record) => idText(record) === idText(id)) || null;
    }
  };
}

function fixtureRepositories() {
  const licenceExpiry = new Date(NOW.getTime() + 12 * 60 * 60 * 1000);
  const offlineValidUntil = new Date(NOW.getTime() + 6 * 60 * 60 * 1000);
  return {
    posLicences: memoryRepository([{
      _id: LICENCE_ID,
      clientId: "507f1f77bcf86cd799439076",
      packageId: PACKAGE_ID,
      notes: STAGING_FIXTURE_MARKER,
      edition: "standard",
      status: "active",
      entitledModules: [...POS_STANDARD_MODULE_IDS],
      updateChannel: "stable",
      licenceExpiry,
      offlineValidUntil,
      renewalWindowDurationMinutes: 60,
      maxInstallations: 1,
      activationCount: 1
    }]),
    posPackages: memoryRepository([{
      _id: PACKAGE_ID,
      edition: "standard",
      status: "active",
      moduleIds: [...POS_STANDARD_MODULE_IDS],
      updateChannels: ["stable"]
    }]),
    posActivationCodes: memoryRepository([{
      _id: ACTIVATION_CODE_ID,
      licenceId: LICENCE_ID,
      codeHash: digestActivationCode(ACTIVATION_CODE),
      status: "redeemed",
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      maxRedemptions: 1,
      redeemedCount: 1
    }]),
    posInstallations: memoryRepository([{
      _id: INSTALLATION_ID,
      licenceId: LICENCE_ID,
      deviceInstallationId: DEVICE_ID,
      status: "active",
      renewalCredentialHash: "",
      renewalCredentialVersion: 0,
      renewalCredentialBoundAt: null,
      lastIssueId: ISSUE_ID
    }]),
    posLicenceIssues: memoryRepository([{
      _id: ISSUE_ID,
      licenceId: LICENCE_ID,
      installationId: INSTALLATION_ID,
      activationCodeId: ACTIVATION_CODE_ID,
      status: "issued",
      issueReason: "activation",
      issuedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      licenceExpiry,
      offlineValidUntil,
      signedPayload: {
        installationId: DEVICE_ID,
        signature: SIGNATURE
      }
    }])
  };
}

test("bootstrap diagnostic endpoint mounts only on the exact staging Vercel Preview branch", () => {
  const router = routerRecorder();
  assert.equal(mountStagingBootstrapDiagnosticEndpoint(router, { env: stagingPreviewEnvironment() }), true);
  assert.equal(STAGING_BOOTSTRAP_DIAGNOSTIC_PATH, "/internal/pos-licensing-staging-test-fixture/bootstrap-diagnostic");

  for (const env of [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_ENABLED: "false" })
  ]) {
    const rejected = routerRecorder();
    assert.equal(mountStagingBootstrapDiagnosticEndpoint(rejected, { env }), false);
    assert.equal(rejected.registrations.length, 0);
  }
});

test("disabled diagnostic flag rejects before authorization, database, readiness, or service calls", async () => {
  const counters = {};
  const env = stagingPreviewEnvironment({ [STAGING_BOOTSTRAP_DIAGNOSTIC_FLAG]: "false" });
  const router = routerRecorder();
  mountStagingBootstrapDiagnosticEndpoint(router, {
    env,
    async connectionProvider() { counters.connection = 1; },
    async runReadinessGate() { counters.readiness = 1; },
    diagnosticService: { async diagnoseBootstrap() { counters.diagnostic = 1; } }
  });

  assert.equal(stagingBootstrapDiagnosticIsEnabled(env), false);
  const response = await invoke(router.registrations[0].handlers);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { code: "staging_bootstrap_diagnostic_unavailable" });
  assert.deepEqual(counters, {});
});

test("wrong operator token and failed readiness cannot run the diagnostic", async () => {
  let diagnosticCalls = 0;
  const wrongToken = await invoke(mountedHandlers({
    diagnosticService: { async diagnoseBootstrap() { diagnosticCalls += 1; } }
  }), {
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: "wrong-" + "w".repeat(48) }
  });
  assert.equal(wrongToken.statusCode, 401);
  assert.equal(wrongToken.body.code, "staging_test_fixture_operator_unauthorized");
  assert.equal(diagnosticCalls, 0);

  const failedReadiness = await invoke(mountedHandlers({
    async runReadinessGate() {
      return eligibleReadiness({
        ready: false,
        eligibleForRouteMount: false,
        eligibleForStagingRouteMount: false
      });
    },
    diagnosticService: { async diagnoseBootstrap() { diagnosticCalls += 1; } }
  }), operatorRequest());
  assert.equal(failedReadiness.statusCode, 503);
  assert.deepEqual(failedReadiness.body, { code: "staging_bootstrap_diagnostic_readiness_failed" });
  assert.equal(diagnosticCalls, 0);
});

test("diagnostic response contains only fixed booleans and stable codes", async () => {
  assert.deepEqual(Object.keys(bootstrapRequest()), BOOTSTRAP_REQUEST_FIELDS);
  const response = await invoke(mountedHandlers({
    diagnosticService: {
      async diagnoseBootstrap() {
        return {
          ...passingDiagnostic(),
          activationCode: ACTIVATION_CODE,
          codeHash: digestActivationCode(ACTIVATION_CODE),
          signature: SIGNATURE,
          renewalCredential: "representative-sensitive-credential",
          renewalCredentialDigest: RENEWAL_DIGEST,
          privateKey: "representative-private-key"
        };
      }
    }
  }), operatorRequest());

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.code, "staging_bootstrap_diagnostic_passed");
  assert.deepEqual(
    Object.keys(response.body).sort(),
    ["code", "checkCodes", ...STAGING_BOOTSTRAP_DIAGNOSTIC_BOOLEAN_FIELDS].sort()
  );
  for (const field of STAGING_BOOTSTRAP_DIAGNOSTIC_BOOLEAN_FIELDS) {
    assert.equal(response.body[field], true);
    assert.match(response.body.checkCodes[field], /^[a-z0-9_]+$/);
  }
  const serialized = JSON.stringify(response.body);
  for (const sensitiveValue of [ACTIVATION_CODE, SIGNATURE, RENEWAL_DIGEST, "representative-sensitive-credential", "representative-private-key"]) {
    assert.equal(serialized.includes(sensitiveValue), false);
  }
  for (const id of [LICENCE_ID, PACKAGE_ID, ACTIVATION_CODE_ID, INSTALLATION_ID, ISSUE_ID]) {
    assert.equal(serialized.includes(id), false);
  }
});

test("diagnostic failures return a fixed response without raw errors or request values", async () => {
  const response = await invoke(mountedHandlers({
    diagnosticService: {
      async diagnoseBootstrap() {
        throw new Error(`${ACTIVATION_CODE}:${SIGNATURE}:${RENEWAL_DIGEST}`);
      }
    }
  }), operatorRequest());

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { code: "staging_bootstrap_diagnostic_unavailable" });
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes(ACTIVATION_CODE), false);
  assert.equal(serialized.includes(SIGNATURE), false);
  assert.equal(serialized.includes(RENEWAL_DIGEST), false);
});

test("read-only diagnostic reports all bootstrap preconditions passing for the controlled fixture", async () => {
  const repositories = fixtureRepositories();
  const before = JSON.stringify(repositories, (_key, value) => value instanceof Map ? [...value] : value);
  const service = createStagingPosRenewalBootstrapDiagnosticService({
    repositories,
    clock: () => NOW
  });

  const result = await service.diagnoseBootstrap(bootstrapRequest());
  for (const field of STAGING_BOOTSTRAP_DIAGNOSTIC_BOOLEAN_FIELDS) {
    assert.equal(result[field], true, field);
  }
  assert.equal(result.code, "staging_bootstrap_diagnostic_passed");
  assert.equal(JSON.stringify(repositories, (_key, value) => value instanceof Map ? [...value] : value), before);
});

test("diagnostic isolates each bootstrap mismatch without returning supplied values", async () => {
  const cases = [
    {
      field: "activationCodeMatchesIssueLinkedRecord",
      mutate() {},
      request: { activationCode: generateActivationCode() }
    },
    {
      field: "activationCodeUsableNow",
      mutate(repositories) { repositories.posActivationCodes.records[0].expiresAt = NOW; }
    },
    {
      field: "installationMatches",
      mutate() {},
      request: { deviceInstallationId: OTHER_DEVICE_ID }
    },
    {
      field: "signedLicenceSignatureMatchesOriginalActivationIssue",
      mutate() {},
      request: { signedLicenceSignature: OTHER_SIGNATURE }
    },
    {
      field: "activationIssueStillValid",
      mutate(repositories) { repositories.posLicenceIssues.records[0].offlineValidUntil = NOW; }
    },
    {
      field: "renewalCredentialStateIsClear",
      mutate(repositories) {
        const installation = repositories.posInstallations.records[0];
        installation.renewalCredentialHash = "sha256:v1:" + "e".repeat(64);
        installation.renewalCredentialVersion = 1;
        installation.renewalCredentialBoundAt = new Date(NOW.getTime() - 1000);
      }
    },
    {
      field: "renewalCredentialDigestFormatValid",
      mutate() {},
      request: { renewalCredentialDigest: "invalid-digest" }
    }
  ];

  for (const diagnosticCase of cases) {
    const repositories = fixtureRepositories();
    diagnosticCase.mutate(repositories);
    const service = createStagingPosRenewalBootstrapDiagnosticService({ repositories, clock: () => NOW });
    const request = bootstrapRequest(diagnosticCase.request || {});
    const result = await service.diagnoseBootstrap(request);
    assert.equal(result[diagnosticCase.field], false, diagnosticCase.field);
    assert.equal(result.finalBootstrapPreconditionsPass, false);
    assert.match(result.checkCodes[diagnosticCase.field], /^[a-z0-9_]+$/);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(String(request.activationCode)), false);
    assert.equal(serialized.includes(String(request.signedLicenceSignature)), false);
    assert.equal(serialized.includes(String(request.renewalCredentialDigest)), false);
  }
});
