const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-activation-code-transaction-test-secret";

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
  digestActivationCode,
  isActivationCodeFormat
} = require("../../server/utils/posActivationCodeToken");
const {
  createPosActivationCodeAdminService
} = require("../../server/services/posActivationCodeAdminService");

const RUN_TRANSACTION_INTEGRATION = process.env.AUTOMATEX_POS_ACTIVATION_CODE_TX === "1";
const TEST_DB_PREFIX = "automatex_pos_activation_code_tx_";
const REPLICA_SET_NAME = "rs_pos_activation_code_tx";
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
  name: "Activation Code Tx Admin",
  email: "activation-code-admin@example.com",
  role: "admin"
};

let mongoProcess = null;
let mongoDbPath = "";
let mongoUri = "";
let directMongoUri = "";
let dbName = "";
let mongoStartupOutput = "";
let service = null;
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
  assert.match(name, /^automatex_pos_activation_code_tx_[a-z0-9_]+$/);
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
    const connection = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 500
    });
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
    throw new Error("A local mongod executable is required for activation-code transaction verification.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-activation-code-tx-"));
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
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-activation-code-tx-"))) {
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
  service = createPosActivationCodeAdminService({
    clock: () => new Date("2026-08-31T00:00:00.000Z")
  });
}

async function createFixtures() {
  const client = await User.create({
    name: "Activation Code Client",
    email: `activation-client-${Date.now()}@example.com`,
    passwordHash: "test-password-hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Activation Code POS",
    projectType: "POS System"
  });
  const posPackage = await PosPackage.create({
    packageCode: `standard-active-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    name: "Active Standard Package",
    edition: POS_EDITION_STANDARD,
    status: "active",
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"]
  });
  const activeLicence = await PosLicence.create({
    clientId: client._id,
    projectId: project._id,
    packageId: posPackage._id,
    edition: POS_EDITION_STANDARD,
    status: "active",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: futureDate(90),
    supportExpiry: futureDate(120)
  });
  const draftLicence = await PosLicence.create({
    clientId: client._id,
    projectId: project._id,
    packageId: posPackage._id,
    edition: POS_EDITION_STANDARD,
    status: "draft",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS],
    updateChannel: "stable",
    licenceExpiry: futureDate(90)
  });

  return {
    activeLicence,
    client,
    draftLicence,
    posPackage,
    project
  };
}

function assertServiceError(error, code) {
  assert.equal(error && error.code, code);
  return true;
}

if (!RUN_TRANSACTION_INTEGRATION) {
  test("POS activation-code transaction tests require explicit disposable replica-set opt-in", {
    skip: "Set AUTOMATEX_POS_ACTIVATION_CODE_TX=1 to run these isolated MongoDB transaction tests."
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

  test("uses a guarded disposable local replica set and explicitly provisioned indexes", async () => {
    assertSafeMongoTarget(mongoUri, dbName);
    assert.equal(mongoose.connection.name, dbName);
    const activationCodeIndexes = await PosActivationCode.collection.indexes();
    assert.equal(activationCodeIndexes.some((index) => index.name === "codeHash_1" && index.unique === true), true);
    assert.equal(PosActivationCode.schema.options.autoCreate, false);
    assert.equal(PosActivationCode.schema.options.autoIndex, false);
  });

  test("real transaction failure leaves neither activation code nor issuance audit committed", async () => {
    const failingService = createPosActivationCodeAdminService({
      auditLogger: {
        async create() {
          throw new Error("audit backend unavailable");
        }
      },
      clock: () => new Date("2026-08-31T00:00:00.000Z")
    });

    await assert.rejects(
      () => failingService.issueActivationCode(ADMIN, String(fixtures.activeLicence._id), {
        expiresAt: futureDate(10),
        maxRedemptions: 1
      }),
      (error) => assertServiceError(error, "transaction_failed")
    );

    assert.equal(await PosActivationCode.countDocuments({ licenceId: fixtures.activeLicence._id }), 0);
    assert.equal(await AuditLog.countDocuments({ action: "licences.activation-code.issue" }), 0);
  });

  test("successful issuance commits digest-only code metadata and sanitized audit", async () => {
    const result = await service.issueActivationCode(ADMIN, String(fixtures.activeLicence._id), {
      expiresAt: futureDate(10),
      maxRedemptions: 1
    });

    assert.equal(isActivationCodeFormat(result.activationCode), true);
    assert.equal(Object.prototype.hasOwnProperty.call(result.activationCodeMetadata, "codeHash"), false);

    const ordinary = await PosActivationCode.findById(result.activationCodeMetadata.id).lean();
    assert.equal(Object.prototype.hasOwnProperty.call(ordinary, "codeHash"), false);
    const stored = await PosActivationCode.findById(result.activationCodeMetadata.id).select("+codeHash").lean();
    assert.equal(stored.codeHash, digestActivationCode(result.activationCode));
    assert.equal(Object.prototype.hasOwnProperty.call(stored, "activationCode"), false);

    const audit = await AuditLog.findOne({ action: "licences.activation-code.issue" }).lean();
    assert.ok(audit);
    assert.equal(JSON.stringify(audit).includes(result.activationCode), false);
    assert.equal(JSON.stringify(audit).includes(stored.codeHash), false);

    const listed = await service.listActivationCodes(ADMIN, { filters: { licenceId: String(fixtures.activeLicence._id) } });
    assert.equal(listed.activationCodes.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(listed.activationCodes[0], "codeHash"), false);
    assert.equal(JSON.stringify(listed).includes(result.activationCode), false);
    assert.equal(JSON.stringify(listed).includes(stored.codeHash), false);
  });

  test("draft licences and explicit policy violations are rejected without creating codes", async () => {
    await assert.rejects(
      () => service.issueActivationCode(ADMIN, String(fixtures.draftLicence._id), {
        expiresAt: futureDate(10),
        maxRedemptions: 1
      }),
      (error) => assertServiceError(error, "licence_not_eligible")
    );
    await assert.rejects(
      () => service.issueActivationCode(ADMIN, String(fixtures.activeLicence._id), {
        expiresAt: futureDate(120),
        maxRedemptions: 1
      }),
      (error) => assertServiceError(error, "validation_failed")
    );
    await assert.rejects(
      () => service.issueActivationCode(ADMIN, String(fixtures.activeLicence._id), {
        expiresAt: futureDate(10),
        maxRedemptions: 1,
        codeHash: "caller-hash"
      }),
      (error) => assertServiceError(error, "protected_field")
    );
    assert.equal(await PosActivationCode.countDocuments({}), 0);
  });

  test("unused activation-code revocation is conditional and redeemed codes are protected", async () => {
    const issued = await service.issueActivationCode(ADMIN, String(fixtures.activeLicence._id), {
      expiresAt: futureDate(10),
      maxRedemptions: 1
    });
    const revoked = await service.revokeUnusedActivationCode(ADMIN, issued.activationCodeMetadata.id);
    assert.equal(revoked.activationCodeMetadata.status, "revoked");

    await assert.rejects(
      () => service.revokeUnusedActivationCode(ADMIN, issued.activationCodeMetadata.id),
      (error) => assertServiceError(error, "already_revoked")
    );

    const redeemed = await PosActivationCode.create({
      licenceId: fixtures.activeLicence._id,
      codeHash: digestActivationCode("posac_fedcba9876543210fedcba9876543210"),
      status: "redeemed",
      expiresAt: futureDate(10),
      maxRedemptions: 1,
      redeemedCount: 1,
      lastRedeemedAt: futureDate(1)
    });
    await assert.rejects(
      () => service.revokeUnusedActivationCode(ADMIN, String(redeemed._id)),
      (error) => assertServiceError(error, "already_redeemed")
    );
  });

  test("concurrent unused-code revocation produces one persisted revocation", async () => {
    const issued = await service.issueActivationCode(ADMIN, String(fixtures.activeLicence._id), {
      expiresAt: futureDate(10),
      maxRedemptions: 1
    });
    const attempts = await Promise.allSettled([
      service.revokeUnusedActivationCode(ADMIN, issued.activationCodeMetadata.id),
      service.revokeUnusedActivationCode(ADMIN, issued.activationCodeMetadata.id)
    ]);
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = attempts.find((result) => result.status === "rejected");
    assert.equal(rejected.reason.code, "already_revoked");

    const stored = await PosActivationCode.findById(issued.activationCodeMetadata.id).lean();
    assert.equal(stored.status, "revoked");
    assert.equal(stored.__v, 1);
    assert.equal(await AuditLog.countDocuments({ action: "licences.activation-code.revoke-unused" }), 1);
  });
}
