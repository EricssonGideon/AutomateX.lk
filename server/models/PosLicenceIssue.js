const mongoose = require("mongoose");

const {
  POS_LICENCE_ISSUE_REASONS,
  POS_LICENCE_ISSUE_STATES,
  validateLicenceIssuePolicy
} = require("../utils/posLicencePolicy");

const posLicenceIssueSchema = new mongoose.Schema(
  {
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
    activationCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PosActivationCode",
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: POS_LICENCE_ISSUE_STATES,
      default: "prepared",
      index: true
    },
    issueReason: {
      type: String,
      enum: POS_LICENCE_ISSUE_REASONS,
      required: true
    },
    keyId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120
    },
    issuedAt: {
      type: Date,
      required: true
    },
    licenceExpiry: {
      type: Date,
      required: true
    },
    offlineValidUntil: {
      type: Date,
      required: true
    },
    payloadDigest: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    predecessorSignatureHash: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
      select: false
    },
    renewalCredentialVersion: {
      type: Number,
      default: 0,
      min: 0
    },
    signedPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true,
    strict: "throw",
    autoCreate: false,
    autoIndex: false
  }
);

posLicenceIssueSchema.pre("validate", function validatePolicy(next) {
  const errors = validateLicenceIssuePolicy(this);
  errors.forEach((error) => this.invalidate("policy", error));
  next();
});

posLicenceIssueSchema.index({ licenceId: 1, installationId: 1, issuedAt: -1 });
posLicenceIssueSchema.index({ payloadDigest: 1 });
posLicenceIssueSchema.index(
  { activationCodeId: 1, installationId: 1, issueReason: 1 },
  {
    unique: true,
    partialFilterExpression: {
      activationCodeId: { $exists: true },
      issueReason: "activation"
    }
  }
);
posLicenceIssueSchema.index(
  { installationId: 1, issueReason: 1, predecessorSignatureHash: 1, renewalCredentialVersion: 1 },
  {
    unique: true,
    partialFilterExpression: {
      issueReason: "renewal"
    }
  }
);

module.exports = mongoose.model("PosLicenceIssue", posLicenceIssueSchema);
