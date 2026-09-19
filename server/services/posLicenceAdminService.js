const User = require("../models/User");
const Project = require("../models/Project");
const AuditLog = require("../models/AuditLog");
const PosPackage = require("../models/PosPackage");
const PosLicence = require("../models/PosLicence");
const {
  POS_EDITION_STANDARD,
  normalizeStandardModuleIds
} = require("../utils/posLicenceContract");
const {
  assertNoRawCredentialFields,
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

const POS_PROJECT_TYPE = "POS System";
const LICENCE_VIEW_PERMISSION = "licences:view";
const LICENCE_MANAGE_PERMISSION = "licences:manage";

const PACKAGE_INPUT_FIELDS = Object.freeze([
  "packageCode",
  "name",
  "edition",
  "moduleIds",
  "updateChannels",
  "notes"
]);

const LICENCE_INPUT_FIELDS = Object.freeze([
  "clientId",
  "projectId",
  "packageId",
  "edition",
  "entitledModules",
  "updateChannel",
  "licenceExpiry",
  "supportExpiry",
  "offlineValidUntil",
  "maxInstallations",
  "notes"
]);

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
  "installationId",
  "activationCodeId",
  "issueId",
  "issue",
  "issues",
  "licenceIssue",
  "licenceIssues",
  "codeHash",
  "renewalCredentialHash",
  "activationCount",
  "paymentStatus",
  "accountStatus",
  "signedLicenceStatus"
]);

class PosLicenceAdminServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.name = "PosLicenceAdminServiceError";
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
      if (options.session) {
        const records = await AuditLog.create([entry], options);
        return records[0];
      }
      return AuditLog.create(entry);
    }
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
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

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function positiveInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    return fallback;
  }
  return Math.min(number, max);
}

function normalizeDateInput(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PosLicenceAdminServiceError(400, "validation_failed", "POS licence dates must be valid dates.");
  }

  return date;
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

function assertAuthorizedActor(actor, permission) {
  if (!actor || actor.role !== "admin" || !hasPermission(actor, permission)) {
    throw new PosLicenceAdminServiceError(403, "forbidden", "A trusted administrator is required to administer POS licences.");
  }

  if (!actor.id) {
    throw new PosLicenceAdminServiceError(403, "forbidden", "Trusted administrator identity is missing.");
  }
}

function pickAllowedInput(input, allowedFields) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PosLicenceAdminServiceError(400, "validation_failed", "POS licence input must be an object.");
  }

  try {
    assertNoRawCredentialFields(input);
  } catch (error) {
    throw new PosLicenceAdminServiceError(400, "protected_field", error.message);
  }

  const allowed = new Set(allowedFields);
  const protectedFields = Object.keys(input).filter((field) => PROTECTED_INPUT_FIELDS.includes(field));
  if (protectedFields.length) {
    throw new PosLicenceAdminServiceError(
      400,
      "protected_field",
      `Protected POS licence fields cannot be supplied: ${protectedFields.join(", ")}.`
    );
  }

  const unknownFields = Object.keys(input).filter((field) => !allowed.has(field));
  if (unknownFields.length) {
    throw new PosLicenceAdminServiceError(
      400,
      "unknown_field",
      `Unknown POS licence fields cannot be supplied: ${unknownFields.join(", ")}.`
    );
  }

  return allowedFields.reduce((picked, field) => {
    if (hasOwn(input, field)) {
      picked[field] = input[field];
    }
    return picked;
  }, {});
}

function normalizePackageInput(input) {
  const picked = pickAllowedInput(input, PACKAGE_INPUT_FIELDS);
  const output = {};

  if (hasOwn(picked, "packageCode")) {
    output.packageCode = cleanText(picked.packageCode, 80).toLowerCase();
  }
  if (hasOwn(picked, "name")) {
    output.name = cleanText(picked.name, 160);
  }
  if (hasOwn(picked, "edition")) {
    output.edition = cleanText(picked.edition, 40).toLowerCase();
  }
  if (hasOwn(picked, "moduleIds")) {
    output.moduleIds = picked.moduleIds;
  }
  if (hasOwn(picked, "updateChannels")) {
    output.updateChannels = Array.isArray(picked.updateChannels)
      ? [...new Set(picked.updateChannels.map((channel) => cleanText(channel, 40).toLowerCase()).filter(Boolean))]
      : picked.updateChannels;
  }
  if (hasOwn(picked, "notes")) {
    output.notes = cleanText(picked.notes);
  }

  return output;
}

function normalizeLicenceInput(input) {
  const picked = pickAllowedInput(input, LICENCE_INPUT_FIELDS);
  const output = {};

  ["clientId", "projectId", "packageId"].forEach((field) => {
    if (hasOwn(picked, field)) {
      output[field] = picked[field] ? String(picked[field]) : null;
    }
  });

  if (hasOwn(picked, "edition")) {
    output.edition = cleanText(picked.edition, 40).toLowerCase();
  }
  if (hasOwn(picked, "entitledModules")) {
    output.entitledModules = picked.entitledModules;
  }
  if (hasOwn(picked, "updateChannel")) {
    output.updateChannel = cleanText(picked.updateChannel, 40).toLowerCase();
  }
  if (hasOwn(picked, "licenceExpiry")) {
    output.licenceExpiry = normalizeDateInput(picked.licenceExpiry);
  }
  if (hasOwn(picked, "supportExpiry")) {
    output.supportExpiry = normalizeDateInput(picked.supportExpiry);
  }
  if (hasOwn(picked, "offlineValidUntil")) {
    output.offlineValidUntil = normalizeDateInput(picked.offlineValidUntil);
  }
  if (hasOwn(picked, "maxInstallations")) {
    const value = Number(picked.maxInstallations);
    if (!Number.isInteger(value) || value < 1) {
      throw new PosLicenceAdminServiceError(400, "validation_failed", "POS licence maxInstallations must be a positive integer.");
    }
    output.maxInstallations = value;
  }
  if (hasOwn(picked, "notes")) {
    output.notes = cleanText(picked.notes);
  }

  return output;
}

function throwPolicyErrors(errors) {
  const filtered = errors.filter(Boolean);
  if (filtered.length) {
    throw new PosLicenceAdminServiceError(400, "validation_failed", "POS licence validation failed.", { errors: filtered });
  }
}

function assertRequiredPackageFields(candidate) {
  const errors = [];
  if (!candidate.packageCode) {
    errors.push("Draft POS packages require an explicit package code.");
  }
  if (!candidate.name) {
    errors.push("Draft POS packages require an explicit package name.");
  }
  throwPolicyErrors(errors);
}

function assertRequiredLicenceFields(candidate) {
  const errors = [];
  if (!candidate.clientId) {
    errors.push("Draft POS licences require an existing client.");
  }
  throwPolicyErrors(errors);
}

function packagePersistenceFields(candidate) {
  return {
    packageCode: candidate.packageCode,
    name: candidate.name,
    edition: candidate.edition,
    status: candidate.status,
    moduleIds: candidate.moduleIds,
    updateChannels: candidate.updateChannels,
    notes: candidate.notes
  };
}

function licencePersistenceFields(candidate) {
  return {
    clientId: candidate.clientId,
    projectId: candidate.projectId || null,
    packageId: candidate.packageId || null,
    edition: candidate.edition,
    status: candidate.status,
    entitledModules: candidate.entitledModules,
    updateChannel: candidate.updateChannel,
    licenceExpiry: candidate.licenceExpiry || null,
    supportExpiry: candidate.supportExpiry || null,
    offlineValidUntil: candidate.offlineValidUntil || null,
    maxInstallations: candidate.maxInstallations || null,
    notes: candidate.notes
  };
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

async function findOne(repository, query, options = {}) {
  if (!repository || typeof repository.findOne !== "function") {
    return null;
  }
  const result = repository.findOne(query);
  if (result && typeof result.session === "function" && options.session) {
    return result.session(options.session);
  }
  return result;
}

async function exists(repository, query) {
  if (!repository) {
    return false;
  }
  if (typeof repository.exists === "function") {
    return Boolean(await repository.exists(query));
  }
  if (typeof repository.countDocuments === "function") {
    return Number(await repository.countDocuments(query)) > 0;
  }
  return Boolean(await findOne(repository, query));
}

async function countDocuments(repository, query) {
  if (typeof repository.countDocuments === "function") {
    return repository.countDocuments(query);
  }
  return 0;
}

async function findMany(repository, query, options = {}) {
  const queryResult = repository.find(query);
  if (queryResult && typeof queryResult.sort === "function") {
    let cursor = queryResult.sort(options.sort || { createdAt: -1, _id: -1 });
    if (typeof cursor.skip === "function") {
      cursor = cursor.skip(options.skip || 0);
    }
    if (typeof cursor.limit === "function") {
      cursor = cursor.limit(options.limit || 25);
    }
    if (typeof cursor.lean === "function") {
      return cursor.lean();
    }
    return cursor;
  }
  return [];
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || /duplicate/i.test(String(error.message || "")));
}

function createChangeSummary(input) {
  return Object.keys(input || {}).sort().join(", ");
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
    packageId: payload.packageId,
    outcome: payload.outcome,
    reason: payload.reason,
    changeSummary: payload.changeSummary,
    createdAt: new Date().toISOString()
  });

  try {
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
      severity: "Low"
    }, options);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: "Persistence succeeded, but licence audit logging failed.",
      error: error && error.message ? error.message : "Unknown audit failure."
    };
  }
}

function packageReadiness(posPackage) {
  const errors = [];
  if (!posPackage) {
    return { ready: false, errors: ["POS package could not be found."] };
  }
  if (posPackage.status !== "draft") {
    errors.push("Only draft POS packages can be checked for draft issuance readiness in this service.");
  }
  errors.push(...validatePosPackagePolicy(posPackage, { requireIssuable: true }));
  return { ready: errors.length === 0, errors };
}

function licenceReadiness(licence, references = {}) {
  const errors = [];
  if (!licence) {
    return { ready: false, errors: ["POS licence could not be found."] };
  }
  if (licence.status !== "draft") {
    errors.push("Only draft POS licences can be checked for draft issuance readiness in this service.");
  }
  if (!licence.projectId) {
    errors.push("Issuable POS licences require a POS project.");
  }
  errors.push(...validatePosLicencePolicy(licence, { requireIssuable: true }));
  errors.push(...validateLicenceReferences(licence, references, { requireProject: true }));
  if (references.posPackage) {
    errors.push(...validateLicencePackageConsistency(licence, references.posPackage, { requireIssuable: true }));
  }
  return { ready: errors.length === 0, errors };
}

function validateLicenceReferences(licence, references = {}, options = {}) {
  const errors = [];
  const clientId = idText(licence.clientId);
  const projectId = idText(licence.projectId);
  const packageId = idText(licence.packageId);

  if (!clientId) {
    errors.push("POS licence requires an existing client.");
  } else if (!references.client) {
    errors.push("Referenced POS licence client could not be found.");
  } else if (references.client.role !== "client") {
    errors.push("Referenced POS licence user must be a client account.");
  }

  if (projectId || options.requireProject) {
    if (!projectId) {
      errors.push("POS licence requires an existing POS project.");
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
  }

  if (packageId && !references.posPackage) {
    errors.push("Referenced POS package could not be found.");
  }

  if (!packageId && ((licence.entitledModules || []).length || licence.updateChannel)) {
    errors.push("A selected POS package is required before validating entitlement modules or update channel.");
  }

  return errors;
}

function normalizePackageCandidate(record) {
  return {
    ...record,
    edition: record.edition || POS_EDITION_STANDARD,
    status: record.status || "draft",
    moduleIds: normalizeStandardModuleIds(record.moduleIds || []),
    updateChannels: Array.isArray(record.updateChannels) ? [...record.updateChannels] : []
  };
}

function normalizeLicenceCandidate(record) {
  return {
    ...record,
    edition: record.edition || POS_EDITION_STANDARD,
    status: record.status || "draft",
    entitledModules: normalizeStandardModuleIds(record.entitledModules || []),
    updateChannel: cleanText(record.updateChannel, 40).toLowerCase()
  };
}

async function loadLicenceReferences(repositories, licence, options = {}) {
  const clientId = idText(licence.clientId);
  const projectId = idText(licence.projectId);
  const packageId = idText(licence.packageId);

  return {
    client: clientId ? await readById(repositories.users, clientId, options) : null,
    project: projectId || options.requireProject ? await readById(repositories.projects, projectId, options) : null,
    posPackage: packageId ? await readById(repositories.posPackages, packageId, options) : null
  };
}

function assertExpectedVersion(expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new PosLicenceAdminServiceError(428, "precondition_required", "A non-negative integer expectedVersion is required for draft updates.");
  }
}

function assertDraft(record, typeName) {
  if (!record) {
    throw new PosLicenceAdminServiceError(404, "not_found", `${typeName} could not be found.`);
  }
  if (record.status !== "draft") {
    throw new PosLicenceAdminServiceError(409, "not_draft", `Only draft ${typeName.toLowerCase()} records can be updated.`);
  }
}

async function assertPackageCodeAvailable(repositories, packageCode, currentId = "", options = {}) {
  if (!packageCode) {
    return;
  }

  const existing = await findOne(repositories.posPackages, { packageCode }, options);
  if (existing && idText(existing._id || existing.id) !== currentId) {
    throw new PosLicenceAdminServiceError(409, "duplicate_package_code", "A POS package with this code already exists.");
  }
}

function buildPackageListQuery(filters = {}) {
  const query = {};
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.edition) {
    query.edition = filters.edition;
  }
  if (filters.updateChannel) {
    query.updateChannels = filters.updateChannel;
  }
  if (filters.moduleId) {
    query.moduleIds = filters.moduleId;
  }
  return query;
}

function buildLicenceListQuery(filters = {}) {
  const query = {};
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.edition) {
    query.edition = filters.edition;
  }
  if (filters.clientId) {
    query.clientId = filters.clientId;
  }
  if (filters.projectId) {
    query.projectId = filters.projectId;
  }
  if (filters.packageId) {
    query.packageId = filters.packageId;
  }
  if (filters.updateChannel) {
    query.updateChannel = filters.updateChannel;
  }
  return query;
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

function createPosLicenceAdminService(options = {}) {
  const repositories = options.repositories || createDefaultRepositories();
  const auditLogger = options.auditLogger || createDefaultAuditLogger();

  return {
    async createDraftPackage(actor, input, optionsForCreate = {}) {
      assertAuthorizedActor(actor, LICENCE_MANAGE_PERMISSION);
      const fields = normalizePackageInput(input);
      const candidate = normalizePackageCandidate({
        ...fields,
        edition: fields.edition || POS_EDITION_STANDARD,
        status: "draft",
        createdBy: actor.id,
        updatedBy: actor.id
      });

      assertRequiredPackageFields(candidate);
      throwPolicyErrors(validatePosPackagePolicy({ ...candidate, moduleIds: fields.moduleIds || [] }));
      await assertPackageCodeAvailable(repositories, candidate.packageCode, "", optionsForCreate);

      try {
        const created = optionsForCreate.session
          ? await repositories.posPackages.create([candidate], { session: optionsForCreate.session })
          : await repositories.posPackages.create(candidate);
        const record = Array.isArray(created) ? created[0] : created;
        const audit = await writeLicenceAudit(auditLogger, actor, {
          action: "licences.package.create-draft",
          targetType: "PosPackage",
          targetId: idText(record._id || record.id),
          packageId: idText(record._id || record.id),
          outcome: "success",
          changeSummary: createChangeSummary(fields)
        }, optionsForCreate);

        return { package: serializePackage(record), readiness: packageReadiness(record), audit };
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new PosLicenceAdminServiceError(409, "duplicate_package_code", "A POS package with this code already exists.");
        }
        throw error;
      }
    },

    async updateDraftPackage(actor, packageId, input, optionsForUpdate = {}) {
      assertAuthorizedActor(actor, LICENCE_MANAGE_PERMISSION);
      assertExpectedVersion(optionsForUpdate.expectedVersion);
      const fields = normalizePackageInput(input);
      const current = await readById(repositories.posPackages, packageId);
      assertDraft(current, "POS package");
      const currentRecord = toPlainRecord(current);

      if (versionOf(current) !== optionsForUpdate.expectedVersion) {
        throw new PosLicenceAdminServiceError(409, "stale_update", "POS package was changed by another writer.");
      }

      if (await exists(repositories.posLicences, { packageId, status: { $ne: "draft" } })) {
        throw new PosLicenceAdminServiceError(
          409,
          "package_in_use",
          "This POS package is already used by a non-draft licence. Create a future package version instead."
        );
      }

      if (fields.packageCode && fields.packageCode !== current.packageCode) {
        await assertPackageCodeAvailable(repositories, fields.packageCode, idText(currentRecord._id || currentRecord.id));
      }

      const rawCandidate = { ...currentRecord, ...fields };
      const candidate = normalizePackageCandidate(rawCandidate);
      assertRequiredPackageFields(candidate);
      throwPolicyErrors(validatePosPackagePolicy(rawCandidate));

      const updated = await repositories.posPackages.findOneAndUpdate(
        { _id: packageId, status: "draft", __v: optionsForUpdate.expectedVersion },
        { $set: { ...packagePersistenceFields(candidate), updatedBy: actor.id }, $inc: { __v: 1 } },
        { new: true, runValidators: true }
      );

      if (!updated) {
        throw new PosLicenceAdminServiceError(409, "stale_update", "POS package was changed by another writer.");
      }

      const audit = await writeLicenceAudit(auditLogger, actor, {
        action: "licences.package.update-draft",
        targetType: "PosPackage",
        targetId: idText(updated._id || updated.id),
        packageId: idText(updated._id || updated.id),
        outcome: "success",
        changeSummary: createChangeSummary(fields)
      });

      return { package: serializePackage(updated), readiness: packageReadiness(updated), audit };
    },

    async createDraftLicence(actor, input, optionsForCreate = {}) {
      assertAuthorizedActor(actor, LICENCE_MANAGE_PERMISSION);
      const fields = normalizeLicenceInput(input);
      const candidate = normalizeLicenceCandidate({
        ...fields,
        edition: fields.edition || POS_EDITION_STANDARD,
        status: "draft",
        createdBy: actor.id,
        updatedBy: actor.id
      });
      const references = await loadLicenceReferences(repositories, candidate, optionsForCreate);

      assertRequiredLicenceFields(candidate);
      throwPolicyErrors([
        ...validatePosLicencePolicy({ ...candidate, entitledModules: fields.entitledModules || [] }),
        ...validateLicenceReferences(candidate, references)
      ]);
      if (references.posPackage) {
        throwPolicyErrors(validateLicencePackageConsistency(candidate, references.posPackage));
      }

      const created = optionsForCreate.session
        ? await repositories.posLicences.create([candidate], { session: optionsForCreate.session })
        : await repositories.posLicences.create(candidate);
      const record = Array.isArray(created) ? created[0] : created;
      const audit = await writeLicenceAudit(auditLogger, actor, {
        action: "licences.licence.create-draft",
        targetType: "PosLicence",
        targetId: idText(record._id || record.id),
        licenceId: idText(record._id || record.id),
        packageId: idText(record.packageId),
        outcome: "success",
        changeSummary: createChangeSummary(fields)
      }, optionsForCreate);

      return { licence: serializeLicence(record), readiness: licenceReadiness(record, references), audit };
    },

    async updateDraftLicence(actor, licenceId, input, optionsForUpdate = {}) {
      assertAuthorizedActor(actor, LICENCE_MANAGE_PERMISSION);
      assertExpectedVersion(optionsForUpdate.expectedVersion);
      const fields = normalizeLicenceInput(input);
      const current = await readById(repositories.posLicences, licenceId);
      assertDraft(current, "POS licence");
      const currentRecord = toPlainRecord(current);

      if (versionOf(current) !== optionsForUpdate.expectedVersion) {
        throw new PosLicenceAdminServiceError(409, "stale_update", "POS licence was changed by another writer.");
      }

      const rawCandidate = { ...currentRecord, ...fields };
      const candidate = normalizeLicenceCandidate(rawCandidate);
      const references = await loadLicenceReferences(repositories, candidate);

      assertRequiredLicenceFields(candidate);
      throwPolicyErrors([
        ...validatePosLicencePolicy(rawCandidate),
        ...validateLicenceReferences(candidate, references)
      ]);
      if (references.posPackage) {
        throwPolicyErrors(validateLicencePackageConsistency(candidate, references.posPackage));
      }

      const updated = await repositories.posLicences.findOneAndUpdate(
        { _id: licenceId, status: "draft", __v: optionsForUpdate.expectedVersion },
        { $set: { ...licencePersistenceFields(candidate), updatedBy: actor.id }, $inc: { __v: 1 } },
        { new: true, runValidators: true }
      );

      if (!updated) {
        throw new PosLicenceAdminServiceError(409, "stale_update", "POS licence was changed by another writer.");
      }

      const audit = await writeLicenceAudit(auditLogger, actor, {
        action: "licences.licence.update-draft",
        targetType: "PosLicence",
        targetId: idText(updated._id || updated.id),
        licenceId: idText(updated._id || updated.id),
        packageId: idText(updated.packageId),
        outcome: "success",
        changeSummary: createChangeSummary(fields)
      });

      return { licence: serializeLicence(updated), readiness: licenceReadiness(updated, references), audit };
    },

    async validateDraftPackageReadiness(actor, packageId) {
      assertAuthorizedActor(actor, LICENCE_VIEW_PERMISSION);
      const record = await readById(repositories.posPackages, packageId);
      if (!record) {
        throw new PosLicenceAdminServiceError(404, "not_found", "POS package could not be found.");
      }
      return { package: serializePackage(record), readiness: packageReadiness(record) };
    },

    async getPackage(actor, packageId) {
      assertAuthorizedActor(actor, LICENCE_VIEW_PERMISSION);
      const record = await readById(repositories.posPackages, packageId);
      if (!record) {
        throw new PosLicenceAdminServiceError(404, "not_found", "POS package could not be found.");
      }
      return { package: serializePackage(record) };
    },

    async listPackages(actor, options = {}) {
      assertAuthorizedActor(actor, LICENCE_VIEW_PERMISSION);
      const result = await listRecords(
        repositories.posPackages,
        buildPackageListQuery(options.filters),
        serializePackage,
        options
      );
      return { packages: result.records, pagination: result.pagination };
    },

    async validateDraftLicenceReadiness(actor, licenceId) {
      assertAuthorizedActor(actor, LICENCE_VIEW_PERMISSION);
      const record = await readById(repositories.posLicences, licenceId);
      if (!record) {
        throw new PosLicenceAdminServiceError(404, "not_found", "POS licence could not be found.");
      }
      const references = await loadLicenceReferences(repositories, record, { requireProject: true });
      return { licence: serializeLicence(record), readiness: licenceReadiness(record, references) };
    },

    async getLicence(actor, licenceId) {
      assertAuthorizedActor(actor, LICENCE_VIEW_PERMISSION);
      const record = await readById(repositories.posLicences, licenceId);
      if (!record) {
        throw new PosLicenceAdminServiceError(404, "not_found", "POS licence could not be found.");
      }
      return { licence: serializeLicence(record) };
    },

    async listLicences(actor, options = {}) {
      assertAuthorizedActor(actor, LICENCE_VIEW_PERMISSION);
      const result = await listRecords(
        repositories.posLicences,
        buildLicenceListQuery(options.filters),
        serializeLicence,
        options
      );
      return { licences: result.records, pagination: result.pagination };
    }
  };
}

module.exports = {
  LICENCE_MANAGE_PERMISSION,
  LICENCE_VIEW_PERMISSION,
  POS_PROJECT_TYPE,
  PosLicenceAdminServiceError,
  createDefaultRepositories,
  createPosLicenceAdminService
};
