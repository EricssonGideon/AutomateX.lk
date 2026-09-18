const crypto = require("node:crypto");
const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const PosPackage = require("../models/PosPackage");
const {
  POS_EDITION_STANDARD,
  getStandardLicenceSignatureData,
  isStandardEdition
} = require("../utils/posLicenceContract");
const {
  digestRenewalCredential,
  isRenewalCredentialFormat,
  normalizeRenewalCredential
} = require("../utils/posRenewalCredentialToken");
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

const RENEWAL_SCHEMA_VERSION = 1;
const DEVICE_INSTALLATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const RENEWAL_REQUEST_FIELDS = Object.freeze([
  "schemaVersion",
  "edition",
  "deviceInstallationId",
  "renewalCredential",
  "lastSignature"
]);
const RENEWAL_PROTECTED_FIELDS = Object.freeze([
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
  "activationCode",
  "codeHash",
  "digest",
  "renewalCredentialDigest",
  "renewalCredentialHash",
  "privateKey",
  "signingKey",
  "signedPayload",
  "signature"
]);
const RENEWAL_PREDECESSOR_SIGNATURE_PURPOSE = "automatex-pos-renewal-predecessor-signature:v1:";

class PosLicenceRenewalServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.name = "PosLicenceRenewalServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function createDefaultRepositories() {
  return {
    auditLogs: AuditLog,
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

function hashPredecessorSignature(signature) {
  const normalized = cleanText(signature, 2048);
  return `sha256:v1:${crypto
    .createHash("sha256")
    .update(`${RENEWAL_PREDECESSOR_SIGNATURE_PURPOSE}${normalized}`, "utf8")
    .digest("hex")}`;
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function rejectUnsafeRequestShape(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PosLicenceRenewalServiceError(400, "invalid_request", "POS renewal request must be an object.");
  }
  if (hasOperatorKey(input)) {
    throw new PosLicenceRenewalServiceError(400, "invalid_request", "POS renewal request cannot include query operators.");
  }
  try {
    assertNoPosLicensingServerSecretFields(input);
  } catch (error) {
    throw new PosLicenceRenewalServiceError(400, "protected_field", error.message);
  }
  const protectedFields = Object.keys(input).filter((field) => RENEWAL_PROTECTED_FIELDS.includes(field));
  if (protectedFields.length) {
    throw new PosLicenceRenewalServiceError(400, "protected_field", `Protected POS renewal fields cannot be supplied: ${protectedFields.join(", ")}.`);
  }
  const allowed = new Set(RENEWAL_REQUEST_FIELDS);
  const unknownFields = Object.keys(input).filter((field) => !allowed.has(field));
  if (unknownFields.length) {
    throw new PosLicenceRenewalServiceError(400, "unknown_field", `Unknown POS renewal fields cannot be supplied: ${unknownFields.join(", ")}.`);
  }
}

function normalizeRenewalRequest(input) {
  rejectUnsafeRequestShape(input);
  if (input.schemaVersion !== RENEWAL_SCHEMA_VERSION) {
    throw new PosLicenceRenewalServiceError(400, "invalid_request", "POS renewal schema is unsupported.");
  }
  if (!isStandardEdition(input.edition)) {
    throw new PosLicenceRenewalServiceError(400, "invalid_request", "POS renewal edition is invalid.");
  }

  const deviceInstallationId = cleanText(input.deviceInstallationId, 160).toLowerCase();
  if (!DEVICE_INSTALLATION_ID_PATTERN.test(deviceInstallationId)) {
    throw new PosLicenceRenewalServiceError(400, "invalid_installation", "POS device installation ID is invalid.");
  }

  const renewalCredential = normalizeRenewalCredential(input.renewalCredential);
  if (!isRenewalCredentialFormat(renewalCredential)) {
    throw new PosLicenceRenewalServiceError(400, "invalid_renewal_credential", "POS renewal credential is invalid.");
  }

  const lastSignature = cleanText(input.lastSignature, 2048);
  if (!lastSignature || lastSignature.length > 2048 || !SIGNATURE_PATTERN.test(lastSignature)) {
    throw new PosLicenceRenewalServiceError(400, "invalid_signature", "POS renewal lastSignature is invalid.");
  }

  return {
    schemaVersion: RENEWAL_SCHEMA_VERSION,
    edition: POS_EDITION_STANDARD,
    deviceInstallationId,
    renewalCredentialDigest: digestRenewalCredential(renewalCredential),
    lastSignature,
    predecessorSignatureHash: hashPredecessorSignature(lastSignature)
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

function assertInstallationCredential(installation, request) {
  if (!installation || installation.status !== "active") {
    throw new PosLicenceRenewalServiceError(401, "renewal_denied", "POS renewal credentials were not accepted.");
  }
  const credentialVersion = Number(installation.renewalCredentialVersion || 0);
  if (!Number.isInteger(credentialVersion) || credentialVersion < 1 || !installation.renewalCredentialHash) {
    throw new PosLicenceRenewalServiceError(401, "renewal_denied", "POS renewal credentials were not accepted.");
  }
  if (!timingSafeEqualText(installation.renewalCredentialHash, request.renewalCredentialDigest)) {
    throw new PosLicenceRenewalServiceError(401, "renewal_denied", "POS renewal credentials were not accepted.");
  }
}

function throwPolicyErrors(errors) {
  const filtered = errors.filter(Boolean);
  if (filtered.length) {
    throw new PosLicenceRenewalServiceError(400, "validation_failed", "POS renewal validation failed.", { errors: filtered });
  }
}

function assertLicenceAndPackageEligible(licence, posPackage, now) {
  if (!licence) {
    throw new PosLicenceRenewalServiceError(404, "licence_not_found", "POS licence could not be found.");
  }
  if (licence.status !== "active") {
    throw new PosLicenceRenewalServiceError(409, "licence_not_eligible", "POS licence is not approved.");
  }
  if (!posPackage || posPackage.status !== "active") {
    throw new PosLicenceRenewalServiceError(409, "package_not_published", "POS licence package is not published.");
  }

  const licenceExpiry = dateValue(licence.licenceExpiry);
  if (!licenceExpiry || licenceExpiry.getTime() <= now.getTime()) {
    throw new PosLicenceRenewalServiceError(409, "licence_expired", "POS licence has expired.");
  }

  const renewalWindowDurationMinutes = Number(licence.renewalWindowDurationMinutes);
  if (!Number.isInteger(renewalWindowDurationMinutes) || renewalWindowDurationMinutes < 1) {
    throw new PosLicenceRenewalServiceError(500, "renewal_policy_missing", "POS renewal window duration policy is not configured.");
  }

  throwPolicyErrors([
    ...validatePosLicencePolicy(licence, { requireIssuable: true }),
    ...validatePosPackagePolicy(posPackage, { requireIssuable: true }),
    ...validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true })
  ]);

  return {
    licenceExpiry,
    renewalWindowDurationMinutes
  };
}

function calculateRenewalOfflineValidUntil(now, licenceExpiry, renewalWindowDurationMinutes) {
  const candidate = new Date(now.getTime() + renewalWindowDurationMinutes * 60 * 1000);
  const capped = candidate.getTime() < licenceExpiry.getTime() ? candidate : licenceExpiry;
  if (capped.getTime() <= now.getTime()) {
    throw new PosLicenceRenewalServiceError(409, "renewal_window_unusable", "POS renewal window is not usable.");
  }
  return capped;
}

function assertIssueHasReplayablePayload(issue, now, { allowExpiredOffline = false } = {}) {
  if (!issue || issue.status !== "issued" || !issue.signedPayload || typeof issue.signedPayload !== "object" || Array.isArray(issue.signedPayload)) {
    throw new PosLicenceRenewalServiceError(409, "issue_not_replayable", "POS renewal issue is not replayable.");
  }
  const licenceExpiry = dateValue(issue.licenceExpiry);
  const offlineValidUntil = dateValue(issue.offlineValidUntil);
  if (!licenceExpiry || licenceExpiry.getTime() <= now.getTime()) {
    throw new PosLicenceRenewalServiceError(409, "stored_response_expired", "POS renewal response has expired.");
  }
  if (!allowExpiredOffline && (!offlineValidUntil || offlineValidUntil.getTime() <= now.getTime())) {
    throw new PosLicenceRenewalServiceError(409, "stored_response_expired", "POS renewal response has expired.");
  }
}

function assertIssueWithinCurrentPolicy(issue, licence) {
  const issueLicenceExpiry = dateValue(issue.licenceExpiry);
  const currentLicenceExpiry = dateValue(licence && licence.licenceExpiry);
  if (!issueLicenceExpiry || !currentLicenceExpiry || issueLicenceExpiry.getTime() !== currentLicenceExpiry.getTime()) {
    throw new PosLicenceRenewalServiceError(409, "stored_response_stale", "POS renewal response no longer matches the current licence policy.");
  }
  if (!issue.signedPayload || issue.signedPayload.licenceExpiry !== currentLicenceExpiry.toISOString()) {
    throw new PosLicenceRenewalServiceError(409, "stored_response_stale", "POS renewal response no longer matches the current licence policy.");
  }
}

function assertLatestIssueMatchesRequest(latestIssue, request, now) {
  assertIssueHasReplayablePayload(latestIssue, now, { allowExpiredOffline: true });
  if (latestIssue.signedPayload.signature !== request.lastSignature) {
    throw new PosLicenceRenewalServiceError(409, "stale_predecessor", "POS renewal request does not match the latest committed issue.");
  }
  const predecessorIssuedAt = dateValue(latestIssue.issuedAt);
  if (!predecessorIssuedAt || predecessorIssuedAt.getTime() >= now.getTime()) {
    throw new PosLicenceRenewalServiceError(409, "renewal_not_after_predecessor", "POS renewal issuance time must be after the latest committed issue.");
  }
}

function payloadDigest(signedPayload) {
  return crypto
    .createHash("sha256")
    .update(`${getStandardLicenceSignatureData(signedPayload)}:${signedPayload.signature}`, "utf8")
    .digest("hex");
}

async function writeRenewalAudit(auditLogger, licence, installation, issue, predecessorIssue, options = {}) {
  const metadata = sanitizeLicenceAuditMetadata({
    action: "licences.renewal.issue",
    actorId: "",
    actorEmail: "",
    actorRole: "pos-machine",
    targetType: "PosLicenceIssue",
    targetId: idText(issue._id || issue.id),
    licenceId: idText(licence._id || licence.id),
    packageId: idText(licence.packageId),
    installationId: idText(installation._id || installation.id),
    issueId: idText(issue._id || issue.id),
    outcome: "success",
    changeSummary: `credentialVersion:${Number(installation.renewalCredentialVersion || 0)}, predecessorIssue:${idText(predecessorIssue._id || predecessorIssue.id)}`,
    createdAt: new Date().toISOString()
  });

  await auditLogger.create({
    actorId: null,
    actorName: "POS renewal",
    actorEmail: "",
    actorRole: "pos-machine",
    action: "licences.renewal.issue",
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
      throw new PosLicenceRenewalServiceError(503, "transaction_unavailable", "MongoDB transactions are required for POS licence renewal.");
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
          error instanceof PosLicenceRenewalServiceError ||
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

    throw new PosLicenceRenewalServiceError(503, "transaction_failed", "POS licence renewal transaction failed.");
  };
}

function createPosLicenceRenewalService(options = {}) {
  const repositories = options.repositories || createDefaultRepositories();
  const auditLogger = options.auditLogger || createDefaultAuditLogger();
  const keyProvider = options.keyProvider || null;
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner();
  const clock = options.clock || (() => new Date());

  return {
    async renewLicence(requestPayload) {
      const request = normalizeRenewalRequest(requestPayload);
      const now = clock();
      let responsePayload = null;

      await runInTransaction(async (session) => {
        const installation = await readOne(
          repositories.posInstallations,
          {
            deviceInstallationId: request.deviceInstallationId,
            status: "active"
          },
          { session, select: "+renewalCredentialHash" }
        );
        assertInstallationCredential(installation, request);

        const licence = await readById(repositories.posLicences, installation.licenceId, { session });
        const posPackage = licence ? await readById(repositories.posPackages, licence.packageId, { session }) : null;
        const policy = assertLicenceAndPackageEligible(licence, posPackage, now);

        const existingRenewal = await readOne(
          repositories.posLicenceIssues,
          {
            installationId: idText(installation._id || installation.id),
            issueReason: "renewal",
            status: "issued",
            predecessorSignatureHash: request.predecessorSignatureHash,
            renewalCredentialVersion: Number(installation.renewalCredentialVersion || 0)
          },
          { session, select: "+signedPayload +predecessorSignatureHash" }
        );
        if (existingRenewal) {
          assertIssueHasReplayablePayload(existingRenewal, now);
          assertIssueWithinCurrentPolicy(existingRenewal, licence);
          responsePayload = { ...existingRenewal.signedPayload };
          return;
        }

        const latestIssue = await readById(repositories.posLicenceIssues, installation.lastIssueId, { session, select: "+signedPayload" });
        assertLatestIssueMatchesRequest(latestIssue, request, now);
        const offlineValidUntil = calculateRenewalOfflineValidUntil(now, policy.licenceExpiry, policy.renewalWindowDurationMinutes);

        const signedPayload = await buildAndSignStandardLicencePayload({
          licence,
          posPackage,
          installation,
          issuedAt: now,
          offlineValidUntil
        }, keyProvider);

        const digest = `sha256:${payloadDigest(signedPayload)}`;
        const issues = await repositories.posLicenceIssues.create([{
          licenceId: idText(licence._id || licence.id),
          installationId: idText(installation._id || installation.id),
          activationCodeId: null,
          status: "issued",
          issueReason: "renewal",
          keyId: keyProvider && keyProvider.keyId ? keyProvider.keyId : "",
          issuedAt: now,
          licenceExpiry: licence.licenceExpiry,
          offlineValidUntil,
          payloadDigest: digest,
          predecessorSignatureHash: request.predecessorSignatureHash,
          renewalCredentialVersion: Number(installation.renewalCredentialVersion || 0),
          signedPayload,
          createdBy: null
        }], { session });
        const issue = issues[0];

        const updatedInstallation = await repositories.posInstallations.findOneAndUpdate(
          {
            _id: idText(installation._id || installation.id),
            __v: versionOf(installation),
            status: "active",
            lastIssueId: idText(latestIssue._id || latestIssue.id),
            renewalCredentialHash: request.renewalCredentialDigest,
            renewalCredentialVersion: Number(installation.renewalCredentialVersion || 0)
          },
          {
            $set: {
              lastIssueId: issue._id,
              lastRenewedAt: now,
              updatedBy: null
            },
            $inc: { __v: 1 }
          },
          { new: true, runValidators: true, session }
        );
        if (!updatedInstallation) {
          throw new PosLicenceRenewalServiceError(409, "renewal_conflict", "POS renewal state changed during renewal.");
        }

        await writeRenewalAudit(auditLogger, licence, updatedInstallation, issue, latestIssue, { session });
        responsePayload = signedPayload;
      });

      return responsePayload;
    }
  };
}

module.exports = {
  RENEWAL_PREDECESSOR_SIGNATURE_PURPOSE,
  RENEWAL_REQUEST_FIELDS,
  RENEWAL_SCHEMA_VERSION,
  PosLicenceRenewalServiceError,
  createDefaultRepositories,
  createPosLicenceRenewalService,
  hashPredecessorSignature,
  normalizeRenewalRequest
};
