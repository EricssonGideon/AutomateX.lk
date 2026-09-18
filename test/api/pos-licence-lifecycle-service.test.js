const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licence-lifecycle-service-test-secret";

const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MANDATORY_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  createPosLicenceLifecycleService
} = require("../../server/services/posLicenceLifecycleService");

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
const OTHER_CLIENT_ID = "507f1f77bcf86cd799439014";
const PROJECT_ID = "507f1f77bcf86cd799439015";
const PACKAGE_ID = "507f1f77bcf86cd799439016";
const LICENCE_ID = "507f1f77bcf86cd799439017";
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
    findById: 0,
    findOneAndUpdate: 0
  };

  return {
    calls,
    records,
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

function packageRecord(overrides = {}) {
  return {
    _id: PACKAGE_ID,
    packageCode: "standard-ready",
    name: "Standard Ready",
    edition: POS_EDITION_STANDARD,
    status: "draft",
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"],
    notes: "",
    __v: 0,
    ...overrides
  };
}

function licenceRecord(overrides = {}) {
  return {
    _id: LICENCE_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    packageId: PACKAGE_ID,
    edition: POS_EDITION_STANDARD,
    status: "draft",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: futureDate(60),
    supportExpiry: futureDate(30),
    notes: "",
    __v: 0,
    ...overrides
  };
}

function createFixtureService(overrides = {}) {
  const users = createRepository(overrides.users || [
    { _id: CLIENT_ID, role: "client", paymentStatus: "overdue" },
    { _id: OTHER_CLIENT_ID, role: "client" }
  ]);
  const projects = createRepository(overrides.projects || [
    { _id: PROJECT_ID, clientId: CLIENT_ID, projectType: "POS System" }
  ]);
  const posPackages = createRepository(overrides.packages || [packageRecord()]);
  const posLicences = createRepository(overrides.licences || [licenceRecord()]);
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
  const service = createPosLicenceLifecycleService({
    repositories: {
      users,
      projects,
      posPackages,
      posLicences
    },
    auditLogger: audit,
    runInTransaction: transactions.run.bind(transactions),
    clock: () => NOW
  });

  return {
    audit,
    repositories: {
      users,
      projects,
      posPackages,
      posLicences
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

test("unauthorized callers are rejected before lifecycle reads or writes", async () => {
  const { service, repositories, transactions } = createFixtureService();

  await assertServiceRejects(
    () => service.publishDraftPackage(MANAGER, PACKAGE_ID, { expectedVersion: 0 }),
    "forbidden"
  );
  await assertServiceRejects(
    () => service.approveDraftLicence(MANAGER, LICENCE_ID, { expectedVersion: 0 }),
    "forbidden"
  );

  assert.equal(repositories.posPackages.calls.findById, 0);
  assert.equal(repositories.posLicences.calls.findById, 0);
  assert.equal(transactions.calls, 0);
});

test("transition input accepts only expectedVersion and bounded reason", async () => {
  const { service } = createFixtureService();

  await assertServiceRejects(
    () => service.publishDraftPackage(ADMIN, PACKAGE_ID, { expectedVersion: "0" }),
    "precondition_required"
  );
  await assertServiceRejects(
    () => service.approveDraftLicence(ADMIN, LICENCE_ID, { expectedVersion: 0, actorRole: "admin" }),
    "protected_field"
  );
  await assertServiceRejects(
    () => service.approveDraftLicence(ADMIN, LICENCE_ID, { expectedVersion: 0, licenceExpiry: futureDate(90) }),
    "protected_field"
  );
  await assertServiceRejects(
    () => service.publishDraftPackage(ADMIN, PACKAGE_ID, { expectedVersion: 0, readiness: { ready: true } }),
    "protected_field"
  );
  await assertServiceRejects(
    () => service.publishDraftPackage(ADMIN, PACKAGE_ID, { expectedVersion: 0, price: 1 }),
    "unknown_field"
  );
});

test("complete draft packages can be published to the usable immutable state", async () => {
  const { service, repositories, audit } = createFixtureService();
  const result = await service.publishDraftPackage(ADMIN, PACKAGE_ID, {
    expectedVersion: 0,
    reason: "Reviewed for package publication"
  });

  assert.equal(result.package.status, "active");
  assert.equal(result.package.version, 1);
  assert.equal(repositories.posPackages.records.get(PACKAGE_ID).status, "active");
  assert.equal(repositories.posPackages.calls.findOneAndUpdate, 1);
  assert.equal(audit.calls.length, 1);
  assert.equal(audit.calls[0].newValue.reason, "Reviewed for package publication");
});

test("incomplete package publication and stale publication are rejected", async () => {
  const incomplete = createFixtureService({
    packages: [packageRecord({ moduleIds: [], updateChannels: [] })]
  });
  await assertServiceRejects(
    () => incomplete.service.publishDraftPackage(ADMIN, PACKAGE_ID, { expectedVersion: 0 }),
    "validation_failed"
  );
  assert.equal(incomplete.repositories.posPackages.records.get(PACKAGE_ID).status, "draft");

  const stale = createFixtureService({
    packages: [packageRecord({ __v: 1 })]
  });
  await assertServiceRejects(
    () => stale.service.publishDraftPackage(ADMIN, PACKAGE_ID, { expectedVersion: 0 }),
    "stale_update"
  );
});

test("complete draft licences can be approved without changing payment or support-derived validity", async () => {
  const { service, repositories, audit } = createFixtureService({
    packages: [packageRecord({ status: "active" })],
    licences: [licenceRecord({ supportExpiry: futureDate(-5) })]
  });

  const result = await service.approveDraftLicence(ADMIN, LICENCE_ID, {
    expectedVersion: 0,
    reason: "Reviewed for licence approval"
  });

  assert.equal(result.licence.status, "active");
  assert.equal(result.licence.version, 1);
  assert.equal(new Date(result.licence.licenceExpiry).getTime(), futureDate(60).getTime());
  assert.equal(new Date(result.licence.supportExpiry).getTime(), futureDate(-5).getTime());
  assert.equal(repositories.users.records.get(CLIENT_ID).paymentStatus, "overdue");
  assert.equal(repositories.posLicences.records.get(LICENCE_ID).status, "active");
  assert.equal(audit.calls.length, 1);
});

test("licence approval rejects unpublished package, bad references, missing dates and stale versions", async () => {
  await assertServiceRejects(
    () => createFixtureService().service.approveDraftLicence(ADMIN, LICENCE_ID, { expectedVersion: 0 }),
    "validation_failed"
  );

  const stale = createFixtureService({
    packages: [packageRecord({ status: "active" })],
    licences: [licenceRecord({ __v: 1 })]
  });
  await assertServiceRejects(
    () => stale.service.approveDraftLicence(ADMIN, LICENCE_ID, { expectedVersion: 0 }),
    "stale_update"
  );

  const missingDate = createFixtureService({
    packages: [packageRecord({ status: "active" })],
    licences: [licenceRecord({ licenceExpiry: null })]
  });
  await assertServiceRejects(
    () => missingDate.service.approveDraftLicence(ADMIN, LICENCE_ID, { expectedVersion: 0 }),
    "validation_failed"
  );

  const expired = createFixtureService({
    packages: [packageRecord({ status: "active" })],
    licences: [licenceRecord({ licenceExpiry: futureDate(-1) })]
  });
  await assertServiceRejects(
    () => expired.service.approveDraftLicence(ADMIN, LICENCE_ID, { expectedVersion: 0 }),
    "validation_failed"
  );

  const mismatchedProject = createFixtureService({
    packages: [packageRecord({ status: "active" })],
    projects: [{ _id: PROJECT_ID, clientId: OTHER_CLIENT_ID, projectType: "POS System" }]
  });
  await assertServiceRejects(
    () => mismatchedProject.service.approveDraftLicence(ADMIN, LICENCE_ID, { expectedVersion: 0 }),
    "validation_failed"
  );
});

test("lifecycle services remain unmounted from production startup and UI", () => {
  const rootDir = path.join(__dirname, "..", "..");
  [
    "server.js",
    "server/server.js",
    "server/routes/index.js",
    "tools/pos-licence-admin-ui/index.html",
    "tools/pos-licence-admin-ui/pos-licence-admin-ui.js"
  ].forEach((relativePath) => {
    const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    assert.doesNotMatch(source, /posLicenceLifecycleService|publishDraftPackage|approveDraftLicence/);
  });
});
