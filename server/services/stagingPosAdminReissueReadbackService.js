const crypto = require("node:crypto");
const mongoose = require("mongoose");

const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const {
  POS_STANDARD_SIGNED_RESPONSE_FIELDS,
  getStandardLicenceSignatureData,
  validateStandardSignedResponseFieldSet
} = require("../utils/posLicenceContract");

const TARGET_LICENCE_ID = "3e50bcf4c418d82b7663e655";

class StagingPosAdminReissueReadbackError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingPosAdminReissueReadbackError";
    this.code = code;
  }
}

function fail(code) {
  throw new StagingPosAdminReissueReadbackError(code);
}

function clean(value) {
  return String(value || "").trim();
}

function canonicalObjectId(value) {
  const text = clean(value && (value._id || value.id || value)).toLowerCase();
  if (!mongoose.Types.ObjectId.isValid(text)) {
    return "";
  }
  const canonical = String(new mongoose.Types.ObjectId(text));
  return canonical === text ? canonical : "";
}

function assertStagingRuntime(env) {
  if (
    clean(env && env.VERCEL) !== "1" ||
    clean(env && env.VERCEL_ENV).toLowerCase() !== "preview" ||
    clean(env && env.VERCEL_GIT_COMMIT_REF) !== "pos-licensing-staging" ||
    clean(env && env.AUTOMATEX_ENV).toLowerCase() !== "staging" ||
    clean(env && env.POS_LICENSING_MODE).toLowerCase() !== "staging"
  ) {
    fail("staging_runtime_required");
  }
}

function configuredStagingVerifier(keyProvider) {
  const keyId = clean(keyProvider && keyProvider.keyId);
  if (
    !keyProvider ||
    typeof keyProvider.getPublicKey !== "function" ||
    !/^automatex-pos-staging-/i.test(keyId) ||
    keyId.length > 120
  ) {
    fail("staging_verification_provider_invalid");
  }
  return keyId;
}

function defaultRepositories() {
  return {
    posInstallations: PosInstallation,
    posLicences: PosLicence,
    posLicenceIssues: PosLicenceIssue
  };
}

async function leanQuery(query, projection) {
  let result = query;
  if (projection && result && typeof result.select === "function") {
    result = result.select(projection);
  }
  if (result && typeof result.lean === "function") {
    result = result.lean();
  }
  return result;
}

async function readAdminReissueRecords(repositories) {
  const [licence, activeInstallations] = await Promise.all([
    leanQuery(
      repositories.posLicences.findById(TARGET_LICENCE_ID),
      "_id clientId activationCount maxInstallations"
    ),
    leanQuery(
      repositories.posInstallations.find({
        licenceId: TARGET_LICENCE_ID,
        status: "active"
      }),
      "_id licenceId deviceInstallationId status lastIssueId"
    )
  ]);
  const installation = Array.isArray(activeInstallations) && activeInstallations.length === 1
    ? activeInstallations[0]
    : null;
  const issue = installation && installation.lastIssueId
    ? await leanQuery(
      repositories.posLicenceIssues.findById(installation.lastIssueId),
      "_id licenceId installationId status issueReason keyId +signedPayload"
    )
    : null;

  return { activeInstallations, installation, issue, licence };
}

function decodeEd25519Signature(signature) {
  const encoded = clean(signature);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    fail("signed_payload_invalid");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== encoded) {
    fail("signed_payload_invalid");
  }
  return bytes;
}

async function verifyAdminReissueRecords(records, keyProvider) {
  const providerKeyId = configuredStagingVerifier(keyProvider);
  const { activeInstallations, installation, issue, licence } = records;
  const licenceClientId = canonicalObjectId(licence && licence.clientId);
  if (
    !licence ||
    canonicalObjectId(licence) !== TARGET_LICENCE_ID ||
    !licenceClientId ||
    licence.activationCount !== 1 ||
    licence.maxInstallations !== 1
  ) {
    fail("licence_invalid");
  }
  if (!Array.isArray(activeInstallations) || activeInstallations.length !== 1 || !installation) {
    fail("active_installation_ambiguous");
  }

  const installationRecordId = canonicalObjectId(installation);
  const expectedIssueId = canonicalObjectId(installation.lastIssueId);
  const issueId = canonicalObjectId(issue);
  if (
    !installationRecordId ||
    canonicalObjectId(installation.licenceId) !== TARGET_LICENCE_ID ||
    installation.status !== "active" ||
    !clean(installation.deviceInstallationId) ||
    !expectedIssueId ||
    !issue ||
    issueId !== expectedIssueId
  ) {
    fail("installation_or_issue_invalid");
  }
  if (
    issue.status !== "issued" ||
    issue.issueReason !== "admin-reissue" ||
    canonicalObjectId(issue.licenceId) !== TARGET_LICENCE_ID ||
    canonicalObjectId(issue.installationId) !== installationRecordId ||
    clean(issue.keyId) !== providerKeyId
  ) {
    fail("issue_invalid");
  }

  const signedPayload = issue.signedPayload;
  if (
    !signedPayload ||
    typeof signedPayload !== "object" ||
    Array.isArray(signedPayload) ||
    validateStandardSignedResponseFieldSet(signedPayload).length ||
    clean(signedPayload.installationId).toLowerCase() !== clean(installation.deviceInstallationId).toLowerCase() ||
    clean(signedPayload.clientId) !== licenceClientId ||
    clean(signedPayload.keyId) !== providerKeyId
  ) {
    fail("signed_payload_invalid");
  }

  let publicKey;
  try {
    publicKey = await keyProvider.getPublicKey();
  } catch {
    fail("verification_key_unavailable");
  }
  if (
    !publicKey ||
    publicKey.type !== "public" ||
    publicKey.asymmetricKeyType !== "ed25519"
  ) {
    fail("verification_key_invalid");
  }

  let verified = false;
  try {
    verified = crypto.verify(
      null,
      Buffer.from(getStandardLicenceSignatureData(signedPayload), "utf8"),
      publicKey,
      decodeEd25519Signature(signedPayload.signature)
    );
  } catch (error) {
    if (error instanceof StagingPosAdminReissueReadbackError) {
      throw error;
    }
    fail("signature_verification_failed");
  }
  if (!verified) {
    fail("signature_verification_failed");
  }

  const signedLicence = Object.fromEntries(
    POS_STANDARD_SIGNED_RESPONSE_FIELDS.map((field) => [
      field,
      Array.isArray(signedPayload[field]) ? [...signedPayload[field]] : signedPayload[field]
    ])
  );
  return Object.freeze({
    licenceId: TARGET_LICENCE_ID,
    installationRecordId,
    issueId,
    signedLicence: Object.freeze(signedLicence)
  });
}

async function readStagingAdminReissue(options = {}) {
  const env = options.env || process.env;
  const repositories = options.repositories || defaultRepositories();
  const keyProvider = options.keyProvider || null;
  assertStagingRuntime(env);
  configuredStagingVerifier(keyProvider);
  const records = await readAdminReissueRecords(repositories);
  return verifyAdminReissueRecords(records, keyProvider);
}

module.exports = {
  StagingPosAdminReissueReadbackError,
  TARGET_LICENCE_ID,
  defaultRepositories,
  readAdminReissueRecords,
  readStagingAdminReissue,
  verifyAdminReissueRecords
};
