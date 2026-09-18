const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const PosActivationCode = require("../models/PosActivationCode");
const PosLicence = require("../models/PosLicence");
const PosPackage = require("../models/PosPackage");
const {
  digestActivationCode,
  generateActivationCode
} = require("../utils/posActivationCodeToken");
const {
  assertNoRawCredentialFields,
  sanitizeLicenceAuditMetadata,
  serializePosActivationCode,
  validateActivationCodePolicy,
  validateLicencePackageConsistency,
  validatePosLicencePolicy
} = require("../utils/posLicencePolicy");
const {
  hasPermission
} = require("../middleware/auth");
const { REQUIRED_POS_TRANSACTION_OPTIONS } = require("../licensing/posLicensingTransactions");

const LICENCE_VIEW_PERMISSION = "licences:view";
const LICENCE_MANAGE_PERMISSION = "licences:manage";
const APPROVED_LICENCE_STATUS = "active";
const PUBLISHED_PACKAGE_STATUS = "active";
const ISSUE_INPUT_FIELDS = Object.freeze(["expiresAt", "maxRedemptions"]);
const REVOKE_INPUT_FIELDS = Object.freeze([]);
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
  "licenceId",
  "codeHash",
  "digest",
  "activationCode",
  "rawActivationCode",
  "code",
  "renewalSecret",
  "renewalCredential",
  "rawRenewalCredential",
  "privateKey",
  "signingKey",
  "rawRequestBody",
  "redeemedCount",
  "lastRedeemedAt"
]);

class PosActivationCodeAdminServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.name = "PosActivationCodeAdminServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function createDefaultRepositories() {
  return {
    posActivationCodes: PosActivationCode,
    posLicences: PosLicence,
    posPackages: PosPackage
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

function cleanText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function assertAuthorizedActor(actor, permission) {
  if (!actor || actor.role !== "admin" || !hasPermission(actor, permission)) {
    throw new PosActivationCodeAdminServiceError(403, "forbidden", "A trusted administrator is required to administer POS activation codes.");
  }
  if (!actor.id) {
    throw new PosActivationCodeAdminServiceError(403, "forbidden", "Trusted administrator identity is missing.");
  }
}

function pickAllowedInput(input, allowedFields) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PosActivationCodeAdminServiceError(400, "validation_failed", "POS activation-code input must be an object.");
  }

  try {
    assertNoRawCredentialFields(input);
  } catch (error) {
    throw new PosActivationCodeAdminServiceError(400, "protected_field", error.message);
  }

  const protectedFields = Object.keys(input).filter((field) => PROTECTED_INPUT_FIELDS.includes(field));
  if (protectedFields.length) {
    throw new PosActivationCodeAdminServiceError(
      400,
      "protected_field",
      `Protected POS activation-code fields cannot be supplied: ${protectedFields.join(", ")}.`
    );
  }

  const allowed = new Set(allowedFields);
  const unknownFields = Object.keys(input).filter((field) => !allowed.has(field));
  if (unknownFields.length) {
    throw new PosActivationCodeAdminServiceError(
      400,
      "unknown_field",
      `Unknown POS activation-code fields cannot be supplied: ${unknownFields.join(", ")}.`
    );
  }

  return allowedFields.reduce((picked, field) => {
    if (hasOwn(input, field)) {
      picked[field] = input[field];
    }
    return picked;
  }, {});
}

function normalizeDateInput(value) {
  if (!value) {
    throw new PosActivationCodeAdminServiceError(400, "validation_failed", "Activation-code expiry is required.");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PosActivationCodeAdminServiceError(400, "validation_failed", "Activation-code expiry must be a valid date.");
  }
  return date;
}

function normalizeRedemptionLimit(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new PosActivationCodeAdminServiceError(400, "validation_failed", "Activation-code redemption limit must be a positive integer.");
  }
  return number;
}

function normalizeIssueInput(input) {
  const picked = pickAllowedInput(input, ISSUE_INPUT_FIELDS);
  return {
    expiresAt: normalizeDateInput(picked.expiresAt),
    maxRedemptions: normalizeRedemptionLimit(picked.maxRedemptions)
  };
}

function normalizeRevokeInput(input) {
  pickAllowedInput(input || {}, REVOKE_INPUT_FIELDS);
  return {};
}

function throwPolicyErrors(errors) {
  const filtered = errors.filter(Boolean);
  if (filtered.length) {
    throw new PosActivationCodeAdminServiceError(400, "validation_failed", "POS activation-code validation failed.", { errors: filtered });
  }
}

function nowFrom(clock) {
  return typeof clock === "function" ? clock() : new Date();
}

function assertCodeExpiryAllowed(expiresAt, licence, now) {
  if (expiresAt.getTime() <= now.getTime()) {
    throw new PosActivationCodeAdminServiceError(400, "validation_failed", "Activation-code expiry must be in the future.");
  }

  const licenceExpiry = licence && licence.licenceExpiry ? new Date(licence.licenceExpiry) : null;
  if (licenceExpiry && expiresAt.getTime() > licenceExpiry.getTime()) {
    throw new PosActivationCodeAdminServiceError(400, "validation_failed", "Activation-code expiry must not exceed the licence expiry.");
  }
}

async function readById(repository, id, options = {}) {
  const query = repository.findById(id);
  if (query && typeof query.session === "function" && options.session) {
    return query.session(options.session);
  }
  return query;
}

async function findMany(repository, query, options = {}) {
  let cursor = repository.find(query);
  if (cursor && typeof cursor.sort === "function") {
    cursor = cursor.sort(options.sort || { createdAt: -1, _id: -1 });
  }
  if (cursor && typeof cursor.skip === "function") {
    cursor = cursor.skip(options.skip || 0);
  }
  if (cursor && typeof cursor.limit === "function") {
    cursor = cursor.limit(options.limit || 25);
  }
  if (cursor && typeof cursor.session === "function" && options.session) {
    cursor = cursor.session(options.session);
  }
  if (cursor && typeof cursor.lean === "function") {
    return cursor.lean();
  }
  return await cursor || [];
}

async function countDocuments(repository, query) {
  if (typeof repository.countDocuments === "function") {
    return repository.countDocuments(query);
  }
  return 0;
}

function positiveInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    return fallback;
  }
  return Math.min(number, max);
}

async function listRecords(repository, query, serializer, options = {}) {
  const page = positiveInteger(options.page, 1, 1000);
  const limit = positiveInteger(options.limit, 25, 100);
  const skip = (page - 1) * limit;
  const [records, total] = await Promise.all([
    findMany(repository, query, { sort: { createdAt: -1, _id: -1 }, skip, limit }),
    countDocuments(repository, query)
  ]);

  return {
    records: records.map(serializer),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

function serializeActivationCode(record) {
  return {
    ...serializePosActivationCode(record),
    version: Number.isInteger(record && record.__v) ? record.__v : 0
  };
}

async function writeLicenceAudit(auditLogger, actor, payload, options = {}) {
  const metadata = sanitizeLicenceAuditMetadata({
    action: payload.action,
    actorId: actor.id,
    actorEmail: actor.email || "",
    actorRole: actor.role,
    targetType: payload.targetType,
    targetId: payload.targetId,
    licenceId: payload.licenceId,
    activationCodeId: payload.activationCodeId,
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

async function assertEligibleLicence(repositories, licenceId, options = {}) {
  const licence = await readById(repositories.posLicences, licenceId, options);
  if (!licence) {
    throw new PosActivationCodeAdminServiceError(404, "not_found", "POS licence could not be found.");
  }
  if (licence.status !== APPROVED_LICENCE_STATUS) {
    throw new PosActivationCodeAdminServiceError(409, "licence_not_eligible", "Activation codes can only be issued for admin-approved active POS licences.");
  }

  const posPackage = licence.packageId ? await readById(repositories.posPackages, licence.packageId, options) : null;
  if (!posPackage || posPackage.status !== PUBLISHED_PACKAGE_STATUS) {
    throw new PosActivationCodeAdminServiceError(409, "package_not_published", "Activation codes require a published active POS package.");
  }
  throwPolicyErrors([
    ...validatePosLicencePolicy(licence, { requireIssuable: true }),
    ...validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true })
  ]);

  return { licence, posPackage };
}

function createDefaultTransactionRunner() {
  return async function runInTransaction(callback) {
    if (!mongoose.connection || typeof mongoose.connection.startSession !== "function") {
      throw new PosActivationCodeAdminServiceError(503, "transaction_unavailable", "MongoDB transactions are required for POS activation-code issuance.");
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
        if (error instanceof PosActivationCodeAdminServiceError) {
          throw error;
        }
        if (!error || typeof error.hasErrorLabel !== "function" || !error.hasErrorLabel("TransientTransactionError")) {
          break;
        }
      } finally {
        await session.endSession();
      }
    }
    throw new PosActivationCodeAdminServiceError(
      503,
      "transaction_failed",
      "POS activation-code transaction failed."
    );
  };
}

function createPosActivationCodeAdminService(options = {}) {
  const repositories = options.repositories || createDefaultRepositories();
  const auditLogger = options.auditLogger || createDefaultAuditLogger();
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner();
  const generateCode = options.generateCode || generateActivationCode;
  const clock = options.clock || (() => new Date());

  return {
    async issueActivationCode(actor, licenceId, input) {
      assertAuthorizedActor(actor, LICENCE_MANAGE_PERMISSION);
      const fields = normalizeIssueInput(input);
      const now = nowFrom(clock);

      let plaintextCode = "";
      let savedRecord = null;
      await runInTransaction(async (session) => {
        const { licence } = await assertEligibleLicence(repositories, licenceId, { session });
        assertCodeExpiryAllowed(fields.expiresAt, licence, now);
        plaintextCode = generateCode();
        const codeHash = digestActivationCode(plaintextCode);
        const candidate = {
          licenceId,
          codeHash,
          status: "active",
          expiresAt: fields.expiresAt,
          maxRedemptions: fields.maxRedemptions,
          redeemedCount: 0,
          createdBy: actor.id,
          updatedBy: actor.id
        };
        throwPolicyErrors(validateActivationCodePolicy(candidate, { requireIssuable: true }));

        const created = await repositories.posActivationCodes.create([candidate], { session });
        savedRecord = created[0];
        await writeLicenceAudit(auditLogger, actor, {
          action: "licences.activation-code.issue",
          targetType: "PosActivationCode",
          targetId: idText(savedRecord._id || savedRecord.id),
          licenceId,
          activationCodeId: idText(savedRecord._id || savedRecord.id),
          outcome: "success",
          changeSummary: "expiresAt, maxRedemptions"
        }, { session });
      });

      return {
        activationCode: plaintextCode,
        activationCodeMetadata: serializeActivationCode(savedRecord)
      };
    },

    async listActivationCodes(actor, options = {}) {
      assertAuthorizedActor(actor, LICENCE_VIEW_PERMISSION);
      const filters = options.filters || {};
      const query = {};
      if (filters.licenceId) {
        query.licenceId = String(filters.licenceId);
      }
      if (filters.status) {
        query.status = cleanText(filters.status, 40).toLowerCase();
      }
      const result = await listRecords(repositories.posActivationCodes, query, serializeActivationCode, options);
      return { activationCodes: result.records, pagination: result.pagination };
    },

    async revokeUnusedActivationCode(actor, activationCodeId, input = {}) {
      assertAuthorizedActor(actor, LICENCE_MANAGE_PERMISSION);
      normalizeRevokeInput(input);

      let revokedRecord = null;
      await runInTransaction(async (session) => {
        revokedRecord = await repositories.posActivationCodes.findOneAndUpdate(
          { _id: activationCodeId, status: "active", redeemedCount: 0 },
          { $set: { status: "revoked", updatedBy: actor.id }, $inc: { __v: 1 } },
          { new: true, runValidators: true, session }
        );

        if (!revokedRecord) {
          const existing = await readById(repositories.posActivationCodes, activationCodeId, { session });
          if (!existing) {
            throw new PosActivationCodeAdminServiceError(404, "not_found", "POS activation code could not be found.");
          }
          if (existing.status === "revoked") {
            throw new PosActivationCodeAdminServiceError(409, "already_revoked", "POS activation code is already revoked.");
          }
          if (existing.status === "redeemed" || Number(existing.redeemedCount || 0) > 0) {
            throw new PosActivationCodeAdminServiceError(409, "already_redeemed", "Redeemed POS activation codes cannot be revoked as unused.");
          }
          throw new PosActivationCodeAdminServiceError(409, "not_unused", "Only unused active POS activation codes can be revoked.");
        }

        await writeLicenceAudit(auditLogger, actor, {
          action: "licences.activation-code.revoke-unused",
          targetType: "PosActivationCode",
          targetId: idText(revokedRecord._id || revokedRecord.id),
          licenceId: idText(revokedRecord.licenceId),
          activationCodeId: idText(revokedRecord._id || revokedRecord.id),
          outcome: "success",
          changeSummary: "status"
        }, { session });
      });

      return { activationCodeMetadata: serializeActivationCode(revokedRecord) };
    }
  };
}

module.exports = {
  APPROVED_LICENCE_STATUS,
  ISSUE_INPUT_FIELDS,
  PUBLISHED_PACKAGE_STATUS,
  PosActivationCodeAdminServiceError,
  createDefaultRepositories,
  createPosActivationCodeAdminService
};
