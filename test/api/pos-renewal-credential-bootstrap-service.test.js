const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const PosInstallation = require("../../server/models/PosInstallation");
const {
  POS_EDITION_STANDARD
} = require("../../server/utils/posLicenceContract");
const {
  generateActivationCode
} = require("../../server/utils/posActivationCodeToken");
const {
  RENEWAL_CREDENTIAL_DIGEST_PREFIX,
  RENEWAL_CREDENTIAL_DIGEST_PURPOSE,
  RENEWAL_CREDENTIAL_PREFIX,
  RENEWAL_CREDENTIAL_RANDOM_BYTES,
  digestRenewalCredential,
  isRenewalCredentialDigestFormat,
  isRenewalCredentialFormat,
  normalizeRenewalCredential,
  normalizeRenewalCredentialDigest
} = require("../../server/utils/posRenewalCredentialToken");
const {
  serializePosInstallation
} = require("../../server/utils/posLicencePolicy");
const {
  BOOTSTRAP_REQUEST_FIELDS,
  normalizeBootstrapRequest
} = require("../../server/services/posRenewalCredentialBootstrapService");

const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function clientGeneratedRenewalCredential() {
  return `${RENEWAL_CREDENTIAL_PREFIX}${crypto.randomBytes(RENEWAL_CREDENTIAL_RANDOM_BYTES).toString("hex")}`;
}

function bootstrapRequest(overrides = {}) {
  const rawRenewalCredential = clientGeneratedRenewalCredential();
  return {
    schemaVersion: 1,
    edition: POS_EDITION_STANDARD,
    activationCode: generateActivationCode(),
    deviceInstallationId: DEVICE_INSTALLATION_ID,
    signedLicenceSignature: Buffer.from(crypto.randomBytes(64)).toString("base64"),
    renewalCredentialDigest: digestRenewalCredential(rawRenewalCredential),
    ...overrides
  };
}

test("renewal credential format uses 32 random bytes and purpose-separated digest storage", () => {
  const credential = clientGeneratedRenewalCredential();
  assert.equal(credential.length, RENEWAL_CREDENTIAL_PREFIX.length + RENEWAL_CREDENTIAL_RANDOM_BYTES * 2);
  assert.equal(isRenewalCredentialFormat(credential), true);
  assert.equal(normalizeRenewalCredential(credential.toUpperCase()), credential);

  const digest = digestRenewalCredential(credential);
  assert.match(digest, /^sha256:v1:[a-f0-9]{64}$/);
  assert.equal(digest.startsWith(RENEWAL_CREDENTIAL_DIGEST_PREFIX), true);
  assert.equal(RENEWAL_CREDENTIAL_DIGEST_PURPOSE, "automatex-pos-renewal-credential:v1:");
  assert.equal(isRenewalCredentialDigestFormat(digest), true);
  assert.equal(isRenewalCredentialFormat(digest), false);
  assert.equal(normalizeRenewalCredentialDigest(digest.toUpperCase()), digest);
});

test("bootstrap request normalization accepts only the reviewed fields and stores only a digest", () => {
  const request = bootstrapRequest();
  assert.deepEqual(Object.keys(request), BOOTSTRAP_REQUEST_FIELDS);

  const normalized = normalizeBootstrapRequest(request);
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.edition, "standard");
  assert.equal(normalized.deviceInstallationId, DEVICE_INSTALLATION_ID);
  assert.match(normalized.codeHash, /^sha256:v1:[a-f0-9]{64}$/);
  assert.match(normalized.renewalCredentialDigest, /^sha256:v1:[a-f0-9]{64}$/);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "renewalCredential"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "renewalCredentialHash"), false);
});

test("bootstrap request normalization rejects unknown, protected, operator and malformed values", () => {
  for (const [overrides, code] of [
    [{ unknown: true }, "unknown_field"],
    [{ actorRole: "admin" }, "protected_field"],
    [{ permissions: ["licences:manage"] }, "protected_field"],
    [{ renewalCredential: clientGeneratedRenewalCredential() }, "protected_field"],
    [{ renewalCredentialHash: "sha256:v1:" + "a".repeat(64) }, "protected_field"],
    [{ filter: { $ne: "safe" } }, "invalid_request"],
    [{ schemaVersion: 2 }, "invalid_request"],
    [{ edition: "premium" }, "invalid_request"],
    [{ activationCode: "not-a-code" }, "invalid_activation_code"],
    [{ deviceInstallationId: "not-a-uuid" }, "invalid_installation"],
    [{ signedLicenceSignature: "not base64!" }, "invalid_signature"],
    [{ renewalCredentialDigest: digestRenewalCredential(clientGeneratedRenewalCredential()).replace("sha256:v1:", "") }, "invalid_credential_digest"],
    [{ renewalCredentialDigest: clientGeneratedRenewalCredential() }, "invalid_credential_digest"]
  ]) {
    assert.throws(
      () => normalizeBootstrapRequest(bootstrapRequest(overrides)),
      (error) => error && error.code === code
    );
  }
});

test("installation renewal credential fields validate and ordinary serialization excludes the digest", async () => {
  const installation = new PosInstallation({
    licenceId: "507f1f77bcf86cd799439011",
    deviceInstallationId: DEVICE_INSTALLATION_ID,
    status: "active",
    renewalCredentialHash: digestRenewalCredential(clientGeneratedRenewalCredential()),
    renewalCredentialVersion: 1,
    renewalCredentialBoundAt: new Date("2026-08-31T00:00:00.000Z")
  });
  await assert.doesNotReject(() => installation.validate());

  const serialized = serializePosInstallation(installation);
  assert.equal(serialized.renewalCredentialVersion, 1);
  assert.equal(serialized.renewalCredentialBoundAt.toISOString(), "2026-08-31T00:00:00.000Z");
  assert.equal(Object.prototype.hasOwnProperty.call(serialized, "renewalCredentialHash"), false);

  const invalid = new PosInstallation({
    licenceId: "507f1f77bcf86cd799439011",
    deviceInstallationId: DEVICE_INSTALLATION_ID,
    renewalCredentialVersion: -1
  });
  await assert.rejects(() => invalid.validate(), /Renewal credential version/);
});

test("renewal bootstrap service remains isolated from production startup, admin UI and public assets", () => {
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
    assert.doesNotMatch(source, /posRenewalCredentialBootstrapService|bootstrapRenewalCredential|renewalCredentialHash|posrc_/);
  }

  const publicMatches = [];
  function scanPublic(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        scanPublic(fullPath);
      } else if (/\.(js|html|css)$/i.test(entry.name)) {
        const source = fs.readFileSync(fullPath, "utf8");
        if (/posRenewalCredentialBootstrapService|bootstrapRenewalCredential|renewalCredentialHash|posrc_/.test(source)) {
          publicMatches.push(fullPath);
        }
      }
    }
  }
  scanPublic(path.join(rootDir, "public"));
  assert.deepEqual(publicMatches, []);
});
