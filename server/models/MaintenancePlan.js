const mongoose = require("mongoose");

const MAINTENANCE_PLAN_TYPE_OPTIONS = ["Monthly", "Quarterly", "Yearly", "One Time", "Custom"];
const MAINTENANCE_STATUS_OPTIONS = ["Active", "Expiring Soon", "Expired", "Cancelled", "Pending"];
const MAINTENANCE_PAYMENT_STATUS_OPTIONS = ["Paid", "Pending", "Partial", "Overdue"];

const includedServiceSchema = new mongoose.Schema(
  {
    serviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    }
  },
  {
    _id: true
  }
);

const maintenancePlanSchema = new mongoose.Schema(
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
      required: true,
      index: true
    },
    planName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    planType: {
      type: String,
      enum: MAINTENANCE_PLAN_TYPE_OPTIONS,
      default: "Monthly",
      index: true
    },
    status: {
      type: String,
      enum: MAINTENANCE_STATUS_OPTIONS,
      default: "Pending",
      index: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      default: null
    },
    renewalDate: {
      type: Date,
      default: null,
      index: true
    },
    amount: {
      type: Number,
      default: 0,
      min: 0
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    balanceAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    paymentStatus: {
      type: String,
      enum: MAINTENANCE_PAYMENT_STATUS_OPTIONS,
      default: "Pending",
      index: true
    },
    includedServices: {
      type: [includedServiceSchema],
      default: []
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },
    adminNotes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 8000
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
  {
    timestamps: true
  }
);

maintenancePlanSchema.pre("validate", function calculateBalance(next) {
  const amount = Number.isFinite(Number(this.amount)) ? Number(this.amount) : 0;
  const paidAmount = Number.isFinite(Number(this.paidAmount)) ? Number(this.paidAmount) : 0;

  this.amount = Math.max(0, Number(amount.toFixed(2)));
  this.paidAmount = Math.max(0, Number(paidAmount.toFixed(2)));
  this.balanceAmount = Math.max(0, Number((this.amount - this.paidAmount).toFixed(2)));

  next();
});

module.exports = mongoose.model("MaintenancePlan", maintenancePlanSchema);
module.exports.MAINTENANCE_PLAN_TYPE_OPTIONS = MAINTENANCE_PLAN_TYPE_OPTIONS;
module.exports.MAINTENANCE_STATUS_OPTIONS = MAINTENANCE_STATUS_OPTIONS;
module.exports.MAINTENANCE_PAYMENT_STATUS_OPTIONS = MAINTENANCE_PAYMENT_STATUS_OPTIONS;
