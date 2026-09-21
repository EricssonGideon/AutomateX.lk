const SENSITIVE_FIELD_PATTERN = /(password|token|secret|hash|authorization|cookie|api[-_]?key|reset|credential|activation[-_]?code|private[-_]?key|private[-_]?jwk|expected[-_]?public[-_]?jwk|signing[-_]?key|raw[-_]?request|mongo(?:db)?[-_]?uri|rate[-_]?limit.*(?:uri|password|token))/i;
const RUNTIME_SECRET_NAMES = Object.freeze([
  "MONGO_URI",
  "MONGODB_URI",
  "POS_LICENSING_SIGNING_PRIVATE_JWK_B64",
  "POS_LICENSING_EXPECTED_PUBLIC_JWK",
  "POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_TOKEN",
  "POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_TOKEN",
  "POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_TOKEN",
  "POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN",
  "POS_LICENSING_STAGING_TEST_LICENCE_APPLY_TOKEN",
  "POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_TOKEN",
  "POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_TOKEN",
  "POS_LICENSING_RATE_LIMIT_STORE_URI",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "JWT_SECRET"
]);
const REDACTED = "[REDACTED]";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runtimeSecretValues(env = process.env) {
  return RUNTIME_SECRET_NAMES
    .map((name) => String(env && env[name] || ""))
    .filter((value) => value.length >= 8);
}

function sanitizeSensitiveText(value, options = {}) {
  let text = String(value || "");
  const secrets = [...runtimeSecretValues(options.env), ...(options.secretValues || [])]
    .map((secret) => String(secret || ""))
    .filter((secret) => secret.length >= 8);
  [...new Set(secrets)].forEach((secret) => {
    text = text.replace(new RegExp(escapeRegExp(secret), "g"), REDACTED);
  });

  text = text
    .replace(/\b(?:mongodb(?:\+srv)?|rediss?):\/\/[^\s"'<>]+/gi, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, REDACTED)
    .replace(/\bpos(?:rc|ac)_[A-Za-z0-9_-]{8,}/g, REDACTED)
    .replace(/((?:POS_LICENSING_(?:SIGNING_PRIVATE_JWK_B64|RATE_LIMIT_STORE_URI)|UPSTASH_REDIS_REST_(?:URL|TOKEN))\s*[=:]\s*)[^\s,;]+/gi, `$1${REDACTED}`);

  if (/"crv"\s*:\s*"Ed25519"/i.test(text) && /"kty"\s*:\s*"OKP"/i.test(text)) {
    text = text.replace(/("d"\s*:\s*")[^"]+("?)/gi, `$1${REDACTED}$2`);
  }
  return text;
}

function sanitizeSensitiveValue(value, options = {}, depth = 0) {
  if (value === null || typeof value === "undefined") {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (["number", "boolean"].includes(typeof value)) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeSensitiveText(value, options);
  }
  if (depth >= 5) {
    return "[summary truncated]";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSensitiveValue(entry, options, depth + 1));
  }
  if (typeof value === "object") {
    const plain = typeof value.toObject === "function" ? value.toObject() : value;
    return Object.keys(plain).reduce((sanitized, key) => {
      if (!SENSITIVE_FIELD_PATTERN.test(key)) {
        sanitized[key] = sanitizeSensitiveValue(plain[key], options, depth + 1);
      }
      return sanitized;
    }, {});
  }
  return sanitizeSensitiveText(value, options);
}

module.exports = {
  REDACTED,
  SENSITIVE_FIELD_PATTERN,
  sanitizeSensitiveText,
  sanitizeSensitiveValue
};
