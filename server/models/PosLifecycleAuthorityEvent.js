const mongoose = require("mongoose");

const { POS_EDITION_STANDARD } = require("../utils/posLicenceContract");

const POS_LIFECYCLE_AUTHORITY_ACTIONS = Object.freeze([
  "deactivate",
  "replace-installation",
  "rotate-renewal-credential"
]);
const POS_LIFECYCLE_AUTHORITY_STATES = Object.freeze(["prepared", "issued", "void"]);

const posLifecycleAuthorityEventSchema = new mongoose.Schema(
  {
    commandId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160
    },
    sequence: {
      type: Number,
      required: true,
      min: 1
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    licenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PosLicence",
      required: true,
      index: true
    },
    installationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PosInstallation",
      required: true,
      index: true
    },
    deviceInstallationId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    edition: {
      type: String,
      enum: [POS_EDITION_STANDARD],
      default: POS_EDITION_STANDARD,
      required: true
    },
    action: {
      type: String,
      enum: POS_LIFECYCLE_AUTHORITY_ACTIONS,
      required: true
    },
    status: {
      type: String,
      enum: POS_LIFECYCLE_AUTHORITY_STATES,
      default: "prepared",
      required: true
    },
    keyId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    issuedAt: {
      type: Date,
      required: true
    },
    notAfter: {
      type: Date,
      required: true
    },
    payloadDigest: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    actionPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false
    },
    signedEnvelope: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  {
    timestamps: true,
    strict: "throw",
    autoCreate: false,
    autoIndex: false
  }
);

posLifecycleAuthorityEventSchema.pre("validate", function validateAuthorityEvent(next) {
  this.commandId = String(this.commandId || "").trim().toLowerCase();
  this.deviceInstallationId = String(this.deviceInstallationId || "").trim().toLowerCase();
  if (!Number.isSafeInteger(Number(this.sequence)) || Number(this.sequence) < 1) {
    this.invalidate("sequence", "Lifecycle authority sequence must be a positive integer.");
  }
  if (this.issuedAt && this.notAfter && new Date(this.notAfter).getTime() <= new Date(this.issuedAt).getTime()) {
    this.invalidate("notAfter", "Lifecycle authority notAfter must be after issuedAt.");
  }
  next();
});

posLifecycleAuthorityEventSchema.index({ commandId: 1 }, { unique: true });
posLifecycleAuthorityEventSchema.index({ installationId: 1, sequence: 1 }, { unique: true });
posLifecycleAuthorityEventSchema.index({ licenceId: 1, issuedAt: -1 });
posLifecycleAuthorityEventSchema.index({ clientId: 1, issuedAt: -1 });
posLifecycleAuthorityEventSchema.index({ status: 1, notAfter: 1 });

module.exports = mongoose.model("PosLifecycleAuthorityEvent", posLifecycleAuthorityEventSchema);
module.exports.POS_LIFECYCLE_AUTHORITY_ACTIONS = POS_LIFECYCLE_AUTHORITY_ACTIONS;
module.exports.POS_LIFECYCLE_AUTHORITY_STATES = POS_LIFECYCLE_AUTHORITY_STATES;
