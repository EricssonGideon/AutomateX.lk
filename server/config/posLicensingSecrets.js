const util = require("node:util");

const POS_LICENSING_SECRET_ENVIRONMENTS = Object.freeze(["staging", "production"]);
const POS_LICENSING_SECRET_SOURCES = Object.freeze(["runtime-environment", "secret-manager"]);
const POS_LICENSING_SERVER_SECRET_NAMES = Object.freeze([
  "MONGO_URI",
  "POS_LICENSING_SIGNING_PRIVATE_JWK_B64",
  "POS_LICENSING_EXPECTED_PUBLIC_JWK",
  "POS_LICENSING_RATE_LIMIT_STORE_URI",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN"
]);
const POS_LICENSING_SERVER_SECRET_FIELD_NAMES = new Set([
  ...POS_LICENSING_SERVER_SECRET_NAMES,
  "POS_LICENSING_SECRET_ENVIRONMENT",
  "POS_LICENSING_SECRET_SOURCE",
  "POS_LICENSING_SIGNING_KEY_ID",
  "mongoUri",
  "signingPrivateJwk",
  "signingPrivateJwkB64",
  "expectedPublicJwk",
  "POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_TOKEN",
  "POS_LICENSING_STAGING_ACTIVATION_ELIGIBILITY_TOKEN",
  "POS_LICENSING_STAGING_ADMIN_BOOTSTRAP_TOKEN",
  "POS_LICENSING_STAGING_TEST_LICENCE_DRY_RUN_TOKEN",
  "POS_LICENSING_STAGING_TEST_LICENCE_APPLY_TOKEN",
  "POS_LICENSING_STAGING_CURRENT_ACTIVATION_CODE_TOKEN",
  "POS_LICENSING_STAGING_REPLACE_ACTIVATION_CODE_TOKEN",
  "rateLimitStoreUri",
  "upstashRedisRestUrl",
  "upstashRedisRestToken",
  "rateLimitPassword",
  "rateLimitToken"
]);

class PosLicensingSecretConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PosLicensingSecretConfigurationError";
    this.code = code;
  }
}

function clean(value) {
  return String(value || "").trim();
}

function fail(code, message) {
  throw new PosLicensingSecretConfigurationError(code, message);
}

function required(env, name) {
  const value = clean(env && env[name]);
  if (!value) {
    fail("missing_configuration", `Required POS licensing server secret is missing: ${name}.`);
  }
  return value;
}

class PosLicensingServerSecrets {
  #values;

  constructor(environment, source, values) {
    this.environment = environment;
    this.source = source;
    this.#values = Object.freeze({ ...values });
    Object.freeze(this);
  }

  getMongoUri() {
    return this.#values.MONGO_URI || "";
  }

  getSigningPrivateJwkB64() {
    return this.#values.POS_LICENSING_SIGNING_PRIVATE_JWK_B64 || "";
  }

  getExpectedPublicJwk() {
    return this.#values.POS_LICENSING_EXPECTED_PUBLIC_JWK || "";
  }

  getRateLimitStoreUri() {
    return this.#values.POS_LICENSING_RATE_LIMIT_STORE_URI || "";
  }

  getUpstashRedisRestUrl() {
    return this.#values.UPSTASH_REDIS_REST_URL || "";
  }

  getUpstashRedisRestToken() {
    return this.#values.UPSTASH_REDIS_REST_TOKEN || "";
  }

  toJSON() {
    return {
      environment: this.environment,
      source: this.source,
      configured: Object.freeze({
        mongodb: Boolean(this.#values.MONGO_URI),
        signing: Boolean(this.#values.POS_LICENSING_SIGNING_PRIVATE_JWK_B64 && this.#values.POS_LICENSING_EXPECTED_PUBLIC_JWK),
        rateLimiter: Boolean(
          this.#values.POS_LICENSING_RATE_LIMIT_STORE_URI ||
          this.#values.UPSTASH_REDIS_REST_URL && this.#values.UPSTASH_REDIS_REST_TOKEN
        )
      })
    };
  }

  [util.inspect.custom]() {
    return this.toJSON();
  }
}

function loadPosLicensingServerSecrets(env = process.env, options = {}) {
  const expectedEnvironment = clean(options.expectedEnvironment).toLowerCase();
  if (!POS_LICENSING_SECRET_ENVIRONMENTS.includes(expectedEnvironment)) {
    fail("invalid_secret_environment", "POS licensing server secrets require an explicit staging or production environment.");
  }

  const secretEnvironment = required(env, "POS_LICENSING_SECRET_ENVIRONMENT").toLowerCase();
  if (secretEnvironment !== expectedEnvironment) {
    fail("secret_environment_mismatch", "POS licensing server-secret identity does not match the runtime environment.");
  }

  const source = required(env, "POS_LICENSING_SECRET_SOURCE").toLowerCase();
  if (!POS_LICENSING_SECRET_SOURCES.includes(source)) {
    fail("unapproved_secret_source", "POS licensing secrets must use approved runtime-environment or secret-manager injection.");
  }

  const requiredNames = options.requiredNames || [];
  const unknownNames = requiredNames.filter((name) => !POS_LICENSING_SERVER_SECRET_NAMES.includes(name));
  if (unknownNames.length) {
    fail("invalid_secret_contract", "POS licensing requested an unknown server-secret contract field.");
  }

  const values = {};
  POS_LICENSING_SERVER_SECRET_NAMES.forEach((name) => {
    const value = clean(env && env[name]);
    if (value) {
      values[name] = value;
    }
  });
  requiredNames.forEach((name) => {
    if (!values[name]) {
      required(env, name);
    }
  });

  return new PosLicensingServerSecrets(expectedEnvironment, source, values);
}

function findServerSecretFields(input, depth = 0, found = new Set()) {
  if (!input || typeof input !== "object" || depth > 5) {
    return found;
  }
  Object.keys(input).forEach((key) => {
    if (POS_LICENSING_SERVER_SECRET_FIELD_NAMES.has(key)) {
      found.add(key);
    }
    findServerSecretFields(input[key], depth + 1, found);
  });
  return found;
}

function assertNoPosLicensingServerSecretFields(input) {
  const found = [...findServerSecretFields(input)];
  if (found.length) {
    throw new PosLicensingSecretConfigurationError(
      "untrusted_secret_source",
      `POS licensing server configuration fields are not accepted from requests: ${found.join(", ")}.`
    );
  }
}

module.exports = {
  POS_LICENSING_SECRET_ENVIRONMENTS,
  POS_LICENSING_SECRET_SOURCES,
  POS_LICENSING_SERVER_SECRET_NAMES,
  PosLicensingSecretConfigurationError,
  assertNoPosLicensingServerSecretFields,
  loadPosLicensingServerSecrets
};
