const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licence-lifecycle-transaction-test-secret";

const AuditLog = require("../../server/models/AuditLog");
const PosActivationCode = require("../../server/models/PosActivationCode");
const PosInstallation = require("../../server/models/PosInstallation");
const PosLicence = require("../../server/models/PosLicence");
const PosLicenceIssue = require("../../server/models/PosLicenceIssue");
const PosPackage = require("../../server/models/PosPackage");
const Project = require("../../server/models/Project");
const User = require("../../server/models/User");
const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MANDATORY_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  createPosActivationCodeAdminService
} = require("../../server/services/posActivationCodeAdminService");
const {
  createPosLicenceAdminService
} = require("../../server/services/posLicenceAdminService");
const {
  createPosLicenceLifecycleService
} = require("../../server/services/posLicenceLifecycleService");

const RUN_TRANSACTION_INTEGRATION = process.env.AUTOMATEX_POS_LIFECYCLE_TX === "1";
const TEST_DB_PREFIX = "automatex_pos_lifecycle_tx_";
const REPLICA_SET_NAME = "rs_pos_lifecycle_tx";
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
const ADMIN = {
  id: new mongoose.Types.ObjectId().toString(),
  name: "Lifecycle Tx Admin",
  email: "lifecycle-admin@example.com",
  role: "admin"
};
const MANAGER = {
  id: new mongoose.Types.ObjectId().toString(),
  name: "Lifecycle Manager",
  email: "manager@example.com",
  role: "manager"
};

let mongoProcess = null;
let mongoDbPath = "";
let mongoUri = "";
let directMongoUri = "";
let dbName = "";
let mongoStartupOutput = "";
let adminService = null;
let lifecycleService = null;
let activationCodeService = null;
let fixtures = null;

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
  assert.match(name, /^automatex_pos_lifecycle_tx_[a-z0-9_]+$/);
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
    throw new Error("A local mongod executable is required for lifecycle transaction verification.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-lifecycle-tx-"));
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
    if (mongoProcess) {
      mongoProcess.kill("SIGTERM");
      await new Promise((resolve) => mongoProcess.once("exit", resolve));
      mongoProcess = null;
    }
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-lifecycle-tx-"))) {
      fs.rmSync(mongoDbPath, { recursive: true, force: true });
    }
  }
}

function futureDate(days) {
  const date = new Date("2026-08-31T00:00:00.000Z");
  date.setDate(date.getDate() + days);
  return date;
}

async function resetCollections() {
  assertSafeMongoTarget(mongoUri, dbName);
  assert.equal(mongoose.connection.name, dbName);
  await Promise.all(MODEL_SET.map((model) => model.deleteMany({})));
  fixtures = await createFixtures();
  adminService = createPosLicenceAdminService();
  lifecycleService = createPosLicenceLifecycleService({
    clock: () => new Date("2026-08-31T00:00:00.000Z")
  });
  activationCodeService = createPosActivationCodeAdminService({
    clock: () => new Date("2026-08-31T00:00:00.000Z")
  });
}

async function createFixtures() {
  const client = await User.create({
    name: "Lifecycle Client",
    email: `lifecycle-client-${Date.now()}@example.com`,
    passwordHash: "test-password-hash",
    role: "client",
    status: "active",
    isActive: true,
    paymentStatus: "overdue"
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Lifecycle POS",
    projectType: "POS System"
  });
  const otherClient = await User.create({
    name: "Other Lifecycle Client",
    email: `other-lifecycle-client-${Date.now()}@example.com`,
    passwordHash: "test-password-hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const otherProject = await Project.create({
    clientId: otherClient._id,
    projectTitle: "Other Lifecycle POS",
    projectType: "POS System"
  });

  return {
    client,
    otherClient,
    otherProject,
    project
  };
}

async function createDraftPackage(overrides = {}) {
  return adminService.createDraftPackage(ADMIN, {
    packageCode: `standard-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    name: "Lifecycle Standard",
    edition: POS_EDITION_STANDARD,
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"],
    ...overrides
  });
}

async function createApprovedPackage(overrides = {}) {
  const draft = await createDraftPackage(overrides);
  return lifecycleService.publishDraftPackage(ADMIN, draft.package.id, { expectedVersion: draft.package.version });
}

async function createDraftLicence(packageId, overrides = {}) {
  return adminService.createDraftLicence(ADMIN, {
    clientId: String(fixtures.client._id),
    projectId: String(fixtures.project._id),
    packageId,
    edition: POS_EDITION_STANDARD,
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: futureDate(90),
    supportExpiry: futureDate(-5),
    ...overrides
  });
}

function assertServiceError(error, code) {
  assert.equal(error && error.code, code);
  return true;
}

if (!RUN_TRANSACTION_INTEGRATION) {
  test("POS lifecycle transaction tests require explicit disposable replica-set opt-in", {
    skip: "Set AUTOMATEX_POS_LIFECYCLE_TX=1 to run these isolated MongoDB transaction tests."
  }, () => {});
} else {
  test.before(async () => {
    await startDisposableReplicaSet();
    await provisionCollectionsAndIndexes();
  });

  test.beforeEach(async () => {
    await resetCollections();
  });

  test.after(async () => {
    await cleanupDisposableReplicaSet();
  });

  test("uses a guarded disposable local replica set and explicit POS indexes", async () => {
    assertSafeMongoTarget(mongoUri, dbName);
    assert.equal(mongoose.connection.name, dbName);
    const packageIndexes = await PosPackage.collection.indexes();
    const licenceIndexes = await PosLicence.collection.indexes();
    assert.equal(packageIndexes.some((index) => index.name === "packageCode_1" && index.unique === true), true);
    assert.equal(licenceIndexes.some((index) => index.name === "clientId_1_status_1"), true);
    assert.equal(PosPackage.schema.options.autoCreate, false);
    assert.equal(PosLicence.schema.options.autoIndex, false);
  });

  test("unauthorized callers are denied before protected access", async () => {
    const draftPackage = await createDraftPackage();
    await assert.rejects(
      () => lifecycleService.publishDraftPackage(MANAGER, draftPackage.package.id, { expectedVersion: draftPackage.package.version }),
      (error) => assertServiceError(error, "forbidden")
    );
  });

  test("incomplete draft publication and approval are rejected", async () => {
    const incompletePackage = await createDraftPackage({ packageCode: "standard-incomplete-tx", moduleIds: [], updateChannels: [] });
    await assert.rejects(
      () => lifecycleService.publishDraftPackage(ADMIN, incompletePackage.package.id, { expectedVersion: incompletePackage.package.version }),
      (error) => assertServiceError(error, "validation_failed")
    );
    assert.equal((await PosPackage.findById(incompletePackage.package.id).lean()).status, "draft");

    const unpublishedPackage = await createDraftPackage({ packageCode: "standard-unpublished-tx" });
    const licence = await createDraftLicence(unpublishedPackage.package.id);
    await assert.rejects(
      () => lifecycleService.approveDraftLicence(ADMIN, licence.licence.id, { expectedVersion: licence.licence.version }),
      (error) => assertServiceError(error, "validation_failed")
    );
    assert.equal((await PosLicence.findById(licence.licence.id).lean()).status, "draft");
  });

  test("successful package publication and licence approval update only lifecycle state", async () => {
    const published = await createApprovedPackage({ packageCode: "standard-publish-success-tx" });
    assert.equal(published.package.status, "active");
    assert.equal(published.package.version, 1);

    const licence = await createDraftLicence(published.package.id);
    const approved = await lifecycleService.approveDraftLicence(ADMIN, licence.licence.id, {
      expectedVersion: licence.licence.version,
      reason: "Reviewed for administrative approval"
    });
    assert.equal(approved.licence.status, "active");
    assert.equal(approved.licence.version, 1);
    assert.equal(new Date(approved.licence.supportExpiry).getTime(), futureDate(-5).getTime());

    const client = await User.findById(fixtures.client._id).lean();
    assert.equal(client.paymentStatus, "overdue");
    assert.equal(await PosActivationCode.countDocuments({}), 0);
    assert.equal(await PosInstallation.countDocuments({}), 0);
    assert.equal(await PosLicenceIssue.countDocuments({}), 0);
    assert.equal(await AuditLog.countDocuments({ action: "licences.package.publish" }), 1);
    assert.equal(await AuditLog.countDocuments({ action: "licences.licence.approve" }), 1);
  });

  test("stale lifecycle versions are rejected", async () => {
    const draftPackage = await createDraftPackage({ packageCode: "standard-stale-publish-tx" });
    await assert.rejects(
      () => lifecycleService.publishDraftPackage(ADMIN, draftPackage.package.id, { expectedVersion: draftPackage.package.version + 1 }),
      (error) => assertServiceError(error, "stale_update")
    );

    const published = await createApprovedPackage({ packageCode: "standard-stale-approve-tx" });
    const licence = await createDraftLicence(published.package.id);
    await assert.rejects(
      () => lifecycleService.approveDraftLicence(ADMIN, licence.licence.id, { expectedVersion: licence.licence.version + 1 }),
      (error) => assertServiceError(error, "stale_update")
    );
  });

  test("concurrent publish and approve attempts allow only one transition", async () => {
    const draftPackage = await createDraftPackage({ packageCode: "standard-concurrent-publish-tx" });
    const publishAttempts = await Promise.allSettled([
      lifecycleService.publishDraftPackage(ADMIN, draftPackage.package.id, { expectedVersion: draftPackage.package.version }),
      lifecycleService.publishDraftPackage(ADMIN, draftPackage.package.id, { expectedVersion: draftPackage.package.version })
    ]);
    assert.equal(publishAttempts.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await PosPackage.findById(draftPackage.package.id).lean()).__v, 1);
    assert.equal(await AuditLog.countDocuments({ action: "licences.package.publish", targetId: draftPackage.package.id }), 1);

    const published = await createApprovedPackage({ packageCode: "standard-concurrent-approve-tx" });
    const licence = await createDraftLicence(published.package.id);
    const approveAttempts = await Promise.allSettled([
      lifecycleService.approveDraftLicence(ADMIN, licence.licence.id, { expectedVersion: licence.licence.version }),
      lifecycleService.approveDraftLicence(ADMIN, licence.licence.id, { expectedVersion: licence.licence.version })
    ]);
    assert.equal(approveAttempts.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await PosLicence.findById(licence.licence.id).lean()).__v, 1);
    assert.equal(await AuditLog.countDocuments({ action: "licences.licence.approve", targetId: licence.licence.id }), 1);
  });

  test("concurrent publish/edit and approve/edit do not silently overwrite", async () => {
    const draftPackage = await createDraftPackage({ packageCode: "standard-publish-edit-tx" });
    const publishEdit = await Promise.allSettled([
      lifecycleService.publishDraftPackage(ADMIN, draftPackage.package.id, { expectedVersion: draftPackage.package.version }),
      adminService.updateDraftPackage(ADMIN, draftPackage.package.id, { name: "Edited During Publish" }, { expectedVersion: draftPackage.package.version })
    ]);
    assert.equal(publishEdit.filter((result) => result.status === "fulfilled").length, 1);
    const packageAfter = await PosPackage.findById(draftPackage.package.id).lean();
    assert.equal(packageAfter.__v, 1);
    if (packageAfter.status === "active") {
      assert.equal(packageAfter.name, "Lifecycle Standard");
    } else {
      assert.equal(packageAfter.status, "draft");
      assert.equal(packageAfter.name, "Edited During Publish");
    }

    const published = await createApprovedPackage({ packageCode: "standard-approve-edit-tx" });
    const licence = await createDraftLicence(published.package.id);
    const approveEdit = await Promise.allSettled([
      lifecycleService.approveDraftLicence(ADMIN, licence.licence.id, { expectedVersion: licence.licence.version }),
      adminService.updateDraftLicence(ADMIN, licence.licence.id, { notes: "Edited During Approval" }, { expectedVersion: licence.licence.version })
    ]);
    assert.equal(approveEdit.filter((result) => result.status === "fulfilled").length, 1);
    const licenceAfter = await PosLicence.findById(licence.licence.id).lean();
    assert.equal(licenceAfter.__v, 1);
    if (licenceAfter.status === "active") {
      assert.equal(licenceAfter.notes, "");
    } else {
      assert.equal(licenceAfter.status, "draft");
      assert.equal(licenceAfter.notes, "Edited During Approval");
    }
  });

  test("published packages are immutable through existing draft services", async () => {
    const published = await createApprovedPackage({ packageCode: "standard-immutable-tx" });
    await assert.rejects(
      () => adminService.updateDraftPackage(ADMIN, published.package.id, { name: "No Edit" }, { expectedVersion: published.package.version }),
      (error) => assertServiceError(error, "not_draft")
    );
    assert.equal((await PosPackage.findById(published.package.id).lean()).name, "Lifecycle Standard");
  });

  test("audit failure rolls back publication and approval", async () => {
    const failingLifecycleService = createPosLicenceLifecycleService({
      auditLogger: {
        async create() {
          throw new Error("audit unavailable");
        }
      },
      clock: () => new Date("2026-08-31T00:00:00.000Z")
    });
    const draftPackage = await createDraftPackage({ packageCode: "standard-audit-rollback-tx" });
    await assert.rejects(
      () => failingLifecycleService.publishDraftPackage(ADMIN, draftPackage.package.id, { expectedVersion: draftPackage.package.version }),
      (error) => assertServiceError(error, "transaction_failed")
    );
    assert.equal((await PosPackage.findById(draftPackage.package.id).lean()).status, "draft");
    assert.equal(await AuditLog.countDocuments({ action: "licences.package.publish", targetId: draftPackage.package.id }), 0);

    const published = await createApprovedPackage({ packageCode: "standard-approval-audit-rollback-tx" });
    const licence = await createDraftLicence(published.package.id);
    await assert.rejects(
      () => failingLifecycleService.approveDraftLicence(ADMIN, licence.licence.id, { expectedVersion: licence.licence.version }),
      (error) => assertServiceError(error, "transaction_failed")
    );
    assert.equal((await PosLicence.findById(licence.licence.id).lean()).status, "draft");
    assert.equal(await AuditLog.countDocuments({ action: "licences.licence.approve", targetId: licence.licence.id }), 0);
  });

  test("activation-code issuance works only after approved licence and published package", async () => {
    const published = await createApprovedPackage({ packageCode: "standard-activation-after-approval-tx" });
    const licence = await createDraftLicence(published.package.id);
    await assert.rejects(
      () => activationCodeService.issueActivationCode(ADMIN, licence.licence.id, { expiresAt: futureDate(10), maxRedemptions: 1 }),
      (error) => assertServiceError(error, "licence_not_eligible")
    );

    const approved = await lifecycleService.approveDraftLicence(ADMIN, licence.licence.id, { expectedVersion: licence.licence.version });
    const issued = await activationCodeService.issueActivationCode(ADMIN, approved.licence.id, {
      expiresAt: futureDate(10),
      maxRedemptions: 1
    });
    assert.ok(issued.activationCode);
    assert.equal((await PosActivationCode.countDocuments({ licenceId: approved.licence.id })), 1);
  });
}
