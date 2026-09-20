const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosActivationCode = require("../models/PosActivationCode");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const PosPackage = require("../models/PosPackage");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../licensing/posLicensingTransactions");
const {
  createPosActivationCodeAdminService
} = require("./posActivationCodeAdminService");
const {
  STAGING_FIXTURE_MARKER
} = require("./stagingPosActivationFixtureService");
const {
  credentialState
} = require("./stagingPosRenewalCredentialResetService");

const FRESH_ACTIVATION_CODE_LIFETIME_MS = 60 * 60 * 1000;
const FRESH_ACTIVATION_CODE_AUDIT_ACTION = "licences.staging-test-fixture.activation-code.issue-fresh";

class StagingPosFreshActivationCodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StagingPosFreshActivationCodeError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new StagingPosFreshActivationCodeError(code, message);
}

function idText(value) {
  if (!value) {
    return "";
  }
  return String(value._id || value.id || value);
}

function defaultRepositories() {
  return {
    auditLogs: AuditLog,
    posActivationCodes: PosActivationCode,
    posInstallations: PosInstallation,
    posLicences: PosLicence,
    posLicenceIssues: PosLicenceIssue,
    posPackages: PosPackage
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
  if (!Array.isArray(result) && result && typeof result.sort === "function") {
    result = result.sort(options.sort || { createdAt: 1, _id: 1 });
  }
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
      fail("transaction_unavailable", "MongoDB transactions are required for staging activation-code issuance.");
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
        if (error instanceof StagingPosFreshActivationCodeError) {
          throw error;
        }
        if (!error || typeof error.hasErrorLabel !== "function" || !error.hasErrorLabel("TransientTransactionError")) {
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }

    fail("transaction_failed", "The staging activation-code issuance transaction could not be completed.");
  };
}

function assertOperator(actor) {
  if (!actor || actor.role !== "admin" || !actor.id) {
    fail("operator_unauthorized", "A trusted staging fixture operator is required.");
  }
}

function assertControlledLicence(licences, now) {
  if (licences.length !== 1) {
    fail("fixture_licence_ambiguous", "The controlled staging fixture licence is unavailable or ambiguous.");
  }
  const licence = licences[0];
  const licenceExpiry = licence.licenceExpiry ? new Date(licence.licenceExpiry) : null;
  const requiredExpiry = new Date(now.getTime() + FRESH_ACTIVATION_CODE_LIFETIME_MS);
  if (
    licence.notes !== STAGING_FIXTURE_MARKER ||
    licence.edition !== "standard" ||
    licence.status !== "active" ||
    Number(licence.maxInstallations) !== 1 ||
    !licenceExpiry ||
    Number.isNaN(licenceExpiry.getTime()) ||
    licenceExpiry.getTime() < requiredExpiry.getTime()
  ) {
    fail("fixture_licence_unavailable", "The controlled staging fixture licence cannot authorize a 60-minute activation code.");
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
    !installation.firstActivatedAt
  ) {
    fail("fixture_installation_invalid", "The controlled staging fixture installation is not ready for credential re-bootstrap.");
  }
  return installation;
}

function assertCredentialReset(installation) {
  if (credentialState(installation) !== "clear") {
    fail("fixture_credential_not_reset", "The controlled staging fixture renewal credential has not been reset.");
  }
}

function assertCommittedActivationHistory(issues, installation) {
  const activationIssues = issues.filter((issue) =>
    issue.issueReason === "activation" &&
    issue.status === "issued" &&
    Boolean(issue.activationCodeId) &&
    idText(issue.installationId) === idText(installation)
  );
  if (activationIssues.length < 1) {
    fail("fixture_activation_history_ambiguous", "The controlled staging fixture activation history is unavailable or ambiguous.");
  }
}

function priorCodeStatus(code, now) {
  if (!["active", "redeemed"].includes(code.status)) {
    return code.status;
  }
  const expiresAt = code.expiresAt ? new Date(code.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "revoked";
}

function recognizePriorIssuance(audits, codes) {
  if (audits.length === 0) {
    return null;
  }
  if (audits.length !== 1) {
    fail("fixture_fresh_code_state_ambiguous", "The controlled staging fixture fresh-code state is ambiguous.");
  }
  const issuedCode = codes.find((code) => idText(code) === String(audits[0].targetId || ""));
  if (!issuedCode || Number(issuedCode.maxRedemptions) !== 1) {
    fail("fixture_fresh_code_state_ambiguous", "The controlled staging fixture fresh-code marker is invalid.");
  }
  return issuedCode;
}

async function writeFreshCodeAudit(auditLogger, actor, licence, issuedCode, session) {
  await auditLogger.create({
    actorId: actor.id,
    actorName: actor.name || "",
    actorEmail: actor.email || "",
    actorRole: actor.role,
    action: FRESH_ACTIVATION_CODE_AUDIT_ACTION,
    module: "Licences",
    targetType: "PosActivationCode",
    targetId: idText(issuedCode),
    targetLabel: STAGING_FIXTURE_MARKER,
    oldValue: null,
    newValue: {
      licenceId: idText(licence),
      activationCodeId: idText(issuedCode),
      outcome: "issued",
      changeSummary: "expiresAt,maxRedemptions"
    },
    severity: "High"
  }, { session });
}

function createStagingPosFreshActivationCodeService(options = {}) {
  const repositories = options.repositories || defaultRepositories();
  const connection = options.connection || mongoose.connection;
  const auditLogger = options.auditLogger || defaultAuditLogger(repositories);
  const clock = options.clock || (() => new Date());
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner(connection);

  return {
    async issueFreshFixtureActivationCode(actor) {
      assertOperator(actor);
      return runInTransaction(async (session) => {
        const now = clock();
        const licences = await findMany(repositories.posLicences, { notes: STAGING_FIXTURE_MARKER }, session);
        const licence = assertControlledLicence(licences, now);
        const installations = await findMany(
          repositories.posInstallations,
          { licenceId: licence._id },
          session,
          { select: "+renewalCredentialHash" }
        );
        const installation = assertControlledInstallation(installations, licence);
        const codes = await findMany(repositories.posActivationCodes, { licenceId: licence._id }, session);
        if (codes.length === 0 || codes.some((code) => Number(code.maxRedemptions) !== 1)) {
          fail("fixture_activation_code_state_ambiguous", "The controlled staging fixture activation-code state is ambiguous.");
        }
        const issuanceAudits = await findMany(repositories.auditLogs, {
          action: FRESH_ACTIVATION_CODE_AUDIT_ACTION,
          targetLabel: STAGING_FIXTURE_MARKER
        }, session);
        if (recognizePriorIssuance(issuanceAudits, codes)) {
          return Object.freeze({ issued: false, alreadyIssued: true, maxRedemptions: 1 });
        }

        assertCredentialReset(installation);
        const issues = await findMany(
          repositories.posLicenceIssues,
          { licenceId: licence._id, installationId: installation._id },
          session
        );
        assertCommittedActivationHistory(issues, installation);

        const lockCode = codes[codes.length - 1];
        for (const code of codes) {
          const nextStatus = priorCodeStatus(code, now);
          if (nextStatus === code.status && idText(code) !== idText(lockCode)) {
            continue;
          }
          const updated = await repositories.posActivationCodes.findOneAndUpdate(
            {
              _id: code._id,
              licenceId: licence._id,
              status: code.status,
              __v: Number.isInteger(code.__v) ? code.__v : 0
            },
            {
              $set: {
                status: nextStatus,
                ...(nextStatus !== code.status ? { updatedBy: actor.id } : {})
              },
              $inc: { __v: 1 }
            },
            { new: true, runValidators: true, session }
          );
          if (!updated) {
            fail("fixture_activation_code_conflict", "The controlled staging fixture activation-code state changed during issuance.");
          }
        }

        const expiresAt = new Date(now.getTime() + FRESH_ACTIVATION_CODE_LIFETIME_MS);
        const activationCodeService = createPosActivationCodeAdminService({
          repositories: {
            posActivationCodes: repositories.posActivationCodes,
            posLicences: repositories.posLicences,
            posPackages: repositories.posPackages
          },
          auditLogger,
          runInTransaction: async (callback) => callback(session),
          clock,
          ...(options.generateCode ? { generateCode: options.generateCode } : {})
        });
        const issued = await activationCodeService.issueActivationCode(actor, idText(licence), {
          expiresAt,
          maxRedemptions: 1
        });
        await writeFreshCodeAudit(
          auditLogger,
          actor,
          licence,
          issued.activationCodeMetadata,
          session
        );

        return Object.freeze({
          issued: true,
          alreadyIssued: false,
          activationCode: issued.activationCode,
          activationCodeExpiresAt: issued.activationCodeMetadata.expiresAt,
          maxRedemptions: 1
        });
      });
    }
  };
}

module.exports = {
  FRESH_ACTIVATION_CODE_AUDIT_ACTION,
  FRESH_ACTIVATION_CODE_LIFETIME_MS,
  StagingPosFreshActivationCodeError,
  createStagingPosFreshActivationCodeService,
  priorCodeStatus,
  recognizePriorIssuance
};
