const crypto = require("node:crypto");

const RENEWAL_CREDENTIAL_RANDOM_BYTES = 32;
const RENEWAL_CREDENTIAL_PREFIX = "posrc_";
const RENEWAL_CREDENTIAL_REGEX = /^posrc_[0-9a-f]{64}$/;
const RENEWAL_CREDENTIAL_DIGEST_PREFIX = "sha256:v1:";
const RENEWAL_CREDENTIAL_DIGEST_REGEX = /^sha256:v1:[a-f0-9]{64}$/;
const RENEWAL_CREDENTIAL_DIGEST_PURPOSE = "automatex-pos-renewal-credential:v1:";

function normalizeRenewalCredential(credential) {
  return String(credential || "").trim().toLowerCase();
}

function isRenewalCredentialFormat(value) {
  return RENEWAL_CREDENTIAL_REGEX.test(normalizeRenewalCredential(value));
}

function digestRenewalCredential(credential) {
  const normalized = normalizeRenewalCredential(credential);
  if (!isRenewalCredentialFormat(normalized)) {
    throw new Error("POS renewal credential format is invalid.");
  }

  const digest = crypto
    .createHash("sha256")
    .update(`${RENEWAL_CREDENTIAL_DIGEST_PURPOSE}${normalized}`, "utf8")
    .digest("hex");
  return `${RENEWAL_CREDENTIAL_DIGEST_PREFIX}${digest}`;
}

function normalizeRenewalCredentialDigest(digest) {
  return String(digest || "").trim().toLowerCase();
}

function isRenewalCredentialDigestFormat(value) {
  return RENEWAL_CREDENTIAL_DIGEST_REGEX.test(normalizeRenewalCredentialDigest(value));
}

module.exports = {
  RENEWAL_CREDENTIAL_DIGEST_PREFIX,
  RENEWAL_CREDENTIAL_DIGEST_PURPOSE,
  RENEWAL_CREDENTIAL_DIGEST_REGEX,
  RENEWAL_CREDENTIAL_PREFIX,
  RENEWAL_CREDENTIAL_RANDOM_BYTES,
  RENEWAL_CREDENTIAL_REGEX,
  digestRenewalCredential,
  isRenewalCredentialDigestFormat,
  isRenewalCredentialFormat,
  normalizeRenewalCredential,
  normalizeRenewalCredentialDigest
};
