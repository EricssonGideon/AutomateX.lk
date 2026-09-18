const mongoose = require("mongoose");

const {
  POS_INSTALLATION_STATES
} = require("../utils/posLicencePolicy");

const DEVICE_INSTALLATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const posInstallationSchema = new mongoose.Schema(
  {
    licenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PosLicence",
      required: true,
      index: true
    },
    deviceInstallationId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      validate: {
        validator(value) {
          return DEVICE_INSTALLATION_ID_PATTERN.test(String(value || ""));
        },
        message: "Device installation ID must match the POS Standard device identity format."
      }
    },
    status: {
      type: String,
      enum: POS_INSTALLATION_STATES,
      default: "pending",
      index: true
    },
    firstActivatedAt: {
      type: Date,
      default: null
    },
    lastRenewedAt: {
      type: Date,
      default: null
    },
    renewalCredentialHash: {
      type: String,
      default: "",
      select: false
    },
    renewalCredentialVersion: {
      type: Number,
      default: 0,
      min: 0
    },
    renewalCredentialBoundAt: {
      type: Date,
      default: null
    },
    lastIssueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PosLicenceIssue",
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    updatedBy: {
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

posInstallationSchema.pre("validate", function normalize(next) {
  this.deviceInstallationId = String(this.deviceInstallationId || "").trim().toLowerCase();
  if (!Number.isInteger(Number(this.renewalCredentialVersion)) || Number(this.renewalCredentialVersion) < 0) {
    this.invalidate("renewalCredentialVersion", "Renewal credential version must be zero or greater.");
  }
  next();
});

posInstallationSchema.index({ licenceId: 1, deviceInstallationId: 1 }, { unique: true });
posInstallationSchema.index({ deviceInstallationId: 1 });
posInstallationSchema.index(
  { renewalCredentialHash: 1 },
  {
    unique: true,
    partialFilterExpression: {
      renewalCredentialVersion: { $gte: 1 },
      renewalCredentialHash: { $type: "string" }
    }
  }
);

module.exports = mongoose.model("PosInstallation", posInstallationSchema);
