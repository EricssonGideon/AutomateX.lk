const mongoose = require("mongoose");

const {
  POS_EDITION_STANDARD,
  isStandardModuleId,
  isStandardUpdateChannel
} = require("../utils/posLicenceContract");
const {
  POS_ACTIVATION_CODE_STATES,
  POS_LICENCE_STATES,
  POS_PACKAGE_STATES
} = require("../utils/posLicencePolicy");
const {
  PosLicenceAdminServiceError,
  createPosLicenceAdminService
} = require("../services/posLicenceAdminService");
const {
  PosActivationCodeAdminServiceError,
  createPosActivationCodeAdminService
} = require("../services/posActivationCodeAdminService");
const {
  PosLicenceLifecycleServiceError,
  createPosLicenceLifecycleService
} = require("../services/posLicenceLifecycleService");
const {
  sendError,
  sendSuccess
} = require("../utils/response");
const { sanitizeSensitiveText } = require("../utils/sensitiveData");

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;
const PACKAGE_FILTER_FIELDS = Object.freeze(["status", "edition", "updateChannel", "moduleId"]);
const LICENCE_FILTER_FIELDS = Object.freeze(["status", "edition", "clientId", "projectId", "packageId", "updateChannel"]);
const ACTIVATION_CODE_FILTER_FIELDS = Object.freeze(["status"]);
const PAGE_FIELDS = Object.freeze(["page", "limit"]);

const service = createPosLicenceAdminService();
const activationCodeService = createPosActivationCodeAdminService();
const lifecycleService = createPosLicenceLifecycleService();

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function hasOperatorKey(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.keys(value).some((key) => key.startsWith("$") || key.includes(".") || hasOperatorKey(value[key]));
}

function readScalar(value, fieldName) {
  if (Array.isArray(value) || value && typeof value === "object") {
    throw new PosLicenceAdminServiceError(400, "invalid_query", `${fieldName} must be a single scalar value.`);
  }
  return String(value || "").trim();
}

function parsePositiveInteger(value, fallback, max, fieldName) {
  if (typeof value === "undefined" || value === "") {
    return fallback;
  }

  const text = readScalar(value, fieldName);
  if (!/^\d+$/.test(text)) {
    throw new PosLicenceAdminServiceError(400, "invalid_query", `${fieldName} must be a positive integer.`);
  }

  return Math.min(Number(text), max);
}

function rejectUnknownQuery(query, allowedFilters) {
  if (hasOperatorKey(query)) {
    throw new PosLicenceAdminServiceError(400, "invalid_query", "MongoDB query operators are not accepted.");
  }

  const allowed = new Set([...allowedFilters, ...PAGE_FIELDS]);
  const unknown = Object.keys(query || {}).filter((field) => !allowed.has(field));
  if (unknown.length) {
    throw new PosLicenceAdminServiceError(400, "invalid_query", `Unsupported query filters: ${unknown.join(", ")}.`);
  }
}

function parseCommonListOptions(query, allowedFilters) {
  rejectUnknownQuery(query, allowedFilters);
  return {
    page: parsePositiveInteger(query.page, 1, 1000, "page"),
    limit: parsePositiveInteger(query.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, "limit")
  };
}

function parsePackageFilters(query = {}) {
  const options = parseCommonListOptions(query, PACKAGE_FILTER_FIELDS);
  const filters = {};

  if (typeof query.status !== "undefined") {
    const status = readScalar(query.status, "status").toLowerCase();
    if (!POS_PACKAGE_STATES.includes(status)) {
      throw new PosLicenceAdminServiceError(400, "invalid_query", "Package status filter is not supported.");
    }
    filters.status = status;
  }
  if (typeof query.edition !== "undefined") {
    const edition = readScalar(query.edition, "edition").toLowerCase();
    if (edition !== POS_EDITION_STANDARD) {
      throw new PosLicenceAdminServiceError(400, "invalid_query", "Package edition filter is not supported.");
    }
    filters.edition = edition;
  }
  if (typeof query.updateChannel !== "undefined") {
    const updateChannel = readScalar(query.updateChannel, "updateChannel").toLowerCase();
    if (!isStandardUpdateChannel(updateChannel)) {
      throw new PosLicenceAdminServiceError(400, "invalid_query", "Package update channel filter is not supported.");
    }
    filters.updateChannel = updateChannel;
  }
  if (typeof query.moduleId !== "undefined") {
    const moduleId = readScalar(query.moduleId, "moduleId").toLowerCase();
    if (!isStandardModuleId(moduleId)) {
      throw new PosLicenceAdminServiceError(400, "invalid_query", "Package module filter is not supported.");
    }
    filters.moduleId = moduleId;
  }

  return { ...options, filters };
}

function parseLicenceFilters(query = {}) {
  const options = parseCommonListOptions(query, LICENCE_FILTER_FIELDS);
  const filters = {};

  if (typeof query.status !== "undefined") {
    const status = readScalar(query.status, "status").toLowerCase();
    if (!POS_LICENCE_STATES.includes(status)) {
      throw new PosLicenceAdminServiceError(400, "invalid_query", "Licence status filter is not supported.");
    }
    filters.status = status;
  }
  if (typeof query.edition !== "undefined") {
    const edition = readScalar(query.edition, "edition").toLowerCase();
    if (edition !== POS_EDITION_STANDARD) {
      throw new PosLicenceAdminServiceError(400, "invalid_query", "Licence edition filter is not supported.");
    }
    filters.edition = edition;
  }
  if (typeof query.updateChannel !== "undefined") {
    const updateChannel = readScalar(query.updateChannel, "updateChannel").toLowerCase();
    if (!isStandardUpdateChannel(updateChannel)) {
      throw new PosLicenceAdminServiceError(400, "invalid_query", "Licence update channel filter is not supported.");
    }
    filters.updateChannel = updateChannel;
  }

  ["clientId", "projectId", "packageId"].forEach((field) => {
    if (typeof query[field] !== "undefined") {
      const value = readScalar(query[field], field);
      if (!isValidObjectId(value)) {
        throw new PosLicenceAdminServiceError(400, "invalid_query", `${field} filter must be a valid ID.`);
      }
      filters[field] = value;
    }
  });

  return { ...options, filters };
}

function parseActivationCodeFilters(query = {}) {
  const options = parseCommonListOptions(query, ACTIVATION_CODE_FILTER_FIELDS);
  const filters = {};

  if (typeof query.status !== "undefined") {
    const status = readScalar(query.status, "status").toLowerCase();
    if (!POS_ACTIVATION_CODE_STATES.includes(status)) {
      throw new PosLicenceAdminServiceError(400, "invalid_query", "Activation-code status filter is not supported.");
    }
    filters.status = status;
  }

  return { ...options, filters };
}

function parseRecordId(req, paramName) {
  const value = String(req.params[paramName] || "").trim();
  if (!isValidObjectId(value)) {
    throw new PosLicenceAdminServiceError(400, "invalid_id", "Invalid POS licensing record ID.");
  }
  return value;
}

function parseTransitionBody(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PosLicenceAdminServiceError(400, "validation_failed", "POS licence transition input must be an object.");
  }
  return body;
}

function parseIssueActivationCodeBody(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PosLicenceAdminServiceError(400, "validation_failed", "POS activation-code input must be an object.");
  }
  return body;
}

function parseUpdateBody(body = {}) {
  const input = { ...(body || {}) };
  const rawExpectedVersion = input.expectedVersion;
  delete input.expectedVersion;

  if (!Number.isInteger(rawExpectedVersion) || rawExpectedVersion < 0) {
    throw new PosLicenceAdminServiceError(428, "precondition_required", "A non-negative integer expectedVersion is required.");
  }

  return { input, expectedVersion: rawExpectedVersion };
}

function withAuditWarning(payload) {
  if (!payload || !payload.audit || payload.audit.ok !== false) {
    return payload;
  }

  const sanitized = { ...payload };
  sanitized.audit = {
    ok: false,
    message: "Record was saved, but audit logging could not be confirmed."
  };
  sanitized.warnings = [
    {
      code: "audit_not_confirmed",
      message: "Record was saved, but audit logging could not be confirmed."
    }
  ];
  return sanitized;
}

function serviceErrorStatus(error) {
  if (
    (error instanceof PosLicenceAdminServiceError ||
      error instanceof PosActivationCodeAdminServiceError ||
      error instanceof PosLicenceLifecycleServiceError) &&
    Number.isInteger(error.statusCode)
  ) {
    return error.statusCode;
  }
  return 500;
}

function serviceErrorMessage(error) {
  if (
    error instanceof PosLicenceAdminServiceError ||
    error instanceof PosActivationCodeAdminServiceError ||
    error instanceof PosLicenceLifecycleServiceError
  ) {
    return sanitizeSensitiveText(error.message);
  }
  return "Unable to process the POS licensing request right now.";
}

function serviceErrorDetails(error) {
  if (
    (error instanceof PosLicenceAdminServiceError ||
      error instanceof PosActivationCodeAdminServiceError ||
      error instanceof PosLicenceLifecycleServiceError) &&
    Array.isArray(error.details && error.details.errors)
  ) {
    return error.details.errors.map((detail) => sanitizeSensitiveText(detail));
  }
  return [];
}

function handleControllerError(res, error) {
  return sendError(res, serviceErrorStatus(error), serviceErrorMessage(error), serviceErrorDetails(error));
}

function noStore(res) {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  return res;
}

async function listPackages(req, res) {
  try {
    return sendSuccess(res, 200, await service.listPackages(req.user, parsePackageFilters(req.query)));
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function publishDraftPackage(req, res) {
  try {
    noStore(res);
    return sendSuccess(
      res,
      200,
      await lifecycleService.publishDraftPackage(req.user, parseRecordId(req, "packageId"), parseTransitionBody(req.body))
    );
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function createDraftPackage(req, res) {
  try {
    return sendSuccess(res, 201, withAuditWarning(await service.createDraftPackage(req.user, req.body)));
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function getPackage(req, res) {
  try {
    return sendSuccess(res, 200, await service.getPackage(req.user, parseRecordId(req, "packageId")));
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function updateDraftPackage(req, res) {
  try {
    const { input, expectedVersion } = parseUpdateBody(req.body);
    return sendSuccess(
      res,
      200,
      withAuditWarning(await service.updateDraftPackage(req.user, parseRecordId(req, "packageId"), input, { expectedVersion }))
    );
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function checkPackageReadiness(req, res) {
  try {
    const result = await service.validateDraftPackageReadiness(req.user, parseRecordId(req, "packageId"));
    return sendSuccess(res, 200, {
      ...result,
      readinessNote: "Configuration readiness only. Signing keys, deployment, and activation infrastructure are not verified."
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function listLicences(req, res) {
  try {
    return sendSuccess(res, 200, await service.listLicences(req.user, parseLicenceFilters(req.query)));
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function createDraftLicence(req, res) {
  try {
    return sendSuccess(res, 201, withAuditWarning(await service.createDraftLicence(req.user, req.body)));
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function getLicence(req, res) {
  try {
    return sendSuccess(res, 200, await service.getLicence(req.user, parseRecordId(req, "licenceId")));
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function updateDraftLicence(req, res) {
  try {
    const { input, expectedVersion } = parseUpdateBody(req.body);
    return sendSuccess(
      res,
      200,
      withAuditWarning(await service.updateDraftLicence(req.user, parseRecordId(req, "licenceId"), input, { expectedVersion }))
    );
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function checkLicenceReadiness(req, res) {
  try {
    const result = await service.validateDraftLicenceReadiness(req.user, parseRecordId(req, "licenceId"));
    return sendSuccess(res, 200, {
      ...result,
      readinessNote: "Configuration readiness only. Signing keys, deployment, and activation infrastructure are not verified."
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function approveDraftLicence(req, res) {
  try {
    noStore(res);
    return sendSuccess(
      res,
      200,
      await lifecycleService.approveDraftLicence(req.user, parseRecordId(req, "licenceId"), parseTransitionBody(req.body))
    );
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function listActivationCodes(req, res) {
  try {
    noStore(res);
    const options = parseActivationCodeFilters(req.query);
    options.filters = {
      ...options.filters,
      licenceId: parseRecordId(req, "licenceId")
    };
    return sendSuccess(res, 200, await activationCodeService.listActivationCodes(req.user, options));
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function issueActivationCode(req, res) {
  try {
    noStore(res);
    return sendSuccess(
      res,
      201,
      await activationCodeService.issueActivationCode(
        req.user,
        parseRecordId(req, "licenceId"),
        parseIssueActivationCodeBody(req.body)
      )
    );
  } catch (error) {
    return handleControllerError(res, error);
  }
}

async function revokeUnusedActivationCode(req, res) {
  try {
    noStore(res);
    return sendSuccess(
      res,
      200,
      await activationCodeService.revokeUnusedActivationCode(req.user, parseRecordId(req, "activationCodeId"), req.body || {})
    );
  } catch (error) {
    return handleControllerError(res, error);
  }
}

module.exports = {
  ACTIVATION_CODE_FILTER_FIELDS,
  PACKAGE_FILTER_FIELDS,
  LICENCE_FILTER_FIELDS,
  approveDraftLicence,
  checkLicenceReadiness,
  checkPackageReadiness,
  createDraftLicence,
  createDraftPackage,
  getLicence,
  getPackage,
  issueActivationCode,
  listActivationCodes,
  listLicences,
  listPackages,
  parseActivationCodeFilters,
  parseLicenceFilters,
  parsePackageFilters,
  publishDraftPackage,
  revokeUnusedActivationCode,
  updateDraftLicence,
  updateDraftPackage
};
