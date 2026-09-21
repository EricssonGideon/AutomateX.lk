const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-staging-admin-bootstrap-test-only";

const {
  STAGING_ADMIN_BOOTSTRAP_PATH,
  createStagingAdminBootstrapHandler,
  mountStagingAdminBootstrapEndpoint,
  shouldMountStagingAdminBootstrapEndpoint
} = require("../../server/routes/internalStagingAdminBootstrap");
const {
  STAGING_ADMIN_BUSINESS_NAME,
  STAGING_ADMIN_EMAIL,
  STAGING_ADMIN_NAME,
  createStagingPosAdminBootstrapService
} = require("../../server/services/stagingPosAdminBootstrapService");
const {
  assertNoPosLicensingServerSecretFields
} = require("../../server/config/posLicensingSecrets");
const { hasPermission } = require("../../server/middleware/auth");
const { sanitizeSensitiveText } = require("../../server/utils/sensitiveData");

const OPERATOR_TOKEN = "staging-admin-bootstrap-operator-" + "t".repeat(40);
const ADMIN_ID = "64b64c88c4a2f7781a123456";
const INTERNAL_PASSWORD = "internally-generated-password-" + "p".repeat(48);
const PASSWORD_HASH = "$2b$12$stagingBootstrapHashThatIsNeverReturned";

function stagingEnvironment(overrides = {}) {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "pos-licensing-staging",
    AUTOMATEX_ENV: "staging",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_ENABLED: "true",
    POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_TOKEN: OPERATOR_TOKEN,
    ...overrides
  };
}

function request(authorization, options = {}) {
  return {
    body: options.body || {},
    query: options.query || {},
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

async function invoke(env, authorization, options = {}) {
  const response = responseRecorder();
  const handler = createStagingAdminBootstrapHandler({
    env,
    connection: {
      name: "automatex_pos_staging",
      db: { databaseName: "automatex_pos_staging" }
    },
    validateMongoConfig() {
      return { environment: "staging", databaseName: "automatex_pos_staging" };
    },
    bootstrapService: {
      async bootstrap() {
        return {
          created: true,
          adminId: ADMIN_ID,
          role: "admin",
          status: "active",
          licencesManage: true
        };
      }
    },
    ...options
  });
  await handler(request(authorization, options.request), response);
  return response;
}

function createPersistenceHarness(initialUsers = []) {
  const users = initialUsers.map((user) => ({ ...user }));
  const audits = [];
  const events = [];
  const session = {
    async withTransaction(callback, transactionOptions) {
      events.push({ type: "transaction", transactionOptions });
      await callback();
      events.push({ type: "commit" });
    },
    async endSession() {
      events.push({ type: "end-session" });
    }
  };
  const connection = {
    async startSession() {
      events.push({ type: "start-session" });
      return session;
    }
  };
  const repositories = {
    users: {
      find() {
        let limit = Infinity;
        const query = {
          limit(value) { limit = value; return query; },
          session(receivedSession) {
            assert.equal(receivedSession, session);
            return Promise.resolve(users.filter((user) =>
              user.email === STAGING_ADMIN_EMAIL ||
              user.businessName === STAGING_ADMIN_BUSINESS_NAME
            ).slice(0, limit));
          }
        };
        return query;
      },
      async create(records, options) {
        assert.equal(options.session, session);
        const created = { _id: ADMIN_ID, ...records[0] };
        users.push(created);
        events.push({ type: "user-created" });
        return [created];
      }
    },
    auditLogs: {
      async create(records, options) {
        assert.equal(options.session, session);
        audits.push({ ...records[0] });
        events.push({ type: "audit-created" });
        return records;
      }
    }
  };
  return { audits, connection, events, repositories, users };
}

function bootstrapService(harness) {
  return createStagingPosAdminBootstrapService({
    connection: harness.connection,
    repositories: harness.repositories,
    generatePassword: () => INTERNAL_PASSWORD,
    hashPassword: async (password) => {
      assert.equal(password, INTERNAL_PASSWORD);
      return PASSWORD_HASH;
    }
  });
}

test("exact staging Preview guards mount only the POST bootstrap endpoint", () => {
  const env = stagingEnvironment();
  const router = routerRecorder();
  assert.equal(shouldMountStagingAdminBootstrapEndpoint(env), true);
  assert.equal(mountStagingAdminBootstrapEndpoint(router, { env }), true);
  assert.deepEqual(router.registrations.map(({ method, path }) => ({ method, path })), [{
    method: "POST",
    path: STAGING_ADMIN_BOOTSTRAP_PATH
  }]);
  assert.equal(STAGING_ADMIN_BOOTSTRAP_PATH, "/internal/pos-licensing-staging-admin-bootstrap");
});

test("every staging guard and the explicit enable flag are mandatory", () => {
  for (const overrides of [
    { VERCEL: "" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AUTOMATEX_ENV: "production" },
    { POS_LICENSING_MODE: "production" },
    { POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_ENABLED: "false" },
    { POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_TOKEN: "" }
  ]) {
    const env = stagingEnvironment(overrides);
    const router = routerRecorder();
    assert.equal(shouldMountStagingAdminBootstrapEndpoint(env), false);
    assert.equal(mountStagingAdminBootstrapEndpoint(router, { env }), false);
    assert.equal(router.registrations.length, 0);
  }
});

test("disabled, main, and production requests fail before database access", async () => {
  let validationCalls = 0;
  for (const env of [
    stagingEnvironment({ POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_ENABLED: "false" }),
    stagingEnvironment({ VERCEL_GIT_COMMIT_REF: "main" }),
    stagingEnvironment({ VERCEL_ENV: "production", AUTOMATEX_ENV: "production", POS_LICENSING_MODE: "production" })
  ]) {
    const response = await invoke(env, `Bearer ${OPERATOR_TOKEN}`, {
      validateMongoConfig() { validationCalls += 1; }
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { message: "Not found." });
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(validationCalls, 0);
});

test("missing, wrong, and URL-only tokens are rejected before database access", async () => {
  let validationCalls = 0;
  const options = {
    validateMongoConfig() { validationCalls += 1; }
  };
  const responses = [
    await invoke(stagingEnvironment(), undefined, options),
    await invoke(stagingEnvironment(), "Bearer wrong-token", options),
    await invoke(stagingEnvironment(), undefined, {
      ...options,
      request: { query: { token: OPERATOR_TOKEN } }
    })
  ];
  responses.forEach((response) => {
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { message: "Unauthorized." });
  });
  assert.equal(validationCalls, 0);
});

test("request identity and permission fields are never accepted from the body", async () => {
  let bootstrapCalls = 0;
  const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    request: { body: { email: "attacker@example.com", permissions: ["*"] } },
    bootstrapService: { async bootstrap() { bootstrapCalls += 1; } }
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { message: "Invalid request." });
  assert.equal(bootstrapCalls, 0);
});

test("connected database name must exactly match validated staging database", async () => {
  let bootstrapCalls = 0;
  const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`, {
    connection: {
      name: "automatex_pos_staging",
      db: { databaseName: "automatex_pos_production" }
    },
    bootstrapService: { async bootstrap() { bootstrapCalls += 1; } }
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { message: "Staging administrator bootstrap is unavailable." });
  assert.equal(bootstrapCalls, 0);
});

test("first bootstrap creates exactly one fixed User and one AuditLog in a transaction", async () => {
  const harness = createPersistenceHarness();
  const result = await bootstrapService(harness).bootstrap();

  assert.deepEqual(result, {
    created: true,
    adminId: ADMIN_ID,
    role: "admin",
    status: "active",
    licencesManage: true
  });
  assert.equal(harness.users.length, 1);
  assert.equal(harness.audits.length, 1);
  assert.deepEqual({
    name: harness.users[0].name,
    email: harness.users[0].email,
    businessName: harness.users[0].businessName,
    role: harness.users[0].role,
    status: harness.users[0].status,
    isActive: harness.users[0].isActive
  }, {
    name: STAGING_ADMIN_NAME,
    email: STAGING_ADMIN_EMAIL,
    businessName: STAGING_ADMIN_BUSINESS_NAME,
    role: "admin",
    status: "active",
    isActive: true
  });
  assert.equal(harness.users[0].passwordHash, PASSWORD_HASH);
  assert.equal("permissions" in harness.users[0], false);
  assert.equal(hasPermission(harness.users[0], "licences:manage"), true);
  assert.equal(harness.audits[0].actorId, null);
  assert.equal(harness.audits[0].actorRole, "");
  assert.equal(JSON.stringify(harness.audits[0]).includes(INTERNAL_PASSWORD), false);
  assert.equal(JSON.stringify(harness.audits[0]).includes(PASSWORD_HASH), false);
  assert.deepEqual(harness.events.map((event) => event.type), [
    "start-session",
    "transaction",
    "user-created",
    "audit-created",
    "commit",
    "end-session"
  ]);
});

test("second bootstrap is idempotent and creates no additional records", async () => {
  const harness = createPersistenceHarness();
  const service = bootstrapService(harness);
  const first = await service.bootstrap();
  const second = await service.bootstrap();

  assert.equal(first.created, true);
  assert.deepEqual(second, {
    created: false,
    adminId: ADMIN_ID,
    role: "admin",
    status: "active",
    licencesManage: true
  });
  assert.equal(harness.users.length, 1);
  assert.equal(harness.audits.length, 1);
  assert.equal(harness.events.filter((event) => event.type === "user-created").length, 1);
  assert.equal(harness.events.filter((event) => event.type === "audit-created").length, 1);
});

test("a conflicting fixed email or marker fails closed without repair or writes", async () => {
  const conflicting = {
    _id: ADMIN_ID,
    name: "Unrelated User",
    email: STAGING_ADMIN_EMAIL,
    passwordHash: PASSWORD_HASH,
    role: "client",
    status: "inactive",
    isActive: false,
    businessName: "Unrelated"
  };
  const harness = createPersistenceHarness([conflicting]);
  await assert.rejects(
    bootstrapService(harness).bootstrap(),
    (error) => error.code === "staging_admin_identity_conflict"
  );
  assert.deepEqual(harness.users, [conflicting]);
  assert.equal(harness.audits.length, 0);
  assert.equal(harness.events.some((event) => event.type === "user-created"), false);
});

test("success response contains only the allowlist and no credential material", async () => {
  const response = await invoke(stagingEnvironment(), `Bearer ${OPERATOR_TOKEN}`);
  const serialized = JSON.stringify(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(Object.keys(response.body), [
    "created",
    "adminId",
    "role",
    "status",
    "licencesManage"
  ]);
  assert.deepEqual(response.body, {
    created: true,
    adminId: ADMIN_ID,
    role: "admin",
    status: "active",
    licencesManage: true
  });
  for (const sensitive of [OPERATOR_TOKEN, INTERNAL_PASSWORD, PASSWORD_HASH, "password", "hash", "secret", "jwt"]) {
    assert.equal(serialized.toLowerCase().includes(sensitive.toLowerCase()), false);
  }
});

test("bootstrap operator token is rejected from request fields and runtime logs", () => {
  assert.throws(
    () => assertNoPosLicensingServerSecretFields({
      POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_TOKEN: OPERATOR_TOKEN
    }),
    (error) => error.code === "untrusted_secret_source"
  );
  const sanitized = sanitizeSensitiveText(`bootstrap=${OPERATOR_TOKEN}`, {
    env: { POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_TOKEN: OPERATOR_TOKEN }
  });
  assert.equal(sanitized.includes(OPERATOR_TOKEN), false);
});
