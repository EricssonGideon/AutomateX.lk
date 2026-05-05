const mongoose = require("mongoose");

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
          return value === null || ["starter", "standard", "pro"].includes(value);
        },
        message: "Plan must be starter, standard, pro, or null."
      },
      default: "starter"
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
