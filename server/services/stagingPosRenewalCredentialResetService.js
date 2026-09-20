const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../licensing/posLicensingTransactions");
const {
  STAGING_FIXTURE_MARKER
} = require("./stagingPosActivationFixtureService");

const RESET_CREDENTIAL_FIELDS = Object.freeze([
  "renewalCredentialHash",
  "renewalCredentialVersion",
  "renewalCredentialBoundAt"
]);

class StagingPosRenewalCredentialResetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StagingPosRenewalCredentialResetError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new StagingPosRenewalCredentialResetError(code, message);
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
      fail("transaction_unavailable", "MongoDB transactions are required for the staging credential reset.");
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
        if (error instanceof StagingPosRenewalCredentialResetError) {
          throw error;
        }
        if (!error || typeof error.hasErrorLabel !== "function" || !error.hasErrorLabel("TransientTransactionError")) {
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }

    fail("transaction_failed", "The staging credential-reset transaction could not be completed.");
  };
}

function assertOperator(actor) {
  if (!actor || actor.role !== "admin" || !actor.id) {
    fail("operator_unauthorized", "A trusted staging fixture operator is required.");
  }
}

function assertControlledLicence(licences) {
  if (licences.length !== 1) {
    fail("fixture_licence_ambiguous", "The controlled staging fixture licence is unavailable or ambiguous.");
  }
  const licence = licences[0];
  if (
    licence.notes !== STAGING_FIXTURE_MARKER ||
    licence.edition !== "standard" ||
    licence.status !== "active" ||
    Number(licence.maxInstallations) !== 1
  ) {
    fail("fixture_licence_invalid", "The controlled staging fixture licence is not eligible for credential reset.");
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
    fail("fixture_installation_invalid", "The controlled staging fixture installation is not eligible for credential reset.");
  }
  return installation;
}

function assertCommittedActivationHistory(issues, installation) {
  const activationIssues = issues.filter((issue) =>
    issue.issueReason === "activation" &&
    issue.status === "issued" &&
    Boolean(issue.activationCodeId) &&
    idText(issue.installationId) === idText(installation)
  );
  if (activationIssues.length !== 1) {
    fail("fixture_activation_history_ambiguous", "The controlled staging fixture activation history is unavailable or ambiguous.");
  }
}

function credentialState(installation) {
  const hash = typeof installation.renewalCredentialHash === "string"
    ? installation.renewalCredentialHash
    : "";
  const version = Number(installation.renewalCredentialVersion || 0);
  const boundAt = installation.renewalCredentialBoundAt || null;

  if (!hash && version === 0 && !boundAt) {
    return "clear";
  }
  if (hash && Number.isInteger(version) && version >= 1 && boundAt) {
    return "bound";
  }
  return "ambiguous";
}

async function writeResetAudit(auditLogger, actor, licence, installation, session) {
  await auditLogger.create({
    actorId: actor.id,
    actorName: actor.name || "",
    actorEmail: actor.email || "",
    actorRole: actor.role,
    action: "licences.staging-test-fixture.renewal-credential.reset",
    module: "Licences",
    targetType: "PosInstallation",
    targetId: idText(installation),
    targetLabel: STAGING_FIXTURE_MARKER,
    oldValue: null,
    newValue: {
      licenceId: idText(licence),
      installationId: idText(installation),
      outcome: "cleared",
      changeSummary: RESET_CREDENTIAL_FIELDS.join(",")
    },
    severity: "High"
  }, { session });
}

function createStagingPosRenewalCredentialResetService(options = {}) {
  const repositories = options.repositories || defaultRepositories();
  const connection = options.connection || mongoose.connection;
  const auditLogger = options.auditLogger || defaultAuditLogger(repositories);
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner(connection);

  return {
    async resetFixtureRenewalCredential(actor) {
      assertOperator(actor);
      return runInTransaction(async (session) => {
        const licences = await findMany(
          repositories.posLicences,
          { notes: STAGING_FIXTURE_MARKER },
          session
        );
        const licence = assertControlledLicence(licences);
        const installations = await findMany(
          repositories.posInstallations,
          { licenceId: licence._id },
          session,
          { select: "+renewalCredentialHash" }
        );
        const installation = assertControlledInstallation(installations, licence);
        const issues = await findMany(
          repositories.posLicenceIssues,
          { licenceId: licence._id, installationId: installation._id },
          session
        );
        assertCommittedActivationHistory(issues, installation);

        const state = credentialState(installation);
        if (state === "clear") {
          return Object.freeze({ reset: false, alreadyReset: true });
        }
        if (state !== "bound") {
          fail("fixture_credential_state_ambiguous", "The controlled staging fixture credential state is ambiguous.");
        }

        const updated = await repositories.posInstallations.findOneAndUpdate(
          {
            _id: installation._id,
            licenceId: licence._id,
            status: "active",
            renewalCredentialHash: installation.renewalCredentialHash,
            renewalCredentialVersion: installation.renewalCredentialVersion,
            renewalCredentialBoundAt: installation.renewalCredentialBoundAt
          },
          {
            $set: {
              renewalCredentialHash: "",
              renewalCredentialVersion: 0,
              renewalCredentialBoundAt: null
            }
          },
          {
            new: true,
            runValidators: true,
            session,
            timestamps: false
          }
        );
        if (!updated || credentialState(updated) !== "clear") {
          fail("fixture_credential_reset_conflict", "The controlled staging fixture credential state changed during reset.");
        }

        await writeResetAudit(auditLogger, actor, licence, updated, session);
        return Object.freeze({ reset: true, alreadyReset: false });
      });
    }
  };
}

module.exports = {
  RESET_CREDENTIAL_FIELDS,
  StagingPosRenewalCredentialResetError,
  createStagingPosRenewalCredentialResetService,
  credentialState
};
