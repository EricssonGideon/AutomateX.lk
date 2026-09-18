const crypto = require("node:crypto");
const { classifyRuntimeEnvironment } = require("./runtimeEnvironment");
const {
  loadPosLicensingServerSecrets
} = require("./posLicensingSecrets");
const {
  validatePosLicensingMongoConfiguration
} = require("./posLicensingMongo");
const {
  validateDistributedRateLimitConfiguration
} = require("../licensing/posLicensingRateLimit");
const {
  UPSTASH_REST_BACKEND,
  loadUpstashRestCredentials
} = require("../licensing/upstashRateLimitStore");
const {
  validatePosLicensingTransportConfiguration
} = require("./posLicensingTransport");

const APPROVED_PRODUCTION_KEY_ID = "automatex-pos-prod-ed25519-v1";
const POS_LICENSING_MODES = Object.freeze(["disabled", "development", "test", "staging", "production"]);
const REQUIRED_PRODUCTION_ENVIRONMENT_VARIABLES = Object.freeze([
  "AUTOMATEX_ENV",
  "POS_LICENSING_ENABLED",
  "MONGO_URI",
  "POS_LICENSING_DATABASE_NAME",
  "POS_LICENSING_ENVIRONMENT",
  "POS_LICENSING_CLIENT_SCOPE",
  "POS_LICENSING_SECRET_ENVIRONMENT",
  "POS_LICENSING_SECRET_SOURCE",
  "POS_LICENSING_SIGNING_PRIVATE_JWK_B64",
  "POS_LICENSING_EXPECTED_PUBLIC_JWK",
  "POS_LICENSING_SIGNING_KEY_ID",
  "POS_LICENSING_MACHINE_API_BASE_PATH",
  "POS_LICENSING_MACHINE_API_ORIGIN",
  "ALLOWED_ORIGINS",
  "POS_LICENSING_PRODUCTION_HOSTNAME",
  "POS_LICENSING_STAGING_HOSTNAME",
  "POS_LICENSING_PROXY_TRUST_MODE",
  "POS_LICENSING_PRODUCTION_ADMIN_ORIGINS",
  "POS_LICENSING_STAGING_ADMIN_ORIGINS",
  "POS_LICENSING_MACHINE_ALLOWED_ORIGINS",
  "POS_LICENSING_RATE_LIMIT_BACKEND",
  "POS_LICENSING_RATE_LIMIT_STORE_IDENTITY",
  "POS_LICENSING_RATE_LIMIT_NAMESPACE",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "POS_LICENSING_ACTIVATION_RATE_LIMIT",
  "POS_LICENSING_BOOTSTRAP_RATE_LIMIT",
  "POS_LICENSING_RENEWAL_RATE_LIMIT",
  "POS_LICENSING_RATE_LIMIT_WINDOW_MS",
  "POS_LICENSING_AUDIT_ENABLED",
  "POS_LICENSING_AUDIT_RETENTION",
  "POS_LICENSING_MONGODB_TRANSACTIONS_REQUIRED"
]);

class PosLicensingConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PosLicensingConfigurationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PosLicensingConfigurationError(code, message);
}

function clean(value) {
  return String(value || "").trim();
}

function required(env, name) {
  const value = clean(env && env[name]);
  if (!value) {
    fail("missing_configuration", `Required POS licensing configuration is missing: ${name}.`);
  }
  return value;
}

function parseRequiredTrue(env, name) {
  if (required(env, name).toLowerCase() !== "true") {
    fail("invalid_configuration", `${name} must be explicitly set to true for production POS licensing.`);
  }
  return true;
}

function parsePositiveInteger(env, name) {
  const text = required(env, name);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("invalid_configuration", `${name} must be a positive integer.`);
  }
  return value;
}

function parseJson(text, label) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("invalid_signing_key", `${label} must contain one JWK object.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof PosLicensingConfigurationError) {
      throw error;
    }
    fail("invalid_signing_key", `${label} is not valid JSON.`);
  }
}

function decodePrivateJwk(encoded) {
  const normalized = clean(encoded);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    fail("invalid_signing_key", "The production POS signing private JWK encoding is invalid.");
  }
  let decoded = "";
  try {
    const bytes = Buffer.from(normalized, "base64");
    if (bytes.toString("base64") !== normalized) {
      fail("invalid_signing_key", "The production POS signing private JWK encoding is invalid.");
    }
    decoded = bytes.toString("utf8");
  } catch {
    fail("invalid_signing_key", "The production POS signing private JWK encoding is invalid.");
  }
  return parseJson(decoded, "The production POS signing private JWK");
}

function assertJwkBase(jwk, label, { requirePrivate = false } = {}) {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519") {
    fail("invalid_signing_key", `${label} must be an OKP Ed25519 JWK.`);
  }
  if (!clean(jwk.x)) {
    fail("invalid_signing_key", `${label} must include the public x field.`);
  }
  if (requirePrivate && !clean(jwk.d)) {
    fail("invalid_signing_key", `${label} must include the private d field.`);
  }
  if (!requirePrivate && Object.prototype.hasOwnProperty.call(jwk, "d")) {
    fail("invalid_signing_key", `${label} must contain public verification material only.`);
  }
  if (jwk.alg && jwk.alg !== "EdDSA") {
    fail("invalid_signing_key", `${label} has an unsupported algorithm.`);
  }
}

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(clean(left), "utf8");
  const b = Buffer.from(clean(right), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSigningKeyProvider(secrets, keyId, environmentName) {
  const label = `${environmentName} POS signing private JWK`;
  const privateJwk = decodePrivateJwk(secrets.getSigningPrivateJwkB64());
  const expectedPublicJwk = parseJson(secrets.getExpectedPublicJwk(), `The expected ${environmentName} POS public JWK`);
  assertJwkBase(privateJwk, `The ${label}`, { requirePrivate: true });
  assertJwkBase(expectedPublicJwk, `The expected ${environmentName} POS public JWK`);

  if (privateJwk.kid && privateJwk.kid !== keyId) {
    fail("unapproved_key_id", "The private JWK key ID does not match the configured server key ID.");
  }
  if (expectedPublicJwk.kid && expectedPublicJwk.kid !== keyId) {
    fail("unapproved_key_id", "The expected public JWK key ID does not match the configured server key ID.");
  }

  let privateKey;
  let derivedPublicJwk;
  try {
    privateKey = crypto.createPrivateKey({ key: privateJwk, format: "jwk" });
    if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") {
      fail("invalid_signing_key", `The ${environmentName} POS signing key is not an Ed25519 private key.`);
    }
    derivedPublicJwk = crypto.createPublicKey(privateKey).export({ format: "jwk" });
  } catch (error) {
    if (error instanceof PosLicensingConfigurationError) {
      throw error;
    }
    fail("invalid_signing_key", `The ${environmentName} POS signing private JWK could not be loaded.`);
  }

  if (!timingSafeTextEqual(derivedPublicJwk.x, privateJwk.x)) {
    fail("signing_key_mismatch", `The ${environmentName} POS private JWK does not derive its declared public key.`);
  }
  if (!timingSafeTextEqual(derivedPublicJwk.x, expectedPublicJwk.x)) {
    fail("signing_key_mismatch", `The ${environmentName} POS signing key does not match the expected public verification key.`);
  }

  return Object.freeze({
    keyId,
    async getPrivateKey() {
      return privateKey;
    },
    async getPublicKey() {
      return crypto.createPublicKey(privateKey);
    }
  });
}

function loadProductionSigningKeyProvider(env = process.env) {
  const keyId = required(env, "POS_LICENSING_SIGNING_KEY_ID");
  if (keyId !== APPROVED_PRODUCTION_KEY_ID) {
    fail("unapproved_key_id", "The configured POS licensing signing key ID is not approved.");
  }
  const secrets = loadPosLicensingServerSecrets(env, {
    expectedEnvironment: "production",
    requiredNames: [
      "POS_LICENSING_SIGNING_PRIVATE_JWK_B64",
      "POS_LICENSING_EXPECTED_PUBLIC_JWK"
    ]
  });
  return createSigningKeyProvider(secrets, keyId, "production");
}

function assertSecureRateLimitStoreUri(storeUri, backend, environmentName) {
  let parsed;
  try {
    parsed = new URL(storeUri);
  } catch {
    fail("unsafe_rate_limit_backend", `${environmentName} POS rate-limit credentials require a valid server-only URI.`);
  }
  const localEndpoint = /localhost|127\.0\.0\.1|\[::1\]/i.test(parsed.hostname);
  const unsafeProtocol = ["http:", "file:"].includes(parsed.protocol) || backend === "redis" && parsed.protocol !== "rediss:";
  if (!parsed.hostname || localEndpoint || unsafeProtocol) {
    fail("unsafe_rate_limit_backend", `${environmentName} POS rate-limit credentials require a secure non-local backend URI.`);
  }
  return true;
}

function rateLimitSecretNames(backend) {
  return backend === UPSTASH_REST_BACKEND
    ? ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]
    : ["POS_LICENSING_RATE_LIMIT_STORE_URI"];
}

function validateRateLimitSecretConfiguration(env, secrets, backend, environmentName) {
  if (backend === UPSTASH_REST_BACKEND) {
    loadUpstashRestCredentials(env);
    return true;
  }
  return assertSecureRateLimitStoreUri(secrets.getRateLimitStoreUri(), backend, environmentName);
}

function validateProductionLicensingConfig(env = process.env) {
  const runtimeEnvironment = classifyRuntimeEnvironment(env);
  if (runtimeEnvironment.mode !== "production") {
    fail("invalid_environment", "Production POS licensing requires NODE_ENV=production.");
  }
  if (clean(env.POS_LICENSING_MODE).toLowerCase() !== "production") {
    fail("invalid_environment", "POS_LICENSING_MODE must be explicitly set to production.");
  }
  if (required(env, "POS_LICENSING_ENVIRONMENT").toLowerCase() !== "production") {
    fail("environment_mismatch", "POS_LICENSING_ENVIRONMENT must match the production runtime.");
  }
  if (required(env, "POS_LICENSING_CLIENT_SCOPE").toLowerCase() !== "production-only") {
    fail("unsafe_client_scope", "Production POS licensing requires an explicit production-only client scope.");
  }

  const mongo = validatePosLicensingMongoConfiguration(env, "production");
  let secrets = mongo.secrets;
  const databaseName = mongo.databaseName;

  const machineApiBasePath = required(env, "POS_LICENSING_MACHINE_API_BASE_PATH");
  if (!/^\/api\/pos-(?:licensing|machine)(?:\/|$)/.test(machineApiBasePath) || /admin|employee|client|public/i.test(machineApiBasePath)) {
    fail("unsafe_machine_api_base", "The POS machine API base path must use its isolated API namespace.");
  }
  const transport = validatePosLicensingTransportConfiguration(
    env,
    "production",
    required(env, "POS_LICENSING_MACHINE_API_ORIGIN")
  );

  const rateLimitBackend = required(env, "POS_LICENSING_RATE_LIMIT_BACKEND").toLowerCase();
  if (["memory", "local", "in-process", "none"].includes(rateLimitBackend)) {
    fail("unsafe_rate_limit_backend", "Production POS machine routes require a distributed rate-limit backend.");
  }
  secrets = loadPosLicensingServerSecrets(env, {
    expectedEnvironment: "production",
    requiredNames: ["MONGO_URI", ...rateLimitSecretNames(rateLimitBackend)]
  });
  validateRateLimitSecretConfiguration(env, secrets, rateLimitBackend, "Production");

  const auditRetention = required(env, "POS_LICENSING_AUDIT_RETENTION").toLowerCase();
  if (auditRetention !== "indefinite") {
    fail("unsafe_audit_configuration", "POS licensing audit retention must be explicitly set to indefinite.");
  }

  const keyId = required(env, "POS_LICENSING_SIGNING_KEY_ID");
  if (keyId !== APPROVED_PRODUCTION_KEY_ID) {
    fail("unapproved_key_id", "The configured POS licensing signing key ID is not approved.");
  }
  secrets = loadPosLicensingServerSecrets(env, {
    expectedEnvironment: "production",
    requiredNames: [
      "MONGO_URI",
      "POS_LICENSING_SIGNING_PRIVATE_JWK_B64",
      "POS_LICENSING_EXPECTED_PUBLIC_JWK",
      ...rateLimitSecretNames(rateLimitBackend)
    ]
  });
  const keyProvider = createSigningKeyProvider(secrets, keyId, "production");
  return Object.freeze({
    environment: "production",
    mode: "production",
    databaseName,
    mongo,
    clientScope: "production-only",
    keyId: keyProvider.keyId,
    keyProvider,
    secrets,
    machineApiBasePath,
    machineApiOrigin: transport.machineApiOrigin,
    approvedHostname: transport.approvedHostname,
    transport,
    allowedOrigins: transport.cors.machine.allowedOrigins,
    adminAllowedOrigins: transport.cors.admin.allowedOrigins,
    rateLimit: validateDistributedRateLimitConfiguration({
      backend: rateLimitBackend,
      storeIdentity: required(env, "POS_LICENSING_RATE_LIMIT_STORE_IDENTITY"),
      namespace: required(env, "POS_LICENSING_RATE_LIMIT_NAMESPACE"),
      windowMs: parsePositiveInteger(env, "POS_LICENSING_RATE_LIMIT_WINDOW_MS"),
      activationLimit: parsePositiveInteger(env, "POS_LICENSING_ACTIVATION_RATE_LIMIT"),
      bootstrapLimit: parsePositiveInteger(env, "POS_LICENSING_BOOTSTRAP_RATE_LIMIT"),
      renewalLimit: parsePositiveInteger(env, "POS_LICENSING_RENEWAL_RATE_LIMIT")
    }, "production"),
    audit: Object.freeze({
      enabled: parseRequiredTrue(env, "POS_LICENSING_AUDIT_ENABLED"),
      retention: auditRetention
    }),
    transactionsRequired: parseRequiredTrue(env, "POS_LICENSING_MONGODB_TRANSACTIONS_REQUIRED")
  });
}

function validateStagingLicensingConfig(env = process.env) {
  const runtimeEnvironment = classifyRuntimeEnvironment(env);
  if (runtimeEnvironment.mode !== "staging" || clean(env.POS_LICENSING_MODE).toLowerCase() !== "staging") {
    fail("environment_mismatch", "Staging POS licensing requires matching staging runtime and licensing modes.");
  }
  if (required(env, "POS_LICENSING_ENVIRONMENT").toLowerCase() !== "staging") {
    fail("environment_mismatch", "POS_LICENSING_ENVIRONMENT must match the staging runtime.");
  }
  if (required(env, "POS_LICENSING_CLIENT_SCOPE").toLowerCase() !== "staging-only") {
    fail("unsafe_client_scope", "Staging POS licensing requires an explicit staging-only client scope.");
  }

  const signingKeyId = clean(env.POS_LICENSING_SIGNING_KEY_ID);
  const hasSigningMaterial = Boolean(clean(env.POS_LICENSING_SIGNING_PRIVATE_JWK_B64) || clean(env.POS_LICENSING_EXPECTED_PUBLIC_JWK));
  const rateLimitBackend = clean(env.POS_LICENSING_RATE_LIMIT_BACKEND).toLowerCase();
  const hasRateLimitMaterial = Boolean(
    rateLimitBackend ||
    clean(env.POS_LICENSING_RATE_LIMIT_STORE_URI) ||
    clean(env.UPSTASH_REDIS_REST_URL) ||
    clean(env.UPSTASH_REDIS_REST_TOKEN) ||
    clean(env.POS_LICENSING_RATE_LIMIT_STORE_IDENTITY) ||
    clean(env.POS_LICENSING_RATE_LIMIT_NAMESPACE)
  );
  const mongo = validatePosLicensingMongoConfiguration(env, "staging");
  const secrets = loadPosLicensingServerSecrets(env, {
    expectedEnvironment: "staging",
    requiredNames: [
      "MONGO_URI",
      ...(hasSigningMaterial ? ["POS_LICENSING_SIGNING_PRIVATE_JWK_B64", "POS_LICENSING_EXPECTED_PUBLIC_JWK"] : []),
      ...(hasRateLimitMaterial ? rateLimitSecretNames(rateLimitBackend) : [])
    ]
  });
  const databaseName = mongo.databaseName;

  const transport = validatePosLicensingTransportConfiguration(
    env,
    "staging",
    required(env, "POS_LICENSING_MACHINE_API_ORIGIN")
  );
  if (signingKeyId === APPROVED_PRODUCTION_KEY_ID || (hasSigningMaterial && !/^automatex-pos-staging-/i.test(signingKeyId))) {
    fail("production_signing_fallback_forbidden", "Staging POS licensing cannot use production signing configuration.");
  }
  const keyProvider = hasSigningMaterial ? createSigningKeyProvider(secrets, signingKeyId, "staging") : null;
  if (hasRateLimitMaterial) {
    if (!rateLimitBackend || ["memory", "local", "in-process", "none"].includes(rateLimitBackend)) {
      fail("unsafe_rate_limit_backend", "Staging POS rate-limit secret validation requires a distributed backend identity.");
    }
    validateRateLimitSecretConfiguration(env, secrets, rateLimitBackend, "Staging");
  }

  const rateLimit = hasRateLimitMaterial ? validateDistributedRateLimitConfiguration({
    backend: rateLimitBackend,
    storeIdentity: required(env, "POS_LICENSING_RATE_LIMIT_STORE_IDENTITY"),
    namespace: required(env, "POS_LICENSING_RATE_LIMIT_NAMESPACE"),
    windowMs: parsePositiveInteger(env, "POS_LICENSING_RATE_LIMIT_WINDOW_MS"),
    activationLimit: parsePositiveInteger(env, "POS_LICENSING_ACTIVATION_RATE_LIMIT"),
    bootstrapLimit: parsePositiveInteger(env, "POS_LICENSING_BOOTSTRAP_RATE_LIMIT"),
    renewalLimit: parsePositiveInteger(env, "POS_LICENSING_RENEWAL_RATE_LIMIT")
  }, "staging") : null;

  return Object.freeze({
    environment: "staging",
    mode: "staging",
    databaseName,
    mongo,
    clientScope: "staging-only",
    keyId: signingKeyId,
    keyProvider,
    secrets,
    rateLimit,
    machineApiOrigin: transport.machineApiOrigin,
    approvedHostname: transport.approvedHostname,
    transport,
    allowedOrigins: transport.cors.machine.allowedOrigins,
    adminAllowedOrigins: transport.cors.admin.allowedOrigins
  });
}

function assertPosLicensingStartupConfig(env = process.env) {
  const runtimeEnvironment = classifyRuntimeEnvironment(env);
  const mode = clean(env.POS_LICENSING_MODE).toLowerCase() || "disabled";
  const enablementRequested = clean(env.POS_LICENSING_ENABLED).toLowerCase() === "true";
  if (!POS_LICENSING_MODES.includes(mode)) {
    fail("invalid_environment", "POS_LICENSING_MODE is invalid.");
  }
  if (mode !== "disabled" && mode !== runtimeEnvironment.mode) {
    fail("environment_fallback_forbidden", "The POS licensing mode cannot fall back across runtime environments.");
  }
  if (mode !== "production") {
    if (mode === "staging") {
      return Object.freeze({ active: false, enablementRequested, configured: true, mode, runtimeEnvironment, config: validateStagingLicensingConfig(env) });
    }
    return Object.freeze({ active: false, enablementRequested: false, configured: mode !== "disabled", mode, runtimeEnvironment });
  }
  return Object.freeze({ active: false, enablementRequested, configured: true, mode, runtimeEnvironment, config: validateProductionLicensingConfig(env) });
}

function assertProductionLicensingStartupConfig(env = process.env) {
  return assertPosLicensingStartupConfig(env);
}

module.exports = {
  APPROVED_PRODUCTION_KEY_ID,
  POS_LICENSING_MODES,
  REQUIRED_PRODUCTION_ENVIRONMENT_VARIABLES,
  PosLicensingConfigurationError,
  assertPosLicensingStartupConfig,
  assertProductionLicensingStartupConfig,
  loadProductionSigningKeyProvider,
  validateProductionLicensingConfig,
  validateStagingLicensingConfig
};
