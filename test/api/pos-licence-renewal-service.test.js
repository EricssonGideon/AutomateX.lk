const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const PosLicence = require("../../server/models/PosLicence");
const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MANDATORY_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  RENEWAL_CREDENTIAL_PREFIX,
  RENEWAL_CREDENTIAL_RANDOM_BYTES,
  digestRenewalCredential
} = require("../../server/utils/posRenewalCredentialToken");
const {
  RENEWAL_PREDECESSOR_SIGNATURE_PURPOSE,
  RENEWAL_REQUEST_FIELDS,
  hashPredecessorSignature,
  normalizeRenewalRequest
} = require("../../server/services/posLicenceRenewalService");

const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function clientGeneratedRenewalCredential() {
  return `${RENEWAL_CREDENTIAL_PREFIX}${crypto.randomBytes(RENEWAL_CREDENTIAL_RANDOM_BYTES).toString("hex")}`;
}

function renewalRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    edition: POS_EDITION_STANDARD,
    deviceInstallationId: DEVICE_INSTALLATION_ID,
    renewalCredential: clientGeneratedRenewalCredential(),
    lastSignature: Buffer.from(crypto.randomBytes(64)).toString("base64"),
    ...overrides
  };
}

test("renewal request normalization accepts only the reviewed fields and hashes the raw credential server-side", () => {
  const rawCredential = clientGeneratedRenewalCredential();
  const request = renewalRequest({ renewalCredential: rawCredential });
  assert.deepEqual(Object.keys(request), RENEWAL_REQUEST_FIELDS);

  const normalized = normalizeRenewalRequest(request);
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.edition, "standard");
  assert.equal(normalized.deviceInstallationId, DEVICE_INSTALLATION_ID);
  assert.equal(normalized.renewalCredentialDigest, digestRenewalCredential(rawCredential));
  assert.equal(normalized.lastSignature, request.lastSignature);
  assert.match(normalized.predecessorSignatureHash, /^sha256:v1:[a-f0-9]{64}$/);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "renewalCredential"), false);
});

test("renewal request normalization rejects unknown, protected, digest substitution and malformed values", () => {
  const rawCredential = clientGeneratedRenewalCredential();
  for (const [overrides, code] of [
    [{ unknown: true }, "unknown_field"],
    [{ actorRole: "admin" }, "protected_field"],
    [{ permissions: ["licences:manage"] }, "protected_field"],
    [{ renewalCredentialDigest: digestRenewalCredential(rawCredential) }, "protected_field"],
    [{ renewalCredentialHash: digestRenewalCredential(rawCredential) }, "protected_field"],
    [{ filter: { $ne: "safe" } }, "invalid_request"],
    [{ schemaVersion: 2 }, "invalid_request"],
    [{ edition: "premium" }, "invalid_request"],
    [{ deviceInstallationId: "not-a-uuid" }, "invalid_installation"],
    [{ renewalCredential: digestRenewalCredential(rawCredential) }, "invalid_renewal_credential"],
    [{ renewalCredential: "not-a-credential" }, "invalid_renewal_credential"],
    [{ lastSignature: "not base64!" }, "invalid_signature"]
  ]) {
    assert.throws(
      () => normalizeRenewalRequest(renewalRequest(overrides)),
      (error) => error && error.code === code
    );
  }
});

test("renewal-window policy is optional for existing records but validated when set", async () => {
  const licence = new PosLicence({
    clientId: "507f1f77bcf86cd799439011",
    projectId: "507f1f77bcf86cd799439012",
    packageId: "507f1f77bcf86cd799439013",
    edition: POS_EDITION_STANDARD,
    status: "active",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS],
    updateChannel: "stable",
    licenceExpiry: "2026-10-30T00:00:00.000Z",
    supportExpiry: "2026-11-30T00:00:00.000Z",
    offlineValidUntil: "2026-09-30T00:00:00.000Z",
    maxInstallations: 2
  });
  await assert.doesNotReject(() => licence.validate());
  assert.equal(licence.renewalWindowDurationMinutes, null);

  const configured = new PosLicence({
    ...licence.toObject(),
    _id: undefined,
    renewalWindowDurationMinutes: 1440
  });
  await assert.doesNotReject(() => configured.validate());

  await assert.rejects(
    () => new PosLicence({
      ...licence.toObject(),
      _id: undefined,
      renewalWindowDurationMinutes: 0
    }).validate(),
    /renewalWindowDurationMinutes/
  );
});

test("predecessor signature hash is purpose-separated and does not expose the signature", () => {
  const signature = Buffer.from(crypto.randomBytes(64)).toString("base64");
  const hash = hashPredecessorSignature(signature);
  assert.match(hash, /^sha256:v1:[a-f0-9]{64}$/);
  assert.equal(hash.includes(signature), false);
  assert.equal(RENEWAL_PREDECESSOR_SIGNATURE_PURPOSE, "automatex-pos-renewal-predecessor-signature:v1:");
});

test("renewal service remains isolated from production startup, admin routes, UI and public assets", () => {
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
    assert.doesNotMatch(source, /posLicenceRenewalService|renewLicence|renewalWindowDurationMinutes/);
  }

  const publicMatches = [];
  function scanPublic(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        scanPublic(fullPath);
      } else if (/\.(js|html|css)$/i.test(entry.name)) {
        const source = fs.readFileSync(fullPath, "utf8");
        if (/posLicenceRenewalService|renewLicence|renewalCredential|renewalWindowDurationMinutes/.test(source)) {
          publicMatches.push(fullPath);
        }
      }
    }
  }
  scanPublic(path.join(rootDir, "public"));
  assert.deepEqual(publicMatches, []);
});
