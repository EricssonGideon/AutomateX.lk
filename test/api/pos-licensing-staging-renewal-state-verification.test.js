const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-renewal-state-verification-test-only";

const {
  EXPECTED_RENEWAL_ISSUED_AT,
  EXPECTED_RENEWAL_OFFLINE_VALID_UNTIL,
  STAGING_RENEWAL_STATE_BOOLEAN_FIELDS,
  createRenewalStateVerificationResult,
  createStagingPosRenewalStateVerificationService
} = require("../../server/services/stagingPosRenewalStateVerificationService");
const {
  STAGING_FIXTURE_CLIENT_EMAIL,
  STAGING_FIXTURE_MARKER,
  STAGING_FIXTURE_PACKAGE_CODE,
  STAGING_FIXTURE_PROJECT_TITLE
} = require("../../server/services/stagingPosActivationFixtureService");
const {
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_ENV,
  STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER
} = require("../../server/routes/internalStagingActivationFixture");
const {
  STAGING_RENEWAL_STATE_VERIFY_FLAG,
  STAGING_RENEWAL_STATE_VERIFY_PATH,
  mountStagingRenewalStateVerifyEndpoint,
  stagingRenewalStateVerifyIsEnabled
} = require("../../server/routes/internalStagingRenewalStateVerification");

const CLIENT_ID = "507f1f77bcf86cd799439091";
const PROJECT_ID = "507f1f77bcf86cd799439092";
const PACKAGE_ID = "507f1f77bcf86cd799439093";
const LICENCE_ID = "507f1f77bcf86cd799439094";
const INSTALLATION_ID = "507f1f77bcf86cd799439095";
const ACTIVATION_CODE_ID = "507f1f77bcf86cd799439096";
const ACTIVATION_ISSUE_ID = "507f1f77bcf86cd799439097";
const RENEWAL_ISSUE_ID = "507f1f77bcf86cd799439098";
const OPERATOR_TOKEN = "renewal-state-verification-" + "o".repeat(48);
const BEFORE_RENEWAL = new Date("2026-09-20T06:20:00.000Z");

function stagingPreviewEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENABLED: "true",
    [STAGING_RENEWAL_STATE_VERIFY_FLAG]: "true",
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
    get(routePath, ...handlers) {
      this.registrations.push({ method: "GET", path: routePath, handlers });
    }
  };
}

async function invoke(handlers, req = {}) {
  const response = responseRecorder();
  const request = { headers: {}, method: "GET", ...req };
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

function operatorRequest() {
  return { headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: OPERATOR_TOKEN } };
}

function passingResult(overrides = {}) {
  return {
    ...Object.fromEntries(STAGING_RENEWAL_STATE_BOOLEAN_FIELDS.map((field) => [field, true])),
    duplicateRenewalIssueDetected: false,
    renewalIssueCount: 1,
    overallPass: true,
    ...overrides
  };
}

function mountedHandlers(options = {}) {
  const router = routerRecorder();
  assert.equal(mountStagingRenewalStateVerifyEndpoint(router, {
    env: stagingPreviewEnvironment(),
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateDatabase() {},
    async runReadinessGate() { return eligibleReadiness(); },
    verificationService: {
      async verifyRenewalState() { return passingResult(); }
    },
    rateLimitStoreFactory: {},
    ...options
  }), true);
  return router.registrations[0].handlers;
}

function idText(value) {
  return String(value && (value._id || value.id || value) || "");
}

function matches(record, query = {}) {
  return Object.entries(query).every(([field, expected]) => idText(record[field]) === idText(expected));
}

function clone(record) {
  return {
    ...record,
    signedPayload: record.signedPayload ? { ...record.signedPayload } : record.signedPayload
  };
}

function memoryRepository(records = [], hiddenFields = []) {
  const stored = records.map(clone);
  const calls = { find: [], select: [] };
  return {
    calls,
    find(query) {
      calls.find.push({ ...query });
      let selection = "";
      return {
        select(value) {
          selection = value;
          calls.select.push(value);
          return this;
        },
        lean() {
          const explicitlySelected = new Set(
            selection.split(/\s+/).filter((field) => field.startsWith("+")).map((field) => field.slice(1))
          );
          return Promise.resolve(stored.filter((record) => matches(record, query)).map((record) => {
            const result = clone(record);
            for (const field of hiddenFields) {
              if (!explicitlySelected.has(field)) {
                delete result[field];
              }
            }
            return result;
          }));
        }
      };
    }
  };
}

function fixtureRepositories(overrides = {}) {
  const repositories = {
    users: memoryRepository([{
      _id: CLIENT_ID,
      email: STAGING_FIXTURE_CLIENT_EMAIL,
      role: "client",
      businessName: STAGING_FIXTURE_MARKER,
      createdAt: BEFORE_RENEWAL
    }]),
    projects: memoryRepository([{
      _id: PROJECT_ID,
      clientId: CLIENT_ID,
      projectTitle: STAGING_FIXTURE_PROJECT_TITLE,
      projectType: "POS System",
      adminNotes: STAGING_FIXTURE_MARKER,
      createdAt: BEFORE_RENEWAL,
      updatedAt: BEFORE_RENEWAL
    }]),
    posPackages: memoryRepository([{
      _id: PACKAGE_ID,
      packageCode: STAGING_FIXTURE_PACKAGE_CODE,
      notes: STAGING_FIXTURE_MARKER,
      edition: "standard",
      status: "active",
      createdAt: BEFORE_RENEWAL,
      updatedAt: BEFORE_RENEWAL
    }]),
    posLicences: memoryRepository([{
      _id: LICENCE_ID,
      clientId: CLIENT_ID,
      projectId: PROJECT_ID,
      packageId: PACKAGE_ID,
      notes: STAGING_FIXTURE_MARKER,
      edition: "standard",
      status: "active",
      maxInstallations: 1,
      activationCount: 1,
      renewalWindowDurationMinutes: 60,
      createdAt: BEFORE_RENEWAL,
      updatedAt: BEFORE_RENEWAL
    }]),
    posInstallations: memoryRepository([{
      _id: INSTALLATION_ID,
      licenceId: LICENCE_ID,
      status: "active",
      lastIssueId: RENEWAL_ISSUE_ID,
      lastRenewedAt: new Date(EXPECTED_RENEWAL_ISSUED_AT),
      renewalCredentialHash: "sha256:v1:" + "h".repeat(64),
      renewalCredentialVersion: 1,
      renewalCredentialBoundAt: new Date("2026-09-20T06:30:00.000Z"),
      createdAt: BEFORE_RENEWAL,
      updatedAt: new Date(EXPECTED_RENEWAL_ISSUED_AT)
    }], ["renewalCredentialHash"]),
    posActivationCodes: memoryRepository([{
      _id: ACTIVATION_CODE_ID,
      licenceId: LICENCE_ID,
      status: "redeemed",
      maxRedemptions: 1,
      redeemedCount: 1,
      createdAt: BEFORE_RENEWAL,
      updatedAt: BEFORE_RENEWAL
    }]),
    posLicenceIssues: memoryRepository([{
      _id: ACTIVATION_ISSUE_ID,
      licenceId: LICENCE_ID,
      installationId: INSTALLATION_ID,
      activationCodeId: ACTIVATION_CODE_ID,
      issueReason: "activation",
      status: "issued",
      renewalCredentialVersion: 0,
      signedPayload: { licenceStatus: "active", signature: "activation-signature" },
      issuedAt: new Date("2026-09-20T06:10:00.000Z"),
      createdAt: BEFORE_RENEWAL,
      updatedAt: BEFORE_RENEWAL
    }, {
      _id: RENEWAL_ISSUE_ID,
      licenceId: LICENCE_ID,
      installationId: INSTALLATION_ID,
      activationCodeId: null,
      issueReason: "renewal",
      status: "issued",
      renewalCredentialVersion: 1,
      predecessorSignatureHash: "sha256:v1:" + "p".repeat(64),
      issuedAt: new Date(EXPECTED_RENEWAL_ISSUED_AT),
      offlineValidUntil: new Date(EXPECTED_RENEWAL_OFFLINE_VALID_UNTIL),
      signedPayload: {
        licenceStatus: "active",
        issuedAt: EXPECTED_RENEWAL_ISSUED_AT,
        offlineValidUntil: EXPECTED_RENEWAL_OFFLINE_VALID_UNTIL,
        signature: "renewal-signature"
      },
      createdAt: new Date(EXPECTED_RENEWAL_ISSUED_AT),
      updatedAt: new Date(EXPECTED_RENEWAL_ISSUED_AT)
    }], ["signedPayload", "predecessorSignatureHash"])
  };

  for (const [name, value] of Object.entries(overrides)) {
    repositories[name] = value;
  }
  return repositories;
}

test("renewal-state verification endpoint mounts only on the exact staging Preview branch", () => {
  const router = routerRecorder();
  assert.equal(mountStagingRenewalStateVerifyEndpoint(router, { env: stagingPreviewEnvironment() }), true);
  assert.equal(STAGING_RENEWAL_STATE_VERIFY_PATH,
    "/internal/pos-licensing-staging-test-fixture/verify-renewal-state");
  assert.equal(router.registrations[0].method, "GET");

  for (const env of [
    stagingPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingPreviewEnvironment({ VERCEL_ENV: "production" }),
    stagingPreviewEnvironment({ AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" }),
    stagingPreviewEnvironment({ POS_LICENSING_ENABLED: "false" }),
    stagingPreviewEnvironment({ VERCEL: "0" })
  ]) {
    const rejected = routerRecorder();
    assert.equal(mountStagingRenewalStateVerifyEndpoint(rejected, { env }), false);
    assert.equal(rejected.registrations.length, 0);
  }
});

test("disabled verification flag rejects before authorization, database, readiness, or reads", async () => {
  const counters = {};
  const env = stagingPreviewEnvironment({ [STAGING_RENEWAL_STATE_VERIFY_FLAG]: "false" });
  const router = routerRecorder();
  mountStagingRenewalStateVerifyEndpoint(router, {
    env,
    async connectionProvider() { counters.connection = 1; },
    async runReadinessGate() { counters.readiness = 1; },
    verificationService: { async verifyRenewalState() { counters.verification = 1; } }
  });

  assert.equal(stagingRenewalStateVerifyIsEnabled(env), false);
  const response = await invoke(router.registrations[0].handlers);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, createRenewalStateVerificationResult());
  assert.deepEqual(counters, {});
});

test("wrong operator token and failed readiness return only safe verification fields", async () => {
  let verificationCalls = 0;
  const wrongToken = await invoke(mountedHandlers({
    verificationService: { async verifyRenewalState() { verificationCalls += 1; } }
  }), {
    headers: { [STAGING_TEST_FIXTURE_OPERATOR_TOKEN_HEADER]: "wrong-" + "w".repeat(48) }
  });
  assert.equal(wrongToken.statusCode, 401);
  assert.deepEqual(wrongToken.body, createRenewalStateVerificationResult());
  assert.equal(verificationCalls, 0);

  const failedReadiness = await invoke(mountedHandlers({
    async runReadinessGate() {
      return eligibleReadiness({
        ready: false,
        eligibleForRouteMount: false,
        eligibleForStagingRouteMount: false
      });
    },
    verificationService: { async verifyRenewalState() { verificationCalls += 1; } }
  }), operatorRequest());
  assert.equal(failedReadiness.statusCode, 503);
  assert.deepEqual(failedReadiness.body, createRenewalStateVerificationResult());
  assert.equal(verificationCalls, 0);
});

test("valid endpoint response strips documents, identifiers, credentials, signatures, and raw errors", async () => {
  const response = await invoke(mountedHandlers({
    verificationService: {
      async verifyRenewalState() {
        return {
          ...passingResult(),
          renewalCredentialHash: "representative-renewal-secret",
          signature: "representative-signature",
          activationCode: "representative-activation-code",
          licenceId: LICENCE_ID,
          rawDocument: { privateKey: "representative-private-key" }
        };
      }
    }
  }), operatorRequest());

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, createRenewalStateVerificationResult(passingResult()));
  assert.deepEqual(
    Object.keys(response.body).sort(),
    [...STAGING_RENEWAL_STATE_BOOLEAN_FIELDS, "renewalIssueCount", "overallPass"].sort()
  );
  const serialized = JSON.stringify(response.body);
  for (const value of [
    "representative-renewal-secret",
    "representative-signature",
    "representative-activation-code",
    "representative-private-key",
    LICENCE_ID
  ]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("read-only verifier confirms the expected successful renewal state", async () => {
  const repositories = fixtureRepositories();
  const service = createStagingPosRenewalStateVerificationService({ repositories });
  const result = await service.verifyRenewalState();

  assert.deepEqual(result, createRenewalStateVerificationResult(passingResult()));
  assert.deepEqual(repositories.posInstallations.calls.select, ["+renewalCredentialHash"]);
  assert.deepEqual(repositories.posLicenceIssues.calls.select, ["+signedPayload +predecessorSignatureHash"]);
  for (const repository of Object.values(repositories)) {
    assert.deepEqual(Object.keys(repository).sort(), ["calls", "find"].sort());
  }
});

test("duplicate predecessor issuance and unrelated fixture changes fail verification", async () => {
  const duplicateRepositories = fixtureRepositories();
  const issueRepository = duplicateRepositories.posLicenceIssues;
  const originalFind = issueRepository.find.bind(issueRepository);
  issueRepository.find = function findWithDuplicate(query) {
    const queryResult = originalFind(query);
    const originalLean = queryResult.lean.bind(queryResult);
    queryResult.lean = async function leanWithDuplicate() {
      const records = await originalLean();
      const renewal = records.find((record) => record._id === RENEWAL_ISSUE_ID);
      return [...records, { ...renewal, _id: "507f1f77bcf86cd799439099" }];
    };
    return queryResult;
  };
  const duplicateResult = await createStagingPosRenewalStateVerificationService({
    repositories: duplicateRepositories
  }).verifyRenewalState();
  assert.equal(duplicateResult.duplicateRenewalIssueDetected, true);
  assert.equal(duplicateResult.renewalIssueCount, 2);
  assert.equal(duplicateResult.overallPass, false);

  const changedRepositories = fixtureRepositories({
    posPackages: memoryRepository([{
      _id: PACKAGE_ID,
      packageCode: STAGING_FIXTURE_PACKAGE_CODE,
      notes: STAGING_FIXTURE_MARKER,
      edition: "standard",
      status: "active",
      createdAt: BEFORE_RENEWAL,
      updatedAt: new Date("2026-09-20T06:40:00.000Z")
    }])
  });
  const changedResult = await createStagingPosRenewalStateVerificationService({
    repositories: changedRepositories
  }).verifyRenewalState();
  assert.equal(changedResult.unrelatedFixtureStateIntact, false);
  assert.equal(changedResult.overallPass, false);
});
