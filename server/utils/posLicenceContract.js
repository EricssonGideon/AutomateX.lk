const POS_LICENCE_SCHEMA_VERSION = 1;
const POS_ACTIVATION_API_SCHEMA_VERSION = 1;
const POS_EDITION_STANDARD = "standard";
const POS_STANDARD_SIGNED_LICENCE_STATUS = "active";

const POS_STANDARD_UPDATE_CHANNELS = Object.freeze(["stable", "beta", "preview"]);

// Source: /Users/robertericsson/AutomateX/Systems/AutomateX POS Systems/POS-Standard Original/app.js
// Constants mirror the POS Standard verifier and setup activation client from Part 46.
const POS_STANDARD_MODULE_CATALOG = Object.freeze([
  { id: "dashboard", mandatory: true },
  { id: "billing", mandatory: true },
  { id: "products", mandatory: true },
  { id: "inventory", mandatory: true },
  { id: "purchases", mandatory: false },
  { id: "suppliers", mandatory: false },
  { id: "customers", mandatory: true },
  { id: "sales", mandatory: true },
  { id: "expenses", mandatory: false },
  { id: "reports", mandatory: false },
  { id: "staff", mandatory: false },
  { id: "backup", mandatory: true },
  { id: "settings", mandatory: true }
]);

const POS_STANDARD_MODULE_IDS = Object.freeze(POS_STANDARD_MODULE_CATALOG.map((moduleConfig) => moduleConfig.id));
const POS_STANDARD_MANDATORY_MODULE_IDS = Object.freeze(
  POS_STANDARD_MODULE_CATALOG.filter((moduleConfig) => moduleConfig.mandatory).map((moduleConfig) => moduleConfig.id)
);
const POS_STANDARD_OPTIONAL_MODULE_IDS = Object.freeze(
  POS_STANDARD_MODULE_CATALOG.filter((moduleConfig) => !moduleConfig.mandatory).map((moduleConfig) => moduleConfig.id)
);

const POS_STANDARD_SIGNED_RESPONSE_FIELDS = Object.freeze([
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
  "keyId",
  "signature"
]);

const POS_STANDARD_ACTIVATION_REQUEST_FIELDS = Object.freeze([
  "schemaVersion",
  "activationCode",
  "edition",
  "appVersion",
  "providerConfigVersion",
  "deviceInstallationId",
  "setupStatus",
  "runtime"
]);

const moduleIdSet = new Set(POS_STANDARD_MODULE_IDS);
const updateChannelSet = new Set(POS_STANDARD_UPDATE_CHANNELS);
const signedResponseFieldSet = new Set(POS_STANDARD_SIGNED_RESPONSE_FIELDS);

function normalizePosText(value) {
  return String(value || "").trim().toLowerCase();
}

function isStandardEdition(value) {
  return normalizePosText(value) === POS_EDITION_STANDARD;
}

function isStandardUpdateChannel(value) {
  return updateChannelSet.has(normalizePosText(value));
}

function isStandardModuleId(value) {
  return moduleIdSet.has(normalizePosText(value));
}

function normalizeStandardModuleIds(moduleIds) {
  if (!Array.isArray(moduleIds)) {
    return [];
  }

  return [...new Set(
    moduleIds
      .map(normalizePosText)
      .filter((moduleId) => moduleIdSet.has(moduleId))
  )];
}

function getInvalidStandardModuleIds(moduleIds) {
  if (!Array.isArray(moduleIds)) {
    return ["enabledModules must be an array"];
  }

  return moduleIds
    .map(normalizePosText)
    .filter((moduleId) => !moduleId || !moduleIdSet.has(moduleId));
}

function validateStandardSignedResponseFieldSet(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["Signed POS licence payload must be an object."];
  }

  const keys = Object.keys(payload);
  const missing = POS_STANDARD_SIGNED_RESPONSE_FIELDS.filter((field) => !keys.includes(field));
  const extra = keys.filter((field) => !signedResponseFieldSet.has(field));
  const errors = [];

  if (missing.length) {
    errors.push(`Signed POS licence payload is missing fields: ${missing.join(", ")}.`);
  }

  if (extra.length) {
    errors.push(`Signed POS licence payload has unsupported fields: ${extra.join(", ")}.`);
  }

  return errors;
}

function canonicalizeStandardJsonForSignature(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot sign non-finite numbers.");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeStandardJsonForSignature(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeStandardJsonForSignature(value[key])}`).join(",")}}`;
  }

  throw new Error("Cannot sign unsupported JSON value.");
}

function getStandardLicenceSignatureData(payload) {
  const unsignedPayload = { ...(payload || {}) };
  delete unsignedPayload.signature;
  return canonicalizeStandardJsonForSignature(unsignedPayload);
}

module.exports = {
  POS_ACTIVATION_API_SCHEMA_VERSION,
  POS_EDITION_STANDARD,
  POS_LICENCE_SCHEMA_VERSION,
  POS_STANDARD_ACTIVATION_REQUEST_FIELDS,
  POS_STANDARD_MANDATORY_MODULE_IDS,
  POS_STANDARD_MODULE_CATALOG,
  POS_STANDARD_MODULE_IDS,
  POS_STANDARD_OPTIONAL_MODULE_IDS,
  POS_STANDARD_SIGNED_LICENCE_STATUS,
  POS_STANDARD_SIGNED_RESPONSE_FIELDS,
  POS_STANDARD_UPDATE_CHANNELS,
  canonicalizeStandardJsonForSignature,
  getInvalidStandardModuleIds,
  getStandardLicenceSignatureData,
  isStandardEdition,
  isStandardModuleId,
  isStandardUpdateChannel,
  normalizeStandardModuleIds,
  validateStandardSignedResponseFieldSet
};
