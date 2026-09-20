const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosActivationCode = require("../models/PosActivationCode");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../licensing/posLicensingTransactions");
const {
  STAGING_FIXTURE_MARKER
} = require("./stagingPosActivationFixtureService");
const {
  credentialState
} = require("./stagingPosRenewalCredentialResetService");

const ORIGINAL_CODE_RECOVERY_LIFETIME_MS = 30 * 60 * 1000;
const ORIGINAL_CODE_RECOVERY_AUDIT_ACTION = "licences.staging-test-fixture.activation-code.recover-original";

class StagingPosOriginalActivationCodeRecoveryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StagingPosOriginalActivationCodeRecoveryError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new StagingPosOriginalActivationCodeRecoveryError(code, message);
}

function idText(value) {
  if (!value) {
    return "";
  }
  return String(value._id || value.id || value);
}

function dateValue(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defaultRepositories() {
  return {
    auditLogs: AuditLog,
    posActivationCodes: PosActivationCode,
    posInstallations: PosInstallation,
    posLicences: PosLicence,
    posLicenceIssues: PosLicenceIssue
  };
}

function defaultAuditLogger(repositories) {
  return {
    async create(entry, options = {}) {
      const records = await repositories.auditLogs.create([entry], options);
      return records[0];
    }
  };
}

async function findMany(repository, query, session, options = {}) {
  let result = repository.find(query);
  if (result && typeof result.select === "function" && options.select) {
    result = result.select(options.select);
  }
  if (result && typeof result.session === "function") {
    result = result.session(session);
  }
  if (result && typeof result.lean === "function") {
    result = result.lean();
  }
  return await result || [];
}

function createDefaultTransactionRunner(connection) {
  return async function runInTransaction(callback) {
    if (!connection || typeof connection.startSession !== "function") {
      fail("transaction_unavailable", "MongoDB transactions are required for original activation-code recovery.");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const session = await connection.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await callback(session);
        }, REQUIRED_POS_TRANSACTION_OPTIONS);
        return result;
      } catch (error) {
        if (error instanceof StagingPosOriginalActivationCodeRecoveryError) {
          throw error;
        }
        if (!error || typeof error.hasErrorLabel !== "function" || !error.hasErrorLabel("TransientTransactionError")) {
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }

    fail("transaction_failed", "The original activation-code recovery transaction could not be completed.");
  };
}

function assertOperator(actor) {
  if (!actor || actor.role !== "admin" || !actor.id) {
    fail("operator_unauthorized", "A trusted staging fixture operator is required.");
  }
}

function assertControlledLicence(licences, recoveryExpiresAt) {
  if (licences.length !== 1) {
    fail("fixture_licence_ambiguous", "The controlled staging fixture licence is unavailable or ambiguous.");
  }
  const licence = licences[0];
  const licenceExpiry = dateValue(licence.licenceExpiry);
  const offlineValidUntil = dateValue(licence.offlineValidUntil);
  if (
    licence.notes !== STAGING_FIXTURE_MARKER ||
    licence.edition !== "standard" ||
    licence.status !== "active" ||
    Number(licence.maxInstallations) !== 1 ||
    !licenceExpiry ||
    !offlineValidUntil ||
    licenceExpiry.getTime() < recoveryExpiresAt.getTime() ||
    offlineValidUntil.getTime() < recoveryExpiresAt.getTime()
  ) {
    fail("fixture_licence_unavailable", "The controlled staging fixture licence cannot support the recovery window.");
  }
  return licence;
}

function assertControlledInstallation(installations, licence) {
  if (installations.length !== 1) {
    fail("fixture_installation_ambiguous", "The controlled staging fixture installation is unavailable or ambiguous.");
  }
  const installation = installations[0];
  if (
    idText(installation.licenceId) !== idText(licence) ||
    installation.status !== "active" ||
    !installation.deviceInstallationId ||
    !installation.lastIssueId ||
    !installation.firstActivatedAt ||
    credentialState(installation) !== "clear"
  ) {
    fail("fixture_installation_invalid", "The controlled staging fixture installation is not ready for recovery.");
  }
  return installation;
}

function assertOriginalActivationIssue(issues, installation, recoveryExpiresAt) {
  if (issues.length !== 1) {
    fail("fixture_activation_history_ambiguous", "The controlled staging fixture activation issue is unavailable or ambiguous.");
  }
  const issue = issues[0];
  const licenceExpiry = dateValue(issue.licenceExpiry);
  const offlineValidUntil = dateValue(issue.offlineValidUntil);
  if (
    issue.issueReason !== "activation" ||
    issue.status !== "issued" ||
    !issue.activationCodeId ||
    idText(issue.installationId) !== idText(installation) ||
    idText(installation.lastIssueId) !== idText(issue) ||
    !issue.signedPayload ||
    issue.signedPayload.installationId !== installation.deviceInstallationId ||
    !issue.signedPayload.signature ||
    !licenceExpiry ||
    !offlineValidUntil ||
    licenceExpiry.getTime() < recoveryExpiresAt.getTime() ||
    offlineValidUntil.getTime() < recoveryExpiresAt.getTime()
  ) {
    fail("fixture_activation_issue_invalid", "The controlled staging fixture activation issue cannot support recovery.");
  }
  return issue;
}

function assertOriginalActivationCode(codes, issue) {
  if (codes.length !== 1) {
    fail("fixture_activation_code_ambiguous", "The issue-linked activation code is unavailable or ambiguous.");
  }
  const activationCode = codes[0];
  if (
    idText(activationCode) !== idText(issue.activationCodeId) ||
    activationCode.status !== "redeemed" ||
    Number(activationCode.maxRedemptions) !== 1 ||
    Number(activationCode.redeemedCount) !== 1 ||
    !activationCode.codeHash ||
    !dateValue(activationCode.expiresAt)
  ) {
    fail("fixture_activation_code_invalid", "The issue-linked activation code is not eligible for expiry-only recovery.");
  }
  return activationCode;
}

function assertActivationCodeExpired(activationCode, now) {
  if (dateValue(activationCode.expiresAt).getTime() > now.getTime()) {
    fail("fixture_activation_code_not_expired", "The issue-linked activation code does not require recovery.");
  }
}

function recognizeCompletedRecovery(audits, activationCode) {
  if (audits.length === 0) {
    return null;
  }
  if (
    audits.length !== 1 ||
    String(audits[0].targetId || "") !== idText(activationCode)
  ) {
    fail("fixture_original_code_recovery_ambiguous", "The original activation-code recovery marker is ambiguous.");
  }
  return audits[0];
}

async function writeRecoveryAudit(auditLogger, actor, licence, installation, activationCode, session) {
  await auditLogger.create({
    actorId: actor.id,
    actorName: actor.name || "",
    actorEmail: actor.email || "",
    actorRole: actor.role,
    action: ORIGINAL_CODE_RECOVERY_AUDIT_ACTION,
    module: "Licences",
    targetType: "PosActivationCode",
    targetId: idText(activationCode),
    targetLabel: STAGING_FIXTURE_MARKER,
    oldValue: null,
    newValue: {
      licenceId: idText(licence),
      installationId: idText(installation),
      activationCodeId: idText(activationCode),
      outcome: "recovery-window-opened",
      changeSummary: "expiresAt"
    },
    severity: "High"
  }, { session });
}

function createStagingPosOriginalActivationCodeRecoveryService(options = {}) {
  const repositories = options.repositories || defaultRepositories();
  const connection = options.connection || mongoose.connection;
  const auditLogger = options.auditLogger || defaultAuditLogger(repositories);
  const clock = options.clock || (() => new Date());
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner(connection);

  return {
    async recoverOriginalFixtureActivationCode(actor) {
      assertOperator(actor);
      return runInTransaction(async (session) => {
        const now = clock();
        const recoveryExpiresAt = new Date(now.getTime() + ORIGINAL_CODE_RECOVERY_LIFETIME_MS);
        const licences = await findMany(repositories.posLicences, { notes: STAGING_FIXTURE_MARKER }, session);
        const licence = assertControlledLicence(licences, recoveryExpiresAt);
        const installations = await findMany(
          repositories.posInstallations,
          { licenceId: licence._id },
          session,
          { select: "+renewalCredentialHash" }
        );
        const installation = assertControlledInstallation(installations, licence);
        const issues = await findMany(
          repositories.posLicenceIssues,
          {
            licenceId: licence._id,
            installationId: installation._id,
            issueReason: "activation",
            status: "issued"
          },
          session,
          { select: "+signedPayload" }
        );
        const issue = assertOriginalActivationIssue(issues, installation, recoveryExpiresAt);
        const codes = await findMany(
          repositories.posActivationCodes,
          { _id: issue.activationCodeId, licenceId: licence._id },
          session,
          { select: "+codeHash" }
        );
        const activationCode = assertOriginalActivationCode(codes, issue);
        const audits = await findMany(repositories.auditLogs, {
          action: ORIGINAL_CODE_RECOVERY_AUDIT_ACTION,
          targetLabel: STAGING_FIXTURE_MARKER
        }, session);
        const completed = recognizeCompletedRecovery(audits, activationCode);
        if (completed) {
          return Object.freeze({
            recovered: false,
            alreadyRecovered: true,
            recoveryExpiresAt: activationCode.expiresAt
          });
        }

        assertActivationCodeExpired(activationCode, now);

        const updated = await repositories.posActivationCodes.findOneAndUpdate(
          {
            _id: activationCode._id,
            licenceId: licence._id,
            codeHash: activationCode.codeHash,
            status: "redeemed",
            redeemedCount: 1,
            maxRedemptions: 1,
            expiresAt: activationCode.expiresAt
          },
          { $set: { expiresAt: recoveryExpiresAt } },
          {
            new: true,
            runValidators: true,
            session,
            timestamps: false
          }
        );
        if (
          !updated ||
          idText(updated) !== idText(activationCode) ||
          updated.codeHash !== activationCode.codeHash ||
          updated.status !== "redeemed" ||
          Number(updated.redeemedCount) !== 1 ||
          dateValue(updated.expiresAt).getTime() !== recoveryExpiresAt.getTime()
        ) {
          fail("fixture_activation_code_conflict", "The issue-linked activation code changed during recovery.");
        }

        await writeRecoveryAudit(auditLogger, actor, licence, installation, updated, session);
        return Object.freeze({
          recovered: true,
          alreadyRecovered: false,
          recoveryExpiresAt
        });
      });
    }
  };
}

module.exports = {
  ORIGINAL_CODE_RECOVERY_AUDIT_ACTION,
  ORIGINAL_CODE_RECOVERY_LIFETIME_MS,
  StagingPosOriginalActivationCodeRecoveryError,
  createStagingPosOriginalActivationCodeRecoveryService,
  recognizeCompletedRecovery
};
