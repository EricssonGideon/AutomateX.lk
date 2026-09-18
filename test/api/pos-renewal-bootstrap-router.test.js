const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-renewal-bootstrap-router-test-secret";

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
const createPosActivationRouter = require("../../server/routes/posActivation");
const { AUTH_COOKIE_NAME } = require("../../server/middleware/auth");
const {
  POS_ACTIVATION_API_SCHEMA_VERSION,
  POS_EDITION_STANDARD,
  POS_STANDARD_MANDATORY_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  digestActivationCode,
  generateActivationCode
} = require("../../server/utils/posActivationCodeToken");
const {
  RENEWAL_CREDENTIAL_PREFIX,
  RENEWAL_CREDENTIAL_RANDOM_BYTES,
  digestRenewalCredential
} = require("../../server/utils/posRenewalCredentialToken");
const {
  createPosActivationRedemptionService
} = require("../../server/services/posActivationRedemptionService");
const {
  createPosLicenceRenewalService
} = require("../../server/services/posLicenceRenewalService");
const {
  createPosRenewalCredentialBootstrapService
} = require("../../server/services/posRenewalCredentialBootstrapService");

const RUN_BOOTSTRAP_ROUTER = process.env.AUTOMATEX_POS_RENEWAL_BOOTSTRAP_ROUTER_INTEGRATION === "1";
const TEST_DB_PREFIX = "automatex_pos_renewal_bootstrap_api_it_";
const REPLICA_SET_NAME = "rs_pos_renewal_bootstrap_api_it";
const POS_STANDARD_SOURCE_PATH = "/Users/robertericsson/AutomateX/Systems/AutomateX POS Systems/POS-Standard Original/app.js";
const TRUST_BOUNDARY_SOURCE = "const STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = null;";
const NOW = new Date("2026-08-31T00:00:00.000Z");
const DEVICE_ID = "123e4567-e89b-42d3-a456-426614174000";
const DEVICE_ID_2 = "123e4567-e89b-42d3-a456-426614174001";
const LOCAL_POS_ORIGIN = "https://pos-bootstrap-local.example.test";
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
let keyPair = null;
let logCapture = [];

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
  assert.match(name, /^automatex_pos_renewal_bootstrap_api_it_[a-z0-9_]+$/);
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
      throw new Error(`Disposable mongod exited early with code ${mongoProcess.exitCode}: ${mongoStartupOutput}`);
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
    throw new Error("Part 62 requires a local mongod executable for disposable renewal bootstrap endpoint testing.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-renewal-bootstrap-api-it-"));
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
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-renewal-bootstrap-api-it-"))) {
      fs.rmSync(mongoDbPath, { recursive: true, force: true });
    }
  }
}

function createKeyProvider() {
  return {
    async getPrivateKey() {
      return keyPair.privateKey;
    }
  };
}

async function startIsolatedApp(options = {}) {
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
    httpServer = null;
  }
  const app = express();
  app.use("/pos-machine", createPosActivationRouter({
    allowedOrigins: options.allowedOrigins || [LOCAL_POS_ORIGIN],
    bodyLimit: options.bodyLimit || "2kb",
    rateLimit: options.rateLimit || { windowMs: 60 * 1000, limit: 30 },
    bootstrapRateLimit: options.bootstrapRateLimit,
    service: options.activationService || createPosActivationRedemptionService({
      keyProvider: options.keyProvider || createKeyProvider(),
      clock: () => new Date(NOW)
    }),
    renewalService: options.renewalService || createPosLicenceRenewalService({
      keyProvider: options.keyProvider || createKeyProvider(),
      clock: () => new Date(NOW)
    }),
    bootstrapService: options.bootstrapService || createPosRenewalCredentialBootstrapService({
      clock: () => new Date(NOW)
    })
  }));
  app.use((_req, res) => res.status(404).json({ message: "Not found" }));
  httpServer = http.createServer(app);
  const port = await getFreePort();
  await new Promise((resolve) => httpServer.listen(port, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${port}/pos-machine`;
}

async function resetCollections() {
  assertSafeMongoTarget(mongoUri, dbName);
  assert.equal(mongoose.connection.name, dbName);
  await Promise.all(MODEL_SET.map((model) => model.deleteMany({})));
  keyPair = crypto.generateKeyPairSync("ed25519");
  logCapture = [];
  await startIsolatedApp();
}

function futureDate(days) {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return date;
}

function clientGeneratedRenewalCredential() {
  return `${RENEWAL_CREDENTIAL_PREFIX}${crypto.randomBytes(RENEWAL_CREDENTIAL_RANDOM_BYTES).toString("hex")}`;
}

function activationRequest(code, overrides = {}) {
  return {
    schemaVersion: POS_ACTIVATION_API_SCHEMA_VERSION,
    activationCode: code,
    edition: POS_EDITION_STANDARD,
    appVersion: "standard-v1",
    providerConfigVersion: 1,
    deviceInstallationId: DEVICE_ID,
    setupStatus: "pending",
    runtime: "browser",
    ...overrides
  };
}

function bootstrapRequest(fixture, digest, overrides = {}) {
  return {
    schemaVersion: 1,
    edition: POS_EDITION_STANDARD,
    activationCode: fixture.plaintextCode,
    deviceInstallationId: fixture.deviceInstallationId,
    signedLicenceSignature: fixture.signedLicence.signature,
    renewalCredentialDigest: digest,
    ...overrides
  };
}

async function postActivation(payload, options = {}) {
  return fetch(`${baseUrl}/standard/activate${options.query || ""}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": options.contentType || "application/json",
      ...(options.origin ? { Origin: options.origin } : {}),
      ...(options.headers || {})
    },
    body: options.rawBody || JSON.stringify(payload)
  });
}

async function postBootstrap(payload, options = {}) {
  return fetch(`${baseUrl}/standard/renewal-credentials/bootstrap${options.query || ""}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": options.contentType || "application/json",
      ...(options.origin ? { Origin: options.origin } : {}),
      ...(options.headers || {})
    },
    body: options.rawBody || JSON.stringify(payload)
  });
}

async function responseJson(response) {
  return response.json();
}

function adminSessionHeaders() {
  const token = jwt.sign({
    id: new mongoose.Types.ObjectId().toString(),
    role: "admin",
    permissions: ["*"]
  }, process.env.JWT_SECRET, { expiresIn: "5m" });
  return {
    Cookie: `${AUTH_COOKIE_NAME}=${token}`,
    Authorization: `Bearer ${token}`
  };
}

async function createCommittedActivationFixture(options = {}) {
  const stamp = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const client = await User.create({
    name: "Bootstrap Router Client",
    email: `bootstrap-router-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Bootstrap Router POS Project",
    projectType: "POS System"
  });
  const posPackage = await PosPackage.create({
    packageCode: `standard-bootstrap-router-${stamp}`,
    name: "Bootstrap Router Standard",
    edition: POS_EDITION_STANDARD,
    status: "active",
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"]
  });
  const licence = await PosLicence.create({
    clientId: client._id,
    projectId: project._id,
    packageId: posPackage._id,
    edition: POS_EDITION_STANDARD,
    status: "active",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: futureDate(60),
    supportExpiry: futureDate(90),
    offlineValidUntil: futureDate(14),
    renewalWindowDurationMinutes: 7 * 24 * 60,
    maxInstallations: 2,
    activationCount: 0
  });
  const plaintextCode = generateActivationCode();
  const activationCode = await PosActivationCode.create({
    licenceId: licence._id,
    codeHash: digestActivationCode(plaintextCode),
    status: options.codeStatus || "active",
    expiresAt: options.codeExpiresAt || futureDate(7),
    maxRedemptions: options.maxRedemptions || 1,
    redeemedCount: 0
  });
  const activation = await postActivation(activationRequest(plaintextCode, {
    deviceInstallationId: options.deviceInstallationId || DEVICE_ID
  }), { origin: LOCAL_POS_ORIGIN });
  assert.equal(activation.status, 200);
  const signedLicence = await responseJson(activation);
  const installation = await PosInstallation.findOne({
    licenceId: licence._id,
    deviceInstallationId: options.deviceInstallationId || DEVICE_ID
  }).select("+renewalCredentialHash");
  const issue = await PosLicenceIssue.findOne({
    activationCodeId: activationCode._id,
    installationId: installation._id
  }).select("+signedPayload");

  return {
    activationCode,
    client,
    deviceInstallationId: options.deviceInstallationId || DEVICE_ID,
    installation,
    issue,
    licence,
    plaintextCode,
    posPackage,
    project,
    signedLicence
  };
}

async function countState(fixture) {
  const code = await PosActivationCode.findById(fixture.activationCode._id).lean();
  const licence = await PosLicence.findById(fixture.licence._id).lean();
  return {
    activationCodes: await PosActivationCode.countDocuments({}),
    installations: await PosInstallation.countDocuments({}),
    issues: await PosLicenceIssue.countDocuments({}),
    redemptionAudits: await AuditLog.countDocuments({ action: "licences.activation-code.redeem" }),
    bootstrapAudits: await AuditLog.countDocuments({ action: "licences.renewal-credential.bootstrap" }),
    renewalAudits: await AuditLog.countDocuments({ action: "licences.renewal.issue" }),
    redeemedCount: code.redeemedCount,
    activationCount: licence.activationCount
  };
}

async function assertCounts(fixture, expected) {
  assert.deepEqual(await countState(fixture), expected);
}

async function revokeWithObservedVersion(activationCodeId, observedVersion) {
  const session = await mongoose.connection.startSession();
  try {
    let revoked = false;
    await session.withTransaction(async () => {
      const updated = await PosActivationCode.findOneAndUpdate(
        {
          _id: activationCodeId,
          __v: observedVersion,
          status: "active"
        },
        {
          $set: {
            status: "revoked",
            updatedBy: null
          },
          $inc: { __v: 1 }
        },
        { new: true, runValidators: true, session }
      );
      revoked = Boolean(updated);
    });
    return revoked;
  } finally {
    await session.endSession();
  }
}

function assertAckBody(body, expectedInstallationId = DEVICE_ID) {
  assert.deepEqual(Object.keys(body).sort(), ["credentialVersion", "installationId", "schemaVersion", "status"]);
  assert.deepEqual(body, {
    schemaVersion: 1,
    status: "bound",
    installationId: expectedInstallationId,
    credentialVersion: 1
  });
}

function assertNoSensitiveText(value, fixture = null, extraValues = []) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const blocked of [
    "stack",
    "codeHash",
    "renewalCredentialHash",
    "signedPayload",
    "privateKey",
    ...(fixture ? [
      fixture.plaintextCode,
      fixture.signedLicence.signature
    ] : []),
    ...extraValues
  ].filter(Boolean)) {
    assert.equal(text.includes(String(blocked)), false);
  }
}

async function ordinarySnapshot() {
  return JSON.stringify({
    activationCodes: await PosActivationCode.find({}).lean(),
    installations: await PosInstallation.find({}).lean(),
    issues: await PosLicenceIssue.find({}).lean(),
    audits: await AuditLog.find({}).lean()
  });
}

if (!RUN_BOOTSTRAP_ROUTER) {
  test("POS renewal credential bootstrap router integration tests require explicit disposable replica-set opt-in", {
    skip: "Set AUTOMATEX_POS_RENEWAL_BOOTSTRAP_ROUTER_INTEGRATION=1 to run these isolated HTTP/MongoDB tests."
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

  test("successful bootstrap after committed HTTP activation returns the exact acknowledgement DTO", async () => {
    const fixture = await createCommittedActivationFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const response = await postBootstrap(bootstrapRequest(fixture, digest), { origin: LOCAL_POS_ORIGIN });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("access-control-allow-origin"), LOCAL_POS_ORIGIN);
    assertAckBody(await responseJson(response));

    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    assert.equal(stored.renewalCredentialHash, digest);
    assert.equal(stored.renewalCredentialVersion, 1);
    await assertCounts(fixture, {
      activationCodes: 1,
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("same-request and lost-response replay return the same acknowledgement without duplicate records", async () => {
    const fixture = await createCommittedActivationFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const request = bootstrapRequest(fixture, digest);
    const first = await postBootstrap(request, { origin: LOCAL_POS_ORIGIN });
    const second = await postBootstrap(request, { origin: LOCAL_POS_ORIGIN });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const bodies = await Promise.all([responseJson(first), responseJson(second)]);
    assert.deepEqual(bodies[1], bodies[0]);
    assertAckBody(bodies[0]);
    await assertCounts(fixture, {
      activationCodes: 1,
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("concurrent identical bootstrap requests create one binding and one audit", async () => {
    const fixture = await createCommittedActivationFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const request = bootstrapRequest(fixture, digest);
    const responses = await Promise.all([
      postBootstrap(request, { origin: LOCAL_POS_ORIGIN }),
      postBootstrap(request, { origin: LOCAL_POS_ORIGIN })
    ]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    const bodies = await Promise.all(responses.map(responseJson));
    assert.deepEqual(bodies[1], bodies[0]);
    await assertCounts(fixture, {
      activationCodes: 1,
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("concurrent different digest binding has one winner and no overwrite", async () => {
    const fixture = await createCommittedActivationFixture();
    const firstDigest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const secondDigest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const responses = await Promise.all([
      postBootstrap(bootstrapRequest(fixture, firstDigest), { origin: LOCAL_POS_ORIGIN }),
      postBootstrap(bootstrapRequest(fixture, secondDigest), { origin: LOCAL_POS_ORIGIN })
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 403]);
    const bodies = await Promise.all(responses.map(responseJson));
    bodies.forEach((body) => assertNoSensitiveText(body, fixture, [firstDigest, secondDigest]));
    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    assert.equal([firstDigest, secondDigest].includes(stored.renewalCredentialHash), true);
    assert.equal(stored.renewalCredentialVersion, 1);
    await assertCounts(fixture, {
      activationCodes: 1,
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("wrong code, device, signature and signature-only attempts are denied generically", async () => {
    const fixture = await createCommittedActivationFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const cases = [
      bootstrapRequest(fixture, digest, { activationCode: generateActivationCode() }),
      bootstrapRequest(fixture, digest, { deviceInstallationId: DEVICE_ID_2 }),
      bootstrapRequest(fixture, digest, { signedLicenceSignature: Buffer.from(crypto.randomBytes(64)).toString("base64") }),
      bootstrapRequest(fixture, digest, { activationCode: "" })
    ];
    const responses = [];
    for (const request of cases) {
      responses.push(await postBootstrap(request, {
        origin: LOCAL_POS_ORIGIN,
        headers: adminSessionHeaders()
      }));
    }
    assert.deepEqual(responses.map((response) => response.status), [403, 403, 403, 400]);
    for (const response of responses) {
      assert.equal(response.headers.get("cache-control"), "no-store");
      assertNoSensitiveText(await responseJson(response), fixture, [digest]);
    }
    await assertCounts(fixture, {
      activationCodes: 1,
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 0,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("expired, revoked and exhausted codes follow committed-device replay policy", async () => {
    const fixture = await createCommittedActivationFixture({ maxRedemptions: 1 });
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const sameDevice = await postBootstrap(bootstrapRequest(fixture, digest), { origin: LOCAL_POS_ORIGIN });
    assert.equal(sameDevice.status, 200);
    const differentDevice = await postBootstrap(bootstrapRequest(fixture, digest, { deviceInstallationId: DEVICE_ID_2 }), { origin: LOCAL_POS_ORIGIN });
    assert.equal(differentDevice.status, 403);

    await resetCollections();
    const expiredFixture = await createCommittedActivationFixture();
    await PosActivationCode.updateOne({ _id: expiredFixture.activationCode._id }, { $set: { expiresAt: futureDate(-1) } });
    const expired = await postBootstrap(bootstrapRequest(expiredFixture, digest), { origin: LOCAL_POS_ORIGIN });
    assert.equal(expired.status, 403);

    await resetCollections();
    const revokedFixture = await createCommittedActivationFixture();
    await PosActivationCode.updateOne({ _id: revokedFixture.activationCode._id }, { $set: { status: "revoked" } });
    const revoked = await postBootstrap(bootstrapRequest(revokedFixture, digest), { origin: LOCAL_POS_ORIGIN });
    assert.equal(revoked.status, 403);
  });

  test("unknown, malformed, oversized, non-JSON, query and raw-credential inputs are rejected with no-store", async () => {
    const fixture = await createCommittedActivationFixture();
    const rawRenewalCredential = clientGeneratedRenewalCredential();
    const digest = digestRenewalCredential(rawRenewalCredential);
    const cases = [
      await postBootstrap({ ...bootstrapRequest(fixture, digest), clientId: String(fixture.client._id) }, { origin: LOCAL_POS_ORIGIN }),
      await postBootstrap({ ...bootstrapRequest(fixture, digest), renewalCredentialDigest: { $ne: digest } }, { origin: LOCAL_POS_ORIGIN }),
      await postBootstrap(bootstrapRequest(fixture, digest), { origin: LOCAL_POS_ORIGIN, query: "?activationCode=blocked" }),
      await postBootstrap({}, { origin: LOCAL_POS_ORIGIN, rawBody: JSON.stringify({ padding: "x".repeat(3000) }) }),
      await postBootstrap(bootstrapRequest(fixture, digest), {
        origin: LOCAL_POS_ORIGIN,
        contentType: "text/plain",
        rawBody: JSON.stringify(bootstrapRequest(fixture, digest))
      }),
      await postBootstrap(bootstrapRequest(fixture, rawRenewalCredential), { origin: LOCAL_POS_ORIGIN })
    ];
    assert.deepEqual(cases.map((response) => response.status), [400, 400, 400, 413, 415, 400]);
    for (const response of cases) {
      assert.equal(response.headers.get("cache-control"), "no-store");
      assertNoSensitiveText(await responseJson(response), fixture, [rawRenewalCredential, digest]);
    }
  });

  test("narrow CORS, preflight and endpoint-specific rate limiting are enforced", async () => {
    await startIsolatedApp({ bootstrapRateLimit: { windowMs: 60 * 1000, limit: 1 } });
    const fixture = await createCommittedActivationFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const request = bootstrapRequest(fixture, digest);
    const first = await postBootstrap(request, { origin: LOCAL_POS_ORIGIN });
    assert.equal(first.status, 200);
    const limited = await postBootstrap(request, { origin: LOCAL_POS_ORIGIN });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("cache-control"), "no-store");
    assert.deepEqual(await responseJson(limited), {
      message: "Too many renewal credential bootstrap attempts. Try again later.",
      retryable: true
    });

    await startIsolatedApp();
    const preflight = await fetch(`${baseUrl}/standard/renewal-credentials/bootstrap`, {
      method: "OPTIONS",
      headers: {
        Origin: LOCAL_POS_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type"
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), LOCAL_POS_ORIGIN);
    assert.equal(preflight.headers.get("cache-control"), "no-store");

    const blocked = await postBootstrap(request, { origin: "https://evil.example.test" });
    assert.equal(blocked.status, 403);
    assertNoSensitiveText(await responseJson(blocked), fixture, [digest]);
  });

  test("audit failure rolls back binding and is sanitized by HTTP", async () => {
    const fixture = await createCommittedActivationFixture();
    await startIsolatedApp({
      bootstrapService: createPosRenewalCredentialBootstrapService({
        clock: () => new Date(NOW),
        auditLogger: {
          async create() {
            throw new Error("audit unavailable");
          }
        }
      })
    });
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const response = await postBootstrap(bootstrapRequest(fixture, digest), { origin: LOCAL_POS_ORIGIN });
    assert.equal(response.status, 503);
    assert.deepEqual(await responseJson(response), {
      message: "Renewal credential bootstrap service is unavailable.",
      retryable: true
    });
    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    assert.equal(stored.renewalCredentialHash, "");
    assert.equal(stored.renewalCredentialVersion, 0);
    await assertCounts(fixture, {
      activationCodes: 1,
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 0,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("revocation versus bootstrap race leaves one consistent outcome", async () => {
    const fixture = await createCommittedActivationFixture({ maxRedemptions: 2 });
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const observedCode = await PosActivationCode.findById(fixture.activationCode._id).lean();
    assert.equal(observedCode.status, "active");
    const results = await Promise.allSettled([
      postBootstrap(bootstrapRequest(fixture, digest), { origin: LOCAL_POS_ORIGIN }),
      revokeWithObservedVersion(fixture.activationCode._id, observedCode.__v)
    ]);
    const bootstrapResult = results[0];
    const revokeResult = results[1];
    assert.equal(bootstrapResult.status, "fulfilled");
    assert.equal(revokeResult.status, "fulfilled");
    const bootstrapSucceeded = bootstrapResult.value.status === 200;
    const revokeSucceeded = revokeResult.value === true;
    assert.equal(bootstrapSucceeded !== revokeSucceeded, true);
    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    if (bootstrapSucceeded) {
      assert.equal(stored.renewalCredentialHash, digest);
      assert.equal(await AuditLog.countDocuments({ action: "licences.renewal-credential.bootstrap" }), 1);
    } else {
      assert.equal(stored.renewalCredentialHash, "");
      assert.equal(await AuditLog.countDocuments({ action: "licences.renewal-credential.bootstrap" }), 0);
    }
    await assertCounts(fixture, {
      activationCodes: 1,
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: bootstrapSucceeded ? 1 : 0,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("sensitive bootstrap values are absent from responses, logs, audit records and ordinary DTOs", async () => {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    console.error = (...args) => logCapture.push(args.join(" "));
    console.warn = (...args) => logCapture.push(args.join(" "));
    let fixture;
    let rawRenewalCredential;
    let digest;
    let responseBody;
    try {
      fixture = await createCommittedActivationFixture();
      rawRenewalCredential = clientGeneratedRenewalCredential();
      digest = digestRenewalCredential(rawRenewalCredential);
      const response = await postBootstrap(bootstrapRequest(fixture, digest), { origin: LOCAL_POS_ORIGIN });
      assert.equal(response.status, 200);
      responseBody = await responseJson(response);
      const failure = await postBootstrap(bootstrapRequest(fixture, digest, { deviceInstallationId: DEVICE_ID_2 }), { origin: LOCAL_POS_ORIGIN });
      assertNoSensitiveText(await responseJson(failure), fixture, [rawRenewalCredential, digest]);
    } finally {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    }

    assertNoSensitiveText(responseBody, fixture, [rawRenewalCredential, digest]);
    const snapshot = await ordinarySnapshot();
    assertNoSensitiveText(snapshot, fixture, [rawRenewalCredential, digest]);
    const logs = logCapture.join("\n");
    assertNoSensitiveText(logs, fixture, [rawRenewalCredential, digest]);
  });

  test("bootstrap route remains unmounted from production startup, UI, public assets and POS source", () => {
    const rootDir = path.join(__dirname, "..", "..");
    for (const relativePath of [
      "server.js",
      "server/server.js",
      "server/routes/index.js",
      "server/routes/posLicenceAdmin.js",
      "server/controllers/posLicenceAdminController.js",
      "tools/pos-licence-admin-ui/pos-licence-admin-ui.js"
    ]) {
      const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
      assert.doesNotMatch(source, /renewal-credentials\/bootstrap|posRenewalCredentialBootstrapService|bootstrapRenewalCredential/);
    }

    const publicMatches = [];
    function scanPublic(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          scanPublic(fullPath);
        } else if (/\.(js|html|css)$/i.test(entry.name)) {
          const source = fs.readFileSync(fullPath, "utf8");
          if (/renewal-credentials\/bootstrap|bootstrapRenewalCredential|renewalCredentialDigest/.test(source)) {
            publicMatches.push(fullPath);
          }
        }
      }
    }
    scanPublic(path.join(rootDir, "public"));
    assert.deepEqual(publicMatches, []);

    const posSource = fs.readFileSync(POS_STANDARD_SOURCE_PATH, "utf8");
    assert.equal(posSource.includes(TRUST_BOUNDARY_SOURCE), true);
  });
}
