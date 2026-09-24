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

const RUN_RENEWAL_TX = process.env.AUTOMATEX_POS_RENEWAL_TX === "1";
const TEST_DB_PREFIX = "automatex_pos_renewal_tx_";
const REPLICA_SET_NAME = "rs_pos_renewal_tx";
const POS_STANDARD_SOURCE_PATH = "/Users/robertericsson/AutomateX/Systems/AutomateX POS Systems/POS-Standard Original/app.js";
const TRUST_BOUNDARY_SOURCE = "const STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = null;";
const ACTIVATION_NOW = new Date("2026-08-31T00:00:00.000Z");
const RENEWAL_NOW = new Date("2026-09-20T00:00:00.000Z");
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
let currentNow = new Date(RENEWAL_NOW);
let redemptionService = null;
let bootstrapService = null;
let renewalService = null;

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
  assert.match(name, /^automatex_pos_renewal_tx_[a-z0-9_]+$/);
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
    throw new Error("A local mongod executable is required for POS renewal transaction verification.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-renewal-tx-"));
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
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-renewal-tx-"))) {
      fs.rmSync(mongoDbPath, { recursive: true, force: true });
    }
  }
}

function futureDate(from, days) {
  const date = new Date(from);
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

function assertServiceError(error, code) {
  assert.equal(error && error.code, code);
  return true;
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
    btoa(value) {
      return Buffer.from(value, "binary").toString("base64");
    },
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    navigator: {
      onLine: true,
      userAgent: "automatex-pos-renewal-test"
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
      href: "https://pos-renewal.example.test/"
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-renewal-verifier-copy-"));
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
        if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-renewal-verifier-copy-"))) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    };
  } catch (error) {
    if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-renewal-verifier-copy-"))) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

async function resetCollections() {
  assertSafeMongoTarget(mongoUri, dbName);
  assert.equal(mongoose.connection.name, dbName);
  await Promise.all(MODEL_SET.map((model) => model.deleteMany({})));
  keyPair = crypto.generateKeyPairSync("ed25519");
  currentNow = new Date(RENEWAL_NOW);
  redemptionService = createPosActivationRedemptionService({
    keyProvider: {
      keyId: "automatex-pos-prod-ed25519-v1",
      async getPrivateKey() {
        return keyPair.privateKey;
      }
    },
    clock: () => new Date(ACTIVATION_NOW)
  });
  bootstrapService = createPosRenewalCredentialBootstrapService({
    clock: () => new Date(ACTIVATION_NOW)
  });
  renewalService = createPosLicenceRenewalService({
    keyProvider: {
      keyId: "automatex-pos-prod-ed25519-v1",
      async getPrivateKey() {
        return keyPair.privateKey;
      }
    },
    clock: () => new Date(currentNow)
  });
}

async function createRenewalFixture(options = {}) {
  const stamp = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const client = await User.create({
    name: "Renewal Client",
    email: `renewal-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Renewal POS",
    projectType: "POS System"
  });
  const posPackage = await PosPackage.create({
    packageCode: `standard-renewal-${stamp}`,
    name: "Renewal Standard",
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
  const activation = await redemptionService.redeemActivation(activationRequest(plaintextCode));
  const rawRenewalCredential = clientGeneratedRenewalCredential();
  const renewalCredentialDigest = digestRenewalCredential(rawRenewalCredential);
  await bootstrapService.bootstrapRenewalCredential(bootstrapRequest({
    plaintextCode,
    deviceInstallationId: DEVICE_ID,
    activationSignedLicence: activation.signedLicence
  }, renewalCredentialDigest));

  const installation = await PosInstallation.findOne({
    licenceId: licence._id,
    deviceInstallationId: DEVICE_ID
  }).select("+renewalCredentialHash");
  const activationIssue = await PosLicenceIssue.findById(installation.lastIssueId).select("+signedPayload");

  return {
    activationCode,
    activationIssue,
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

if (!RUN_RENEWAL_TX) {
  test("POS licence renewal transaction tests require explicit disposable replica-set opt-in", {
    skip: "Set AUTOMATEX_POS_RENEWAL_TX=1 to run these isolated MongoDB transaction tests."
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

  test("correct credential renews an expired previous offline window and actual POS accepts the response", async () => {
    const fixture = await createRenewalFixture();
    const response = await renewalService.renewLicence(renewalRequest(fixture));
    assert.equal(response.installationId, DEVICE_ID);
    assert.equal(response.licenceExpiry, fixture.licence.licenceExpiry.toISOString());
    assert.equal(response.offlineValidUntil, futureDate(RENEWAL_NOW, 7).toISOString());
    assert.equal(response.keyId, "automatex-pos-prod-ed25519-v1");
    assert.notEqual(response.signature, fixture.activationSignedLicence.signature);

    const pos = loadActualPosVerifier(keyPair.publicKey.export({ format: "jwk" }));
    try {
      pos.context.localStorage.setItem("automatex-pos-standard-device-identity-v1", JSON.stringify({
        schemaVersion: 1,
        deviceInstallationId: DEVICE_ID,
        createdAt: ACTIVATION_NOW.toISOString()
      }));
      const normalized = pos.exports.normalizeStandardActivationResponsePayload(response);
      assert.equal(normalized.installationId, DEVICE_ID);
      const verified = await pos.exports.verifyStandardSignedLicencePayload(response, pos.exports.createStandardInternalLicenceVerificationOptions({
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

  test("expired underlying licence and missing renewal-window policy reject renewal", async () => {
    const fixture = await createRenewalFixture();
    await PosLicence.updateOne({ _id: fixture.licence._id }, { $set: { licenceExpiry: futureDate(RENEWAL_NOW, -1) } });
    await assert.rejects(
      () => renewalService.renewLicence(renewalRequest(fixture)),
      (error) => assertServiceError(error, "licence_expired")
    );
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

    await resetCollections();
    const missingPolicy = await createRenewalFixture();
    await PosLicence.updateOne({ _id: missingPolicy.licence._id }, { $set: { renewalWindowDurationMinutes: null } });
    await assert.rejects(
      () => renewalService.renewLicence(renewalRequest(missingPolicy)),
      (error) => assertServiceError(error, "renewal_policy_missing")
    );
  });

  test("renewal window is capped at licenceExpiry", async () => {
    const licenceExpiry = futureDate(RENEWAL_NOW, 2);
    const fixture = await createRenewalFixture({
      licenceExpiry,
      renewalWindowDurationMinutes: 7 * 24 * 60
    });
    const response = await renewalService.renewLicence(renewalRequest(fixture));
    assert.equal(response.offlineValidUntil, licenceExpiry.toISOString());
  });

  test("digest substitution and wrong credential, device or signature are rejected before renewal writes", async () => {
    const fixture = await createRenewalFixture();
    await assert.rejects(
      () => renewalService.renewLicence(renewalRequest(fixture, { renewalCredential: fixture.renewalCredentialDigest })),
      (error) => assertServiceError(error, "invalid_renewal_credential")
    );
    await assert.rejects(
      () => renewalService.renewLicence(renewalRequest(fixture, { renewalCredential: clientGeneratedRenewalCredential() })),
      (error) => assertServiceError(error, "renewal_denied")
    );
    await assert.rejects(
      () => renewalService.renewLicence(renewalRequest(fixture, { deviceInstallationId: DEVICE_ID_2 })),
      (error) => assertServiceError(error, "renewal_denied")
    );
    await assert.rejects(
      () => renewalService.renewLicence(renewalRequest(fixture, { lastSignature: Buffer.from(crypto.randomBytes(64)).toString("base64") })),
      (error) => assertServiceError(error, "stale_predecessor")
    );
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

  test("same request retry and concurrent renewal produce one renewal issue and one audit", async () => {
    const fixture = await createRenewalFixture();
    const request = renewalRequest(fixture);
    const [first, second] = await Promise.all([
      renewalService.renewLicence(request),
      renewalService.renewLicence(request)
    ]);
    assert.deepEqual(second, first);

    const retry = await renewalService.renewLicence(request);
    assert.deepEqual(retry, first);
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

  test("latest-issue and predecessor rules prevent branching while allowing linear renewal", async () => {
    const fixture = await createRenewalFixture();
    const firstRenewal = await renewalService.renewLicence(renewalRequest(fixture));
    const replayOld = await renewalService.renewLicence(renewalRequest(fixture));
    assert.deepEqual(replayOld, firstRenewal);

    currentNow = new Date("2026-09-20T00:01:00.000Z");
    const secondRenewal = await renewalService.renewLicence(renewalRequest({
      ...fixture,
      lastSignature: firstRenewal.signature
    }));
    assert.notEqual(secondRenewal.signature, firstRenewal.signature);

    await assert.rejects(
      () => renewalService.renewLicence(renewalRequest({
        ...fixture,
        lastSignature: Buffer.from(crypto.randomBytes(64)).toString("base64")
      })),
      (error) => assertServiceError(error, "stale_predecessor")
    );
    await assertCounts(fixture, {
      installations: 1,
      issues: 3,
      activationCodes: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      renewalAudits: 2,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("expired replay does not silently issue another renewal for the same request", async () => {
    const fixture = await createRenewalFixture({ renewalWindowDurationMinutes: 1 });
    const request = renewalRequest(fixture);
    await renewalService.renewLicence(request);
    currentNow = new Date("2026-09-20T00:02:00.000Z");
    await assert.rejects(
      () => renewalService.renewLicence(request),
      (error) => assertServiceError(error, "stored_response_expired")
    );
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

  test("signing and audit failure roll back renewal writes", async () => {
    const fixture = await createRenewalFixture();
    const unsignedService = createPosLicenceRenewalService({
      keyProvider: null,
      clock: () => new Date(currentNow)
    });
    await assert.rejects(
      () => unsignedService.renewLicence(renewalRequest(fixture)),
      (error) => assertServiceError(error, "signing_key_unavailable")
    );
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

    const failingAuditService = createPosLicenceRenewalService({
      keyProvider: {
        keyId: "automatex-pos-prod-ed25519-v1",
        async getPrivateKey() {
          return keyPair.privateKey;
        }
      },
      clock: () => new Date(currentNow),
      auditLogger: {
        async create() {
          throw new Error("audit unavailable");
        }
      }
    });
    await assert.rejects(
      () => failingAuditService.renewLicence(renewalRequest(fixture)),
      /audit unavailable/
    );
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

  test("ordinary output and audits do not leak sensitive renewal fields", async () => {
    const fixture = await createRenewalFixture();
    const response = await renewalService.renewLicence(renewalRequest(fixture));
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
    assert.equal(ordinarySnapshot.includes(response.signature), false);
  });
}
