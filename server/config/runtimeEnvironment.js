const RUNTIME_ENVIRONMENTS = Object.freeze([
  "development",
  "test",
  "staging",
  "production"
]);

class RuntimeEnvironmentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuntimeEnvironmentError";
    this.code = code;
  }
}

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

function fail(code, message) {
  throw new RuntimeEnvironmentError(code, message);
}

function classifyRuntimeEnvironment(env = process.env) {
  const configuredMode = clean(env.AUTOMATEX_ENV);
  const nodeEnv = clean(env.NODE_ENV);
  let mode = configuredMode;
  let explicit = true;

  if (!mode) {
    explicit = false;
    if (!nodeEnv || nodeEnv === "development") {
      mode = "development";
    } else if (nodeEnv === "test") {
      mode = "test";
    } else {
      fail("explicit_environment_required", "AUTOMATEX_ENV must be explicit for staging and production runtimes.");
    }
  }

  if (!RUNTIME_ENVIRONMENTS.includes(mode)) {
    fail("invalid_environment", "AUTOMATEX_ENV must be development, test, staging, or production.");
  }

  const allowedNodeEnvironments = {
    development: new Set(["", "development"]),
    test: new Set(["test"]),
    staging: new Set(["production"]),
    production: new Set(["production"])
  };
  if (!allowedNodeEnvironments[mode].has(nodeEnv)) {
    fail("environment_mismatch", "AUTOMATEX_ENV and NODE_ENV do not describe the same runtime security mode.");
  }

  return Object.freeze({
    mode,
    nodeEnv: nodeEnv || "development",
    explicit,
    secureRuntime: mode === "staging" || mode === "production"
  });
}

module.exports = {
  RUNTIME_ENVIRONMENTS,
  RuntimeEnvironmentError,
  classifyRuntimeEnvironment
};
