const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const Commission = require("../models/Commission");
const Invoice = require("../models/Invoice");
const Lead = require("../models/Lead");
const Project = require("../models/Project");
const SalesExecutive = require("../models/SalesExecutive");
const User = require("../models/User");
const { normalizeEmailAddress, resolveTrustedRole, isOfficialAdminEmail } = require("../utils/authRole");
const { logAdminAction } = require("../utils/auditLog");
const { sendSuccess, sendError } = require("../utils/response");

const SALES_EXECUTIVE_STATUS_OPTIONS = SalesExecutive.SALES_EXECUTIVE_STATUS_OPTIONS;
const SALES_EXECUTIVE_WORK_TYPE_OPTIONS = SalesExecutive.SALES_EXECUTIVE_WORK_TYPE_OPTIONS;
const SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS = SalesExecutive.SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS;
const SALES_COMMISSION_TYPE_OPTIONS = SalesExecutive.SALES_COMMISSION_TYPE_OPTIONS;
const LEAD_INTERESTED_SERVICE_OPTIONS = Lead.LEAD_INTERESTED_SERVICE_OPTIONS;
const LEAD_SOURCE_OPTIONS = Lead.LEAD_SOURCE_OPTIONS;
const LEAD_STATUS_OPTIONS = Lead.LEAD_STATUS_OPTIONS;
const LEAD_PRIORITY_OPTIONS = Lead.LEAD_PRIORITY_OPTIONS;
const COMMISSION_TYPE_OPTIONS = Commission.COMMISSION_TYPE_OPTIONS;
const COMMISSION_STATUS_OPTIONS = Commission.COMMISSION_STATUS_OPTIONS;
const LEAD_APPROVAL_STATUS_OPTIONS = Lead.LEAD_APPROVAL_STATUS_OPTIONS;
const SALT_ROUNDS = 12;

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEnum(value, options, fallback = "") {
  const normalized = cleanText(value, 100);
  return options.includes(normalized) ? normalized : fallback;
}

function normalizeMoney(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return 0;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  return Number(numericValue.toFixed(2));
}

function hasBodyField(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function normalizeInteger(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === "" || value === null || typeof value === "undefined") {
    return fallback;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function isValidEmail(value) {
  if (!value) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchRegex(value) {
  const term = cleanText(value, 120);
  return term ? new RegExp(escapeRegExp(term), "i") : null;
}

function getCurrentMonthYear() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };
}

function getMonthWindow(month, year) {
  return {
    monthStart: new Date(year, month - 1, 1),
    monthEnd: new Date(year, month, 1)
  };
}

function calculateTargetCommission(approvedPaidClients, commissionRules = {}) {
  const targetRule = Number(commissionRules.baseTargetClientsPerMonth);
  const targetAmountRule = Number(commissionRules.baseCommissionAmount);
  const extraAmountRule = Number(commissionRules.extraClientCommission);
  const monthlyTarget = Number.isFinite(targetRule) && targetRule >= 0 ? targetRule : 3;
  const targetAmount = Number.isFinite(targetAmountRule) && targetAmountRule >= 0 ? targetAmountRule : 15000;
  const extraAmount = Number.isFinite(extraAmountRule) && extraAmountRule >= 0 ? extraAmountRule : 0;
  const approvedCount = Number(approvedPaidClients) || 0;
  const targetAchieved = monthlyTarget === 0 || approvedCount >= monthlyTarget;
  const extraClients = targetAchieved ? Math.max(0, approvedCount - monthlyTarget) : 0;
  const estimatedCommission = targetAchieved ? targetAmount + (extraClients * extraAmount) : 0;

  return {
    monthlyTarget,
    targetAmount,
    extraClientCommission: extraAmount,
    approvedPaidClients: approvedCount,
    targetAchieved,
    extraClients,
    estimatedCommission,
    remainingClients: Math.max(0, monthlyTarget - approvedCount),
    progressPercent: monthlyTarget ? Math.min(100, Math.round((approvedCount / monthlyTarget) * 100)) : 100
  };
}

function serializeSalesExecutive(executive, options = {}) {
  const base = {
    id: String(executive._id || executive.id),
    fullName: executive.fullName || "",
    phone: executive.phone || "",
    email: executive.email || "",
    userId: executive.userId ? String(executive.userId._id || executive.userId) : "",
    loginEnabled: Boolean(executive.userId && executive.status === "Active"),
    address: executive.address || "",
    nicNumber: executive.nicNumber || "",
    status: executive.status || "Active",
    joinedDate: executive.joinedDate || null,
    workType: executive.workType || "Part Time",
    notes: executive.notes || "",
    paymentMethod: executive.paymentMethod || "Cash",
    commissionRules: executive.commissionRules || {},
    isArchived: Boolean(executive.isArchived),
    archivedAt: executive.archivedAt || null,
    createdAt: executive.createdAt,
    updatedAt: executive.updatedAt
  };

  if (options.includeSensitiveFields) {
    base.bankDetails = executive.bankDetails || {};
  }

  return base;
}

function serializeLead(lead) {
  const salesExecutive = lead.salesExecutiveId && typeof lead.salesExecutiveId === "object" ? lead.salesExecutiveId : {};
  const client = lead.clientId && typeof lead.clientId === "object" ? lead.clientId : {};
  const project = lead.convertedProjectId && typeof lead.convertedProjectId === "object" ? lead.convertedProjectId : {};

  return {
    id: String(lead._id || lead.id),
    salesExecutiveId: String(salesExecutive._id || lead.salesExecutiveId || ""),
    salesExecutiveName: salesExecutive.fullName || lead.salesExecutiveName || "",
    clientId: String(client._id || lead.clientId || ""),
    clientName: client.name || lead.clientName || "",
    clientBusinessName: client.businessName || lead.clientBusinessName || "",
    businessName: lead.businessName || "",
    contactPerson: lead.contactPerson || "",
    phone: lead.phone || "",
    email: lead.email || "",
    businessType: lead.businessType || "",
    location: lead.location || "",
    interestedService: lead.interestedService || "Other",
    leadSource: lead.leadSource || "Sales Executive",
    status: lead.status || "New",
    priority: lead.priority || "Medium",
    estimatedBudget: lead.estimatedBudget || 0,
    followUpDate: lead.followUpDate || null,
    notes: lead.notes || "",
    rejectionReason: lead.rejectionReason || "",
    convertedProjectId: String(project._id || lead.convertedProjectId || ""),
    convertedProjectTitle: project.projectTitle || lead.convertedProjectTitle || "",
    paymentReceived: Boolean(lead.paymentReceived),
    amountReceived: lead.amountReceived || 0,
    packageSold: lead.packageSold || "",
    paymentDate: lead.paymentDate || null,
    approvalStatus: lead.approvalStatus || "not_submitted",
    submittedForApprovalAt: lead.submittedForApprovalAt || null,
    approvedAt: lead.approvedAt || null,
    rejectedAt: lead.rejectedAt || null,
    adminNote: lead.adminNote || "",
    isArchived: Boolean(lead.isArchived),
    archivedAt: lead.archivedAt || null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt
  };
}

function serializeCommission(commission) {
  const salesExecutive = commission.salesExecutiveId && typeof commission.salesExecutiveId === "object" ? commission.salesExecutiveId : {};
  const lead = commission.leadId && typeof commission.leadId === "object" ? commission.leadId : {};
  const client = commission.clientId && typeof commission.clientId === "object" ? commission.clientId : {};
  const project = commission.projectId && typeof commission.projectId === "object" ? commission.projectId : {};
  const invoice = commission.invoiceId && typeof commission.invoiceId === "object" ? commission.invoiceId : {};

  return {
    id: String(commission._id || commission.id),
    salesExecutiveId: String(salesExecutive._id || commission.salesExecutiveId || ""),
    salesExecutiveName: salesExecutive.fullName || commission.salesExecutiveName || "",
    leadId: String(lead._id || commission.leadId || ""),
    leadBusinessName: lead.businessName || commission.leadBusinessName || "",
    clientId: String(client._id || commission.clientId || ""),
    clientName: client.name || commission.clientName || "",
    clientBusinessName: client.businessName || commission.clientBusinessName || "",
    projectId: String(project._id || commission.projectId || ""),
    projectTitle: project.projectTitle || commission.projectTitle || "",
    invoiceId: String(invoice._id || commission.invoiceId || ""),
    invoiceNumber: invoice.invoiceNumber || commission.invoiceNumber || "",
    paymentReference: commission.paymentReference || "",
    commissionMonth: commission.commissionMonth,
    commissionYear: commission.commissionYear,
    commissionType: commission.commissionType || "Manual Bonus",
    amount: commission.amount || 0,
    status: commission.status || "Pending",
    approvedBy: commission.approvedBy || null,
    paidDate: commission.paidDate || null,
    notes: commission.notes || "",
    createdAt: commission.createdAt,
    updatedAt: commission.updatedAt
  };
}

function buildSalesExecutivePayload(body, currentExecutive = null) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
  const payload = {};
  const errors = [];
  const fullName = cleanText(hasOwn("fullName") ? body.fullName : currentExecutive && currentExecutive.fullName, 180);
  const phone = cleanText(hasOwn("phone") ? body.phone : currentExecutive && currentExecutive.phone, 40);
  const email = cleanText(hasOwn("email") ? body.email : currentExecutive && currentExecutive.email, 180).toLowerCase();
  const joinedDate = normalizeDate(hasOwn("joinedDate") ? body.joinedDate : currentExecutive && currentExecutive.joinedDate) || new Date();
  const status = normalizeEnum(
    hasOwn("status") ? body.status : currentExecutive && currentExecutive.status,
    SALES_EXECUTIVE_STATUS_OPTIONS,
    currentExecutive ? currentExecutive.status : "Active"
  );
  const workType = normalizeEnum(
    hasOwn("workType") ? body.workType : currentExecutive && currentExecutive.workType,
    SALES_EXECUTIVE_WORK_TYPE_OPTIONS,
    currentExecutive ? currentExecutive.workType : "Part Time"
  );
  const paymentMethod = normalizeEnum(
    hasOwn("paymentMethod") ? body.paymentMethod : currentExecutive && currentExecutive.paymentMethod,
    SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS,
    currentExecutive ? currentExecutive.paymentMethod : "Cash"
  );
  const commissionRules = {
    ...(currentExecutive && currentExecutive.commissionRules ? currentExecutive.commissionRules : {}),
    ...(body.commissionRules || {})
  };
  const bankDetails = {
    ...(currentExecutive && currentExecutive.bankDetails ? currentExecutive.bankDetails : {}),
    ...(body.bankDetails || {})
  };
  const baseTargetClientsPerMonth = normalizeInteger(commissionRules.baseTargetClientsPerMonth, 3, 0, 1000);
  const baseCommissionAmount = normalizeMoney(commissionRules.baseCommissionAmount ?? 15000);
  const extraClientCommission = normalizeMoney(commissionRules.extraClientCommission ?? 6000);
  const percentageRate = normalizeMoney(commissionRules.percentageRate ?? 0);

  if (!fullName) {
    errors.push("Sales executive full name is required.");
  }

  if (!phone) {
    errors.push("Sales executive phone is required.");
  }

  if (!isValidEmail(email)) {
    errors.push("Sales executive email must be a valid email address.");
  }

  if (joinedDate === undefined) {
    errors.push("Joined date must be valid.");
  }

  if (!status) {
    errors.push("Sales executive status must be Active, Inactive, or Suspended.");
  }

  if (!workType) {
    errors.push("Work type must be Part Time, Full Time, or Freelancer.");
  }

  if (!paymentMethod) {
    errors.push("Payment method must be Cash, Bank Transfer, Online, or Other.");
  }

  if ([baseTargetClientsPerMonth, baseCommissionAmount, extraClientCommission, percentageRate].some((value) => value === null)) {
    errors.push("Commission rule numbers must be zero or greater.");
  }

  payload.fullName = fullName;
  payload.phone = phone;
  payload.email = email;
  payload.address = cleanText(hasOwn("address") ? body.address : currentExecutive && currentExecutive.address, 1000);
  payload.nicNumber = cleanText(hasOwn("nicNumber") ? body.nicNumber : currentExecutive && currentExecutive.nicNumber, 80);
  payload.status = status;
  payload.joinedDate = joinedDate;
  payload.workType = workType;
  payload.notes = cleanText(hasOwn("notes") ? body.notes : currentExecutive && currentExecutive.notes, 5000);
  payload.paymentMethod = paymentMethod;
  payload.bankDetails = {
    bankName: cleanText(bankDetails.bankName, 120),
    accountHolderName: cleanText(bankDetails.accountHolderName, 160),
    accountNumber: cleanText(bankDetails.accountNumber, 80),
    branch: cleanText(bankDetails.branch, 120)
  };
  payload.commissionRules = {
    baseTargetClientsPerMonth: baseTargetClientsPerMonth === null ? 3 : baseTargetClientsPerMonth,
    baseCommissionAmount: baseCommissionAmount === null ? 15000 : baseCommissionAmount,
    extraClientCommission: extraClientCommission === null ? 6000 : extraClientCommission,
    commissionType: normalizeEnum(commissionRules.commissionType, SALES_COMMISSION_TYPE_OPTIONS, "Fixed Target"),
    percentageRate: percentageRate === null ? 0 : percentageRate
  };

  return { payload, errors };
}

function buildLeadPayload(body, currentLead = null) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
  const payload = {};
  const errors = [];
  const businessName = cleanText(hasOwn("businessName") ? body.businessName : currentLead && currentLead.businessName, 180);
  const contactPerson = cleanText(hasOwn("contactPerson") ? body.contactPerson : currentLead && currentLead.contactPerson, 180);
  const phone = cleanText(hasOwn("phone") ? body.phone : currentLead && currentLead.phone, 40);
  const email = cleanText(hasOwn("email") ? body.email : currentLead && currentLead.email, 180).toLowerCase();
  const estimatedBudget = normalizeMoney(hasOwn("estimatedBudget") ? body.estimatedBudget : currentLead && currentLead.estimatedBudget);
  const amountReceived = normalizeMoney(hasOwn("amountReceived") ? body.amountReceived : currentLead && currentLead.amountReceived);
  const followUpDate = normalizeDate(hasOwn("followUpDate") ? body.followUpDate : currentLead && currentLead.followUpDate);
  const paymentDate = normalizeDate(hasOwn("paymentDate") ? body.paymentDate : currentLead && currentLead.paymentDate);

  if (!businessName && !contactPerson) {
    errors.push("Lead business name or contact person is required.");
  }

  if (!phone) {
    errors.push("Lead phone is required.");
  }

  if (!isValidEmail(email)) {
    errors.push("Lead email must be a valid email address.");
  }

  if (estimatedBudget === null) {
    errors.push("Estimated budget must be zero or greater.");
  }

  if (amountReceived === null) {
    errors.push("Amount received must be zero or greater.");
  }

  if (followUpDate === undefined) {
    errors.push("Follow-up date must be valid.");
  }

  if (paymentDate === undefined) {
    errors.push("Payment date must be valid.");
  }

  payload.businessName = businessName;
  payload.contactPerson = contactPerson;
  payload.phone = phone;
  payload.email = email;
  payload.businessType = cleanText(hasOwn("businessType") ? body.businessType : currentLead && currentLead.businessType, 120);
  payload.location = cleanText(hasOwn("location") ? body.location : currentLead && currentLead.location, 180);
  payload.interestedService = normalizeEnum(
    hasOwn("interestedService") ? body.interestedService : currentLead && currentLead.interestedService,
    LEAD_INTERESTED_SERVICE_OPTIONS,
    currentLead ? currentLead.interestedService : "Other"
  );
  payload.leadSource = normalizeEnum(
    hasOwn("leadSource") ? body.leadSource : currentLead && currentLead.leadSource,
    LEAD_SOURCE_OPTIONS,
    currentLead ? currentLead.leadSource : "Sales Executive"
  );
  payload.status = normalizeEnum(
    hasOwn("status") ? body.status : currentLead && currentLead.status,
    LEAD_STATUS_OPTIONS,
    currentLead ? currentLead.status : "New"
  );
  payload.priority = normalizeEnum(
    hasOwn("priority") ? body.priority : currentLead && currentLead.priority,
    LEAD_PRIORITY_OPTIONS,
    currentLead ? currentLead.priority : "Medium"
  );
  payload.estimatedBudget = estimatedBudget === null ? 0 : estimatedBudget;
  payload.followUpDate = followUpDate === undefined ? null : followUpDate;
  payload.paymentReceived = normalizeBoolean(
    hasOwn("paymentReceived") ? body.paymentReceived : undefined,
    Boolean(currentLead && currentLead.paymentReceived)
  );
  payload.amountReceived = amountReceived === null ? 0 : amountReceived;
  payload.packageSold = cleanText(hasOwn("packageSold") ? body.packageSold : currentLead && currentLead.packageSold, 180);
  payload.paymentDate = paymentDate === undefined ? null : paymentDate;
  payload.approvalStatus = normalizeEnum(
    hasOwn("approvalStatus") ? body.approvalStatus : currentLead && currentLead.approvalStatus,
    LEAD_APPROVAL_STATUS_OPTIONS,
    currentLead ? currentLead.approvalStatus : "not_submitted"
  );
  payload.adminNote = cleanText(hasOwn("adminNote") ? body.adminNote : currentLead && currentLead.adminNote, 5000);
  payload.notes = cleanText(hasOwn("notes") ? body.notes : currentLead && currentLead.notes, 5000);
  payload.rejectionReason = cleanText(hasOwn("rejectionReason") ? body.rejectionReason : currentLead && currentLead.rejectionReason, 2000);

  return { payload, errors };
}

function buildCommissionPayload(body, currentCommission = null) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
  const payload = {};
  const errors = [];
  const currentMonthYear = getCurrentMonthYear();
  const amount = normalizeMoney(hasOwn("amount") ? body.amount : currentCommission && currentCommission.amount);
  const commissionMonth = normalizeInteger(
    hasOwn("commissionMonth") ? body.commissionMonth : currentCommission && currentCommission.commissionMonth,
    currentMonthYear.month,
    1,
    12
  );
  const commissionYear = normalizeInteger(
    hasOwn("commissionYear") ? body.commissionYear : currentCommission && currentCommission.commissionYear,
    currentMonthYear.year,
    2000,
    2100
  );

  if (amount === null) {
    errors.push("Commission amount must be zero or greater.");
  }

  if (commissionMonth === null) {
    errors.push("Commission month must be between 1 and 12.");
  }

  if (commissionYear === null) {
    errors.push("Commission year must be valid.");
  }

  payload.paymentReference = cleanText(hasOwn("paymentReference") ? body.paymentReference : currentCommission && currentCommission.paymentReference, 180);
  payload.commissionMonth = commissionMonth || currentMonthYear.month;
  payload.commissionYear = commissionYear || currentMonthYear.year;
  payload.commissionType = normalizeEnum(
    hasOwn("commissionType") ? body.commissionType : currentCommission && currentCommission.commissionType,
    COMMISSION_TYPE_OPTIONS,
    currentCommission ? currentCommission.commissionType : "Manual Bonus"
  );
  payload.amount = amount === null ? 0 : amount;
  payload.status = normalizeEnum(
    hasOwn("status") ? body.status : currentCommission && currentCommission.status,
    COMMISSION_STATUS_OPTIONS,
    currentCommission ? currentCommission.status : "Pending"
  );
  payload.paidDate = normalizeDate(hasOwn("paidDate") ? body.paidDate : currentCommission && currentCommission.paidDate);
  if (payload.paidDate === undefined) {
    errors.push("Paid date must be valid.");
    payload.paidDate = null;
  }
  payload.notes = cleanText(hasOwn("notes") ? body.notes : currentCommission && currentCommission.notes, 5000);

  return { payload, errors };
}

async function findSalesExecutiveById(id, includeArchived = false) {
  if (!id) {
    return null;
  }

  if (!isValidObjectId(id)) {
    return undefined;
  }

  return SalesExecutive.findOne({
    _id: id,
    ...(includeArchived ? {} : { isArchived: false })
  }).lean();
}

async function validateOptionalClient(id) {
  if (!id) {
    return null;
  }

  if (!isValidObjectId(id)) {
    return undefined;
  }

  const client = await User.findOne({ _id: id, isActive: true }).lean();
  if (!client || resolveTrustedRole(client) !== "client") {
    return undefined;
  }

  return client;
}

async function validateOptionalProject(id, clientId = "") {
  if (!id) {
    return null;
  }

  if (!isValidObjectId(id)) {
    return undefined;
  }

  const match = { _id: id, isArchived: false };
  if (clientId) {
    match.clientId = clientId;
  }

  return Project.findOne(match).lean();
}

async function validateOptionalInvoice(id) {
  if (!id) {
    return null;
  }

  if (!isValidObjectId(id)) {
    return undefined;
  }

  return Invoice.findById(id).lean();
}

async function ensureUniqueSalesExecutive(payload, currentId = null) {
  const conflictQuery = {
    isArchived: false,
    $or: [
      { phone: payload.phone }
    ]
  };

  if (payload.email) {
    conflictQuery.$or.push({ email: payload.email });
  }

  if (currentId) {
    conflictQuery._id = { $ne: currentId };
  }

  const conflict = await SalesExecutive.findOne(conflictQuery).lean();

  if (!conflict) {
    return [];
  }

  const errors = [];
  if (conflict.phone === payload.phone) {
    errors.push("A sales executive with this phone number already exists.");
  }
  if (payload.email && conflict.email === payload.email) {
    errors.push("A sales executive with this email already exists.");
  }

  return errors;
}

function normalizeEmployeePassword(value) {
  const password = String(value || "");
  return password.length >= 8 && password.length <= 128 ? password : "";
}

function employeeUserStatusForSalesStatus(status) {
  if (status === "Active") {
    return "active";
  }

  return status === "Suspended" ? "suspended" : "inactive";
}

function getPersistenceErrorDetails(error, fallbackMessage = "Unable to save the sales executive right now.") {
  if (!error) {
    return { statusCode: 500, message: fallbackMessage, details: [] };
  }

  if (error.code === 11000) {
    const fields = Object.keys(error.keyPattern || error.keyValue || {});
    const details = [];

    if (fields.includes("email")) {
      details.push("A user account with this employee email already exists.");
    }
    if (fields.includes("phone")) {
      details.push("A sales executive with this phone number already exists.");
    }
    if (!details.length) {
      details.push("A duplicate record already exists for this employee.");
    }

    return {
      statusCode: 409,
      message: "Please fix the sales executive form and try again.",
      details
    };
  }

  if (error.name === "ValidationError") {
    const details = Object.values(error.errors || {})
      .map((validationError) => validationError.message)
      .filter(Boolean);

    return {
      statusCode: 400,
      message: "Please fix the sales executive form and try again.",
      details
    };
  }

  return { statusCode: 500, message: fallbackMessage, details: [] };
}

async function validateEmployeeAccountRequest(payload, body = {}, currentUserId = null) {
  const errors = [];
  const email = normalizeEmailAddress(payload && payload.email);
  const providedPassword = String((body && (body.password || body.initialPassword)) || "");

  if (providedPassword && !normalizeEmployeePassword(providedPassword)) {
    errors.push("Employee login password must be between 8 and 128 characters.");
  }

  if (!email) {
    return errors;
  }

  if (isOfficialAdminEmail(email)) {
    errors.push("The official AutomateX owner email cannot be used for an employee account.");
    return errors;
  }

  const emailOwner = await User.findOne({ email }).lean();
  if (emailOwner && (!currentUserId || String(emailOwner._id) !== String(currentUserId))) {
    errors.push("A user account with this employee email already exists.");
  }

  return errors;
}

async function syncEmployeeUserAccount(executive, body = {}) {
  const requestedPassword = normalizeEmployeePassword(body.password || body.initialPassword);
  const email = normalizeEmailAddress(executive.email);

  if (!email) {
    return { userId: null, errors: [] };
  }

  let user = executive.userId ? await User.findById(executive.userId) : null;

  if (!user && !requestedPassword) {
    return { userId: null, errors: [] };
  }

  if (!user) {
    user = new User({
      name: executive.fullName,
      email,
      passwordHash: await bcrypt.hash(requestedPassword, SALT_ROUNDS),
      role: "employee",
      status: employeeUserStatusForSalesStatus(executive.status),
      isActive: executive.status === "Active",
      plan: "not_assigned",
      accountStatus: "active",
      paymentStatus: "pending"
    });
  } else {
    user.name = executive.fullName;
    user.email = email;
    user.role = "employee";
    if (requestedPassword) {
      user.passwordHash = await bcrypt.hash(requestedPassword, SALT_ROUNDS);
    }
  }

  user.status = employeeUserStatusForSalesStatus(executive.status);
  user.isActive = executive.status === "Active";
  await user.save();

  return { userId: user._id, errors: [] };
}

async function getAdminSalesExecutives(req, res) {
  try {
    const match = { isArchived: req.query.includeArchived === "true" ? { $in: [true, false] } : false };

    if (req.query.status && SALES_EXECUTIVE_STATUS_OPTIONS.includes(req.query.status)) {
      match.status = req.query.status;
    }

    if (req.query.workType && SALES_EXECUTIVE_WORK_TYPE_OPTIONS.includes(req.query.workType)) {
      match.workType = req.query.workType;
    }

    const searchPattern = buildSearchRegex(req.query.search);
    if (searchPattern) {
      match.$or = [
        { fullName: searchPattern },
        { phone: searchPattern },
        { email: searchPattern },
        { nicNumber: searchPattern }
      ];
    }

    const executives = await SalesExecutive.find(match).sort({ createdAt: -1 }).lean();
    const currentMonthYear = getCurrentMonthYear();
    const month = normalizeInteger(req.query.month, currentMonthYear.month, 1, 12) || currentMonthYear.month;
    const year = normalizeInteger(req.query.year, currentMonthYear.year, 2000, 2100) || currentMonthYear.year;
    const { monthStart, monthEnd } = getMonthWindow(month, year);
    const performanceByExecutive = await Lead.aggregate([
      {
        $match: {
          salesExecutiveId: { $in: executives.map((executive) => executive._id) },
          isArchived: false,
          approvalStatus: "approved",
          paymentReceived: true,
          paymentDate: { $gte: monthStart, $lt: monthEnd }
        }
      },
      {
        $group: {
          _id: "$salesExecutiveId",
          approvedPaidClients: { $sum: 1 },
          approvedRevenue: { $sum: "$amountReceived" }
        }
      }
    ]);
    const performanceMap = new Map(performanceByExecutive.map((row) => [String(row._id), row]));

    return sendSuccess(res, 200, {
      salesExecutives: executives.map((executive) => {
        const serialized = serializeSalesExecutive(executive, { includeSensitiveFields: true });
        const performance = performanceMap.get(String(executive._id)) || {};
        serialized.monthlyPerformance = {
          month,
          year,
          approvedRevenue: performance.approvedRevenue || 0,
          ...calculateTargetCommission(performance.approvedPaidClients || 0, executive.commissionRules || {})
        };
        return serialized;
      })
    });
  } catch {
    return sendError(res, 500, "Unable to load sales executives right now.");
  }
}

async function createAdminSalesExecutive(req, res) {
  try {
    const { payload, errors } = buildSalesExecutivePayload(req.body);
    const uniquenessErrors = errors.length ? [] : await ensureUniqueSalesExecutive(payload);
    const accountErrors = errors.length || uniquenessErrors.length
      ? []
      : await validateEmployeeAccountRequest(payload, req.body);

    if (errors.length || uniquenessErrors.length || accountErrors.length) {
      return sendError(res, 400, "Please fix the sales executive form and try again.", [...errors, ...uniquenessErrors, ...accountErrors]);
    }

    const executive = await SalesExecutive.create({
      ...payload,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });

    let accountSync;
    try {
      accountSync = await syncEmployeeUserAccount(executive, req.body);
    } catch (error) {
      await SalesExecutive.deleteOne({ _id: executive._id });
      const formattedError = getPersistenceErrorDetails(error, "Employee profile was not created because login setup failed.");
      return sendError(res, formattedError.statusCode, formattedError.message, formattedError.details);
    }

    if (accountSync.errors.length) {
      await SalesExecutive.deleteOne({ _id: executive._id });
      return sendError(res, 400, "Sales profile was created, but employee login could not be enabled.", accountSync.errors);
    }
    if (accountSync.userId) {
      executive.userId = accountSync.userId;
      await executive.save();
    }
    await logAdminAction(req, {
      module: "Sales",
      action: "sales_executives.created",
      targetType: "SalesExecutive",
      targetId: String(executive._id),
      targetLabel: executive.fullName,
      newValue: serializeSalesExecutive(executive.toObject(), { includeSensitiveFields: true }),
      severity: "Medium"
    });

    return sendSuccess(res, 201, {
      message: "Sales executive created successfully.",
      salesExecutive: serializeSalesExecutive(executive.toObject(), { includeSensitiveFields: true })
    });
  } catch (error) {
    const formattedError = getPersistenceErrorDetails(error, "Unable to create the sales executive right now.");
    return sendError(res, formattedError.statusCode, formattedError.message, formattedError.details);
  }
}

async function getAdminSalesExecutiveById(req, res) {
  try {
    const executive = await findSalesExecutiveById(req.params.id, req.query.includeArchived === "true");
    if (executive === undefined) {
      return sendError(res, 400, "Invalid sales executive ID.");
    }
    if (!executive) {
      return sendError(res, 404, "Sales executive not found.");
    }

    return sendSuccess(res, 200, {
      salesExecutive: serializeSalesExecutive(executive, { includeSensitiveFields: true })
    });
  } catch {
    return sendError(res, 500, "Unable to load the sales executive right now.");
  }
}

async function updateAdminSalesExecutive(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid sales executive ID.");
    }

    const executive = await SalesExecutive.findOne({ _id: req.params.id, isArchived: false });
    if (!executive) {
      return sendError(res, 404, "Sales executive not found.");
    }
    const oldValue = executive.toObject();

    const { payload, errors } = buildSalesExecutivePayload(req.body, executive.toObject());
    const uniquenessErrors = errors.length ? [] : await ensureUniqueSalesExecutive(payload, executive._id);
    const accountErrors = errors.length || uniquenessErrors.length
      ? []
      : await validateEmployeeAccountRequest(payload, req.body, executive.userId);

    if (errors.length || uniquenessErrors.length || accountErrors.length) {
      return sendError(res, 400, "Please fix the sales executive form and try again.", [...errors, ...uniquenessErrors, ...accountErrors]);
    }

    Object.assign(executive, payload, { updatedBy: req.user.id });
    let accountSync;
    try {
      accountSync = await syncEmployeeUserAccount(executive, req.body);
    } catch (error) {
      const formattedError = getPersistenceErrorDetails(error, "Employee login could not be updated.");
      return sendError(res, formattedError.statusCode, formattedError.message, formattedError.details);
    }

    if (accountSync.errors.length) {
      return sendError(res, 400, "Employee login could not be updated.", accountSync.errors);
    }
    if (accountSync.userId) {
      executive.userId = accountSync.userId;
    }
    await executive.save();
    await logAdminAction(req, {
      module: "Sales",
      action: req.auditAction || "sales_executives.updated",
      targetType: "SalesExecutive",
      targetId: String(executive._id),
      targetLabel: executive.fullName,
      oldValue,
      newValue: serializeSalesExecutive(executive.toObject(), { includeSensitiveFields: true }),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Sales executive updated successfully.",
      salesExecutive: serializeSalesExecutive(executive.toObject(), { includeSensitiveFields: true })
    });
  } catch (error) {
    const formattedError = getPersistenceErrorDetails(error, "Unable to update the sales executive right now.");
    return sendError(res, formattedError.statusCode, formattedError.message, formattedError.details);
  }
}

async function updateAdminSalesExecutiveStatus(req, res) {
  req.auditAction = "sales_executives.status_updated";
  req.body = {
    status: req.body.status
  };
  return updateAdminSalesExecutive(req, res);
}

async function archiveAdminSalesExecutive(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid sales executive ID.");
    }

    const executive = await SalesExecutive.findOneAndUpdate(
      { _id: req.params.id, isArchived: false },
      {
        isArchived: true,
        archivedAt: new Date(),
        status: "Inactive",
        updatedBy: req.user.id
      },
      { new: true }
    ).lean();

    if (!executive) {
      return sendError(res, 404, "Sales executive not found.");
    }
    if (executive.userId) {
      await User.findByIdAndUpdate(executive.userId, {
        status: "inactive",
        isActive: false
      });
    }
    await logAdminAction(req, {
      module: "Sales",
      action: "sales_executives.archived",
      targetType: "SalesExecutive",
      targetId: String(executive._id),
      targetLabel: executive.fullName,
      newValue: serializeSalesExecutive(executive, { includeSensitiveFields: true }),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Sales executive archived successfully.",
      salesExecutive: serializeSalesExecutive(executive, { includeSensitiveFields: true })
    });
  } catch {
    return sendError(res, 500, "Unable to archive the sales executive right now.");
  }
}

async function getAdminLeads(req, res) {
  try {
    const match = { isArchived: false };

    if (req.query.salesExecutiveId) {
      if (!isValidObjectId(req.query.salesExecutiveId)) {
        return sendError(res, 400, "Invalid sales executive filter.");
      }
      match.salesExecutiveId = req.query.salesExecutiveId;
    }

    if (req.query.status && LEAD_STATUS_OPTIONS.includes(req.query.status)) {
      match.status = req.query.status;
    }

    if (req.query.interestedService && LEAD_INTERESTED_SERVICE_OPTIONS.includes(req.query.interestedService)) {
      match.interestedService = req.query.interestedService;
    }

    if (req.query.priority && LEAD_PRIORITY_OPTIONS.includes(req.query.priority)) {
      match.priority = req.query.priority;
    }

    const followUpDate = {};
    const followUpFrom = normalizeDate(req.query.followUpFrom);
    const followUpTo = normalizeDate(req.query.followUpTo);

    if (followUpFrom === undefined || followUpTo === undefined) {
      return sendError(res, 400, "Follow-up date filters must be valid dates.");
    }

    if (followUpFrom) {
      followUpDate.$gte = followUpFrom;
    }
    if (followUpTo) {
      followUpDate.$lte = followUpTo;
    }
    if (Object.keys(followUpDate).length) {
      match.followUpDate = followUpDate;
    }

    const searchPattern = buildSearchRegex(req.query.search);
    if (searchPattern) {
      match.$or = [
        { businessName: searchPattern },
        { contactPerson: searchPattern },
        { phone: searchPattern },
        { location: searchPattern }
      ];
    }

    const leads = await Lead.find(match)
      .populate("salesExecutiveId", "fullName phone")
      .populate("clientId", "name email businessName")
      .populate("convertedProjectId", "projectTitle")
      .sort({ createdAt: -1 })
      .lean();

    return sendSuccess(res, 200, {
      leads: leads.map(serializeLead)
    });
  } catch {
    return sendError(res, 500, "Unable to load leads right now.");
  }
}

async function createAdminLead(req, res) {
  try {
    const salesExecutive = await findSalesExecutiveById(req.body.salesExecutiveId);
    if (salesExecutive === undefined) {
      return sendError(res, 400, "Invalid assigned sales executive.");
    }

    const { payload, errors } = buildLeadPayload(req.body);
    if (errors.length) {
      return sendError(res, 400, "Please fix the lead form and try again.", errors);
    }

    const lead = await Lead.create({
      ...payload,
      salesExecutiveId: salesExecutive ? salesExecutive._id : null,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });
    const populatedLead = await Lead.findById(lead._id)
      .populate("salesExecutiveId", "fullName phone")
      .populate("clientId", "name email businessName")
      .populate("convertedProjectId", "projectTitle")
      .lean();
    await logAdminAction(req, {
      module: "Leads",
      action: "leads.created",
      targetType: "Lead",
      targetId: String(lead._id),
      targetLabel: lead.businessName || lead.contactPerson,
      newValue: serializeLead(populatedLead),
      severity: "Medium"
    });

    return sendSuccess(res, 201, {
      message: "Lead created successfully.",
      lead: serializeLead(populatedLead)
    });
  } catch {
    return sendError(res, 500, "Unable to create the lead right now.");
  }
}

async function getAdminLeadById(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid lead ID.");
    }

    const lead = await Lead.findOne({ _id: req.params.id, isArchived: false })
      .populate("salesExecutiveId", "fullName phone")
      .populate("clientId", "name email businessName")
      .populate("convertedProjectId", "projectTitle")
      .lean();

    if (!lead) {
      return sendError(res, 404, "Lead not found.");
    }

    return sendSuccess(res, 200, { lead: serializeLead(lead) });
  } catch {
    return sendError(res, 500, "Unable to load the lead right now.");
  }
}

async function updateAdminLead(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid lead ID.");
    }

    const lead = await Lead.findOne({ _id: req.params.id, isArchived: false });
    if (!lead) {
      return sendError(res, 404, "Lead not found.");
    }
    const oldValue = lead.toObject();

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "salesExecutiveId")) {
      const salesExecutive = await findSalesExecutiveById(req.body.salesExecutiveId);
      if (salesExecutive === undefined) {
        return sendError(res, 400, "Invalid assigned sales executive.");
      }
      lead.salesExecutiveId = salesExecutive ? salesExecutive._id : null;
    }

    const { payload, errors } = buildLeadPayload(req.body, lead.toObject());
    if (errors.length) {
      return sendError(res, 400, "Please fix the lead form and try again.", errors);
    }

    Object.assign(lead, payload, { updatedBy: req.user.id });
    await lead.save();

    const populatedLead = await Lead.findById(lead._id)
      .populate("salesExecutiveId", "fullName phone")
      .populate("clientId", "name email businessName")
      .populate("convertedProjectId", "projectTitle")
      .lean();
    await logAdminAction(req, {
      module: "Leads",
      action: req.auditAction || "leads.updated",
      targetType: "Lead",
      targetId: String(lead._id),
      targetLabel: lead.businessName || lead.contactPerson,
      oldValue,
      newValue: serializeLead(populatedLead),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Lead updated successfully.",
      lead: serializeLead(populatedLead)
    });
  } catch {
    return sendError(res, 500, "Unable to update the lead right now.");
  }
}

async function updateAdminLeadStatus(req, res) {
  req.auditAction = "leads.status_updated";
  req.body = {
    status: req.body.status,
    rejectionReason: req.body.rejectionReason
  };
  return updateAdminLead(req, res);
}

async function convertAdminLead(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid lead ID.");
    }

    const lead = await Lead.findOne({ _id: req.params.id, isArchived: false });
    if (!lead) {
      return sendError(res, 404, "Lead not found.");
    }
    const oldValue = lead.toObject();

    const client = await validateOptionalClient(req.body.clientId);
    if (client === undefined) {
      return sendError(res, 400, "Select a valid active client before linking a converted lead.");
    }

    const project = await validateOptionalProject(req.body.convertedProjectId, client ? client._id : "");
    if (project === undefined) {
      return sendError(res, 400, "Select a valid active project that belongs to the converted client.");
    }

    lead.clientId = client ? client._id : lead.clientId;
    lead.convertedProjectId = project ? project._id : lead.convertedProjectId;
    lead.status = "Converted";
    lead.updatedBy = req.user.id;
    await lead.save();

    const populatedLead = await Lead.findById(lead._id)
      .populate("salesExecutiveId", "fullName phone")
      .populate("clientId", "name email businessName")
      .populate("convertedProjectId", "projectTitle")
      .lean();
    await logAdminAction(req, {
      module: "Leads",
      action: "leads.converted",
      targetType: "Lead",
      targetId: String(lead._id),
      targetLabel: lead.businessName || lead.contactPerson,
      oldValue,
      newValue: serializeLead(populatedLead),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Lead converted successfully.",
      lead: serializeLead(populatedLead)
    });
  } catch {
    return sendError(res, 500, "Unable to convert the lead right now.");
  }
}

async function updateAdminLeadPaymentApproval(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid lead ID.");
    }

    const lead = await Lead.findOne({ _id: req.params.id, isArchived: false });
    if (!lead) {
      return sendError(res, 404, "Lead not found.");
    }

    const oldValue = lead.toObject();
    const approvalStatus = normalizeEnum(req.body.approvalStatus, LEAD_APPROVAL_STATUS_OPTIONS, "");
    const amountReceived = hasBodyField(req.body, "amountReceived")
      ? normalizeMoney(req.body.amountReceived)
      : normalizeMoney(lead.amountReceived);
    const paymentDate = hasBodyField(req.body, "paymentDate")
      ? normalizeDate(req.body.paymentDate)
      : normalizeDate(lead.paymentDate);

    if (!["pending", "approved", "rejected"].includes(approvalStatus)) {
      return sendError(res, 400, "Approval status must be pending, approved, or rejected.");
    }
    if (amountReceived === null) {
      return sendError(res, 400, "Amount received must be zero or greater.");
    }
    if (paymentDate === undefined) {
      return sendError(res, 400, "Payment date must be valid.");
    }
    if (approvalStatus === "approved" && (!amountReceived || amountReceived <= 0)) {
      return sendError(res, 400, "Amount received must be greater than zero before approving a paid client.");
    }

    lead.paymentReceived = normalizeBoolean(req.body.paymentReceived, Boolean(lead.paymentReceived));
    lead.amountReceived = amountReceived || 0;
    lead.packageSold = cleanText(hasBodyField(req.body, "packageSold") ? req.body.packageSold : lead.packageSold, 180);
    lead.paymentDate = paymentDate || lead.paymentDate || null;
    lead.adminNote = cleanText(req.body.adminNote || "", 5000);
    lead.approvalStatus = approvalStatus;
    lead.updatedBy = req.user.id;

    if (approvalStatus === "approved") {
      lead.paymentReceived = true;
      lead.status = "Paid / Closed";
      lead.approvedAt = new Date();
      lead.approvedBy = req.user.id;
      lead.rejectedAt = null;
      lead.rejectedBy = null;
      if (!lead.paymentDate) {
        lead.paymentDate = new Date();
      }
    } else if (approvalStatus === "rejected") {
      lead.rejectedAt = new Date();
      lead.rejectedBy = req.user.id;
      lead.approvedAt = null;
      lead.approvedBy = null;
    } else if (!lead.submittedForApprovalAt) {
      lead.submittedForApprovalAt = new Date();
    }

    await lead.save();

    const populatedLead = await Lead.findById(lead._id)
      .populate("salesExecutiveId", "fullName phone")
      .populate("clientId", "name email businessName")
      .populate("convertedProjectId", "projectTitle")
      .lean();

    await logAdminAction(req, {
      module: "Leads",
      action: "leads.payment_approval_updated",
      targetType: "Lead",
      targetId: String(lead._id),
      targetLabel: lead.businessName || lead.contactPerson,
      oldValue,
      newValue: serializeLead(populatedLead),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Lead payment approval updated successfully.",
      lead: serializeLead(populatedLead)
    });
  } catch {
    return sendError(res, 500, "Unable to update payment approval right now.");
  }
}

async function getAdminCommissions(req, res) {
  try {
    const match = {};

    if (req.query.salesExecutiveId) {
      if (!isValidObjectId(req.query.salesExecutiveId)) {
        return sendError(res, 400, "Invalid sales executive filter.");
      }
      match.salesExecutiveId = req.query.salesExecutiveId;
    }

    if (req.query.status && COMMISSION_STATUS_OPTIONS.includes(req.query.status)) {
      match.status = req.query.status;
    }

    const month = normalizeInteger(req.query.month, 0, 1, 12);
    const year = normalizeInteger(req.query.year, 0, 2000, 2100);

    if (month === null || year === null) {
      return sendError(res, 400, "Commission month and year filters must be valid.");
    }
    if (month) {
      match.commissionMonth = month;
    }
    if (year) {
      match.commissionYear = year;
    }

    const commissions = await Commission.find(match)
      .populate("salesExecutiveId", "fullName phone")
      .populate("leadId", "businessName contactPerson")
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .populate("invoiceId", "invoiceNumber title")
      .sort({ commissionYear: -1, commissionMonth: -1, createdAt: -1 })
      .lean();

    return sendSuccess(res, 200, {
      commissions: commissions.map(serializeCommission)
    });
  } catch {
    return sendError(res, 500, "Unable to load commissions right now.");
  }
}

async function resolveCommissionLinks(body, currentCommission = null) {
  const errors = [];
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
  const links = {};
  const salesExecutiveId = hasOwn("salesExecutiveId")
    ? body.salesExecutiveId
    : currentCommission && currentCommission.salesExecutiveId;
  const salesExecutive = await findSalesExecutiveById(salesExecutiveId);

  if (salesExecutive === undefined || !salesExecutive) {
    errors.push("Select a valid active sales executive.");
  } else {
    links.salesExecutiveId = salesExecutive._id;
  }

  const linkConfig = [
    ["leadId", Lead, { isArchived: false }, "lead"],
    ["clientId", User, { isActive: true }, "client"],
    ["projectId", Project, { isArchived: false }, "project"]
  ];

  for (const [field, Model, extraMatch, label] of linkConfig) {
    const id = hasOwn(field) ? body[field] : currentCommission && currentCommission[field];
    if (!id) {
      links[field] = null;
      continue;
    }
    if (!isValidObjectId(id)) {
      errors.push(`Invalid ${label} ID.`);
      continue;
    }
    const document = await Model.findOne({ _id: id, ...extraMatch }).lean();
    if (!document) {
      errors.push(`Selected ${label} was not found.`);
      continue;
    }
    if (field === "clientId" && resolveTrustedRole(document) !== "client") {
      errors.push("Selected client must be an active client account.");
      continue;
    }
    links[field] = document._id;
  }

  const invoiceId = hasOwn("invoiceId") ? body.invoiceId : currentCommission && currentCommission.invoiceId;
  const invoice = await validateOptionalInvoice(invoiceId);
  if (invoice === undefined) {
    errors.push("Selected invoice was not found.");
  } else {
    links.invoiceId = invoice ? invoice._id : null;
  }

  return { links, errors };
}

async function createAdminCommission(req, res) {
  try {
    const { payload, errors } = buildCommissionPayload(req.body);
    const { links, errors: linkErrors } = await resolveCommissionLinks(req.body);

    if (errors.length || linkErrors.length) {
      return sendError(res, 400, "Please fix the commission form and try again.", [...errors, ...linkErrors]);
    }

    const commission = await Commission.create({
      ...payload,
      ...links,
      createdBy: req.user.id,
      updatedBy: req.user.id,
      approvedBy: payload.status === "Approved" ? req.user.id : null,
      paidDate: payload.status === "Paid" ? (payload.paidDate || new Date()) : payload.paidDate
    });
    const populatedCommission = await Commission.findById(commission._id)
      .populate("salesExecutiveId", "fullName phone")
      .populate("leadId", "businessName contactPerson")
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .populate("invoiceId", "invoiceNumber title")
      .lean();
    await logAdminAction(req, {
      module: "Commissions",
      action: "commissions.created",
      targetType: "Commission",
      targetId: String(commission._id),
      targetLabel: commission.commissionType || "Commission",
      newValue: serializeCommission(populatedCommission),
      severity: "Medium"
    });

    return sendSuccess(res, 201, {
      message: "Commission created successfully.",
      commission: serializeCommission(populatedCommission)
    });
  } catch {
    return sendError(res, 500, "Unable to create the commission right now.");
  }
}

async function getAdminCommissionById(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid commission ID.");
    }

    const commission = await Commission.findById(req.params.id)
      .populate("salesExecutiveId", "fullName phone")
      .populate("leadId", "businessName contactPerson")
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .populate("invoiceId", "invoiceNumber title")
      .lean();

    if (!commission) {
      return sendError(res, 404, "Commission not found.");
    }

    return sendSuccess(res, 200, { commission: serializeCommission(commission) });
  } catch {
    return sendError(res, 500, "Unable to load the commission right now.");
  }
}

async function updateAdminCommission(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid commission ID.");
    }

    const commission = await Commission.findById(req.params.id);
    if (!commission) {
      return sendError(res, 404, "Commission not found.");
    }
    const oldValue = commission.toObject();

    if (commission.status === "Paid" && req.body.status === "Cancelled") {
      return sendError(res, 400, "Paid commissions cannot be cancelled.");
    }

    const { payload, errors } = buildCommissionPayload(req.body, commission.toObject());
    const { links, errors: linkErrors } = await resolveCommissionLinks(req.body, commission.toObject());

    if (payload.status === "Paid" && commission.status === "Cancelled") {
      errors.push("Cancelled commissions cannot be marked as paid.");
    }

    if (errors.length || linkErrors.length) {
      return sendError(res, 400, "Please fix the commission form and try again.", [...errors, ...linkErrors]);
    }

    Object.assign(commission, payload, links, { updatedBy: req.user.id });

    if (payload.status === "Approved" && !commission.approvedBy) {
      commission.approvedBy = req.user.id;
    }
    if (payload.status === "Paid" && !commission.paidDate) {
      commission.paidDate = new Date();
    }
    if (payload.status === "Cancelled") {
      commission.paidDate = null;
    }

    await commission.save();

    const populatedCommission = await Commission.findById(commission._id)
      .populate("salesExecutiveId", "fullName phone")
      .populate("leadId", "businessName contactPerson")
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .populate("invoiceId", "invoiceNumber title")
      .lean();
    await logAdminAction(req, {
      module: "Commissions",
      action: req.auditAction || "commissions.updated",
      targetType: "Commission",
      targetId: String(commission._id),
      targetLabel: commission.commissionType || "Commission",
      oldValue,
      newValue: serializeCommission(populatedCommission),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Commission updated successfully.",
      commission: serializeCommission(populatedCommission)
    });
  } catch {
    return sendError(res, 500, "Unable to update the commission right now.");
  }
}

async function approveAdminCommission(req, res) {
  req.auditAction = "commissions.approved";
  req.body = {
    ...req.body,
    status: "Approved"
  };
  return updateAdminCommission(req, res);
}

async function markAdminCommissionPaid(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid commission ID.");
    }

    const commission = await Commission.findById(req.params.id);
    if (!commission) {
      return sendError(res, 404, "Commission not found.");
    }
    const oldValue = commission.toObject();

    if (commission.status === "Cancelled") {
      return sendError(res, 400, "Cancelled commissions cannot be paid.");
    }

    commission.status = "Paid";
    commission.paidDate = normalizeDate(req.body.paidDate) || new Date();
    commission.paymentReference = cleanText(req.body.paymentReference || commission.paymentReference, 180);
    commission.updatedBy = req.user.id;
    if (!commission.approvedBy) {
      commission.approvedBy = req.user.id;
    }
    await commission.save();

    const populatedCommission = await Commission.findById(commission._id)
      .populate("salesExecutiveId", "fullName phone")
      .populate("leadId", "businessName contactPerson")
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .populate("invoiceId", "invoiceNumber title")
      .lean();
    await logAdminAction(req, {
      module: "Commissions",
      action: "commissions.marked_paid",
      targetType: "Commission",
      targetId: String(commission._id),
      targetLabel: commission.commissionType || "Commission",
      oldValue,
      newValue: serializeCommission(populatedCommission),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Commission marked as paid successfully.",
      commission: serializeCommission(populatedCommission)
    });
  } catch {
    return sendError(res, 500, "Unable to mark the commission as paid right now.");
  }
}

async function cancelAdminCommission(req, res) {
  req.auditAction = "commissions.cancelled";
  req.body = {
    ...req.body,
    status: "Cancelled",
    paidDate: null
  };
  return updateAdminCommission(req, res);
}

async function getSalesExecutiveCommissionSummary(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid sales executive ID.");
    }

    const executive = await SalesExecutive.findOne({ _id: req.params.id, isArchived: false }).lean();
    if (!executive) {
      return sendError(res, 404, "Sales executive not found.");
    }

    const currentMonthYear = getCurrentMonthYear();
    const month = normalizeInteger(req.query.month, currentMonthYear.month, 1, 12);
    const year = normalizeInteger(req.query.year, currentMonthYear.year, 2000, 2100);

    if (month === null || year === null) {
      return sendError(res, 400, "Summary month and year must be valid.");
    }

    const { monthStart, monthEnd } = getMonthWindow(month, year);
    const leadMatch = {
      salesExecutiveId: executive._id,
      isArchived: false,
      createdAt: { $gte: monthStart, $lt: monthEnd }
    };
    const commissionMatch = {
      salesExecutiveId: executive._id,
      commissionMonth: month,
      commissionYear: year
    };
    const [totalLeads, convertedLeads, approvedPaidClients, pendingApprovalClients, commissions, convertedLeadProjects] = await Promise.all([
      Lead.countDocuments(leadMatch),
      Lead.countDocuments({ ...leadMatch, status: { $in: ["Converted", "Paid / Closed"] } }),
      Lead.countDocuments({
        salesExecutiveId: executive._id,
        isArchived: false,
        approvalStatus: "approved",
        paymentReceived: true,
        paymentDate: { $gte: monthStart, $lt: monthEnd }
      }),
      Lead.countDocuments({
        salesExecutiveId: executive._id,
        isArchived: false,
        approvalStatus: "pending"
      }),
      Commission.find(commissionMatch).lean(),
      Lead.find({
        salesExecutiveId: executive._id,
        status: { $in: ["Converted", "Paid / Closed"] },
        convertedProjectId: { $ne: null }
      }).select("convertedProjectId").lean()
    ]);
    const projectIds = convertedLeadProjects.map((lead) => lead.convertedProjectId).filter(Boolean);
    const activeProjects = projectIds.length
      ? await Project.countDocuments({ _id: { $in: projectIds }, isArchived: false, status: { $nin: ["Completed", "Cancelled", "On Hold"] } })
      : 0;
    const totalCommissionPending = commissions
      .filter((commission) => ["Pending", "Approved"].includes(commission.status))
      .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);
    const totalCommissionPaid = commissions
      .filter((commission) => commission.status === "Paid")
      .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);
    const targetPerformance = calculateTargetCommission(approvedPaidClients, executive.commissionRules || {});

    return sendSuccess(res, 200, {
      summary: {
        salesExecutive: serializeSalesExecutive(executive),
        month,
        year,
        totalLeads,
        convertedLeads,
        pendingApprovalClients,
        activeProjects,
        totalCommissionPending,
        totalCommissionPaid,
        monthlyTarget: targetPerformance.monthlyTarget,
        monthlyTargetProgress: targetPerformance.progressPercent,
        targetPerformance
      }
    });
  } catch {
    return sendError(res, 500, "Unable to load commission summary right now.");
  }
}

async function getAdminSalesSummary(req, res) {
  try {
    const currentMonthYear = getCurrentMonthYear();
    const month = normalizeInteger(req.query.month, currentMonthYear.month, 1, 12);
    const year = normalizeInteger(req.query.year, currentMonthYear.year, 2000, 2100);

    if (month === null || year === null) {
      return sendError(res, 400, "Summary month and year must be valid.");
    }

    const { monthStart, monthEnd } = getMonthWindow(month, year);
    const [activeSalesExecutives, totalLeadsThisMonth, newLeads, followUpLeads, confirmedPaidClients, pendingApprovalClients, commissions, executives] = await Promise.all([
      SalesExecutive.countDocuments({ status: "Active", isArchived: false }),
      Lead.countDocuments({ isArchived: false, createdAt: { $gte: monthStart, $lt: monthEnd } }),
      Lead.countDocuments({ status: { $in: ["New", "New Lead"] }, isArchived: false }),
      Lead.countDocuments({ status: { $in: ["Follow Up", "Contacted", "Interested", "Quotation Sent", "Proposal Sent"] }, isArchived: false }),
      Lead.countDocuments({
        approvalStatus: "approved",
        paymentReceived: true,
        isArchived: false,
        paymentDate: { $gte: monthStart, $lt: monthEnd }
      }),
      Lead.countDocuments({ approvalStatus: "pending", isArchived: false }),
      Commission.find({ commissionMonth: month, commissionYear: year }).lean(),
      SalesExecutive.find({ isArchived: false }).sort({ fullName: 1 }).lean()
    ]);
    const approvedByExecutive = await Lead.aggregate([
      {
        $match: {
          isArchived: false,
          approvalStatus: "approved",
          paymentReceived: true,
          paymentDate: { $gte: monthStart, $lt: monthEnd }
        }
      },
      {
        $group: {
          _id: "$salesExecutiveId",
          approvedPaidClients: { $sum: 1 },
          approvedRevenue: { $sum: "$amountReceived" }
        }
      }
    ]);
    const approvedMap = new Map(approvedByExecutive.map((row) => [String(row._id), row]));
    const pendingCommission = commissions
      .filter((commission) => ["Pending", "Approved"].includes(commission.status))
      .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);
    const paidCommissionThisMonth = commissions
      .filter((commission) => commission.status === "Paid")
      .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);

    return sendSuccess(res, 200, {
      salesSummary: {
        month,
        year,
        activeSalesExecutives,
        totalLeadsThisMonth,
        newLeads,
        followUpLeads,
        convertedLeads: confirmedPaidClients,
        confirmedPaidClients,
        pendingApprovalClients,
        pendingCommission,
        paidCommissionThisMonth,
        employeePerformance: executives.map((executive) => {
          const performance = approvedMap.get(String(executive._id)) || {};
          return {
            salesExecutive: serializeSalesExecutive(executive),
            approvedRevenue: performance.approvedRevenue || 0,
            ...calculateTargetCommission(performance.approvedPaidClients || 0, executive.commissionRules || {})
          };
        })
      }
    });
  } catch {
    return sendError(res, 500, "Unable to load sales summary right now.");
  }
}

module.exports = {
  SALES_EXECUTIVE_STATUS_OPTIONS,
  SALES_EXECUTIVE_WORK_TYPE_OPTIONS,
  SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS,
  SALES_COMMISSION_TYPE_OPTIONS,
  LEAD_INTERESTED_SERVICE_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  LEAD_STATUS_OPTIONS,
  LEAD_PRIORITY_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  COMMISSION_STATUS_OPTIONS,
  calculateTargetCommission,
  getAdminSalesExecutives,
  createAdminSalesExecutive,
  getAdminSalesExecutiveById,
  updateAdminSalesExecutive,
  updateAdminSalesExecutiveStatus,
  archiveAdminSalesExecutive,
  getAdminLeads,
  createAdminLead,
  getAdminLeadById,
  updateAdminLead,
  updateAdminLeadStatus,
  convertAdminLead,
  updateAdminLeadPaymentApproval,
  getAdminCommissions,
  createAdminCommission,
  getAdminCommissionById,
  updateAdminCommission,
  approveAdminCommission,
  markAdminCommissionPaid,
  cancelAdminCommission,
  getSalesExecutiveCommissionSummary,
  getAdminSalesSummary
};
