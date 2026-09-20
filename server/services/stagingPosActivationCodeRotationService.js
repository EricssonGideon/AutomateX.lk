const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosActivationCode = require("../models/PosActivationCode");
const PosLicence = require("../models/PosLicence");
const PosPackage = require("../models/PosPackage");
const {
  createPosActivationCodeAdminService
} = require("./posActivationCodeAdminService");
const {
  STAGING_FIXTURE_MARKER
} = require("./stagingPosActivationFixtureService");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../licensing/posLicensingTransactions");

const ROTATED_CODE_LIFETIME_MS = 30 * 60 * 1000;

class StagingPosActivationCodeRotationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StagingPosActivationCodeRotationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new StagingPosActivationCodeRotationError(code, message);
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
    posLicences: PosLicence,
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

async function findOne(repository, query, session) {
  let result = repository.findOne(query);
  if (result && typeof result.session === "function") {
    result = result.session(session);
  }
  return result;
}

async function findMany(repository, query, session) {
  let result = repository.find(query);
  if (!Array.isArray(result) && result && typeof result.sort === "function") {
    result = result.sort({ createdAt: 1, _id: 1 });
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
      fail("transaction_unavailable", "MongoDB transactions are required for staging activation-code rotation.");
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
        if (error instanceof StagingPosActivationCodeRotationError) {
          throw error;
        }
        if (!error || typeof error.hasErrorLabel !== "function" || !error.hasErrorLabel("TransientTransactionError")) {
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }

    fail("transaction_failed", "The staging activation-code rotation transaction could not be completed.");
  };
}

function assertOperator(actor) {
  if (!actor || actor.role !== "admin" || !actor.id) {
    fail("operator_unauthorized", "A trusted staging fixture operator is required.");
  }
}

function assertControlledLicence(licence, now) {
  const expiry = licence && licence.licenceExpiry ? new Date(licence.licenceExpiry) : null;
  if (
    !licence ||
    licence.notes !== STAGING_FIXTURE_MARKER ||
    licence.edition !== "standard" ||
    licence.status !== "active" ||
    Number(licence.maxInstallations) !== 1 ||
    !expiry ||
    Number.isNaN(expiry.getTime()) ||
    expiry.getTime() <= now.getTime()
  ) {
    fail("fixture_licence_unavailable", "The controlled staging fixture licence is not eligible for rotation.");
  }
  return expiry;
}

function recognizeCompletedRotation(codes) {
  if (codes.length !== 2) {
    return false;
  }
  const revoked = codes.filter((record) => record.status === "revoked");
  const replacement = codes.filter((record) => record.status !== "revoked");
  return revoked.length === 1 &&
    replacement.length === 1 &&
    Number(revoked[0].maxRedemptions) === 1 &&
    Number(replacement[0].maxRedemptions) === 1;
}

async function writeInvalidationAudit(auditLogger, actor, licence, activationCode, session) {
  await auditLogger.create({
    actorId: actor.id,
    actorName: actor.name || "",
    actorEmail: actor.email || "",
    actorRole: actor.role,
    action: "licences.staging-test-fixture.activation-code.invalidate-exposed",
    module: "Licences",
    targetType: "PosActivationCode",
    targetId: idText(activationCode),
    targetLabel: STAGING_FIXTURE_MARKER,
    oldValue: null,
    newValue: {
      licenceId: idText(licence),
      activationCodeId: idText(activationCode),
      outcome: "revoked",
      changeSummary: "status"
    },
    severity: "High"
  }, { session });
}

function createStagingPosActivationCodeRotationService(options = {}) {
  const repositories = options.repositories || defaultRepositories();
  const connection = options.connection || mongoose.connection;
  const auditLogger = options.auditLogger || defaultAuditLogger(repositories);
  const clock = options.clock || (() => new Date());
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner(connection);

  return {
    async rotateFixtureActivationCode(actor) {
      assertOperator(actor);
      return runInTransaction(async (session) => {
        const now = clock();
        const licence = await findOne(repositories.posLicences, { notes: STAGING_FIXTURE_MARKER }, session);
        const licenceExpiry = assertControlledLicence(licence, now);
        const codes = await findMany(repositories.posActivationCodes, { licenceId: licence._id }, session);

        if (recognizeCompletedRotation(codes)) {
          return Object.freeze({
            rotated: false,
            alreadyRotated: true,
            maxRedemptions: 1
          });
        }
        if (codes.length !== 1 || Number(codes[0].maxRedemptions) !== 1) {
          fail("fixture_activation_code_conflict", "The controlled staging fixture activation-code state is ambiguous.");
        }

        const exposedCode = codes[0];
        if (exposedCode.status !== "revoked") {
          const revoked = await repositories.posActivationCodes.findOneAndUpdate(
            {
              _id: exposedCode._id,
              licenceId: licence._id,
              status: exposedCode.status,
              __v: Number.isInteger(exposedCode.__v) ? exposedCode.__v : 0
            },
            {
              $set: { status: "revoked", updatedBy: actor.id },
              $inc: { __v: 1 }
            },
            { new: true, runValidators: true, session }
          );
          if (!revoked) {
            fail("fixture_activation_code_conflict", "The exposed staging activation code changed during rotation.");
          }
          await writeInvalidationAudit(auditLogger, actor, licence, revoked, session);
        }

        const expiresAt = new Date(Math.min(
          now.getTime() + ROTATED_CODE_LIFETIME_MS,
          licenceExpiry.getTime()
        ));
        if (expiresAt.getTime() <= now.getTime()) {
          fail("fixture_licence_unavailable", "The controlled staging fixture licence expires too soon for rotation.");
        }

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

        return Object.freeze({
          rotated: true,
          alreadyRotated: false,
          activationCode: issued.activationCode,
          activationCodeExpiresAt: issued.activationCodeMetadata.expiresAt,
          maxRedemptions: 1
        });
      });
    }
  };
}

module.exports = {
  ROTATED_CODE_LIFETIME_MS,
  StagingPosActivationCodeRotationError,
  createStagingPosActivationCodeRotationService,
  recognizeCompletedRotation
};
