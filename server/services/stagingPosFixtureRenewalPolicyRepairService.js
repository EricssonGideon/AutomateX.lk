const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosLicence = require("../models/PosLicence");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../licensing/posLicensingTransactions");
const {
  STAGING_FIXTURE_MARKER
} = require("./stagingPosActivationFixtureService");

const STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES = 60;
const STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_AUDIT_ACTION =
  "licences.staging-test-fixture.renewal-policy.repair";

class StagingPosFixtureRenewalPolicyRepairError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StagingPosFixtureRenewalPolicyRepairError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new StagingPosFixtureRenewalPolicyRepairError(code, message);
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
    posLicences: PosLicence
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

async function findMany(repository, query, session) {
  let result = repository.find(query);
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
      fail("transaction_unavailable", "MongoDB transactions are required for staging renewal-policy repair.");
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
        if (error instanceof StagingPosFixtureRenewalPolicyRepairError) {
          throw error;
        }
        if (!error || typeof error.hasErrorLabel !== "function" || !error.hasErrorLabel("TransientTransactionError")) {
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }

    fail("transaction_failed", "The staging renewal-policy repair transaction could not be completed.");
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
    !licence.clientId ||
    !licence.projectId ||
    !licence.packageId ||
    !licence.licenceExpiry ||
    !licence.offlineValidUntil ||
    !Array.isArray(licence.entitledModules) ||
    licence.entitledModules.length === 0 ||
    Number(licence.maxInstallations) !== 1 ||
    Number(licence.activationCount) !== 1
  ) {
    fail("fixture_licence_invalid", "The controlled staging fixture licence is not eligible for renewal-policy repair.");
  }
  return licence;
}

async function writeRepairAudit(auditLogger, actor, licence, session) {
  await auditLogger.create({
    actorId: actor.id,
    actorName: actor.name || "",
    actorEmail: actor.email || "",
    actorRole: actor.role,
    action: STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_AUDIT_ACTION,
    module: "Licences",
    targetType: "PosLicence",
    targetId: idText(licence),
    targetLabel: STAGING_FIXTURE_MARKER,
    oldValue: null,
    newValue: {
      outcome: "configured",
      changeSummary: "renewalWindowDurationMinutes",
      renewalWindowDurationMinutes: STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES
    },
    severity: "High"
  }, { session });
}

function createStagingPosFixtureRenewalPolicyRepairService(options = {}) {
  const repositories = options.repositories || defaultRepositories();
  const connection = options.connection || mongoose.connection;
  const auditLogger = options.auditLogger || defaultAuditLogger(repositories);
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner(connection);

  return {
    async repairFixtureRenewalPolicy(actor) {
      assertOperator(actor);
      return runInTransaction(async (session) => {
        const licences = await findMany(
          repositories.posLicences,
          { notes: STAGING_FIXTURE_MARKER },
          session
        );
        const licence = assertControlledLicence(licences);
        if (licence.renewalWindowDurationMinutes === STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES) {
          return Object.freeze({
            repaired: false,
            alreadyRepaired: true,
            renewalWindowDurationMinutes: STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES
          });
        }
        if (licence.renewalWindowDurationMinutes !== null) {
          fail("fixture_renewal_policy_conflict", "The controlled staging fixture renewal policy has an unexpected value.");
        }

        const updated = await repositories.posLicences.findOneAndUpdate(
          {
            _id: licence._id,
            notes: STAGING_FIXTURE_MARKER,
            renewalWindowDurationMinutes: { $eq: null, $exists: true }
          },
          {
            $set: {
              renewalWindowDurationMinutes: STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES
            }
          },
          {
            new: true,
            runValidators: true,
            session,
            timestamps: false
          }
        );
        if (
          !updated ||
          idText(updated) !== idText(licence) ||
          updated.notes !== STAGING_FIXTURE_MARKER ||
          Number(updated.renewalWindowDurationMinutes) !== STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES
        ) {
          fail("fixture_renewal_policy_conflict", "The controlled staging fixture renewal policy changed during repair.");
        }

        await writeRepairAudit(auditLogger, actor, updated, session);
        return Object.freeze({
          repaired: true,
          alreadyRepaired: false,
          renewalWindowDurationMinutes: STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES
        });
      });
    }
  };
}

module.exports = {
  STAGING_FIXTURE_RENEWAL_POLICY_REPAIR_AUDIT_ACTION,
  STAGING_FIXTURE_RENEWAL_WINDOW_DURATION_MINUTES,
  StagingPosFixtureRenewalPolicyRepairError,
  createStagingPosFixtureRenewalPolicyRepairService
};
