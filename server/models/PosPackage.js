const mongoose = require("mongoose");

const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MODULE_IDS,
  POS_STANDARD_UPDATE_CHANNELS,
  normalizeStandardModuleIds
} = require("../utils/posLicenceContract");
const {
  POS_PACKAGE_STATES,
  validatePosPackagePolicy
} = require("../utils/posLicencePolicy");

const posPackageSchema = new mongoose.Schema(
  {
    packageCode: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    edition: {
      type: String,
      enum: [POS_EDITION_STANDARD],
      default: POS_EDITION_STANDARD,
      required: true
    },
    status: {
      type: String,
      enum: POS_PACKAGE_STATES,
      default: "draft",
      index: true
    },
    moduleIds: {
      type: [String],
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.every((moduleId) => POS_STANDARD_MODULE_IDS.includes(String(moduleId || "").trim().toLowerCase()));
        },
        message: "POS package modules must match the POS Standard contract."
      }
    },
    updateChannels: {
      type: [String],
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.every((channel) => POS_STANDARD_UPDATE_CHANNELS.includes(String(channel || "").trim().toLowerCase()));
        },
        message: "POS package update channels must match the POS Standard contract."
      }
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

posPackageSchema.pre("validate", function normalizeAndValidate(next) {
  const errors = validatePosPackagePolicy(this);
  errors.forEach((error) => this.invalidate("policy", error));

  this.moduleIds = normalizeStandardModuleIds(this.moduleIds);
  this.updateChannels = [...new Set((this.updateChannels || []).map((channel) => String(channel || "").trim().toLowerCase()).filter(Boolean))];

  next();
});

posPackageSchema.index({ packageCode: 1 }, { unique: true });
posPackageSchema.index({ edition: 1, status: 1 });

module.exports = mongoose.model("PosPackage", posPackageSchema);
module.exports.POS_STANDARD_MODULE_IDS = POS_STANDARD_MODULE_IDS;
