const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-transport-security-test-only";

const {
  APPROVED_PRODUCTION_KEY_ID,
  validateProductionLicensingConfig,
  validateStagingLicensingConfig
} = require("../../server/config/posLicensingProduction");
const {
  createPosTransportGuard,
  createStrictCorsMiddleware,
  requestHostname,
  requestUsesTrustedHttps,
  resolvePosProxyTrustConfiguration,
  validateCorsPolicy
} = require("../../server/config/posLicensingTransport");
const { runProductionLicensingReadiness } = require("../../server/licensing/posLicensingReadiness");
const { requireTrustedLicenceAdmin } = require("../../server/middleware/auth");

function keyMaterial() {
  const pair = crypto.generateKeyPairSync("ed25519");
  return {
    privateJwkB64: Buffer.from(JSON.stringify(pair.privateKey.export({ format: "jwk" })), "utf8").toString("base64"),
    publicJwk: JSON.stringify(pair.publicKey.export({ format: "jwk" }))
  };
}

function productionEnv(overrides = {}) {
  const signing = keyMaterial();
  return {
    AUTOMATEX_ENV: "production",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "production",
    POS_LICENSING_ENVIRONMENT: "production",
    POS_LICENSING_CLIENT_SCOPE: "production-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "production",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: "mongodb+srv://production_user:production_password@production-cluster.example/automatex_pos_production",
    POS_LICENSING_DATABASE_NAME: "automatex_pos_production",
    POS_LICENSING_SIGNING_PRIVATE_JWK_B64: signing.privateJwkB64,
    POS_LICENSING_EXPECTED_PUBLIC_JWK: signing.publicJwk,
    POS_LICENSING_SIGNING_KEY_ID: APPROVED_PRODUCTION_KEY_ID,
    POS_LICENSING_MACHINE_API_BASE_PATH: "/api/pos-machine/v1",
    POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing.example.com",
    POS_LICENSING_PRODUCTION_HOSTNAME: "licensing.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "direct",
    ALLOWED_ORIGINS: "https://company.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    POS_LICENSING_RATE_LIMIT_BACKEND: "vendor-neutral-kv",
    POS_LICENSING_RATE_LIMIT_STORE_IDENTITY: "automatex-pos-production-distributed-v1",
    POS_LICENSING_RATE_LIMIT_NAMESPACE: "automatex:pos-licensing:production",
    POS_LICENSING_RATE_LIMIT_STORE_URI: "kv+tls://rate_user:rate_password@rate-limit.example:443/production",
    POS_LICENSING_RATE_LIMIT_WINDOW_MS: "60000",
    POS_LICENSING_ACTIVATION_RATE_LIMIT: "10",
    POS_LICENSING_BOOTSTRAP_RATE_LIMIT: "20",
    POS_LICENSING_RENEWAL_RATE_LIMIT: "60",
    POS_LICENSING_AUDIT_ENABLED: "true",
    POS_LICENSING_AUDIT_RETENTION: "indefinite",
    POS_LICENSING_MONGODB_TRANSACTIONS_REQUIRED: "true",
    ...overrides
  };
}

function stagingEnv(overrides = {}) {
  return {
    AUTOMATEX_ENV: "staging",
    NODE_ENV: "production",
    POS_LICENSING_MODE: "staging",
    POS_LICENSING_ENVIRONMENT: "staging",
    POS_LICENSING_CLIENT_SCOPE: "staging-only",
    POS_LICENSING_SECRET_ENVIRONMENT: "staging",
    POS_LICENSING_SECRET_SOURCE: "secret-manager",
    MONGO_URI: "mongodb+srv://staging_user:staging_password@staging-cluster.example/automatex_pos_staging",
    POS_LICENSING_DATABASE_NAME: "automatex_pos_staging",
    POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing-staging.example.com",
    POS_LICENSING_PRODUCTION_HOSTNAME: "licensing.example.com",
    POS_LICENSING_STAGING_HOSTNAME: "licensing-staging.example.com",
    POS_LICENSING_PROXY_TRUST_MODE: "direct",
    ALLOWED_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_PRODUCTION_ADMIN_ORIGINS: "https://company.example.com",
    POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company-staging.example.com",
    POS_LICENSING_MACHINE_ALLOWED_ORIGINS: "none",
    ...overrides
  };
}

function distributedStoreFactory(contract) {
  return {
    distributed: true,
    localKeys: false,
    backend: contract.backend,
    environment: contract.environment,
    storeIdentity: contract.storeIdentity,
    namespace: contract.namespace,
    async healthCheck() { return { healthy: true }; },
    async increment() { return { totalHits: 1, resetTime: new Date(Date.now() + 60000) }; },
    async decrement() {},
    async resetKey() {}
  };
}

function request(overrides = {}) {
  return {
    method: "POST",
    headers: { host: "licensing.example.com" },
    socket: { remoteAddress: "203.0.113.10", encrypted: false },
    get(name) { return this.headers[String(name).toLowerCase()]; },
    ...overrides
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    vary(name) { this.headers.vary = name; return this; },
    set(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send() { return this; }
  };
}

test("production rejects HTTP, localhost, loopback, wildcard, credentialed, and non-origin machine URLs", () => {
  for (const machineOrigin of [
    "http://licensing.example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://*.example.com",
    "https://user:password@licensing.example.com",
    "https://licensing.example.com/api/pos-machine",
    "https://licensing.example.com?environment=production"
  ]) {
    assert.throws(
      () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_MACHINE_API_ORIGIN: machineOrigin })),
      (error) => ["https_origin_invalid", "approved_hostname_invalid"].includes(error.code),
      machineOrigin
    );
  }
});

test("staging passes hostname validation without a production hostname", () => {
  const env = stagingEnv();
  delete env.POS_LICENSING_PRODUCTION_HOSTNAME;
  const config = validateStagingLicensingConfig(env);
  assert.equal(config.approvedHostname, "licensing-staging.example.com");
  assert.equal(config.transport.productionHostname, "");
  assert.equal(config.transport.hostnamesDistinct, true);
});

test("production passes hostname validation without a staging hostname", () => {
  const env = productionEnv();
  delete env.POS_LICENSING_STAGING_HOSTNAME;
  const config = validateProductionLicensingConfig(env);
  assert.equal(config.approvedHostname, "licensing.example.com");
  assert.equal(config.transport.stagingHostname, "");
  assert.equal(config.transport.hostnamesDistinct, true);
});

test("production and staging hostnames are rejected when both are present and equal", () => {
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_STAGING_HOSTNAME: "licensing.example.com" })),
    (error) => error.code === "hostname_environment_collision"
  );
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({ POS_LICENSING_PRODUCTION_HOSTNAME: "licensing-staging.example.com" })),
    (error) => error.code === "hostname_environment_collision"
  );
});

test("invalid current-environment hostnames are rejected", () => {
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ POS_LICENSING_PRODUCTION_HOSTNAME: "*.example.com" })),
    (error) => error.code === "approved_hostname_invalid"
  );
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({ POS_LICENSING_STAGING_HOSTNAME: "localhost" })),
    (error) => error.code === "approved_hostname_invalid"
  );
});

test("staging cannot reuse or fall back to the production machine origin", () => {
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({ POS_LICENSING_MACHINE_API_ORIGIN: "https://licensing.example.com" })),
    (error) => error.code === "machine_origin_hostname_mismatch"
  );
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({ POS_LICENSING_STAGING_HOSTNAME: "licensing.example.com" })),
    (error) => error.code === "hostname_environment_collision"
  );
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({
      POS_LICENSING_STAGING_ADMIN_ORIGINS: "https://company.example.com",
      ALLOWED_ORIGINS: "https://company.example.com"
    })),
    (error) => error.code === "admin_origin_environment_collision"
  );
});

test("production rejects wildcard CORS and wildcard plus credentials", () => {
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({ ALLOWED_ORIGINS: "*" })),
    (error) => error.code === "cors_allowlist_invalid"
  );
  assert.throws(
    () => validateCorsPolicy({ allowedOrigins: ["*"], credentials: true }),
    (error) => error.code === "wildcard_credentials_forbidden"
  );
});

test("arbitrary origins are rejected rather than reflected", () => {
  const middleware = createStrictCorsMiddleware({
    allowedOrigins: ["https://company.example.com"],
    credentials: true
  });
  const req = request({ headers: { origin: "https://attacker.example", host: "licensing.example.com" } });
  const res = response();
  middleware(req, res, () => { throw new Error("arbitrary origin reached route"); });
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
  assert.equal(res.headers["access-control-allow-credentials"], undefined);
});

test("direct mode remains unchanged and ignores untrusted forwarded protocol and host", () => {
  const proxy = resolvePosProxyTrustConfiguration({ POS_LICENSING_PROXY_TRUST_MODE: "direct" }, { required: true });
  const req = request({
    headers: {
      host: "unapproved.example.com",
      "x-forwarded-host": "licensing.example.com",
      "x-forwarded-proto": "https"
    }
  });
  assert.equal(requestUsesTrustedHttps(req, proxy), false);
  assert.equal(requestHostname(req, proxy), "unapproved.example.com");

  const res = response();
  createPosTransportGuard({ proxy, approvedHostname: "licensing.example.com" })(req, res, () => {
    throw new Error("untrusted forwarding reached route");
  });
  assert.equal(res.statusCode, 403);
});

test("cidr mode remains unchanged and accepts forwarding only from a trusted proxy", () => {
  const proxy = resolvePosProxyTrustConfiguration({
    POS_LICENSING_PROXY_TRUST_MODE: "cidr",
    POS_LICENSING_TRUSTED_PROXY_CIDRS: "10.20.0.0/16"
  }, { required: true });
  const req = request({
    socket: { remoteAddress: "10.20.4.8", encrypted: false },
    headers: {
      host: "internal-service:5000",
      "x-forwarded-host": "licensing.example.com",
      "x-forwarded-proto": "https"
    }
  });
  assert.equal(requestUsesTrustedHttps(req, proxy), true);
  assert.equal(requestHostname(req, proxy), "licensing.example.com");
  let nextCalled = false;
  createPosTransportGuard({ proxy, approvedHostname: "licensing.example.com" })(req, response(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("vercel mode works only in verified matching Vercel runtimes", () => {
  for (const [environment, vercelEnvironment, envFactory] of [
    ["staging", "preview", stagingEnv],
    ["production", "production", productionEnv]
  ]) {
    const config = envFactory({
      POS_LICENSING_PROXY_TRUST_MODE: "vercel",
      VERCEL: "1",
      VERCEL_ENV: vercelEnvironment
    });
    const validated = environment === "staging"
      ? validateStagingLicensingConfig(config)
      : validateProductionLicensingConfig(config);
    assert.equal(validated.transport.proxy.configured, true);
    assert.equal(validated.transport.proxy.mode, "vercel");
    assert.equal(validated.transport.proxy.expressTrust, false);

    const req = request({
      socket: { remoteAddress: "127.0.0.1", encrypted: false },
      headers: {
        host: validated.approvedHostname,
        "x-forwarded-host": validated.approvedHostname,
        "x-forwarded-proto": "https"
      }
    });
    assert.equal(requestUsesTrustedHttps(req, validated.transport.proxy), true);
    assert.equal(requestHostname(req, validated.transport.proxy), validated.approvedHostname);
  }

  assert.throws(
    () => resolvePosProxyTrustConfiguration({
      POS_LICENSING_PROXY_TRUST_MODE: "vercel",
      POS_LICENSING_TRUSTED_PROXY_CIDRS: "0.0.0.0/0",
      VERCEL: "1",
      VERCEL_ENV: "preview"
    }, { required: true, environment: "staging" }),
    (error) => error.code === "proxy_trust_invalid"
  );
});

test("staging rejects a Vercel production runtime", () => {
  assert.throws(
    () => validateStagingLicensingConfig(stagingEnv({
      POS_LICENSING_PROXY_TRUST_MODE: "vercel",
      VERCEL: "1",
      VERCEL_ENV: "production"
    })),
    (error) => error.code === "proxy_trust_environment_mismatch"
  );
});

test("production rejects a Vercel Preview runtime", () => {
  assert.throws(
    () => validateProductionLicensingConfig(productionEnv({
      POS_LICENSING_PROXY_TRUST_MODE: "vercel",
      VERCEL: "1",
      VERCEL_ENV: "preview"
    })),
    (error) => error.code === "proxy_trust_environment_mismatch"
  );
});

test("non-Vercel runtimes reject vercel mode and spoofed forwarding remains untrusted", () => {
  for (const runtime of [
    { VERCEL_ENV: "preview" },
    { VERCEL: "true", VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "development" }
  ]) {
    assert.throws(
      () => resolvePosProxyTrustConfiguration({
        POS_LICENSING_PROXY_TRUST_MODE: "vercel",
        ...runtime
      }, { required: true, environment: "staging" }),
      (error) => error.code === "proxy_trust_vercel_runtime_invalid"
    );
  }

  const directProxy = resolvePosProxyTrustConfiguration({
    POS_LICENSING_PROXY_TRUST_MODE: "direct"
  }, { required: true });
  const spoofed = request({
    headers: {
      host: "unapproved.example.com",
      "x-forwarded-host": "licensing-staging.example.com",
      "x-forwarded-proto": "https"
    }
  });
  assert.equal(requestUsesTrustedHttps(spoofed, directProxy), false);
  assert.equal(requestHostname(spoofed, directProxy), "unapproved.example.com");
});

test("vercel mode still rejects a request with the wrong approved hostname", () => {
  const proxy = resolvePosProxyTrustConfiguration({
    POS_LICENSING_PROXY_TRUST_MODE: "vercel",
    VERCEL: "1",
    VERCEL_ENV: "preview"
  }, { required: true, environment: "staging" });
  const req = request({
    headers: {
      host: "unapproved.example.com",
      "x-forwarded-host": "licensing-staging.example.com",
      "x-forwarded-proto": "https"
    }
  });
  assert.equal(requestUsesTrustedHttps(req, proxy), true);
  assert.equal(requestHostname(req, proxy), "");
  const res = response();
  createPosTransportGuard({ proxy, approvedHostname: "licensing-staging.example.com" })(req, res, () => {
    throw new Error("wrong Vercel hostname reached route");
  });
  assert.equal(res.statusCode, 421);
});

test("ambiguous or universal proxy trust fails closed", () => {
  assert.throws(
    () => resolvePosProxyTrustConfiguration({}, { required: true }),
    (error) => error.code === "proxy_trust_unresolved"
  );
  assert.throws(
    () => resolvePosProxyTrustConfiguration({
      POS_LICENSING_PROXY_TRUST_MODE: "cidr",
      POS_LICENSING_TRUSTED_PROXY_CIDRS: "0.0.0.0/0"
    }, { required: true }),
    (error) => error.code === "proxy_trust_invalid"
  );
});

test("staff, client, and public origins do not enter the POS Control CORS boundary", () => {
  const config = validateProductionLicensingConfig(productionEnv({
    ALLOWED_ORIGINS: [
      "https://company.example.com",
      "https://staff.example.com",
      "https://client.example.com",
      "https://public.example.com"
    ].join(",")
  }));
  const middleware = createStrictCorsMiddleware(config.transport.cors.admin);
  for (const origin of ["https://staff.example.com", "https://client.example.com", "https://public.example.com"]) {
    const res = response();
    middleware(request({ headers: { origin, host: "licensing.example.com" } }), res, () => {
      throw new Error("non-admin origin reached POS Control");
    });
    assert.equal(res.statusCode, 403, origin);
  }
  for (const role of ["staff", "employee", "client"]) {
    const res = response();
    requireTrustedLicenceAdmin({ user: { role } }, res, () => {
      throw new Error("non-admin role reached POS Control");
    });
    assert.equal(res.statusCode, 403, role);
  }
});

test("approved POS Control browser origin uses exact reflection with credentials", () => {
  const config = validateProductionLicensingConfig(productionEnv());
  const middleware = createStrictCorsMiddleware(config.transport.cors.admin);
  const req = request({ headers: { origin: "https://company.example.com", host: "licensing.example.com" } });
  const res = response();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.headers["access-control-allow-origin"], "https://company.example.com");
  assert.equal(res.headers["access-control-allow-credentials"], "true");
});

test("native machine endpoint policy allows originless calls and rejects browser origins", () => {
  const config = validateProductionLicensingConfig(productionEnv());
  const middleware = createStrictCorsMiddleware(config.transport.cors.machine, {
    methods: "POST, OPTIONS",
    headers: "Content-Type, Accept"
  });
  let originlessNext = false;
  middleware(request(), response(), () => { originlessNext = true; });
  assert.equal(originlessNext, true);

  const browserResponse = response();
  middleware(
    request({ headers: { origin: "https://company.example.com", host: "licensing.example.com" } }),
    browserResponse,
    () => { throw new Error("browser origin reached machine route"); }
  );
  assert.equal(browserResponse.statusCode, 403);
});

test("production readiness includes transport gates without exposing configured values", async () => {
  const env = productionEnv();
  const report = await runProductionLicensingReadiness({
    env,
    rateLimitStoreFactory: distributedStoreFactory,
    transactionCapability: {
      supported: true,
      verified: true,
      logicalSessions: true,
      transactionalTopology: true,
      probePassed: true,
      reason: "transaction_probe_passed"
    }
  });
  assert.equal(report.ready, true);
  for (const name of [
    "https_machine_origin",
    "approved_hostname",
    "hostname_isolation",
    "proxy_trust",
    "cors_allowlist",
    "production_cors",
    "admin_origin",
    "admin_origin_isolation",
    "machine_cors"
  ]) {
    assert.equal(report.checks.find((check) => check.name === name).passed, true, name);
  }
  const output = JSON.stringify(report);
  for (const value of [
    env.POS_LICENSING_MACHINE_API_ORIGIN,
    env.POS_LICENSING_PRODUCTION_HOSTNAME,
    env.POS_LICENSING_STAGING_HOSTNAME,
    env.ALLOWED_ORIGINS,
    env.POS_LICENSING_RATE_LIMIT_STORE_URI
  ]) {
    assert.equal(output.includes(value), false);
  }
});

test("production readiness remains false while proxy trust is unresolved", async () => {
  const env = productionEnv({ POS_LICENSING_PROXY_TRUST_MODE: "unresolved" });
  const report = await runProductionLicensingReadiness({ env });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((check) => check.name === "production_configuration").code, "proxy_trust_unresolved");
});

test("server source no longer uses hop-count proxy trust or raw forwarded client identity", () => {
  const root = path.join(__dirname, "..", "..");
  const serverSource = fs.readFileSync(path.join(root, "server", "server.js"), "utf8");
  const auditSource = fs.readFileSync(path.join(root, "server", "utils", "auditLog.js"), "utf8");
  assert.doesNotMatch(serverSource, /set\(["']trust proxy["'],\s*1\)/);
  assert.doesNotMatch(serverSource, /set\(["']trust proxy["'],\s*true\)/);
  assert.doesNotMatch(auditSource, /x-forwarded-for/i);
});
