const mongoose = require("mongoose");

const COMMISSION_TYPE_OPTIONS = ["Base Target", "Extra Client", "Percentage", "Manual Bonus", "Adjustment"];
const COMMISSION_STATUS_OPTIONS = ["Pending", "Approved", "Paid", "Cancelled"];

const commissionSchema = new mongoose.Schema(
  {
    salesExecutiveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesExecutive",
      required: true,
      index: true
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
      index: true
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
      index: true
    },
    paymentReference: {
      type: String,
      default: "",
      trim: true,
      maxlength: 180
    },
    commissionMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      index: true
    },
    commissionYear: {
      type: Number,
      required: true,
      min: 2000,
      max: 2100,
      index: true
    },
    commissionType: {
      type: String,
      enum: COMMISSION_TYPE_OPTIONS,
      default: "Manual Bonus",
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: COMMISSION_STATUS_OPTIONS,
      default: "Pending",
      index: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    paidDate: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

commissionSchema.pre("validate", function normalizeAmount(next) {
  const amount = Number(this.amount);
  this.amount = Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : this.amount;
  next();
});

module.exports = mongoose.model("Commission", commissionSchema);
module.exports.COMMISSION_TYPE_OPTIONS = COMMISSION_TYPE_OPTIONS;
module.exports.COMMISSION_STATUS_OPTIONS = COMMISSION_STATUS_OPTIONS;
