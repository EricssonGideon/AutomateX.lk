const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licence-admin-ui-harness-secret";

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
  CSRF_COOKIE_NAME,
  requireLicencePermission,
  verifyToken
} = require("../../server/middleware/auth");
const {
  POS_STANDARD_MANDATORY_MODULE_IDS,
  POS_STANDARD_OPTIONAL_MODULE_IDS,
  POS_STANDARD_UPDATE_CHANNELS
} = require("../../server/utils/posLicenceContract");

const TEST_DB_PREFIX = "automatex_pos_admin_ui_harness_";
const REPLICA_SET_NAME = "rs_pos_admin_ui_harness";
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
  if (!name.startsWith(TEST_DB_PREFIX) || !/^automatex_pos_admin_ui_harness_[a-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing unsafe POS UI harness database name: ${name}`);
  }
}

function assertSafeMongoTarget(uri, name) {
  assertSafeDatabaseName(name);
  const parsed = new URL(uri);
  if (
    parsed.protocol !== "mongodb:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.pathname !== `/${name}` ||
    parsed.searchParams.get("replicaSet") !== REPLICA_SET_NAME
  ) {
    throw new Error("Refusing unsafe POS UI harness MongoDB target.");
  }
}

function cookieOptions(httpOnly) {
  return {
    httpOnly,
    sameSite: "lax",
    secure: false,
    path: "/"
  };
}

function tokenFor(user) {
  return jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "20m" });
}

function userDto(user) {
  return {
    id: String(user._id),
    name: user.name,
    role: user.role
  };
}

function clientDto(user) {
  return {
    id: String(user._id),
    name: user.name,
    businessName: user.businessName || ""
  };
}

function projectDto(project) {
  return {
    id: String(project._id),
    clientId: String(project.clientId),
    projectTitle: project.projectTitle,
    projectType: project.projectType
  };
}

async function waitForMongo(mongoProcess, uri, output) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (mongoProcess.exitCode !== null) {
      throw new Error(`Disposable mongod exited early with code ${mongoProcess.exitCode}: ${output.value}`);
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

async function waitForDirectConnection(mongoProcess, uri, output) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (mongoProcess.exitCode !== null) {
      throw new Error(`Disposable mongod exited early with code ${mongoProcess.exitCode}: ${output.value}`);
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
  throw lastError || new Error("Timed out waiting for local mongod.");
}

async function initiateReplicaSet(mongoProcess, directMongoUri, port, output) {
  const connection = await waitForDirectConnection(mongoProcess, directMongoUri, output);
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

async function provisionCollectionsAndIndexes(mongoUri, dbName) {
  assertSafeMongoTarget(mongoUri, dbName);
  if (mongoose.connection.name !== dbName || mongoose.connection.host !== "127.0.0.1") {
    throw new Error("POS UI harness MongoDB connection is not the disposable local target.");
  }
  for (const model of MODEL_SET) {
    await model.createCollection();
    await model.createIndexes();
  }
}

async function createFixtures() {
  const stamp = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const admin = await User.create({
    name: "UI Harness Admin",
    email: `ui-admin-${stamp}@example.test`,
    passwordHash: "hash",
    role: "admin",
    status: "active",
    isActive: true
  });
  const manager = await User.create({
    name: "UI Harness Manager",
    email: `ui-manager-${stamp}@example.test`,
    passwordHash: "hash",
    role: "manager",
    status: "active",
    isActive: true
  });
  const staff = await User.create({
    name: "UI Harness Staff",
    email: `ui-staff-${stamp}@example.test`,
    passwordHash: "hash",
    role: "staff",
    status: "active",
    isActive: true
  });
  const employee = await User.create({
    name: "UI Harness Employee",
    email: `ui-employee-${stamp}@example.test`,
    passwordHash: "hash",
    role: "employee",
    status: "active",
    isActive: true
  });
  const client = await User.create({
    name: "Fixture Client <img src=x onerror=alert(1)>",
    email: `ui-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true,
    businessName: "POS Fixture Business"
  });
  const otherClient = await User.create({
    name: "Other Fixture Client",
    email: `ui-other-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Fixture POS Project",
    projectType: "POS System"
  });
  const otherProject = await Project.create({
    clientId: otherClient._id,
    projectTitle: "Mismatched Fixture POS Project",
    projectType: "POS System"
  });

  return {
    users: {
      admin,
      manager,
      staff,
      employee,
      client
    },
    clients: [client, otherClient],
    projects: [project, otherProject]
  };
}

async function startDisposableMongo() {
  if (!hasExecutable("mongod")) {
    throw new Error("A local mongod executable is required for the disposable POS licensing UI replica-set harness.");
  }

  const mongoPort = await getFreePort();
  const dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-admin-ui-harness-"));
  const mongoUri = `mongodb://127.0.0.1:${mongoPort}/${dbName}?replicaSet=${REPLICA_SET_NAME}`;
  const directMongoUri = `mongodb://127.0.0.1:${mongoPort}/admin?directConnection=true`;
  assertSafeMongoTarget(mongoUri, dbName);

  const output = { value: "" };
  const mongoProcess = childProcess.spawn("mongod", [
    "--dbpath",
    dbPath,
    "--bind_ip",
    "127.0.0.1",
    "--port",
    String(mongoPort),
    "--replSet",
    REPLICA_SET_NAME,
    "--quiet"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  mongoProcess.stdout.on("data", (chunk) => {
    output.value += chunk.toString();
  });
  mongoProcess.stderr.on("data", (chunk) => {
    output.value += chunk.toString();
  });

  await initiateReplicaSet(mongoProcess, directMongoUri, mongoPort, output);
  await waitForMongo(mongoProcess, mongoUri, output);
  return { dbName, dbPath, mongoProcess, mongoUri };
}

async function startPosLicenceAdminUiHarness() {
  const mongo = await startDisposableMongo();
  await provisionCollectionsAndIndexes(mongo.mongoUri, mongo.dbName);
  let fixtures = await createFixtures();
  let failNextAudit = false;
  const originalAuditCreate = AuditLog.create;
  AuditLog.create = async function createWithOptionalFixtureFailure() {
    if (failNextAudit) {
      failNextAudit = false;
      throw new Error("fixture audit backend failure");
    }
    return originalAuditCreate.apply(this, arguments);
  };

  const app = express();
  const staticRoot = __dirname;
  app.use(express.json({ limit: "100kb" }));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(staticRoot, "index.html"));
  });
  app.get("/favicon.ico", (_req, res) => res.status(204).end());
  app.use(express.static(staticRoot, { index: false, maxAge: 0 }));
  app.post("/__fixtures/login", async (req, res) => {
    const role = String(req.body && req.body.role || "").trim().toLowerCase();
    const user = fixtures.users[role];
    if (!user) {
      return res.status(400).json({ message: "Unsupported fixture role." });
    }
    const csrf = crypto.randomBytes(18).toString("hex");
    res.cookie(AUTH_COOKIE_NAME, tokenFor(user), cookieOptions(true));
    res.cookie(CSRF_COOKIE_NAME, csrf, cookieOptions(false));
    return res.status(200).json({ user: userDto(user) });
  });
  app.post("/__fixtures/logout", (_req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
    res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
    return res.status(200).json({ message: "Signed out." });
  });
  app.get("/__fixtures/options", verifyToken, requireLicencePermission("licences:view"), (_req, res) => res.status(200).json({
    constants: {
      mandatoryModules: POS_STANDARD_MANDATORY_MODULE_IDS,
      optionalModules: POS_STANDARD_OPTIONAL_MODULE_IDS,
      updateChannels: POS_STANDARD_UPDATE_CHANNELS
    },
    clients: fixtures.clients.map(clientDto),
    projects: fixtures.projects.map(projectDto)
  }));
  app.post("/__fixtures/audit-failure", verifyToken, requireLicencePermission("licences:manage"), (_req, res) => {
    failNextAudit = true;
    return res.status(200).json({ message: "Next audit write will fail in the isolated harness." });
  });
  async function resetFixtures() {
    await Promise.all(MODEL_SET.map((model) => model.deleteMany({})));
    fixtures = await createFixtures();
  }

  app.post("/__fixtures/reset", verifyToken, requireLicencePermission("licences:manage"), async (_req, res) => {
    await resetFixtures();
    return res.status(200).json({ message: "Reset isolated fixtures." });
  });
  app.use("/pos-admin", posLicenceAdminRouter);
  app.use((_req, res) => res.status(404).json({ message: "Not found" }));

  const httpServer = http.createServer(app);
  const httpPort = await getFreePort();
  await new Promise((resolve) => httpServer.listen(httpPort, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${httpPort}`;

  async function stop() {
    AuditLog.create = originalAuditCreate;
    try {
      if (mongoose.connection.readyState === 1) {
        assertSafeMongoTarget(mongo.mongoUri, mongo.dbName);
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
      await new Promise((resolve) => httpServer.close(resolve));
      mongo.mongoProcess.kill("SIGTERM");
      await new Promise((resolve) => mongo.mongoProcess.once("exit", resolve));
      if (mongo.dbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-admin-ui-harness-"))) {
        fs.rmSync(mongo.dbPath, { recursive: true, force: true });
      }
    }
  }

  return {
    baseUrl,
    dbName: mongo.dbName,
    mongoUri: mongo.mongoUri,
    fixtures,
    resetFixtures,
    stop
  };
}

if (require.main === module) {
  startPosLicenceAdminUiHarness()
    .then((harness) => {
      process.stdout.write(`POS licensing draft-management UI: ${harness.baseUrl}\n`);
      process.stdout.write(`Disposable MongoDB database: ${harness.dbName}\n`);
      process.stdout.write("Press Ctrl+C to stop.\n");
      const shutdown = async () => {
        await harness.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exit(1);
    });
}

module.exports = {
  TEST_DB_PREFIX,
  startPosLicenceAdminUiHarness
};
