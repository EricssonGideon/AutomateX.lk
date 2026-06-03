const mongoose = require("mongoose");

const LEAD_INTERESTED_SERVICE_OPTIONS = [
  "Website",
  "POS System",
  "School System",
  "Clinic System",
  "Pharmacy System",
  "Tuition System",
  "Hotel System",
  "AI Chatbot",
  "WhatsApp Automation",
  "Custom Software",
  "Other"
];
const LEAD_SOURCE_OPTIONS = ["Sales Executive", "Website", "WhatsApp", "Facebook", "Instagram", "Referral", "Other"];
const LEAD_STATUS_OPTIONS = [
  "New",
  "Contacted",
  "Follow Up",
  "Interested",
  "Proposal Sent",
  "Converted",
  "Rejected",
  "Not Responding"
];
const LEAD_PRIORITY_OPTIONS = ["Low", "Medium", "High"];

const leadSchema = new mongoose.Schema(
  {
    salesExecutiveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesExecutive",
      default: null,
      index: true
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    businessName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 180
    },
    contactPerson: {
      type: String,
      default: "",
      trim: true,
      maxlength: 180
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
      index: true
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      maxlength: 180
    },
    businessType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120
    },
    location: {
      type: String,
      default: "",
      trim: true,
      maxlength: 180
    },
    interestedService: {
      type: String,
      enum: LEAD_INTERESTED_SERVICE_OPTIONS,
      default: "Other",
      index: true
    },
    leadSource: {
      type: String,
      enum: LEAD_SOURCE_OPTIONS,
      default: "Sales Executive",
      index: true
    },
    status: {
      type: String,
      enum: LEAD_STATUS_OPTIONS,
      default: "New",
      index: true
    },
    priority: {
      type: String,
      enum: LEAD_PRIORITY_OPTIONS,
      default: "Medium",
      index: true
    },
    estimatedBudget: {
      type: Number,
      default: 0,
      min: 0
    },
    followUpDate: {
      type: Date,
      default: null,
      index: true
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    convertedProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true
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

module.exports = mongoose.model("Lead", leadSchema);
module.exports.LEAD_INTERESTED_SERVICE_OPTIONS = LEAD_INTERESTED_SERVICE_OPTIONS;
module.exports.LEAD_SOURCE_OPTIONS = LEAD_SOURCE_OPTIONS;
module.exports.LEAD_STATUS_OPTIONS = LEAD_STATUS_OPTIONS;
module.exports.LEAD_PRIORITY_OPTIONS = LEAD_PRIORITY_OPTIONS;
