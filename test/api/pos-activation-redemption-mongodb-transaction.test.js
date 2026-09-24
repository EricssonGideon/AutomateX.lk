const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const mongoose = require("mongoose");

const AuditLog = require("../../server/models/AuditLog");
const PosActivationCode = require("../../server/models/PosActivationCode");
const PosInstallation = require("../../server/models/PosInstallation");
const PosLicence = require("../../server/models/PosLicence");
const PosLicenceIssue = require("../../server/models/PosLicenceIssue");
const PosPackage = require("../../server/models/PosPackage");
const Project = require("../../server/models/Project");
const User = require("../../server/models/User");
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

const RUN_REDEMPTION_TX = process.env.AUTOMATEX_POS_REDEMPTION_TX === "1";
const TEST_DB_PREFIX = "automatex_pos_redemption_tx_";
const REPLICA_SET_NAME = "rs_pos_redemption_tx";
const POS_STANDARD_SOURCE_PATH = "/Users/robertericsson/AutomateX/Systems/AutomateX POS Systems/POS-Standard Original/app.js";
const TRUST_BOUNDARY_SOURCE = "const STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = null;";
const NOW = new Date("2026-08-31T00:00:00.000Z");
const DEVICE_ID = "123e4567-e89b-42d3-a456-426614174000";
const DEVICE_ID_2 = "123e4567-e89b-42d3-a456-426614174001";
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
let keyPair = null;
let service = null;

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
  assert.match(name, /^automatex_pos_redemption_tx_[a-z0-9_]+$/);
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
    throw new Error("A local mongod executable is required for POS redemption transaction verification.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-redemption-tx-"));
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
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-redemption-tx-"))) {
      fs.rmSync(mongoDbPath, { recursive: true, force: true });
    }
  }
}

function futureDate(days) {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return date;
}

async function resetCollections() {
  assertSafeMongoTarget(mongoUri, dbName);
  assert.equal(mongoose.connection.name, dbName);
  await Promise.all(MODEL_SET.map((model) => model.deleteMany({})));
  keyPair = crypto.generateKeyPairSync("ed25519");
  service = createPosActivationRedemptionService({
    keyProvider: {
      keyId: "automatex-pos-prod-ed25519-v1",
      async getPrivateKey() {
        return keyPair.privateKey;
      }
    },
    clock: () => new Date(NOW)
  });
}

async function createActivationFixture(options = {}) {
  const stamp = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const client = await User.create({
    name: "Redemption Client",
    email: `redemption-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Redemption POS",
    projectType: "POS System"
  });
  const posPackage = await PosPackage.create({
    packageCode: `standard-redemption-${stamp}`,
    name: "Redemption Standard",
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
      userAgent: "automatex-pos-redemption-test"
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
      href: "https://pos-redemption.example.test/"
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
  assert.ok(fs.existsSync(POS_STANDARD_SOURCE_PATH), "POS Standard source must be available for compatibility testing.");
  const source = fs.readFileSync(POS_STANDARD_SOURCE_PATH, "utf8");
  assert.equal(source.includes(TRUST_BOUNDARY_SOURCE), true, "POS public-key trust boundary has drifted.");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-redemption-verifier-copy-"));
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
        if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-redemption-verifier-copy-"))) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    };
  } catch (error) {
    if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-redemption-verifier-copy-"))) {
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

function assertServiceError(error, code) {
  assert.equal(error && error.code, code);
  return true;
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

if (!RUN_REDEMPTION_TX) {
  test("POS activation redemption transaction tests require explicit disposable replica-set opt-in", {
    skip: "Set AUTOMATEX_POS_REDEMPTION_TX=1 to run these isolated MongoDB transaction tests."
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

  test("successful redemption persists coordinated records and actual POS accepts the response", async () => {
    const fixture = await createActivationFixture();
    const result = await service.redeemActivation(activationRequest(fixture.plaintextCode));
    assert.equal(result.retry, false);
    assert.equal(result.signedLicence.installationId, DEVICE_ID);
    assert.equal(result.signedLicence.clientId, String(fixture.client._id));
    assert.equal(result.signedLicence.offlineValidUntil, fixture.licence.offlineValidUntil.toISOString());
    assert.equal(result.signedLicence.keyId, "automatex-pos-prod-ed25519-v1");

    const pos = loadActualPosVerifier(keyPair.publicKey.export({ format: "jwk" }));
    try {
      seedPosInstallationIdentity(pos);
      const response = pos.exports.normalizeStandardActivationResponsePayload(result.signedLicence);
      assert.equal(response.installationId, DEVICE_ID);
      const verified = await pos.exports.verifyStandardSignedLicencePayload(result.signedLicence, pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_ID,
        now: "2026-09-01T00:00:00.000Z"
      }));
      assert.equal(verified.clientId, String(fixture.client._id));
    } finally {
      pos.cleanup();
    }

    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);
    const issue = await PosLicenceIssue.findOne({}).select("+signedPayload").lean();
    assert.deepEqual(issue.signedPayload, result.signedLicence);
    assert.equal(await PosLicenceIssue.countDocuments({ activationCodeId: fixture.activationCode._id }), 1);
    const ordinaryIssue = await PosLicenceIssue.findById(issue._id).lean();
    assert.equal(Object.prototype.hasOwnProperty.call(ordinaryIssue, "signedPayload"), false);
    const storedCode = await PosActivationCode.findById(fixture.activationCode._id).lean();
    assert.equal(Object.prototype.hasOwnProperty.call(storedCode, "codeHash"), false);
    assert.equal(JSON.stringify(await AuditLog.find({}).lean()).includes(fixture.plaintextCode), false);
  });

  test("invalid, expired, revoked, exhausted and malformed requests are rejected without writes", async () => {
    const invalidFixture = await createActivationFixture();
    await assert.rejects(
      () => service.redeemActivation(activationRequest("not-a-code")),
      (error) => assertServiceError(error, "invalid_activation_code")
    );
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, invalidFixture);

    await resetCollections();
    const expired = await createActivationFixture({ codeExpiresAt: futureDate(-1) });
    await assert.rejects(
      () => service.redeemActivation(activationRequest(expired.plaintextCode)),
      (error) => assertServiceError(error, "activation_code_expired")
    );
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, expired);

    await resetCollections();
    const revoked = await createActivationFixture({ codeStatus: "revoked" });
    await assert.rejects(
      () => service.redeemActivation(activationRequest(revoked.plaintextCode)),
      (error) => assertServiceError(error, "activation_code_revoked")
    );
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, revoked);

    await resetCollections();
    const exhausted = await createActivationFixture({ codeStatus: "redeemed", redeemedCount: 1, maxRedemptions: 1 });
    await assert.rejects(
      () => service.redeemActivation(activationRequest(exhausted.plaintextCode)),
      (error) => assertServiceError(error, "activation_code_exhausted")
    );
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 1, activationCount: 0 }, exhausted);

    await resetCollections();
    const malformed = await createActivationFixture();
    await assert.rejects(
      () => service.redeemActivation(activationRequest(malformed.plaintextCode, { deviceInstallationId: "bad-id" })),
      (error) => assertServiceError(error, "invalid_installation")
    );
    await assert.rejects(
      () => service.redeemActivation(activationRequest(malformed.plaintextCode, { edition: "premium" })),
      (error) => assertServiceError(error, "invalid_request")
    );
    await assert.rejects(
      () => service.redeemActivation({ ...activationRequest(malformed.plaintextCode), signedPayload: {} }),
      (error) => assertServiceError(error, "protected_field")
    );
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, malformed);
  });

  test("ineligible licence, package, and missing explicit policy reject redemption", async () => {
    for (const [options, code] of [
      [{ licenceStatus: "draft" }, "licence_not_eligible"],
      [{ packageStatus: "draft" }, "package_not_published"],
      [{ licenceExpiry: futureDate(-1) }, "licence_expired"],
      [{ offlineValidUntil: null }, "missing_offline_policy"],
      [{ offlineValidUntil: futureDate(-1) }, "offline_window_expired"],
      [{ offlineValidUntil: futureDate(90) }, "invalid_offline_policy"],
      [{ maxInstallations: null }, "missing_installation_policy"]
    ]) {
      await resetCollections();
      const fixture = await createActivationFixture(options);
      await assert.rejects(
        () => service.redeemActivation(activationRequest(fixture.plaintextCode)),
        (error) => assertServiceError(error, code)
      );
      await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, fixture);
    }
  });

  test("same-code same-device retry returns identical response without duplicate writes", async () => {
    const fixture = await createActivationFixture();
    const first = await service.redeemActivation(activationRequest(fixture.plaintextCode));
    const retry = await service.redeemActivation(activationRequest(fixture.plaintextCode));
    assert.equal(retry.retry, true);
    assert.deepEqual(retry.signedLicence, first.signedLicence);
    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);

    await PosActivationCode.updateOne({ _id: fixture.activationCode._id }, { $set: { status: "revoked" } });
    await assert.rejects(
      () => service.redeemActivation(activationRequest(fixture.plaintextCode)),
      (error) => assertServiceError(error, "activation_code_revoked")
    );
    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);
  });

  test("expired committed response cannot renew through retry", async () => {
    const fixture = await createActivationFixture({ offlineValidUntil: futureDate(1) });
    const first = await service.redeemActivation(activationRequest(fixture.plaintextCode));
    assert.ok(first.signedLicence.signature);
    const laterService = createPosActivationRedemptionService({
      keyProvider: {
        keyId: "automatex-pos-prod-ed25519-v1",
        async getPrivateKey() {
          return keyPair.privateKey;
        }
      },
      clock: () => futureDate(2)
    });
    await assert.rejects(
      () => laterService.redeemActivation(activationRequest(fixture.plaintextCode)),
      (error) => assertServiceError(error, "offline_window_expired")
    );
    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);
  });

  test("concurrent same-device redemption creates one installation, issue and audit", async () => {
    const fixture = await createActivationFixture({ maxRedemptions: 1, maxInstallations: 2 });
    const results = await Promise.allSettled([
      service.redeemActivation(activationRequest(fixture.plaintextCode)),
      service.redeemActivation(activationRequest(fixture.plaintextCode))
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.deepEqual(results[0].value.signedLicence, results[1].value.signedLicence);
    assert.equal(results.some((result) => result.value.retry), true);
    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);
  });

  test("concurrent different-device redemption at code limit allows one device only", async () => {
    const fixture = await createActivationFixture({ maxRedemptions: 1, maxInstallations: 3 });
    const results = await Promise.allSettled([
      service.redeemActivation(activationRequest(fixture.plaintextCode, { deviceInstallationId: DEVICE_ID })),
      service.redeemActivation(activationRequest(fixture.plaintextCode, { deviceInstallationId: DEVICE_ID_2 }))
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);
  });

  test("concurrent different-code activations at installation limit allow one installation only", async () => {
    const fixture = await createActivationFixture({ maxRedemptions: 1, maxInstallations: 1 });
    const secondPlaintextCode = generateActivationCode();
    await PosActivationCode.create({
      licenceId: fixture.licence._id,
      codeHash: digestActivationCode(secondPlaintextCode),
      status: "active",
      expiresAt: futureDate(7),
      maxRedemptions: 1,
      redeemedCount: 0
    });

    const results = await Promise.allSettled([
      service.redeemActivation(activationRequest(fixture.plaintextCode, { deviceInstallationId: DEVICE_ID })),
      service.redeemActivation(activationRequest(secondPlaintextCode, { deviceInstallationId: DEVICE_ID_2 }))
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(await PosInstallation.countDocuments({ licenceId: fixture.licence._id }), 1);
    assert.equal(await PosLicenceIssue.countDocuments({ licenceId: fixture.licence._id }), 1);
    assert.equal(await AuditLog.countDocuments({ action: "licences.activation-code.redeem" }), 1);
    assert.equal((await PosLicence.findById(fixture.licence._id).lean()).activationCount, 1);
  });

  test("revocation versus redemption race commits only one outcome", async () => {
    const fixture = await createActivationFixture();
    const revoke = async () => {
      const session = await mongoose.connection.startSession();
      try {
        await session.withTransaction(async () => {
          const updated = await PosActivationCode.findOneAndUpdate(
            { _id: fixture.activationCode._id, status: "active", redeemedCount: 0 },
            { $set: { status: "revoked" } },
            { new: true, session }
          );
          if (!updated) {
            throw new Error("revoke-lost");
          }
        });
        return "revoked";
      } finally {
        await session.endSession();
      }
    };
    const results = await Promise.allSettled([
      service.redeemActivation(activationRequest(fixture.plaintextCode)),
      revoke()
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const code = await PosActivationCode.findById(fixture.activationCode._id).lean();
    if (code.status === "redeemed") {
      await assertCounts({ installations: 1, issues: 1, audits: 1, redeemedCount: 1, activationCount: 1 }, fixture);
    } else {
      assert.equal(code.status, "revoked");
      await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, fixture);
    }
  });

  test("signing and audit failure roll back all redemption writes", async () => {
    const missingKeyFixture = await createActivationFixture();
    const missingKeyService = createPosActivationRedemptionService({
      keyProvider: {
        keyId: "automatex-pos-prod-ed25519-v1",
        async getPrivateKey() {
          return null;
        }
      },
      clock: () => new Date(NOW)
    });
    await assert.rejects(
      () => missingKeyService.redeemActivation(activationRequest(missingKeyFixture.plaintextCode)),
      /signing key is not available/
    );
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, missingKeyFixture);

    await resetCollections();
    const auditFailureFixture = await createActivationFixture();
    const auditFailureService = createPosActivationRedemptionService({
      keyProvider: {
        keyId: "automatex-pos-prod-ed25519-v1",
        async getPrivateKey() {
          return keyPair.privateKey;
        }
      },
      auditLogger: {
        async create() {
          throw new Error("audit unavailable");
        }
      },
      clock: () => new Date(NOW)
    });
    await assert.rejects(
      () => auditFailureService.redeemActivation(activationRequest(auditFailureFixture.plaintextCode)),
      /audit unavailable/
    );
    await assertCounts({ installations: 0, issues: 0, audits: 0, redeemedCount: 0, activationCount: 0 }, auditFailureFixture);
  });

  test("plaintext code stays out of stored records, audit logs, and default issue queries", async () => {
    const fixture = await createActivationFixture();
    const result = await service.redeemActivation(activationRequest(fixture.plaintextCode));
    assert.ok(result.signedLicence.signature);
    const stored = JSON.stringify({
      codes: await PosActivationCode.find({}).lean(),
      installations: await PosInstallation.find({}).lean(),
      issues: await PosLicenceIssue.find({}).lean(),
      audits: await AuditLog.find({}).lean()
    });
    assert.equal(stored.includes(fixture.plaintextCode), false);
    assert.equal(stored.includes("codeHash"), false);
    assert.equal(stored.includes("signedPayload"), false);
  });

  test("redemption service remains absent from production startup, routers, UI, and public assets", () => {
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
      assert.doesNotMatch(source, /posActivationRedemptionService|redeemActivation/);
    }

    const publicMatches = [];
    function scanPublic(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          scanPublic(fullPath);
        } else if (/\.(js|html|css)$/i.test(entry.name)) {
          const source = fs.readFileSync(fullPath, "utf8");
          if (/posActivationRedemptionService|redeemActivation|BEGIN PRIVATE KEY|PRIVATE KEY/.test(source)) {
            publicMatches.push(fullPath);
          }
        }
      }
    }
    scanPublic(path.join(rootDir, "public"));
    assert.deepEqual(publicMatches, []);
  });
}
