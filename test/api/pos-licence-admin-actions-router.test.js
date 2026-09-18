const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licence-admin-actions-router-test-secret";

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
const {
  isActivationCodeFormat
} = require("../../server/utils/posActivationCodeToken");

const RUN_ACTION_ROUTER_INTEGRATION = process.env.AUTOMATEX_POS_ACTION_ROUTER_INTEGRATION === "1";
const TEST_DB_PREFIX = "automatex_pos_admin_action_api_it_";
const REPLICA_SET_NAME = "rs_pos_admin_action_api";
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
let directMongoUri = "";
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
  assert.equal(typeof name, "string");
  assert.equal(name.startsWith(TEST_DB_PREFIX), true);
  assert.match(name, /^automatex_pos_admin_action_api_it_[a-z0-9_]+$/);
}

function assertSafeMongoTarget(uri, name) {
  assertSafeDatabaseName(name);
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, "mongodb:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, `/${name}`);
  assert.equal(parsed.searchParams.get("replicaSet"), REPLICA_SET_NAME);
}

async function waitForDirectConnection(uri) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (mongoProcess && mongoProcess.exitCode !== null) {
      throw new Error(`Disposable replica-set mongod exited early with code ${mongoProcess.exitCode}: ${mongoStartupOutput}`);
    }
    const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 500 });
    try {
      await connection.asPromise();
      return connection;
    } catch (error) {
      lastError = error;
      await connection.close().catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError || new Error("Timed out waiting for disposable replica-set mongod.");
}

async function initiateReplicaSet(port) {
  const connection = await waitForDirectConnection(directMongoUri);
  try {
    await connection.db.admin().command({
      replSetInitiate: {
        _id: REPLICA_SET_NAME,
        members: [{ _id: 0, host: `127.0.0.1:${port}` }]
      }
    }).catch((error) => {
      if (!/already initialized/i.test(String(error && error.message))) {
        throw error;
      }
    });

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const hello = await connection.db.admin().command({ hello: 1 });
      if (hello.isWritablePrimary) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Disposable MongoDB replica set did not become primary.");
  } finally {
    await connection.close().catch(() => null);
  }
}

async function startDisposableReplicaSet() {
  if (!hasExecutable("mongod")) {
    throw new Error("A local mongod executable is required for POS action-router transaction verification.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-admin-action-api-it-"));
  mongoUri = `mongodb://127.0.0.1:${port}/${dbName}?replicaSet=${REPLICA_SET_NAME}`;
  directMongoUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true`;
  assertSafeMongoTarget(mongoUri, dbName);

  mongoProcess = childProcess.spawn("mongod", [
    "--dbpath",
    mongoDbPath,
    "--bind_ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--replSet",
    REPLICA_SET_NAME,
    "--quiet"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  mongoProcess.stdout.on("data", (chunk) => {
    mongoStartupOutput += chunk.toString();
  });
  mongoProcess.stderr.on("data", (chunk) => {
    mongoStartupOutput += chunk.toString();
  });

  await initiateReplicaSet(port);
  await mongoose.connect(mongoUri, {
    autoCreate: false,
    autoIndex: false,
    bufferCommands: false,
    serverSelectionTimeoutMS: 1000
  });

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

async function cleanupDisposableReplicaSet() {
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
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-admin-action-api-it-"))) {
      fs.rmSync(mongoDbPath, { recursive: true, force: true });
    }
  }
}

async function startIsolatedApp() {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
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
  const stamp = `${process.pid}-${Date.now()}`;
  const admin = await User.create({
    name: "Action Router Admin",
    email: `action-admin-${stamp}@example.test`,
    passwordHash: "hash",
    role: "admin",
    status: "active",
    isActive: true
  });
  const manager = await User.create({
    name: "Action Router Manager",
    email: `action-manager-${stamp}@example.test`,
    passwordHash: "hash",
    role: "manager",
    status: "active",
    isActive: true
  });
  const staff = await User.create({
    name: "Action Router Staff",
    email: `action-staff-${stamp}@example.test`,
    passwordHash: "hash",
    role: "staff",
    status: "active",
    isActive: true
  });
  const employee = await User.create({
    name: "Action Router Employee",
    email: `action-employee-${stamp}@example.test`,
    passwordHash: "hash",
    role: "employee",
    status: "active",
    isActive: true
  });
  const client = await User.create({
    name: "Action Router Client",
    email: `action-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const posProject = await Project.create({
    clientId: client._id,
    projectTitle: "Action Router POS",
    projectType: "POS System"
  });
  const otherClient = await User.create({
    name: "Action Router Other Client",
    email: `action-other-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const otherProject = await Project.create({
    clientId: otherClient._id,
    projectTitle: "Action Router Other POS",
    projectType: "POS System"
  });

  return { admin, manager, staff, employee, client, posProject, otherClient, otherProject };
}

function tokenFor(user) {
  return jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "10m" });
}

function bearerHeaders(user) {
  return { authorization: `Bearer ${tokenFor(user)}` };
}

function cookieHeaders(user, csrf = "") {
  const csrfCookie = csrf ? `; ${CSRF_COOKIE_NAME}=${csrf}` : "";
  return {
    cookie: `${AUTH_COOKIE_NAME}=${tokenFor(user)}${csrfCookie}`,
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
  return { status: response.status, body, headers: response.headers };
}

function futureDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function packageBody(overrides = {}) {
  return {
    packageCode: `standard-action-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    name: "Action Router Standard Package",
    edition: POS_EDITION_STANDARD,
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"],
    ...overrides
  };
}

async function createDraftPackage(overrides = {}) {
  return request("POST", "/packages", {
    headers: bearerHeaders(fixtures.admin),
    body: packageBody(overrides)
  });
}

async function publishPackage(packageId, expectedVersion, overrides = {}) {
  return request("POST", `/packages/${packageId}/publish`, {
    headers: bearerHeaders(fixtures.admin),
    body: {
      expectedVersion,
      reason: "Router action test publication",
      ...overrides
    }
  });
}

async function createDraftLicence(packageId, overrides = {}) {
  return request("POST", "/licences", {
    headers: bearerHeaders(fixtures.admin),
    body: {
      clientId: String(fixtures.client._id),
      projectId: String(fixtures.posProject._id),
      packageId,
      edition: POS_EDITION_STANDARD,
      entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
      updateChannel: "stable",
      licenceExpiry: futureDate(60),
      supportExpiry: futureDate(90),
      ...overrides
    }
  });
}

async function approveLicence(licenceId, expectedVersion, overrides = {}) {
  return request("POST", `/licences/${licenceId}/approve`, {
    headers: bearerHeaders(fixtures.admin),
    body: {
      expectedVersion,
      reason: "Router action test approval",
      ...overrides
    }
  });
}

async function createApprovedLicence() {
  const draftPackage = await createDraftPackage();
  assert.equal(draftPackage.status, 201);
  const publishedPackage = await publishPackage(draftPackage.body.package.id, draftPackage.body.package.version);
  assert.equal(publishedPackage.status, 200);
  const draftLicence = await createDraftLicence(publishedPackage.body.package.id);
  assert.equal(draftLicence.status, 201);
  const approvedLicence = await approveLicence(draftLicence.body.licence.id, draftLicence.body.licence.version);
  assert.equal(approvedLicence.status, 200);
  return { package: publishedPackage.body.package, licence: approvedLicence.body.licence };
}

function assertNoSecretFields(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes("codeHash"), false);
  assert.equal(text.includes("sha256:"), false);
  assert.equal(text.includes("digest"), false);
}

if (!RUN_ACTION_ROUTER_INTEGRATION) {
  test("POS action-router integration tests require explicit disposable replica-set opt-in", {
    skip: "Set AUTOMATEX_POS_ACTION_ROUTER_INTEGRATION=1 to run these isolated router transaction tests."
  }, () => {});
} else {
  test.before(async () => {
    await startDisposableReplicaSet();
    await provisionCollectionsAndIndexes();
    await startIsolatedApp();
  });

  test.beforeEach(async () => {
    await resetCollections();
  });

  test.after(async () => {
    await cleanupDisposableReplicaSet();
  });

  test("publishes packages, approves licences, issues metadata-only lists, and revokes unused codes", async () => {
    const draftPackage = await createDraftPackage({ packageCode: "standard-action-workflow" });
    assert.equal(draftPackage.status, 201);

    const publishedPackage = await publishPackage(draftPackage.body.package.id, draftPackage.body.package.version);
    assert.equal(publishedPackage.status, 200);
    assert.match(publishedPackage.headers.get("cache-control") || "", /no-store/);
    assert.equal(publishedPackage.body.package.status, "active");
    assert.equal(publishedPackage.body.package.version, draftPackage.body.package.version + 1);

    const editPublishedPackage = await request("PATCH", `/packages/${publishedPackage.body.package.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: publishedPackage.body.package.version,
        name: "No published edit"
      }
    });
    assert.equal(editPublishedPackage.status, 409);

    const draftLicence = await createDraftLicence(publishedPackage.body.package.id);
    assert.equal(draftLicence.status, 201);
    const approvedLicence = await approveLicence(draftLicence.body.licence.id, draftLicence.body.licence.version);
    assert.equal(approvedLicence.status, 200);
    assert.match(approvedLicence.headers.get("cache-control") || "", /no-store/);
    assert.equal(approvedLicence.body.licence.status, "active");
    assert.equal(approvedLicence.body.licence.version, draftLicence.body.licence.version + 1);

    const editApprovedLicence = await request("PATCH", `/licences/${approvedLicence.body.licence.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: approvedLicence.body.licence.version,
        notes: "No approved edit"
      }
    });
    assert.equal(editApprovedLicence.status, 409);

    const issued = await request("POST", `/licences/${approvedLicence.body.licence.id}/activation-codes`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expiresAt: futureDate(10),
        maxRedemptions: 1
      }
    });
    assert.equal(issued.status, 201);
    assert.match(issued.headers.get("cache-control") || "", /no-store/);
    assert.equal(isActivationCodeFormat(issued.body.activationCode), true);
    assertNoSecretFields(issued.body.activationCodeMetadata);
    assert.equal(JSON.stringify(issued.body.activationCodeMetadata).includes(issued.body.activationCode), false);

    const storedWithoutHash = await PosActivationCode.findById(issued.body.activationCodeMetadata.id).lean();
    assert.equal(Object.prototype.hasOwnProperty.call(storedWithoutHash, "codeHash"), false);
    assert.equal(storedWithoutHash.status, "active");

    const issueAudits = await AuditLog.find({ action: "licences.activation-code.issue" }).lean();
    assert.equal(issueAudits.length, 1);
    assert.equal(JSON.stringify(issueAudits).includes(issued.body.activationCode), false);
    assertNoSecretFields(issueAudits);

    const list = await request("GET", `/licences/${approvedLicence.body.licence.id}/activation-codes`, {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(list.status, 200);
    assert.match(list.headers.get("cache-control") || "", /no-store/);
    assert.equal(list.body.activationCodes.length, 1);
    assertNoSecretFields(list.body);
    assert.equal(JSON.stringify(list.body).includes(issued.body.activationCode), false);

    const revoked = await request("POST", `/activation-codes/${issued.body.activationCodeMetadata.id}/revoke-unused`, {
      headers: bearerHeaders(fixtures.admin),
      body: {}
    });
    assert.equal(revoked.status, 200);
    assert.match(revoked.headers.get("cache-control") || "", /no-store/);
    assert.equal(revoked.body.activationCodeMetadata.status, "revoked");
    assertNoSecretFields(revoked.body);

    const secondRevoke = await request("POST", `/activation-codes/${issued.body.activationCodeMetadata.id}/revoke-unused`, {
      headers: bearerHeaders(fixtures.admin),
      body: {}
    });
    assert.equal(secondRevoke.status, 409);
  });

  test("approval and activation-code issuance reject ineligible state and invalid policy input", async () => {
    const draftPackage = await createDraftPackage({ packageCode: "standard-action-unpublished" });
    assert.equal(draftPackage.status, 201);
    const draftLicence = await createDraftLicence(draftPackage.body.package.id);
    assert.equal(draftLicence.status, 201);

    const approvalAgainstDraftPackage = await approveLicence(draftLicence.body.licence.id, draftLicence.body.licence.version);
    assert.equal(approvalAgainstDraftPackage.status, 400);
    assert.match(JSON.stringify(approvalAgainstDraftPackage.body), /published active package/);

    const publishedPackage = await publishPackage(draftPackage.body.package.id, draftPackage.body.package.version);
    assert.equal(publishedPackage.status, 200);
    const draftOnlyLicence = await createDraftLicence(publishedPackage.body.package.id);
    assert.equal(draftOnlyLicence.status, 201);

    const issueAgainstDraft = await request("POST", `/licences/${draftOnlyLicence.body.licence.id}/activation-codes`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expiresAt: futureDate(10),
        maxRedemptions: 1
      }
    });
    assert.equal(issueAgainstDraft.status, 409);

    const approved = await approveLicence(draftOnlyLicence.body.licence.id, draftOnlyLicence.body.licence.version);
    assert.equal(approved.status, 200);

    const missingExpiry = await request("POST", `/licences/${approved.body.licence.id}/activation-codes`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        maxRedemptions: 1
      }
    });
    assert.equal(missingExpiry.status, 400);

    const beyondLicenceExpiry = await request("POST", `/licences/${approved.body.licence.id}/activation-codes`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expiresAt: futureDate(100),
        maxRedemptions: 1
      }
    });
    assert.equal(beyondLicenceExpiry.status, 400);

    const invalidRedemptionLimit = await request("POST", `/licences/${approved.body.licence.id}/activation-codes`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expiresAt: futureDate(10),
        maxRedemptions: 0
      }
    });
    assert.equal(invalidRedemptionLimit.status, 400);
  });

  test("anonymous, non-admin and cookie callers must pass real auth, permission, and CSRF checks", async () => {
    const anonymous = await request("POST", "/packages/507f1f77bcf86cd799439011/publish", {
      body: { expectedVersion: 0 }
    });
    assert.equal(anonymous.status, 401);

    for (const user of [fixtures.manager, fixtures.staff, fixtures.employee, fixtures.client]) {
      const denied = await request("POST", "/packages/507f1f77bcf86cd799439011/publish", {
        headers: bearerHeaders(user),
        body: { expectedVersion: 0 }
      });
      assert.equal(denied.status, 403);
    }

    const missingCsrf = await request("POST", "/packages/507f1f77bcf86cd799439011/publish", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${tokenFor(fixtures.admin)}`
      },
      body: { expectedVersion: 0 }
    });
    assert.equal(missingCsrf.status, 403);

    const invalidCsrf = await request("POST", "/packages/507f1f77bcf86cd799439011/publish", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${tokenFor(fixtures.admin)}; ${CSRF_COOKIE_NAME}=cookie-token`,
        "x-csrf-token": "wrong-token"
      },
      body: { expectedVersion: 0 }
    });
    assert.equal(invalidCsrf.status, 403);

    const cookiePackage = await createDraftPackage({ packageCode: "standard-action-cookie" });
    const validCookie = await request("POST", `/packages/${cookiePackage.body.package.id}/publish`, {
      headers: cookieHeaders(fixtures.admin, "csrf-ok"),
      body: { expectedVersion: cookiePackage.body.package.version }
    });
    assert.equal(validCookie.status, 200);
  });

  test("request allowlists reject forged fields, malformed IDs, operators, and stale versions", async () => {
    const forgedPublish = await request("POST", "/packages/507f1f77bcf86cd799439011/publish", {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: 0,
        actorRole: "admin"
      }
    });
    assert.equal(forgedPublish.status, 400);

    const badId = await request("POST", "/packages/not-an-id/publish", {
      headers: bearerHeaders(fixtures.admin),
      body: { expectedVersion: 0 }
    });
    assert.equal(badId.status, 400);

    const badVersion = await request("POST", "/packages/507f1f77bcf86cd799439011/publish", {
      headers: bearerHeaders(fixtures.admin),
      body: { expectedVersion: "0" }
    });
    assert.equal(badVersion.status, 428);

    const draftPackage = await createDraftPackage({ packageCode: "standard-action-stale" });
    assert.equal(draftPackage.status, 201);
    const updated = await request("PATCH", `/packages/${draftPackage.body.package.id}`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expectedVersion: draftPackage.body.package.version,
        name: "Stale before publish"
      }
    });
    assert.equal(updated.status, 200);
    const stalePublish = await publishPackage(draftPackage.body.package.id, draftPackage.body.package.version);
    assert.equal(stalePublish.status, 409);

    const { licence } = await createApprovedLicence();
    const forgedIssue = await request("POST", `/licences/${licence.id}/activation-codes`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expiresAt: futureDate(10),
        maxRedemptions: 1,
        code: "caller supplied code"
      }
    });
    assert.equal(forgedIssue.status, 400);

    const operator = await request("GET", `/licences/${licence.id}/activation-codes?status[$ne]=active`, {
      headers: bearerHeaders(fixtures.admin)
    });
    assert.equal(operator.status, 400);
  });

  test("revocation rejects already redeemed codes", async () => {
    const { licence } = await createApprovedLicence();
    const issued = await request("POST", `/licences/${licence.id}/activation-codes`, {
      headers: bearerHeaders(fixtures.admin),
      body: {
        expiresAt: futureDate(10),
        maxRedemptions: 1
      }
    });
    assert.equal(issued.status, 201);

    await PosActivationCode.updateOne(
      { _id: issued.body.activationCodeMetadata.id },
      { $set: { status: "redeemed", redeemedCount: 1, lastRedeemedAt: new Date() } }
    );

    const revokeRedeemed = await request("POST", `/activation-codes/${issued.body.activationCodeMetadata.id}/revoke-unused`, {
      headers: bearerHeaders(fixtures.admin),
      body: {}
    });
    assert.equal(revokeRedeemed.status, 409);
    assert.match(revokeRedeemed.body.message, /Redeemed/);
  });

  test("router remains unmounted from production startup and does not expose POS runtime controls", async () => {
    const startupFiles = [
      "server.js",
      "server/server.js",
      "server/routes/index.js"
    ];
    startupFiles.forEach((relativePath) => {
      const source = fs.readFileSync(path.join(rootDir(), relativePath), "utf8");
      assert.doesNotMatch(source, /posLicenceAdmin|posLicenceAdminController|posLicenceAdminService|posActivationCodeAdminService|posLicenceLifecycleService/);
    });

    for (const pathName of [
      "/licences/507f1f77bcf86cd799439011/sign",
      "/licences/507f1f77bcf86cd799439011/renew",
      "/licences/507f1f77bcf86cd799439011/installations",
      "/activation-codes/507f1f77bcf86cd799439011/redeem"
    ]) {
      const response = await request("POST", pathName, {
        headers: bearerHeaders(fixtures.admin),
        body: {}
      });
      assert.equal(response.status, 404);
    }
  });

  test("scoped in-memory action rate limiter rejects excessive local action attempts", async () => {
    let limited = false;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const response = await request("POST", "/packages/not-an-id/publish", {
        headers: bearerHeaders(fixtures.admin),
        body: { expectedVersion: 0 }
      });
      if (response.status === 429) {
        limited = true;
        assert.match(response.body.message, /Too many POS licensing administration actions/);
        break;
      }
    }
    assert.equal(limited, true);
  });
}
