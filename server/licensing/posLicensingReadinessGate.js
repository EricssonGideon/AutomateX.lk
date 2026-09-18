const {
  validateStagingLicensingConfig
} = require("../config/posLicensingProduction");
const {
  getPosLicensingProvisioningPlan,
  validatePosLicensingProvisioningPlan
} = require("./posLicensingProvisioning");
const {
  inspectMachineRateLimitReadiness
} = require("./posLicensingRateLimit");
const { resolveConfiguredRateLimitStoreFactory } = require("./upstashRateLimitStore");
const {
  validateRouteGroupIsolation
} = require("./posLicensingRouteGroups");
const {
  adminPermissionBoundaryIsValid,
  runProductionLicensingReadiness
} = require("./posLicensingReadiness");
const {
  inspectMongoTransactionCapability
} = require("./posLicensingTransactions");

const REQUIRED_PRODUCTION_READINESS_CHECKS = Object.freeze([
  "environment",
  "environment_isolation",
  "secret_source",
  "secret_configuration",
  "signing_config",
  "signing_key_id",
  "public_private_key_match",
  "mongodb_config",
  "database_identity",
  "logical_sessions",
  "transaction_topology",
  "transaction_probe",
  "transaction_capability",
  "provisioning_definitions",
  "required_indexes",
  "distributed_rate_limiter",
  "rate_limit_backend",
  "rate_limit_adapter",
  "namespace_isolation",
  "https_machine_origin",
  "approved_hostname",
  "hostname_isolation",
  "proxy_trust",
  "cors_allowlist",
  "production_cors",
  "admin_origin",
  "admin_origin_isolation",
  "machine_cors",
  "audit_config",
  "route_isolation",
  "admin_permissions"
]);

function item(name, passed, code) {
  const safeName = typeof name === "string" && /^[a-z0-9_]{1,100}$/.test(name) ? name : "readiness_check_invalid";
  const safeCode = typeof code === "string" && /^[a-z0-9_]{1,100}$/.test(code) ? code : "readiness_code_invalid";
  return Object.freeze({ name: safeName, passed: Boolean(passed), code: safeCode });
}

function parseEnablementFlag(env = process.env) {
  const raw = String(env && env.POS_LICENSING_ENABLED || "").trim().toLowerCase();
  if (!raw) {
    return item("production_enablement", false, "production_enablement_missing");
  }
  if (raw === "false") {
    return item("production_enablement", false, "production_enablement_disabled");
  }
  if (raw !== "true") {
    return item("production_enablement", false, "production_enablement_invalid");
  }
  return item("production_enablement", true, "production_enablement_explicit");
}

function assertPosLicensingEnablementEligible(result) {
  if (result && result.enablementRequested && !result.eligibleForRouteMount) {
    const error = new Error("POS licensing enablement refused by readiness gate.");
    error.code = "pos_licensing_enablement_refused";
    throw error;
  }
  return Boolean(result && result.eligibleForRouteMount);
}

function completeRequiredChecks(checks) {
  const names = new Set(checks.map((check) => check.name));
  const missing = REQUIRED_PRODUCTION_READINESS_CHECKS
    .filter((name) => !names.has(name))
    .map((name) => item(name, false, "readiness_check_not_evaluated"));
  return Object.freeze([...checks, ...missing]);
}

function decision({ environment, foundationChecks, foundationReady, enablement }) {
  const completed = completeRequiredChecks(foundationChecks);
  const technicalReadinessPassed = foundationReady && completed.every((check) => check.passed);
  const checks = Object.freeze([...completed, enablement]);
  const explicitEnvironment = checks.find((check) => check.name === "environment");
  const eligible = environment === "production" && technicalReadinessPassed && explicitEnvironment && explicitEnvironment.passed && enablement.passed;
  let decisionCode = "production_readiness_failed";
  if (technicalReadinessPassed && !enablement.passed) {
    decisionCode = enablement.code;
  } else if (eligible) {
    decisionCode = "production_route_mount_eligible";
  }
  return Object.freeze({
    environment,
    ready: Boolean(eligible),
    technicalReadinessPassed: Boolean(technicalReadinessPassed),
    enablementRequested: enablement.passed,
    eligibleForRouteMount: Boolean(eligible),
    eligibleForProductionRouteMount: Boolean(eligible),
    active: false,
    decisionCode,
    checks
  });
}

async function runProductionLicensingReadinessGate(options = {}) {
  const env = options.env || process.env;
  const foundation = await runProductionLicensingReadiness(options);
  return decision({
    environment: "production",
    foundationChecks: foundation.checks,
    foundationReady: foundation.ready,
    enablement: parseEnablementFlag(env)
  });
}

function stagingCheck(name, passed, successCode, failureCode) {
  return item(name, passed, passed ? successCode : failureCode);
}

async function runStagingLicensingReadinessGate(options = {}) {
  const env = options.env || process.env;
  const checks = [];
  let config = null;
  try {
    config = validateStagingLicensingConfig(env);
    const secretStatus = config.secrets.toJSON().configured;
    checks.push(item("environment", true, "staging_environment_valid"));
    checks.push(stagingCheck("environment_isolation", config.clientScope === "staging-only", "staging_environment_isolated", "staging_environment_not_isolated"));
    checks.push(stagingCheck("secret_source", ["runtime-environment", "secret-manager"].includes(config.secrets.source), "server_secret_source_approved", "server_secret_source_unapproved"));
    checks.push(stagingCheck("secret_configuration", secretStatus.mongodb && secretStatus.signing && secretStatus.rateLimiter, "required_server_secrets_configured", "required_server_secrets_missing"));
    checks.push(stagingCheck("signing_config", Boolean(config.keyProvider), "staging_signing_key_valid", "staging_signing_key_missing"));
    checks.push(stagingCheck("signing_key_id", /^automatex-pos-staging-/i.test(config.keyId), "staging_key_id_approved", "staging_key_id_unapproved"));
    checks.push(stagingCheck("public_private_key_match", Boolean(config.keyProvider), "verification_key_match", "verification_key_not_verified"));
    checks.push(stagingCheck("mongodb_config", config.mongo.authenticated && config.mongo.tlsRequired, "mongodb_configuration_valid", "mongodb_configuration_invalid"));
    checks.push(stagingCheck("database_identity", config.mongo.databaseName === config.databaseName, "staging_database_identity_valid", "staging_database_identity_invalid"));
    checks.push(stagingCheck("distributed_rate_limiter", Boolean(config.rateLimit), "distributed_rate_limit_configured", "distributed_rate_limit_missing"));
    checks.push(stagingCheck("rate_limit_backend", Boolean(config.rateLimit && config.rateLimit.backend), "distributed_rate_limit_backend_accepted", "distributed_rate_limit_backend_invalid"));
    checks.push(stagingCheck("namespace_isolation", Boolean(config.rateLimit && new Set(Object.values(config.rateLimit.namespaces)).size === 3), "rate_limit_namespaces_isolated", "rate_limit_namespaces_invalid"));
    checks.push(item("https_machine_origin", true, "https_machine_origin_valid"));
    checks.push(item("approved_hostname", true, "approved_hostname_configured"));
    checks.push(item("hostname_isolation", config.transport.hostnamesDistinct, "staging_production_hostnames_isolated"));
    checks.push(item("proxy_trust", config.transport.proxy.configured, "proxy_trust_explicitly_configured"));
    checks.push(stagingCheck("cors_allowlist", config.transport.cors.application.allowedOrigins.length > 0, "cors_allowlist_valid", "cors_allowlist_invalid"));
    checks.push(stagingCheck("production_cors", !config.transport.cors.application.allowedOrigins.includes("*"), "production_cors_has_no_wildcard", "production_cors_wildcard"));
    checks.push(stagingCheck("admin_origin", config.transport.cors.admin.allowedOrigins.length > 0, "admin_origin_configuration_valid", "admin_origin_configuration_invalid"));
    checks.push(stagingCheck("admin_origin_isolation", config.transport.cors.productionAdminOrigins.every((origin) => !config.transport.cors.stagingAdminOrigins.includes(origin)), "admin_origins_environment_isolated", "admin_origins_environment_collision"));
    checks.push(stagingCheck("machine_cors", config.transport.cors.machine.allowedOrigins.length === 0, "machine_browser_cors_disabled", "machine_browser_cors_enabled"));
  } catch (error) {
    checks.push(item("staging_configuration", false, error && error.code || "staging_configuration_invalid"));
  }

  const limiter = config && config.rateLimit
    ? await inspectMachineRateLimitReadiness(
      config,
      options.rateLimitStoreFactory || resolveConfiguredRateLimitStoreFactory(env, options)
    )
    : { ready: false, code: "rate_limit_configuration_missing" };
  checks.push(item("rate_limit_adapter", limiter.ready, limiter.code));

  let capability = options.transactionCapability || null;
  if (!capability && options.connection) {
    capability = await inspectMongoTransactionCapability(options.connection);
  }
  capability = capability || {
    supported: false,
    verified: false,
    logicalSessions: false,
    transactionalTopology: false,
    probePassed: false,
    reason: "transaction_capability_not_verified"
  };
  checks.push(stagingCheck("logical_sessions", capability.logicalSessions === true, "logical_sessions_verified", "logical_sessions_unavailable"));
  checks.push(stagingCheck("transaction_topology", capability.transactionalTopology === true, "transaction_topology_verified", "transaction_topology_unsupported"));
  checks.push(stagingCheck("transaction_probe", capability.probePassed === true, "transaction_probe_passed", "transaction_probe_not_passed"));
  checks.push(stagingCheck("transaction_capability", capability.supported && capability.verified, capability.reason || "transactions_verified", capability.reason || "transactions_unsupported"));

  const provisioning = validatePosLicensingProvisioningPlan(getPosLicensingProvisioningPlan());
  checks.push(stagingCheck("provisioning_definitions", provisioning.valid, "provisioning_definitions_valid", "provisioning_definitions_invalid"));
  checks.push(stagingCheck("required_indexes", provisioning.valid, "indexes_defined", "indexes_incomplete"));
  const routeIsolation = validateRouteGroupIsolation(env.POS_LICENSING_MACHINE_API_BASE_PATH);
  checks.push(stagingCheck("route_isolation", routeIsolation.valid, "route_groups_isolated", "route_groups_invalid"));
  const adminPermissionsValid = adminPermissionBoundaryIsValid();
  checks.push(stagingCheck("admin_permissions", adminPermissionsValid, "owner_admin_server_authorization_required", "admin_permission_boundary_invalid"));
  const auditReady = String(env.POS_LICENSING_AUDIT_ENABLED || "").toLowerCase() === "true" && String(env.POS_LICENSING_AUDIT_RETENTION || "").toLowerCase() === "indefinite";
  checks.push(stagingCheck("audit_config", auditReady, "audit_config_valid", "audit_config_invalid"));

  const enablement = parseEnablementFlag(env);
  const stagingEnablement = item(
    "staging_enablement",
    enablement.passed,
    enablement.passed ? "staging_enablement_explicit" : enablement.code.replace("production_", "staging_")
  );
  const completed = completeRequiredChecks(checks);
  const technicalReadinessPassed = completed.every((check) => check.passed);
  const eligible = technicalReadinessPassed && stagingEnablement.passed;
  return Object.freeze({
    environment: "staging",
    ready: eligible,
    technicalReadinessPassed,
    enablementRequested: stagingEnablement.passed,
    eligibleForRouteMount: eligible,
    eligibleForStagingRouteMount: eligible,
    eligibleForProductionRouteMount: false,
    active: false,
    decisionCode: eligible ? "staging_route_mount_eligible" : technicalReadinessPassed ? stagingEnablement.code : "staging_readiness_failed",
    checks: Object.freeze([...completed, stagingEnablement])
  });
}

module.exports = {
  REQUIRED_PRODUCTION_READINESS_CHECKS,
  assertPosLicensingEnablementEligible,
  parseEnablementFlag,
  runProductionLicensingReadinessGate,
  runStagingLicensingReadinessGate
};
