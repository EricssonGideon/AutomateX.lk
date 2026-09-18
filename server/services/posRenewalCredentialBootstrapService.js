const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosActivationCode = require("../models/PosActivationCode");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const PosPackage = require("../models/PosPackage");
const {
  POS_EDITION_STANDARD,
  isStandardEdition
} = require("../utils/posLicenceContract");
const {
  digestActivationCode,
  isActivationCodeFormat,
  normalizeActivationCode
} = require("../utils/posActivationCodeToken");
const {
  isRenewalCredentialDigestFormat,
  normalizeRenewalCredentialDigest
} = require("../utils/posRenewalCredentialToken");
const {
  sanitizeLicenceAuditMetadata,
  serializePosInstallation,
  validateLicencePackageConsistency,
  validatePosLicencePolicy,
  validatePosPackagePolicy
} = require("../utils/posLicencePolicy");
const { assertNoPosLicensingServerSecretFields } = require("../config/posLicensingSecrets");
const { REQUIRED_POS_TRANSACTION_OPTIONS } = require("../licensing/posLicensingTransactions");

const BOOTSTRAP_SCHEMA_VERSION = 1;
const DEVICE_INSTALLATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const BOOTSTRAP_REQUEST_FIELDS = Object.freeze([
  "schemaVersion",
  "edition",
  "activationCode",
  "deviceInstallationId",
  "signedLicenceSignature",
  "renewalCredentialDigest"
]);
const BOOTSTRAP_PROTECTED_FIELDS = Object.freeze([
  "_id",
  "id",
  "__v",
  "actor",
  "actorId",
  "actorRole",
  "permissions",
  "licenceId",
  "packageId",
  "clientId",
  "installationId",
  "codeHash",
  "digest",
  "renewalCredential",
  "rawRenewalCredential",
  "renewalSecret",
  "renewalCredentialHash",
  "privateKey",
  "signingKey",
  "signedPayload",
  "signature"
]);

class PosRenewalCredentialBootstrapServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.name = "PosRenewalCredentialBootstrapServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function createDefaultRepositories() {
  return {
    auditLogs: AuditLog,
    posActivationCodes: PosActivationCode,
    posInstallations: PosInstallation,
    posLicences: PosLicence,
    posLicenceIssues: PosLicenceIssue,
    posPackages: PosPackage
  };
}

function createDefaultAuditLogger() {
  return {
    async create(entry, options = {}) {
      const records = await AuditLog.create([entry], options);
      return records[0];
    }
  };
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

function versionOf(record) {
  return Number.isInteger(record && record.__v) ? record.__v : 0;
}

function dateValue(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanText(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function hasOperatorKey(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.keys(value).some((key) => key.startsWith("$") || key.includes(".") || hasOperatorKey(value[key]));
}

function rejectUnsafeRequestShape(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "invalid_request", "POS renewal bootstrap request must be an object.");
  }
  if (hasOperatorKey(input)) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "invalid_request", "POS renewal bootstrap request cannot include query operators.");
  }
  try {
    assertNoPosLicensingServerSecretFields(input);
  } catch (error) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "protected_field", error.message);
  }
  const protectedFields = Object.keys(input).filter((field) => BOOTSTRAP_PROTECTED_FIELDS.includes(field));
  if (protectedFields.length) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "protected_field", `Protected POS renewal bootstrap fields cannot be supplied: ${protectedFields.join(", ")}.`);
  }
  const allowed = new Set(BOOTSTRAP_REQUEST_FIELDS);
  const unknownFields = Object.keys(input).filter((field) => !allowed.has(field));
  if (unknownFields.length) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "unknown_field", `Unknown POS renewal bootstrap fields cannot be supplied: ${unknownFields.join(", ")}.`);
  }
}

function normalizeBootstrapRequest(input) {
  rejectUnsafeRequestShape(input);
  if (input.schemaVersion !== BOOTSTRAP_SCHEMA_VERSION) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "invalid_request", "POS renewal bootstrap schema is unsupported.");
  }
  if (!isStandardEdition(input.edition)) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "invalid_request", "POS renewal bootstrap edition is invalid.");
  }

  const activationCode = normalizeActivationCode(input.activationCode);
  if (!isActivationCodeFormat(activationCode)) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "invalid_activation_code", "POS activation code is invalid.");
  }

  const deviceInstallationId = cleanText(input.deviceInstallationId, 160).toLowerCase();
  if (!DEVICE_INSTALLATION_ID_PATTERN.test(deviceInstallationId)) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "invalid_installation", "POS device installation ID is invalid.");
  }

  const signedLicenceSignature = cleanText(input.signedLicenceSignature, 2048);
  if (!signedLicenceSignature || signedLicenceSignature.length > 2048 || !SIGNATURE_PATTERN.test(signedLicenceSignature)) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "invalid_signature", "POS signed licence signature is invalid.");
  }

  const renewalCredentialDigest = normalizeRenewalCredentialDigest(input.renewalCredentialDigest);
  if (!isRenewalCredentialDigestFormat(renewalCredentialDigest)) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "invalid_credential_digest", "POS renewal credential digest is invalid.");
  }

  return {
    schemaVersion: BOOTSTRAP_SCHEMA_VERSION,
    edition: POS_EDITION_STANDARD,
    activationCode,
    codeHash: digestActivationCode(activationCode),
    deviceInstallationId,
    signedLicenceSignature,
    renewalCredentialDigest
  };
}

async function readById(repository, id, options = {}) {
  let query = repository.findById(id);
  if (query && typeof query.select === "function" && options.select) {
    query = query.select(options.select);
  }
  if (query && typeof query.session === "function" && options.session) {
    query = query.session(options.session);
  }
  return query;
}

async function readOne(repository, query, options = {}) {
  let result = repository.findOne(query);
  if (result && typeof result.select === "function" && options.select) {
    result = result.select(options.select);
  }
  if (result && typeof result.session === "function" && options.session) {
    result = result.session(options.session);
  }
  return result;
}

function assertActivationCodeForBootstrap(activationCodeRecord, now) {
  if (!activationCodeRecord) {
    throw new PosRenewalCredentialBootstrapServiceError(404, "activation_code_not_found", "POS renewal bootstrap was not accepted.");
  }
  if (activationCodeRecord.status === "revoked") {
    throw new PosRenewalCredentialBootstrapServiceError(409, "activation_code_revoked", "POS activation code has been revoked.");
  }
  if (activationCodeRecord.status === "expired") {
    throw new PosRenewalCredentialBootstrapServiceError(409, "activation_code_expired", "POS activation code has expired.");
  }
  if (!["active", "redeemed"].includes(activationCodeRecord.status)) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "activation_code_not_usable", "POS activation code is not usable for renewal bootstrap.");
  }
  const expiresAt = dateValue(activationCodeRecord.expiresAt);
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "activation_code_expired", "POS activation code has expired.");
  }
}

function assertLicenceAndPackageEligible(licence, posPackage, now) {
  if (!licence) {
    throw new PosRenewalCredentialBootstrapServiceError(404, "licence_not_found", "POS licence could not be found.");
  }
  if (licence.status !== "active") {
    throw new PosRenewalCredentialBootstrapServiceError(409, "licence_not_eligible", "POS licence is not approved.");
  }
  if (!posPackage || posPackage.status !== "active") {
    throw new PosRenewalCredentialBootstrapServiceError(409, "package_not_published", "POS licence package is not published.");
  }
  const licenceExpiry = dateValue(licence.licenceExpiry);
  const offlineValidUntil = dateValue(licence.offlineValidUntil);
  if (!licenceExpiry || licenceExpiry.getTime() <= now.getTime()) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "licence_expired", "POS licence has expired.");
  }
  if (!offlineValidUntil || offlineValidUntil.getTime() <= now.getTime()) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "offline_window_expired", "POS offline validity window has expired.");
  }
  if (offlineValidUntil.getTime() > licenceExpiry.getTime()) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "invalid_offline_policy", "POS offline validity window exceeds licence expiry.");
  }
  const maxInstallations = Number(licence.maxInstallations);
  if (!Number.isInteger(maxInstallations) || maxInstallations < 1) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "missing_installation_policy", "POS licence maximum installation policy is missing.");
  }
  const errors = [
    ...validatePosLicencePolicy(licence, { requireIssuable: true }),
    ...validatePosPackagePolicy(posPackage, { requireIssuable: true }),
    ...validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true })
  ].filter(Boolean);
  if (errors.length) {
    throw new PosRenewalCredentialBootstrapServiceError(400, "validation_failed", "POS renewal bootstrap validation failed.", { errors });
  }
}

function assertIssueMatchesRequest(issue, installation, request, now) {
  if (!issue || issue.status !== "issued" || issue.issueReason !== "activation") {
    throw new PosRenewalCredentialBootstrapServiceError(409, "activation_issue_not_found", "Committed POS activation issue was not found.");
  }
  if (!issue.signedPayload || typeof issue.signedPayload !== "object" || Array.isArray(issue.signedPayload)) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "activation_issue_invalid", "Committed POS activation issue is not replayable.");
  }
  if (issue.signedPayload.installationId !== request.deviceInstallationId) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "installation_mismatch", "POS activation issue does not match this installation.");
  }
  if (issue.signedPayload.signature !== request.signedLicenceSignature) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "signature_mismatch", "POS activation issue signature does not match.");
  }
  if (idText(issue.installationId) !== idText(installation._id || installation.id)) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "installation_mismatch", "POS activation issue is not linked to this installation.");
  }
  const licenceExpiry = dateValue(issue.licenceExpiry);
  const offlineValidUntil = dateValue(issue.offlineValidUntil);
  if (!licenceExpiry || !offlineValidUntil || licenceExpiry.getTime() <= now.getTime() || offlineValidUntil.getTime() <= now.getTime()) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "activation_issue_expired", "Committed POS activation issue is no longer valid.");
  }
}

function acknowledgement(installation) {
  return {
    schemaVersion: BOOTSTRAP_SCHEMA_VERSION,
    status: "bound",
    installationId: installation.deviceInstallationId,
    credentialVersion: Number(installation.renewalCredentialVersion || 1)
  };
}

async function writeBootstrapAudit(auditLogger, activationCodeRecord, licence, installation, issue, options = {}) {
  const metadata = sanitizeLicenceAuditMetadata({
    action: "licences.renewal-credential.bootstrap",
    actorId: "",
    actorEmail: "",
    actorRole: "pos-machine",
    targetType: "PosInstallation",
    targetId: idText(installation._id || installation.id),
    licenceId: idText(licence._id || licence.id),
    packageId: idText(licence.packageId),
    installationId: idText(installation._id || installation.id),
    issueId: idText(issue._id || issue.id),
    activationCodeId: idText(activationCodeRecord._id || activationCodeRecord.id),
    outcome: "success",
    changeSummary: `credentialVersion:${Number(installation.renewalCredentialVersion || 1)}`,
    createdAt: new Date().toISOString()
  });

  await auditLogger.create({
    actorId: null,
    actorName: "POS renewal bootstrap",
    actorEmail: "",
    actorRole: "pos-machine",
    action: "licences.renewal-credential.bootstrap",
    module: "Licences",
    targetType: "PosInstallation",
    targetId: idText(installation._id || installation.id),
    targetLabel: "",
    oldValue: null,
    newValue: metadata,
    severity: "Medium"
  }, options);
}

function createDefaultTransactionRunner() {
  return async function runInTransaction(callback) {
    if (!mongoose.connection || typeof mongoose.connection.startSession !== "function") {
      throw new PosRenewalCredentialBootstrapServiceError(503, "transaction_unavailable", "MongoDB transactions are required for POS renewal credential bootstrap.");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const session = await mongoose.connection.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await callback(session);
        }, REQUIRED_POS_TRANSACTION_OPTIONS);
        return result;
      } catch (error) {
        if (
          error instanceof PosRenewalCredentialBootstrapServiceError ||
          !error ||
          typeof error.hasErrorLabel !== "function" ||
          !error.hasErrorLabel("TransientTransactionError")
        ) {
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }

    throw new PosRenewalCredentialBootstrapServiceError(503, "transaction_failed", "POS renewal credential bootstrap transaction failed.");
  };
}

async function lockActivationCode(repository, activationCodeRecord, now, session) {
  const locked = await repository.findOneAndUpdate(
    {
      _id: idText(activationCodeRecord._id || activationCodeRecord.id),
      status: { $in: ["active", "redeemed"] },
      expiresAt: { $gt: now }
    },
    { $inc: { __v: 1 } },
    { new: true, runValidators: true, session }
  );
  if (!locked) {
    throw new PosRenewalCredentialBootstrapServiceError(409, "activation_code_conflict", "POS activation code changed during renewal bootstrap.");
  }
  return locked;
}

function createPosRenewalCredentialBootstrapService(options = {}) {
  const repositories = options.repositories || createDefaultRepositories();
  const auditLogger = options.auditLogger || createDefaultAuditLogger();
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner();
  const clock = options.clock || (() => new Date());

  return {
    async bootstrapRenewalCredential(requestPayload) {
      const request = normalizeBootstrapRequest(requestPayload);
      const now = clock();
      let result = null;
      let resultInstallation = null;

      await runInTransaction(async (session) => {
        const activationCodeRecord = await readOne(repositories.posActivationCodes, { codeHash: request.codeHash }, { session });
        assertActivationCodeForBootstrap(activationCodeRecord, now);

        const licence = await readById(repositories.posLicences, activationCodeRecord.licenceId, { session });
        const posPackage = licence ? await readById(repositories.posPackages, licence.packageId, { session }) : null;
        assertLicenceAndPackageEligible(licence, posPackage, now);

        const installation = await readOne(
          repositories.posInstallations,
          {
            licenceId: idText(licence._id || licence.id),
            deviceInstallationId: request.deviceInstallationId,
            status: "active"
          },
          { session, select: "+renewalCredentialHash" }
        );
        if (!installation) {
          throw new PosRenewalCredentialBootstrapServiceError(409, "installation_not_found", "POS installation is not activated.");
        }

        const issue = await readOne(
          repositories.posLicenceIssues,
          {
            activationCodeId: idText(activationCodeRecord._id || activationCodeRecord.id),
            installationId: idText(installation._id || installation.id),
            issueReason: "activation",
            status: "issued"
          },
          { session, select: "+signedPayload" }
        );
        assertIssueMatchesRequest(issue, installation, request, now);

        await lockActivationCode(repositories.posActivationCodes, activationCodeRecord, now, session);

        if (installation.renewalCredentialHash) {
          if (installation.renewalCredentialHash !== request.renewalCredentialDigest) {
            throw new PosRenewalCredentialBootstrapServiceError(409, "credential_already_bound", "POS renewal credential is already bound.");
          }
          result = acknowledgement(installation);
          resultInstallation = installation;
          return;
        }

        const updatedInstallation = await repositories.posInstallations.findOneAndUpdate(
          {
            _id: idText(installation._id || installation.id),
            __v: versionOf(installation),
            status: "active",
            renewalCredentialHash: { $in: ["", null] }
          },
          {
            $set: {
              renewalCredentialHash: request.renewalCredentialDigest,
              renewalCredentialVersion: 1,
              renewalCredentialBoundAt: now,
              updatedBy: null
            },
            $inc: { __v: 1 }
          },
          { new: true, runValidators: true, session }
        );
        if (!updatedInstallation) {
          const current = await readById(repositories.posInstallations, installation._id, { session, select: "+renewalCredentialHash" });
          if (current && current.renewalCredentialHash === request.renewalCredentialDigest) {
            result = acknowledgement(current);
            resultInstallation = current;
            return;
          }
          throw new PosRenewalCredentialBootstrapServiceError(409, "credential_bind_conflict", "POS renewal credential changed during bootstrap.");
        }

        await writeBootstrapAudit(auditLogger, activationCodeRecord, licence, updatedInstallation, issue, { session });
        result = acknowledgement(updatedInstallation);
        resultInstallation = updatedInstallation;
      });

      return {
        bootstrap: result,
        installation: resultInstallation ? serializePosInstallation(resultInstallation) : null
      };
    }
  };
}

module.exports = {
  BOOTSTRAP_REQUEST_FIELDS,
  BOOTSTRAP_SCHEMA_VERSION,
  PosRenewalCredentialBootstrapServiceError,
  createDefaultRepositories,
  createPosRenewalCredentialBootstrapService,
  normalizeBootstrapRequest
};
