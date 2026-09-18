const mongoose = require("mongoose");

const {
  POS_ACTIVATION_CODE_STATES,
  validateActivationCodePolicy
} = require("../utils/posLicencePolicy");

const posActivationCodeSchema = new mongoose.Schema(
  {
    licenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PosLicence",
      required: true,
      index: true
    },
    codeHash: {
      type: String,
      required: true,
      trim: true,
      select: false,
      maxlength: 200
    },
    status: {
      type: String,
      enum: POS_ACTIVATION_CODE_STATES,
      default: "draft",
      index: true
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true
    },
    maxRedemptions: {
      type: Number,
      default: null,
      min: 1
    },
    redeemedCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastRedeemedAt: {
      type: Date,
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

posActivationCodeSchema.pre("validate", function validatePolicy(next) {
  const errors = validateActivationCodePolicy(this);
  errors.forEach((error) => this.invalidate("policy", error));
  next();
});

posActivationCodeSchema.index({ codeHash: 1 }, { unique: true });
posActivationCodeSchema.index({ licenceId: 1, status: 1 });

module.exports = mongoose.model("PosActivationCode", posActivationCodeSchema);
