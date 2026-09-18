const {
  PosActivationRedemptionServiceError,
  createPosActivationRedemptionService
} = require("../services/posActivationRedemptionService");
const {
  PosLicenceRenewalServiceError,
  createPosLicenceRenewalService
} = require("../services/posLicenceRenewalService");
const {
  PosRenewalCredentialBootstrapServiceError,
  createPosRenewalCredentialBootstrapService
} = require("../services/posRenewalCredentialBootstrapService");

const GENERIC_ACTIVATION_DENIED_MESSAGE = "Activation request was not accepted.";
const INVALID_ACTIVATION_REQUEST_MESSAGE = "Activation request was invalid.";
const RETRYABLE_ACTIVATION_FAILURE_MESSAGE = "Activation service is unavailable.";
const GENERIC_RENEWAL_DENIED_MESSAGE = "Renewal request was not accepted.";
const INVALID_RENEWAL_REQUEST_MESSAGE = "Renewal request was invalid.";
const RETRYABLE_RENEWAL_FAILURE_MESSAGE = "Renewal service is unavailable.";
const STALE_RENEWAL_REQUEST_MESSAGE = "Renewal request is stale.";
const GENERIC_BOOTSTRAP_DENIED_MESSAGE = "Renewal credential bootstrap request was not accepted.";
const INVALID_BOOTSTRAP_REQUEST_MESSAGE = "Renewal credential bootstrap request was invalid.";
const RETRYABLE_BOOTSTRAP_FAILURE_MESSAGE = "Renewal credential bootstrap service is unavailable.";

const GENERIC_DENIED_CODES = new Set([
  "activation_code_not_found",
  "activation_code_revoked",
  "activation_code_expired",
  "activation_code_exhausted",
  "activation_code_not_usable",
  "licence_not_found",
  "licence_not_eligible",
  "package_not_published",
  "licence_expired",
  "missing_offline_policy",
  "offline_window_expired",
  "invalid_offline_policy",
  "missing_installation_policy",
  "validation_failed",
  "installation_already_bound",
  "installation_limit_reached",
  "installation_limit_conflict",
  "activation_code_conflict",
  "stored_response_unavailable",
  "stored_response_expired"
]);

const INVALID_REQUEST_CODES = new Set([
  "invalid_request",
  "invalid_activation_code",
  "invalid_installation",
  "protected_field",
  "unknown_field"
]);

const GENERIC_RENEWAL_DENIED_CODES = new Set([
  "renewal_denied",
  "licence_not_found",
  "licence_not_eligible",
  "package_not_published",
  "licence_expired",
  "validation_failed",
  "stale_predecessor",
  "renewal_not_after_predecessor",
  "renewal_conflict"
]);

const INVALID_RENEWAL_REQUEST_CODES = new Set([
  "invalid_request",
  "invalid_installation",
  "invalid_renewal_credential",
  "invalid_signature",
  "protected_field",
  "unknown_field"
]);

const STALE_RENEWAL_REQUEST_CODES = new Set([
  "stored_response_expired",
  "stored_response_stale",
  "issue_not_replayable"
]);

const GENERIC_BOOTSTRAP_DENIED_CODES = new Set([
  "activation_code_not_found",
  "activation_code_revoked",
  "activation_code_expired",
  "activation_code_not_usable",
  "licence_not_found",
  "licence_not_eligible",
  "package_not_published",
  "licence_expired",
  "offline_window_expired",
  "invalid_offline_policy",
  "missing_installation_policy",
  "validation_failed",
  "activation_issue_not_found",
  "activation_issue_invalid",
  "activation_issue_expired",
  "installation_mismatch",
  "signature_mismatch",
  "activation_code_conflict",
  "credential_already_bound",
  "credential_bind_conflict",
  "installation_not_found"
]);

const INVALID_BOOTSTRAP_REQUEST_CODES = new Set([
  "invalid_request",
  "invalid_activation_code",
  "invalid_installation",
  "invalid_signature",
  "invalid_credential_digest",
  "protected_field",
  "unknown_field"
]);

function noStore(res) {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  return res;
}

function sendMachineError(res, statusCode, message, options = {}) {
  noStore(res);
  const body = { message };
  if (options.retryable) {
    body.retryable = true;
  }
  return res.status(statusCode).json(body);
}

function mapServiceError(error) {
  if (!(error instanceof PosActivationRedemptionServiceError)) {
    return {
      statusCode: 503,
      message: RETRYABLE_ACTIVATION_FAILURE_MESSAGE,
      retryable: true
    };
  }

  if (INVALID_REQUEST_CODES.has(error.code)) {
    return {
      statusCode: 400,
      message: INVALID_ACTIVATION_REQUEST_MESSAGE,
      retryable: false
    };
  }

  if (GENERIC_DENIED_CODES.has(error.code)) {
    return {
      statusCode: 403,
      message: GENERIC_ACTIVATION_DENIED_MESSAGE,
      retryable: false
    };
  }

  if (error.statusCode === 503 || error.code === "transaction_failed" || error.code === "transaction_unavailable") {
    return {
      statusCode: 503,
      message: RETRYABLE_ACTIVATION_FAILURE_MESSAGE,
      retryable: true
    };
  }

  return {
    statusCode: 403,
    message: GENERIC_ACTIVATION_DENIED_MESSAGE,
    retryable: false
  };
}

function mapRenewalServiceError(error) {
  if (!(error instanceof PosLicenceRenewalServiceError)) {
    return {
      statusCode: 503,
      message: RETRYABLE_RENEWAL_FAILURE_MESSAGE,
      retryable: true
    };
  }

  if (INVALID_RENEWAL_REQUEST_CODES.has(error.code)) {
    return {
      statusCode: 400,
      message: INVALID_RENEWAL_REQUEST_MESSAGE,
      retryable: false
    };
  }

  if (error.code === "renewal_policy_missing" || error.statusCode === 500) {
    return {
      statusCode: 503,
      message: RETRYABLE_RENEWAL_FAILURE_MESSAGE,
      retryable: true
    };
  }

  if (STALE_RENEWAL_REQUEST_CODES.has(error.code)) {
    return {
      statusCode: 409,
      message: STALE_RENEWAL_REQUEST_MESSAGE,
      retryable: false
    };
  }

  if (GENERIC_RENEWAL_DENIED_CODES.has(error.code)) {
    return {
      statusCode: 403,
      message: GENERIC_RENEWAL_DENIED_MESSAGE,
      retryable: false
    };
  }

  if (error.statusCode === 503 || error.code === "transaction_failed" || error.code === "transaction_unavailable") {
    return {
      statusCode: 503,
      message: RETRYABLE_RENEWAL_FAILURE_MESSAGE,
      retryable: true
    };
  }

  return {
    statusCode: 403,
    message: GENERIC_RENEWAL_DENIED_MESSAGE,
    retryable: false
  };
}

function mapBootstrapServiceError(error) {
  if (!(error instanceof PosRenewalCredentialBootstrapServiceError)) {
    return {
      statusCode: 503,
      message: RETRYABLE_BOOTSTRAP_FAILURE_MESSAGE,
      retryable: true
    };
  }

  if (INVALID_BOOTSTRAP_REQUEST_CODES.has(error.code)) {
    return {
      statusCode: 400,
      message: INVALID_BOOTSTRAP_REQUEST_MESSAGE,
      retryable: false
    };
  }

  if (GENERIC_BOOTSTRAP_DENIED_CODES.has(error.code)) {
    return {
      statusCode: 403,
      message: GENERIC_BOOTSTRAP_DENIED_MESSAGE,
      retryable: false
    };
  }

  if (error.statusCode === 503 || error.code === "transaction_failed" || error.code === "transaction_unavailable") {
    return {
      statusCode: 503,
      message: RETRYABLE_BOOTSTRAP_FAILURE_MESSAGE,
      retryable: true
    };
  }

  return {
    statusCode: 403,
    message: GENERIC_BOOTSTRAP_DENIED_MESSAGE,
    retryable: false
  };
}

function createPosActivationController(options = {}) {
  const service = options.service || createPosActivationRedemptionService(options.serviceOptions || {});
  const renewalService = options.renewalService || createPosLicenceRenewalService(options.renewalServiceOptions || {});
  const bootstrapService = options.bootstrapService || createPosRenewalCredentialBootstrapService(options.bootstrapServiceOptions || {});

  async function activateStandard(req, res) {
    try {
      const result = await service.redeemActivation(req.body);
      noStore(res);
      return res.status(200).json(result.signedLicence);
    } catch (error) {
      const mapped = mapServiceError(error);
      return sendMachineError(res, mapped.statusCode, mapped.message, { retryable: mapped.retryable });
    }
  }

  async function renewStandard(req, res) {
    try {
      const signedLicence = await renewalService.renewLicence(req.body);
      noStore(res);
      return res.status(200).json(signedLicence);
    } catch (error) {
      const mapped = mapRenewalServiceError(error);
      return sendMachineError(res, mapped.statusCode, mapped.message, { retryable: mapped.retryable });
    }
  }

  async function bootstrapRenewalCredential(req, res) {
    try {
      const result = await bootstrapService.bootstrapRenewalCredential(req.body);
      noStore(res);
      return res.status(200).json(result.bootstrap);
    } catch (error) {
      const mapped = mapBootstrapServiceError(error);
      return sendMachineError(res, mapped.statusCode, mapped.message, { retryable: mapped.retryable });
    }
  }

  return {
    activateStandard,
    renewStandard,
    bootstrapRenewalCredential
  };
}

module.exports = {
  GENERIC_ACTIVATION_DENIED_MESSAGE,
  GENERIC_BOOTSTRAP_DENIED_MESSAGE,
  GENERIC_RENEWAL_DENIED_MESSAGE,
  INVALID_ACTIVATION_REQUEST_MESSAGE,
  INVALID_BOOTSTRAP_REQUEST_MESSAGE,
  INVALID_RENEWAL_REQUEST_MESSAGE,
  RETRYABLE_ACTIVATION_FAILURE_MESSAGE,
  RETRYABLE_BOOTSTRAP_FAILURE_MESSAGE,
  RETRYABLE_RENEWAL_FAILURE_MESSAGE,
  STALE_RENEWAL_REQUEST_MESSAGE,
  createPosActivationController,
  mapBootstrapServiceError,
  mapServiceError,
  mapRenewalServiceError,
  noStore,
  sendMachineError
};
