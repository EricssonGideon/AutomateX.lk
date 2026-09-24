const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosActivationCode = require("../models/PosActivationCode");
const PosLicence = require("../models/PosLicence");
const PosPackage = require("../models/PosPackage");
const User = require("../models/User");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../licensing/posLicensingTransactions");
const { hasPermission } = require("../middleware/auth");
const {
  createPosActivationCodeAdminService
} = require("./posActivationCodeAdminService");
const { isActivationCodeFormat } = require("../utils/posActivationCodeToken");
const {
  validateLicencePackageConsistency,
  validatePosLicencePolicy,
  validatePosPackagePolicy
} = require("../utils/posLicencePolicy");

const FIXED_STAGING_ADMIN_ID = "6ab0a078e2b1d24644d368ad";
const TARGET_LICENCE_ID = "3e50bcf4c418d82b7663e655";
// Keep this pinned until the authenticated read-only diagnostic resolves the
// new licence's single eligible activation-code record.
const EXPECTED_OLD_ACTIVATION_CODE_ID = "6ab0af64058d4881f5e3d6dd";
const REPLACEMENT_DURATION_MS = 60 * 60 * 1000;
const MINIMUM_REPLACEMENT_VALIDITY_MS = 15 * 60 * 1000;

class StagingPosActivationCodeReplacementError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingPosActivationCodeReplacementError";
    this.code = code;
  }
}

function fail(code) {
  throw new StagingPosActivationCodeReplacementError(code);
}

function clean(value) {
  return String(value || "").trim();
}

function idText(value) {
  return clean(value && (value._id || value.id || value));
}

function defaultRepositories() {
  return {
    auditLogs: AuditLog,
    posActivationCodes: PosActivationCode,
    posLicences: PosLicence,
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

async function readReplacementPrerequisites(repositories, session) {
  const [admin, licence, oldCode, activeUnusedCodes] = await Promise.all([
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
      repositories.posActivationCodes.findById(EXPECTED_OLD_ACTIVATION_CODE_ID),
      "_id licenceId status expiresAt maxRedemptions redeemedCount",
      session
    ),
    leanQuery(
      repositories.posActivationCodes.find({
        licenceId: TARGET_LICENCE_ID,
        status: "active",
        redeemedCount: 0
      }),
      "_id licenceId status maxRedemptions redeemedCount",
      session
    )
  ]);
  const posPackage = licence && licence.packageId
    ? await leanQuery(
      repositories.posPackages.findById(licence.packageId),
      "_id edition status moduleIds updateChannels",
      session
    )
    : null;
  return { activeUnusedCodes, admin, licence, oldCode, posPackage };
}

function validateReplacementPrerequisites(records, now) {
  const { activeUnusedCodes, admin, licence, oldCode, posPackage } = records;
  if (
    !admin ||
    idText(admin) !== FIXED_STAGING_ADMIN_ID ||
    admin.status !== "active" ||
    admin.isActive !== true ||
    admin.role !== "admin" ||
    !hasPermission(admin, "licences:manage")
  ) {
    fail("staging_admin_invalid");
  }
  if (!licence || idText(licence) !== TARGET_LICENCE_ID || licence.status !== "active") {
    fail("licence_invalid");
  }
  if (!posPackage || idText(posPackage) !== idText(licence.packageId) || posPackage.status !== "active") {
    fail("package_invalid");
  }
  if (
    validatePosPackagePolicy(posPackage, { requireIssuable: true }).length ||
    validatePosLicencePolicy(licence, { requireIssuable: true }).length ||
    validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true }).length
  ) {
    fail("licence_or_package_ineligible");
  }
  if (oldCode && oldCode.status === "revoked") {
    if (
      idText(oldCode) === EXPECTED_OLD_ACTIVATION_CODE_ID &&
      idText(oldCode.licenceId) === TARGET_LICENCE_ID &&
      oldCode.redeemedCount === 0 &&
      oldCode.maxRedemptions === 1
    ) {
      fail("replacement_already_completed");
    }
    fail("old_activation_code_invalid");
  }
  if (
    !oldCode ||
    idText(oldCode) !== EXPECTED_OLD_ACTIVATION_CODE_ID ||
    idText(oldCode.licenceId) !== TARGET_LICENCE_ID ||
    oldCode.status !== "active" ||
    oldCode.redeemedCount !== 0 ||
    oldCode.maxRedemptions !== 1
  ) {
    fail("old_activation_code_invalid");
  }
  if (
    !Array.isArray(activeUnusedCodes) ||
    activeUnusedCodes.length !== 1 ||
    idText(activeUnusedCodes[0]) !== EXPECTED_OLD_ACTIVATION_CODE_ID
  ) {
    fail("active_activation_code_ambiguous");
  }

  const licenceExpiry = new Date(licence.licenceExpiry);
  const preferredExpiry = new Date(now.getTime() + REPLACEMENT_DURATION_MS);
  if (Number.isNaN(licenceExpiry.getTime())) {
    fail("licence_expiry_invalid");
  }
  const replacementExpiry = new Date(Math.min(preferredExpiry.getTime(), licenceExpiry.getTime()));
  if (replacementExpiry.getTime() - now.getTime() < MINIMUM_REPLACEMENT_VALIDITY_MS) {
    fail("replacement_validity_too_short");
  }

  return Object.freeze({
    actor: Object.freeze({
      id: idText(admin),
      name: clean(admin.name),
      email: clean(admin.email),
      role: admin.role
    }),
    replacementExpiry
  });
}

function createAuditLogger(repositories) {
  return {
    async create(entry, options = {}) {
      const records = await repositories.auditLogs.create([entry], options);
      return records[0];
    }
  };
}

function validateServiceResults(revokedResult, issuedResult, replacementExpiry) {
  const revoked = revokedResult && revokedResult.activationCodeMetadata;
  const issued = issuedResult && issuedResult.activationCodeMetadata;
  if (
    !revoked ||
    revoked.id !== EXPECTED_OLD_ACTIVATION_CODE_ID ||
    revoked.licenceId !== TARGET_LICENCE_ID ||
    revoked.status !== "revoked" ||
    !issued ||
    issued.id === EXPECTED_OLD_ACTIVATION_CODE_ID ||
    issued.licenceId !== TARGET_LICENCE_ID ||
    issued.status !== "active" ||
    issued.redeemedCount !== 0 ||
    issued.maxRedemptions !== 1 ||
    !isActivationCodeFormat(issuedResult.activationCode)
  ) {
    fail("replacement_result_invalid");
  }
  const issuedExpiry = new Date(issued.expiresAt);
  if (
    Number.isNaN(issuedExpiry.getTime()) ||
    issuedExpiry.getTime() !== replacementExpiry.getTime()
  ) {
    fail("replacement_result_invalid");
  }
}

async function replaceStagingActivationCode(options = {}) {
  const connection = options.connection || mongoose.connection;
  const repositories = options.repositories || defaultRepositories();
  const createActivationService = options.createActivationService || createPosActivationCodeAdminService;
  const auditLogger = options.auditLogger || createAuditLogger(repositories);
  const clock = options.clock || (() => new Date());
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
      const records = await readReplacementPrerequisites(repositories, session);
      const { actor, replacementExpiry } = validateReplacementPrerequisites(records, now);
      const reuseOuterTransaction = async (callback) => callback(session);
      const activationService = createActivationService({
        repositories,
        auditLogger,
        clock: () => now,
        generateCode: options.generateCode,
        runInTransaction: reuseOuterTransaction
      });

      const revokedResult = await activationService.revokeUnusedActivationCode(
        actor,
        EXPECTED_OLD_ACTIVATION_CODE_ID
      );
      const issuedResult = await activationService.issueActivationCode(actor, TARGET_LICENCE_ID, {
        expiresAt: replacementExpiry,
        maxRedemptions: 1
      });
      validateServiceResults(revokedResult, issuedResult, replacementExpiry);

      return Object.freeze({
        replaced: true,
        revokedActivationCodeId: EXPECTED_OLD_ACTIVATION_CODE_ID,
        replacementActivationCode: issuedResult.activationCode,
        expiresAt: replacementExpiry.toISOString(),
        maxRedemptions: 1
      });
    }, REQUIRED_POS_TRANSACTION_OPTIONS);

    if (!committedResult || !isActivationCodeFormat(committedResult.replacementActivationCode)) {
      fail("replacement_transaction_not_committed");
    }
    return committedResult;
  } finally {
    if (session && typeof session.endSession === "function") {
      await session.endSession().catch(() => null);
    }
  }
}

module.exports = {
  EXPECTED_OLD_ACTIVATION_CODE_ID,
  FIXED_STAGING_ADMIN_ID,
  MINIMUM_REPLACEMENT_VALIDITY_MS,
  REPLACEMENT_DURATION_MS,
  StagingPosActivationCodeReplacementError,
  TARGET_LICENCE_ID,
  defaultRepositories,
  readReplacementPrerequisites,
  replaceStagingActivationCode,
  validateReplacementPrerequisites
};
