const {
  APPROVED_PRODUCTION_KEY_ID,
  validateProductionLicensingConfig
} = require("../config/posLicensingProduction");
const {
  getPosLicensingProvisioningPlan,
  validatePosLicensingProvisioningPlan
} = require("./posLicensingProvisioning");
const { validateRouteGroupIsolation } = require("./posLicensingRouteGroups");
const { inspectMongoTransactionCapability } = require("./posLicensingTransactions");
const { inspectProductionRateLimitReadiness } = require("./posLicensingRateLimit");
const { resolveConfiguredRateLimitStoreFactory } = require("./upstashRateLimitStore");
const {
  LICENCE_PERMISSIONS,
  ROLE_PERMISSIONS
} = require("../middleware/auth");

function item(name, passed, code) {
  const safeCode = typeof code === "string" && /^[a-z0-9_]{1,100}$/.test(code) ? code : "readiness_code_invalid";
  return Object.freeze({ name, passed: Boolean(passed), code: safeCode });
}

function safeConfigurationErrorCode(error) {
  return error && typeof error.code === "string" ? error.code : "configuration_invalid";
}

function adminPermissionBoundaryIsValid() {
  if (!Array.isArray(ROLE_PERMISSIONS.admin) || !ROLE_PERMISSIONS.admin.includes("*")) {
    return false;
  }
  return ["manager", "staff", "employee", "client"].every((role) => {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return LICENCE_PERMISSIONS.every((permission) => !permissions.includes(permission));
  });
}

async function runProductionLicensingReadiness(options = {}) {
  const env = options.env || process.env;
  const checks = [];
  let config = null;
  try {
    config = validateProductionLicensingConfig(env);
    checks.push(item("environment", true, "production_environment_valid"));
    checks.push(item(
      "environment_isolation",
      config.environment === "production" && config.mode === "production" && config.clientScope === "production-only",
      "production_environment_isolated"
    ));
    checks.push(item(
      "secret_source",
      ["runtime-environment", "secret-manager"].includes(config.secrets.source),
      "server_secret_source_approved"
    ));
    const secretStatus = config.secrets.toJSON().configured;
    checks.push(item(
      "secret_configuration",
      secretStatus.mongodb && secretStatus.signing && secretStatus.rateLimiter,
      "required_server_secrets_configured"
    ));
    checks.push(item("mongodb_config", config.mongo.authenticated && config.mongo.tlsRequired, "mongodb_configuration_valid"));
    checks.push(item("database_identity", config.mongo.databaseName === config.databaseName, "production_database_identity_valid"));
    checks.push(item("signing_config", true, "signing_key_valid"));
    checks.push(item("signing_key_id", config.keyId === APPROVED_PRODUCTION_KEY_ID, "approved_key_id"));
    checks.push(item("public_private_key_match", true, "verification_key_match"));
    checks.push(item("https_machine_origin", config.transport.machineApiOrigin.startsWith("https://"), "https_machine_origin_valid"));
    checks.push(item("approved_hostname", Boolean(config.transport.approvedHostname), "approved_hostname_configured"));
    checks.push(item("hostname_isolation", config.transport.hostnamesDistinct, "staging_production_hostnames_isolated"));
    checks.push(item("proxy_trust", config.transport.proxy.configured, "proxy_trust_explicitly_configured"));
    checks.push(item("cors_allowlist", config.transport.cors.application.allowedOrigins.length > 0, "cors_allowlist_valid"));
    checks.push(item("production_cors", !config.transport.cors.application.allowedOrigins.includes("*"), "production_cors_has_no_wildcard"));
    checks.push(item("admin_origin", config.transport.cors.admin.allowedOrigins.length > 0, "admin_origin_configuration_valid"));
    checks.push(item(
      "admin_origin_isolation",
      config.transport.cors.productionAdminOrigins.every((origin) => !config.transport.cors.stagingAdminOrigins.includes(origin)),
      "admin_origins_environment_isolated"
    ));
    checks.push(item("machine_cors", config.transport.cors.machine.allowedOrigins.length === 0, "machine_browser_cors_disabled"));
    checks.push(item("distributed_rate_limiter", true, "distributed_rate_limit_configured"));
    checks.push(item("rate_limit_backend", true, "distributed_rate_limit_backend_accepted"));
    checks.push(item(
      "namespace_isolation",
      new Set(Object.values(config.rateLimit.namespaces)).size === 3,
      "rate_limit_namespaces_isolated"
    ));
    checks.push(item("audit_config", config.audit.enabled && config.audit.retention === "indefinite", "audit_config_valid"));
  } catch (error) {
    checks.push(item("production_configuration", false, safeConfigurationErrorCode(error)));
  }

  const limiterReadiness = config
    ? await inspectProductionRateLimitReadiness(
      config,
      options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options)
    )
    : { ready: false, code: "rate_limit_configuration_invalid" };
  checks.push(item("rate_limit_adapter", limiterReadiness.ready, limiterReadiness.code));

  const provisioning = validatePosLicensingProvisioningPlan(getPosLicensingProvisioningPlan());
  checks.push(item(
    "provisioning_definitions",
    provisioning.valid,
    provisioning.valid ? "provisioning_definitions_valid" : "provisioning_definitions_invalid"
  ));
  checks.push(item("required_indexes", provisioning.valid, provisioning.valid ? "indexes_defined" : "indexes_incomplete"));

  const routeIsolation = validateRouteGroupIsolation(config ? config.machineApiBasePath : undefined);
  checks.push(item("route_isolation", routeIsolation.valid, routeIsolation.valid ? "route_groups_isolated" : "route_groups_invalid"));
  const adminPermissionsValid = adminPermissionBoundaryIsValid();
  checks.push(item(
    "admin_permissions",
    adminPermissionsValid,
    adminPermissionsValid ? "owner_admin_server_authorization_required" : "admin_permission_boundary_invalid"
  ));

  let transactionCapability = options.transactionCapability || null;
  if (!transactionCapability && options.connection) {
    transactionCapability = await inspectMongoTransactionCapability(options.connection);
  }
  if (!transactionCapability) {
    transactionCapability = {
      supported: false,
      verified: false,
      logicalSessions: false,
      transactionalTopology: false,
      probePassed: false,
      reason: "transaction_capability_not_verified"
    };
  }
  checks.push(item(
    "logical_sessions",
    transactionCapability.logicalSessions === true,
    transactionCapability.logicalSessions ? "logical_sessions_verified" : "logical_sessions_unavailable"
  ));
  checks.push(item(
    "transaction_topology",
    transactionCapability.transactionalTopology === true,
    transactionCapability.transactionalTopology ? "transaction_topology_verified" : "transaction_topology_unsupported"
  ));
  checks.push(item(
    "transaction_probe",
    transactionCapability.probePassed === true,
    transactionCapability.probePassed ? "transaction_probe_passed" : "transaction_probe_not_passed"
  ));
  checks.push(item(
    "transaction_capability",
    transactionCapability.supported && transactionCapability.verified,
    transactionCapability.reason || (transactionCapability.supported ? "transactions_verified" : "transactions_unsupported")
  ));

  return Object.freeze({
    ready: checks.every((check) => check.passed),
    checks: Object.freeze(checks)
  });
}

module.exports = {
  adminPermissionBoundaryIsValid,
  runProductionLicensingReadiness
};
