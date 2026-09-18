const {
  loadPosLicensingServerSecrets
} = require("./posLicensingSecrets");

const POS_LICENSING_MONGO_CONNECTION_OPTIONS = Object.freeze({
  autoCreate: false,
  autoIndex: false,
  bufferCommands: false,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  minPoolSize: 0,
  maxPoolSize: 20,
  retryReads: true,
  retryWrites: true
});

const RESERVED_DATABASE_NAMES = new Set(["admin", "config", "local"]);
const NON_PRODUCTION_MARKERS = /(test|testing|dev|development|local|mock|stag|staging)/i;
const NON_STAGING_MARKERS = /(prod|production|test|testing|dev|development|local|mock)/i;

class PosLicensingMongoConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PosLicensingMongoConfigurationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PosLicensingMongoConfigurationError(code, message);
}

function clean(value) {
  return String(value || "").trim();
}

function parseBooleanOption(searchParams, name) {
  const entry = [...searchParams.entries()].find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry ? clean(entry[1]).toLowerCase() : "";
}

function decodeCredential(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail("invalid_mongodb_configuration", "POS licensing MongoDB credentials are not valid URI components.");
  }
}

function parseMongoUri(mongoUri, environment) {
  let parsed;
  try {
    parsed = new URL(mongoUri);
  } catch {
    fail("invalid_mongodb_configuration", `${environment} POS licensing requires a valid MongoDB URI.`);
  }

  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) {
    fail("invalid_mongodb_configuration", `${environment} POS licensing requires a MongoDB URI.`);
  }
  if (!parsed.hostname || /localhost|127\.0\.0\.1|\[::1\]/i.test(parsed.hostname)) {
    fail("unsafe_mongodb_configuration", `${environment} POS licensing cannot use a local MongoDB endpoint.`);
  }

  const username = decodeCredential(parsed.username);
  const password = decodeCredential(parsed.password);
  if (!username || !password) {
    fail("unauthenticated_mongodb_configuration", `${environment} POS licensing requires an authenticated MongoDB URI.`);
  }

  const tls = parseBooleanOption(parsed.searchParams, "tls");
  const ssl = parseBooleanOption(parsed.searchParams, "ssl");
  const tlsInsecure = parseBooleanOption(parsed.searchParams, "tlsInsecure");
  const invalidCertificates = parseBooleanOption(parsed.searchParams, "tlsAllowInvalidCertificates");
  const invalidHostnames = parseBooleanOption(parsed.searchParams, "tlsAllowInvalidHostnames");
  const explicitlyInsecure = tls === "false" || ssl === "false" || tlsInsecure === "true" || invalidCertificates === "true" || invalidHostnames === "true";
  const secureTransport = parsed.protocol === "mongodb+srv:" || tls === "true" || ssl === "true";
  if (explicitlyInsecure || !secureTransport) {
    fail("insecure_mongodb_transport", `${environment} POS licensing requires certificate-validating TLS for MongoDB.`);
  }

  if (parseBooleanOption(parsed.searchParams, "retryWrites") === "false" || parseBooleanOption(parsed.searchParams, "retryReads") === "false") {
    fail("unsafe_mongodb_retry_configuration", `${environment} POS licensing cannot disable MongoDB retryable reads or writes.`);
  }

  let uriDatabaseName;
  try {
    uriDatabaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    fail("invalid_mongodb_configuration", `${environment} POS licensing MongoDB database name is not a valid URI component.`);
  }
  if (!uriDatabaseName || uriDatabaseName.includes("/")) {
    fail("implicit_database_forbidden", `${environment} POS licensing requires one explicit database in MONGO_URI.`);
  }

  return Object.freeze({
    scheme: parsed.protocol.slice(0, -1),
    uriDatabaseName,
    authenticated: true,
    tlsRequired: true,
    retryReads: true,
    retryWrites: true
  });
}

function validateDatabaseName(databaseName, environment) {
  const name = clean(databaseName);
  if (!name) {
    fail("missing_configuration", "Required POS licensing configuration is missing: POS_LICENSING_DATABASE_NAME.");
  }
  if (!/^[a-zA-Z0-9_-]{3,63}$/.test(name) || RESERVED_DATABASE_NAMES.has(name.toLowerCase()) || !/(^|[_-])pos([_-]|$)/i.test(name)) {
    fail("unsafe_database_name", `${environment} POS licensing requires an explicit dedicated POS database name.`);
  }
  if (environment === "production" && (!/(^|[_-])prod(?:uction)?([_-]|$)/i.test(name) || NON_PRODUCTION_MARKERS.test(name))) {
    fail("unsafe_database_name", "Production POS licensing requires a dedicated production database name.");
  }
  if (environment === "staging" && (!/(^|[_-])stag(?:e|ing)?([_-]|$)/i.test(name) || NON_STAGING_MARKERS.test(name))) {
    fail("unsafe_database_name", "Staging POS licensing requires a staging-only database name.");
  }
  return name;
}

function validatePosLicensingMongoConfiguration(env = process.env, expectedEnvironment) {
  const environment = clean(expectedEnvironment).toLowerCase();
  if (!["production", "staging"].includes(environment)) {
    fail("invalid_environment", "POS licensing MongoDB validation requires staging or production identity.");
  }

  const secrets = loadPosLicensingServerSecrets(env, {
    expectedEnvironment: environment,
    requiredNames: ["MONGO_URI"]
  });
  const databaseName = validateDatabaseName(env.POS_LICENSING_DATABASE_NAME, environment);
  const uri = parseMongoUri(secrets.getMongoUri(), environment === "production" ? "Production" : "Staging");
  if (uri.uriDatabaseName !== databaseName) {
    fail("database_name_mismatch", `${environment} POS licensing MongoDB URI and explicit database identity do not match.`);
  }

  return Object.freeze({
    environment,
    databaseName,
    scheme: uri.scheme,
    authenticated: uri.authenticated,
    tlsRequired: uri.tlsRequired,
    retryReads: uri.retryReads,
    retryWrites: uri.retryWrites,
    secrets
  });
}

function getPosLicensingMongoConnectionOptions(databaseName) {
  return Object.freeze({
    ...POS_LICENSING_MONGO_CONNECTION_OPTIONS,
    dbName: databaseName
  });
}

module.exports = {
  POS_LICENSING_MONGO_CONNECTION_OPTIONS,
  PosLicensingMongoConfigurationError,
  getPosLicensingMongoConnectionOptions,
  validatePosLicensingMongoConfiguration
};
