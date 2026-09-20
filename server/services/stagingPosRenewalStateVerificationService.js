const User = require("../models/User");
const Project = require("../models/Project");
const PosActivationCode = require("../models/PosActivationCode");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const PosPackage = require("../models/PosPackage");
const {
  STAGING_FIXTURE_CLIENT_EMAIL,
  STAGING_FIXTURE_MARKER,
  STAGING_FIXTURE_PACKAGE_CODE,
  STAGING_FIXTURE_PROJECT_TITLE
} = require("./stagingPosActivationFixtureService");

const EXPECTED_RENEWAL_ISSUED_AT = "2026-09-20T06:36:19.524Z";
const EXPECTED_RENEWAL_OFFLINE_VALID_UNTIL = "2026-09-20T07:36:19.524Z";
const STAGING_RENEWAL_STATE_BOOLEAN_FIELDS = Object.freeze([
  "installationLastIssueIsRenewal",
  "latestIssueStatusIssued",
  "renewalCredentialVersionIs1",
  "lastRenewedAtPresent",
  "latestIssuedAtMatchesExpected",
  "latestOfflineValidUntilMatchesExpected",
  "activationIssueStillExists",
  "renewalCredentialBound",
  "duplicateRenewalIssueDetected",
  "unrelatedFixtureStateIntact"
]);

function idText(value) {
  if (!value) {
    return "";
  }
  return String(value._id || value.id || value);
}

function dateTime(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function sameDate(value, expected) {
  return dateTime(value) === dateTime(expected);
}

function createRenewalStateVerificationResult(values = {}) {
  const result = {};
  for (const field of STAGING_RENEWAL_STATE_BOOLEAN_FIELDS) {
    result[field] = values[field] === true;
  }
  const renewalIssueCount = Number.isSafeInteger(values.renewalIssueCount) && values.renewalIssueCount >= 0
    ? values.renewalIssueCount
    : 0;
  const positiveFields = STAGING_RENEWAL_STATE_BOOLEAN_FIELDS.filter(
    (field) => field !== "duplicateRenewalIssueDetected"
  );

  return Object.freeze({
    ...result,
    renewalIssueCount,
    overallPass:
      positiveFields.every((field) => result[field]) &&
      result.duplicateRenewalIssueDetected === false &&
      renewalIssueCount === 1
  });
}

function defaultRepositories() {
  return {
    users: User,
    projects: Project,
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

function recordPredatesRenewal(record) {
  const updatedAt = dateTime(record && record.updatedAt);
  const createdAt = dateTime(record && record.createdAt);
  const comparisonTime = updatedAt || createdAt;
  return comparisonTime !== null && comparisonTime <= dateTime(EXPECTED_RENEWAL_ISSUED_AT);
}

function controlledFixtureIdentityIsIntact(records) {
  const {
    clients,
    projects,
    packages,
    licences,
    installations,
    activationCodes,
    activationIssues,
    renewalIssues,
    issues
  } = records;
  if (
    clients.length !== 1 ||
    projects.length !== 1 ||
    packages.length !== 1 ||
    licences.length !== 1 ||
    installations.length !== 1 ||
    activationIssues.length !== 1 ||
    activationCodes.length < 1 ||
    issues.length !== activationIssues.length + renewalIssues.length
  ) {
    return false;
  }

  const client = clients[0];
  const project = projects[0];
  const posPackage = packages[0];
  const licence = licences[0];
  const installation = installations[0];
  const activationIssue = activationIssues[0];

  return Boolean(
    client.email === STAGING_FIXTURE_CLIENT_EMAIL &&
    client.role === "client" &&
    client.businessName === STAGING_FIXTURE_MARKER &&
    project.projectTitle === STAGING_FIXTURE_PROJECT_TITLE &&
    project.projectType === "POS System" &&
    project.adminNotes === STAGING_FIXTURE_MARKER &&
    idText(project.clientId) === idText(client) &&
    posPackage.packageCode === STAGING_FIXTURE_PACKAGE_CODE &&
    posPackage.notes === STAGING_FIXTURE_MARKER &&
    posPackage.edition === "standard" &&
    posPackage.status === "active" &&
    licence.notes === STAGING_FIXTURE_MARKER &&
    licence.edition === "standard" &&
    licence.status === "active" &&
    Number(licence.maxInstallations) === 1 &&
    Number(licence.activationCount) === 1 &&
    Number(licence.renewalWindowDurationMinutes) === 60 &&
    idText(licence.clientId) === idText(client) &&
    idText(licence.projectId) === idText(project) &&
    idText(licence.packageId) === idText(posPackage) &&
    installation.status === "active" &&
    idText(installation.licenceId) === idText(licence) &&
    idText(activationIssue.licenceId) === idText(licence) &&
    idText(activationIssue.installationId) === idText(installation) &&
    activationCodes.every((activationCode) =>
      idText(activationCode.licenceId) === idText(licence) &&
      Number(activationCode.maxRedemptions) === 1 &&
      recordPredatesRenewal(activationCode)
    ) &&
    [client, project, posPackage, licence, activationIssue].every(recordPredatesRenewal)
  );
}

function duplicateRenewalIssueExists(renewalIssues) {
  const keys = new Set();
  for (const issue of renewalIssues) {
    const predecessorSignatureHash = String(issue.predecessorSignatureHash || "");
    const renewalCredentialVersion = Number(issue.renewalCredentialVersion || 0);
    if (!predecessorSignatureHash) {
      return true;
    }
    const key = `${predecessorSignatureHash}:${renewalCredentialVersion}`;
    if (keys.has(key)) {
      return true;
    }
    keys.add(key);
  }
  return false;
}

function createStagingPosRenewalStateVerificationService(options = {}) {
  const repositories = options.repositories || defaultRepositories();

  return {
    async verifyRenewalState() {
      const [clients, projects, packages, licences] = await Promise.all([
        readMany(repositories.users, { email: STAGING_FIXTURE_CLIENT_EMAIL }),
        readMany(repositories.projects, {
          projectTitle: STAGING_FIXTURE_PROJECT_TITLE,
          adminNotes: STAGING_FIXTURE_MARKER
        }),
        readMany(repositories.posPackages, { packageCode: STAGING_FIXTURE_PACKAGE_CODE }),
        readMany(repositories.posLicences, { notes: STAGING_FIXTURE_MARKER })
      ]);

      if (licences.length !== 1) {
        return createRenewalStateVerificationResult();
      }

      const licence = licences[0];
      const [installations, activationCodes, issues] = await Promise.all([
        readMany(repositories.posInstallations, { licenceId: licence._id }, {
          select: "+renewalCredentialHash"
        }),
        readMany(repositories.posActivationCodes, { licenceId: licence._id }),
        readMany(repositories.posLicenceIssues, { licenceId: licence._id }, {
          select: "+signedPayload +predecessorSignatureHash"
        })
      ]);

      const installation = installations.length === 1 ? installations[0] : null;
      const activationIssues = issues.filter((issue) => issue.issueReason === "activation");
      const renewalIssues = issues.filter((issue) => issue.issueReason === "renewal");
      const latestIssue = installation
        ? issues.find((issue) => idText(issue) === idText(installation.lastIssueId)) || null
        : null;
      const latestPayload = latestIssue && latestIssue.signedPayload &&
        typeof latestIssue.signedPayload === "object" &&
        !Array.isArray(latestIssue.signedPayload)
        ? latestIssue.signedPayload
        : null;

      const installationLastIssueIsRenewal = Boolean(
        installation &&
        latestIssue &&
        latestIssue.issueReason === "renewal" &&
        idText(latestIssue.installationId) === idText(installation)
      );
      const latestIssueStatusIssued = Boolean(latestIssue && latestIssue.status === "issued");
      const renewalCredentialVersionIs1 = Boolean(
        installation &&
        latestIssue &&
        Number(installation.renewalCredentialVersion) === 1 &&
        Number(latestIssue.renewalCredentialVersion) === 1
      );
      const lastRenewedAtPresent = Boolean(
        installation && sameDate(installation.lastRenewedAt, EXPECTED_RENEWAL_ISSUED_AT)
      );
      const latestIssuedAtMatchesExpected = Boolean(
        latestIssue &&
        latestPayload &&
        sameDate(latestIssue.issuedAt, EXPECTED_RENEWAL_ISSUED_AT) &&
        sameDate(latestPayload.issuedAt, EXPECTED_RENEWAL_ISSUED_AT) &&
        latestPayload.licenceStatus === "active"
      );
      const latestOfflineValidUntilMatchesExpected = Boolean(
        latestIssue &&
        latestPayload &&
        sameDate(latestIssue.offlineValidUntil, EXPECTED_RENEWAL_OFFLINE_VALID_UNTIL) &&
        sameDate(latestPayload.offlineValidUntil, EXPECTED_RENEWAL_OFFLINE_VALID_UNTIL)
      );
      const activationIssueStillExists = Boolean(
        activationIssues.length === 1 &&
        activationIssues[0].status === "issued" &&
        activationIssues[0].activationCodeId &&
        activationIssues[0].signedPayload &&
        idText(activationIssues[0].installationId) === idText(installation)
      );
      const renewalCredentialBound = Boolean(
        installation &&
        typeof installation.renewalCredentialHash === "string" &&
        installation.renewalCredentialHash.length > 0 &&
        Number(installation.renewalCredentialVersion) === 1 &&
        dateTime(installation.renewalCredentialBoundAt) !== null
      );
      const duplicateRenewalIssueDetected = duplicateRenewalIssueExists(renewalIssues);
      const unrelatedFixtureStateIntact = controlledFixtureIdentityIsIntact({
        clients,
        projects,
        packages,
        licences,
        installations,
        activationCodes,
        activationIssues,
        renewalIssues,
        issues
      });

      return createRenewalStateVerificationResult({
        installationLastIssueIsRenewal,
        latestIssueStatusIssued,
        renewalCredentialVersionIs1,
        lastRenewedAtPresent,
        latestIssuedAtMatchesExpected,
        latestOfflineValidUntilMatchesExpected,
        activationIssueStillExists,
        renewalCredentialBound,
        duplicateRenewalIssueDetected,
        unrelatedFixtureStateIntact,
        renewalIssueCount: renewalIssues.length
      });
    }
  };
}

module.exports = {
  EXPECTED_RENEWAL_ISSUED_AT,
  EXPECTED_RENEWAL_OFFLINE_VALID_UNTIL,
  STAGING_RENEWAL_STATE_BOOLEAN_FIELDS,
  createRenewalStateVerificationResult,
  createStagingPosRenewalStateVerificationService
};
