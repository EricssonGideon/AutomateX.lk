const crypto = require("node:crypto");

const PosActivationCode = require("../models/PosActivationCode");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const PosPackage = require("../models/PosPackage");
const {
  isRenewalCredentialDigestFormat
} = require("../utils/posRenewalCredentialToken");
const {
  validateLicencePackageConsistency,
  validatePosLicencePolicy,
  validatePosPackagePolicy
} = require("../utils/posLicencePolicy");
const {
  normalizeBootstrapRequest
} = require("./posRenewalCredentialBootstrapService");
const {
  STAGING_FIXTURE_MARKER
} = require("./stagingPosActivationFixtureService");
const {
  credentialState
} = require("./stagingPosRenewalCredentialResetService");

const STAGING_BOOTSTRAP_DIAGNOSTIC_BOOLEAN_FIELDS = Object.freeze([
  "activationCodeMatchesIssueLinkedRecord",
  "activationCodeUsableNow",
  "installationMatches",
  "signedLicenceSignatureMatchesOriginalActivationIssue",
  "activationIssueStillValid",
  "renewalCredentialStateIsClear",
  "renewalCredentialDigestFormatValid",
  "finalBootstrapPreconditionsPass"
]);

const DIAGNOSTIC_CODES = Object.freeze({
  activationCodeMatchesIssueLinkedRecord: Object.freeze([
    "activation_code_issue_link_mismatch",
    "activation_code_issue_link_match"
  ]),
  activationCodeUsableNow: Object.freeze([
    "activation_code_not_usable",
    "activation_code_usable"
  ]),
  installationMatches: Object.freeze([
    "installation_mismatch",
    "installation_match"
  ]),
  signedLicenceSignatureMatchesOriginalActivationIssue: Object.freeze([
    "activation_issue_signature_mismatch",
    "activation_issue_signature_match"
  ]),
  activationIssueStillValid: Object.freeze([
    "activation_issue_not_valid",
    "activation_issue_valid"
  ]),
  renewalCredentialStateIsClear: Object.freeze([
    "renewal_credential_state_not_clear",
    "renewal_credential_state_clear"
  ]),
  renewalCredentialDigestFormatValid: Object.freeze([
    "renewal_credential_digest_format_invalid",
    "renewal_credential_digest_format_valid"
  ]),
  finalBootstrapPreconditionsPass: Object.freeze([
    "bootstrap_preconditions_failed",
    "bootstrap_preconditions_passed"
  ])
});

function idText(value) {
  if (!value) {
    return "";
  }
  return String(value._id || value.id || value);
}

function dateValue(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeTextEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left || !right) {
    return false;
  }
  const leftDigest = crypto.createHash("sha256").update(left, "utf8").digest();
  const rightDigest = crypto.createHash("sha256").update(right, "utf8").digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function defaultRepositories() {
  return {
    posActivationCodes: PosActivationCode,
    posInstallations: PosInstallation,
    posLicences: PosLicence,
    posLicenceIssues: PosLicenceIssue,
    posPackages: PosPackage
  };
}

async function readMany(repository, query, options = {}) {
  let result = repository.find(query);
  if (result && typeof result.select === "function" && options.select) {
    result = result.select(options.select);
  }
  if (result && typeof result.lean === "function") {
    result = result.lean();
  }
  return await result || [];
}

async function readOne(repository, query, options = {}) {
  let result = repository.findOne(query);
  if (result && typeof result.select === "function" && options.select) {
    result = result.select(options.select);
  }
  if (result && typeof result.lean === "function") {
    result = result.lean();
  }
  return result;
}

async function readById(repository, id, options = {}) {
  let result = repository.findById(id);
  if (result && typeof result.select === "function" && options.select) {
    result = result.select(options.select);
  }
  if (result && typeof result.lean === "function") {
    result = result.lean();
  }
  return result;
}

function createBootstrapDiagnosticResult(values = {}, responseCode = "") {
  const result = {};
  for (const field of STAGING_BOOTSTRAP_DIAGNOSTIC_BOOLEAN_FIELDS) {
    result[field] = values[field] === true;
  }
  const prerequisiteFields = STAGING_BOOTSTRAP_DIAGNOSTIC_BOOLEAN_FIELDS.slice(0, -1);
  result.finalBootstrapPreconditionsPass =
    result.finalBootstrapPreconditionsPass &&
    prerequisiteFields.every((field) => result[field]);

  const checkCodes = {};
  for (const field of STAGING_BOOTSTRAP_DIAGNOSTIC_BOOLEAN_FIELDS) {
    checkCodes[field] = DIAGNOSTIC_CODES[field][result[field] ? 1 : 0];
  }

  return Object.freeze({
    code: responseCode || (
      result.finalBootstrapPreconditionsPass
        ? "staging_bootstrap_diagnostic_passed"
        : "staging_bootstrap_diagnostic_failed"
    ),
    ...result,
    checkCodes: Object.freeze(checkCodes)
  });
}

function licenceAndPackageRemainEligible(licence, posPackage, now) {
  if (!licence || !posPackage || licence.status !== "active" || posPackage.status !== "active") {
    return false;
  }
  const licenceExpiry = dateValue(licence.licenceExpiry);
  const offlineValidUntil = dateValue(licence.offlineValidUntil);
  if (
    !licenceExpiry ||
    !offlineValidUntil ||
    licenceExpiry.getTime() <= now.getTime() ||
    offlineValidUntil.getTime() <= now.getTime() ||
    offlineValidUntil.getTime() > licenceExpiry.getTime()
  ) {
    return false;
  }
  return [
    ...validatePosLicencePolicy(licence, { requireIssuable: true }),
    ...validatePosPackagePolicy(posPackage, { requireIssuable: true }),
    ...validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true })
  ].filter(Boolean).length === 0;
}

function activationCodeIsUsable(activationCode, now) {
  const expiresAt = dateValue(activationCode && activationCode.expiresAt);
  return Boolean(
    activationCode &&
    ["active", "redeemed"].includes(activationCode.status) &&
    expiresAt &&
    expiresAt.getTime() > now.getTime()
  );
}

function activationIssueIsValid(issue, licence, posPackage, now) {
  const licenceExpiry = dateValue(issue && issue.licenceExpiry);
  const offlineValidUntil = dateValue(issue && issue.offlineValidUntil);
  return Boolean(
    issue &&
    issue.status === "issued" &&
    issue.issueReason === "activation" &&
    issue.signedPayload &&
    typeof issue.signedPayload === "object" &&
    !Array.isArray(issue.signedPayload) &&
    licenceExpiry &&
    offlineValidUntil &&
    licenceExpiry.getTime() > now.getTime() &&
    offlineValidUntil.getTime() > now.getTime() &&
    offlineValidUntil.getTime() <= licenceExpiry.getTime() &&
    licenceAndPackageRemainEligible(licence, posPackage, now)
  );
}

function createStagingPosRenewalBootstrapDiagnosticService(options = {}) {
  const repositories = options.repositories || defaultRepositories();
  const clock = options.clock || (() => new Date());

  return {
    async diagnoseBootstrap(requestPayload) {
      const renewalCredentialDigestFormatValid = Boolean(
        requestPayload &&
        typeof requestPayload === "object" &&
        !Array.isArray(requestPayload) &&
        isRenewalCredentialDigestFormat(requestPayload.renewalCredentialDigest)
      );

      let request;
      try {
        request = normalizeBootstrapRequest(requestPayload);
      } catch {
        return createBootstrapDiagnosticResult({
          renewalCredentialDigestFormatValid
        }, "staging_bootstrap_diagnostic_invalid_request");
      }

      const now = clock();
      const licences = await readMany(repositories.posLicences, {
        notes: STAGING_FIXTURE_MARKER
      });
      if (licences.length !== 1) {
        return createBootstrapDiagnosticResult({
          renewalCredentialDigestFormatValid
        });
      }

      const licence = licences[0];
      const activationCode = await readOne(repositories.posActivationCodes, {
        licenceId: licence._id,
        codeHash: request.codeHash
      });
      const issues = activationCode
        ? await readMany(repositories.posLicenceIssues, {
          licenceId: licence._id,
          activationCodeId: activationCode._id,
          issueReason: "activation",
          status: "issued"
        }, { select: "+signedPayload" })
        : [];
      const issue = issues.length === 1 ? issues[0] : null;
      const installation = issue
        ? await readById(repositories.posInstallations, issue.installationId, {
          select: "+renewalCredentialHash"
        })
        : null;
      const posPackage = licence.packageId
        ? await readById(repositories.posPackages, licence.packageId)
        : null;

      const activationCodeMatchesIssueLinkedRecord = Boolean(
        activationCode &&
        issue &&
        idText(activationCode.licenceId) === idText(licence) &&
        idText(issue.licenceId) === idText(licence) &&
        idText(issue.activationCodeId) === idText(activationCode)
      );
      const activationCodeUsableNow =
        activationCodeMatchesIssueLinkedRecord && activationCodeIsUsable(activationCode, now);
      const installationMatches = Boolean(
        issue &&
        installation &&
        idText(issue.installationId) === idText(installation) &&
        idText(installation.licenceId) === idText(licence) &&
        installation.status === "active" &&
        installation.deviceInstallationId === request.deviceInstallationId &&
        issue.signedPayload &&
        issue.signedPayload.installationId === request.deviceInstallationId
      );
      const signedLicenceSignatureMatchesOriginalActivationIssue = Boolean(
        issue &&
        issue.signedPayload &&
        safeTextEqual(issue.signedPayload.signature, request.signedLicenceSignature)
      );
      const activationIssueStillValid = activationIssueIsValid(
        issue,
        licence,
        posPackage,
        now
      );
      const renewalCredentialStateIsClear = Boolean(
        installationMatches && credentialState(installation) === "clear"
      );
      const finalBootstrapPreconditionsPass = [
        activationCodeMatchesIssueLinkedRecord,
        activationCodeUsableNow,
        installationMatches,
        signedLicenceSignatureMatchesOriginalActivationIssue,
        activationIssueStillValid,
        renewalCredentialStateIsClear,
        renewalCredentialDigestFormatValid
      ].every(Boolean);

      return createBootstrapDiagnosticResult({
        activationCodeMatchesIssueLinkedRecord,
        activationCodeUsableNow,
        installationMatches,
        signedLicenceSignatureMatchesOriginalActivationIssue,
        activationIssueStillValid,
        renewalCredentialStateIsClear,
        renewalCredentialDigestFormatValid,
        finalBootstrapPreconditionsPass
      });
    }
  };
}

module.exports = {
  STAGING_BOOTSTRAP_DIAGNOSTIC_BOOLEAN_FIELDS,
  createBootstrapDiagnosticResult,
  createStagingPosRenewalBootstrapDiagnosticService
};
