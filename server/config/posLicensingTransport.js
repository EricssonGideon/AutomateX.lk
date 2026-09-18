const net = require("node:net");
const proxyaddr = require("proxy-addr");

const PROXY_TRUST_MODES = Object.freeze(["direct", "cidr"]);
const UNIVERSAL_PROXY_RANGES = new Set(["0.0.0.0/0", "::/0", "all", "*"]);
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

class PosLicensingTransportConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PosLicensingTransportConfigurationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PosLicensingTransportConfigurationError(code, message);
}

function clean(value) {
  return String(value || "").trim();
}

function required(env, name) {
  const value = clean(env && env[name]);
  if (!value) {
    fail("missing_transport_configuration", `Required POS licensing transport configuration is missing: ${name}.`);
  }
  return value;
}

function validateApprovedHostname(value, label) {
  const hostname = clean(value).toLowerCase();
  if (!hostname || hostname.includes("*") || net.isIP(hostname) !== 0 || !HOSTNAME_PATTERN.test(hostname) || hostname === "localhost" || hostname.endsWith(".localhost")) {
    fail("approved_hostname_invalid", `${label} must be an explicit non-local DNS hostname.`);
  }
  return hostname;
}

function validateHttpsOrigin(value, label) {
  const origin = clean(value);
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    fail("https_origin_invalid", `${label} must be an explicit HTTPS origin.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    origin !== parsed.origin ||
    parsed.hostname.includes("*")
  ) {
    fail("https_origin_invalid", `${label} must be an origin-only HTTPS URL without credentials.`);
  }
  const hostname = validateApprovedHostname(parsed.hostname, `${label} hostname`);
  return Object.freeze({ origin: parsed.origin, hostname });
}

function parseHttpsOriginAllowlist(value, label, { allowNone = false } = {}) {
  const text = clean(value);
  if (allowNone && text.toLowerCase() === "none") {
    return Object.freeze([]);
  }
  const entries = text.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length || entries.includes("*")) {
    fail("cors_allowlist_invalid", `${label} must use explicit HTTPS origins.`);
  }
  return Object.freeze([...new Set(entries.map((entry) => validateHttpsOrigin(entry, label).origin))]);
}

function validateCorsPolicy(options = {}) {
  const allowedOrigins = Array.isArray(options.allowedOrigins) ? options.allowedOrigins : [];
  if (allowedOrigins.some((origin) => origin === "*" || /\*/.test(origin))) {
    fail(
      options.credentials ? "wildcard_credentials_forbidden" : "cors_allowlist_invalid",
      "Wildcard CORS origins are not permitted for POS licensing."
    );
  }
  return Object.freeze({
    allowedOrigins: Object.freeze([...new Set(allowedOrigins)]),
    credentials: options.credentials === true
  });
}

function resolvePosProxyTrustConfiguration(env = process.env, options = {}) {
  const requiredConfiguration = options.required === true;
  const mode = clean(env.POS_LICENSING_PROXY_TRUST_MODE).toLowerCase();
  if (!mode || mode === "unresolved") {
    if (requiredConfiguration) {
      fail("proxy_trust_unresolved", "POS licensing proxy trust must be explicitly configured.");
    }
    return Object.freeze({
      configured: false,
      mode: "unresolved",
      ranges: Object.freeze([]),
      expressTrust: false,
      trusts() { return false; }
    });
  }
  if (!PROXY_TRUST_MODES.includes(mode)) {
    fail("proxy_trust_invalid", "POS licensing proxy trust mode must be direct or cidr.");
  }
  const ranges = clean(env.POS_LICENSING_TRUSTED_PROXY_CIDRS)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (mode === "direct") {
    if (ranges.length) {
      fail("proxy_trust_invalid", "Direct POS transport must not declare trusted proxy ranges.");
    }
    return Object.freeze({
      configured: true,
      mode,
      ranges: Object.freeze([]),
      expressTrust: false,
      trusts() { return false; }
    });
  }
  if (!ranges.length || ranges.some((range) => UNIVERSAL_PROXY_RANGES.has(range.toLowerCase()))) {
    fail("proxy_trust_invalid", "CIDR proxy trust requires explicit bounded proxy ranges.");
  }
  let trust;
  try {
    trust = proxyaddr.compile(ranges);
  } catch {
    fail("proxy_trust_invalid", "One or more trusted proxy CIDR values are invalid.");
  }
  return Object.freeze({
    configured: true,
    mode,
    ranges: Object.freeze([...ranges]),
    expressTrust: trust,
    trusts(address) {
      try {
        return trust(String(address || ""), 0);
      } catch {
        return false;
      }
    }
  });
}

function validatePosLicensingTransportConfiguration(env, environment, machineApiOrigin) {
  if (!["production", "staging"].includes(environment)) {
    fail("transport_environment_invalid", "POS licensing transport requires production or staging identity.");
  }
  const productionHostname = validateApprovedHostname(
    required(env, "POS_LICENSING_PRODUCTION_HOSTNAME"),
    "The production POS licensing hostname"
  );
  const stagingHostname = validateApprovedHostname(
    required(env, "POS_LICENSING_STAGING_HOSTNAME"),
    "The staging POS licensing hostname"
  );
  if (productionHostname === stagingHostname) {
    fail("hostname_environment_collision", "Production and staging POS licensing hostnames must be distinct.");
  }
  const machineOrigin = validateHttpsOrigin(machineApiOrigin, "The POS machine API origin");
  const approvedHostname = environment === "production" ? productionHostname : stagingHostname;
  if (machineOrigin.hostname !== approvedHostname) {
    fail("machine_origin_hostname_mismatch", "The POS machine API origin must match its approved environment hostname.");
  }

  const proxy = resolvePosProxyTrustConfiguration(env, { required: true });
  const applicationOrigins = parseHttpsOriginAllowlist(
    required(env, "ALLOWED_ORIGINS"),
    "The Company System CORS allowlist"
  );
  const productionAdminOrigins = parseHttpsOriginAllowlist(
    required(env, "POS_LICENSING_PRODUCTION_ADMIN_ORIGINS"),
    "The production POS Control CORS allowlist"
  );
  const stagingAdminOrigins = parseHttpsOriginAllowlist(
    required(env, "POS_LICENSING_STAGING_ADMIN_ORIGINS"),
    "The staging POS Control CORS allowlist"
  );
  if (productionAdminOrigins.some((origin) => stagingAdminOrigins.includes(origin))) {
    fail("admin_origin_environment_collision", "Production and staging POS Control origins must be disjoint.");
  }
  const adminOrigins = environment === "production" ? productionAdminOrigins : stagingAdminOrigins;
  if (adminOrigins.some((origin) => !applicationOrigins.includes(origin))) {
    fail("admin_origin_not_application_approved", "Every POS Control origin must also be approved by the Company System CORS allowlist.");
  }
  const machineOrigins = parseHttpsOriginAllowlist(
    required(env, "POS_LICENSING_MACHINE_ALLOWED_ORIGINS"),
    "The POS machine CORS allowlist",
    { allowNone: true }
  );
  if (machineOrigins.length) {
    fail("machine_browser_cors_not_approved", "POS machine browser-origin access is not approved.");
  }

  return Object.freeze({
    environment,
    machineApiOrigin: machineOrigin.origin,
    approvedHostname,
    productionHostname,
    stagingHostname,
    hostnamesDistinct: true,
    proxy,
    cors: Object.freeze({
      application: validateCorsPolicy({ allowedOrigins: applicationOrigins, credentials: false }),
      admin: validateCorsPolicy({ allowedOrigins: adminOrigins, credentials: true }),
      productionAdminOrigins,
      stagingAdminOrigins,
      machine: validateCorsPolicy({ allowedOrigins: machineOrigins, credentials: false })
    })
  });
}

function isTrustedProxyRequest(req, proxy) {
  return proxy && proxy.mode === "cidr" && proxy.trusts(req && req.socket && req.socket.remoteAddress);
}

function requestUsesTrustedHttps(req, proxy) {
  if (req && req.socket && req.socket.encrypted === true) {
    return true;
  }
  if (!isTrustedProxyRequest(req, proxy)) {
    return false;
  }
  const forwardedProto = clean(req.headers && req.headers["x-forwarded-proto"]);
  return forwardedProto.toLowerCase() === "https" && !forwardedProto.includes(",");
}

function requestHostname(req, proxy) {
  const trustedProxy = isTrustedProxyRequest(req, proxy);
  const forwardedHost = clean(req && req.headers && req.headers["x-forwarded-host"]);
  const host = trustedProxy && forwardedHost ? forwardedHost : clean(req && req.headers && req.headers.host);
  if (!host || host.includes(",") || /[\s/@\\]/.test(host)) {
    return "";
  }
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function createPosTransportGuard(transport) {
  return function posTransportGuard(req, res, next) {
    if (!requestUsesTrustedHttps(req, transport && transport.proxy)) {
      return res.status(403).json({ message: "Secure POS licensing transport is required." });
    }
    if (requestHostname(req, transport.proxy) !== transport.approvedHostname) {
      return res.status(421).json({ message: "POS licensing request host is not approved." });
    }
    return next();
  };
}

function createStrictCorsMiddleware(policy, options = {}) {
  const validated = validateCorsPolicy(policy);
  const allowed = new Set(validated.allowedOrigins);
  const methods = options.methods || "GET, POST, PATCH, OPTIONS";
  const headers = options.headers || "Content-Type, Accept, X-CSRF-Token";
  return function strictCors(req, res, next) {
    const origin = clean(req && typeof req.get === "function" ? req.get("origin") : req && req.headers && req.headers.origin);
    if (!origin) {
      return next();
    }
    if (!allowed.has(origin)) {
      return res.status(403).json({ message: "Origin not allowed by CORS." });
    }
    res.vary("Origin");
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", methods);
    res.set("Access-Control-Allow-Headers", headers);
    if (validated.credentials) {
      res.set("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      res.set("Cache-Control", "no-store");
      return res.status(204).send();
    }
    return next();
  };
}

module.exports = {
  PROXY_TRUST_MODES,
  PosLicensingTransportConfigurationError,
  createPosTransportGuard,
  createStrictCorsMiddleware,
  parseHttpsOriginAllowlist,
  requestHostname,
  requestUsesTrustedHttps,
  resolvePosProxyTrustConfiguration,
  validateApprovedHostname,
  validateCorsPolicy,
  validateHttpsOrigin,
  validatePosLicensingTransportConfiguration
};
