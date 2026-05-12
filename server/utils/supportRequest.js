const REQUEST_TYPE_OPTIONS = ["support", "upgrade", "bug", "feature", "payment", "general"];
const REQUEST_PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"];
const REQUEST_STATUS_OPTIONS = ["open", "in_progress", "resolved", "rejected", "closed"];
const REQUEST_PACKAGE_OPTIONS = ["starter", "standard", "pro", "custom"];
const REQUEST_TERMINAL_STATUSES = ["resolved", "rejected", "closed"];

function normalizeRequestText(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeRequestType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return REQUEST_TYPE_OPTIONS.includes(normalized) ? normalized : "support";
}

function normalizeRequestPriority(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return REQUEST_PRIORITY_OPTIONS.includes(normalized) ? normalized : "normal";
}

function normalizeRequestStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return REQUEST_STATUS_OPTIONS.includes(normalized) ? normalized : "open";
}

function normalizeRequestedPackage(value) {
  if (value === null || value === "" || typeof value === "undefined") {
    return null;
  }

  const normalized = String(value || "").trim().toLowerCase();
  return REQUEST_PACKAGE_OPTIONS.includes(normalized) ? normalized : null;
}

function applyResolvedTimestamp(record, nextStatus) {
  if (REQUEST_TERMINAL_STATUSES.includes(nextStatus)) {
    record.resolvedAt = record.resolvedAt || new Date();
    return;
  }

  record.resolvedAt = null;
}

function serializeSupportRequest(request, options = {}) {
  const source = request && typeof request.toObject === "function"
    ? request.toObject()
    : request || {};
  const includeAdminFields = options.includeAdminFields === true;

  return {
    id: String(source._id || source.id || ""),
    _id: source._id || source.id || "",
    clientId: source.clientId ? String(source.clientId) : "",
    clientName: source.clientName || "",
    clientEmail: source.clientEmail || "",
    businessName: source.businessName || "",
    type: normalizeRequestType(source.type),
    requestedPackage: normalizeRequestedPackage(source.requestedPackage),
    subject: source.subject || "",
    message: source.message || "",
    priority: normalizeRequestPriority(source.priority),
    status: normalizeRequestStatus(source.status),
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
    resolvedAt: source.resolvedAt || null,
    ...(includeAdminFields ? { adminNote: source.adminNote || "" } : {})
  };
}

module.exports = {
  REQUEST_TYPE_OPTIONS,
  REQUEST_PRIORITY_OPTIONS,
  REQUEST_STATUS_OPTIONS,
  REQUEST_PACKAGE_OPTIONS,
  REQUEST_TERMINAL_STATUSES,
  normalizeRequestText,
  normalizeRequestType,
  normalizeRequestPriority,
  normalizeRequestStatus,
  normalizeRequestedPackage,
  applyResolvedTimestamp,
  serializeSupportRequest
};
