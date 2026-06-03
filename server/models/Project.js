const mongoose = require("mongoose");

const PROJECT_TYPE_OPTIONS = [
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
const PROJECT_STATUS_OPTIONS = [
  "Inquiry",
  "Planning",
  "In Progress",
  "Waiting for Client",
  "Testing",
  "Completed",
  "On Hold",
  "Cancelled"
];
const PROJECT_PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];
const MILESTONE_STATUS_OPTIONS = ["Pending", "In Progress", "Completed"];
const DELIVERABLE_STATUS_OPTIONS = ["Pending", "Delivered", "Approved"];

const milestoneSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    status: {
      type: String,
      enum: MILESTONE_STATUS_OPTIONS,
      default: "Pending"
    },
    dueDate: {
      type: Date,
      default: null
    },
    completedDate: {
      type: Date,
      default: null
    }
  },
  {
    _id: true
  }
);

const deliverableSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    status: {
      type: String,
      enum: DELIVERABLE_STATUS_OPTIONS,
      default: "Pending"
    },
    deliveredDate: {
      type: Date,
      default: null
    }
  },
  {
    _id: true
  }
);

const projectSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    projectTitle: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    projectType: {
      type: String,
      enum: PROJECT_TYPE_OPTIONS,
      required: true,
      index: true
    },
    packageName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },
    status: {
      type: String,
      enum: PROJECT_STATUS_OPTIONS,
      default: "Planning",
      index: true
    },
    priority: {
      type: String,
      enum: PROJECT_PRIORITY_OPTIONS,
      default: "Medium",
      index: true
    },
    startDate: {
      type: Date,
      default: null
    },
    expectedDeadline: {
      type: Date,
      default: null,
      index: true
    },
    completedDate: {
      type: Date,
      default: null
    },
    totalAmount: {
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
    progressPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },
    requirements: {
      type: String,
      default: "",
      trim: true,
      maxlength: 8000
    },
    adminNotes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 8000
    },
    clientNotes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },
    milestones: {
      type: [milestoneSchema],
      default: []
    },
    deliverables: {
      type: [deliverableSchema],
      default: []
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
  {
    timestamps: true
  }
);

projectSchema.pre("validate", function calculateBalance(next) {
  const totalAmount = Number.isFinite(Number(this.totalAmount)) ? Number(this.totalAmount) : 0;
  const paidAmount = Number.isFinite(Number(this.paidAmount)) ? Number(this.paidAmount) : 0;

  this.totalAmount = Math.max(0, Number(totalAmount.toFixed(2)));
  this.paidAmount = Math.max(0, Number(paidAmount.toFixed(2)));
  this.balanceAmount = Math.max(0, Number((this.totalAmount - this.paidAmount).toFixed(2)));
  this.progressPercentage = Math.min(100, Math.max(0, Math.round(Number(this.progressPercentage) || 0)));

  if (this.status === "Completed" && !this.completedDate) {
    this.completedDate = new Date();
  }

  next();
});

module.exports = mongoose.model("Project", projectSchema);
module.exports.PROJECT_TYPE_OPTIONS = PROJECT_TYPE_OPTIONS;
module.exports.PROJECT_STATUS_OPTIONS = PROJECT_STATUS_OPTIONS;
module.exports.PROJECT_PRIORITY_OPTIONS = PROJECT_PRIORITY_OPTIONS;
module.exports.MILESTONE_STATUS_OPTIONS = MILESTONE_STATUS_OPTIONS;
module.exports.DELIVERABLE_STATUS_OPTIONS = DELIVERABLE_STATUS_OPTIONS;
