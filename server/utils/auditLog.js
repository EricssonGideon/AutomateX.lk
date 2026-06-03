const AuditLog = require("../models/AuditLog");

const { AUDIT_MODULES, AUDIT_SEVERITIES } = AuditLog;

const SENSITIVE_KEY_PATTERN = /(password|token|secret|hash|authorization|cookie|api[-_]?key|reset)/i;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 30;

function truncateString(value) {
  const text = String(value || "");
  return text.length > MAX_STRING_LENGTH ? `${text.slice(0, MAX_STRING_LENGTH)}...` : text;
}

function safeSummary(value, depth = 0) {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (["number", "boolean"].includes(typeof value)) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (depth >= 3) {
    return "[summary truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => safeSummary(item, depth + 1));
  }

  if (typeof value === "object") {
    const plain = typeof value.toObject === "function" ? value.toObject() : value;
    return Object.keys(plain)
      .filter((key) => !SENSITIVE_KEY_PATTERN.test(key))
      .slice(0, MAX_OBJECT_KEYS)
      .reduce((summary, key) => {
        summary[key] = safeSummary(plain[key], depth + 1);
        return summary;
      }, {});
  }

  return truncateString(value);
}

function getRequestIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || req.ip || req.socket && req.socket.remoteAddress || "";
}

async function logAdminAction(req, payload = {}) {
  try {
    const user = req && req.user ? req.user : {};
    const moduleName = AUDIT_MODULES.includes(payload.module) ? payload.module : "Other";
    const severity = AUDIT_SEVERITIES.includes(payload.severity) ? payload.severity : "Low";

    await AuditLog.create({
      actorId: user.id || null,
      actorName: user.name || payload.actorName || "",
      actorEmail: user.email || payload.actorEmail || "",
      actorRole: user.role || payload.actorRole || "",
      action: truncateString(payload.action || "admin.action"),
      module: moduleName,
      targetType: truncateString(payload.targetType || ""),
      targetId: truncateString(payload.targetId || ""),
      targetLabel: truncateString(payload.targetLabel || ""),
      oldValue: safeSummary(payload.oldValue),
      newValue: safeSummary(payload.newValue),
      ipAddress: truncateString(getRequestIp(req)),
      userAgent: truncateString(req && req.get ? req.get("user-agent") || "" : ""),
      severity
    });
  } catch (error) {
    console.warn("Audit logging failed:", error.message || error);
  }
}

module.exports = {
  AUDIT_MODULES,
  AUDIT_SEVERITIES,
  logAdminAction,
  safeSummary
};
