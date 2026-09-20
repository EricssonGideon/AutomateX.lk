const User = require("../models/User");
const Project = require("../models/Project");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosPackage = require("../models/PosPackage");
const {
  validateLicencePackageConsistency,
  validatePosLicencePolicy
} = require("../utils/posLicencePolicy");

const FIXTURE_CLIENT_EMAIL = "pos-licensing-staging-fixture@staging.invalid";
const FIXTURE_CLIENT_NAME = "POS Licensing Staging Test Client";
const FIXTURE_MARKER = "automatex-pos-licensing-staging-test-fixture-v1";
const FIXTURE_PACKAGE_CODE = "pos-standard-staging-test-v1";
const FIXTURE_PACKAGE_NAME = "[STAGING TEST] POS Standard";
const FIXTURE_PROJECT_TITLE = "[STAGING TEST] POS Standard Activation";
const MINIMUM_CODE_LIFETIME_MS = 30 * 60 * 1000;

function clean(value) {
  return String(value || "").trim();
}

function idText(value) {
  return value ? String(value._id || value.id || value) : "";
}

async function leanMany(query, projection) {
  let result = query;
  if (projection && result && typeof result.select === "function") {
    result = result.select(projection);
  }
  if (result && typeof result.lean === "function") {
    result = result.lean();
  }
  return await result || [];
}

function defaultRepositories() {
  return {
    users: User,
    projects: Project,
    posPackages: PosPackage,
    posLicences: PosLicence,
    posInstallations: PosInstallation
  };
}

async function readFixtureRecords(repositories = defaultRepositories()) {
  const [clients, projects, packages, licences, admins] = await Promise.all([
    leanMany(repositories.users.find({ email: FIXTURE_CLIENT_EMAIL }),
      "_id name email role status accountStatus isActive businessName"),
    leanMany(repositories.projects.find({
      projectTitle: FIXTURE_PROJECT_TITLE,
      adminNotes: FIXTURE_MARKER
    }), "_id clientId projectTitle projectType status adminNotes"),
    leanMany(repositories.posPackages.find({ packageCode: FIXTURE_PACKAGE_CODE }),
      "_id packageCode name edition status moduleIds updateChannels notes"),
    leanMany(repositories.posLicences.find({ notes: FIXTURE_MARKER }),
      "_id clientId projectId packageId edition status entitledModules updateChannel licenceExpiry maxInstallations activationCount notes"),
    leanMany(repositories.users.find({ role: "admin", status: "active", isActive: { $ne: false } }),
      "_id role status isActive")
  ]);

  let installations = [];
  if (licences.length === 1) {
    installations = await leanMany(repositories.posInstallations.find({
      licenceId: licences[0]._id
    }), "_id licenceId status");
  }

  return { clients, projects, packages, licences, installations, admins };
}

function evaluateFixtureEligibility(records, now = new Date()) {
  const blockers = [];
  const exactlyOne = (items, code) => {
    if (!Array.isArray(items) || items.length !== 1) {
      blockers.push(code);
      return null;
    }
    return items[0];
  };

  const client = exactlyOne(records.clients, "fixture_client_missing_or_ambiguous");
  const project = exactlyOne(records.projects, "fixture_project_missing_or_ambiguous");
  const posPackage = exactlyOne(records.packages, "fixture_package_missing_or_ambiguous");
  const licence = exactlyOne(records.licences, "fixture_licence_missing_or_ambiguous");
  const installations = Array.isArray(records.installations) ? records.installations : [];
  const admins = Array.isArray(records.admins) ? records.admins : [];

  if (client && (
    client.email !== FIXTURE_CLIENT_EMAIL ||
    client.name !== FIXTURE_CLIENT_NAME ||
    client.role !== "client" ||
    client.businessName !== FIXTURE_MARKER
  )) {
    blockers.push("fixture_client_identity_mismatch");
  }
  if (project && client && (
    project.projectTitle !== FIXTURE_PROJECT_TITLE ||
    project.projectType !== "POS System" ||
    project.adminNotes !== FIXTURE_MARKER ||
    idText(project.clientId) !== idText(client)
  )) {
    blockers.push("fixture_project_identity_mismatch");
  }
  if (posPackage && (
    posPackage.packageCode !== FIXTURE_PACKAGE_CODE ||
    posPackage.name !== FIXTURE_PACKAGE_NAME ||
    posPackage.edition !== "standard" ||
    posPackage.notes !== FIXTURE_MARKER
  )) {
    blockers.push("fixture_package_identity_mismatch");
  }
  if (licence && client && project && posPackage && (
    licence.notes !== FIXTURE_MARKER ||
    licence.edition !== "standard" ||
    idText(licence.clientId) !== idText(client) ||
    idText(licence.projectId) !== idText(project) ||
    idText(licence.packageId) !== idText(posPackage)
  )) {
    blockers.push("fixture_licence_identity_mismatch");
  }

  if (posPackage && posPackage.status !== "active") {
    blockers.push("fixture_package_not_active");
  }
  if (licence && licence.status !== "active") {
    blockers.push("fixture_licence_not_active");
  }

  const expiry = licence && licence.licenceExpiry ? new Date(licence.licenceExpiry) : null;
  const expiryTime = expiry && !Number.isNaN(expiry.getTime()) ? expiry.getTime() : null;
  if (licence && expiryTime === null) {
    blockers.push("fixture_licence_expiry_invalid");
  } else if (expiryTime !== null && expiryTime <= now.getTime()) {
    blockers.push("fixture_licence_expired");
  } else if (expiryTime !== null && expiryTime < now.getTime() + MINIMUM_CODE_LIFETIME_MS) {
    blockers.push("fixture_licence_expiry_too_short");
  }

  if (licence && posPackage) {
    const policyErrors = [
      ...validatePosLicencePolicy(licence, { requireIssuable: true }),
      ...validateLicencePackageConsistency(licence, posPackage, { requireIssuable: true })
    ];
    if (policyErrors.length) {
      blockers.push("fixture_licence_not_issuance_eligible");
    }
  }

  const issuanceBlockerCodes = new Set([
    "fixture_client_missing_or_ambiguous",
    "fixture_project_missing_or_ambiguous",
    "fixture_package_missing_or_ambiguous",
    "fixture_licence_missing_or_ambiguous",
    "fixture_client_identity_mismatch",
    "fixture_project_identity_mismatch",
    "fixture_package_identity_mismatch",
    "fixture_licence_identity_mismatch",
    "fixture_package_not_active",
    "fixture_licence_not_active",
    "fixture_licence_expiry_invalid",
    "fixture_licence_expired",
    "fixture_licence_expiry_too_short",
    "fixture_licence_not_issuance_eligible"
  ]);
  const activationCodeIssuanceEligible = blockers.every((code) => !issuanceBlockerCodes.has(code));

  const maxInstallations = licence ? Number(licence.maxInstallations) : null;
  const activationCount = licence ? Number(licence.activationCount || 0) : null;
  const activeInstallationCount = installations.filter((installation) =>
    installation.status === "active" && licence && idText(installation.licenceId) === idText(licence)
  ).length;
  const validInstallationPolicy = Number.isSafeInteger(maxInstallations) && maxInstallations > 0 &&
    Number.isSafeInteger(activationCount) && activationCount >= 0;
  if (licence && !validInstallationPolicy) {
    blockers.push("fixture_installation_policy_invalid");
  }
  const freshInstallationAllowed = Boolean(
    activationCodeIssuanceEligible && licence && validInstallationPolicy &&
    activationCount < maxInstallations
  );
  if (licence && validInstallationPolicy && activationCount >= maxInstallations) {
    blockers.push("fixture_installation_limit_reached");
  }

  const validStagingAdminAvailable = admins.some((admin) =>
    admin && admin._id && admin.role === "admin" && admin.status === "active" &&
    admin.isActive !== false
  );
  if (!validStagingAdminAvailable) {
    blockers.push("staging_admin_unavailable");
  }

  const uniqueBlockers = [...new Set(blockers)];
  return Object.freeze({
    fixtureLicenceId: licence ? idText(licence) : null,
    packageStatus: posPackage ? clean(posPackage.status) || null : null,
    licenceStatus: licence ? clean(licence.status) || null : null,
    licenceExpiry: expiryTime === null ? null : new Date(expiryTime).toISOString(),
    maxInstallations: Number.isSafeInteger(maxInstallations) ? maxInstallations : null,
    activationCount: Number.isSafeInteger(activationCount) ? activationCount : null,
    activeInstallationCount,
    freshInstallationAllowed,
    activationCodeIssuanceEligible,
    validStagingAdminAvailable,
    safeToProceedWithOneNewActivationCode:
      activationCodeIssuanceEligible && freshInstallationAllowed && validStagingAdminAvailable,
    blockers: Object.freeze(uniqueBlockers)
  });
}

function createStagingPosActivationEligibilityService(options = {}) {
  const repositories = options.repositories || defaultRepositories();
  const clock = options.clock || (() => new Date());

  return Object.freeze({
    async checkEligibility() {
      const records = await readFixtureRecords(repositories);
      return evaluateFixtureEligibility(records, clock());
    }
  });
}

module.exports = {
  FIXTURE_CLIENT_EMAIL,
  FIXTURE_CLIENT_NAME,
  FIXTURE_MARKER,
  FIXTURE_PACKAGE_CODE,
  FIXTURE_PACKAGE_NAME,
  FIXTURE_PROJECT_TITLE,
  MINIMUM_CODE_LIFETIME_MS,
  createStagingPosActivationEligibilityService,
  defaultRepositories,
  evaluateFixtureEligibility,
  readFixtureRecords
};
