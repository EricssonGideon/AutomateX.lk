const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-current-activation-code-test-only";

const {
  RESPONSE_FIELDS,
  STAGING_CURRENT_ACTIVATION_CODE_PATH,
  TARGET_LICENCE_ID,
  createStagingCurrentActivationCodeHandler,
  mountStagingCurrentActivationCodeEndpoint,
  resolveCurrentActivationCode,
  shouldMountStagingCurrentActivationCodeEndpoint
} = require("../../server/routes/internalStagingCurrentActivationCode");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");

const DIAGNOSTIC_TOKEN = "staging-current-activation-code-token-" + "c".repeat(32);
const ACTIVATION_CODE_ID = "6ab0a078e2b1d24644d368ae";
const FUTURE_EXPIRY = "2030-01-01T01:00:00.000Z";
const NOW = new Date("2030-01-01T00:00:00.000Z");

function stagingEnvironment(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_ENABLED: "true",
    POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_TOKEN: DIAGNOSTIC_TOKEN,
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

function activationCodeRecord(overrides = {}) {
  return {
    _id: ACTIVATION_CODE_ID,
    licenceId: TARGET_LICENCE_ID,
    status: "active",
    redeemedCount: 0,
    maxRedemptions: 1,
    expiresAt: new Date(FUTURE_EXPIRY),
    codeHash: "sha256:v1:not-returned",
    activationCode: "posac_not-returned",
    ...overrides
  };
}

function repositoryReturning(records, calls = []) {
  return {
    find(filter) {
      calls.push({ operation: "find", filter });
      return {
        select(projection) {
          calls.push({ operation: "select", projection });
          return this;
        },
        lean() {
          calls.push({ operation: "lean" });
          return Promise.resolve(records);
        }
      };
    },
    create() { throw new Error("write attempted"); },
    updateOne() { throw new Error("write attempted"); },
    updateMany() { throw new Error("write attempted"); },
    findOneAndUpdate() { throw new Error("write attempted"); },
    deleteOne() { throw new Error("write attempted"); },
    deleteMany() { throw new Error("write attempted"); }
  };
}

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const handler = createStagingCurrentActivationCodeHandler({
    env,
    connection: { name: "automatex_pos_staging", db: { databaseName: "automatex_pos_staging" } },
    validateMongoConfig() {
      return { environment: "staging", databaseName: "automatex_pos_staging" };
    },
    repository: repositoryReturning([activationCodeRecord()]),
    clock: () => NOW,
    ...options
  });
  await handler(request(authorization, options.query), response);
  return response;
}

test("exact staging Preview guard mounts the GET endpoint", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingCurrentActivationCodeEndpoint(env), true);
  assert.equal(mountStagingCurrentActivationCodeEndpoint(router, { env }), true);
  assert.equal(router.registrations.length, 1);
  assert.equal(router.registrations[0].path, STAGING_CURRENT_ACTIVATION_CODE_PATH);
  assert.equal(
    STAGING_CURRENT_ACTIVATION_CODE_PATH,
    "/internal/pos-licensing-staging-current-activation-code"
  );
});

test("every staging guard and a valid configured token are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_ENABLED: "false" },
    { POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_TOKEN: "" },
    { POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_TOKEN: "too-short" }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingCurrentActivationCodeEndpoint(env), false);
    assert.equal(mountStagingCurrentActivationCodeEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("authorized response contains exactly the sanitized metadata allowlist", async () => {
  const response = await invoke(stagingEnvironment(), `Bearer ${DIAGNOSTIC_TOKEN}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(Object.keys(response.body), RESPONSE_FIELDS);
  assert.deepEqual(response.body, {
    activationCodeId: ACTIVATION_CODE_ID,
    status: "active",
    redeemedCount: 0,
    maxRedemptions: 1,
    expiresAt: FUTURE_EXPIRY,
    unused: true
  });
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("posac_"), false);
  assert.equal(serialized.includes("sha256"), false);
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
    const response = await invoke(env, `Bearer ${DIAGNOSTIC_TOKEN}`, {
      validateMongoConfig() { validationCalls += 1; }
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { message: "Not found." });
  }
  assert.equal(validationCalls, 0);
});

test("zero or multiple active unused records fail closed", async () => {
  for (const records of [
    [],
    [activationCodeRecord(), activationCodeRecord({ _id: "6ab0a078e2b1d24644d368af" })]
  ]) {
    const response = await invoke(stagingEnvironment(), `Bearer ${DIAGNOSTIC_TOKEN}`, {
      repository: repositoryReturning(records)
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "Activation-code diagnostic unavailable." });
  }
});

test("redeemed, revoked, expired, mismatched, or non-single-redemption records fail closed", async () => {
  const invalidRecords = [
    activationCodeRecord({ status: "redeemed", redeemedCount: 1 }),
    activationCodeRecord({ status: "revoked" }),
    activationCodeRecord({ expiresAt: new Date("2029-12-31T23:59:59.000Z") }),
    activationCodeRecord({ licenceId: "6ab0a078e2b1d24644d368ad" }),
    activationCodeRecord({ maxRedemptions: 2 })
  ];
  for (const record of invalidRecords) {
    const response = await invoke(stagingEnvironment(), `Bearer ${DIAGNOSTIC_TOKEN}`, {
      repository: repositoryReturning([record])
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "Activation-code diagnostic unavailable." });
  }
});

test("resolution uses only a fixed read query and excludes hash and plaintext fields", async () => {
  const calls = [];
  const result = await resolveCurrentActivationCode({
    repository: repositoryReturning([activationCodeRecord()], calls),
    clock: () => NOW
  });
  assert.equal(result.activationCodeId, ACTIVATION_CODE_ID);
  assert.deepEqual(calls[0], {
    operation: "find",
    filter: {
      licenceId: TARGET_LICENCE_ID,
      status: "active",
      redeemedCount: 0
    }
  });
  assert.equal(calls.filter((call) => call.operation === "find").length, 1);
  assert.equal(calls.some((call) => /codeHash|activationCode/.test(call.projection || "")), false);
  assert.deepEqual(calls.map((call) => call.operation), ["find", "select", "lean"]);
});

test("database mismatch and query errors return only a generic response", async () => {
  const mismatch = await invoke(stagingEnvironment(), `Bearer ${DIAGNOSTIC_TOKEN}`, {
    connection: { name: "automatex_pos_production" }
  });
  const failure = await invoke(stagingEnvironment(), `Bearer ${DIAGNOSTIC_TOKEN}`, {
    repository: {
      find() { throw new Error(`secret=${DIAGNOSTIC_TOKEN}`); }
    }
  });
  for (const response of [mismatch, failure]) {
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "Activation-code diagnostic unavailable." });
    assert.equal(JSON.stringify(response.body).includes(DIAGNOSTIC_TOKEN), false);
  }
});

test("diagnostic token is covered by secret-field rejection and log sanitization", () => {
  const sanitized = sanitizeSensitiveText(`token=${DIAGNOSTIC_TOKEN}`, {
    env: { POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_TOKEN: DIAGNOSTIC_TOKEN }
  });
  assert.equal(sanitized.includes(DIAGNOSTIC_TOKEN), false);
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_TOKEN: DIAGNOSTIC_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
});
