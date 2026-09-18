const crypto = require("node:crypto");
const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosActivationCode = require("../models/PosActivationCode");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const PosPackage = require("../models/PosPackage");
const {
  POS_ACTIVATION_API_SCHEMA_VERSION,
  POS_EDITION_STANDARD,
  POS_STANDARD_ACTIVATION_REQUEST_FIELDS,
  getStandardLicenceSignatureData,
  isStandardEdition
} = require("../utils/posLicenceContract");
const {
  digestActivationCode,
  isActivationCodeFormat,
  normalizeActivationCode
} = require("../utils/posActivationCodeToken");
const {
  sanitizeLicenceAuditMetadata,
  validateLicencePackageConsistency,
  validatePosLicencePolicy,
  validatePosPackagePolicy
} = require("../utils/posLicencePolicy");
const {
  PosLicenceSigningError,
  buildAndSignStandardLicencePayload
} = require("../utils/posLicenceSigning");
const { assertNoPosLicensingServerSecretFields } = require("../config/posLicensingSecrets");
const { REQUIRED_POS_TRANSACTION_OPTIONS } = require("../licensing/posLicensingTransactions");

const DEVICE_INSTALLATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVATION_CODE_RETRY_STATUSES = new Set(["active", "redeemed"]);
const ACTIVATION_REQUEST_PROTECTED_FIELDS = Object.freeze([
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
  "renewalCredentialHash",
  "privateKey",
  "signingKey",
  "signedPayload",
  "signature"
]);

class PosActivationRedemptionServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.name = "PosActivationRedemptionServiceError";
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
    throw new PosActivationRedemptionServiceError(400, "invalid_request", "POS activation request must be an object.");
  }
  if (hasOperatorKey(input)) {
    throw new PosActivationRedemptionServiceError(400, "invalid_request", "POS activation request cannot include query operators.");
  }
  try {
    assertNoPosLicensingServerSecretFields(input);
  } catch (error) {
    throw new PosActivationRedemptionServiceError(400, "protected_field", error.message);
  }
  const protectedFields = Object.keys(input).filter((field) => ACTIVATION_REQUEST_PROTECTED_FIELDS.includes(field));
  if (protectedFields.length) {
    throw new PosActivationRedemptionServiceError(400, "protected_field", `Protected POS activation fields cannot be supplied: ${protectedFields.join(", ")}.`);
  }
  const allowed = new Set(POS_STANDARD_ACTIVATION_REQUEST_FIELDS);
  const unknownFields = Object.keys(input).filter((field) => !allowed.has(field));
  if (unknownFields.length) {
    throw new PosActivationRedemptionServiceError(400, "unknown_field", `Unknown POS activation fields cannot be supplied: ${unknownFields.join(", ")}.`);
  }
}

function normalizeActivationRequest(input) {
  rejectUnsafeRequestShape(input);
  if (input.schemaVersion !== POS_ACTIVATION_API_SCHEMA_VERSION) {
    throw new PosActivationRedemptionServiceError(400, "invalid_request", "POS activation request schema is unsupported.");
  }
  if (!isStandardEdition(input.edition)) {
    throw new PosActivationRedemptionServiceError(400, "invalid_request", "POS activation request edition is invalid.");
  }
  const activationCode = normalizeActivationCode(input.activationCode);
  if (!isActivationCodeFormat(activationCode)) {
    throw new PosActivationRedemptionServiceError(400, "invalid_activation_code", "POS activation code is invalid.");
  }
  const deviceInstallationId = cleanText(input.deviceInstallationId, 160).toLowerCase();
  if (!DEVICE_INSTALLATION_ID_PATTERN.test(deviceInstallationId)) {
    throw new PosActivationRedemptionServiceError(400, "invalid_installation", "POS device installation ID is invalid.");
  }
  const setupStatus = cleanText(input.setupStatus, 40).toLowerCase();
  if (!["pending", "complete"].includes(setupStatus)) {
    throw new PosActivationRedemptionServiceError(400, "invalid_request", "POS activation setupStatus is invalid.");
  }
  const runtime = cleanText(input.runtime, 40).toLowerCase();
  if (!["browser", "tauri"].includes(runtime)) {
    throw new PosActivationRedemptionServiceError(400, "invalid_request", "POS activation runtime is invalid.");
  }
  const appVersion = cleanText(input.appVersion, 80);
  const providerConfigVersion = Number(input.providerConfigVersion);
  if (!appVersion || !Number.isInteger(providerConfigVersion) || providerConfigVersion < 1) {
    throw new PosActivationRedemptionServiceError(400, "invalid_request", "POS activation request version fields are invalid.");
  }

  return {
    schemaVersion: POS_ACTIVATION_API_SCHEMA_VERSION,
    activationCode,
    codeHash: digestActivationCode(activationCode),
    edition: POS_EDITION_STANDARD,
    appVersion,
    providerConfigVersion,
    deviceInstallationId,
    setupStatus,
    runtime
  };
}

async function readById(repository, id, options = {}) {
  const query = repository.findById(id);
  if (query && typeof query.session === "function" && options.session) {
    return query.session(options.session);
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

function assertActivationCodeUsable(activationCodeRecord, now, { allowRedeemedRetry = false } = {}) {
  if (!activationCodeRecord) {
    throw new PosActivationRedemptionServiceError(404, "activation_code_not_found", "POS activation code was not accepted.");
  }
  if (activationCodeRecord.status === "revoked") {
    throw new PosActivationRedemptionServiceError(409, "activation_code_revoked", "POS activation code has been revoked.");
  }
  if (activationCodeRecord.status === "expired") {
    throw new PosActivationRedemptionServiceError(409, "activation_code_expired", "POS activation code has expired.");
  }
  if (!ACTIVATION_CODE_RETRY_STATUSES.has(activationCodeRecord.status)) {
    throw new PosActivationRedemptionServiceError(409, "activation_code_not_usable", "POS activation code is not usable.");
  }
  if (activationCodeRecord.status === "redeemed" && !allowRedeemedRetry) {
    throw new PosActivationRedemptionServiceError(409, "activation_code_exhausted", "POS activation code has no remaining redemptions.");
  }
  const expiresAt = dateValue(activationCodeRecord.expiresAt);
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    throw new PosActivationRedemptionServiceError(409, "activation_code_expired", "POS activation code has expired.");
  }
  const maxRedemptions = Number(activationCodeRecord.maxRedemptions);
  const redeemedCount = Number(activationCodeRecord.redeemedCount || 0);
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) {
    throw new PosActivationRedemptionServiceError(409, "activation_code_not_usable", "POS activation code redemption policy is missing.");
  }
  if (!allowRedeemedRetry && redeemedCount >= maxRedemptions) {
    throw new PosActivationRedemptionServiceError(409, "activation_code_exhausted", "POS activation code has no remaining redemptions.");
  }
}

function throwPolicyErrors(errors) {
  const filtered = errors.filter(Boolean);
  if (filtered.length) {
    throw new PosActivationRedemptionServiceError(400, "validation_failed", "POS activation redemption validation failed.", { errors: filtered });
  }
}

function assertLicenceAndPackageEligible(licence, posPackage, now) {
  if (!licence) {
    throw new PosActivationRedemptionServiceError(404, "licence_not_found", "POS licence could not be found.");
  }
  if (licence.status !== "active") {
    throw new PosActivationRedemptionServiceError(409, "licence_not_eligible", "POS licence is not approved for activation.");
  }
  if (!posPackage || posPackage.status !== "active") {
    throw new PosActivationRedemptionServiceError(409, "package_not_published", "POS licence package is not published.");
  }
  const licenceExpiry = dateValue(licence.licenceExpiry);
  if (!licenceExpiry || licenceExpiry.getTime() <= now.getTime()) {
    throw new PosActivationRedemptionServiceError(409, "licence_expired", "POS licence has expired.");
  }
  const offlineValidUntil = dateValue(licence.offlineValidUntil);
  if (!offlineValidUntil) {
    throw new PosActivationRedemptionServiceError(409, "missing_offline_policy", "POS licence offline validity policy is missing.");
  }
  if (offlineValidUntil.getTime() <= now.getTime()) {
    throw new PosActivationRedemptionServiceError(409, "offline_window_expired", "POS licence offline validity window has expired.");
  }
  if (offlineValidUntil.getTime() > licenceExpiry.getTime()) {
    throw new PosActivationRedemptionServiceError(409, "invalid_offline_policy", "POS licence offline validity window exceeds licence expiry.");
  }
  const maxInstallations = Number(licence.maxInstallations);
  if (!Number.isInteger(maxInstallations) || maxInstallations < 1) {
    throw new PosActivationRedemptionServiceError(409, "missing_installation_policy", "POS licence maximum installation policy is missing.");
  }
  throwPolicyErrors([
    ...validatePosLicencePolicy(licence, { requireIssuable: true }),
    ...validatePosPackagePolicy(posPackage, { requireIssuable: true }),
    ...validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true })
  ]);
}

function assertStoredPayloadStillValid(signedPayload, now) {
  if (!signedPayload || typeof signedPayload !== "object" || Array.isArray(signedPayload)) {
    throw new PosActivationRedemptionServiceError(409, "stored_response_unavailable", "Prior POS activation response cannot be replayed.");
  }
  const licenceExpiry = dateValue(signedPayload.licenceExpiry);
  const offlineValidUntil = dateValue(signedPayload.offlineValidUntil);
  if (!licenceExpiry || !offlineValidUntil || licenceExpiry.getTime() < now.getTime() || offlineValidUntil.getTime() < now.getTime()) {
    throw new PosActivationRedemptionServiceError(409, "stored_response_expired", "Prior POS activation response has expired and cannot be renewed by retry.");
  }
}

function payloadDigest(signedPayload) {
  return crypto
    .createHash("sha256")
    .update(`${getStandardLicenceSignatureData(signedPayload)}:${signedPayload.signature}`, "utf8")
    .digest("hex");
}

async function writeRedemptionAudit(auditLogger, activationCodeRecord, licence, installation, issue, request, options = {}) {
  const metadata = sanitizeLicenceAuditMetadata({
    action: "licences.activation-code.redeem",
    actorId: "",
    actorEmail: "",
    actorRole: "pos-machine",
    targetType: "PosLicenceIssue",
    targetId: idText(issue._id || issue.id),
    licenceId: idText(licence._id || licence.id),
    packageId: idText(licence.packageId),
    installationId: idText(installation._id || installation.id),
    issueId: idText(issue._id || issue.id),
    activationCodeId: idText(activationCodeRecord._id || activationCodeRecord.id),
    outcome: "success",
    changeSummary: `runtime:${request.runtime}, setupStatus:${request.setupStatus}`,
    createdAt: new Date().toISOString()
  });

  await auditLogger.create({
    actorId: null,
    actorName: "POS activation",
    actorEmail: "",
    actorRole: "pos-machine",
    action: "licences.activation-code.redeem",
    module: "Licences",
    targetType: "PosLicenceIssue",
    targetId: idText(issue._id || issue.id),
    targetLabel: "",
    oldValue: null,
    newValue: metadata,
    severity: "Medium"
  }, options);
}

function createDefaultTransactionRunner() {
  return async function runInTransaction(callback) {
    if (!mongoose.connection || typeof mongoose.connection.startSession !== "function") {
      throw new PosActivationRedemptionServiceError(503, "transaction_unavailable", "MongoDB transactions are required for POS activation redemption.");
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
          error instanceof PosActivationRedemptionServiceError ||
          error instanceof PosLicenceSigningError ||
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

    throw new PosActivationRedemptionServiceError(503, "transaction_failed", "POS activation redemption transaction failed.");
  };
}

function createPosActivationRedemptionService(options = {}) {
  const repositories = options.repositories || createDefaultRepositories();
  const auditLogger = options.auditLogger || createDefaultAuditLogger();
  const keyProvider = options.keyProvider || null;
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner();
  const clock = options.clock || (() => new Date());

  return {
    async redeemActivation(requestPayload) {
      const request = normalizeActivationRequest(requestPayload);
      const now = clock();
      let responsePayload = null;
      let retry = false;

      await runInTransaction(async (session) => {
        const activationCodeRecord = await readOne(repositories.posActivationCodes, { codeHash: request.codeHash }, { session });
        const codeId = idText(activationCodeRecord && (activationCodeRecord._id || activationCodeRecord.id));

        const licence = activationCodeRecord ? await readById(repositories.posLicences, activationCodeRecord.licenceId, { session }) : null;
        const posPackage = licence ? await readById(repositories.posPackages, licence.packageId, { session }) : null;
        if (activationCodeRecord) {
          assertLicenceAndPackageEligible(licence, posPackage, now);
        }

        const existingInstallation = licence ? await readOne(repositories.posInstallations, {
          licenceId: idText(licence._id || licence.id),
          deviceInstallationId: request.deviceInstallationId
        }, { session }) : null;
        const existingIssue = existingInstallation && codeId
          ? await readOne(
            repositories.posLicenceIssues,
            {
              activationCodeId: codeId,
              installationId: idText(existingInstallation._id || existingInstallation.id),
              issueReason: "activation",
              status: "issued"
            },
            { session, select: "+signedPayload" }
          )
          : null;

        assertActivationCodeUsable(activationCodeRecord, now, { allowRedeemedRetry: Boolean(existingIssue) });

        if (existingIssue) {
          assertStoredPayloadStillValid(existingIssue.signedPayload, now);
          responsePayload = { ...existingIssue.signedPayload };
          retry = true;
          return;
        }

        if (existingInstallation) {
          throw new PosActivationRedemptionServiceError(409, "installation_already_bound", "This POS installation is already bound and cannot redeem a new activation code.");
        }

        const activationCount = Number(licence.activationCount || 0);
        const maxInstallations = Number(licence.maxInstallations);
        if (activationCount >= maxInstallations) {
          throw new PosActivationRedemptionServiceError(409, "installation_limit_reached", "POS licence installation limit has been reached.");
        }

        const reservedLicence = await repositories.posLicences.findOneAndUpdate(
          {
            _id: idText(licence._id || licence.id),
            status: "active",
            __v: versionOf(licence),
            activationCount,
            maxInstallations,
            licenceExpiry: licence.licenceExpiry,
            offlineValidUntil: licence.offlineValidUntil
          },
          { $inc: { activationCount: 1, __v: 1 } },
          { new: true, runValidators: true, session }
        );
        if (!reservedLicence) {
          throw new PosActivationRedemptionServiceError(409, "installation_limit_conflict", "POS licence installation limit changed during activation.");
        }

        const redeemedCount = Number(activationCodeRecord.redeemedCount || 0);
        const maxRedemptions = Number(activationCodeRecord.maxRedemptions);
        const consumed = await repositories.posActivationCodes.findOneAndUpdate(
          {
            _id: codeId,
            status: "active",
            redeemedCount,
            maxRedemptions
          },
          {
            $set: {
              status: redeemedCount + 1 >= maxRedemptions ? "redeemed" : "active",
              lastRedeemedAt: now,
              updatedBy: null
            },
            $inc: { redeemedCount: 1, __v: 1 }
          },
          { new: true, runValidators: true, session }
        );
        if (!consumed) {
          throw new PosActivationRedemptionServiceError(409, "activation_code_conflict", "POS activation code changed during activation.");
        }

        const installations = await repositories.posInstallations.create([{
          licenceId: idText(reservedLicence._id || reservedLicence.id),
          deviceInstallationId: request.deviceInstallationId,
          status: "active",
          firstActivatedAt: now,
          lastRenewedAt: now,
          createdBy: null,
          updatedBy: null
        }], { session });
        const installation = installations[0];

        const signedPayload = await buildAndSignStandardLicencePayload({
          licence: reservedLicence,
          posPackage,
          installation,
          issuedAt: now,
          offlineValidUntil: reservedLicence.offlineValidUntil
        }, keyProvider);
        const digest = `sha256:${payloadDigest(signedPayload)}`;
        const issues = await repositories.posLicenceIssues.create([{
          licenceId: idText(reservedLicence._id || reservedLicence.id),
          installationId: idText(installation._id || installation.id),
          activationCodeId: codeId,
          status: "issued",
          issueReason: "activation",
          keyId: keyProvider && keyProvider.keyId ? keyProvider.keyId : "",
          issuedAt: now,
          licenceExpiry: reservedLicence.licenceExpiry,
          offlineValidUntil: reservedLicence.offlineValidUntil,
          payloadDigest: digest,
          signedPayload,
          createdBy: null
        }], { session });
        const issue = issues[0];

        await repositories.posInstallations.updateOne(
          { _id: idText(installation._id || installation.id), lastIssueId: null },
          { $set: { lastIssueId: issue._id, lastRenewedAt: now } },
          { session }
        );

        await writeRedemptionAudit(auditLogger, consumed, reservedLicence, installation, issue, request, { session });
        responsePayload = signedPayload;
      });

      return {
        signedLicence: responsePayload,
        retry
      };
    }
  };
}

module.exports = {
  PosActivationRedemptionServiceError,
  createDefaultRepositories,
  createPosActivationRedemptionService,
  normalizeActivationRequest
};
