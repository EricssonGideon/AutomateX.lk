const mongoose = require("mongoose");

const Commission = require("../models/Commission");
const Lead = require("../models/Lead");
const SalesExecutive = require("../models/SalesExecutive");
const { sendSuccess, sendError } = require("../utils/response");

const EMPLOYEE_LEAD_STATUS_OPTIONS = [
  "New Lead",
  "Contacted",
  "Interested",
  "Quotation Sent",
  "Payment Pending",
  "Paid / Closed",
  "Not Interested",
  "Cancelled"
];

const EMPLOYEE_SERVICE_OPTIONS = [
  "Website",
  "POS System",
  "Business System",
  "AI Chatbot",
  "Automation",
  "E-commerce",
  "Other"
];

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
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

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

function normalizeEnum(value, options, fallback) {
  const normalized = cleanText(value, 120);
  return options.includes(normalized) ? normalized : fallback;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function getMonthWindow(month, year) {
  return {
    monthStart: new Date(year, month - 1, 1),
    monthEnd: new Date(year, month, 1)
  };
}

function getSelectedMonthYear(query = {}) {
  const now = new Date();
  const month = Number(query.month || now.getMonth() + 1);
  const year = Number(query.year || now.getFullYear());

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return null;
  }

  return { month, year };
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

function serializeLead(lead) {
  return {
    id: String(lead._id || lead.id),
    clientName: lead.contactPerson || "",
    businessName: lead.businessName || "",
    phone: lead.phone || "",
    email: lead.email || "",
    businessType: lead.businessType || "",
    interestedService: lead.interestedService || "Other",
    estimatedPackageValue: lead.estimatedBudget || 0,
    status: lead.status || "New Lead",
    followUpDate: lead.followUpDate || null,
    notes: lead.notes || "",
    approvalStatus: lead.approvalStatus || "not_submitted",
    paymentReceived: Boolean(lead.paymentReceived),
    amountReceived: lead.amountReceived || 0,
    packageSold: lead.packageSold || "",
    paymentDate: lead.paymentDate || null,
    adminNote: lead.adminNote || "",
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt
  };
}

async function getEmployeeSalesExecutive(req) {
  return SalesExecutive.findOne({
    userId: req.user.id,
    isArchived: false,
    status: "Active"
  }).lean();
}

function buildEmployeeLeadPayload(body = {}, currentLead = null) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const clientName = cleanText(hasOwn("clientName") ? body.clientName : currentLead && currentLead.contactPerson, 180);
  const businessName = cleanText(hasOwn("businessName") ? body.businessName : currentLead && currentLead.businessName, 180);
  const phone = cleanText(hasOwn("phone") ? body.phone : currentLead && currentLead.phone, 40);
  const email = cleanText(hasOwn("email") ? body.email : currentLead && currentLead.email, 180).toLowerCase();
  const estimatedBudget = normalizeMoney(hasOwn("estimatedPackageValue") ? body.estimatedPackageValue : currentLead && currentLead.estimatedBudget);
  const followUpDate = normalizeDate(hasOwn("followUpDate") ? body.followUpDate : currentLead && currentLead.followUpDate);
  const errors = [];

  if (!clientName && !businessName) {
    errors.push("Client name or business name is required.");
  }
  if (!phone) {
    errors.push("Phone / WhatsApp number is required.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Lead email must be valid.");
  }
  if (estimatedBudget === null) {
    errors.push("Estimated package value must be zero or greater.");
  }
  if (followUpDate === undefined) {
    errors.push("Follow-up date must be valid.");
  }

  return {
    errors,
    payload: {
      contactPerson: clientName,
      businessName,
      phone,
      email,
      businessType: cleanText(hasOwn("businessType") ? body.businessType : currentLead && currentLead.businessType, 120),
      interestedService: normalizeEnum(
        hasOwn("interestedService") ? body.interestedService : currentLead && currentLead.interestedService,
        EMPLOYEE_SERVICE_OPTIONS,
        currentLead ? currentLead.interestedService : "Other"
      ),
      estimatedBudget: estimatedBudget === null ? 0 : estimatedBudget,
      status: normalizeEnum(
        hasOwn("status") ? body.status : currentLead && currentLead.status,
        EMPLOYEE_LEAD_STATUS_OPTIONS,
        currentLead ? currentLead.status : "New Lead"
      ),
      followUpDate: followUpDate === undefined ? null : followUpDate,
      notes: cleanText(hasOwn("notes") ? body.notes : currentLead && currentLead.notes, 5000),
      leadSource: "Sales Executive"
    }
  };
}

async function getEmployeeDashboard(req, res) {
  try {
    const executive = await getEmployeeSalesExecutive(req);
    if (!executive) {
      return sendError(res, 403, "Your employee profile is not active. Please contact admin.");
    }

    const selected = getSelectedMonthYear(req.query);
    if (!selected) {
      return sendError(res, 400, "Month and year filters must be valid.");
    }

    const { month, year } = selected;
    const { monthStart, monthEnd } = getMonthWindow(month, year);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [approvedPaidClients, pendingApprovalClients, leadsThisMonth, todayFollowUps, pipelineRows, commissions] = await Promise.all([
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
      Lead.countDocuments({
        salesExecutiveId: executive._id,
        isArchived: false,
        createdAt: { $gte: monthStart, $lt: monthEnd }
      }),
      Lead.find({
        salesExecutiveId: executive._id,
        isArchived: false,
        followUpDate: { $gte: todayStart, $lt: todayEnd },
        status: { $nin: ["Paid / Closed", "Cancelled", "Not Interested"] }
      }).sort({ followUpDate: 1 }).limit(8).lean(),
      Lead.aggregate([
        { $match: { salesExecutiveId: executive._id, isArchived: false } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Commission.find({
        salesExecutiveId: executive._id,
        commissionMonth: month,
        commissionYear: year
      }).lean()
    ]);

    const targetPerformance = calculateTargetCommission(approvedPaidClients, executive.commissionRules || {});
    const approvedCommission = commissions
      .filter((commission) => ["Approved", "Paid"].includes(commission.status))
      .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);

    return sendSuccess(res, 200, {
      dashboard: {
        employee: {
          id: String(executive._id),
          fullName: executive.fullName,
          email: executive.email,
          phone: executive.phone,
          joinedDate: executive.joinedDate
        },
        month,
        year,
        leadsThisMonth,
        pendingApprovalClients,
        todayFollowUps: todayFollowUps.map(serializeLead),
        pipelineSummary: pipelineRows.reduce((summary, row) => {
          summary[row._id || "Unknown"] = row.count;
          return summary;
        }, {}),
        targetPerformance,
        estimatedCommission: targetPerformance.estimatedCommission,
        approvedCommission,
        commissionNotice: "Commission is confirmed only after admin approval and client payment verification."
      }
    });
  } catch {
    return sendError(res, 500, "Unable to load employee dashboard right now.");
  }
}

async function getEmployeeLeads(req, res) {
  try {
    const executive = await getEmployeeSalesExecutive(req);
    if (!executive) {
      return sendError(res, 403, "Your employee profile is not active. Please contact admin.");
    }

    const match = { salesExecutiveId: executive._id, isArchived: false };
    if (req.query.status && EMPLOYEE_LEAD_STATUS_OPTIONS.includes(req.query.status)) {
      match.status = req.query.status;
    }

    const leads = await Lead.find(match).sort({ updatedAt: -1 }).lean();
    return sendSuccess(res, 200, { leads: leads.map(serializeLead) });
  } catch {
    return sendError(res, 500, "Unable to load your leads right now.");
  }
}

async function createEmployeeLead(req, res) {
  try {
    const executive = await getEmployeeSalesExecutive(req);
    if (!executive) {
      return sendError(res, 403, "Your employee profile is not active. Please contact admin.");
    }

    const { payload, errors } = buildEmployeeLeadPayload(req.body);
    if (errors.length) {
      return sendError(res, 400, "Please fix the lead form and try again.", errors);
    }

    const lead = await Lead.create({
      ...payload,
      salesExecutiveId: executive._id,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });

    return sendSuccess(res, 201, {
      message: "Lead created successfully.",
      lead: serializeLead(lead.toObject())
    });
  } catch {
    return sendError(res, 500, "Unable to create your lead right now.");
  }
}

async function updateEmployeeLead(req, res) {
  try {
    const executive = await getEmployeeSalesExecutive(req);
    if (!executive) {
      return sendError(res, 403, "Your employee profile is not active. Please contact admin.");
    }
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid lead ID.");
    }

    const lead = await Lead.findOne({ _id: req.params.id, salesExecutiveId: executive._id, isArchived: false });
    if (!lead) {
      return sendError(res, 404, "Lead not found.");
    }
    if (lead.approvalStatus === "approved") {
      return sendError(res, 403, "Approved paid clients cannot be edited by employees.");
    }

    const { payload, errors } = buildEmployeeLeadPayload(req.body, lead.toObject());
    if (errors.length) {
      return sendError(res, 400, "Please fix the lead form and try again.", errors);
    }

    Object.assign(lead, payload, { updatedBy: req.user.id });
    if (lead.approvalStatus === "rejected" && payload.status !== "Paid / Closed") {
      lead.approvalStatus = "not_submitted";
    }
    await lead.save();

    return sendSuccess(res, 200, {
      message: "Lead updated successfully.",
      lead: serializeLead(lead.toObject())
    });
  } catch {
    return sendError(res, 500, "Unable to update your lead right now.");
  }
}

async function submitEmployeeLeadForApproval(req, res) {
  try {
    const executive = await getEmployeeSalesExecutive(req);
    if (!executive) {
      return sendError(res, 403, "Your employee profile is not active. Please contact admin.");
    }
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid lead ID.");
    }

    const lead = await Lead.findOne({ _id: req.params.id, salesExecutiveId: executive._id, isArchived: false });
    if (!lead) {
      return sendError(res, 404, "Lead not found.");
    }
    if (lead.approvalStatus === "approved") {
      return sendError(res, 403, "This paid client has already been approved by admin.");
    }

    const amountReceived = normalizeMoney(req.body.amountReceived);
    const paymentDate = normalizeDate(req.body.paymentDate);
    if (amountReceived === null || amountReceived <= 0) {
      return sendError(res, 400, "Amount received must be greater than zero before approval submission.");
    }
    if (paymentDate === undefined) {
      return sendError(res, 400, "Payment date must be valid.");
    }

    lead.status = "Paid / Closed";
    lead.approvalStatus = "pending";
    lead.paymentReceived = false;
    lead.amountReceived = amountReceived;
    lead.packageSold = cleanText(req.body.packageSold || lead.packageSold || lead.interestedService, 180);
    lead.paymentDate = paymentDate || new Date();
    lead.submittedForApprovalAt = new Date();
    lead.adminNote = "";
    lead.updatedBy = req.user.id;
    await lead.save();

    return sendSuccess(res, 200, {
      message: "Paid client submitted for admin approval.",
      lead: serializeLead(lead.toObject())
    });
  } catch {
    return sendError(res, 500, "Unable to submit this lead for approval right now.");
  }
}

module.exports = {
  EMPLOYEE_LEAD_STATUS_OPTIONS,
  EMPLOYEE_SERVICE_OPTIONS,
  calculateTargetCommission,
  getEmployeeDashboard,
  getEmployeeLeads,
  createEmployeeLead,
  updateEmployeeLead,
  submitEmployeeLeadForApproval
};
