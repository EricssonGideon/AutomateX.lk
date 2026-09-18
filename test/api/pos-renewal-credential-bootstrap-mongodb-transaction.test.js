const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
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

const RUN_BOOTSTRAP_TX = process.env.AUTOMATEX_POS_RENEWAL_BOOTSTRAP_TX === "1";
const TEST_DB_PREFIX = "automatex_pos_renewal_bootstrap_tx_";
const REPLICA_SET_NAME = "rs_pos_renewal_bootstrap_tx";
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
let redemptionService = null;
let bootstrapService = null;

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
  assert.match(name, /^automatex_pos_renewal_bootstrap_tx_[a-z0-9_]+$/);
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
    throw new Error("A local mongod executable is required for POS renewal bootstrap transaction verification.");
  }

  const port = await getFreePort();
  dbName = `${TEST_DB_PREFIX}${process.pid}_${Date.now()}`;
  mongoDbPath = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-renewal-bootstrap-tx-"));
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
    if (mongoDbPath && mongoDbPath.startsWith(path.join(os.tmpdir(), "automatex-pos-renewal-bootstrap-tx-"))) {
      fs.rmSync(mongoDbPath, { recursive: true, force: true });
    }
  }
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
    deviceInstallationId: fixture.deviceInstallationId || DEVICE_ID,
    signedLicenceSignature: fixture.signedLicence.signature,
    renewalCredentialDigest: digest,
    ...overrides
  };
}

function assertServiceError(error, code) {
  assert.equal(error && error.code, code);
  return true;
}

async function resetCollections() {
  assertSafeMongoTarget(mongoUri, dbName);
  assert.equal(mongoose.connection.name, dbName);
  await Promise.all(MODEL_SET.map((model) => model.deleteMany({})));
  keyPair = crypto.generateKeyPairSync("ed25519");
  redemptionService = createPosActivationRedemptionService({
    keyProvider: {
      async getPrivateKey() {
        return keyPair.privateKey;
      }
    },
    clock: () => new Date(NOW)
  });
  bootstrapService = createPosRenewalCredentialBootstrapService({
    clock: () => new Date(NOW)
  });
}

async function createEligibleFixture(options = {}) {
  const stamp = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const client = await User.create({
    name: "Bootstrap Client",
    email: `bootstrap-client-${stamp}@example.test`,
    passwordHash: "hash",
    role: "client",
    status: "active",
    isActive: true
  });
  const project = await Project.create({
    clientId: client._id,
    projectTitle: "Bootstrap POS",
    projectType: "POS System"
  });
  const posPackage = await PosPackage.create({
    packageCode: `standard-bootstrap-${stamp}`,
    name: "Bootstrap Standard",
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
  const redemption = await redemptionService.redeemActivation(activationRequest(plaintextCode, {
    deviceInstallationId: options.deviceInstallationId || DEVICE_ID
  }));
  const installation = await PosInstallation.findOne({
    licenceId: licence._id,
    deviceInstallationId: options.deviceInstallationId || DEVICE_ID
  });
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
    signedLicence: redemption.signedLicence
  };
}

async function countState(fixture) {
  const code = await PosActivationCode.findById(fixture.activationCode._id).lean();
  const licence = await PosLicence.findById(fixture.licence._id).lean();
  return {
    installations: await PosInstallation.countDocuments({}),
    issues: await PosLicenceIssue.countDocuments({}),
    redemptionAudits: await AuditLog.countDocuments({ action: "licences.activation-code.redeem" }),
    bootstrapAudits: await AuditLog.countDocuments({ action: "licences.renewal-credential.bootstrap" }),
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

if (!RUN_BOOTSTRAP_TX) {
  test("POS renewal credential bootstrap transaction tests require explicit disposable replica-set opt-in", {
    skip: "Set AUTOMATEX_POS_RENEWAL_BOOTSTRAP_TX=1 to run these isolated MongoDB transaction tests."
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

  test("valid committed activation bootstraps and stores only the digest", async () => {
    const fixture = await createEligibleFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const result = await bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest));

    assert.deepEqual(result.bootstrap, {
      schemaVersion: 1,
      status: "bound",
      installationId: DEVICE_ID,
      credentialVersion: 1
    });
    assert.equal(result.installation.deviceInstallationId, DEVICE_ID);
    assert.equal(result.installation.renewalCredentialVersion, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(result.installation, "renewalCredentialHash"), false);

    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    assert.equal(stored.renewalCredentialHash, digest);
    assert.equal(stored.renewalCredentialVersion, 1);
    const ordinary = await PosInstallation.findById(fixture.installation._id).lean();
    assert.equal(Object.prototype.hasOwnProperty.call(ordinary, "renewalCredentialHash"), false);
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("same request replay is idempotent and preserves counts", async () => {
    const fixture = await createEligibleFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const request = bootstrapRequest(fixture, digest);
    const first = await bootstrapService.bootstrapRenewalCredential(request);
    const second = await bootstrapService.bootstrapRenewalCredential(request);

    assert.deepEqual(second.bootstrap, first.bootstrap);
    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    assert.equal(stored.renewalCredentialHash, digest);
    assert.equal(stored.renewalCredentialVersion, 1);
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("concurrent identical bootstrap requests bind once and audit once", async () => {
    const fixture = await createEligibleFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const request = bootstrapRequest(fixture, digest);
    const results = await Promise.allSettled([
      bootstrapService.bootstrapRenewalCredential(request),
      bootstrapService.bootstrapRenewalCredential(request)
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.deepEqual(results[0].value.bootstrap, results[1].value.bootstrap);
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("concurrent different digests produce one bound credential and no overwrite", async () => {
    const fixture = await createEligibleFixture();
    const firstDigest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const secondDigest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const results = await Promise.allSettled([
      bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, firstDigest)),
      bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, secondDigest))
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(["credential_already_bound", "credential_bind_conflict"].includes(results.find((result) => result.status === "rejected").reason.code), true);
    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    assert.equal([firstDigest, secondDigest].includes(stored.renewalCredentialHash), true);
    assert.equal(stored.renewalCredentialVersion, 1);
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("existing credential cannot be overwritten", async () => {
    const fixture = await createEligibleFixture();
    const firstDigest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const secondDigest = digestRenewalCredential(clientGeneratedRenewalCredential());
    await bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, firstDigest));
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, secondDigest)),
      (error) => assertServiceError(error, "credential_already_bound")
    );
    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    assert.equal(stored.renewalCredentialHash, firstDigest);
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 1,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("wrong code, device or signature combinations are rejected", async () => {
    const fixture = await createEligibleFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());

    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest, { activationCode: generateActivationCode() })),
      (error) => assertServiceError(error, "activation_code_not_found")
    );
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest, { deviceInstallationId: DEVICE_ID_2 })),
      (error) => assertServiceError(error, "installation_not_found")
    );
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest, { signedLicenceSignature: Buffer.from(crypto.randomBytes(64)).toString("base64") })),
      (error) => assertServiceError(error, "signature_mismatch")
    );
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("expired or revoked code, invalid issue and ineligible licence/package are rejected", async () => {
    const fixture = await createEligibleFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());

    await PosActivationCode.updateOne({ _id: fixture.activationCode._id }, { $set: { expiresAt: futureDate(-1) } });
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest)),
      (error) => assertServiceError(error, "activation_code_expired")
    );

    await PosActivationCode.updateOne({ _id: fixture.activationCode._id }, { $set: { expiresAt: futureDate(7), status: "revoked" } });
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest)),
      (error) => assertServiceError(error, "activation_code_revoked")
    );

    await PosActivationCode.updateOne({ _id: fixture.activationCode._id }, { $set: { status: "redeemed" } });
    await PosLicenceIssue.updateOne({ _id: fixture.issue._id }, { $set: { status: "prepared" } });
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest)),
      (error) => assertServiceError(error, "activation_issue_not_found")
    );

    await resetCollections();
    const draftFixture = await createEligibleFixture();
    await PosLicence.updateOne({ _id: draftFixture.licence._id }, { $set: { status: "draft" } });
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(draftFixture, digest)),
      (error) => assertServiceError(error, "licence_not_eligible")
    );

    await resetCollections();
    const packageFixture = await createEligibleFixture();
    await PosPackage.updateOne({ _id: packageFixture.posPackage._id }, { $set: { status: "draft" } });
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(packageFixture, digest)),
      (error) => assertServiceError(error, "package_not_published")
    );

    await resetCollections();
    const missingOfflinePolicy = await createEligibleFixture();
    await PosLicence.updateOne({ _id: missingOfflinePolicy.licence._id }, { $set: { offlineValidUntil: null } });
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(missingOfflinePolicy, digest)),
      (error) => assertServiceError(error, "offline_window_expired")
    );

    await resetCollections();
    const missingInstallationPolicy = await createEligibleFixture();
    await PosLicence.updateOne({ _id: missingInstallationPolicy.licence._id }, { $set: { maxInstallations: null } });
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(missingInstallationPolicy, digest)),
      (error) => assertServiceError(error, "missing_installation_policy")
    );
  });

  test("exhausted one-use code bootstraps only its committed installation", async () => {
    const fixture = await createEligibleFixture({ maxRedemptions: 1 });
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const result = await bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest));
    assert.equal(result.bootstrap.installationId, DEVICE_ID);
    await assert.rejects(
      () => bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest, { deviceInstallationId: DEVICE_ID_2 })),
      (error) => assertServiceError(error, "installation_not_found")
    );
  });

  test("revocation and first binding coordinate on the observed activation-code version", async () => {
    const fixture = await createEligibleFixture({ maxRedemptions: 2 });
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const observedCode = await PosActivationCode.findById(fixture.activationCode._id).lean();
    assert.equal(observedCode.status, "active");
    const results = await Promise.allSettled([
      bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest)),
      revokeWithObservedVersion(fixture.activationCode._id, observedCode.__v)
    ]);

    const fulfilledBootstrap = results.find((result) => result.status === "fulfilled" && result.value && result.value.bootstrap);
    const fulfilledRevoke = results.find((result) => result.status === "fulfilled" && result.value === true);
    assert.equal(Boolean(fulfilledBootstrap) !== Boolean(fulfilledRevoke), true);
    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    const bootstrapAudits = await AuditLog.countDocuments({ action: "licences.renewal-credential.bootstrap" });
    if (fulfilledBootstrap) {
      assert.equal(stored.renewalCredentialHash, digest);
      assert.equal(bootstrapAudits, 1);
    } else {
      assert.equal(stored.renewalCredentialHash, "");
      assert.equal(bootstrapAudits, 0);
    }
  });

  test("audit failure rolls back first binding", async () => {
    const fixture = await createEligibleFixture();
    const digest = digestRenewalCredential(clientGeneratedRenewalCredential());
    const failingService = createPosRenewalCredentialBootstrapService({
      clock: () => new Date(NOW),
      auditLogger: {
        async create() {
          throw new Error("audit unavailable");
        }
      }
    });

    await assert.rejects(
      () => failingService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest)),
      /audit unavailable/
    );
    const stored = await PosInstallation.findById(fixture.installation._id).select("+renewalCredentialHash").lean();
    assert.equal(stored.renewalCredentialHash, "");
    assert.equal(stored.renewalCredentialVersion, 0);
    await assertCounts(fixture, {
      installations: 1,
      issues: 1,
      redemptionAudits: 1,
      bootstrapAudits: 0,
      redeemedCount: 1,
      activationCount: 1
    });
  });

  test("ordinary persisted records and audits do not leak bootstrap secrets", async () => {
    const fixture = await createEligibleFixture();
    const rawRenewalCredential = clientGeneratedRenewalCredential();
    const digest = digestRenewalCredential(rawRenewalCredential);
    await bootstrapService.bootstrapRenewalCredential(bootstrapRequest(fixture, digest));

    const ordinarySnapshot = JSON.stringify({
      installations: await PosInstallation.find({}).lean(),
      activationCodes: await PosActivationCode.find({}).lean(),
      issues: await PosLicenceIssue.find({}).lean(),
      audits: await AuditLog.find({}).lean()
    });
    assert.equal(ordinarySnapshot.includes(rawRenewalCredential), false);
    assert.equal(ordinarySnapshot.includes(digest), false);
    assert.equal(ordinarySnapshot.includes(fixture.plaintextCode), false);
    assert.equal(ordinarySnapshot.includes(fixture.signedLicence.signature), false);
  });
}
