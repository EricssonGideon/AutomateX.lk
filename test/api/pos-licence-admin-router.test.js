const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licence-admin-router-test-secret";

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const AuditLog = require("../../server/models/AuditLog");
const PosActivationCode = require("../../server/models/PosActivationCode");
const PosInstallation = require("../../server/models/PosInstallation");
const PosLicence = require("../../server/models/PosLicence");
const PosLicenceIssue = require("../../server/models/PosLicenceIssue");
const PosPackage = require("../../server/models/PosPackage");
const Project = require("../../server/models/Project");
const User = require("../../server/models/User");
const posLicenceAdminRouter = require("../../server/routes/posLicenceAdmin");
const {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME
} = require("../../server/middleware/auth");
const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MANDATORY_MODULE_IDS
} = require("../../server/utils/posLicenceContract");

const RUN_ROUTER_INTEGRATION = process.env.AUTOMATEX_POS_ROUTER_INTEGRATION === "1";
const TEST_DB_PREFIX = "automatex_pos_admin_api_it_";
const TEST_COLLECTIONS = [
  "users",
  "projects",
  "auditlogs",
  "pospackages",
  "poslicences",
  "posactivationcodes",
  "posinstallations",
  "poslicenceissues"
];
const MODEL_SET = [
  User,
  Project,
  AuditLog,
  PosPackage,
  PosLicence,
  PosActivationCode,
  PosInstallation,
  PosLicenceIssue
];

let mongoProcess = null;
let mongoDbPath = "";
let mongoUri = "";
let dbName = "";
let mongoStartupOutput = "";
let httpServer = null;
let baseUrl = "";
let fixtures = null;

function rootDir() {
  return path.join(__dirname, "..", "..");
}

function hasExecutable(command) {
  const result = childProcess.spawnSync(command, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function assertSafeDatabaseName(name) {
  assert.equal(name.startsWith(TEST_DB_PREFIX), true);
  assert.match(name, /^automatex_pos_admin_api_it_[a-z0-9_]+$/);
}

function assertSafeMongoTarget(uri, name) {
  assertSafeDatabaseName(name);
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, "mongodb:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, `/${name}`);
}

async function waitForMongo(uri) {
  let lastError = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (mongoProcess && mongoProcess.exitCode !== null) {
      throw new Error(`Disposable mongod exited early with code ${mongoProcess.exitCode}: ${mongoStartupOutput}`);
    }
    try {
      await mongoose.connect(uri, {
        autoCreate: false,
        autoIndex: false,
        bufferCommands: false,
        serverSelectionTimeoutMS: 500
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError || new Error("Timed out waiting for local mongod.");
}

async function startDisposableMongo() {
  if (!hasExecutable("mongod")) {
    throw new Error("Part 50 requires a local mongod executable for disposable router integration testing.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-admin-api-it-"));
  mongoUri = `mongodb://127.0.0.1:${port}/${dbName}`;
  assertSafeMongoTarget(mongoUri, dbName);

  mongoProcess = childProcess.spawn("mongod", [
    "--dbpath",
    mongoDbPath,
    "--bind_ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--quiet"
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  mongoProcess.stdout.on("data", (chunk) => {
    mongoStartupOutput += chunk.toString();
  });
  mongoProcess.stderr.on("data", (chunk) => {
    mongoStartupOutput += chunk.toString();
  });

  await waitForMongo(mongoUri);
  assert.equal(mongoose.connection.host, "127.0.0.1");
  assert.equal(mongoose.connection.name, dbName);
}

async function provisionCollectionsAndIndexes() {
  assertSafeMongoTarget(mongoUri, dbName);
  assert.equal(mongoose.connection.name, dbName);
  for (const model of MODEL_SET) {
    await model.createCollection();
    await model.createIndexes();
  }
}

async function cleanupDisposableMongo() {
  try {
    if (mongoose.connection.readyState === 1) {
      assertSafeMongoTarget(mongoUri, dbName);
      assert.equal(mongoose.connection.name, dbName);
      const existingCollections = await mongoose.connection.db.listCollections().toArray();
      const existingNames = new Set(existingCollections.map((collection) => collection.name));
      for (const collectionName of TEST_COLLECTIONS) {
        if (existingNames.has(collectionName)) {
          await mongoose.connection.db.dropCollection(collectionName);
        }
      }
    }
  } finally {
    await mongoose.disconnect().catch(() => null);
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      httpServer = null;
    }
    if (mongoProcess) {
      mongoProcess.kill("SIGTERM");
      await new Promise((resolve) => mongoProcess.once("exit", resolve));
      mongoProcess = null;
    }
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-admin-api-it-"))) {
      fs.rmSync(mongoDbPath, { recursive: true, force: true });
    }
  }
}

async function startIsolatedApp() {
  const app = express();
  app.use(express.json());
  app.use("/pos-admin", posLicenceAdminRouter);
  app.use((_req, res) => res.status(404).json({ message: "Not found" }));
  httpServer = http.createServer(app);
  const port = await getFreePort();
  await new Promise((resolve) => httpServer.listen(port, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${port}/pos-admin`;
}

async function resetCollections() {
  assertSafeMongoTarget(mongoUri, dbName);
  assert.equal(mongoose.connection.name, dbName);
  await Promise.all(MODEL_SET.map((model) => model.deleteMany({})));
  fixtures = await createFixtures();
}

async function createFixtures() {
  const admin = await User.create({
    name: "Router Admin",
    email: `admin-${Date.now()}@example.com`,
    passwordHash: "hash",
    role: "admin",
    status: "active",
    isActive: true
  });
  const manager = await User.create({
    name: "Router Manager",
    email: `manager-${Date.now()}@example.com`,
    passwordHash: "hash",
    role: "manager",
    status: "active",
    isActive: true
  });
  const staff = await User.create({
    name: "Router Staff",
    email: `staff-${Date.now()}@example.com`,
    passwordHash: "hash",
    role: "staff",
    status: "active",
    isActive: true
  });
  const employee = await User.create({
    name: "Router Employee",
    email: `employee-${Date.now()}@example.com`,
    passwordHash: "hash",
    role: "employee",
    status: "active",
    isActive: true
  });
  const client = await User.create({
    name: "Router Client",
    email: `client-${Date.now()}@example.com`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const otherClient = await User.create({
    name: "Router Other Client",
    email: `other-client-${Date.now()}@example.com`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Router POS Project",
    projectType: "POS System"
  });
  const otherProject = await Project.create({
    clientId: otherClient._id,
    projectTitle: "Other Router POS Project",
    projectType: "POS System"
  });

  return {
    admin,
    manager,
    staff,
    employee,
    client,
    otherClient,
    project,
    otherProject
  };
}

function tokenFor(user) {
  return jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "10m" });
}

function bearerHeaders(user) {
  return {
    authorization: `Bearer ${tokenFor(user)}`
  };
}

function cookieHeaders(user, csrf = "") {
  const token = tokenFor(user);
  const csrfCookie = csrf ? `; ${CSRF_COOKIE_NAME}=${csrf}` : "";
  return {
    cookie: `${AUTH_COOKIE_NAME}=${token}${csrfCookie}`,
    ...(csrf ? { "x-csrf-token": csrf } : {})
  };
}

async function request(method, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: typeof options.body === "undefined" ? undefined : JSON.stringify(options.body)
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function futureDate(days) {
  const date = new Date("2026-08-31T00:00:00.000Z");
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function packageBody(overrides = {}) {
  return {
    packageCode: `standard-router-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    name: "Router Standard Package",
    edition: POS_EDITION_STANDARD,
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"],
    ...overrides
  };
}

async function createPackage(overrides = {}) {
  return request("POST", "/packages", {
    headers: bearerHeaders(fixtures.admin),
    body: packageBody(overrides)
  });
}

async function createLicence(packageId, overrides = {}) {
  return request("POST", "/licences", {
    headers: bearerHeaders(fixtures.admin),
    body: {
      clientId: String(fixtures.client._id),
      projectId: String(fixtures.project._id),
      packageId,
      edition: POS_EDITION_STANDARD,
      entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS],
      updateChannel: "stable",
      licenceExpiry: futureDate(30),
      supportExpiry: futureDate(90),
      ...overrides
    }
  });
}

if (!RUN_ROUTER_INTEGRATION) {
  test("POS admin router integration tests require explicit disposable MongoDB opt-in", {
    skip: "Set AUTOMATEX_POS_ROUTER_INTEGRATION=1 to run these tests."
  }, () => {});
} else {
  test.before(async () => {
    await startDisposableMongo();
    await provisionCollectionsAndIndexes();
    await startIsolatedApp();
  });

  test.beforeEach(async () => {
    await resetCollections();
  });

  test.after(async () => {
    await cleanupDisposableMongo();
  });

  test("authorized admins can create, update, read, list, and check package readiness", async () => {
    const created = await createPackage({ packageCode: "standard-api-package" });
    assert.equal(created.status, 201);
    assert.equal(created.body.package.packageCode, "standard-api-package");
    assert.equal(created.body.readiness.ready, true);
    assert.equal(Object.prototype.hasOwnProperty.call(created.body.package, "createdBy"), false);

    const read = await request("GET", `/packages/${created.body.package.id}`, {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(read.status, 200);
    assert.equal(read.body.package.id, created.body.package.id);

    const listed = await request("GET", "/packages?status=draft&limit=200&page=1&moduleId=reports", {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.pagination.limit, 100);
    assert.equal(listed.body.packages.length >= 1, true);

    const updated = await request("PATCH", `/packages/${created.body.package.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: created.body.package.version,
        name: "Updated Router Package"
      }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.package.name, "Updated Router Package");
    assert.equal(updated.body.package.version, created.body.package.version + 1);

    const readiness = await request("GET", `/packages/${created.body.package.id}/readiness`, {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.readiness.ready, true);
    assert.match(readiness.body.readinessNote, /Configuration readiness only/);
  });

  test("authorized admins can create, update, read, list, and check licence readiness", async () => {
    const createdPackage = await createPackage({ packageCode: "standard-api-licence-package" });
    const createdLicence = await createLicence(createdPackage.body.package.id);
    assert.equal(createdLicence.status, 201);
    assert.equal(createdLicence.body.licence.clientId, String(fixtures.client._id));
    assert.equal(Object.prototype.hasOwnProperty.call(createdLicence.body.licence, "codeHash"), false);

    const read = await request("GET", `/licences/${createdLicence.body.licence.id}`, {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(read.status, 200);
    assert.equal(read.body.licence.id, createdLicence.body.licence.id);

    const listed = await request("GET", `/licences?clientId=${fixtures.client._id}&status=draft&limit=5`, {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.pagination.limit, 5);
    assert.equal(listed.body.licences.length, 1);

    const updated = await request("PATCH", `/licences/${createdLicence.body.licence.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: createdLicence.body.licence.version,
        notes: "Licence updated through router"
      }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.licence.notes, "Licence updated through router");

    const readiness = await request("GET", `/licences/${createdLicence.body.licence.id}/readiness`, {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.readiness.ready, false);
    assert.match(readiness.body.readinessNote, /Configuration readiness only/);
  });

  test("anonymous and non-admin callers are denied by real auth and licence permissions", async () => {
    const anonymous = await request("GET", "/packages");
    assert.equal(anonymous.status, 401);

    for (const user of [fixtures.manager, fixtures.staff, fixtures.employee, fixtures.client]) {
      const denied = await request("GET", "/packages", { headers: bearerHeaders(user) });
      assert.equal(denied.status, 403);
    }
  });

  test("forged actor and permission fields are rejected", async () => {
    const forged = await request("POST", "/packages", {
      headers: bearerHeaders(fixtures.admin),
      body: {
        ...packageBody({ packageCode: "standard-forged-api" }),
        actorRole: "admin"
      }
    });
    assert.equal(forged.status, 400);

    const permission = await request("POST", "/licences", {
      headers: bearerHeaders(fixtures.admin),
      body: {
        clientId: String(fixtures.client._id),
        permissions: ["*"]
      }
    });
    assert.equal(permission.status, 400);
  });

  test("cookie-authenticated mutations enforce CSRF while valid CSRF and bearer tokens work", async () => {
    const missingCsrf = await request("POST", "/packages", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${tokenFor(fixtures.admin)}`
      },
      body: packageBody({ packageCode: "standard-cookie-missing-csrf" })
    });
    assert.equal(missingCsrf.status, 403);

    const invalidCsrf = await request("POST", "/packages", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${tokenFor(fixtures.admin)}; ${CSRF_COOKIE_NAME}=cookie-token`,
        "x-csrf-token": "wrong-token"
      },
      body: packageBody({ packageCode: "standard-cookie-invalid-csrf" })
    });
    assert.equal(invalidCsrf.status, 403);

    const validCookie = await request("POST", "/packages", {
      headers: cookieHeaders(fixtures.admin, "csrf-ok"),
      body: packageBody({ packageCode: "standard-cookie-valid-csrf" })
    });
    assert.equal(validCookie.status, 201);

    const bearer = await request("POST", "/packages", {
      headers: bearerHeaders(fixtures.admin),
      body: packageBody({ packageCode: "standard-bearer-valid" })
    });
    assert.equal(bearer.status, 201);
  });

  test("malformed IDs, expectedVersion, and query operators are rejected", async () => {
    const badId = await request("GET", "/packages/not-an-id", {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(badId.status, 400);

    const created = await createPackage({ packageCode: "standard-bad-version-api" });
    const badVersion = await request("PATCH", `/packages/${created.body.package.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: "0",
        name: "Bad Version"
      }
    });
    assert.equal(badVersion.status, 428);

    const operator = await request("GET", "/packages?status[$ne]=draft", {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(operator.status, 400);

    const unknownFilter = await request("GET", "/licences?filter[status]=draft", {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(unknownFilter.status, 400);
  });

  test("duplicate and stale update conflicts map to HTTP conflicts", async () => {
    const first = await createPackage({ packageCode: "standard-conflict-api" });
    assert.equal(first.status, 201);

    const duplicate = await createPackage({ packageCode: "standard-conflict-api" });
    assert.equal(duplicate.status, 409);

    const updated = await request("PATCH", `/packages/${first.body.package.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: first.body.package.version,
        name: "Conflict Updated"
      }
    });
    assert.equal(updated.status, 200);

    const stale = await request("PATCH", `/packages/${first.body.package.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: first.body.package.version,
        name: "Stale Update"
      }
    });
    assert.equal(stale.status, 409);
  });

  test("non-draft and package-in-use service conflicts are preserved", async () => {
    const createdPackage = await createPackage({ packageCode: "standard-nondraft-api" });
    await PosPackage.updateOne({ _id: createdPackage.body.package.id }, { $set: { status: "active" } });

    const nonDraft = await request("PATCH", `/packages/${createdPackage.body.package.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: createdPackage.body.package.version,
        name: "No Change"
      }
    });
    assert.equal(nonDraft.status, 409);

    const packageInUse = await createPackage({ packageCode: "standard-in-use-api" });
    await PosLicence.create({
      clientId: fixtures.client._id,
      projectId: fixtures.project._id,
      packageId: packageInUse.body.package.id,
      edition: POS_EDITION_STANDARD,
      status: "active",
      entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS],
      updateChannel: "stable",
      licenceExpiry: futureDate(30)
    });

    const conflict = await request("PATCH", `/packages/${packageInUse.body.package.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: packageInUse.body.package.version,
        name: "Blocked"
      }
    });
    assert.equal(conflict.status, 409);
  });

  test("saved-with-audit-warning response is sanitized", async () => {
    const created = await createPackage({ packageCode: "standard-audit-warning-api" });
    const originalCreate = AuditLog.create;
    AuditLog.create = async () => {
      throw new Error("sensitive audit backend stack");
    };

    try {
      const response = await request("PATCH", `/packages/${created.body.package.id}`, {
        headers: bearerHeaders(fixtures.admin),
        body: {
          expectedVersion: created.body.package.version,
          name: "Saved With Audit Warning"
        }
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.package.name, "Saved With Audit Warning");
      assert.equal(response.body.audit.ok, false);
      assert.match(response.body.audit.message, /could not be confirmed/);
      assert.equal(JSON.stringify(response.body).includes("sensitive audit backend stack"), false);
    } finally {
      AuditLog.create = originalCreate;
    }
  });

  test("signing, renewal, deletion, suspension, and installation endpoints are absent", async () => {
    const paths = [
      "/renewals",
      "/licences/507f1f77bcf86cd799439011/sign",
      "/licences/507f1f77bcf86cd799439011/renew",
      "/licences/507f1f77bcf86cd799439011/installations",
      "/licences/507f1f77bcf86cd799439011/suspend"
    ];

    for (const pathName of paths) {
      const response = await request("POST", pathName, {
        headers: bearerHeaders(fixtures.admin),
        body: {}
      });
      assert.equal(response.status, 404);
    }

    const deleteResponse = await request("DELETE", "/packages/507f1f77bcf86cd799439011", {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(deleteResponse.status, 404);
  });

  test("router remains unmounted in production startup", () => {
    const startupFiles = [
      "server.js",
      "server/server.js",
      "server/routes/index.js"
    ];
    startupFiles.forEach((relativePath) => {
      const source = fs.readFileSync(path.join(rootDir(), relativePath), "utf8");
      assert.doesNotMatch(source, /posLicenceAdmin|posLicenceAdminController|posLicenceAdminService/);
    });
  });
}
