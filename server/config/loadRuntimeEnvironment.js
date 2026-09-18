const dotenv = require("dotenv");

class RuntimeEnvironmentSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuntimeEnvironmentSourceError";
    this.code = code;
  }
}

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

function mayLoadLocalDotenv(env = process.env) {
  const automatexEnvironment = clean(env.AUTOMATEX_ENV);
  const nodeEnvironment = clean(env.NODE_ENV);
  return !["staging", "production"].includes(automatexEnvironment) && nodeEnvironment !== "production";
}

function loadRuntimeEnvironment(options = {}) {
  const env = options.env || process.env;
  if (!mayLoadLocalDotenv(env)) {
    return Object.freeze({ loaded: false, source: "runtime-environment" });
  }

  const configureDotenv = options.configureDotenv || dotenv.config;
  configureDotenv(options.dotenvOptions);
  if (!mayLoadLocalDotenv(env)) {
    throw new RuntimeEnvironmentSourceError(
      "secure_dotenv_forbidden",
      "Local dotenv files cannot configure staging or production runtime identity."
    );
  }
  return Object.freeze({ loaded: true, source: "local-dotenv" });
}

module.exports = {
  RuntimeEnvironmentSourceError,
  loadRuntimeEnvironment,
  mayLoadLocalDotenv
};
