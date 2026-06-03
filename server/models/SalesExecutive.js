const mongoose = require("mongoose");

const SALES_EXECUTIVE_STATUS_OPTIONS = ["Active", "Inactive", "Suspended"];
const SALES_EXECUTIVE_WORK_TYPE_OPTIONS = ["Part Time", "Full Time", "Freelancer"];
const SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS = ["Cash", "Bank Transfer", "Online", "Other"];
const SALES_COMMISSION_TYPE_OPTIONS = ["Fixed Target", "Percentage", "Custom"];

const bankDetailsSchema = new mongoose.Schema(
  {
    bankName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120
    },
    accountHolderName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160
    },
    accountNumber: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80
    },
    branch: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120
    }
  },
  { _id: false }
);

const commissionRulesSchema = new mongoose.Schema(
  {
    baseTargetClientsPerMonth: {
      type: Number,
      default: 3,
      min: 0
    },
    baseCommissionAmount: {
      type: Number,
      default: 15000,
      min: 0
    },
    extraClientCommission: {
      type: Number,
      default: 6000,
      min: 0
    },
    commissionType: {
      type: String,
      enum: SALES_COMMISSION_TYPE_OPTIONS,
      default: "Fixed Target"
    },
    percentageRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  { _id: false }
);

const salesExecutiveSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
      unique: true,
      index: true
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      maxlength: 180,
      index: true,
      sparse: true
    },
    address: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },
    nicNumber: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80
    },
    status: {
      type: String,
      enum: SALES_EXECUTIVE_STATUS_OPTIONS,
      default: "Active",
      index: true
    },
    joinedDate: {
      type: Date,
      default: Date.now
    },
    workType: {
      type: String,
      enum: SALES_EXECUTIVE_WORK_TYPE_OPTIONS,
      default: "Part Time",
      index: true
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },
    paymentMethod: {
      type: String,
      enum: SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS,
      default: "Cash"
    },
    bankDetails: {
      type: bankDetailsSchema,
      default: () => ({})
    },
    commissionRules: {
      type: commissionRulesSchema,
      default: () => ({})
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
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    },
    archivedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SalesExecutive", salesExecutiveSchema);
module.exports.SALES_EXECUTIVE_STATUS_OPTIONS = SALES_EXECUTIVE_STATUS_OPTIONS;
module.exports.SALES_EXECUTIVE_WORK_TYPE_OPTIONS = SALES_EXECUTIVE_WORK_TYPE_OPTIONS;
module.exports.SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS = SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS;
module.exports.SALES_COMMISSION_TYPE_OPTIONS = SALES_COMMISSION_TYPE_OPTIONS;
