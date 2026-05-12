const mongoose = require("mongoose");

const supportRequestSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    clientName: {
      type: String,
      required: true,
      trim: true
    },
    clientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    businessName: {
      type: String,
      default: "",
      trim: true
    },
    type: {
      type: String,
      enum: ["support", "upgrade", "bug", "feature", "payment", "general"],
      default: "support",
      index: true
    },
    requestedPackage: {
      type: String,
      enum: ["starter", "standard", "pro", "custom", null],
      default: null
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "rejected", "closed"],
      default: "open",
      index: true
    },
    adminNote: {
      type: String,
      default: "",
      trim: true
    },
    resolvedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("SupportRequest", supportRequestSchema);
