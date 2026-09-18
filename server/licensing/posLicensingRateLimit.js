const crypto = require("node:crypto");
const { ipKeyGenerator } = require("express-rate-limit");

const MACHINE_RATE_LIMIT_OPERATIONS = Object.freeze(["activation", "bootstrap", "renewal"]);
const LOCAL_BACKENDS = new Set(["memory", "local", "in-process", "none"]);
const SAFE_IDENTITY_PATTERN = /^[a-z0-9][a-z0-9:_.-]{2,127}$/;

class PosLicensingRateLimitError extends Error {
  constructor(code, message = "POS machine rate limiting is unavailable.") {
    super(message);
    this.name = "PosLicensingRateLimitError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PosLicensingRateLimitError(code, message);
}

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

function hasIdentityToken(value, token) {
  return new RegExp(`(?:^|[:_.-])${token}(?:$|[:_.-])`, "i").test(value);
}

function assertEnvironmentIdentity(value, expectedEnvironment, label) {
  if (!SAFE_IDENTITY_PATTERN.test(value) || !hasIdentityToken(value, expectedEnvironment)) {
    fail("rate_limit_identity_invalid", `${label} must explicitly identify the ${expectedEnvironment} environment.`);
  }
  const forbidden = expectedEnvironment === "production"
    ? ["staging", "test", "development", "dev", "local"]
    : ["production", "prod", "test", "development", "dev", "local"];
  if (forbidden.some((token) => hasIdentityToken(value, token))) {
    fail("rate_limit_environment_mismatch", `${label} cannot identify another runtime environment.`);
  }
  return value;
}

function validateDistributedRateLimitConfiguration(rateLimit, expectedEnvironment) {
  const environment = clean(expectedEnvironment);
  if (!rateLimit || !["production", "staging"].includes(environment)) {
    fail("rate_limit_configuration_missing", "A production or staging distributed rate-limit configuration is required.");
  }
  const backend = clean(rateLimit.backend);
  if (!backend || LOCAL_BACKENDS.has(backend) || hasIdentityToken(backend, "test") || hasIdentityToken(backend, "development") || hasIdentityToken(backend, "local")) {
    fail("unsafe_rate_limit_backend", `${expectedEnvironment} POS machine routes require a distributed rate-limit backend.`);
  }

  const storeIdentity = assertEnvironmentIdentity(clean(rateLimit.storeIdentity), environment, "The POS rate-limit store identity");
  const namespace = assertEnvironmentIdentity(clean(rateLimit.namespace), environment, "The POS rate-limit namespace");
  const values = [rateLimit.windowMs, rateLimit.activationLimit, rateLimit.bootstrapLimit, rateLimit.renewalLimit];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    fail("rate_limit_policy_invalid", "POS rate-limit windows and limits must be positive integers.");
  }

  const namespaces = Object.freeze(Object.fromEntries(
    MACHINE_RATE_LIMIT_OPERATIONS.map((operation) => [operation, `${namespace}:${operation}`])
  ));
  if (new Set(Object.values(namespaces)).size !== MACHINE_RATE_LIMIT_OPERATIONS.length) {
    fail("rate_limit_namespace_collision", "POS machine endpoint rate-limit namespaces must be distinct.");
  }
  return Object.freeze({
    backend,
    environment,
    storeIdentity,
    namespace,
    namespaces,
    windowMs: rateLimit.windowMs,
    activationLimit: rateLimit.activationLimit,
    bootstrapLimit: rateLimit.bootstrapLimit,
    renewalLimit: rateLimit.renewalLimit
  });
}

function assertDistributedStoreAdapter(store, contract) {
  if (!store || store.distributed !== true || store.localKeys === true) {
    fail("rate_limit_adapter_not_distributed");
  }
  if (["increment", "decrement", "resetKey", "healthCheck"].some((method) => typeof store[method] !== "function")) {
    fail("rate_limit_adapter_invalid");
  }
  if (clean(store.backend) !== contract.backend || clean(store.environment) !== contract.environment || clean(store.storeIdentity) !== contract.storeIdentity || clean(store.namespace) !== contract.namespace) {
    fail("rate_limit_adapter_identity_mismatch");
  }
  return store;
}

function sanitizedAdapterCall(store, method, args) {
  try {
    return Promise.resolve(store[method](...args)).catch(() => {
      throw new PosLicensingRateLimitError("rate_limit_backend_unavailable");
    });
  } catch {
    throw new PosLicensingRateLimitError("rate_limit_backend_unavailable");
  }
}

function wrapDistributedStoreAdapter(store, contract) {
  const wrapped = {
    distributed: true,
    localKeys: false,
    backend: contract.backend,
    environment: contract.environment,
    storeIdentity: contract.storeIdentity,
    namespace: contract.namespace,
    healthCheck() {
      return sanitizedAdapterCall(store, "healthCheck", []);
    },
    increment(key) {
      return sanitizedAdapterCall(store, "increment", [key]);
    },
    decrement(key) {
      return sanitizedAdapterCall(store, "decrement", [key]);
    },
    resetKey(key) {
      return sanitizedAdapterCall(store, "resetKey", [key]);
    }
  };
  if (typeof store.init === "function") {
    wrapped.init = (...args) => {
      try {
        const result = store.init(...args);
        if (result && typeof result.then === "function") {
          result.catch(() => null);
          fail("rate_limit_adapter_invalid", "POS rate-limit adapter initialization must be synchronous.");
        }
        return result;
      } catch (error) {
        if (error instanceof PosLicensingRateLimitError) {
          throw error;
        }
        throw new PosLicensingRateLimitError("rate_limit_backend_unavailable");
      }
    };
  }
  for (const optionalMethod of ["get", "resetAll", "shutdown"]) {
    if (typeof store[optionalMethod] === "function") {
      wrapped[optionalMethod] = (...args) => sanitizedAdapterCall(store, optionalMethod, args);
    }
  }
  return wrapped;
}

function createMachineRateLimitKey(operation, req = {}) {
  if (!MACHINE_RATE_LIMIT_OPERATIONS.includes(operation)) {
    fail("rate_limit_operation_invalid", "The POS machine rate-limit operation is invalid.");
  }
  const normalizedIp = ipKeyGenerator(String(req.ip || req.socket && req.socket.remoteAddress || "unknown"));
  const digest = crypto.createHash("sha256").update(`pos-machine|${normalizedIp}`, "utf8").digest("hex");
  return `${operation}:${digest}`;
}

function createMachineRateLimitKeyGenerator(operation) {
  return (req) => createMachineRateLimitKey(operation, req);
}

function buildStoreContract(rateLimit, operation, storeUri) {
  const limits = {
    activation: rateLimit.activationLimit,
    bootstrap: rateLimit.bootstrapLimit,
    renewal: rateLimit.renewalLimit
  };
  return Object.freeze({
    backend: rateLimit.backend,
    distributed: true,
    environment: rateLimit.environment,
    storeIdentity: rateLimit.storeIdentity,
    namespace: rateLimit.namespaces[operation],
    windowMs: rateLimit.windowMs,
    limit: limits[operation],
    storeUri
  });
}

function createMachineRateLimitOptions(config, storeFactory) {
  if (!config || !config.rateLimit || !["production", "staging"].includes(config.environment)) {
    fail("rate_limit_configuration_missing", "A production or staging distributed POS licensing rate-limit configuration is required.");
  }
  const rateLimit = validateDistributedRateLimitConfiguration(config.rateLimit, config.environment);
  if (typeof storeFactory !== "function") {
    fail("rate_limit_store_factory_missing", "A server-backed POS licensing rate-limit store factory is required.");
  }
  if (!config.secrets || typeof config.secrets.getRateLimitStoreUri !== "function") {
    fail("rate_limit_secret_provider_missing", "The POS licensing rate-limit secret provider is required.");
  }

  const limits = {
    activation: rateLimit.activationLimit,
    bootstrap: rateLimit.bootstrapLimit,
    renewal: rateLimit.renewalLimit
  };
  const rawStores = new Set();
  const entries = MACHINE_RATE_LIMIT_OPERATIONS.map((operation) => {
    const contract = buildStoreContract(rateLimit, operation, config.secrets.getRateLimitStoreUri());
    let rawStore;
    try {
      rawStore = storeFactory(contract);
    } catch {
      fail("rate_limit_store_factory_failed");
    }
    if (rawStores.has(rawStore)) {
      fail("rate_limit_namespace_collision", "Each POS machine endpoint requires an independently namespaced store adapter.");
    }
    rawStores.add(rawStore);
    const store = wrapDistributedStoreAdapter(assertDistributedStoreAdapter(rawStore, contract), contract);
    return [operation, Object.freeze({
      windowMs: rateLimit.windowMs,
      limit: limits[operation],
      store,
      keyGenerator: createMachineRateLimitKeyGenerator(operation),
      passOnStoreError: false
    })];
  });
  return Object.freeze(Object.fromEntries(entries));
}

function createProductionMachineRateLimitOptions(config, storeFactory) {
  if (!config || config.environment !== "production") {
    fail("rate_limit_environment_mismatch", "Production POS rate-limit options require production configuration.");
  }
  return createMachineRateLimitOptions(config, storeFactory);
}

async function inspectMachineRateLimitReadiness(config, storeFactory) {
  try {
    const options = createMachineRateLimitOptions(config, storeFactory);
    for (const operation of MACHINE_RATE_LIMIT_OPERATIONS) {
      const result = await options[operation].store.healthCheck();
      if (!result || result.healthy !== true) {
        return Object.freeze({ ready: false, code: "rate_limit_backend_unhealthy" });
      }
    }
    return Object.freeze({ ready: true, code: "distributed_rate_limit_verified" });
  } catch (error) {
    const code = error instanceof PosLicensingRateLimitError ? error.code : "rate_limit_backend_unavailable";
    return Object.freeze({ ready: false, code: /^[a-z0-9_]{1,100}$/.test(code) ? code : "rate_limit_backend_unavailable" });
  }
}

async function inspectProductionRateLimitReadiness(config, storeFactory) {
  if (!config || config.environment !== "production") {
    return Object.freeze({ ready: false, code: "rate_limit_environment_mismatch" });
  }
  return inspectMachineRateLimitReadiness(config, storeFactory);
}

module.exports = {
  MACHINE_RATE_LIMIT_OPERATIONS,
  PosLicensingRateLimitError,
  createMachineRateLimitOptions,
  createMachineRateLimitKey,
  createMachineRateLimitKeyGenerator,
  createProductionMachineRateLimitOptions,
  inspectMachineRateLimitReadiness,
  inspectProductionRateLimitReadiness,
  validateDistributedRateLimitConfiguration
};
