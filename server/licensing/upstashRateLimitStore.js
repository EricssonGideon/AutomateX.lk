const crypto = require("node:crypto");

const UPSTASH_REST_BACKEND = "upstash-rest";
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

const INCREMENT_SCRIPT = [
  "local count = redis.call('INCR', KEYS[1])",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "if ttl < 0 then",
  "  redis.call('PEXPIRE', KEYS[1], ARGV[1])",
  "  ttl = tonumber(ARGV[1])",
  "end",
  "return {count, ttl}"
].join("\n");

const DECREMENT_SCRIPT = [
  "local current = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "if current <= 0 then return 0 end",
  "return redis.call('DECR', KEYS[1])"
].join("\n");

class UpstashRateLimitStoreError extends Error {
  constructor(code, message = "The distributed rate-limit backend is unavailable.") {
    super(message);
    this.name = "UpstashRateLimitStoreError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new UpstashRateLimitStoreError(code, message);
}

function clean(value) {
  return String(value || "").trim();
}

function loadUpstashRestCredentials(env = process.env) {
  const rawUrl = clean(env && env.UPSTASH_REDIS_REST_URL);
  const token = clean(env && env.UPSTASH_REDIS_REST_TOKEN);
  if (!rawUrl) {
    fail("upstash_rest_url_missing");
  }
  if (!token) {
    fail("upstash_rest_token_missing");
  }
  if (token.length < 16 || /[\s\u0000-\u001f\u007f]/.test(token)) {
    fail("upstash_rest_token_invalid");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("upstash_rest_url_invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !["", "/"].includes(parsed.pathname) ||
    /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i.test(parsed.hostname)
  ) {
    fail("upstash_rest_url_invalid");
  }

  return Object.freeze({
    url: parsed.origin,
    token
  });
}

function assertContract(contract) {
  if (!contract || clean(contract.backend).toLowerCase() !== UPSTASH_REST_BACKEND) {
    fail("upstash_backend_invalid");
  }
  if (!contract.distributed || !["staging", "production"].includes(contract.environment)) {
    fail("upstash_contract_invalid");
  }
  if (!clean(contract.storeIdentity) || !clean(contract.namespace)) {
    fail("upstash_contract_invalid");
  }
  if (!Number.isSafeInteger(contract.windowMs) || contract.windowMs < 1) {
    fail("upstash_contract_invalid");
  }
  return contract;
}

function storedKey(namespace, key) {
  const digest = crypto.createHash("sha256").update(String(key || ""), "utf8").digest("hex");
  return `${namespace}:${digest}`;
}

function createRestCommand(credentials, fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== "function") {
    fail("upstash_fetch_unavailable");
  }
  return async function command(parts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(credentials.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${credentials.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(parts),
        signal: controller.signal
      });
      if (!response || response.ok !== true || typeof response.json !== "function") {
        fail("upstash_request_failed");
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        fail("upstash_response_invalid");
      }
      if (!payload || typeof payload !== "object" || Object.prototype.hasOwnProperty.call(payload, "error")) {
        fail("upstash_request_failed");
      }
      return payload.result;
    } catch (error) {
      if (error instanceof UpstashRateLimitStoreError) {
        throw error;
      }
      fail("upstash_request_failed");
    } finally {
      clearTimeout(timeout);
    }
  };
}

function createUpstashRateLimitStore(contract, options = {}) {
  const validatedContract = assertContract(contract);
  const credentials = loadUpstashRestCredentials(options.env || process.env);
  const timeoutMs = options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    fail("upstash_timeout_invalid");
  }
  const command = createRestCommand(credentials, options.fetchImpl || globalThis.fetch, timeoutMs);
  const keyFor = (key) => storedKey(validatedContract.namespace, key);

  return Object.freeze({
    distributed: true,
    localKeys: false,
    backend: UPSTASH_REST_BACKEND,
    environment: validatedContract.environment,
    storeIdentity: validatedContract.storeIdentity,
    namespace: validatedContract.namespace,
    async increment(key) {
      const result = await command([
        "EVAL",
        INCREMENT_SCRIPT,
        1,
        keyFor(key),
        validatedContract.windowMs
      ]);
      if (!Array.isArray(result) || result.length !== 2) {
        fail("upstash_response_invalid");
      }
      const totalHits = Number(result[0]);
      const ttl = Number(result[1]);
      if (!Number.isSafeInteger(totalHits) || totalHits < 1 || !Number.isFinite(ttl) || ttl < 0) {
        fail("upstash_response_invalid");
      }
      return {
        totalHits,
        resetTime: new Date(Date.now() + ttl)
      };
    },
    async decrement(key) {
      await command(["EVAL", DECREMENT_SCRIPT, 1, keyFor(key)]);
    },
    async resetKey(key) {
      await command(["DEL", keyFor(key)]);
    },
    async healthCheck() {
      const result = await command(["PING"]);
      return Object.freeze({ healthy: result === "PONG" });
    }
  });
}

function createUpstashRateLimitStoreFactory(options = {}) {
  const env = options.env || process.env;
  return (contract) => createUpstashRateLimitStore(contract, {
    env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs
  });
}

function resolveConfiguredRateLimitStoreFactory(env = process.env, options = {}) {
  if (clean(env && env.POS_LICENSING_RATE_LIMIT_BACKEND).toLowerCase() !== UPSTASH_REST_BACKEND) {
    return undefined;
  }
  return createUpstashRateLimitStoreFactory({
    env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs
  });
}

module.exports = {
  UPSTASH_REST_BACKEND,
  UpstashRateLimitStoreError,
  createUpstashRateLimitStore,
  createUpstashRateLimitStoreFactory,
  loadUpstashRestCredentials,
  resolveConfiguredRateLimitStoreFactory
};
