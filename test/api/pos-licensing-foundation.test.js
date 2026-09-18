const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licensing-foundation-test-secret";

const AuditLog = require("../../server/models/AuditLog");
const PosActivationCode = require("../../server/models/PosActivationCode");
const PosInstallation = require("../../server/models/PosInstallation");
const PosLicence = require("../../server/models/PosLicence");
const PosLicenceIssue = require("../../server/models/PosLicenceIssue");
const PosPackage = require("../../server/models/PosPackage");
const {
  LICENCE_PERMISSIONS,
  hasPermission,
  requireLicencePermission
} = require("../../server/middleware/auth");
const {
  POS_EDITION_STANDARD,
  POS_LICENCE_SCHEMA_VERSION,
  POS_STANDARD_MANDATORY_MODULE_IDS,
  POS_STANDARD_MODULE_IDS,
  POS_STANDARD_OPTIONAL_MODULE_IDS,
  POS_STANDARD_SIGNED_RESPONSE_FIELDS,
  POS_STANDARD_UPDATE_CHANNELS,
  getStandardLicenceSignatureData,
  validateStandardSignedResponseFieldSet
} = require("../../server/utils/posLicenceContract");
const {
  assertNoRawCredentialFields,
  sanitizeLicenceAuditMetadata,
  serializePosActivationCode,
  serializePosInstallation,
  validateActivationCodePolicy,
  validateLicenceIssuePolicy,
  validateLicencePackageConsistency,
  validatePosLicencePolicy,
  validatePosPackagePolicy
} = require("../../server/utils/posLicencePolicy");

const USER_ID = new mongoose.Types.ObjectId();
const PROJECT_ID = new mongoose.Types.ObjectId();
const PACKAGE_ID = new mongoose.Types.ObjectId();
const LICENCE_ID = new mongoose.Types.ObjectId();
const INSTALLATION_ID = new mongoose.Types.ObjectId();
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const ALL_STANDARD_MODULES = [...POS_STANDARD_MODULE_IDS];

function daysFromNow(days) {
  const date = new Date("2026-08-31T00:00:00.000Z");
  date.setDate(date.getDate() + days);
  return date;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function runMiddleware(middleware, user = null, body = {}) {
  const req = { headers: {}, user, body };
  const res = createResponse();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, res };
}

function buildActivePackage(overrides = {}) {
  return new PosPackage({
    packageCode: "standard-base",
    name: "POS Standard Base",
    edition: POS_EDITION_STANDARD,
    status: "active",
    moduleIds: ALL_STANDARD_MODULES,
    updateChannels: ["stable", "beta"],
    createdBy: USER_ID,
    ...overrides
  });
}

function buildActiveLicence(overrides = {}) {
  return new PosLicence({
    clientId: USER_ID,
    projectId: PROJECT_ID,
    packageId: PACKAGE_ID,
    edition: POS_EDITION_STANDARD,
    status: "active",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: daysFromNow(30),
    supportExpiry: daysFromNow(60),
    createdBy: USER_ID,
    ...overrides
  });
}

test("POS Standard contract constants match the current verifier shape", () => {
  assert.equal(POS_LICENCE_SCHEMA_VERSION, 1);
  assert.equal(POS_EDITION_STANDARD, "standard");
  assert.deepEqual(POS_STANDARD_UPDATE_CHANNELS, ["stable", "beta", "preview"]);
  assert.deepEqual(POS_STANDARD_OPTIONAL_MODULE_IDS, ["purchases", "suppliers", "expenses", "reports", "staff"]);
  assert.deepEqual(POS_STANDARD_SIGNED_RESPONSE_FIELDS, [
    "schemaVersion",
    "clientId",
    "installationId",
    "edition",
    "licenceStatus",
    "licenceExpiry",
    "enabledModules",
    "updateChannel",
    "supportExpiry",
    "issuedAt",
    "offlineValidUntil",
    "signature"
  ]);
});

test("signature data canonicalization sorts object keys and excludes signature", () => {
  const payload = {
    signature: "hidden",
    edition: "standard",
    schemaVersion: 1,
    enabledModules: ["billing", "reports"],
    nested: {
      z: true,
      a: null
    }
  };

  assert.equal(
    getStandardLicenceSignatureData(payload),
    "{\"edition\":\"standard\",\"enabledModules\":[\"billing\",\"reports\"],\"nested\":{\"a\":null,\"z\":true},\"schemaVersion\":1}"
  );
});

test("signed response field validation rejects missing and extra contract fields", () => {
  const validPayload = Object.fromEntries(POS_STANDARD_SIGNED_RESPONSE_FIELDS.map((field) => [field, field]));
  assert.deepEqual(validateStandardSignedResponseFieldSet(validPayload), []);

  const invalidPayload = { ...validPayload, keyId: "not-in-pos-contract" };
  delete invalidPayload.signature;

  const errors = validateStandardSignedResponseFieldSet(invalidPayload);
  assert.match(errors.join(" "), /missing fields: signature/);
  assert.match(errors.join(" "), /unsupported fields: keyId/);
});

test("valid Standard package, licence, installation, activation code, and issue records validate without a database connection", async () => {
  const posPackage = buildActivePackage();
  const licence = buildActiveLicence();
  const installation = new PosInstallation({
    licenceId: LICENCE_ID,
    deviceInstallationId: DEVICE_INSTALLATION_ID,
    status: "active",
    firstActivatedAt: daysFromNow(0),
    renewalCredentialHash: "sha256:reserved-for-future",
    createdBy: USER_ID
  });
  const activationCode = new PosActivationCode({
    licenceId: LICENCE_ID,
    codeHash: "sha256:activation-code-digest-only",
    status: "active",
    expiresAt: daysFromNow(7),
    maxRedemptions: 1,
    redeemedCount: 0,
    createdBy: USER_ID
  });
  const issue = new PosLicenceIssue({
    licenceId: LICENCE_ID,
    installationId: INSTALLATION_ID,
    status: "issued",
    issueReason: "activation",
    keyId: "future-key-id",
    issuedAt: daysFromNow(0),
    licenceExpiry: daysFromNow(30),
    offlineValidUntil: daysFromNow(14),
    payloadDigest: "sha256:signed-payload-digest",
    createdBy: USER_ID
  });

  await assert.doesNotReject(() => posPackage.validate());
  await assert.doesNotReject(() => licence.validate());
  await assert.doesNotReject(() => installation.validate());
  await assert.doesNotReject(() => activationCode.validate());
  await assert.doesNotReject(() => issue.validate());
});

test("invalid edition, channel, modules, and dates are rejected", async () => {
  await assert.rejects(
    () => buildActivePackage({ edition: "premium" }).validate(),
    /edition/
  );
  await assert.rejects(
    () => buildActivePackage({ updateChannels: ["nightly"] }).validate(),
    /update channels/i
  );
  await assert.rejects(
    () => buildActiveLicence({ entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "unknown"] }).validate(),
    /unsupported module/i
  );
  await assert.rejects(
    () => new PosLicenceIssue({
      licenceId: LICENCE_ID,
      installationId: INSTALLATION_ID,
      status: "issued",
      issueReason: "activation",
      issuedAt: daysFromNow(0),
      licenceExpiry: daysFromNow(10),
      offlineValidUntil: daysFromNow(11),
      payloadDigest: "sha256:bad-dates"
    }).validate(),
    /offlineValidUntil must not exceed licenceExpiry/
  );
});

test("package and licence consistency is enforced by the shared policy service", () => {
  const posPackage = buildActivePackage({
    _id: PACKAGE_ID,
    moduleIds: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannels: ["stable"]
  });
  const licence = buildActiveLicence({
    packageId: PACKAGE_ID,
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable"
  });

  assert.deepEqual(validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true }), []);

  const overEntitledLicence = buildActiveLicence({
    packageId: PACKAGE_ID,
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports", "staff"]
  });
  assert.match(
    validateLicencePackageConsistency(overEntitledLicence, posPackage, { requireIssuable: true }).join(" "),
    /not allowed by its package: staff/
  );
});

test("incomplete drafts can be saved but cannot be considered issuable", async () => {
  const draftPackage = new PosPackage({
    packageCode: "standard-draft",
    name: "Draft Standard Package",
    edition: POS_EDITION_STANDARD,
    status: "draft"
  });
  const draftLicence = new PosLicence({
    clientId: USER_ID,
    edition: POS_EDITION_STANDARD,
    status: "draft"
  });
  const draftActivationCode = new PosActivationCode({
    licenceId: LICENCE_ID,
    codeHash: "sha256:draft-code",
    status: "draft"
  });

  await assert.doesNotReject(() => draftPackage.validate());
  await assert.doesNotReject(() => draftLicence.validate());
  await assert.doesNotReject(() => draftActivationCode.validate());
  assert.match(validatePosPackagePolicy(draftPackage, { requireIssuable: true }).join(" "), /explicit module IDs/);
  assert.match(validatePosLicencePolicy(draftLicence, { requireIssuable: true }).join(" "), /explicit licence expiry/);
  assert.match(validateActivationCodePolicy(draftActivationCode, { requireIssuable: true }).join(" "), /explicit expiry/);
});

test("licence issue policy prevents renewal from extending beyond the authorized licence", () => {
  const licence = buildActiveLicence({ licenceExpiry: daysFromNow(30) });
  const issue = {
    status: "issued",
    issueReason: "renewal",
    issuedAt: daysFromNow(1),
    licenceExpiry: daysFromNow(31),
    offlineValidUntil: daysFromNow(20)
  };

  assert.match(validateLicenceIssuePolicy(issue, licence).join(" "), /cannot extend licenceExpiry/);
});

test("licence permissions are admin-only and ignore client-controlled permission attempts", async () => {
  assert.deepEqual(LICENCE_PERMISSIONS, ["licences:view", "licences:manage"]);
  assert.equal(hasPermission({ role: "admin" }, "licences:manage"), true);
  assert.equal(hasPermission({ role: "manager" }, "licences:view"), false);
  assert.equal(hasPermission({ role: "staff" }, "licences:view"), false);
  assert.equal(hasPermission({ role: "employee" }, "licences:view"), false);
  assert.equal(hasPermission({ role: "client", permissions: ["licences:manage", "*"] }, "licences:manage"), false);

  const adminAllowed = await runMiddleware(requireLicencePermission("licences:manage"), { role: "admin" });
  assert.equal(adminAllowed.nextCalled, true);

  for (const role of ["manager", "staff", "employee", "client"]) {
    const result = await runMiddleware(
      requireLicencePermission("licences:view"),
      { role, permissions: ["*", "licences:view"] },
      { role: "admin", permissions: ["licences:manage"] }
    );
    assert.equal(result.nextCalled, false, `${role} must not administer licences`);
    assert.equal(result.res.statusCode, 403);
  }

  const anonymous = await runMiddleware(requireLicencePermission("licences:view"));
  assert.equal(anonymous.nextCalled, false);
  assert.equal(anonymous.res.statusCode, 403);
});

test("raw licence credentials are rejected at service boundaries", () => {
  assert.throws(
    () => assertNoRawCredentialFields({ activationCode: "do-not-persist", licenceId: String(LICENCE_ID) }),
    /activationCode/
  );
  assert.throws(
    () => assertNoRawCredentialFields({ renewalSecret: "do-not-persist" }),
    /renewalSecret/
  );
  assert.doesNotThrow(() => assertNoRawCredentialFields({ codeHash: "sha256:digest", renewalCredentialHash: "sha256:digest" }));
});

test("credential hashes are excluded from ordinary serialization and normal query selection", () => {
  const activationCode = new PosActivationCode({
    licenceId: LICENCE_ID,
    codeHash: "sha256:activation-code-digest-only",
    status: "draft"
  });
  const installation = new PosInstallation({
    licenceId: LICENCE_ID,
    deviceInstallationId: DEVICE_INSTALLATION_ID,
    renewalCredentialHash: "sha256:reserved-for-future"
  });

  assert.equal(PosActivationCode.schema.path("codeHash").options.select, false);
  assert.equal(PosInstallation.schema.path("renewalCredentialHash").options.select, false);
  assert.equal("codeHash" in serializePosActivationCode(activationCode), false);
  assert.equal("renewalCredentialHash" in serializePosInstallation(installation), false);
});

test("licence audit metadata allowlist excludes credentials, hashes, keys, and raw request bodies", () => {
  assert.equal(AuditLog.AUDIT_MODULES.includes("Licences"), true);

  const metadata = sanitizeLicenceAuditMetadata({
    action: "licences.prepared",
    actorId: String(USER_ID),
    licenceId: String(LICENCE_ID),
    outcome: "validated",
    reason: "package consistency checked",
    activationCode: "raw-code",
    codeHash: "sha256:secret",
    renewalSecret: "secret",
    privateKey: "private",
    rawRequestBody: "{secret:true}"
  });
  const serialized = JSON.stringify(metadata);

  assert.equal(metadata.action, "licences.prepared");
  assert.equal(metadata.outcome, "validated");
  assert.equal(serialized.includes("raw-code"), false);
  assert.equal(serialized.includes("sha256:secret"), false);
  assert.equal(serialized.includes("private"), false);
  assert.equal(serialized.includes("rawRequestBody"), false);
});

test("schema indexes define uniqueness constraints without touching a database", () => {
  const activationIndexes = PosActivationCode.schema.indexes();
  const installationIndexes = PosInstallation.schema.indexes();
  const packageIndexes = PosPackage.schema.indexes();

  assert.equal(activationIndexes.some(([fields, options]) => fields.codeHash === 1 && options.unique === true), true);
  assert.equal(
    installationIndexes.some(([fields, options]) => fields.licenceId === 1 && fields.deviceInstallationId === 1 && options.unique === true),
    true
  );
  assert.equal(packageIndexes.some(([fields, options]) => fields.packageCode === 1 && options.unique === true), true);
});
