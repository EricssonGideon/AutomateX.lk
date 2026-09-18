const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-renewal-router-test-secret";

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
  createPosRenewalCredentialBootstrapService
} = require("../../server/services/posRenewalCredentialBootstrapService");
const {
  createPosLicenceRenewalService
} = require("../../server/services/posLicenceRenewalService");

const RUN_RENEWAL_ROUTER = process.env.AUTOMATEX_POS_RENEWAL_ROUTER_INTEGRATION === "1";
const TEST_DB_PREFIX = "automatex_pos_renewal_api_it_";
const REPLICA_SET_NAME = "rs_pos_renewal_api_it";
const POS_STANDARD_SOURCE_PATH = "/Users/robertericsson/AutomateX/Systems/AutomateX POS Systems/POS-Standard Original/app.js";
const TRUST_BOUNDARY_SOURCE = "const STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = null;";
const ACTIVATION_NOW = new Date("2026-08-31T00:00:00.000Z");
const RENEWAL_NOW = new Date("2026-09-20T00:00:00.000Z");
const DEVICE_ID = "123e4567-e89b-42d3-a456-426614174000";
const DEVICE_ID_2 = "123e4567-e89b-42d3-a456-426614174001";
const LOCAL_POS_ORIGIN = "https://pos-renewal-local.example.test";
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
let currentNow = new Date(RENEWAL_NOW);
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
  assert.equal(name.startsWith(TEST_DB_PREFIX), true);
  assert.match(name, /^automatex_pos_renewal_api_it_[a-z0-9_]+$/);
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
    throw new Error("Part 61 requires a local mongod executable for disposable renewal endpoint testing.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-renewal-api-it-"));
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
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-renewal-api-it-"))) {
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
  const renewalService = options.renewalService || createPosLicenceRenewalService({
    keyProvider: options.keyProvider || createKeyProvider(),
    clock: options.clock || (() => new Date(currentNow))
  });
  app.use("/pos-machine", createPosActivationRouter({
    allowedOrigins: options.allowedOrigins || [LOCAL_POS_ORIGIN],
    bodyLimit: options.bodyLimit || "2kb",
    rateLimit: options.rateLimit || { windowMs: 60 * 1000, limit: 30 },
    renewalRateLimit: options.renewalRateLimit,
    renewalService,
    service: options.activationService || { async redeemActivation() { throw new Error("activation not mounted in renewal tests"); } }
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
  currentNow = new Date(RENEWAL_NOW);
  logCapture = [];
  await startIsolatedApp();
}

function futureDate(from, days) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
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

function bootstrapRequest(fixture, digest) {
  return {
    schemaVersion: 1,
    edition: POS_EDITION_STANDARD,
    activationCode: fixture.plaintextCode,
    deviceInstallationId: fixture.deviceInstallationId,
    signedLicenceSignature: fixture.activationSignedLicence.signature,
    renewalCredentialDigest: digest
  };
}

function renewalRequest(fixture, overrides = {}) {
  return {
    schemaVersion: 1,
    edition: POS_EDITION_STANDARD,
    deviceInstallationId: fixture.deviceInstallationId,
    renewalCredential: fixture.rawRenewalCredential,
    lastSignature: fixture.lastSignature,
    ...overrides
  };
}

async function postRenewal(payload, options = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": options.contentType || "application/json",
    ...(options.origin ? { Origin: options.origin } : {}),
    ...(options.headers || {})
  };
  return fetch(`${baseUrl}/standard/renew${options.query || ""}`, {
    method: "POST",
    headers,
    body: options.rawBody || JSON.stringify(payload)
  });
}

async function responseJson(response) {
  return response.json();
}

function adminSessionCookie() {
  const token = jwt.sign({
    id: new mongoose.Types.ObjectId().toString(),
    role: "admin",
    permissions: ["*"]
  }, process.env.JWT_SECRET, { expiresIn: "5m" });
  return `${AUTH_COOKIE_NAME}=${token}`;
}

async function createRenewalFixture(options = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const client = await User.create({
    name: "Renewal Router Client",
    email: `renewal-router-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Renewal Router POS Project",
    projectType: "POS System"
  });
  const posPackage = await PosPackage.create({
    packageCode: `standard-renewal-router-${stamp}`,
    name: "Renewal Router Standard",
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
    licenceExpiry: options.licenceExpiry || futureDate(ACTIVATION_NOW, 90),
    supportExpiry: futureDate(ACTIVATION_NOW, 120),
    offlineValidUntil: options.initialOfflineValidUntil || futureDate(ACTIVATION_NOW, 5),
    renewalWindowDurationMinutes: Object.prototype.hasOwnProperty.call(options, "renewalWindowDurationMinutes")
      ? options.renewalWindowDurationMinutes
      : 7 * 24 * 60,
    maxInstallations: 2,
    activationCount: 0
  });
  const plaintextCode = generateActivationCode();
  const activationCode = await PosActivationCode.create({
    licenceId: licence._id,
    codeHash: digestActivationCode(plaintextCode),
    status: "active",
    expiresAt: futureDate(ACTIVATION_NOW, 7),
    maxRedemptions: 1,
    redeemedCount: 0
  });
  const redemptionService = createPosActivationRedemptionService({
    keyProvider: createKeyProvider(),
    clock: () => new Date(ACTIVATION_NOW)
  });
  const activation = await redemptionService.redeemActivation(activationRequest(plaintextCode));
  const rawRenewalCredential = clientGeneratedRenewalCredential();
  const renewalCredentialDigest = digestRenewalCredential(rawRenewalCredential);
  const bootstrapService = createPosRenewalCredentialBootstrapService({
    clock: () => new Date(ACTIVATION_NOW)
  });
  await bootstrapService.bootstrapRenewalCredential(bootstrapRequest({
    plaintextCode,
    deviceInstallationId: DEVICE_ID,
    activationSignedLicence: activation.signedLicence
  }, renewalCredentialDigest));
  const installation = await PosInstallation.findOne({
    licenceId: licence._id,
    deviceInstallationId: DEVICE_ID
  }).select("+renewalCredentialHash");

  return {
    activationCode,
    activationSignedLicence: activation.signedLicence,
    client,
    deviceInstallationId: DEVICE_ID,
    installation,
    lastSignature: activation.signedLicence.signature,
    licence,
    plaintextCode,
    posPackage,
    project,
    rawRenewalCredential,
    renewalCredentialDigest
  };
}

function makeElement(ElementClass) {
  const element = Object.create(ElementClass.prototype);
  return Object.assign(element, {
    style: {},
    dataset: {},
    value: "",
    textContent: "",
    innerHTML: "",
    checked: false,
    disabled: false,
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      }
    },
    append() {},
    appendChild() {},
    prepend() {},
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    focus() {},
    blur() {}
  });
}

function createStorage() {
  const entries = new Map();
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
    entries
  };
}

function createPosVmContext() {
  function FakeHTMLElement() {}
  const storage = createStorage();
  const noop = () => {};
  const document = {
    addEventListener() {},
    removeEventListener() {},
    getElementById() {
      return makeElement(FakeHTMLElement);
    },
    querySelector() {
      return makeElement(FakeHTMLElement);
    },
    querySelectorAll() {
      return [];
    },
    body: makeElement(FakeHTMLElement),
    documentElement: makeElement(FakeHTMLElement),
    createElement() {
      return makeElement(FakeHTMLElement);
    }
  };
  const context = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    setTimeout() { return 0; },
    clearTimeout: noop,
    setInterval() { return 0; },
    clearInterval: noop,
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame: noop,
    TextEncoder,
    TextDecoder,
    URL,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    Map,
    Set,
    Uint8Array,
    AbortController,
    crypto: globalThis.crypto,
    btoa(value) { return Buffer.from(value, "binary").toString("base64"); },
    atob(value) { return Buffer.from(value, "base64").toString("binary"); },
    navigator: {
      onLine: true,
      userAgent: "automatex-pos-renewal-router-test"
    },
    localStorage: storage,
    sessionStorage: createStorage(),
    document,
    HTMLElement: FakeHTMLElement,
    HTMLInputElement: FakeHTMLElement,
    HTMLFormElement: FakeHTMLElement,
    HTMLButtonElement: FakeHTMLElement,
    Event: function Event() {},
    CustomEvent: function CustomEvent() {},
    location: {
      protocol: "https:",
      href: `${LOCAL_POS_ORIGIN}/`
    },
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: noop,
    matchMedia() {
      return {
        matches: false,
        addEventListener: noop,
        removeEventListener: noop
      };
    },
    window: null,
    self: null
  };
  context.window = context;
  context.self = context;
  return context;
}

function loadActualPosVerifier(publicJwk) {
  assert.ok(fs.existsSync(POS_STANDARD_SOURCE_PATH), "POS Standard source must be available for endpoint compatibility testing.");
  const source = fs.readFileSync(POS_STANDARD_SOURCE_PATH, "utf8");
  assert.equal(source.includes(TRUST_BOUNDARY_SOURCE), true, "POS public-key trust boundary has drifted.");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-renewal-router-verifier-copy-"));
  const tempFile = path.join(tempDir, "app.js");
  const copiedSource = source.replace(
    TRUST_BOUNDARY_SOURCE,
    `const STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = ${JSON.stringify(publicJwk)};`
  ) + `
;window.__posExports = {
  normalizeStandardActivationResponsePayload,
  createStandardInternalLicenceVerificationOptions,
  verifyStandardSignedLicencePayload
};`;
  fs.writeFileSync(tempFile, copiedSource);
  const context = createPosVmContext();
  try {
    vm.runInNewContext(fs.readFileSync(tempFile, "utf8"), context, {
      filename: tempFile,
      timeout: 5000
    });
    return {
      exports: context.__posExports,
      context,
      cleanup() {
        if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-renewal-router-verifier-copy-"))) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    };
  } catch (error) {
    if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-renewal-router-verifier-copy-"))) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

function seedPosInstallationIdentity(pos, deviceInstallationId = DEVICE_ID) {
  pos.context.localStorage.setItem("automatex-pos-standard-device-identity-v1", JSON.stringify({
    schemaVersion: 1,
    deviceInstallationId,
    createdAt: ACTIVATION_NOW.toISOString()
  }));
}

async function countState(fixture) {
  const code = await PosActivationCode.findById(fixture.activationCode._id).lean();
  const licence = await PosLicence.findById(fixture.licence._id).lean();
  return {
    installations: await PosInstallation.countDocuments({}),
    issues: await PosLicenceIssue.countDocuments({}),
    activationCodes: await PosActivationCode.countDocuments({}),
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

function assertNoSensitiveErrorDetails(body, fixture = null) {
  const text = JSON.stringify(body);
  assert.equal(text.includes("stack"), false);
  assert.equal(text.includes("codeHash"), false);
  assert.equal(text.includes("renewalCredential"), false);
  assert.equal(text.includes("renewalCredentialHash"), false);
  assert.equal(text.includes("signedPayload"), false);
  if (fixture) {
    assert.equal(text.includes(fixture.rawRenewalCredential), false);
    assert.equal(text.includes(fixture.renewalCredentialDigest), false);
    assert.equal(text.includes(fixture.plaintextCode), false);
    assert.equal(text.includes(fixture.lastSignature), false);
    assert.equal(text.includes(String(fixture.client._id)), false);
    assert.equal(text.includes(String(fixture.licence._id)), false);
  }
}

function assertNoSensitiveLogEntries(...values) {
  const logs = logCapture.join("\n");
  values.filter(Boolean).forEach((value) => {
    assert.equal(logs.includes(String(value)), false);
  });
}

if (!RUN_RENEWAL_ROUTER) {
  test("POS renewal machine router integration tests require explicit disposable replica-set opt-in", {
    skip: "Set AUTOMATEX_POS_RENEWAL_ROUTER_INTEGRATION=1 to run these isolated HTTP/MongoDB tests."
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

  test("valid authenticated renewal is accepted by the actual POS verifier", async () => {
    const fixture = await createRenewalFixture();
    const response = await postRenewal(renewalRequest(fixture), { origin: LOCAL_POS_ORIGIN });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("access-control-allow-origin"), LOCAL_POS_ORIGIN);
    const body = await responseJson(response);
    assert.equal(body.installationId, DEVICE_ID);
    assert.equal(body.offlineValidUntil, futureDate(RENEWAL_NOW, 7).toISOString());

    const pos = loadActualPosVerifier(keyPair.publicKey.export({ format: "jwk" }));
    try {
      seedPosInstallationIdentity(pos);
      const normalized = pos.exports.normalizeStandardActivationResponsePayload(body);
      assert.equal(normalized.installationId, DEVICE_ID);
      const verified = await pos.exports.verifyStandardSignedLicencePayload(body, pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_ID,
        now: "2026-09-21T00:00:00.000Z"
      }));
      assert.equal(verified.clientId, String(fixture.client._id));
    } finally {
      pos.cleanup();
    }

    await assertCounts(fixture, {
      installations: 1,
      issues: 2,
      activationCodes: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 1,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("expired previous offline window renews, but expired licence and missing policy are sanitized", async () => {
    const fixture = await createRenewalFixture({ initialOfflineValidUntil: futureDate(ACTIVATION_NOW, 1) });
    const renewed = await postRenewal(renewalRequest(fixture), { origin: LOCAL_POS_ORIGIN });
    assert.equal(renewed.status, 200);

    await resetCollections();
    const expiredLicence = await createRenewalFixture();
    await PosLicence.updateOne({ _id: expiredLicence.licence._id }, { $set: { licenceExpiry: futureDate(RENEWAL_NOW, -1) } });
    const expired = await postRenewal(renewalRequest(expiredLicence), { origin: LOCAL_POS_ORIGIN });
    assert.equal(expired.status, 403);
    const expiredBody = await responseJson(expired);
    assert.equal(expiredBody.message, "Renewal request was not accepted.");
    assertNoSensitiveErrorDetails(expiredBody, expiredLicence);

    await resetCollections();
    const missingPolicy = await createRenewalFixture();
    await PosLicence.updateOne({ _id: missingPolicy.licence._id }, { $set: { renewalWindowDurationMinutes: null } });
    const missing = await postRenewal(renewalRequest(missingPolicy), { origin: LOCAL_POS_ORIGIN });
    assert.equal(missing.status, 503);
    assert.deepEqual(await responseJson(missing), {
      message: "Renewal service is unavailable.",
      retryable: true
    });
  });

  test("wrong credential, device, signature, digest substitution and Company sessions do not authenticate", async () => {
    const fixture = await createRenewalFixture();
    for (const overrides of [
      { renewalCredential: clientGeneratedRenewalCredential() },
      { deviceInstallationId: DEVICE_ID_2 },
      { lastSignature: Buffer.from(crypto.randomBytes(64)).toString("base64") }
    ]) {
      const response = await postRenewal(renewalRequest(fixture, overrides), {
        origin: LOCAL_POS_ORIGIN,
        headers: {
          Cookie: adminSessionCookie(),
          Authorization: `Bearer ${jwt.sign({ id: "admin", role: "admin", permissions: ["*"] }, process.env.JWT_SECRET)}`
        }
      });
      assert.equal(response.status, 403);
      const body = await responseJson(response);
      assert.equal(body.message, "Renewal request was not accepted.");
      assertNoSensitiveErrorDetails(body, fixture);
    }

    const digest = await postRenewal(renewalRequest(fixture, { renewalCredential: fixture.renewalCredentialDigest }), { origin: LOCAL_POS_ORIGIN });
    assert.equal(digest.status, 400);
    assertNoSensitiveErrorDetails(await responseJson(digest), fixture);
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      activationCodes: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("unknown, malformed, oversized, non-JSON and query-string requests are rejected with no-store", async () => {
    const fixture = await createRenewalFixture();
    const cases = [
      await postRenewal({ ...renewalRequest(fixture), clientId: String(fixture.client._id) }, { origin: LOCAL_POS_ORIGIN }),
      await postRenewal({ ...renewalRequest(fixture), lastSignature: { $ne: "safe" } }, { origin: LOCAL_POS_ORIGIN }),
      await postRenewal(renewalRequest(fixture), { origin: LOCAL_POS_ORIGIN, query: `?renewalCredential=${encodeURIComponent(fixture.rawRenewalCredential)}` }),
      await postRenewal({}, { origin: LOCAL_POS_ORIGIN, rawBody: JSON.stringify({ padding: "x".repeat(3000) }) }),
      await postRenewal(renewalRequest(fixture), {
        origin: LOCAL_POS_ORIGIN,
        contentType: "text/plain",
        rawBody: JSON.stringify(renewalRequest(fixture))
      })
    ];
    assert.deepEqual(cases.map((response) => response.status), [400, 400, 400, 413, 415]);
    for (const response of cases) {
      assert.equal(response.headers.get("cache-control"), "no-store");
      assertNoSensitiveErrorDetails(await responseJson(response), fixture);
    }
  });

  test("narrow CORS, preflight and endpoint-specific rate limiting are enforced", async () => {
    await startIsolatedApp({ renewalRateLimit: { windowMs: 60 * 1000, limit: 1 } });
    const fixture = await createRenewalFixture();
    const first = await postRenewal(renewalRequest(fixture), { origin: LOCAL_POS_ORIGIN });
    assert.equal(first.status, 200);

    const limited = await postRenewal(renewalRequest(fixture), { origin: LOCAL_POS_ORIGIN });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("cache-control"), "no-store");
    assert.deepEqual(await responseJson(limited), {
      message: "Too many renewal attempts. Try again later.",
      retryable: true
    });

    await startIsolatedApp();
    const preflight = await fetch(`${baseUrl}/standard/renew`, {
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

    const blocked = await postRenewal(renewalRequest(fixture), { origin: "https://evil.example.test" });
    assert.equal(blocked.status, 403);
    assertNoSensitiveErrorDetails(await responseJson(blocked), fixture);
  });

  test("signing, database and audit failure responses are sanitized", async () => {
    const fixture = await createRenewalFixture();
    await startIsolatedApp({ keyProvider: { async getPrivateKey() { return null; } } });
    const signing = await postRenewal(renewalRequest(fixture), { origin: LOCAL_POS_ORIGIN });
    assert.equal(signing.status, 503);
    assert.deepEqual(await responseJson(signing), {
      message: "Renewal service is unavailable.",
      retryable: true
    });
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      activationCodes: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });

    await startIsolatedApp({
      renewalService: {
        async renewLicence() {
          throw new Error("database secret connection string mongodb://example");
        }
      }
    });
    const database = await postRenewal(renewalRequest(fixture), { origin: LOCAL_POS_ORIGIN });
    assert.equal(database.status, 503);
    assertNoSensitiveErrorDetails(await responseJson(database), fixture);

    await startIsolatedApp({
      renewalService: createPosLicenceRenewalService({
        keyProvider: createKeyProvider(),
        clock: () => new Date(currentNow),
        auditLogger: { async create() { throw new Error("audit unavailable"); } }
      })
    });
    const audit = await postRenewal(renewalRequest(fixture), { origin: LOCAL_POS_ORIGIN });
    assert.equal(audit.status, 503);
    assertNoSensitiveErrorDetails(await responseJson(audit), fixture);
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      activationCodes: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("lost response retry and concurrent identical renewals return one committed payload", async () => {
    const fixture = await createRenewalFixture();
    const request = renewalRequest(fixture);
    const [first, second] = await Promise.all([
      postRenewal(request, { origin: LOCAL_POS_ORIGIN }),
      postRenewal(request, { origin: LOCAL_POS_ORIGIN })
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const bodies = await Promise.all([responseJson(first), responseJson(second)]);
    assert.deepEqual(bodies[1], bodies[0]);

    const retry = await postRenewal(request, { origin: LOCAL_POS_ORIGIN });
    assert.equal(retry.status, 200);
    assert.deepEqual(await responseJson(retry), bodies[0]);
    await assertCounts(fixture, {
      installations: 1,
      issues: 2,
      activationCodes: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 1,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("expired stored replay is stale and historical signatures cannot branch", async () => {
    const fixture = await createRenewalFixture({ renewalWindowDurationMinutes: 1 });
    const request = renewalRequest(fixture);
    const first = await postRenewal(request, { origin: LOCAL_POS_ORIGIN });
    assert.equal(first.status, 200);
    const firstBody = await responseJson(first);
    currentNow = new Date("2026-09-20T00:02:00.000Z");
    const stale = await postRenewal(request, { origin: LOCAL_POS_ORIGIN });
    assert.equal(stale.status, 409);
    assert.deepEqual(await responseJson(stale), { message: "Renewal request is stale." });

    await resetCollections();
    const chain = await createRenewalFixture();
    const firstRenewal = await postRenewal(renewalRequest(chain), { origin: LOCAL_POS_ORIGIN });
    const firstRenewalBody = await responseJson(firstRenewal);
    currentNow = new Date("2026-09-20T00:01:00.000Z");
    const secondRenewal = await postRenewal(renewalRequest({ ...chain, lastSignature: firstRenewalBody.signature }), { origin: LOCAL_POS_ORIGIN });
    assert.equal(secondRenewal.status, 200);
    const oldSignatureReplay = await postRenewal(renewalRequest(chain), { origin: LOCAL_POS_ORIGIN });
    assert.equal(oldSignatureReplay.status, 200);
    assert.deepEqual(await responseJson(oldSignatureReplay), firstRenewalBody);
    await assertCounts(chain, {
      installations: 1,
      issues: 3,
      activationCodes: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 2,
      redeemedCount: 1,
      activationCount: 1
    });
    assert.equal(firstBody.installationId, DEVICE_ID);
  });

  test("secret material is absent from logs, audits, ordinary DTOs, errors and public assets", async () => {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    console.error = (...args) => logCapture.push(args.join(" "));
    console.warn = (...args) => logCapture.push(args.join(" "));
    let fixture;
    let body;
    try {
      fixture = await createRenewalFixture();
      const response = await postRenewal(renewalRequest(fixture), { origin: LOCAL_POS_ORIGIN });
      assert.equal(response.status, 200);
      body = await responseJson(response);
      const failure = await postRenewal(renewalRequest(fixture, { renewalCredential: clientGeneratedRenewalCredential() }), { origin: LOCAL_POS_ORIGIN });
      assertNoSensitiveErrorDetails(await responseJson(failure), fixture);
    } finally {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    }

    const ordinarySnapshot = JSON.stringify({
      installations: await PosInstallation.find({}).lean(),
      activationCodes: await PosActivationCode.find({}).lean(),
      issues: await PosLicenceIssue.find({}).lean(),
      audits: await AuditLog.find({}).lean()
    });
    assert.equal(ordinarySnapshot.includes(fixture.rawRenewalCredential), false);
    assert.equal(ordinarySnapshot.includes(fixture.renewalCredentialDigest), false);
    assert.equal(ordinarySnapshot.includes(fixture.plaintextCode), false);
    assert.equal(ordinarySnapshot.includes(fixture.lastSignature), false);
    assert.equal(ordinarySnapshot.includes(body.signature), false);
    assertNoSensitiveLogEntries(fixture.rawRenewalCredential, fixture.renewalCredentialDigest, fixture.lastSignature, body.signature);

    const rootDir = path.join(__dirname, "..", "..");
    const publicMatches = [];
    function scanPublic(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          scanPublic(fullPath);
        } else if (/\.(js|html|css)$/i.test(entry.name)) {
          const source = fs.readFileSync(fullPath, "utf8");
          if (/standard\/renew|posLicenceRenewalService|renewalCredential|renewalWindowDurationMinutes/.test(source)) {
            publicMatches.push(fullPath);
          }
        }
      }
    }
    scanPublic(path.join(rootDir, "public"));
    assert.deepEqual(publicMatches, []);
  });

  test("renewal router remains unmounted from production startup, admin routes, UI and POS source", () => {
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
      assert.doesNotMatch(source, /standard\/renew|posLicenceRenewalService|renewLicence|renewalWindowDurationMinutes/);
    }

    const posSource = fs.readFileSync(POS_STANDARD_SOURCE_PATH, "utf8");
    assert.equal(posSource.includes(TRUST_BOUNDARY_SOURCE), true);
  });
}
