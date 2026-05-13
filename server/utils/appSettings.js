const { OFFICIAL_ADMIN_EMAIL } = require("./authRole");
const {
  DEFAULT_INVOICE_CURRENCY,
  normalizeInvoiceCurrency,
  roundMoney
} = require("./invoice");

const DEFAULT_INVOICE_PREFIX = "AX-INV";
const DEFAULT_PAYMENT_TERMS_DAYS = 30;

const DEFAULT_APP_SETTINGS = {
  companyName: "AutomateX",
  companyEmail: OFFICIAL_ADMIN_EMAIL,
  companyPhone: "",
  whatsappNumber: "",
  businessAddress: "",
  websiteUrl: "",
  logoUrl: "",
  invoicePrefix: DEFAULT_INVOICE_PREFIX,
  defaultCurrency: DEFAULT_INVOICE_CURRENCY,
  defaultTaxRate: 0,
  defaultPaymentTerms: DEFAULT_PAYMENT_TERMS_DAYS,
  supportEmail: OFFICIAL_ADMIN_EMAIL,
  defaultSupportMessage: "",
  paymentInstructions: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankBranch: ""
};

function normalizeSettingsText(value, maxLength = 5000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeSettingsEmail(value, fallback = "") {
  const normalized = normalizeSettingsText(value, 320).toLowerCase();
  return normalized || fallback;
}

function normalizeOptionalUrl(value) {
  const normalized = normalizeSettingsText(value, 1000);

  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.toString();
  } catch (_error) {
    return "";
  }
}

function normalizeInvoicePrefix(value) {
  const normalized = normalizeSettingsText(value, 20)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || DEFAULT_INVOICE_PREFIX;
}

function normalizeTaxRate(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return DEFAULT_APP_SETTINGS.defaultTaxRate;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return DEFAULT_APP_SETTINGS.defaultTaxRate;
  }

  return roundMoney(numericValue);
}

function normalizePaymentTerms(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return DEFAULT_PAYMENT_TERMS_DAYS;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return DEFAULT_PAYMENT_TERMS_DAYS;
  }

  return Math.min(365, Math.max(0, Math.round(numericValue)));
}

function serializeAppSettings(settings) {
  const source = settings && typeof settings.toObject === "function"
    ? settings.toObject()
    : settings || {};

  return {
    companyName: normalizeSettingsText(source.companyName, 200) || DEFAULT_APP_SETTINGS.companyName,
    companyEmail: normalizeSettingsEmail(source.companyEmail, DEFAULT_APP_SETTINGS.companyEmail),
    companyPhone: normalizeSettingsText(source.companyPhone, 80),
    whatsappNumber: normalizeSettingsText(source.whatsappNumber, 80),
    businessAddress: normalizeSettingsText(source.businessAddress, 2000),
    websiteUrl: normalizeOptionalUrl(source.websiteUrl),
    logoUrl: normalizeOptionalUrl(source.logoUrl),
    invoicePrefix: normalizeInvoicePrefix(source.invoicePrefix),
    defaultCurrency: normalizeInvoiceCurrency(source.defaultCurrency || DEFAULT_APP_SETTINGS.defaultCurrency),
    defaultTaxRate: normalizeTaxRate(source.defaultTaxRate),
    defaultPaymentTerms: normalizePaymentTerms(source.defaultPaymentTerms),
    supportEmail: normalizeSettingsEmail(source.supportEmail, DEFAULT_APP_SETTINGS.supportEmail),
    defaultSupportMessage: normalizeSettingsText(source.defaultSupportMessage, 2000),
    paymentInstructions: normalizeSettingsText(source.paymentInstructions, 5000),
    bankName: normalizeSettingsText(source.bankName, 200),
    bankAccountName: normalizeSettingsText(source.bankAccountName, 200),
    bankAccountNumber: normalizeSettingsText(source.bankAccountNumber, 120),
    bankBranch: normalizeSettingsText(source.bankBranch, 200),
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null
  };
}

function buildAppSettingsUpdatePayload(source = {}) {
  return {
    companyName: normalizeSettingsText(source.companyName, 200) || DEFAULT_APP_SETTINGS.companyName,
    companyEmail: normalizeSettingsEmail(source.companyEmail, DEFAULT_APP_SETTINGS.companyEmail),
    companyPhone: normalizeSettingsText(source.companyPhone, 80),
    whatsappNumber: normalizeSettingsText(source.whatsappNumber, 80),
    businessAddress: normalizeSettingsText(source.businessAddress, 2000),
    websiteUrl: normalizeOptionalUrl(source.websiteUrl),
    logoUrl: normalizeOptionalUrl(source.logoUrl),
    invoicePrefix: normalizeInvoicePrefix(source.invoicePrefix),
    defaultCurrency: normalizeInvoiceCurrency(source.defaultCurrency || DEFAULT_APP_SETTINGS.defaultCurrency),
    defaultTaxRate: normalizeTaxRate(source.defaultTaxRate),
    defaultPaymentTerms: normalizePaymentTerms(source.defaultPaymentTerms),
    supportEmail: normalizeSettingsEmail(source.supportEmail, DEFAULT_APP_SETTINGS.supportEmail),
    defaultSupportMessage: normalizeSettingsText(source.defaultSupportMessage, 2000),
    paymentInstructions: normalizeSettingsText(source.paymentInstructions, 5000),
    bankName: normalizeSettingsText(source.bankName, 200),
    bankAccountName: normalizeSettingsText(source.bankAccountName, 200),
    bankAccountNumber: normalizeSettingsText(source.bankAccountNumber, 120),
    bankBranch: normalizeSettingsText(source.bankBranch, 200)
  };
}

function buildDueDateFromTerms(issueDate, defaultPaymentTerms) {
  const baseDate = issueDate ? new Date(issueDate) : new Date();
  const terms = normalizePaymentTerms(defaultPaymentTerms);

  if (Number.isNaN(baseDate.getTime()) || terms <= 0) {
    return null;
  }

  const dueDate = new Date(baseDate);
  dueDate.setDate(dueDate.getDate() + terms);
  return dueDate;
}

function buildPaymentInstructionsSummary(settings) {
  const source = serializeAppSettings(settings);
  const parts = [
    source.bankName ? `Bank: ${source.bankName}` : "",
    source.bankAccountName ? `Account: ${source.bankAccountName}` : "",
    source.bankAccountNumber ? `No: ${source.bankAccountNumber}` : "",
    source.bankBranch ? `Branch: ${source.bankBranch}` : "",
    source.paymentInstructions || ""
  ].filter(Boolean);

  return parts.join("\n");
}

module.exports = {
  DEFAULT_APP_SETTINGS,
  DEFAULT_INVOICE_PREFIX,
  DEFAULT_PAYMENT_TERMS_DAYS,
  normalizeSettingsText,
  normalizeSettingsEmail,
  normalizeOptionalUrl,
  normalizeInvoicePrefix,
  normalizeTaxRate,
  normalizePaymentTerms,
  serializeAppSettings,
  buildAppSettingsUpdatePayload,
  buildDueDateFromTerms,
  buildPaymentInstructionsSummary
};
