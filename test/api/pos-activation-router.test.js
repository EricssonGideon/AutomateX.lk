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

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-activation-router-test-secret";

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
  createPosActivationRedemptionService
} = require("../../server/services/posActivationRedemptionService");

const RUN_ACTIVATION_ROUTER = process.env.AUTOMATEX_POS_ACTIVATION_ROUTER_INTEGRATION === "1";
const TEST_DB_PREFIX = "automatex_pos_activation_api_it_";
const REPLICA_SET_NAME = "rs_pos_activation_api_it";
const POS_STANDARD_SOURCE_PATH = "/Users/robertericsson/AutomateX/Systems/AutomateX POS Systems/POS-Standard Original/app.js";
const TRUST_BOUNDARY_SOURCE = "const STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = null;";
const NOW = new Date("2026-08-31T00:00:00.000Z");
const DEVICE_ID = "123e4567-e89b-42d3-a456-426614174000";
const DEVICE_ID_2 = "123e4567-e89b-42d3-a456-426614174001";
const LOCAL_POS_ORIGIN = "https://pos-local.example.test";
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
  assert.match(name, /^automatex_pos_activation_api_it_[a-z0-9_]+$/);
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
    throw new Error("Part 57 requires a local mongod executable for disposable activation endpoint testing.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-activation-api-it-"));
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
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });
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
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-activation-api-it-"))) {
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
  const service = options.service || createPosActivationRedemptionService({
    keyProvider: options.keyProvider || createKeyProvider(),
    clock: options.clock || (() => new Date(NOW))
  });
  app.use("/pos-machine", createPosActivationRouter({
    allowedOrigins: options.allowedOrigins || [LOCAL_POS_ORIGIN],
    bodyLimit: options.bodyLimit || "2kb",
    rateLimit: options.rateLimit || { windowMs: 60 * 1000, limit: 30 },
    service
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
  await startIsolatedApp();
}

function futureDate(days) {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

async function createActivationFixture(options = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const client = await User.create({
    name: "Activation Client",
    email: `activation-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Activation POS Project",
    projectType: "POS System"
  });
  const posPackage = await PosPackage.create({
    packageCode: `standard-activation-${stamp}`,
    name: "Activation Standard",
    edition: POS_EDITION_STANDARD,
    status: options.packageStatus || "active",
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"]
  });
  const licence = await PosLicence.create({
    clientId: client._id,
    projectId: project._id,
    packageId: posPackage._id,
    edition: POS_EDITION_STANDARD,
    status: options.licenceStatus || "active",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: options.licenceExpiry || futureDate(60),
    supportExpiry: futureDate(90),
    offlineValidUntil: Object.prototype.hasOwnProperty.call(options, "offlineValidUntil") ? options.offlineValidUntil : futureDate(14),
    maxInstallations: Object.prototype.hasOwnProperty.call(options, "maxInstallations") ? options.maxInstallations : 2,
    activationCount: options.activationCount || 0
  });
  const plaintextCode = generateActivationCode();
  const activationCode = await PosActivationCode.create({
    licenceId: licence._id,
    codeHash: digestActivationCode(plaintextCode),
    status: options.codeStatus || "active",
    expiresAt: options.codeExpiresAt || futureDate(7),
    maxRedemptions: options.maxRedemptions || 1,
    redeemedCount: options.redeemedCount || 0
  });

  return {
    activationCode,
    client,
    licence,
    plaintextCode,
    posPackage,
    project
  };
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

async function postActivation(payload, options = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": options.contentType || "application/json",
    ...(options.origin ? { Origin: options.origin } : {}),
    ...(options.headers || {})
  };
  return fetch(`${baseUrl}/standard/activate${options.query || ""}`, {
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
  class FixedDate extends Date {
    constructor(...args) {
      super(args.length ? args[0] : NOW.toISOString());
    }

    static now() {
      return NOW.getTime();
    }
  }
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
    console: {
      log() {},
      info() {},
      warn() {},
      error() {}
    },
    setTimeout() {
      return 0;
    },
    clearTimeout: noop,
    setInterval() {
      return 0;
    },
    clearInterval: noop,
    requestAnimationFrame() {
      return 0;
    },
    cancelAnimationFrame: noop,
    TextEncoder,
    TextDecoder,
    URL,
    Date: FixedDate,
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
    btoa(value) {
      return Buffer.from(value, "binary").toString("base64");
    },
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    navigator: {
      onLine: true,
      userAgent: "automatex-pos-activation-router-test"
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-activation-router-verifier-copy-"));
  const tempFile = path.join(tempDir, "app.js");
  const copiedSource = source.replace(
    TRUST_BOUNDARY_SOURCE,
    `const STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = ${JSON.stringify(publicJwk)};`
  ) + `
;window.__posExports = {
  normalizeStandardActivationResponsePayload,
  requestStandardPosActivation,
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
        if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-activation-router-verifier-copy-"))) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    };
  } catch (error) {
    if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-activation-router-verifier-copy-"))) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

function seedPosInstallationIdentity(pos, deviceInstallationId = DEVICE_ID) {
  pos.context.localStorage.setItem("automatex-pos-standard-device-identity-v1", JSON.stringify({
    schemaVersion: 1,
    deviceInstallationId,
    createdAt: NOW.toISOString()
  }));
  pos.context.localStorage.setItem("automatex-pos-standard-installation-v1", JSON.stringify({
    schemaVersion: 1,
    status: "pending",
    createdAt: NOW.toISOString(),
    completedAt: null,
    source: "fresh"
  }));
}

async function assertCounts({ installations, issues, audits, redeemedCount, activationCount }, fixture = null) {
  assert.equal(await PosInstallation.countDocuments({}), installations);
  assert.equal(await PosLicenceIssue.countDocuments({}), issues);
  assert.equal(await AuditLog.countDocuments({ action: "licences.activation-code.redeem" }), audits);
  if (fixture) {
    const code = await PosActivationCode.findById(fixture.activationCode._id).lean();
    const licence = await PosLicence.findById(fixture.licence._id).lean();
    assert.equal(code.redeemedCount, redeemedCount);
    assert.equal(licence.activationCount, activationCount);
  }
}

function assertNoSensitiveErrorDetails(body, fixture = null) {
  const text = JSON.stringify(body);
  assert.equal(text.includes("stack"), false);
  assert.equal(text.includes("codeHash"), false);
  assert.equal(text.includes("signature"), false);
  if (fixture) {
    assert.equal(text.includes(fixture.plaintextCode), false);
    assert.equal(text.includes(String(fixture.client._id)), false);
    assert.equal(text.includes(String(fixture.licence._id)), false);
  }
}

if (!RUN_ACTIVATION_ROUTER) {
  test("POS activation machine router integration tests require explicit disposable replica-set opt-in", {
    skip: "Set AUTOMATEX_POS_ACTIVATION_ROUTER_INTEGRATION=1 to run these isolated HTTP/MongoDB tests."
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

  test("valid activation is accepted by the real POS activation response path", async () => {
    const fixture = await createActivationFixture();
    const pos = loadActualPosVerifier(keyPair.publicKey.export({ format: "jwk" }));
    try {
      seedPosInstallationIdentity(pos);
      const result = await pos.exports.requestStandardPosActivation({
        activationCode: fixture.plaintextCode,
        endpoint: "https://activation.local.test/standard/activate",
        timeoutMs: 5000,
        fetchFn: async (_endpoint, request) => {
          const response = await fetch(`${baseUrl}/standard/activate`, {
            method: request.method,
            headers: {
              ...request.headers,
              Origin: LOCAL_POS_ORIGIN
            },
            body: request.body
          });
          assert.equal(response.headers.get("cache-control"), "no-store");
          return response;
        }
      });
      assert.equal(result.ok, true);
      assert.equal(result.provider.licenceStatus, "active");
      assert.equal(result.provider.installationId, DEVICE_ID);
    } finally {
      pos.cleanup();
    }
    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);
  });

  test("Company System sessions do not substitute for a valid activation code", async () => {
    const fixture = await createActivationFixture();
    const response = await postActivation(activationRequest(generateActivationCode()), {
      headers: {
        Cookie: adminSessionCookie(),
        Authorization: `Bearer ${jwt.sign({ id: "admin", role: "admin", permissions: ["*"] }, process.env.JWT_SECRET)}`
      },
      origin: LOCAL_POS_ORIGIN
    });
    assert.equal(response.status, 403);
    const body = await responseJson(response);
    assert.equal(body.message, "Activation request was not accepted.");
    assertNoSensitiveErrorDetails(body, fixture);

    const missingCode = await postActivation(activationRequest(undefined), { origin: LOCAL_POS_ORIGIN });
    assert.equal(missingCode.status, 400);
    assertNoSensitiveErrorDetails(await responseJson(missingCode), fixture);
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, fixture);
  });

  test("malformed, unknown, oversized, query-string and unsupported content-type requests are rejected safely", async () => {
    const fixture = await createActivationFixture();
    const unknown = await postActivation({ ...activationRequest(fixture.plaintextCode), clientId: String(fixture.client._id) }, { origin: LOCAL_POS_ORIGIN });
    assert.equal(unknown.status, 400);
    assertNoSensitiveErrorDetails(await responseJson(unknown), fixture);

    const operator = await postActivation({ ...activationRequest(fixture.plaintextCode), runtime: { $ne: "browser" } }, { origin: LOCAL_POS_ORIGIN });
    assert.equal(operator.status, 400);
    assertNoSensitiveErrorDetails(await responseJson(operator), fixture);

    const queryString = await postActivation(activationRequest(fixture.plaintextCode), {
      origin: LOCAL_POS_ORIGIN,
      query: `?activationCode=${encodeURIComponent(fixture.plaintextCode)}`
    });
    assert.equal(queryString.status, 400);
    assertNoSensitiveErrorDetails(await responseJson(queryString), fixture);

    const oversized = await postActivation({}, {
      origin: LOCAL_POS_ORIGIN,
      rawBody: JSON.stringify({ padding: "x".repeat(3000) })
    });
    assert.equal(oversized.status, 413);
    assertNoSensitiveErrorDetails(await responseJson(oversized), fixture);

    const contentType = await postActivation(activationRequest(fixture.plaintextCode), {
      origin: LOCAL_POS_ORIGIN,
      contentType: "text/plain",
      rawBody: JSON.stringify(activationRequest(fixture.plaintextCode))
    });
    assert.equal(contentType.status, 415);
    assertNoSensitiveErrorDetails(await responseJson(contentType), fixture);
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, fixture);
  });

  test("rate limiting, cache headers, sanitized errors and narrow CORS behavior are enforced", async () => {
    await startIsolatedApp({ rateLimit: { windowMs: 60 * 1000, limit: 1 } });
    const fixture = await createActivationFixture({ maxRedemptions: 2, maxInstallations: 2 });
    const first = await postActivation(activationRequest(fixture.plaintextCode), { origin: LOCAL_POS_ORIGIN });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "no-store");
    assert.equal(first.headers.get("access-control-allow-origin"), LOCAL_POS_ORIGIN);

    const limited = await postActivation(activationRequest(fixture.plaintextCode, { deviceInstallationId: DEVICE_ID_2 }), { origin: LOCAL_POS_ORIGIN });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("cache-control"), "no-store");
    const limitedBody = await responseJson(limited);
    assert.deepEqual(limitedBody, {
      message: "Too many activation attempts. Try again later.",
      retryable: true
    });
    assertNoSensitiveErrorDetails(limitedBody, fixture);

    await startIsolatedApp();
    const preflight = await fetch(`${baseUrl}/standard/activate`, {
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

    const blockedOrigin = await postActivation(activationRequest(fixture.plaintextCode), { origin: "https://evil.example.test" });
    assert.equal(blockedOrigin.status, 403);
    assertNoSensitiveErrorDetails(await responseJson(blockedOrigin), fixture);
  });

  test("signing and database failure responses are sanitized and retryable", async () => {
    const missingKeyFixture = await createActivationFixture();
    await startIsolatedApp({
      keyProvider: {
        async getPrivateKey() {
          return null;
        }
      }
    });
    const signing = await postActivation(activationRequest(missingKeyFixture.plaintextCode), { origin: LOCAL_POS_ORIGIN });
    assert.equal(signing.status, 503);
    assert.deepEqual(await responseJson(signing), {
      message: "Activation service is unavailable.",
      retryable: true
    });
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, missingKeyFixture);

    await startIsolatedApp({
      service: {
        async redeemActivation() {
          throw new Error("database secret connection string mongodb://example");
        }
      }
    });
    const database = await postActivation(activationRequest(missingKeyFixture.plaintextCode), { origin: LOCAL_POS_ORIGIN });
    assert.equal(database.status, 503);
    const body = await responseJson(database);
    assert.deepEqual(body, {
      message: "Activation service is unavailable.",
      retryable: true
    });
    assertNoSensitiveErrorDetails(body, missingKeyFixture);
  });

  test("lost-response retry and concurrent identical requests return one committed activation result", async () => {
    const fixture = await createActivationFixture();
    const lost = await postActivation(activationRequest(fixture.plaintextCode), { origin: LOCAL_POS_ORIGIN });
    assert.equal(lost.status, 200);
    const lostPayload = await responseJson(lost);

    const retry = await postActivation(activationRequest(fixture.plaintextCode), { origin: LOCAL_POS_ORIGIN });
    assert.equal(retry.status, 200);
    assert.deepEqual(await responseJson(retry), lostPayload);
    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);

    await resetCollections();
    const concurrent = await createActivationFixture();
    const results = await Promise.all([
      postActivation(activationRequest(concurrent.plaintextCode), { origin: LOCAL_POS_ORIGIN }),
      postActivation(activationRequest(concurrent.plaintextCode), { origin: LOCAL_POS_ORIGIN })
    ]);
    assert.equal(results.every((response) => response.status === 200), true);
    const bodies = await Promise.all(results.map((response) => responseJson(response)));
    assert.deepEqual(bodies[0], bodies[1]);
    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, concurrent);
  });

  test("one-use exhausted code allows legitimate same-device replay but denies a different device", async () => {
    const fixture = await createActivationFixture({ maxRedemptions: 1, maxInstallations: 2 });
    const first = await postActivation(activationRequest(fixture.plaintextCode), { origin: LOCAL_POS_ORIGIN });
    assert.equal(first.status, 200);
    const firstBody = await responseJson(first);
    const sameDevice = await postActivation(activationRequest(fixture.plaintextCode), { origin: LOCAL_POS_ORIGIN });
    assert.equal(sameDevice.status, 200);
    assert.deepEqual(await responseJson(sameDevice), firstBody);

    const differentDevice = await postActivation(
      activationRequest(fixture.plaintextCode, { deviceInstallationId: DEVICE_ID_2 }),
      { origin: LOCAL_POS_ORIGIN }
    );
    assert.equal(differentDevice.status, 403);
    assertNoSensitiveErrorDetails(await responseJson(differentDevice), fixture);
    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);
  });

  test("activation router remains unmounted from production startup, admin routes, UI, public assets, and POS source", () => {
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
      assert.doesNotMatch(source, /routes\/posActivation|controllers\/posActivationController|standard\/activate|posActivationRedemptionService|redeemActivation/);
    }

    const publicMatches = [];
    function scanPublic(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          scanPublic(fullPath);
        } else if (/\.(js|html|css)$/i.test(entry.name)) {
          const source = fs.readFileSync(fullPath, "utf8");
          if (/routes\/posActivation|controllers\/posActivationController|standard\/activate|BEGIN PRIVATE KEY|PRIVATE KEY/.test(source)) {
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
