const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licence-mongodb-integration-test-secret";

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
  serializePosActivationCode,
  serializePosInstallation
} = require("../../server/utils/posLicencePolicy");
const {
  createPosLicenceAdminService
} = require("../../server/services/posLicenceAdminService");

const RUN_INTEGRATION = process.env.AUTOMATEX_POS_MONGO_INTEGRATION === "1";
const TEST_DB_PREFIX = "automatex_pos_licensing_it_";
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
  name: "Integration Admin",
  email: "admin@example.com",
  role: "admin"
};

let mongoProcess = null;
let mongoDbPath = "";
let mongoUri = "";
let dbName = "";
let service = null;
let fixtures = null;
let mongoStartupOutput = "";

function hasExecutable(command) {
  const result = childProcess.spawnSync(command, ["--version"], {
    stdio: "ignore"
  });
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
  assert.equal(name.startsWith(TEST_DB_PREFIX), true, "test database name must be Part 49 specific");
  assert.match(name, /^automatex_pos_licensing_it_[a-z0-9_]+$/);
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
    throw new Error("Part 49 requires a local mongod executable for disposable integration testing.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-licensing-it-"));
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
    if (mongoProcess) {
      mongoProcess.kill("SIGTERM");
      await new Promise((resolve) => mongoProcess.once("exit", resolve));
      mongoProcess = null;
    }
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-licensing-it-"))) {
      fs.rmSync(mongoDbPath, { recursive: true, force: true });
    }
  }
}

async function resetCollections() {
  assertSafeMongoTarget(mongoUri, dbName);
  assert.equal(mongoose.connection.name, dbName);
  await Promise.all(MODEL_SET.map((model) => model.deleteMany({})));
  fixtures = await createFixtures();
  service = createPosLicenceAdminService();
}

async function createFixtures() {
  const client = await User.create({
    name: "POS Client",
    email: `client-${Date.now()}@example.com`,
    passwordHash: "test-password-hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const otherClient = await User.create({
    name: "Other Client",
    email: `other-client-${Date.now()}@example.com`,
    passwordHash: "test-password-hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const posProject = await Project.create({
    clientId: client._id,
    projectTitle: "POS Integration Fixture",
    projectType: "POS System"
  });
  const otherProject = await Project.create({
    clientId: otherClient._id,
    projectTitle: "Other POS Integration Fixture",
    projectType: "POS System"
  });
  const websiteProject = await Project.create({
    clientId: client._id,
    projectTitle: "Website Fixture",
    projectType: "Website"
  });

  return {
    client,
    otherClient,
    posProject,
    otherProject,
    websiteProject
  };
}

function futureDate(days) {
  const date = new Date("2026-08-31T00:00:00.000Z");
  date.setDate(date.getDate() + days);
  return date;
}

function packageInput(overrides = {}) {
  return {
    packageCode: `standard-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    name: "Standard Integration Package",
    edition: POS_EDITION_STANDARD,
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"],
    ...overrides
  };
}

async function createReadyDraftPackage(overrides = {}) {
  return service.createDraftPackage(ADMIN, packageInput(overrides));
}

function assertServiceError(error, code) {
  assert.equal(error && error.code, code);
  return true;
}

if (!RUN_INTEGRATION) {
  test("POS MongoDB integration tests require explicit disposable MongoDB opt-in", {
    skip: "Set AUTOMATEX_POS_MONGO_INTEGRATION=1 to run these tests."
  }, () => {});
} else {
test.before(async () => {
  await startDisposableMongo();
  await provisionCollectionsAndIndexes();
});

test.beforeEach(async () => {
  await resetCollections();
});

test.after(async () => {
  await cleanupDisposableMongo();
});

test("uses a guarded disposable local MongoDB target and explicitly provisioned indexes", async () => {
  assertSafeMongoTarget(mongoUri, dbName);
  assert.equal(mongoose.connection.name, dbName);

  const packageIndexes = await PosPackage.collection.indexes();
  assert.equal(packageIndexes.some((index) => index.name === "packageCode_1" && index.unique === true), true);
  assert.equal(PosPackage.schema.options.autoCreate, false);
  assert.equal(PosPackage.schema.options.autoIndex, false);
});

test("real models and service create, retrieve, and report draft readiness", async () => {
  const incompletePackage = await service.createDraftPackage(ADMIN, {
    packageCode: "standard-incomplete-it",
    name: "Incomplete Integration Package"
  });
  assert.equal(incompletePackage.readiness.ready, false);

  const readyPackage = await createReadyDraftPackage({ packageCode: "standard-ready-it" });
  const storedPackage = await PosPackage.findById(readyPackage.package.id).lean();
  assert.equal(storedPackage.packageCode, "standard-ready-it");

  const draftLicence = await service.createDraftLicence(ADMIN, {
    clientId: fixtures.client._id,
    projectId: fixtures.posProject._id,
    packageId: readyPackage.package.id,
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: futureDate(30),
    supportExpiry: futureDate(90)
  });
  const storedLicence = await PosLicence.findById(draftLicence.licence.id).lean();
  assert.equal(String(storedLicence.clientId), String(fixtures.client._id));
  assert.equal(draftLicence.readiness.ready, false);
  assert.match(draftLicence.readiness.errors.join(" "), /active package/);
});

test("real reference, module, and update-channel validation rejects mismatches", async () => {
  const readyPackage = await createReadyDraftPackage({ packageCode: "standard-validation-it" });

  await assert.rejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: fixtures.client._id,
      projectId: fixtures.otherProject._id
    }),
    (error) => assertServiceError(error, "validation_failed")
  );
  await assert.rejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: fixtures.client._id,
      projectId: fixtures.websiteProject._id
    }),
    (error) => assertServiceError(error, "validation_failed")
  );
  await assert.rejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: fixtures.client._id,
      projectId: fixtures.posProject._id,
      packageId: readyPackage.package.id,
      entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "staff"],
      updateChannel: "stable"
    }),
    (error) => assertServiceError(error, "validation_failed")
  );
  await assert.rejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: fixtures.client._id,
      projectId: fixtures.posProject._id,
      packageId: readyPackage.package.id,
      entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS],
      updateChannel: "beta"
    }),
    (error) => assertServiceError(error, "validation_failed")
  );
});

test("non-admin callers are denied before protected database writes", async () => {
  const beforeCount = await PosPackage.countDocuments();

  await assert.rejects(
    () => service.createDraftPackage({
      id: new mongoose.Types.ObjectId().toString(),
      role: "manager",
      permissions: ["*", "licences:manage"]
    }, packageInput({ packageCode: "standard-denied-it" })),
    (error) => assertServiceError(error, "forbidden")
  );

  assert.equal(await PosPackage.countDocuments(), beforeCount);
});

test("sensitive hash fields are excluded from ordinary query and serialization output", async () => {
  const licence = await PosLicence.create({
    clientId: fixtures.client._id,
    edition: POS_EDITION_STANDARD,
    status: "draft"
  });
  const activationCode = await PosActivationCode.create({
    licenceId: licence._id,
    codeHash: "sha256:integration-activation-hash",
    status: "draft"
  });
  const installation = await PosInstallation.create({
    licenceId: licence._id,
    deviceInstallationId: "123e4567-e89b-42d3-a456-426614174000",
    renewalCredentialHash: "sha256:integration-renewal-hash",
    status: "pending"
  });

  const queriedActivationCode = await PosActivationCode.findById(activationCode._id).lean();
  const queriedInstallation = await PosInstallation.findById(installation._id).lean();

  assert.equal(Object.prototype.hasOwnProperty.call(queriedActivationCode, "codeHash"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(queriedInstallation, "renewalCredentialHash"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(serializePosActivationCode(activationCode), "codeHash"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(serializePosInstallation(installation), "renewalCredentialHash"), false);
});

test("concurrent duplicate package creates produce one success and one conflict", async () => {
  const input = packageInput({ packageCode: "standard-race-create-it" });
  const results = await Promise.allSettled([
    service.createDraftPackage(ADMIN, input),
    service.createDraftPackage(ADMIN, input)
  ]);
  const successes = results.filter((result) => result.status === "fulfilled");
  const conflicts = results.filter((result) => result.status === "rejected" && result.reason.code === "duplicate_package_code");

  assert.equal(successes.length, 1);
  assert.equal(conflicts.length, 1);
  assert.equal(await PosPackage.countDocuments({ packageCode: "standard-race-create-it" }), 1);
});

test("concurrent same-version updates produce one success and one stale conflict", async () => {
  const created = await createReadyDraftPackage({ packageCode: "standard-race-update-it" });
  const before = await PosPackage.findById(created.package.id).lean();

  const results = await Promise.allSettled([
    service.updateDraftPackage(ADMIN, created.package.id, { name: "Race Update A" }, { expectedVersion: before.__v }),
    service.updateDraftPackage(ADMIN, created.package.id, { name: "Race Update B" }, { expectedVersion: before.__v })
  ]);
  const successes = results.filter((result) => result.status === "fulfilled");
  const staleConflicts = results.filter((result) => result.status === "rejected" && result.reason.code === "stale_update");
  const after = await PosPackage.findById(created.package.id).lean();

  assert.equal(successes.length, 1);
  assert.equal(staleConflicts.length, 1);
  assert.equal(after.__v, before.__v + 1);
  assert.equal(["Race Update A", "Race Update B"].includes(after.name), true);
  assert.equal(await PosPackage.countDocuments({ _id: created.package.id }), 1);
});

test("rejected updates leave data unchanged and non-draft records stay protected", async () => {
  const created = await createReadyDraftPackage({ packageCode: "standard-reject-it" });
  const before = await PosPackage.findById(created.package.id).lean();

  await assert.rejects(
    () => service.updateDraftPackage(ADMIN, created.package.id, { updateChannels: ["nightly"] }, { expectedVersion: before.__v }),
    (error) => assertServiceError(error, "validation_failed")
  );
  assert.deepEqual(await PosPackage.findById(created.package.id).lean(), before);

  await PosPackage.updateOne({ _id: created.package.id }, { $set: { status: "active" } });
  await assert.rejects(
    () => service.updateDraftPackage(ADMIN, created.package.id, { name: "Should Not Change" }, { expectedVersion: before.__v }),
    (error) => assertServiceError(error, "not_draft")
  );
  const afterNonDraftReject = await PosPackage.findById(created.package.id).lean();
  assert.equal(afterNonDraftReject.name, before.name);
});

test("packages referenced by non-draft licences cannot be edited by draft service", async () => {
  const created = await createReadyDraftPackage({ packageCode: "standard-in-use-it" });
  await PosLicence.create({
    clientId: fixtures.client._id,
    projectId: fixtures.posProject._id,
    packageId: created.package.id,
    edition: POS_EDITION_STANDARD,
    status: "active",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS],
    updateChannel: "stable",
    licenceExpiry: futureDate(30)
  });

  await assert.rejects(
    () => service.updateDraftPackage(ADMIN, created.package.id, { name: "Should Not Edit" }, { expectedVersion: created.package.version }),
    (error) => assertServiceError(error, "package_in_use")
  );
  const after = await PosPackage.findById(created.package.id).lean();
  assert.equal(after.name, "Standard Integration Package");
});

test("audit records are persisted with allowlisted metadata", async () => {
  const created = await createReadyDraftPackage({ packageCode: "standard-audit-it" });
  const auditRecord = await AuditLog.findOne({
    module: "Licences",
    targetType: "PosPackage",
    targetId: created.package.id
  }).lean();

  assert.equal(auditRecord.actorEmail, ADMIN.email);
  assert.equal(auditRecord.newValue.actorEmail, ADMIN.email);
  assert.equal(auditRecord.newValue.packageId, created.package.id);
  assert.equal(auditRecord.newValue.outcome, "success");
  assert.equal(Object.prototype.hasOwnProperty.call(auditRecord.newValue, "rawRequestBody"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(auditRecord.newValue, "privateKey"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(auditRecord.newValue, "codeHash"), false);
});

test("audit failure after a real write is reported without false rollback or overwrite", async () => {
  const created = await createReadyDraftPackage({ packageCode: "standard-audit-fail-it" });
  const failingAuditService = createPosLicenceAdminService({
    auditLogger: {
      async create() {
        throw new Error("audit storage unavailable");
      }
    }
  });

  const updated = await failingAuditService.updateDraftPackage(
    ADMIN,
    created.package.id,
    { name: "Audit Failed But Saved" },
    { expectedVersion: created.package.version }
  );
  const persisted = await PosPackage.findById(created.package.id).lean();

  assert.equal(updated.audit.ok, false);
  assert.equal(updated.package.name, "Audit Failed But Saved");
  assert.equal(persisted.name, "Audit Failed But Saved");
  assert.equal(persisted.__v, created.package.version + 1);

  await assert.rejects(
    () => failingAuditService.updateDraftPackage(
      ADMIN,
      created.package.id,
      { name: "Must Not Overwrite" },
      { expectedVersion: created.package.version }
    ),
    (error) => assertServiceError(error, "stale_update")
  );
  const afterRetry = await PosPackage.findById(created.package.id).lean();
  assert.equal(afterRetry.name, "Audit Failed But Saved");
  assert.equal(afterRetry.__v, created.package.version + 1);
});

test("normal startup and production routes do not import POS licensing service or models", () => {
  const startupFiles = [
    "server.js",
    "server/server.js",
    "server/routes/index.js"
  ];

  startupFiles.forEach((relativePath) => {
    const source = fs.readFileSync(path.join(rootDir(), relativePath), "utf8");
    assert.doesNotMatch(source, /posLicenceAdminService|PosPackage|PosLicence|PosActivationCode|PosInstallation|PosLicenceIssue/);
  });

  const routeDir = path.join(rootDir(), "server/routes");
  fs.readdirSync(routeDir)
    .filter((fileName) => fileName.endsWith(".js") && fileName !== "posLicenceAdmin.js")
    .forEach((fileName) => {
      const source = fs.readFileSync(path.join(routeDir, fileName), "utf8");
      assert.doesNotMatch(source, /posLicenceAdminService|requireLicencePermission/);
    });
});
}

function rootDir() {
  return path.join(__dirname, "..", "..");
}
