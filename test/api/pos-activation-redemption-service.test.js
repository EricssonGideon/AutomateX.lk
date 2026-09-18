const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const PosLicence = require("../../server/models/PosLicence");
const {
  POS_ACTIVATION_API_SCHEMA_VERSION,
  POS_EDITION_STANDARD,
  POS_STANDARD_ACTIVATION_REQUEST_FIELDS,
  POS_STANDARD_MANDATORY_MODULE_IDS
} = require("../../server/utils/posLicenceContract");
const {
  generateActivationCode
} = require("../../server/utils/posActivationCodeToken");
const {
  normalizeActivationRequest
} = require("../../server/services/posActivationRedemptionService");

const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function activationRequest(overrides = {}) {
  return {
    schemaVersion: POS_ACTIVATION_API_SCHEMA_VERSION,
    activationCode: generateActivationCode(),
    edition: POS_EDITION_STANDARD,
    appVersion: "standard-v1",
    providerConfigVersion: 1,
    deviceInstallationId: DEVICE_INSTALLATION_ID,
    setupStatus: "pending",
    runtime: "browser",
    ...overrides
  };
}

test("redemption request normalization accepts only the actual POS activation request fields", () => {
  const request = activationRequest();
  assert.deepEqual(Object.keys(request), POS_STANDARD_ACTIVATION_REQUEST_FIELDS);
  const normalized = normalizeActivationRequest(request);
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.edition, "standard");
  assert.equal(normalized.deviceInstallationId, DEVICE_INSTALLATION_ID);
  assert.match(normalized.codeHash, /^sha256:v1:[a-f0-9]{64}$/);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "activationCode"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "signedPayload"), false);
});

test("redemption request normalization rejects unknown, protected, operator and malformed fields", () => {
  for (const [overrides, code] of [
    [{ unknown: true }, "unknown_field"],
    [{ actorRole: "admin" }, "protected_field"],
    [{ signature: "client-supplied" }, "protected_field"],
    [{ filter: { $ne: "safe" } }, "invalid_request"],
    [{ schemaVersion: 2 }, "invalid_request"],
    [{ edition: "premium" }, "invalid_request"],
    [{ activationCode: "not-a-code" }, "invalid_activation_code"],
    [{ deviceInstallationId: "not-a-uuid" }, "invalid_installation"],
    [{ setupStatus: "restored" }, "invalid_request"],
    [{ runtime: "server" }, "invalid_request"],
    [{ providerConfigVersion: 0 }, "invalid_request"]
  ]) {
    assert.throws(
      () => normalizeActivationRequest(activationRequest(overrides)),
      (error) => error && error.code === code
    );
  }
});

test("licence redemption policy fields are validated without making them commercial defaults", async () => {
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
    maxInstallations: 2,
    activationCount: 0
  });
  await assert.doesNotReject(() => licence.validate());

  const withoutPolicy = new PosLicence({
    clientId: "507f1f77bcf86cd799439011",
    projectId: "507f1f77bcf86cd799439012",
    packageId: "507f1f77bcf86cd799439013",
    edition: POS_EDITION_STANDARD,
    status: "active",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS],
    updateChannel: "stable",
    licenceExpiry: "2026-10-30T00:00:00.000Z"
  });
  await assert.doesNotReject(() => withoutPolicy.validate());
  assert.equal(withoutPolicy.maxInstallations, null);
  assert.equal(withoutPolicy.offlineValidUntil, null);

  await assert.rejects(
    () => new PosLicence({
      ...licence.toObject(),
      _id: undefined,
      maxInstallations: 0
    }).validate(),
    /maxInstallations/
  );
  await assert.rejects(
    () => new PosLicence({
      ...licence.toObject(),
      _id: undefined,
      activationCount: -1
    }).validate(),
    /activationCount/
  );
});

test("redemption service remains isolated from production startup, management routers, UI and public assets", () => {
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
        if (/posActivationRedemptionService|redeemActivation|activationCount|offlineValidUntil/.test(source)) {
          publicMatches.push(fullPath);
        }
      }
    }
  }
  scanPublic(path.join(rootDir, "public"));
  assert.deepEqual(publicMatches, []);
});
