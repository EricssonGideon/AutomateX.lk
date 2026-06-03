const mongoose = require("mongoose");

const PROJECT_FILE_TYPE_OPTIONS = [
  "Requirement",
  "Proposal",
  "Agreement",
  "Invoice",
  "Design",
  "Source Code",
  "Final Delivery",
  "Training Document",
  "Other"
];
const PROJECT_FILE_VISIBILITY_OPTIONS = ["Admin Only", "Client Visible"];
const PROJECT_FILE_ROLE_OPTIONS = ["Admin", "Client"];
const PROJECT_FILE_STATUS_OPTIONS = ["Active", "Archived"];
const PROJECT_FILE_STORAGE_DRIVER_OPTIONS = ["local", "s3"];

const projectFileSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255
    },
    fileUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },
    storagePath: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },
    storageDriver: {
      type: String,
      enum: PROJECT_FILE_STORAGE_DRIVER_OPTIONS,
      default: "local",
      index: true
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120
    },
    fileSize: {
      type: Number,
      default: 0,
      min: 0
    },
    fileType: {
      type: String,
      enum: PROJECT_FILE_TYPE_OPTIONS,
      default: "Other",
      index: true
    },
    visibility: {
      type: String,
      enum: PROJECT_FILE_VISIBILITY_OPTIONS,
      default: "Admin Only",
      index: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    uploadedByRole: {
      type: String,
      enum: PROJECT_FILE_ROLE_OPTIONS,
      required: true
    },
    status: {
      type: String,
      enum: PROJECT_FILE_STATUS_OPTIONS,
      default: "Active",
      index: true
    },
    archivedAt: {
      type: Date,
      default: null
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("ProjectFile", projectFileSchema);
module.exports.PROJECT_FILE_TYPE_OPTIONS = PROJECT_FILE_TYPE_OPTIONS;
module.exports.PROJECT_FILE_VISIBILITY_OPTIONS = PROJECT_FILE_VISIBILITY_OPTIONS;
module.exports.PROJECT_FILE_ROLE_OPTIONS = PROJECT_FILE_ROLE_OPTIONS;
module.exports.PROJECT_FILE_STATUS_OPTIONS = PROJECT_FILE_STATUS_OPTIONS;
module.exports.PROJECT_FILE_STORAGE_DRIVER_OPTIONS = PROJECT_FILE_STORAGE_DRIVER_OPTIONS;
