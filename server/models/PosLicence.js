const mongoose = require("mongoose");

const {
  POS_EDITION_STANDARD,
  POS_STANDARD_SIGNED_LICENCE_STATUS,
  normalizeStandardModuleIds
} = require("../utils/posLicenceContract");
const {
  POS_LICENCE_STATES,
  validatePosLicencePolicy
} = require("../utils/posLicencePolicy");

const posLicenceSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PosPackage",
      default: null,
      index: true
    },
    edition: {
      type: String,
      enum: [POS_EDITION_STANDARD],
      default: POS_EDITION_STANDARD,
      required: true
    },
    status: {
      type: String,
      enum: POS_LICENCE_STATES,
      default: "draft",
      index: true
    },
    entitledModules: {
      type: [String],
      default: []
    },
    updateChannel: {
      type: String,
      enum: ["", "stable", "beta", "preview"],
      default: "",
      trim: true,
      lowercase: true
    },
    licenceExpiry: {
      type: Date,
      default: null
    },
    supportExpiry: {
      type: Date,
      default: null
    },
    offlineValidUntil: {
      type: Date,
      default: null
    },
    renewalWindowDurationMinutes: {
      type: Number,
      default: null,
      min: 1
    },
    maxInstallations: {
      type: Number,
      default: null,
      min: 1
    },
    activationCount: {
      type: Number,
      default: 0,
      min: 0
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
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

posLicenceSchema.virtual("signedLicenceStatus").get(() => POS_STANDARD_SIGNED_LICENCE_STATUS);

posLicenceSchema.pre("validate", function normalizeAndValidate(next) {
  const errors = validatePosLicencePolicy(this);
  errors.forEach((error) => this.invalidate("policy", error));

  this.entitledModules = normalizeStandardModuleIds(this.entitledModules);
  this.updateChannel = String(this.updateChannel || "").trim().toLowerCase();

  next();
});

posLicenceSchema.index({ clientId: 1, status: 1 });
posLicenceSchema.index({ projectId: 1, status: 1 });
posLicenceSchema.index({ packageId: 1, status: 1 });

module.exports = mongoose.model("PosLicence", posLicenceSchema);
