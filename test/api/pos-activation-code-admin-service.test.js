const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-activation-code-admin-service-test-secret";

const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MANDATORY_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  digestActivationCode,
  generateActivationCode,
  isActivationCodeFormat,
  normalizeActivationCode
} = require("../../server/utils/posActivationCodeToken");
const {
  createPosActivationCodeAdminService
} = require("../../server/services/posActivationCodeAdminService");

const ADMIN = {
  id: "507f1f77bcf86cd799439011",
  name: "Trusted Admin",
  email: "admin@example.com",
  role: "admin"
};
const MANAGER = {
  id: "507f1f77bcf86cd799439012",
  name: "Manager",
  email: "manager@example.com",
  role: "manager"
};
const CLIENT_ID = "507f1f77bcf86cd799439013";
const PACKAGE_ID = "507f1f77bcf86cd799439014";
const LICENCE_ID = "507f1f77bcf86cd799439015";
const CODE_ID = "507f1f77bcf86cd799439016";
const FIXTURE_CODE = "posac_0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-08-31T00:00:00.000Z");

function futureDate(days) {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return date;
}

function clone(record) {
  if (!record) {
    return null;
  }
  return {
    ...record,
    moduleIds: Array.isArray(record.moduleIds) ? [...record.moduleIds] : record.moduleIds,
    updateChannels: Array.isArray(record.updateChannels) ? [...record.updateChannels] : record.updateChannels,
    entitledModules: Array.isArray(record.entitledModules) ? [...record.entitledModules] : record.entitledModules
  };
}

function matchesQuery(record, query = {}) {
  return Object.entries(query).every(([field, value]) => String(record[field] || "") === String(value || ""));
}

function createRepository(initialRecords = []) {
  const records = new Map(initialRecords.map((record) => [String(record._id), clone(record)]));
  const calls = {
    countDocuments: 0,
    create: 0,
    find: 0,
    findById: 0,
    findOneAndUpdate: 0
  };

  return {
    calls,
    records,
    async countDocuments(query) {
      calls.countDocuments += 1;
      return [...records.values()].filter((record) => matchesQuery(record, query)).length;
    },
    async create(input) {
      calls.create += 1;
      const source = Array.isArray(input) ? input[0] : input;
      if (source.codeHash && [...records.values()].some((record) => record.codeHash === source.codeHash)) {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }
      const _id = source._id || new mongoose.Types.ObjectId().toString();
      const record = {
        __v: 0,
        createdAt: NOW,
        updatedAt: NOW,
        ...source,
        _id
      };
      records.set(String(_id), clone(record));
      return Array.isArray(input) ? [clone(record)] : clone(record);
    },
    async find(query) {
      calls.find += 1;
      return [...records.values()].filter((record) => matchesQuery(record, query)).map(clone);
    },
    async findById(id) {
      calls.findById += 1;
      return clone(records.get(String(id)));
    },
    async findOneAndUpdate(query, update) {
      calls.findOneAndUpdate += 1;
      const found = [...records.values()].find((record) => matchesQuery(record, query));
      if (!found) {
        return null;
      }
      const next = {
        ...found,
        ...(update.$set || {}),
        __v: found.__v + ((update.$inc && update.$inc.__v) || 0),
        updatedAt: NOW
      };
      records.set(String(found._id), clone(next));
      return clone(next);
    }
  };
}

function activePackage(overrides = {}) {
  return {
    _id: PACKAGE_ID,
    packageCode: "standard-active",
    name: "Active Standard",
    edition: POS_EDITION_STANDARD,
    status: "active",
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"],
    __v: 0,
    ...overrides
  };
}

function activeLicence(overrides = {}) {
  return {
    _id: LICENCE_ID,
    clientId: CLIENT_ID,
    packageId: PACKAGE_ID,
    edition: POS_EDITION_STANDARD,
    status: "active",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: futureDate(60),
    __v: 0,
    ...overrides
  };
}

function activationCode(overrides = {}) {
  return {
    _id: CODE_ID,
    licenceId: LICENCE_ID,
    codeHash: digestActivationCode("posac_fedcba9876543210fedcba9876543210"),
    status: "active",
    expiresAt: futureDate(20),
    maxRedemptions: 1,
    redeemedCount: 0,
    __v: 0,
    ...overrides
  };
}

function createFixtureService(overrides = {}) {
  const posActivationCodes = createRepository(overrides.activationCodes || [activationCode()]);
  const posLicences = createRepository(overrides.licences || [activeLicence()]);
  const posPackages = createRepository(overrides.packages || [activePackage()]);
  const audit = {
    calls: [],
    async create(entry) {
      this.calls.push(entry);
      if (overrides.auditFails) {
        throw new Error("audit unavailable");
      }
      return { _id: new mongoose.Types.ObjectId().toString(), ...entry };
    }
  };
  const transactions = {
    calls: 0,
    async run(callback) {
      this.calls += 1;
      return callback({ fixtureSession: true });
    }
  };
  const service = createPosActivationCodeAdminService({
    repositories: {
      posActivationCodes,
      posLicences,
      posPackages
    },
    auditLogger: audit,
    runInTransaction: transactions.run.bind(transactions),
    generateCode: () => FIXTURE_CODE,
    clock: () => NOW
  });
  return {
    audit,
    repositories: {
      posActivationCodes,
      posLicences,
      posPackages
    },
    service,
    transactions
  };
}

async function assertServiceRejects(fn, code) {
  await assert.rejects(fn, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test("activation-code format uses 128-bit generated lowercase hex and stable digest normalization", () => {
  const code = generateActivationCode();
  assert.equal(isActivationCodeFormat(code), true);
  assert.match(code, /^posac_[0-9a-f]{32}$/);
  assert.equal(Buffer.from(code.slice("posac_".length), "hex").length, 16);
  assert.equal(normalizeActivationCode(` ${code.toUpperCase()} `), code);
  assert.match(digestActivationCode(code), /^sha256:v1:[0-9a-f]{64}$/);
});

test("unauthorized callers are rejected before protected reads or writes", async () => {
  const { service, repositories, transactions } = createFixtureService();

  await assertServiceRejects(
    () => service.issueActivationCode(MANAGER, LICENCE_ID, { expiresAt: futureDate(10), maxRedemptions: 1 }),
    "forbidden"
  );
  await assertServiceRejects(
    () => service.listActivationCodes(MANAGER, { filters: { licenceId: LICENCE_ID } }),
    "forbidden"
  );
  await assertServiceRejects(
    () => service.revokeUnusedActivationCode(MANAGER, CODE_ID),
    "forbidden"
  );

  assert.equal(repositories.posLicences.calls.findById, 0);
  assert.equal(repositories.posActivationCodes.calls.create, 0);
  assert.equal(transactions.calls, 0);
});

test("draft and ineligible licences cannot receive activation codes", async () => {
  const { service, repositories } = createFixtureService({
    licences: [activeLicence({ status: "draft" })]
  });

  await assertServiceRejects(
    () => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(10), maxRedemptions: 1 }),
    "licence_not_eligible"
  );
  assert.equal(repositories.posActivationCodes.calls.create, 0);
});

test("approved licences still require a published package before activation-code issuance", async () => {
  const { service, repositories } = createFixtureService({
    packages: [activePackage({ status: "draft" })],
    activationCodes: []
  });

  await assertServiceRejects(
    () => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(10), maxRedemptions: 1 }),
    "package_not_published"
  );
  assert.equal(repositories.posActivationCodes.calls.create, 0);
});

test("missing, invalid, caller-supplied, and out-of-range issuance inputs are rejected", async () => {
  const { service } = createFixtureService();

  await assertServiceRejects(() => service.issueActivationCode(ADMIN, LICENCE_ID, { maxRedemptions: 1 }), "validation_failed");
  await assertServiceRejects(() => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(10) }), "validation_failed");
  await assertServiceRejects(
    () => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(10), maxRedemptions: 0 }),
    "validation_failed"
  );
  await assertServiceRejects(
    () => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(-1), maxRedemptions: 1 }),
    "validation_failed"
  );
  await assertServiceRejects(
    () => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(90), maxRedemptions: 1 }),
    "validation_failed"
  );
  await assertServiceRejects(
    () => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(10), maxRedemptions: 1, code: "caller-code" }),
    "protected_field"
  );
  await assertServiceRejects(
    () => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(10), maxRedemptions: 1, codeHash: "hash" }),
    "protected_field"
  );
  await assertServiceRejects(
    () => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(10), maxRedemptions: 1, actorRole: "admin" }),
    "protected_field"
  );
  await assertServiceRejects(
    () => service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(10), maxRedemptions: 1, price: 1 }),
    "unknown_field"
  );
});

test("successful issuance stores only a digest and returns plaintext once", async () => {
  const { service, repositories, audit } = createFixtureService({ activationCodes: [] });
  const result = await service.issueActivationCode(ADMIN, LICENCE_ID, { expiresAt: futureDate(10), maxRedemptions: 1 });

  assert.equal(result.activationCode, FIXTURE_CODE);
  assert.equal(isActivationCodeFormat(result.activationCode), true);
  assert.equal(Object.prototype.hasOwnProperty.call(result.activationCodeMetadata, "codeHash"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.activationCodeMetadata, "activationCode"), false);

  const stored = [...repositories.posActivationCodes.records.values()][0];
  assert.equal(stored.codeHash, digestActivationCode(FIXTURE_CODE));
  assert.equal(Object.prototype.hasOwnProperty.call(stored, "activationCode"), false);
  assert.equal(JSON.stringify(audit.calls).includes(FIXTURE_CODE), false);
  assert.equal(JSON.stringify(audit.calls).includes(digestActivationCode(FIXTURE_CODE)), false);

  const listed = await service.listActivationCodes(ADMIN, { filters: { licenceId: LICENCE_ID } });
  assert.equal(listed.activationCodes.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(listed.activationCodes[0], "codeHash"), false);
  assert.equal(JSON.stringify(listed).includes(FIXTURE_CODE), false);
});

test("unused activation codes can be revoked through a conditional update", async () => {
  const { service, repositories, audit } = createFixtureService();
  const result = await service.revokeUnusedActivationCode(ADMIN, CODE_ID);

  assert.equal(result.activationCodeMetadata.status, "revoked");
  assert.equal(result.activationCodeMetadata.version, 1);
  assert.equal(repositories.posActivationCodes.records.get(CODE_ID).status, "revoked");
  assert.equal(repositories.posActivationCodes.calls.findOneAndUpdate, 1);
  assert.equal(JSON.stringify(audit.calls).includes("revoke-unused"), true);
});

test("already revoked and already redeemed codes are reported without a false unused revocation", async () => {
  const revoked = createFixtureService({ activationCodes: [activationCode({ status: "revoked" })] });
  await assertServiceRejects(() => revoked.service.revokeUnusedActivationCode(ADMIN, CODE_ID), "already_revoked");

  const redeemed = createFixtureService({ activationCodes: [activationCode({ status: "redeemed", redeemedCount: 1 })] });
  await assertServiceRejects(() => redeemed.service.revokeUnusedActivationCode(ADMIN, CODE_ID), "already_redeemed");
});

test("activation-code service and UI remain unmounted from production startup", () => {
  const rootDir = path.join(__dirname, "..", "..");
  [
    "server.js",
    "server/server.js",
    "server/routes/index.js"
  ].forEach((relativePath) => {
    const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    assert.doesNotMatch(source, /posActivationCodeAdminService|posActivationCodeToken/);
  });
});

test("lost-response and future redemption coordination requirements are documented", () => {
  const doc = fs.readFileSync(path.join(__dirname, "..", "..", "server", "docs", "POS_LICENSING_FOUNDATION.md"), "utf8");
  assert.match(doc, /lost-response case/i);
  assert.match(doc, /revoke the unused code and issue a new one/i);
  assert.match(doc, /does not implement recoverable plaintext storage/i);
  assert.match(doc, /Future redemption must coordinate atomically/i);
});
