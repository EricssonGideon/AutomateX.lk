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
  FIXED_STAGING_ADMIN_ID,
  PREDECESSOR_SIGNATURE_PURPOSE,
  TARGET_LICENCE_ID
} = require("./stagingPosCommittedActivationRecoveryService");
const {
  getStandardLicenceSignatureData,
  validateStandardSignedResponseFieldSet
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

const MINIMUM_FRESH_VALIDITY_MINUTES = 5;
const MINIMUM_FRESH_VALIDITY_MS = MINIMUM_FRESH_VALIDITY_MINUTES * 60 * 1000;

class StagingPosAdminReissueRefreshError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingPosAdminReissueRefreshError";
    this.code = code;
  }
}

function fail(code) {
  throw new StagingPosAdminReissueRefreshError(code);
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
    typeof keyProvider.getPublicKey !== "function" ||
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

async function readRefreshPrerequisites(repositories, session) {
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
      "+renewalCredentialHash",
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
        "_id licenceId installationId status issueReason keyId issuedAt licenceExpiry offlineValidUntil +signedPayload",
        session
      )
      : null
  ]);

  return { activeInstallations, admin, installation, licence, posPackage, previousIssue };
}

function decodeEd25519Signature(signature) {
  const encoded = clean(signature);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    fail("predecessor_signature_invalid");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== encoded) {
    fail("predecessor_signature_invalid");
  }
  return bytes;
}

async function verifyPredecessorSignature(signedPayload, keyProvider) {
  let publicKey;
  try {
    publicKey = await keyProvider.getPublicKey();
  } catch {
    fail("verification_key_unavailable");
  }
  if (!publicKey || publicKey.type !== "public" || publicKey.asymmetricKeyType !== "ed25519") {
    fail("verification_key_invalid");
  }

  let verified = false;
  try {
    verified = crypto.verify(
      null,
      Buffer.from(getStandardLicenceSignatureData(signedPayload), "utf8"),
      publicKey,
      decodeEd25519Signature(signedPayload.signature)
    );
  } catch (error) {
    if (error instanceof StagingPosAdminReissueRefreshError) {
      throw error;
    }
    fail("predecessor_signature_invalid");
  }
  if (!verified) {
    fail("predecessor_signature_invalid");
  }
}

function calculateFreshOfflineValidUntil(now, licenceExpiry, renewalWindowDurationMinutes, predecessorOfflineValidUntil) {
  const durationMinutes = Number(renewalWindowDurationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < MINIMUM_FRESH_VALIDITY_MINUTES) {
    fail("fresh_validity_policy_invalid");
  }
  const candidate = new Date(now.getTime() + durationMinutes * 60 * 1000);
  const freshOfflineValidUntil = new Date(Math.min(candidate.getTime(), licenceExpiry.getTime()));
  if (
    freshOfflineValidUntil.getTime() <= now.getTime() ||
    freshOfflineValidUntil.getTime() - now.getTime() < MINIMUM_FRESH_VALIDITY_MS ||
    freshOfflineValidUntil.getTime() <= predecessorOfflineValidUntil.getTime()
  ) {
    fail("fresh_validity_unusable");
  }
  return freshOfflineValidUntil;
}

async function validateRefreshPrerequisites(records, now, keyProvider) {
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
    posPackage.status !== "active" ||
    validatePosPackagePolicy(posPackage, { requireIssuable: true }).length ||
    validatePosLicencePolicy(licence, { requireIssuable: true }).length ||
    validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true }).length
  ) {
    fail("licence_or_package_ineligible");
  }

  const licenceExpiry = dateValue(licence.licenceExpiry);
  if (!licenceExpiry || licenceExpiry.getTime() <= now.getTime()) {
    fail("licence_expired");
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
    installation.renewalCredentialVersion !== 0 ||
    !["", null, undefined].includes(installation.renewalCredentialHash) ||
    ![null, undefined].includes(installation.renewalCredentialBoundAt)
  ) {
    fail("renewal_credential_state_invalid");
  }

  const signedPayload = previousIssue.signedPayload;
  const predecessorIssuedAt = dateValue(previousIssue.issuedAt);
  const predecessorLicenceExpiry = dateValue(previousIssue.licenceExpiry);
  const predecessorOfflineValidUntil = dateValue(previousIssue.offlineValidUntil);
  if (
    previousIssue.status !== "issued" ||
    previousIssue.issueReason !== "admin-reissue" ||
    canonicalObjectId(previousIssue.licenceId) !== TARGET_LICENCE_ID ||
    canonicalObjectId(previousIssue.installationId) !== installationId ||
    clean(previousIssue.keyId) !== providerKeyId ||
    !signedPayload ||
    typeof signedPayload !== "object" ||
    Array.isArray(signedPayload) ||
    validateStandardSignedResponseFieldSet(signedPayload).length ||
    clean(signedPayload.keyId) !== providerKeyId ||
    clean(signedPayload.installationId).toLowerCase() !== clean(installation.deviceInstallationId).toLowerCase() ||
    clean(signedPayload.clientId) !== canonicalObjectId(licence.clientId) ||
    !predecessorIssuedAt ||
    predecessorIssuedAt.getTime() >= now.getTime() ||
    signedPayload.issuedAt !== predecessorIssuedAt.toISOString() ||
    !predecessorLicenceExpiry ||
    predecessorLicenceExpiry.getTime() !== licenceExpiry.getTime() ||
    signedPayload.licenceExpiry !== licenceExpiry.toISOString() ||
    !predecessorOfflineValidUntil ||
    signedPayload.offlineValidUntil !== predecessorOfflineValidUntil.toISOString()
  ) {
    fail("predecessor_issue_invalid");
  }
  await verifyPredecessorSignature(signedPayload, keyProvider);

  const freshOfflineValidUntil = calculateFreshOfflineValidUntil(
    now,
    licenceExpiry,
    licence.renewalWindowDurationMinutes,
    predecessorOfflineValidUntil
  );
  return Object.freeze({
    actor: Object.freeze({
      id: canonicalObjectId(admin),
      name: clean(admin.name),
      email: clean(admin.email),
      role: admin.role
    }),
    freshOfflineValidUntil,
    installationId,
    installationVersion,
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

async function writeRefreshAudit(repositories, actor, records, newIssue, now, session) {
  const newIssueId = canonicalObjectId(newIssue);
  const metadata = sanitizeLicenceAuditMetadata({
    action: "licences.admin-reissue.refresh",
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetType: "PosLicenceIssue",
    targetId: newIssueId,
    licenceId: TARGET_LICENCE_ID,
    packageId: canonicalObjectId(records.posPackage),
    installationId: canonicalObjectId(records.installation),
    issueId: newIssueId,
    outcome: "success",
    reason: "staging-expired-admin-reissue-refresh",
    changeSummary: `previousIssue:${canonicalObjectId(records.previousIssue)}`,
    createdAt: now.toISOString()
  });
  const audits = await repositories.auditLogs.create([{
    actorId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "licences.admin-reissue.refresh",
    module: "Licences",
    targetType: "PosLicenceIssue",
    targetId: newIssueId,
    targetLabel: "",
    oldValue: null,
    newValue: metadata,
    severity: "Medium"
  }], { session });
  if (!Array.isArray(audits) || audits.length !== 1) {
    fail("audit_write_failed");
  }
}

async function refreshStagingAdminReissue(options = {}) {
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
      const records = await readRefreshPrerequisites(repositories, session);
      const validated = await validateRefreshPrerequisites(records, now, keyProvider);
      const signedLicence = await buildAndSignStandardLicencePayload({
        licence: records.licence,
        posPackage: records.posPackage,
        installation: records.installation,
        issuedAt: now,
        offlineValidUntil: validated.freshOfflineValidUntil
      }, keyProvider);
      if (signedLicence.keyId !== validated.providerKeyId) {
        fail("signed_payload_invalid");
      }

      const createdIssues = await repositories.posLicenceIssues.create([{
        licenceId: TARGET_LICENCE_ID,
        installationId: validated.installationId,
        activationCodeId: null,
        status: "issued",
        issueReason: "admin-reissue",
        keyId: validated.providerKeyId,
        issuedAt: now,
        licenceExpiry: records.licence.licenceExpiry,
        offlineValidUntil: validated.freshOfflineValidUntil,
        payloadDigest: payloadDigest(signedLicence),
        predecessorSignatureHash: predecessorSignatureHash(records.previousIssue.signedPayload.signature),
        renewalCredentialVersion: 0,
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

      await writeRefreshAudit(repositories, validated.actor, records, newIssue, now, session);
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
      committedResult.previousIssueId === committedResult.newIssueId ||
      !committedResult.signedLicence ||
      committedResult.signedLicence.keyId !== clean(keyProvider.keyId)
    ) {
      fail("refresh_transaction_not_committed");
    }
    return committedResult;
  } finally {
    if (session && typeof session.endSession === "function") {
      await session.endSession().catch(() => null);
    }
  }
}

module.exports = {
  MINIMUM_FRESH_VALIDITY_MINUTES,
  StagingPosAdminReissueRefreshError,
  TARGET_LICENCE_ID,
  calculateFreshOfflineValidUntil,
  defaultRepositories,
  readRefreshPrerequisites,
  refreshStagingAdminReissue,
  validateRefreshPrerequisites
};
