const crypto = require("node:crypto");
const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const PosPackage = require("../models/PosPackage");
const User = require("../models/User");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../licensing/posLicensingTransactions");
const { hasPermission } = require("../middleware/auth");
const {
  getStandardLicenceSignatureData
} = require("../utils/posLicenceContract");
const {
  buildAndSignStandardLicencePayload
} = require("../utils/posLicenceSigning");
const {
  sanitizeLicenceAuditMetadata,
  validateLicencePackageConsistency,
  validatePosLicencePolicy,
  validatePosPackagePolicy
} = require("../utils/posLicencePolicy");

const FIXED_STAGING_ADMIN_ID = "6ab0a078e2b1d24644d368ad";
const TARGET_LICENCE_ID = "3e50bcf4c418d82b7663e655";
const PREDECESSOR_SIGNATURE_PURPOSE =
  "automatex-pos-staging-admin-reissue-predecessor-signature:v1:";

class StagingPosCommittedActivationRecoveryError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingPosCommittedActivationRecoveryError";
    this.code = code;
  }
}

function fail(code) {
  throw new StagingPosCommittedActivationRecoveryError(code);
}

function clean(value) {
  return String(value || "").trim();
}

function canonicalObjectId(value) {
  const text = clean(value && (value._id || value.id || value)).toLowerCase();
  if (!mongoose.Types.ObjectId.isValid(text)) {
    return "";
  }
  const canonical = String(new mongoose.Types.ObjectId(text));
  return canonical === text ? canonical : "";
}

function versionOf(record) {
  return Number.isInteger(record && record.__v) && record.__v >= 0 ? record.__v : null;
}

function dateValue(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assertStagingRuntime(env) {
  if (
    clean(env && env.VERCEL) !== "1" ||
    clean(env && env.VERCEL_ENV).toLowerCase() !== "preview" ||
    clean(env && env.VERCEL_GIT_COMMIT_REF) !== "pos-licensing-staging" ||
    clean(env && env.AUTOMATEX_ENV).toLowerCase() !== "staging" ||
    clean(env && env.POS_LICENSING_MODE).toLowerCase() !== "staging"
  ) {
    fail("staging_runtime_required");
  }
}

function configuredStagingKeyId(keyProvider) {
  const keyId = clean(keyProvider && keyProvider.keyId);
  if (
    !keyProvider ||
    typeof keyProvider.getPrivateKey !== "function" ||
    !/^automatex-pos-staging-/i.test(keyId) ||
    keyId.length > 120
  ) {
    fail("staging_signing_provider_invalid");
  }
  return keyId;
}

function defaultRepositories() {
  return {
    auditLogs: AuditLog,
    posInstallations: PosInstallation,
    posLicences: PosLicence,
    posLicenceIssues: PosLicenceIssue,
    posPackages: PosPackage,
    users: User
  };
}

async function leanQuery(query, projection, session) {
  let result = query;
  if (projection && result && typeof result.select === "function") {
    result = result.select(projection);
  }
  if (session && result && typeof result.session === "function") {
    result = result.session(session);
  }
  if (result && typeof result.lean === "function") {
    result = result.lean();
  }
  return result;
}

async function readRecoveryPrerequisites(repositories, session) {
  const [admin, licence, activeInstallations] = await Promise.all([
    leanQuery(
      repositories.users.findById(FIXED_STAGING_ADMIN_ID),
      "_id name email role status isActive",
      session
    ),
    leanQuery(
      repositories.posLicences.findById(TARGET_LICENCE_ID),
      "_id clientId projectId packageId edition status entitledModules updateChannel licenceExpiry supportExpiry offlineValidUntil renewalWindowDurationMinutes maxInstallations activationCount",
      session
    ),
    leanQuery(
      repositories.posInstallations.find({
        licenceId: TARGET_LICENCE_ID,
        status: "active"
      }),
      "_id licenceId deviceInstallationId status firstActivatedAt lastRenewedAt renewalCredentialVersion renewalCredentialBoundAt lastIssueId __v",
      session
    )
  ]);

  const installation = Array.isArray(activeInstallations) && activeInstallations.length === 1
    ? activeInstallations[0]
    : null;
  const [posPackage, previousIssue] = await Promise.all([
    licence && licence.packageId
      ? leanQuery(
        repositories.posPackages.findById(licence.packageId),
        "_id edition status moduleIds updateChannels",
        session
      )
      : null,
    installation && installation.lastIssueId
      ? leanQuery(
        repositories.posLicenceIssues.findById(installation.lastIssueId),
        "+signedPayload",
        session
      )
      : null
  ]);

  return { activeInstallations, admin, installation, licence, posPackage, previousIssue };
}

function validateRecoveryPrerequisites(records, now, keyProvider) {
  const { activeInstallations, admin, installation, licence, posPackage, previousIssue } = records;
  const providerKeyId = configuredStagingKeyId(keyProvider);
  if (
    !admin ||
    canonicalObjectId(admin) !== FIXED_STAGING_ADMIN_ID ||
    admin.status !== "active" ||
    admin.isActive !== true ||
    admin.role !== "admin" ||
    !hasPermission(admin, "licences:manage")
  ) {
    fail("staging_admin_invalid");
  }
  if (
    !licence ||
    canonicalObjectId(licence) !== TARGET_LICENCE_ID ||
    licence.status !== "active" ||
    licence.activationCount !== 1 ||
    licence.maxInstallations !== 1
  ) {
    fail("licence_invalid");
  }
  if (
    !posPackage ||
    canonicalObjectId(posPackage) !== canonicalObjectId(licence.packageId) ||
    posPackage.status !== "active"
  ) {
    fail("package_invalid");
  }
  if (
    validatePosPackagePolicy(posPackage, { requireIssuable: true }).length ||
    validatePosLicencePolicy(licence, { requireIssuable: true }).length ||
    validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true }).length
  ) {
    fail("licence_or_package_ineligible");
  }

  const licenceExpiry = dateValue(licence.licenceExpiry);
  const offlineValidUntil = dateValue(licence.offlineValidUntil);
  if (
    !licenceExpiry ||
    !offlineValidUntil ||
    licenceExpiry.getTime() <= now.getTime() ||
    offlineValidUntil.getTime() <= now.getTime() ||
    offlineValidUntil.getTime() > licenceExpiry.getTime()
  ) {
    fail("licence_or_package_ineligible");
  }
  if (!Array.isArray(activeInstallations) || activeInstallations.length !== 1 || !installation) {
    fail("active_installation_ambiguous");
  }

  const installationId = canonicalObjectId(installation);
  const previousIssueId = canonicalObjectId(previousIssue);
  const expectedPreviousIssueId = canonicalObjectId(installation.lastIssueId);
  const installationVersion = versionOf(installation);
  if (
    !installationId ||
    canonicalObjectId(installation.licenceId) !== TARGET_LICENCE_ID ||
    installation.status !== "active" ||
    !clean(installation.deviceInstallationId) ||
    installationVersion === null ||
    !expectedPreviousIssueId ||
    !previousIssue ||
    previousIssueId !== expectedPreviousIssueId
  ) {
    fail("installation_or_issue_invalid");
  }
  if (
    previousIssue.status !== "issued" ||
    previousIssue.issueReason !== "activation" ||
    canonicalObjectId(previousIssue.licenceId) !== TARGET_LICENCE_ID ||
    canonicalObjectId(previousIssue.installationId) !== installationId ||
    !canonicalObjectId(previousIssue.activationCodeId) ||
    !previousIssue.signedPayload ||
    typeof previousIssue.signedPayload !== "object" ||
    Array.isArray(previousIssue.signedPayload) ||
    Object.prototype.hasOwnProperty.call(previousIssue.signedPayload, "keyId") ||
    clean(previousIssue.signedPayload.installationId).toLowerCase() !== clean(installation.deviceInstallationId).toLowerCase() ||
    clean(previousIssue.signedPayload.clientId) !== canonicalObjectId(licence.clientId) ||
    !clean(previousIssue.signedPayload.signature)
  ) {
    fail("original_activation_issue_invalid");
  }
  const previousIssueKeyId = clean(previousIssue.keyId);
  if (previousIssueKeyId && previousIssueKeyId !== providerKeyId) {
    fail("original_issue_key_mismatch");
  }

  return Object.freeze({
    actor: Object.freeze({
      id: canonicalObjectId(admin),
      name: clean(admin.name),
      email: clean(admin.email),
      role: admin.role
    }),
    installationId,
    installationVersion,
    offlineValidUntil,
    previousIssueId,
    providerKeyId
  });
}

function payloadDigest(signedPayload) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(`${getStandardLicenceSignatureData(signedPayload)}:${signedPayload.signature}`, "utf8")
    .digest("hex")}`;
}

function predecessorSignatureHash(signature) {
  return `sha256:v1:${crypto
    .createHash("sha256")
    .update(`${PREDECESSOR_SIGNATURE_PURPOSE}${clean(signature)}`, "utf8")
    .digest("hex")}`;
}

async function writeRecoveryAudit(repositories, actor, records, newIssue, now, session) {
  const metadata = sanitizeLicenceAuditMetadata({
    action: "licences.activation.admin-reissue",
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetType: "PosLicenceIssue",
    targetId: canonicalObjectId(newIssue),
    licenceId: TARGET_LICENCE_ID,
    packageId: canonicalObjectId(records.posPackage),
    installationId: canonicalObjectId(records.installation),
    issueId: canonicalObjectId(newIssue),
    activationCodeId: canonicalObjectId(records.previousIssue.activationCodeId),
    outcome: "success",
    reason: "staging-missing-key-id-recovery",
    changeSummary: `previousIssue:${canonicalObjectId(records.previousIssue)}`,
    createdAt: now.toISOString()
  });
  const audits = await repositories.auditLogs.create([{
    actorId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "licences.activation.admin-reissue",
    module: "Licences",
    targetType: "PosLicenceIssue",
    targetId: canonicalObjectId(newIssue),
    targetLabel: "",
    oldValue: null,
    newValue: metadata,
    severity: "Medium"
  }], { session });
  if (!Array.isArray(audits) || audits.length !== 1) {
    fail("audit_write_failed");
  }
}

async function recoverStagingCommittedActivation(options = {}) {
  const env = options.env || process.env;
  const connection = options.connection || mongoose.connection;
  const repositories = options.repositories || defaultRepositories();
  const keyProvider = options.keyProvider || null;
  const clock = options.clock || (() => new Date());
  assertStagingRuntime(env);
  configuredStagingKeyId(keyProvider);
  if (!connection || typeof connection.startSession !== "function") {
    fail("transaction_unavailable");
  }

  const session = await connection.startSession();
  try {
    if (!session || typeof session.withTransaction !== "function") {
      fail("transaction_unavailable");
    }
    const committedResult = await session.withTransaction(async () => {
      const now = clock();
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        fail("clock_invalid");
      }
      const records = await readRecoveryPrerequisites(repositories, session);
      const validated = validateRecoveryPrerequisites(records, now, keyProvider);
      const signedLicence = await buildAndSignStandardLicencePayload({
        licence: records.licence,
        posPackage: records.posPackage,
        installation: records.installation,
        issuedAt: now,
        offlineValidUntil: validated.offlineValidUntil
      }, keyProvider);
      if (signedLicence.keyId !== validated.providerKeyId) {
        fail("signed_payload_invalid");
      }

      const createdIssues = await repositories.posLicenceIssues.create([{
        licenceId: TARGET_LICENCE_ID,
        installationId: validated.installationId,
        activationCodeId: canonicalObjectId(records.previousIssue.activationCodeId),
        status: "issued",
        issueReason: "admin-reissue",
        keyId: validated.providerKeyId,
        issuedAt: now,
        licenceExpiry: records.licence.licenceExpiry,
        offlineValidUntil: validated.offlineValidUntil,
        payloadDigest: payloadDigest(signedLicence),
        predecessorSignatureHash: predecessorSignatureHash(records.previousIssue.signedPayload.signature),
        renewalCredentialVersion: Number(records.installation.renewalCredentialVersion || 0),
        signedPayload: signedLicence,
        createdBy: validated.actor.id
      }], { session });
      const newIssue = Array.isArray(createdIssues) && createdIssues.length === 1
        ? createdIssues[0]
        : null;
      const newIssueId = canonicalObjectId(newIssue);
      if (!newIssueId) {
        fail("issue_write_failed");
      }

      const updateResult = await repositories.posInstallations.updateOne(
        {
          _id: validated.installationId,
          licenceId: TARGET_LICENCE_ID,
          deviceInstallationId: records.installation.deviceInstallationId,
          status: "active",
          lastIssueId: validated.previousIssueId,
          __v: validated.installationVersion
        },
        {
          $set: {
            lastIssueId: newIssueId,
            updatedBy: validated.actor.id
          },
          $inc: { __v: 1 }
        },
        { runValidators: true, session }
      );
      if (!updateResult || updateResult.matchedCount !== 1 || updateResult.modifiedCount !== 1) {
        fail("installation_cas_conflict");
      }

      await writeRecoveryAudit(repositories, validated.actor, records, newIssue, now, session);
      return Object.freeze({
        licenceId: TARGET_LICENCE_ID,
        installationId: validated.installationId,
        previousIssueId: validated.previousIssueId,
        newIssueId,
        signedLicence
      });
    }, REQUIRED_POS_TRANSACTION_OPTIONS);

    if (
      !committedResult ||
      committedResult.licenceId !== TARGET_LICENCE_ID ||
      !canonicalObjectId(committedResult.installationId) ||
      !canonicalObjectId(committedResult.previousIssueId) ||
      !canonicalObjectId(committedResult.newIssueId) ||
      !committedResult.signedLicence ||
      committedResult.signedLicence.keyId !== clean(keyProvider.keyId)
    ) {
      fail("recovery_transaction_not_committed");
    }
    return committedResult;
  } finally {
    if (session && typeof session.endSession === "function") {
      await session.endSession().catch(() => null);
    }
  }
}

module.exports = {
  FIXED_STAGING_ADMIN_ID,
  PREDECESSOR_SIGNATURE_PURPOSE,
  StagingPosCommittedActivationRecoveryError,
  TARGET_LICENCE_ID,
  defaultRepositories,
  readRecoveryPrerequisites,
  recoverStagingCommittedActivation,
  validateRecoveryPrerequisites
};
