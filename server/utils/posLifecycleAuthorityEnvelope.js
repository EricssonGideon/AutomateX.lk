const crypto = require("node:crypto");

const PosLifecycleAuthorityEvent = require("../models/PosLifecycleAuthorityEvent");
const { APPROVED_PRODUCTION_KEY_ID } = require("../config/posLicensingProduction");
const {
  POS_EDITION_STANDARD,
  canonicalizeStandardJsonForSignature
} = require("./posLicenceContract");

const { POS_LIFECYCLE_AUTHORITY_ACTIONS } = PosLifecycleAuthorityEvent;
const POS_LIFECYCLE_AUTHORITY_SCHEMA_VERSION = 1;
const POS_LIFECYCLE_AUTHORITY_FIELDS = Object.freeze([
  "schemaVersion",
  "keyId",
  "commandId",
  "sequence",
  "clientId",
  "installationId",
  "edition",
  "action",
  "issuedAt",
  "notAfter",
  "payload",
  "signature"
]);

class PosLifecycleAuthorityEnvelopeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PosLifecycleAuthorityEnvelopeError";
    this.code = code;
  }
}

function requiredText(value, name) {
  const text = String(value || "").trim();
  if (!text || text.length > 160) {
    throw new PosLifecycleAuthorityEnvelopeError("invalid_authority_envelope", `${name} is invalid.`);
  }
  return text;
}

function isoDate(value, name) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PosLifecycleAuthorityEnvelopeError("invalid_authority_envelope", `${name} is invalid.`);
  }
  return date.toISOString();
}

function assertMonotonicLifecycleSequence(previousSequence, nextSequence) {
  const previous = Number(previousSequence);
  const next = Number(nextSequence);
  if (!Number.isSafeInteger(previous) || previous < 0 || !Number.isSafeInteger(next) || next !== previous + 1) {
    throw new PosLifecycleAuthorityEnvelopeError("non_monotonic_sequence", "Lifecycle authority sequence must advance by exactly one.");
  }
  return next;
}

function buildLifecycleAuthorityEnvelope(input = {}) {
  const sequence = Number(input.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new PosLifecycleAuthorityEnvelopeError("invalid_authority_envelope", "sequence is invalid.");
  }
  const action = requiredText(input.action, "action").toLowerCase();
  if (!POS_LIFECYCLE_AUTHORITY_ACTIONS.includes(action)) {
    throw new PosLifecycleAuthorityEnvelopeError("invalid_authority_envelope", "action is invalid.");
  }
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    throw new PosLifecycleAuthorityEnvelopeError("invalid_authority_envelope", "payload is invalid.");
  }
  if (input.keyId !== APPROVED_PRODUCTION_KEY_ID) {
    throw new PosLifecycleAuthorityEnvelopeError("unapproved_key_id", "Lifecycle authority key ID is not approved.");
  }
  if (Object.prototype.hasOwnProperty.call(input, "previousSequence")) {
    assertMonotonicLifecycleSequence(input.previousSequence, sequence);
  }
  const issuedAt = isoDate(input.issuedAt, "issuedAt");
  const notAfter = isoDate(input.notAfter, "notAfter");
  if (new Date(notAfter).getTime() <= new Date(issuedAt).getTime()) {
    throw new PosLifecycleAuthorityEnvelopeError("invalid_authority_envelope", "notAfter must be after issuedAt.");
  }

  return {
    schemaVersion: POS_LIFECYCLE_AUTHORITY_SCHEMA_VERSION,
    keyId: requiredText(input.keyId, "keyId"),
    commandId: requiredText(input.commandId, "commandId").toLowerCase(),
    sequence,
    clientId: requiredText(input.clientId, "clientId"),
    installationId: requiredText(input.installationId, "installationId").toLowerCase(),
    edition: POS_EDITION_STANDARD,
    action,
    issuedAt,
    notAfter,
    payload: input.payload,
    signature: ""
  };
}

function getLifecycleAuthoritySignatureData(envelope) {
  const unsigned = { ...(envelope || {}) };
  delete unsigned.signature;
  return canonicalizeStandardJsonForSignature(unsigned);
}

async function signLifecycleAuthorityEnvelope(input, keyProvider) {
  const envelope = buildLifecycleAuthorityEnvelope(input);
  if (!keyProvider || typeof keyProvider.getPrivateKey !== "function" || keyProvider.keyId !== envelope.keyId) {
    throw new PosLifecycleAuthorityEnvelopeError("signing_key_unavailable", "An approved lifecycle authority signing provider is required.");
  }
  const privateKey = await keyProvider.getPrivateKey();
  if (!(privateKey instanceof crypto.KeyObject) || privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") {
    throw new PosLifecycleAuthorityEnvelopeError("signing_key_invalid", "The lifecycle authority signing key is invalid.");
  }
  return {
    ...envelope,
    signature: crypto.sign(null, Buffer.from(getLifecycleAuthoritySignatureData(envelope), "utf8"), privateKey).toString("base64")
  };
}

module.exports = {
  POS_LIFECYCLE_AUTHORITY_FIELDS,
  POS_LIFECYCLE_AUTHORITY_SCHEMA_VERSION,
  PosLifecycleAuthorityEnvelopeError,
  assertMonotonicLifecycleSequence,
  buildLifecycleAuthorityEnvelope,
  getLifecycleAuthoritySignatureData,
  signLifecycleAuthorityEnvelope
};
