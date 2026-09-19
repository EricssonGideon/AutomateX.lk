const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licence-admin-service-test-secret";

const PosActivationCode = require("../../server/models/PosActivationCode");
const PosInstallation = require("../../server/models/PosInstallation");
const PosLicence = require("../../server/models/PosLicence");
const PosLicenceIssue = require("../../server/models/PosLicenceIssue");
const PosPackage = require("../../server/models/PosPackage");
const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MANDATORY_MODULE_IDS,
  POS_STANDARD_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  createPosLicenceAdminService
} = require("../../server/services/posLicenceAdminService");

const rootDir = path.join(__dirname, "..", "..");
const ADMIN = {
  id: "507f1f77bcf86cd799439011",
  name: "Trusted Admin",
  email: "admin@example.com",
  role: "admin"
};
const CLIENT_ID = "507f1f77bcf86cd799439012";
const PROJECT_ID = "507f1f77bcf86cd799439013";
const PACKAGE_ID = "507f1f77bcf86cd799439014";
const LICENCE_ID = "507f1f77bcf86cd799439015";
const OTHER_CLIENT_ID = "507f1f77bcf86cd799439016";

function futureDate(days) {
  const date = new Date("2026-08-31T00:00:00.000Z");
  date.setDate(date.getDate() + days);
  return date;
}

function cloneRecord(record) {
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

function matchValue(actual, expected) {
  if (expected && typeof expected === "object" && !Array.isArray(expected) && Object.prototype.hasOwnProperty.call(expected, "$ne")) {
    return String(actual) !== String(expected.$ne);
  }

  return String(actual || "") === String(expected || "");
}

function matchesQuery(record, query = {}) {
  return Object.entries(query).every(([field, expected]) => matchValue(record[field], expected));
}

function createRepository(initialRecords = []) {
  const records = new Map(initialRecords.map((record) => [String(record._id), cloneRecord(record)]));
  const calls = {
    create: 0,
    findById: 0,
    findOne: 0,
    exists: 0,
    findOneAndUpdate: 0
  };

  return {
    calls,
    records,
    async findById(id) {
      calls.findById += 1;
      return cloneRecord(records.get(String(id)));
    },
    async findOne(query) {
      calls.findOne += 1;
      const found = [...records.values()].find((record) => matchesQuery(record, query));
      return cloneRecord(found);
    },
    async exists(query) {
      calls.exists += 1;
      return [...records.values()].some((record) => matchesQuery(record, query));
    },
    async create(input) {
      calls.create += 1;
      if (input.packageCode && [...records.values()].some((record) => record.packageCode === input.packageCode)) {
        const duplicate = new Error("duplicate key error");
        duplicate.code = 11000;
        throw duplicate;
      }
      const _id = input._id || new mongoose.Types.ObjectId().toString();
      const record = {
        __v: 0,
        createdAt: new Date("2026-08-31T00:00:00.000Z"),
        updatedAt: new Date("2026-08-31T00:00:00.000Z"),
        ...input,
        _id
      };
      records.set(String(_id), cloneRecord(record));
      return cloneRecord(record);
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
        updatedAt: new Date("2026-08-31T00:00:00.000Z")
      };
      records.set(String(found._id), cloneRecord(next));
      return cloneRecord(next);
    }
  };
}

function createFixtureService(overrides = {}) {
  const users = createRepository([
    { _id: CLIENT_ID, role: "client", email: "client@example.com" },
    { _id: OTHER_CLIENT_ID, role: "client", email: "other@example.com" },
    { _id: "507f1f77bcf86cd799439017", role: "manager", email: "manager@example.com" }
  ]);
  const projects = createRepository([
    { _id: PROJECT_ID, clientId: CLIENT_ID, projectType: "POS System", projectTitle: "POS Project" },
    { _id: "507f1f77bcf86cd799439018", clientId: OTHER_CLIENT_ID, projectType: "POS System", projectTitle: "Other POS" },
    { _id: "507f1f77bcf86cd799439019", clientId: CLIENT_ID, projectType: "Website", projectTitle: "Website" }
  ]);
  const posPackages = createRepository([
    {
      _id: PACKAGE_ID,
      packageCode: "standard-base",
      name: "Standard Base",
      edition: POS_EDITION_STANDARD,
      status: "draft",
      moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
      updateChannels: ["stable"],
      notes: "",
      __v: 0
    }
  ]);
  const posLicences = createRepository([
    {
      _id: LICENCE_ID,
      clientId: CLIENT_ID,
      projectId: PROJECT_ID,
      packageId: PACKAGE_ID,
      edition: POS_EDITION_STANDARD,
      status: "draft",
      entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS],
      updateChannel: "stable",
      licenceExpiry: futureDate(30),
      supportExpiry: futureDate(60),
      notes: "",
      __v: 0
    }
  ]);
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
  const repositories = {
    users: overrides.users || users,
    projects: overrides.projects || projects,
    posPackages: overrides.posPackages || posPackages,
    posLicences: overrides.posLicences || posLicences
  };

  return {
    service: createPosLicenceAdminService({ repositories, auditLogger: audit }),
    repositories,
    audit
  };
}

async function assertServiceRejects(fn, code) {
  await assert.rejects(
    fn,
    (error) => {
      assert.equal(error.code, code);
      return true;
    }
  );
}

test("authorized admins can create and update draft POS Standard packages", async () => {
  const { service, repositories, audit } = createFixtureService();
  const created = await service.createDraftPackage(ADMIN, {
    packageCode: "standard-plus",
    name: "Standard Plus",
    edition: "standard",
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "staff"],
    updateChannels: ["stable"],
    notes: "Draft only"
  });

  assert.equal(created.package.packageCode, "standard-plus");
  assert.equal(created.package.status, "draft");
  assert.equal(created.readiness.ready, true);
  assert.equal(created.audit.ok, true);

  const updated = await service.updateDraftPackage(ADMIN, PACKAGE_ID, {
    name: "Standard Base Updated",
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"]
  }, { expectedVersion: 0 });

  assert.equal(updated.package.name, "Standard Base Updated");
  assert.equal(updated.package.version, 1);
  assert.equal(repositories.posPackages.calls.findOneAndUpdate, 1);
  assert.equal(audit.calls.length, 2);
});

test("authorized admins can create and update draft POS licences with valid references", async () => {
  const { service, repositories } = createFixtureService();
  const created = await service.createDraftLicence(ADMIN, {
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    packageId: PACKAGE_ID,
    edition: "standard",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: futureDate(30),
    supportExpiry: futureDate(90)
  });

  assert.equal(created.licence.clientId, CLIENT_ID);
  assert.equal(created.licence.updateChannel, "stable");
  assert.equal(created.readiness.ready, false);
  assert.match(created.readiness.errors.join(" "), /active package/);

  const updated = await service.updateDraftLicence(ADMIN, LICENCE_ID, {
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    notes: "Prepared for future issuance"
  }, { expectedVersion: 0 });

  assert.deepEqual(updated.licence.entitledModules, [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"]);
  assert.equal(updated.licence.version, 1);
  assert.equal(repositories.posLicences.calls.findOneAndUpdate, 1);
});

test("unauthorized callers fail before protected reads or writes", async () => {
  for (const actor of [
    null,
    { id: "u1", role: "manager", permissions: ["*", "licences:manage"] },
    { id: "u2", role: "staff", permissions: ["licences:manage"] },
    { id: "u3", role: "employee" },
    { id: "u4", role: "client" }
  ]) {
    const { service, repositories } = createFixtureService();
    await assertServiceRejects(
      () => service.createDraftPackage(actor, {
        packageCode: "standard-denied",
        name: "Denied",
        moduleIds: POS_STANDARD_MODULE_IDS,
        updateChannels: ["stable"]
      }),
      "forbidden"
    );
    assert.equal(repositories.posPackages.calls.findOne, 0);
    assert.equal(repositories.posPackages.calls.create, 0);
  }
});

test("forged actor, permission, credential, protected, and unknown fields are rejected", async () => {
  const { service, repositories } = createFixtureService();

  await assertServiceRejects(
    () => service.createDraftPackage(ADMIN, {
      packageCode: "standard-forged",
      name: "Forged",
      moduleIds: POS_STANDARD_MODULE_IDS,
      updateChannels: ["stable"],
      actorRole: "admin"
    }),
    "protected_field"
  );
  await assertServiceRejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: CLIENT_ID,
      activationCode: "raw-code"
    }),
    "protected_field"
  );
  await assertServiceRejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: CLIENT_ID,
      issue: { status: "issued" }
    }),
    "protected_field"
  );
  await assertServiceRejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: CLIENT_ID,
      unexpected: true
    }),
    "unknown_field"
  );

  assert.equal(repositories.posLicences.calls.create, 0);
});

test("missing and mismatched client, project, and package references are rejected", async () => {
  const { service } = createFixtureService();

  await assertServiceRejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: "507f1f77bcf86cd799439099"
    }),
    "validation_failed"
  );
  await assertServiceRejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: CLIENT_ID,
      projectId: "507f1f77bcf86cd799439018"
    }),
    "validation_failed"
  );
  await assertServiceRejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: CLIENT_ID,
      projectId: "507f1f77bcf86cd799439019"
    }),
    "validation_failed"
  );
  await assertServiceRejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: CLIENT_ID,
      packageId: "507f1f77bcf86cd799439099"
    }),
    "validation_failed"
  );
});

test("invalid modules, update channels, dates, and unsupported editions are rejected", async () => {
  const { service } = createFixtureService();

  await assertServiceRejects(
    () => service.createDraftPackage(ADMIN, {
      packageCode: "standard-invalid-module",
      name: "Invalid",
      edition: "premium",
      moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "unknown"],
      updateChannels: ["stable"]
    }),
    "validation_failed"
  );
  await assertServiceRejects(
    () => service.createDraftPackage(ADMIN, {
      packageCode: "standard-invalid-channel",
      name: "Invalid Channel",
      moduleIds: POS_STANDARD_MODULE_IDS,
      updateChannels: ["nightly"]
    }),
    "validation_failed"
  );
  await assertServiceRejects(
    () => service.createDraftLicence(ADMIN, {
      clientId: CLIENT_ID,
      packageId: PACKAGE_ID,
      entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "staff"],
      updateChannel: "beta",
      licenceExpiry: "not-a-date"
    }),
    "validation_failed"
  );
});

test("incomplete drafts can be saved but remain non-issuable", async () => {
  const { service } = createFixtureService();

  const draftPackage = await service.createDraftPackage(ADMIN, {
    packageCode: "standard-incomplete",
    name: "Incomplete Standard"
  });
  assert.equal(draftPackage.readiness.ready, false);
  assert.match(draftPackage.readiness.errors.join(" "), /explicit module IDs/);

  const draftLicence = await service.createDraftLicence(ADMIN, {
    clientId: CLIENT_ID
  });
  assert.equal(draftLicence.readiness.ready, false);
  assert.match(draftLicence.readiness.errors.join(" "), /POS project/);
  assert.match(draftLicence.readiness.errors.join(" "), /explicit licence expiry/);
});

test("duplicate package codes, stale updates, non-draft updates, and package-in-use mutations are rejected", async () => {
  const { service, repositories } = createFixtureService();

  await assertServiceRejects(
    () => service.createDraftPackage(ADMIN, {
      packageCode: "standard-base",
      name: "Duplicate",
      moduleIds: POS_STANDARD_MODULE_IDS,
      updateChannels: ["stable"]
    }),
    "duplicate_package_code"
  );
  await assertServiceRejects(
    () => service.updateDraftPackage(ADMIN, PACKAGE_ID, { name: "Stale" }, { expectedVersion: 9 }),
    "stale_update"
  );

  repositories.posPackages.records.set(PACKAGE_ID, {
    ...repositories.posPackages.records.get(PACKAGE_ID),
    status: "active",
    __v: 0
  });
  await assertServiceRejects(
    () => service.updateDraftPackage(ADMIN, PACKAGE_ID, { name: "No update" }, { expectedVersion: 0 }),
    "not_draft"
  );

  repositories.posPackages.records.set(PACKAGE_ID, {
    ...repositories.posPackages.records.get(PACKAGE_ID),
    status: "draft",
    __v: 0
  });
  repositories.posLicences.records.set("507f1f77bcf86cd799439020", {
    _id: "507f1f77bcf86cd799439020",
    packageId: PACKAGE_ID,
    clientId: CLIENT_ID,
    status: "active",
    edition: POS_EDITION_STANDARD,
    entitledModules: POS_STANDARD_MANDATORY_MODULE_IDS,
    updateChannel: "stable",
    licenceExpiry: futureDate(30),
    __v: 0
  });
  await assertServiceRejects(
    () => service.updateDraftPackage(ADMIN, PACKAGE_ID, { name: "Used Package" }, { expectedVersion: 0 }),
    "package_in_use"
  );
});

test("draft readiness reports missing configuration clearly", async () => {
  const { service } = createFixtureService();
  const packageResult = await service.validateDraftPackageReadiness(ADMIN, PACKAGE_ID);
  assert.equal(packageResult.readiness.ready, true);

  const licenceResult = await service.validateDraftLicenceReadiness(ADMIN, LICENCE_ID);
  assert.equal(licenceResult.readiness.ready, false);
  assert.match(licenceResult.readiness.errors.join(" "), /active package/);
});

test("audit success and post-persistence audit failure are reported separately", async () => {
  const successFixture = createFixtureService();
  const success = await successFixture.service.createDraftPackage(ADMIN, {
    packageCode: "standard-audit-success",
    name: "Audit Success",
    moduleIds: POS_STANDARD_MANDATORY_MODULE_IDS,
    updateChannels: ["stable"]
  });

  assert.equal(success.audit.ok, true);
  assert.equal(successFixture.audit.calls[0].module, "Licences");
  assert.equal(successFixture.audit.calls[0].newValue.actorEmail, ADMIN.email);
  assert.equal(successFixture.audit.calls[0].newValue.changeSummary, "moduleIds, name, packageCode, updateChannels");

  const failureFixture = createFixtureService({ auditFails: true });
  const result = await failureFixture.service.createDraftPackage(ADMIN, {
    packageCode: "standard-audit-failure",
    name: "Audit Failure",
    moduleIds: POS_STANDARD_MANDATORY_MODULE_IDS,
    updateChannels: ["stable"]
  });

  assert.equal(result.package.packageCode, "standard-audit-failure");
  assert.equal(result.audit.ok, false);
  assert.match(result.audit.message, /Persistence succeeded/);
  assert.equal(failureFixture.repositories.posPackages.calls.create, 1);
  assert.equal(failureFixture.audit.calls[0].actorEmail, ADMIN.email);
  assert.equal(JSON.stringify(failureFixture.audit.calls[0]).includes("raw-code"), false);
});

test("POS licensing remains isolated from normal startup and production route exposure", () => {
  const startupFiles = [
    "server.js",
    "server/server.js",
    "server/routes/index.js"
  ];

  startupFiles.forEach((relativePath) => {
    const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    assert.doesNotMatch(source, /posLicenceAdminService|PosPackage|PosLicence|PosActivationCode|PosInstallation|PosLicenceIssue/);
  });

  const routeFiles = fs.readdirSync(path.join(rootDir, "server/routes"))
    .filter((fileName) => fileName.endsWith(".js") && ![
      "posLicenceAdmin.js",
      "internalStagingActivationFixture.js"
    ].includes(fileName));
  routeFiles.forEach((fileName) => {
    const source = fs.readFileSync(path.join(rootDir, "server/routes", fileName), "utf8");
    assert.doesNotMatch(source, /posLicenceAdminService|requireLicencePermission/);
  });

  const stagingFixtureRoute = fs.readFileSync(
    path.join(rootDir, "server/routes", "internalStagingActivationFixture.js"),
    "utf8"
  );
  assert.match(stagingFixtureRoute, /VERCEL_GIT_COMMIT_REF/);
  assert.match(stagingFixtureRoute, /POS_LICENSING_STAGING_TEST_FIXTURE_ENABLED/);
  assert.match(stagingFixtureRoute, /requireLicencePermission\("licences:manage"\)/);
});

test("POS schemas disable implicit collection and index creation", () => {
  [
    PosActivationCode,
    PosInstallation,
    PosLicence,
    PosLicenceIssue,
    PosPackage
  ].forEach((model) => {
    assert.equal(model.schema.options.autoCreate, false);
    assert.equal(model.schema.options.autoIndex, false);
  });
});
