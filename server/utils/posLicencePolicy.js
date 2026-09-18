const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MANDATORY_MODULE_IDS,
  POS_STANDARD_SIGNED_LICENCE_STATUS,
  POS_STANDARD_UPDATE_CHANNELS,
  getInvalidStandardModuleIds,
  isStandardEdition,
  isStandardUpdateChannel,
  normalizeStandardModuleIds
} = require("./posLicenceContract");
const {
  assertNoPosLicensingServerSecretFields
} = require("../config/posLicensingSecrets");

const POS_PACKAGE_STATES = Object.freeze(["draft", "active", "archived"]);
const POS_LICENCE_STATES = Object.freeze(["draft", "active", "suspended", "cancelled", "expired"]);
const POS_INSTALLATION_STATES = Object.freeze(["pending", "active", "disabled", "transferred", "revoked"]);
const POS_ACTIVATION_CODE_STATES = Object.freeze(["draft", "active", "redeemed", "expired", "revoked"]);
const POS_LICENCE_ISSUE_STATES = Object.freeze(["prepared", "issued", "void"]);
const POS_LICENCE_ISSUE_REASONS = Object.freeze(["activation", "renewal", "admin-reissue"]);

const RAW_CREDENTIAL_FIELDS = Object.freeze([
  "activationCode",
  "rawActivationCode",
  "code",
  "renewalSecret",
  "renewalCredential",
  "rawRenewalCredential",
  "privateKey",
  "signingKey",
  "rawRequestBody"
]);

const LICENCE_AUDIT_ALLOWED_FIELDS = Object.freeze([
  "action",
  "actorId",
  "actorEmail",
  "actorRole",
  "targetType",
  "targetId",
  "licenceId",
  "packageId",
  "installationId",
  "issueId",
  "activationCodeId",
  "outcome",
  "reason",
  "changeSummary",
  "createdAt"
]);

function cleanText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function getDocumentValue(record, field) {
  if (!record) {
    return undefined;
  }

  if (typeof record.get === "function") {
    return record.get(field);
  }

  return record[field];
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateTime(value) {
  const date = normalizeDate(value);
  return date instanceof Date ? date.getTime() : NaN;
}

function hasAllMandatoryModules(moduleIds) {
  const enabled = new Set(normalizeStandardModuleIds(moduleIds));
  return POS_STANDARD_MANDATORY_MODULE_IDS.every((moduleId) => enabled.has(moduleId));
}

function validateModuleList(moduleIds, fieldName = "moduleIds") {
  if (!Array.isArray(moduleIds)) {
    return [`${fieldName} must be an array.`];
  }

  const invalid = getInvalidStandardModuleIds(moduleIds);
  return invalid.length ? [`${fieldName} has unsupported module IDs: ${invalid.join(", ")}.`] : [];
}

function validateUpdateChannels(updateChannels) {
  if (!Array.isArray(updateChannels)) {
    return ["updateChannels must be an array."];
  }

  const invalid = updateChannels
    .map((channel) => cleanText(channel, 40).toLowerCase())
    .filter((channel) => !POS_STANDARD_UPDATE_CHANNELS.includes(channel));

  return invalid.length ? [`updateChannels has unsupported values: ${invalid.join(", ")}.`] : [];
}

function validatePosPackagePolicy(posPackage, options = {}) {
  const errors = [];
  const edition = getDocumentValue(posPackage, "edition");
  const status = getDocumentValue(posPackage, "status") || "draft";
  const moduleIds = getDocumentValue(posPackage, "moduleIds") || [];
  const updateChannels = getDocumentValue(posPackage, "updateChannels") || [];

  if (!isStandardEdition(edition)) {
    errors.push("POS package edition must be standard.");
  }

  if (!POS_PACKAGE_STATES.includes(status)) {
    errors.push("POS package status is invalid.");
  }

  errors.push(...validateModuleList(moduleIds, "moduleIds"));
  errors.push(...validateUpdateChannels(updateChannels));

  if (status === "active" || options.requireIssuable) {
    if (!moduleIds.length) {
      errors.push("Active POS packages require explicit module IDs.");
    }
    if (!hasAllMandatoryModules(moduleIds)) {
      errors.push("Active POS packages must include all mandatory Standard modules.");
    }
    if (!updateChannels.length) {
      errors.push("Active POS packages require at least one explicit update channel.");
    }
  }

  return errors;
}

function validatePosLicencePolicy(licence, options = {}) {
  const errors = [];
  const edition = getDocumentValue(licence, "edition");
  const status = getDocumentValue(licence, "status") || "draft";
  const updateChannel = getDocumentValue(licence, "updateChannel");
  const entitledModules = getDocumentValue(licence, "entitledModules") || [];
  const licenceExpiry = getDocumentValue(licence, "licenceExpiry");
  const offlineValidUntil = getDocumentValue(licence, "offlineValidUntil");
  const renewalWindowDurationMinutes = getDocumentValue(licence, "renewalWindowDurationMinutes");
  const maxInstallations = getDocumentValue(licence, "maxInstallations");
  const activationCount = Number(getDocumentValue(licence, "activationCount") || 0);

  if (!isStandardEdition(edition)) {
    errors.push("POS licence edition must be standard.");
  }

  if (!POS_LICENCE_STATES.includes(status)) {
    errors.push("POS licence status is invalid.");
  }

  if (updateChannel && !isStandardUpdateChannel(updateChannel)) {
    errors.push("POS licence update channel is invalid.");
  }

  errors.push(...validateModuleList(entitledModules, "entitledModules"));

  if (licenceExpiry && normalizeDate(licenceExpiry) === undefined) {
    errors.push("POS licence expiry must be a valid date.");
  }
  if (offlineValidUntil && normalizeDate(offlineValidUntil) === undefined) {
    errors.push("POS licence offline validity window must be a valid date.");
  }
  if (maxInstallations !== null && typeof maxInstallations !== "undefined" && (!Number.isInteger(Number(maxInstallations)) || Number(maxInstallations) < 1)) {
    errors.push("POS licence maxInstallations must be a positive integer when set.");
  }
  if (
    renewalWindowDurationMinutes !== null &&
    typeof renewalWindowDurationMinutes !== "undefined" &&
    (!Number.isInteger(Number(renewalWindowDurationMinutes)) || Number(renewalWindowDurationMinutes) < 1)
  ) {
    errors.push("POS licence renewalWindowDurationMinutes must be a positive integer when set.");
  }
  if (!Number.isInteger(activationCount) || activationCount < 0) {
    errors.push("POS licence activationCount must be zero or greater.");
  }

  if (status === "active" || options.requireIssuable) {
    if (!getDocumentValue(licence, "clientId")) {
      errors.push("Issuable POS licences require a client.");
    }
    if (!getDocumentValue(licence, "packageId")) {
      errors.push("Issuable POS licences require a package.");
    }
    if (!licenceExpiry) {
      errors.push("Issuable POS licences require an explicit licence expiry.");
    }
    if (!updateChannel) {
      errors.push("Issuable POS licences require an explicit update channel.");
    }
    if (!entitledModules.length) {
      errors.push("Issuable POS licences require explicit entitled modules.");
    }
    if (!hasAllMandatoryModules(entitledModules)) {
      errors.push("Issuable POS licences must include all mandatory Standard modules.");
    }
  }

  return errors;
}

function validateLicencePackageConsistency(licence, posPackage, options = {}) {
  const errors = [];
  const licenceModules = normalizeStandardModuleIds(getDocumentValue(licence, "entitledModules") || []);
  const packageModules = normalizeStandardModuleIds(getDocumentValue(posPackage, "moduleIds") || []);
  const packageModuleSet = new Set(packageModules);

  if (!posPackage) {
    return ["POS licence package could not be found."];
  }

  if (getDocumentValue(licence, "edition") !== getDocumentValue(posPackage, "edition")) {
    errors.push("POS licence and package editions must match.");
  }

  if ((options.requireIssuable || getDocumentValue(licence, "status") === "active") && getDocumentValue(posPackage, "status") !== "active") {
    errors.push("Issuable POS licences must reference an active package.");
  }

  licenceModules.forEach((moduleId) => {
    if (!packageModuleSet.has(moduleId)) {
      errors.push(`POS licence module is not allowed by its package: ${moduleId}.`);
    }
  });

  const packageChannels = getDocumentValue(posPackage, "updateChannels") || [];
  const licenceChannel = getDocumentValue(licence, "updateChannel");
  if (licenceChannel && !packageChannels.includes(licenceChannel)) {
    errors.push("POS licence update channel is not allowed by its package.");
  }

  return errors;
}

function validateIssueChronology(issueLike) {
  const errors = [];
  const issuedAt = normalizeDate(getDocumentValue(issueLike, "issuedAt"));
  const licenceExpiry = normalizeDate(getDocumentValue(issueLike, "licenceExpiry"));
  const offlineValidUntil = normalizeDate(getDocumentValue(issueLike, "offlineValidUntil"));

  if (!issuedAt) {
    errors.push("Licence issue requires a valid issuedAt date.");
  }
  if (!licenceExpiry) {
    errors.push("Licence issue requires a valid licenceExpiry date.");
  }
  if (!offlineValidUntil) {
    errors.push("Licence issue requires a valid offlineValidUntil date.");
  }

  if (issuedAt && licenceExpiry && dateTime(issuedAt) > dateTime(licenceExpiry)) {
    errors.push("Licence issue issuedAt must not be after licenceExpiry.");
  }
  if (issuedAt && offlineValidUntil && dateTime(issuedAt) > dateTime(offlineValidUntil)) {
    errors.push("Licence issue issuedAt must not be after offlineValidUntil.");
  }
  if (offlineValidUntil && licenceExpiry && dateTime(offlineValidUntil) > dateTime(licenceExpiry)) {
    errors.push("Licence issue offlineValidUntil must not exceed licenceExpiry.");
  }

  return errors;
}

function validateLicenceIssuePolicy(issue, licence = null) {
  const errors = validateIssueChronology(issue);
  const status = getDocumentValue(issue, "status") || "prepared";
  const issueReason = getDocumentValue(issue, "issueReason");

  if (!POS_LICENCE_ISSUE_STATES.includes(status)) {
    errors.push("POS licence issue status is invalid.");
  }

  if (!POS_LICENCE_ISSUE_REASONS.includes(issueReason)) {
    errors.push("POS licence issue reason is invalid.");
  }

  if (licence) {
    const issueExpiry = dateTime(getDocumentValue(issue, "licenceExpiry"));
    const licenceExpiry = dateTime(getDocumentValue(licence, "licenceExpiry"));
    if (Number.isFinite(issueExpiry) && Number.isFinite(licenceExpiry) && issueExpiry > licenceExpiry) {
      errors.push("Licence issue cannot extend licenceExpiry beyond the authorized licence.");
    }
  }

  return errors;
}

function validateActivationCodePolicy(record, options = {}) {
  const errors = [];
  const status = getDocumentValue(record, "status") || "draft";
  const expiresAt = getDocumentValue(record, "expiresAt");
  const maxRedemptions = getDocumentValue(record, "maxRedemptions");
  const redeemedCount = Number(getDocumentValue(record, "redeemedCount") || 0);

  if (!POS_ACTIVATION_CODE_STATES.includes(status)) {
    errors.push("POS activation code status is invalid.");
  }

  if (expiresAt && normalizeDate(expiresAt) === undefined) {
    errors.push("POS activation code expiry must be a valid date.");
  }

  if (maxRedemptions !== null && typeof maxRedemptions !== "undefined" && (!Number.isInteger(Number(maxRedemptions)) || Number(maxRedemptions) < 1)) {
    errors.push("POS activation code maxRedemptions must be a positive integer when set.");
  }

  if (!Number.isInteger(redeemedCount) || redeemedCount < 0) {
    errors.push("POS activation code redeemedCount must be zero or greater.");
  }

  if (status === "active" || options.requireIssuable) {
    if (!getDocumentValue(record, "licenceId")) {
      errors.push("Issuable activation codes require a licence.");
    }
    if (!getDocumentValue(record, "codeHash")) {
      errors.push("Issuable activation codes require a stored code hash.");
    }
    if (!expiresAt) {
      errors.push("Issuable activation codes require an explicit expiry.");
    }
    if (!maxRedemptions) {
      errors.push("Issuable activation codes require an explicit redemption limit.");
    }
  }

  return errors;
}

function assertNoRawCredentialFields(input = {}) {
  assertNoPosLicensingServerSecretFields(input);
  const keys = Object.keys(input || {});
  const found = keys.filter((key) => RAW_CREDENTIAL_FIELDS.includes(key));
  if (found.length) {
    throw new Error(`Raw POS licence credential fields are not accepted: ${found.join(", ")}.`);
  }
}

function objectIdText(value) {
  if (!value) {
    return "";
  }

  if (value._id) {
    return String(value._id);
  }

  return String(value);
}

function serializePosPackage(posPackage) {
  return {
    id: objectIdText(posPackage._id || posPackage.id),
    packageCode: posPackage.packageCode || "",
    name: posPackage.name || "",
    edition: posPackage.edition || POS_EDITION_STANDARD,
    status: posPackage.status || "draft",
    moduleIds: normalizeStandardModuleIds(posPackage.moduleIds || []),
    updateChannels: Array.isArray(posPackage.updateChannels) ? [...posPackage.updateChannels] : [],
    createdAt: posPackage.createdAt || null,
    updatedAt: posPackage.updatedAt || null
  };
}

function serializePosLicence(licence) {
  return {
    id: objectIdText(licence._id || licence.id),
    clientId: objectIdText(licence.clientId),
    projectId: objectIdText(licence.projectId),
    packageId: objectIdText(licence.packageId),
    edition: licence.edition || POS_EDITION_STANDARD,
    status: licence.status || "draft",
    signedLicenceStatus: POS_STANDARD_SIGNED_LICENCE_STATUS,
    entitledModules: normalizeStandardModuleIds(licence.entitledModules || []),
    updateChannel: licence.updateChannel || "",
    licenceExpiry: licence.licenceExpiry || null,
    supportExpiry: licence.supportExpiry || null,
    offlineValidUntil: licence.offlineValidUntil || null,
    renewalWindowDurationMinutes: licence.renewalWindowDurationMinutes || null,
    maxInstallations: licence.maxInstallations || null,
    activationCount: licence.activationCount || 0,
    createdAt: licence.createdAt || null,
    updatedAt: licence.updatedAt || null
  };
}

function serializePosInstallation(installation) {
  return {
    id: objectIdText(installation._id || installation.id),
    licenceId: objectIdText(installation.licenceId),
    deviceInstallationId: installation.deviceInstallationId || "",
    status: installation.status || "pending",
    firstActivatedAt: installation.firstActivatedAt || null,
    lastRenewedAt: installation.lastRenewedAt || null,
    renewalCredentialVersion: installation.renewalCredentialVersion || 0,
    renewalCredentialBoundAt: installation.renewalCredentialBoundAt || null,
    lastIssueId: objectIdText(installation.lastIssueId),
    createdAt: installation.createdAt || null,
    updatedAt: installation.updatedAt || null
  };
}

function serializePosActivationCode(record) {
  return {
    id: objectIdText(record._id || record.id),
    licenceId: objectIdText(record.licenceId),
    status: record.status || "draft",
    expiresAt: record.expiresAt || null,
    maxRedemptions: record.maxRedemptions || null,
    redeemedCount: record.redeemedCount || 0,
    lastRedeemedAt: record.lastRedeemedAt || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  };
}

function serializePosLicenceIssue(issue) {
  return {
    id: objectIdText(issue._id || issue.id),
    licenceId: objectIdText(issue.licenceId),
    installationId: objectIdText(issue.installationId),
    status: issue.status || "prepared",
    issueReason: issue.issueReason || "",
    keyId: issue.keyId || "",
    issuedAt: issue.issuedAt || null,
    licenceExpiry: issue.licenceExpiry || null,
    offlineValidUntil: issue.offlineValidUntil || null,
    payloadDigest: issue.payloadDigest || "",
    activationCodeId: objectIdText(issue.activationCodeId),
    createdAt: issue.createdAt || null,
    updatedAt: issue.updatedAt || null
  };
}

function sanitizeLicenceAuditMetadata(metadata = {}) {
  const sanitized = {};
  LICENCE_AUDIT_ALLOWED_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(metadata, field)) {
      sanitized[field] = cleanText(metadata[field], field === "reason" ? 500 : 240);
    }
  });
  sanitized.createdAt = sanitized.createdAt || new Date().toISOString();
  return sanitized;
}

module.exports = {
  LICENCE_AUDIT_ALLOWED_FIELDS,
  POS_ACTIVATION_CODE_STATES,
  POS_INSTALLATION_STATES,
  POS_LICENCE_ISSUE_REASONS,
  POS_LICENCE_ISSUE_STATES,
  POS_LICENCE_STATES,
  POS_PACKAGE_STATES,
  RAW_CREDENTIAL_FIELDS,
  assertNoRawCredentialFields,
  hasAllMandatoryModules,
  sanitizeLicenceAuditMetadata,
  serializePosActivationCode,
  serializePosInstallation,
  serializePosLicence,
  serializePosLicenceIssue,
  serializePosPackage,
  validateActivationCodePolicy,
  validateIssueChronology,
  validateLicenceIssuePolicy,
  validateLicencePackageConsistency,
  validateModuleList,
  validatePosLicencePolicy,
  validatePosPackagePolicy
};
