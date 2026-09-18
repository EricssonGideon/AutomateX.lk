const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosLicence = require("../models/PosLicence");
const PosPackage = require("../models/PosPackage");
const Project = require("../models/Project");
const User = require("../models/User");
const {
  sanitizeLicenceAuditMetadata,
  serializePosLicence,
  serializePosPackage,
  validateLicencePackageConsistency,
  validatePosLicencePolicy,
  validatePosPackagePolicy
} = require("../utils/posLicencePolicy");
const {
  hasPermission
} = require("../middleware/auth");
const { assertNoPosLicensingServerSecretFields } = require("../config/posLicensingSecrets");
const { REQUIRED_POS_TRANSACTION_OPTIONS } = require("../licensing/posLicensingTransactions");

const POS_PROJECT_TYPE = "POS System";
const LICENCE_MANAGE_PERMISSION = "licences:manage";
const DRAFT_STATE = "draft";
const PUBLISHED_PACKAGE_STATE = "active";
const APPROVED_LICENCE_STATE = "active";
const TRANSITION_INPUT_FIELDS = Object.freeze(["expectedVersion", "reason"]);
const PROTECTED_INPUT_FIELDS = Object.freeze([
  "_id",
  "id",
  "__v",
  "status",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "actor",
  "actorId",
  "actorRole",
  "actorEmail",
  "permissions",
  "permission",
  "roles",
  "audit",
  "auditActor",
  "readiness",
  "moduleIds",
  "entitledModules",
  "updateChannels",
  "updateChannel",
  "licenceExpiry",
  "supportExpiry",
  "packageCode",
  "edition",
  "clientId",
  "projectId",
  "packageId",
  "paymentStatus",
  "accountStatus",
  "activationCode",
  "codeHash",
  "renewalCredential",
  "renewalCredentialHash",
  "privateKey",
  "signingKey"
]);

class PosLicenceLifecycleServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.name = "PosLicenceLifecycleServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function createDefaultRepositories() {
  return {
    users: User,
    projects: Project,
    posPackages: PosPackage,
    posLicences: PosLicence
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

function toPlainRecord(record) {
  if (!record) {
    return null;
  }
  if (typeof record.toObject === "function") {
    return record.toObject();
  }
  return { ...record };
}

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function serializePackage(record) {
  return {
    ...serializePosPackage(record),
    notes: record.notes || "",
    version: versionOf(record)
  };
}

function serializeLicence(record) {
  return {
    ...serializePosLicence(record),
    notes: record.notes || "",
    version: versionOf(record)
  };
}

function assertAuthorizedActor(actor) {
  if (!actor || actor.role !== "admin" || !hasPermission(actor, LICENCE_MANAGE_PERMISSION)) {
    throw new PosLicenceLifecycleServiceError(403, "forbidden", "A trusted administrator is required to publish POS packages and approve POS licences.");
  }
  if (!actor.id) {
    throw new PosLicenceLifecycleServiceError(403, "forbidden", "Trusted administrator identity is missing.");
  }
}

function normalizeTransitionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PosLicenceLifecycleServiceError(400, "validation_failed", "POS licence transition input must be an object.");
  }
  try {
    assertNoPosLicensingServerSecretFields(input);
  } catch (error) {
    throw new PosLicenceLifecycleServiceError(400, "protected_field", error.message);
  }

  const protectedFields = Object.keys(input).filter((field) => PROTECTED_INPUT_FIELDS.includes(field));
  if (protectedFields.length) {
    throw new PosLicenceLifecycleServiceError(
      400,
      "protected_field",
      `Protected POS licence transition fields cannot be supplied: ${protectedFields.join(", ")}.`
    );
  }

  const allowed = new Set(TRANSITION_INPUT_FIELDS);
  const unknownFields = Object.keys(input).filter((field) => !allowed.has(field));
  if (unknownFields.length) {
    throw new PosLicenceLifecycleServiceError(
      400,
      "unknown_field",
      `Unknown POS licence transition fields cannot be supplied: ${unknownFields.join(", ")}.`
    );
  }

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new PosLicenceLifecycleServiceError(428, "precondition_required", "A non-negative integer expectedVersion is required.");
  }

  return {
    expectedVersion: input.expectedVersion,
    reason: hasOwn(input, "reason") ? cleanText(input.reason) : ""
  };
}

function throwPolicyErrors(errors) {
  const filtered = errors.filter(Boolean);
  if (filtered.length) {
    throw new PosLicenceLifecycleServiceError(400, "validation_failed", "POS licence lifecycle validation failed.", { errors: filtered });
  }
}

async function readById(repository, id, options = {}) {
  if (!id) {
    return null;
  }
  const query = repository.findById(id);
  if (query && typeof query.session === "function" && options.session) {
    return query.session(options.session);
  }
  return query;
}

function createDefaultTransactionRunner() {
  return async function runInTransaction(callback) {
    if (!mongoose.connection || typeof mongoose.connection.startSession !== "function") {
      throw new PosLicenceLifecycleServiceError(503, "transaction_unavailable", "MongoDB transactions are required for POS licence lifecycle transitions.");
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
        if (error instanceof PosLicenceLifecycleServiceError) {
          throw error;
        }
        if (!error || typeof error.hasErrorLabel !== "function" || !error.hasErrorLabel("TransientTransactionError")) {
          break;
        }
      } finally {
        await session.endSession();
      }
    }

    throw new PosLicenceLifecycleServiceError(503, "transaction_failed", "POS licence lifecycle transaction failed.");
  };
}

async function writeLifecycleAudit(auditLogger, actor, payload, options = {}) {
  const metadata = sanitizeLicenceAuditMetadata({
    action: payload.action,
    actorId: actor.id,
    actorEmail: actor.email || "",
    actorRole: actor.role,
    targetType: payload.targetType,
    targetId: payload.targetId,
    licenceId: payload.licenceId,
    packageId: payload.packageId,
    outcome: payload.outcome,
    reason: payload.reason,
    changeSummary: payload.changeSummary,
    createdAt: new Date().toISOString()
  });

  await auditLogger.create({
    actorId: actor.id,
    actorName: actor.name || "",
    actorEmail: actor.email || "",
    actorRole: actor.role,
    action: payload.action,
    module: "Licences",
    targetType: payload.targetType,
    targetId: payload.targetId,
    targetLabel: "",
    oldValue: null,
    newValue: metadata,
    severity: "Medium"
  }, options);
}

function validateLicenceReferences(licence, references = {}) {
  const errors = [];
  const clientId = idText(licence.clientId);

  if (!clientId) {
    errors.push("Approved POS licences require an existing client.");
  } else if (!references.client) {
    errors.push("Referenced POS licence client could not be found.");
  } else if (references.client.role !== "client") {
    errors.push("Referenced POS licence user must be a client account.");
  }

  if (!licence.projectId) {
    errors.push("Approved POS licences require an existing POS project.");
  } else if (!references.project) {
    errors.push("Referenced POS project could not be found.");
  } else {
    if (idText(references.project.clientId) !== clientId) {
      errors.push("Referenced POS project must belong to the selected client.");
    }
    if (references.project.projectType !== POS_PROJECT_TYPE) {
      errors.push("Referenced project must be a POS System project.");
    }
  }

  if (!licence.packageId) {
    errors.push("Approved POS licences require a published package.");
  } else if (!references.posPackage) {
    errors.push("Referenced POS package could not be found.");
  } else if (references.posPackage.status !== PUBLISHED_PACKAGE_STATE) {
    errors.push("Approved POS licences require a published active package.");
  }

  return errors;
}

function validateLicenceDates(licence, now) {
  const errors = [];
  const licenceExpiry = licence.licenceExpiry ? new Date(licence.licenceExpiry) : null;
  if (!licenceExpiry || Number.isNaN(licenceExpiry.getTime())) {
    errors.push("Approved POS licences require an explicit valid licence expiry.");
  } else if (licenceExpiry.getTime() <= now.getTime()) {
    errors.push("Approved POS licences require unexpired licence validity.");
  }
  return errors;
}

async function loadLicenceReferences(repositories, licence, options = {}) {
  return {
    client: licence.clientId ? await readById(repositories.users, licence.clientId, options) : null,
    project: licence.projectId ? await readById(repositories.projects, licence.projectId, options) : null,
    posPackage: licence.packageId ? await readById(repositories.posPackages, licence.packageId, options) : null
  };
}

function createPosLicenceLifecycleService(options = {}) {
  const repositories = options.repositories || createDefaultRepositories();
  const auditLogger = options.auditLogger || createDefaultAuditLogger();
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner();
  const clock = options.clock || (() => new Date());

  return {
    async publishDraftPackage(actor, packageId, input) {
      assertAuthorizedActor(actor);
      const transition = normalizeTransitionInput(input);

      let publishedRecord = null;
      await runInTransaction(async (session) => {
        const current = await readById(repositories.posPackages, packageId, { session });
        if (!current) {
          throw new PosLicenceLifecycleServiceError(404, "not_found", "POS package could not be found.");
        }
        if (current.status !== DRAFT_STATE) {
          throw new PosLicenceLifecycleServiceError(409, "not_draft", "Only draft POS packages can be published.");
        }
        if (versionOf(current) !== transition.expectedVersion) {
          throw new PosLicenceLifecycleServiceError(409, "stale_update", "POS package was changed by another writer.");
        }

        throwPolicyErrors(validatePosPackagePolicy({ ...toPlainRecord(current), status: PUBLISHED_PACKAGE_STATE }, { requireIssuable: true }));

        publishedRecord = await repositories.posPackages.findOneAndUpdate(
          { _id: packageId, status: DRAFT_STATE, __v: transition.expectedVersion },
          { $set: { status: PUBLISHED_PACKAGE_STATE, updatedBy: actor.id }, $inc: { __v: 1 } },
          { new: true, runValidators: true, session }
        );
        if (!publishedRecord) {
          throw new PosLicenceLifecycleServiceError(409, "stale_update", "POS package was changed by another writer.");
        }

        await writeLifecycleAudit(auditLogger, actor, {
          action: "licences.package.publish",
          targetType: "PosPackage",
          targetId: idText(publishedRecord._id || publishedRecord.id),
          packageId: idText(publishedRecord._id || publishedRecord.id),
          outcome: "success",
          reason: transition.reason,
          changeSummary: "status"
        }, { session });
      });

      return { package: serializePackage(publishedRecord) };
    },

    async approveDraftLicence(actor, licenceId, input) {
      assertAuthorizedActor(actor);
      const transition = normalizeTransitionInput(input);
      const now = clock();

      let approvedRecord = null;
      await runInTransaction(async (session) => {
        const current = await readById(repositories.posLicences, licenceId, { session });
        if (!current) {
          throw new PosLicenceLifecycleServiceError(404, "not_found", "POS licence could not be found.");
        }
        if (current.status !== DRAFT_STATE) {
          throw new PosLicenceLifecycleServiceError(409, "not_draft", "Only draft POS licences can be approved.");
        }
        if (versionOf(current) !== transition.expectedVersion) {
          throw new PosLicenceLifecycleServiceError(409, "stale_update", "POS licence was changed by another writer.");
        }

        const candidate = { ...toPlainRecord(current), status: APPROVED_LICENCE_STATE };
        const references = await loadLicenceReferences(repositories, candidate, { session });
        throwPolicyErrors([
          ...validatePosLicencePolicy(candidate, { requireIssuable: true }),
          ...validateLicenceReferences(candidate, references),
          ...validateLicenceDates(candidate, now),
          ...(references.posPackage ? validateLicencePackageConsistency(candidate, references.posPackage, { requireIssuable: true }) : [])
        ]);

        approvedRecord = await repositories.posLicences.findOneAndUpdate(
          { _id: licenceId, status: DRAFT_STATE, __v: transition.expectedVersion },
          { $set: { status: APPROVED_LICENCE_STATE, updatedBy: actor.id }, $inc: { __v: 1 } },
          { new: true, runValidators: true, session }
        );
        if (!approvedRecord) {
          throw new PosLicenceLifecycleServiceError(409, "stale_update", "POS licence was changed by another writer.");
        }

        await writeLifecycleAudit(auditLogger, actor, {
          action: "licences.licence.approve",
          targetType: "PosLicence",
          targetId: idText(approvedRecord._id || approvedRecord.id),
          licenceId: idText(approvedRecord._id || approvedRecord.id),
          packageId: idText(approvedRecord.packageId),
          outcome: "success",
          reason: transition.reason,
          changeSummary: "status"
        }, { session });
      });

      return { licence: serializeLicence(approvedRecord) };
    }
  };
}

module.exports = {
  APPROVED_LICENCE_STATE,
  DRAFT_STATE,
  PUBLISHED_PACKAGE_STATE,
  PosLicenceLifecycleServiceError,
  createDefaultRepositories,
  createPosLicenceLifecycleService
};
