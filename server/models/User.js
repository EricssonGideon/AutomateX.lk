const mongoose = require("mongoose");
const {
  PLAN_OPTIONS,
  ACCOUNT_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  ONBOARDING_STATUS_OPTIONS
} = require("../utils/account");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["admin", "client"],
      default: "client"
    },
    plan: {
      type: String,
      validate: {
        validator(value) {
          return value === null || PLAN_OPTIONS.includes(value);
        },
        message: "Plan must match a supported package value or be null."
      },
      default: "not_assigned"
    },
    monthlyFee: {
      type: Number,
      default: 0,
      min: 0
    },
    accountStatus: {
      type: String,
      enum: ACCOUNT_STATUS_OPTIONS,
      default: "pending"
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS_OPTIONS,
      default: "pending"
    },
    nextPaymentDate: {
      type: Date,
      default: null
    },
    allowedFeatures: {
      type: [String],
      default: []
    },
    onboardingStatus: {
      type: String,
      enum: ONBOARDING_STATUS_OPTIONS,
      default: "pending"
    },
    isActive: {
      type: Boolean,
      default: true
    },
    stripeCustomerId: {
      type: String,
      default: ""
    },
    stripeSubscriptionId: {
      type: String,
      default: ""
    },
    businessName: {
      type: String,
      default: "",
      trim: true
    },
    businessType: {
      type: String,
      default: "",
      trim: true
    },
    phone: {
      type: String,
      default: "",
      trim: true
    },
    location: {
      type: String,
      default: "",
      trim: true
    },
    services: {
      type: [String],
      default: []
    },
    workingHours: {
      type: String,
      default: "",
      trim: true
    },
    bookingUrl: {
      type: String,
      default: "",
      trim: true
    },
    chatbotLanguage: {
      type: String,
      default: "",
      trim: true
    },
    planExpiresAt: {
      type: Date,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false
  }
);

module.exports = mongoose.model("User", userSchema);
