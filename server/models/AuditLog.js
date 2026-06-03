const mongoose = require("mongoose");

const AUDIT_MODULES = [
  "Auth",
  "Users",
  "Clients",
  "Projects",
  "Files",
  "Maintenance",
  "Invoices",
  "Payments",
  "Sales",
  "Leads",
  "Commissions",
  "Support",
  "Bookings",
  "Inquiries",
  "Reviews",
  "Settings",
  "Other"
];

const AUDIT_SEVERITIES = ["Low", "Medium", "High", "Critical"];

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    actorName: {
      type: String,
      default: "",
      trim: true
    },
    actorEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true
    },
    actorRole: {
      type: String,
      default: "",
      trim: true
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    module: {
      type: String,
      enum: AUDIT_MODULES,
      default: "Other"
    },
    targetType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120
    },
    targetId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80
    },
    targetLabel: {
      type: String,
      default: "",
      trim: true,
      maxlength: 240
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    ipAddress: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },
    severity: {
      type: String,
      enum: AUDIT_SEVERITIES,
      default: "Low"
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

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ actorEmail: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
module.exports.AUDIT_MODULES = AUDIT_MODULES;
module.exports.AUDIT_SEVERITIES = AUDIT_SEVERITIES;
