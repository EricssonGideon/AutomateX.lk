const crypto = require("node:crypto");

const {
  POS_EDITION_STANDARD,
  POS_LICENCE_SCHEMA_VERSION,
  POS_STANDARD_MODULE_IDS,
  POS_STANDARD_SIGNED_LICENCE_STATUS,
  getStandardLicenceSignatureData,
  normalizeStandardModuleIds,
  validateStandardSignedResponseFieldSet
} = require("./posLicenceContract");
const {
  validateLicencePackageConsistency,
  validatePosLicencePolicy,
  validatePosPackagePolicy
} = require("./posLicencePolicy");

const APPROVED_LICENCE_STATUS = "active";
const PUBLISHED_PACKAGE_STATUS = "active";
const SIGNABLE_INSTALLATION_STATUSES = Object.freeze(["pending", "active"]);

class PosLicenceSigningError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PosLicenceSigningError";
    this.code = code;
    this.details = details;
  }
}

function idText(value) {
  if (!value) {
    return "";
  }
  if (value._id) {
    return String(value._id);
  }
  return String(value);
}

function documentValue(record, field) {
  if (!record) {
    return undefined;
  }
  if (typeof record.get === "function") {
    return record.get(field);
  }
  return record[field];
}

function toIsoString(value, fieldName, { nullable = false } = {}) {
  if ((value === null || typeof value === "undefined" || value === "") && nullable) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PosLicenceSigningError("invalid_date", `${fieldName} must be a valid date.`);
  }
  return date.toISOString();
}

function assertText(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) {
    throw new PosLicenceSigningError("validation_failed", `${fieldName} is required for POS licence signing.`);
  }
  if (text.length > 160) {
    throw new PosLicenceSigningError("validation_failed", `${fieldName} is too long for the POS Standard signed licence contract.`);
  }
  return text;
}

function throwPolicyErrors(errors) {
  const filtered = errors.filter(Boolean);
  if (filtered.length) {
    throw new PosLicenceSigningError("validation_failed", "POS licence signing validation failed.", { errors: filtered });
  }
}

function assertChronology(issuedAt, offlineValidUntil, licenceExpiry) {
  const issuedTime = new Date(issuedAt).getTime();
  const offlineTime = new Date(offlineValidUntil).getTime();
  const licenceExpiryTime = new Date(licenceExpiry).getTime();

  if (offlineTime <= issuedTime) {
    throw new PosLicenceSigningError("invalid_offline_window", "offlineValidUntil must be after issuedAt.");
  }
  if (issuedTime > licenceExpiryTime) {
    throw new PosLicenceSigningError("invalid_offline_window", "issuedAt must not be after licenceExpiry.");
  }
  if (offlineTime > licenceExpiryTime) {
    throw new PosLicenceSigningError("invalid_offline_window", "offlineValidUntil must not exceed licenceExpiry.");
  }
}

function enabledModulesForSignedPayload(licence, posPackage) {
  const licenceModules = new Set(normalizeStandardModuleIds(documentValue(licence, "entitledModules") || []));
  const packageModules = new Set(normalizeStandardModuleIds(documentValue(posPackage, "moduleIds") || []));
  return POS_STANDARD_MODULE_IDS.filter((moduleId) => licenceModules.has(moduleId) && packageModules.has(moduleId));
}

function buildStandardSignedLicencePayload({ licence, posPackage, installation, issuedAt, offlineValidUntil }) {
  if (!licence || !posPackage || !installation) {
    throw new PosLicenceSigningError("validation_failed", "Licence, package and installation records are required for POS licence signing.");
  }

  if (documentValue(licence, "status") !== APPROVED_LICENCE_STATUS) {
    throw new PosLicenceSigningError("licence_not_approved", "Only approved active POS licences can be signed.");
  }
  if (documentValue(posPackage, "status") !== PUBLISHED_PACKAGE_STATUS) {
    throw new PosLicenceSigningError("package_not_published", "Only published active POS packages can be signed.");
  }
  if (documentValue(licence, "edition") !== POS_EDITION_STANDARD || documentValue(posPackage, "edition") !== POS_EDITION_STANDARD) {
    throw new PosLicenceSigningError("validation_failed", "Only POS Standard licences can be signed.");
  }

  const licenceId = idText(documentValue(installation, "licenceId"));
  const expectedLicenceId = idText(documentValue(licence, "_id") || documentValue(licence, "id"));
  if (expectedLicenceId && licenceId !== expectedLicenceId) {
    throw new PosLicenceSigningError("installation_mismatch", "Installation record is not bound to the selected POS licence.");
  }

  const installationStatus = String(documentValue(installation, "status") || "").trim().toLowerCase();
  if (!SIGNABLE_INSTALLATION_STATUSES.includes(installationStatus)) {
    throw new PosLicenceSigningError("installation_not_signable", "Installation state is not eligible for POS licence signing.");
  }

  const issuedAtIso = toIsoString(issuedAt, "issuedAt");
  const licenceExpiryIso = toIsoString(documentValue(licence, "licenceExpiry"), "licenceExpiry");
  const offlineValidUntilIso = toIsoString(offlineValidUntil, "offlineValidUntil");
  const supportExpiryIso = toIsoString(documentValue(licence, "supportExpiry"), "supportExpiry", { nullable: true });
  assertChronology(issuedAtIso, offlineValidUntilIso, licenceExpiryIso);

  throwPolicyErrors([
    ...validatePosPackagePolicy(posPackage, { requireIssuable: true }),
    ...validatePosLicencePolicy(licence, { requireIssuable: true }),
    ...validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true })
  ]);

  const payload = {
    schemaVersion: POS_LICENCE_SCHEMA_VERSION,
    clientId: assertText(idText(documentValue(licence, "clientId")), "clientId"),
    installationId: assertText(documentValue(installation, "deviceInstallationId"), "installationId").toLowerCase(),
    edition: POS_EDITION_STANDARD,
    licenceStatus: POS_STANDARD_SIGNED_LICENCE_STATUS,
    licenceExpiry: licenceExpiryIso,
    enabledModules: enabledModulesForSignedPayload(licence, posPackage),
    updateChannel: assertText(documentValue(licence, "updateChannel"), "updateChannel").toLowerCase(),
    supportExpiry: supportExpiryIso,
    issuedAt: issuedAtIso,
    offlineValidUntil: offlineValidUntilIso,
    signature: ""
  };

  const fieldErrors = validateStandardSignedResponseFieldSet(payload);
  if (fieldErrors.length) {
    throw new PosLicenceSigningError("contract_mismatch", "Signed POS licence payload does not match the POS Standard response contract.", { errors: fieldErrors });
  }

  return payload;
}

async function resolvePrivateKey(keyProvider) {
  if (!keyProvider || typeof keyProvider.getPrivateKey !== "function") {
    throw new PosLicenceSigningError("signing_key_unavailable", "POS licence signing key provider is not configured.");
  }

  const keyMaterial = await keyProvider.getPrivateKey();
  if (!keyMaterial) {
    throw new PosLicenceSigningError("signing_key_unavailable", "POS licence signing key is not available.");
  }

  let privateKey = keyMaterial;
  try {
    if (!(privateKey instanceof crypto.KeyObject)) {
      privateKey = crypto.createPrivateKey(privateKey);
    }
  } catch {
    throw new PosLicenceSigningError("signing_key_invalid", "POS licence signing key is invalid.");
  }

  if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") {
    throw new PosLicenceSigningError("signing_key_invalid", "POS licence signing key must be an Ed25519 private key.");
  }

  return privateKey;
}

async function signStandardLicencePayload(unsignedPayload, keyProvider) {
  const payload = { ...(unsignedPayload || {}), signature: "" };
  const fieldErrors = validateStandardSignedResponseFieldSet(payload);
  if (fieldErrors.length) {
    throw new PosLicenceSigningError("contract_mismatch", "Signed POS licence payload does not match the POS Standard response contract.", { errors: fieldErrors });
  }

  const privateKey = await resolvePrivateKey(keyProvider);
  const signatureData = Buffer.from(getStandardLicenceSignatureData(payload), "utf8");
  const signature = crypto.sign(null, signatureData, privateKey).toString("base64");

  return {
    ...payload,
    signature
  };
}

async function buildAndSignStandardLicencePayload(records, keyProvider) {
  return signStandardLicencePayload(buildStandardSignedLicencePayload(records), keyProvider);
}

module.exports = {
  PosLicenceSigningError,
  SIGNABLE_INSTALLATION_STATUSES,
  buildAndSignStandardLicencePayload,
  buildStandardSignedLicencePayload,
  signStandardLicencePayload
};
