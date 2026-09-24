const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const User = require("../models/User");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../licensing/posLicensingTransactions");
const { hasPermission } = require("../middleware/auth");
const {
  FIXED_STAGING_ADMIN_ID,
  TARGET_LICENCE_ID
} = require("./stagingPosCommittedActivationRecoveryService");
const {
  assertNoPosLicensingServerSecretFields
} = require("../config/posLicensingSecrets");
const {
  sanitizeLicenceAuditMetadata
} = require("../utils/posLicencePolicy");
const {
  isRenewalCredentialDigestFormat,
  normalizeRenewalCredentialDigest
} = require("../utils/posRenewalCredentialToken");

const INITIAL_BOUND_CREDENTIAL_VERSION = 1;
const DEVICE_INSTALLATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_FIELDS = Object.freeze(["renewalCredentialDigest"]);
const PROTECTED_REQUEST_FIELDS = Object.freeze([
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
  "deviceInstallationId",
  "activationCode",
  "codeHash",
  "renewalCredential",
  "rawRenewalCredential",
  "renewalSecret",
  "renewalCredentialHash",
  "renewalCredentialVersion",
  "renewalCredentialBoundAt",
  "lastIssueId",
  "privateKey",
  "signingKey",
  "signedPayload",
  "signature"
]);

class StagingPosRenewalCredentialRecoveryError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingPosRenewalCredentialRecoveryError";
    this.code = code;
  }
}

function fail(code) {
  throw new StagingPosRenewalCredentialRecoveryError(code);
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

function normalizeRecoveryRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("request_invalid");
  }
  assertNoPosLicensingServerSecretFields(input);
  const fields = Object.keys(input);
  if (
    fields.length !== REQUEST_FIELDS.length ||
    fields.some((field) => field.startsWith("$") || PROTECTED_REQUEST_FIELDS.includes(field)) ||
    !fields.every((field) => REQUEST_FIELDS.includes(field))
  ) {
    fail("request_invalid");
  }
  const renewalCredentialDigest = normalizeRenewalCredentialDigest(input.renewalCredentialDigest);
  if (!isRenewalCredentialDigestFormat(renewalCredentialDigest)) {
    fail("request_invalid");
  }
  return Object.freeze({ renewalCredentialDigest });
}

function defaultRepositories() {
  return {
    auditLogs: AuditLog,
    posInstallations: PosInstallation,
    posLicences: PosLicence,
    posLicenceIssues: PosLicenceIssue,
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
  const admin = await leanQuery(
    repositories.users.findById(FIXED_STAGING_ADMIN_ID),
    "_id name email role status isActive",
    session
  );
  const licence = await leanQuery(
    repositories.posLicences.findById(TARGET_LICENCE_ID),
    "_id status activationCount maxInstallations",
    session
  );
  const activeInstallations = await leanQuery(
    repositories.posInstallations.find({ licenceId: TARGET_LICENCE_ID, status: "active" }),
    "+renewalCredentialHash",
    session
  );
  const installation = Array.isArray(activeInstallations) && activeInstallations.length === 1
    ? activeInstallations[0]
    : null;
  const currentIssue = installation && installation.lastIssueId
    ? await leanQuery(
      repositories.posLicenceIssues.findById(installation.lastIssueId),
      "_id licenceId installationId status issueReason",
      session
    )
    : null;
  return { activeInstallations, admin, currentIssue, installation, licence };
}

function validateRecoveryPrerequisites(records) {
  const { activeInstallations, admin, currentIssue, installation, licence } = records;
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
  if (!Array.isArray(activeInstallations) || activeInstallations.length !== 1 || !installation) {
    fail("active_installation_ambiguous");
  }

  const installationId = canonicalObjectId(installation);
  const currentIssueId = canonicalObjectId(currentIssue);
  const expectedIssueId = canonicalObjectId(installation.lastIssueId);
  const installationVersion = versionOf(installation);
  if (
    !installationId ||
    canonicalObjectId(installation.licenceId) !== TARGET_LICENCE_ID ||
    installation.status !== "active" ||
    !DEVICE_INSTALLATION_ID_PATTERN.test(clean(installation.deviceInstallationId)) ||
    installationVersion === null ||
    !expectedIssueId ||
    !currentIssue ||
    currentIssueId !== expectedIssueId
  ) {
    fail("installation_or_issue_invalid");
  }
  if (
    currentIssue.status !== "issued" ||
    currentIssue.issueReason !== "admin-reissue" ||
    canonicalObjectId(currentIssue.licenceId) !== TARGET_LICENCE_ID ||
    canonicalObjectId(currentIssue.installationId) !== installationId
  ) {
    fail("current_issue_invalid");
  }
  if (
    installation.renewalCredentialVersion !== 0 ||
    !["", null, undefined].includes(installation.renewalCredentialHash) ||
    ![null, undefined].includes(installation.renewalCredentialBoundAt)
  ) {
    fail("renewal_credential_already_bound");
  }

  return Object.freeze({
    actor: Object.freeze({
      id: canonicalObjectId(admin),
      name: clean(admin.name),
      email: clean(admin.email),
      role: admin.role
    }),
    currentIssueId,
    deviceInstallationId: clean(installation.deviceInstallationId).toLowerCase(),
    installationId,
    installationVersion
  });
}

async function writeRecoveryAudit(repositories, actor, validated, now, session) {
  const metadata = sanitizeLicenceAuditMetadata({
    action: "licences.renewal-credential.staging-recovery",
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetType: "PosInstallation",
    targetId: validated.installationId,
    licenceId: TARGET_LICENCE_ID,
    installationId: validated.installationId,
    issueId: validated.currentIssueId,
    outcome: "success",
    reason: "staging-committed-activation-renewal-recovery",
    changeSummary: `credentialVersion:${INITIAL_BOUND_CREDENTIAL_VERSION}`,
    createdAt: now.toISOString()
  });
  const audits = await repositories.auditLogs.create([{
    actorId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "licences.renewal-credential.staging-recovery",
    module: "Licences",
    targetType: "PosInstallation",
    targetId: validated.installationId,
    targetLabel: "",
    oldValue: null,
    newValue: metadata,
    severity: "Medium"
  }], { session });
  if (!Array.isArray(audits) || audits.length !== 1) {
    fail("audit_write_failed");
  }
}

async function recoverStagingRenewalCredential(input, options = {}) {
  const request = normalizeRecoveryRequest(input);
  const env = options.env || process.env;
  const connection = options.connection || mongoose.connection;
  const repositories = options.repositories || defaultRepositories();
  const clock = options.clock || (() => new Date());
  assertStagingRuntime(env);
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
      const validated = validateRecoveryPrerequisites(records);
      const updateResult = await repositories.posInstallations.updateOne(
        {
          _id: validated.installationId,
          licenceId: TARGET_LICENCE_ID,
          deviceInstallationId: validated.deviceInstallationId,
          status: "active",
          lastIssueId: validated.currentIssueId,
          __v: validated.installationVersion,
          renewalCredentialHash: { $in: ["", null] },
          renewalCredentialVersion: 0,
          renewalCredentialBoundAt: null
        },
        {
          $set: {
            renewalCredentialHash: request.renewalCredentialDigest,
            renewalCredentialVersion: INITIAL_BOUND_CREDENTIAL_VERSION,
            renewalCredentialBoundAt: now,
            updatedBy: validated.actor.id
          },
          $inc: { __v: 1 }
        },
        { runValidators: true, session }
      );
      if (!updateResult || updateResult.matchedCount !== 1 || updateResult.modifiedCount !== 1) {
        fail("installation_cas_conflict");
      }

      await writeRecoveryAudit(repositories, validated.actor, validated, now, session);
      return Object.freeze({
        schemaVersion: 1,
        status: "bound",
        installationId: validated.deviceInstallationId,
        credentialVersion: INITIAL_BOUND_CREDENTIAL_VERSION
      });
    }, REQUIRED_POS_TRANSACTION_OPTIONS);

    if (
      !committedResult ||
      committedResult.schemaVersion !== 1 ||
      committedResult.status !== "bound" ||
      committedResult.credentialVersion !== INITIAL_BOUND_CREDENTIAL_VERSION ||
      !clean(committedResult.installationId)
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
  INITIAL_BOUND_CREDENTIAL_VERSION,
  REQUEST_FIELDS,
  StagingPosRenewalCredentialRecoveryError,
  defaultRepositories,
  normalizeRecoveryRequest,
  readRecoveryPrerequisites,
  recoverStagingRenewalCredential,
  validateRecoveryPrerequisites
};
