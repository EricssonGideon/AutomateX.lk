const crypto = require("node:crypto");

const ACTIVATION_CODE_RANDOM_BYTES = 16;
const ACTIVATION_CODE_PREFIX = "posac_";
const ACTIVATION_CODE_REGEX = /^posac_[0-9a-f]{32}$/;
const ACTIVATION_CODE_DIGEST_PREFIX = "sha256:v1:";
const ACTIVATION_CODE_DIGEST_PURPOSE = "automatex-pos-activation-code:v1:";

function normalizeActivationCode(code) {
  return String(code || "").trim().toLowerCase();
}

function isActivationCodeFormat(value) {
  return ACTIVATION_CODE_REGEX.test(normalizeActivationCode(value));
}

function generateActivationCode() {
  return `${ACTIVATION_CODE_PREFIX}${crypto.randomBytes(ACTIVATION_CODE_RANDOM_BYTES).toString("hex")}`;
}

function digestActivationCode(code) {
  const normalized = normalizeActivationCode(code);
  if (!isActivationCodeFormat(normalized)) {
    throw new Error("POS activation code format is invalid.");
  }

  const digest = crypto
    .createHash("sha256")
    .update(`${ACTIVATION_CODE_DIGEST_PURPOSE}${normalized}`, "utf8")
    .digest("hex");
  return `${ACTIVATION_CODE_DIGEST_PREFIX}${digest}`;
}

module.exports = {
  ACTIVATION_CODE_DIGEST_PREFIX,
  ACTIVATION_CODE_PREFIX,
  ACTIVATION_CODE_RANDOM_BYTES,
  ACTIVATION_CODE_REGEX,
  digestActivationCode,
  generateActivationCode,
  isActivationCodeFormat,
  normalizeActivationCode
};
