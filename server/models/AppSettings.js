const mongoose = require("mongoose");

const appSettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      default: "AutomateX",
      trim: true
    },
    companyEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true
    },
    companyPhone: {
      type: String,
      default: "",
      trim: true
    },
    whatsappNumber: {
      type: String,
      default: "",
      trim: true
    },
    businessAddress: {
      type: String,
      default: "",
      trim: true
    },
    websiteUrl: {
      type: String,
      default: "",
      trim: true
    },
    logoUrl: {
      type: String,
      default: "",
      trim: true
    },
    invoicePrefix: {
      type: String,
      default: "AX-INV",
      trim: true,
      uppercase: true
    },
    defaultCurrency: {
      type: String,
      default: "LKR",
      trim: true,
      uppercase: true
    },
    defaultTaxRate: {
      type: Number,
      default: 0,
      min: 0
    },
    defaultPaymentTerms: {
      type: Number,
      default: 30,
      min: 0
    },
    supportEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true
    },
    defaultSupportMessage: {
      type: String,
      default: "",
      trim: true
    },
    paymentInstructions: {
      type: String,
      default: "",
      trim: true
    },
    bankName: {
      type: String,
      default: "",
      trim: true
    },
    bankAccountName: {
      type: String,
      default: "",
      trim: true
    },
    bankAccountNumber: {
      type: String,
      default: "",
      trim: true
    },
    bankBranch: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("AppSettings", appSettingsSchema);
