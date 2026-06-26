const mongoose = require("mongoose");

const User = require("../models/User");
const Booking = require("../models/Booking");
const Inquiry = require("../models/Inquiry");
const Invoice = require("../models/Invoice");
const Review = require("../models/Review");
const SupportRequest = require("../models/SupportRequest");
const AppSettings = require("../models/AppSettings");
const Project = require("../models/Project");
const MaintenancePlan = require("../models/MaintenancePlan");
const Lead = require("../models/Lead");
const Commission = require("../models/Commission");
const SalesExecutive = require("../models/SalesExecutive");
const AuditLog = require("../models/AuditLog");
const {
  OFFICIAL_ADMIN_EMAIL,
  isOfficialAdminEmail,
  normalizeRole,
  resolveTrustedRole
} = require("../utils/authRole");
const { AUDIT_MODULES, AUDIT_SEVERITIES, logAdminAction } = require("../utils/auditLog");
const {
  DEFAULT_APP_SETTINGS,
  buildAppSettingsUpdatePayload,
  buildDueDateFromTerms,
  normalizeInvoicePrefix,
  serializeAppSettings
} = require("../utils/appSettings");
const {
  PLAN_OPTIONS,
  ACCOUNT_STATUS_OPTIONS,
  normalizePlan,
  normalizeAccountStatus,
  resolveAccountStatus,
  normalizePaymentStatus,
  normalizeAllowedFeatures,
  resolveAllowedFeatures,
  normalizeMonthlyFee,
  normalizeNextPaymentDate,
  resolveOnboardingStatus,
  buildFeatureAccess,
  getPlanDefaultFeatures
} = require("../utils/account");
const {
  INVOICE_STATUS_OPTIONS,
  DEFAULT_INVOICE_CURRENCY,
  roundMoney,
  normalizeMoney,
  normalizeInvoiceText,
  normalizeInvoiceDate,
  normalizeInvoiceStatus,
  normalizeInvoiceType,
  normalizeInvoicePaymentMethod,
  calculateInvoiceTotals,
  resolveInvoiceStatus,
  statusToPaymentStatus,
  paymentStatusToStatus,
  serializeInvoice
} = require("../utils/invoice");
const { generateInvoicePdfBuffer } = require("../utils/invoicePdf");
const { sendInvoiceEmail } = require("../utils/email");
const {
  REQUEST_TYPE_OPTIONS,
  REQUEST_PRIORITY_OPTIONS,
  REQUEST_STATUS_OPTIONS,
  normalizeRequestText,
  normalizeRequestType,
  normalizeRequestPriority,
  normalizeRequestStatus,
  applyResolvedTimestamp,
  serializeSupportRequest
} = require("../utils/supportRequest");
const { sendSuccess, sendError } = require("../utils/response");

const PLAN_PRICES = {
  starter: 49,
  standard: 99,
  pro: 199
};
const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];
const BOOKING_STATUS_OPTIONS = ["pending", "confirmed", "completed", "cancelled"];
const INQUIRY_STATUS_OPTIONS = ["new", "in_progress", "contacted", "converted", "closed"];
const REVIEW_STATUS_OPTIONS = ["pending", "published", "hidden"];
const ADMIN_EDITABLE_PAYMENT_STATUS_OPTIONS = ["pending", "paid", "overdue", "trial"];
const BOOKING_TIME_PATTERN = /^\d{2}:\d{2}$/;
const BOOKING_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLIENT_BASE_QUERY = {
  email: { $ne: OFFICIAL_ADMIN_EMAIL }
};
const REPORT_ACTIVITY_LIMIT = 5;
const REPORT_PACKAGE_KEYS = ["starter", "standard", "pro", "custom", "not_assigned"];

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function parseBooleanFilter(value) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function getSortDirection(value) {
  return value === "asc" ? 1 : -1;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchRegex(value) {
  const term = String(value || "").trim();
  return term ? new RegExp(escapeRegExp(term), "i") : null;
}

function normalizeAdminNote(value) {
  return String(value || "").trim().slice(0, 2000);
}

function toTimestamp(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function isDateWithinRange(value, start, end) {
  const timestamp = toTimestamp(value);
  return timestamp >= start.getTime() && timestamp < end.getTime();
}

function createPackageAccumulator() {
  return REPORT_PACKAGE_KEYS.reduce((accumulator, plan) => {
    accumulator[plan] = 0;
    return accumulator;
  }, {});
}

function resolveClientMonthlyValue(client) {
  const monthlyFee = normalizeMonthlyFee(client && client.monthlyFee);

  if (monthlyFee > 0) {
    return monthlyFee;
  }

  return roundMoney(PLAN_PRICES[normalizePlan(client && client.plan)] || 0);
}

function formatCsvDate(value) {
  const timestamp = toTimestamp(value);

  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatCsvDateTime(value) {
  const timestamp = toTimestamp(value);

  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toISOString();
}

function escapeCsvCell(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  const cellValue = Array.isArray(value)
    ? value.join("; ")
    : String(value);

  if (/[",\n]/.test(cellValue)) {
    return `"${cellValue.replace(/"/g, "\"\"")}"`;
  }

  return cellValue;
}

function buildCsv(columns, rows) {
  const header = columns.map(escapeCsvCell).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","));
  return [header, ...body].join("\n");
}

function sendCsvResponse(res, filename, columns, rows) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(`\uFEFF${buildCsv(columns, rows)}`);
}

function buildReportFilename(slug) {
  return `automatex-${slug}-report-${formatCsvDate(new Date())}.csv`;
}

async function logSensitiveExport(req, reportName, rowCount) {
  await logAdminAction(req, {
    module: "Reports",
    action: "reports.exported",
    targetType: "ReportExport",
    targetLabel: reportName,
    newValue: {
      reportName,
      rowCount
    },
    severity: "High"
  });
}

async function getCurrentAppSettings() {
  const settings = await AppSettings.findOne({}).sort({ updatedAt: -1, createdAt: -1 }).lean();
  return serializeAppSettings(settings || DEFAULT_APP_SETTINGS);
}

async function generateInvoiceNumber(prefix = DEFAULT_APP_SETTINGS.invoicePrefix) {
  const normalizedPrefix = normalizeInvoicePrefix(prefix);
  const prefixPattern = new RegExp(`^${escapeRegExp(normalizedPrefix)}-`);
  let sequence = await Invoice.countDocuments({
    invoiceNumber: prefixPattern
  });

  while (true) {
    sequence += 1;
    const invoiceNumber = `${normalizedPrefix}-${String(sequence).padStart(4, "0")}`;
    const exists = await Invoice.exists({ invoiceNumber });

    if (!exists) {
      return invoiceNumber;
    }
  }
}

async function findInvoiceClient(clientId) {
  if (!mongoose.Types.ObjectId.isValid(clientId)) {
    return null;
  }

  const client = await User.findOne({
    _id: clientId,
    ...CLIENT_BASE_QUERY
  });

  if (!client || resolveTrustedRole(client) !== "client") {
    return null;
  }

  return client;
}

function applyInvoiceClientSnapshot(invoice, client) {
  invoice.clientId = client._id;
  invoice.clientName = client.name || client.businessName || "Client";
  invoice.clientEmail = client.email || "";
  invoice.businessName = client.businessName || client.name || "Client";
}

async function resolveInvoiceOptionalLinks(body, clientId = "") {
  const errors = [];
  const links = {};
  const optionalLinks = [
    ["projectId", Project, { isArchived: false }, "project"],
    ["maintenancePlanId", MaintenancePlan, {}, "maintenance plan"],
    ["leadId", Lead, { isArchived: false }, "lead"],
    ["salesExecutiveId", SalesExecutive, { isArchived: false }, "employee"]
  ];

  for (const [field, Model, extraMatch, label] of optionalLinks) {
    const value = body && Object.prototype.hasOwnProperty.call(body, field) ? body[field] : undefined;
    if (typeof value === "undefined") {
      continue;
    }

    if (!value) {
      links[field] = null;
      continue;
    }

    if (!mongoose.Types.ObjectId.isValid(value)) {
      errors.push(`Invalid ${label} ID.`);
      continue;
    }

    const match = { _id: value, ...extraMatch };
    if (clientId && ["projectId", "maintenancePlanId"].includes(field)) {
      match.clientId = clientId;
    }

    const document = await Model.findOne(match).lean();
    if (!document) {
      errors.push(`Selected ${label} was not found.`);
      continue;
    }

    links[field] = document._id;
  }

  return { links, errors };
}

function buildInvoiceAnalytics(invoices) {
  return invoices.reduce((totals, invoice) => {
    totals.totalInvoices += 1;
    totals.totalValue = roundMoney(totals.totalValue + normalizeMoney(invoice.totalAmount));
    totals.totalPaid = roundMoney(totals.totalPaid + normalizeMoney(invoice.paidAmount));
    totals.totalBalance = roundMoney(totals.totalBalance + normalizeMoney(invoice.balance));

    if (invoice.status === "paid") {
      totals.paidInvoices += 1;
    } else if (invoice.status === "overdue") {
      totals.overdueInvoices += 1;
    } else if (invoice.status !== "cancelled") {
      totals.pendingInvoices += 1;
    }

    return totals;
  }, {
    totalInvoices: 0,
    paidInvoices: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    totalValue: 0,
    totalPaid: 0,
    totalBalance: 0
  });
}

function buildReportSummaryPayload({
  clients,
  invoices,
  requests,
  recentBookings,
  recentInquiries,
  recentReviews
}) {
  const { start, end } = getCurrentMonthRange();
  const packageCounts = createPackageAccumulator();
  const expectedMonthlyRevenueByPackage = createPackageAccumulator();
  let activeClients = 0;
  let pendingClients = 0;
  let suspendedClients = 0;
  let rejectedClients = 0;
  let newClientsThisMonth = 0;

  clients.forEach((client) => {
    const plan = normalizePlan(client.plan);
    const accountStatus = resolveAccountStatus(client);

    packageCounts[plan] += 1;

    if (accountStatus === "active") {
      activeClients += 1;
      expectedMonthlyRevenueByPackage[plan] = roundMoney(
        expectedMonthlyRevenueByPackage[plan] + resolveClientMonthlyValue(client)
      );
    } else if (accountStatus === "pending") {
      pendingClients += 1;
    } else if (accountStatus === "suspended") {
      suspendedClients += 1;
    } else if (accountStatus === "rejected") {
      rejectedClients += 1;
    }

    if (isDateWithinRange(client.createdAt, start, end)) {
      newClientsThisMonth += 1;
    }
  });

  const invoiceAnalytics = buildInvoiceAnalytics(invoices);
  const revenue = invoices.reduce((totals, invoice) => {
    if (invoice.status === "cancelled") {
      return totals;
    }

    if (invoice.status === "overdue") {
      totals.overdueAmount = roundMoney(totals.overdueAmount + normalizeMoney(invoice.balance));
    }

    if (["draft", "sent", "partial"].includes(invoice.status)) {
      totals.pendingAmount = roundMoney(totals.pendingAmount + normalizeMoney(invoice.balance));
    }

    if (invoice.status === "paid" && isDateWithinRange(invoice.paidDate, start, end)) {
      totals.paidThisMonth = roundMoney(totals.paidThisMonth + normalizeMoney(invoice.paidAmount));
    }

    return totals;
  }, {
    totalInvoiceValue: roundMoney(invoiceAnalytics.totalValue),
    totalPaid: roundMoney(invoiceAnalytics.totalPaid),
    totalBalance: roundMoney(invoiceAnalytics.totalBalance),
    overdueAmount: 0,
    paidThisMonth: 0,
    pendingAmount: 0,
    totalInvoices: invoiceAnalytics.totalInvoices,
    paidInvoices: invoiceAnalytics.paidInvoices,
    pendingInvoices: invoiceAnalytics.pendingInvoices,
    overdueInvoices: invoiceAnalytics.overdueInvoices
  });

  const requestsSummary = requests.reduce((totals, request) => {
    totals.totalRequests += 1;

    if (request.status === "open") {
      totals.openRequests += 1;
    } else if (request.status === "in_progress") {
      totals.inProgressRequests += 1;
    } else if (request.status === "resolved") {
      totals.resolvedRequests += 1;
    }

    if (request.type === "upgrade") {
      totals.upgradeRequests += 1;
    }

    if (request.type === "bug") {
      totals.bugReports += 1;
    }

    if (["high", "urgent"].includes(request.priority)) {
      totals.urgentHighPriorityRequests += 1;
    }

    return totals;
  }, {
    totalRequests: 0,
    openRequests: 0,
    inProgressRequests: 0,
    resolvedRequests: 0,
    upgradeRequests: 0,
    bugReports: 0,
    urgentHighPriorityRequests: 0
  });

  const recentClients = [...clients]
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
    .slice(0, REPORT_ACTIVITY_LIMIT)
    .map((client) => ({
      id: client.id,
      name: client.name,
      email: client.email,
      businessName: client.businessName,
      plan: client.plan,
      accountStatus: client.accountStatus,
      createdAt: client.createdAt
    }));

  const recentInvoicesSummary = [...invoices]
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
    .slice(0, REPORT_ACTIVITY_LIMIT)
    .map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      businessName: invoice.businessName,
      title: invoice.title,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      balance: invoice.balance,
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt
    }));

  const recentRequestsSummary = [...requests]
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
    .slice(0, REPORT_ACTIVITY_LIMIT)
    .map((request) => ({
      id: request.id,
      clientName: request.clientName,
      clientEmail: request.clientEmail,
      businessName: request.businessName,
      type: request.type,
      requestedPackage: request.requestedPackage,
      subject: request.subject,
      priority: request.priority,
      status: request.status,
      createdAt: request.createdAt
    }));

  return {
    generatedAt: new Date().toISOString(),
    revenue,
    clients: {
      totalClients: clients.length,
      activeClients,
      pendingClients,
      suspendedClients,
      rejectedClients,
      newClientsThisMonth
    },
    packages: {
      counts: packageCounts,
      expectedMonthlyRevenue: {
        ...expectedMonthlyRevenueByPackage,
        total: roundMoney(
          Object.values(expectedMonthlyRevenueByPackage).reduce((sum, value) => sum + value, 0)
        )
      }
    },
    requests: requestsSummary,
    activity: {
      recentClients,
      recentInvoices: recentInvoicesSummary,
      recentRequests: recentRequestsSummary,
      recentBookings,
      recentInquiries,
      recentReviews
    }
  };
}

function parseReportDateRange(query = {}) {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let label = start.toISOString().slice(0, 7);

  if (query.month && /^\d{4}-\d{2}$/.test(String(query.month))) {
    const [year, month] = String(query.month).split("-").map(Number);
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 1);
    label = String(query.month);
  } else if (query.year || query.monthNumber) {
    const year = Number(query.year);
    const month = Number(query.monthNumber || query.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return { error: "Report month and year filters are invalid." };
    }
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 1);
    label = `${year}-${String(month).padStart(2, "0")}`;
  }

  if (query.from || query.to) {
    const from = query.from ? new Date(query.from) : start;
    const to = query.to ? new Date(query.to) : new Date(end.getTime() - 1);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { error: "Report date range is invalid." };
    }

    if (from.getTime() > to.getTime()) {
      return { error: "Report start date must be before the end date." };
    }

    start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    label = `${start.toISOString().slice(0, 10)} to ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}`;
  }

  return {
    start,
    end,
    label,
    startDate: start.toISOString(),
    endDate: new Date(end.getTime() - 1).toISOString()
  };
}

function inReportRange(value, range) {
  const timestamp = toTimestamp(value);
  return timestamp >= range.start.getTime() && timestamp < range.end.getTime();
}

function countBy(items, field, options = {}) {
  return items.reduce((totals, item) => {
    const key = String(item[field] || options.fallback || "Unassigned");
    totals[key] = (totals[key] || 0) + 1;
    return totals;
  }, {});
}

function sumMoney(items, field) {
  return roundMoney(items.reduce((sum, item) => sum + normalizeMoney(item[field]), 0));
}

function monthKey(value) {
  const timestamp = toTimestamp(value);
  return timestamp ? new Date(timestamp).toISOString().slice(0, 7) : "Undated";
}

function buildMonthlyMoneySeries(invoices) {
  const byMonth = invoices.reduce((totals, invoice) => {
    const key = monthKey(invoice.issueDate || invoice.createdAt);
    if (!totals[key]) {
      totals[key] = { month: key, invoiced: 0, paid: 0, pending: 0 };
    }

    totals[key].invoiced = roundMoney(totals[key].invoiced + normalizeMoney(invoice.totalAmount));
    totals[key].paid = roundMoney(totals[key].paid + normalizeMoney(invoice.paidAmount));
    totals[key].pending = roundMoney(totals[key].pending + normalizeMoney(invoice.balance));
    return totals;
  }, {});

  return Object.values(byMonth).sort((left, right) => left.month.localeCompare(right.month));
}

function buildMoneyByField(items, field, amountField) {
  return items.reduce((totals, item) => {
    const key = String(item[field] || "Unassigned");
    totals[key] = roundMoney((totals[key] || 0) + normalizeMoney(item[amountField]));
    return totals;
  }, {});
}

function safeInvoiceRow(invoice) {
  return {
    id: String(invoice._id || invoice.id || ""),
    invoiceNumber: invoice.invoiceNumber || "",
    clientName: invoice.clientName || "",
    clientEmail: invoice.clientEmail || "",
    businessName: invoice.businessName || "",
    invoiceType: invoice.invoiceType || "Custom",
    status: invoice.status || "draft",
    paymentStatus: invoice.paymentStatus || "",
    totalAmount: normalizeMoney(invoice.totalAmount),
    paidAmount: normalizeMoney(invoice.paidAmount),
    balance: normalizeMoney(invoice.balance),
    currency: invoice.currency || DEFAULT_INVOICE_CURRENCY,
    issueDate: invoice.issueDate || null,
    dueDate: invoice.dueDate || null,
    paidDate: invoice.paidDate || null
  };
}

function safeProjectRow(project) {
  return {
    id: String(project._id || project.id || ""),
    projectTitle: project.projectTitle || "",
    projectType: project.projectType || "Other",
    status: project.status || "Planning",
    priority: project.priority || "Medium",
    progressPercentage: Number(project.progressPercentage || 0),
    totalAmount: normalizeMoney(project.totalAmount),
    paidAmount: normalizeMoney(project.paidAmount),
    balanceAmount: normalizeMoney(project.balanceAmount),
    expectedDeadline: project.expectedDeadline || null,
    completedDate: project.completedDate || null,
    createdAt: project.createdAt || null
  };
}

function safeMaintenanceRow(plan) {
  return {
    id: String(plan._id || plan.id || ""),
    planName: plan.planName || "",
    planType: plan.planType || "Monthly",
    status: plan.status || "Pending",
    paymentStatus: plan.paymentStatus || "Pending",
    amount: normalizeMoney(plan.amount),
    paidAmount: normalizeMoney(plan.paidAmount),
    balanceAmount: normalizeMoney(plan.balanceAmount),
    renewalDate: plan.renewalDate || null,
    endDate: plan.endDate || null
  };
}

function safeLeadRow(lead) {
  return {
    id: String(lead._id || lead.id || ""),
    businessName: lead.businessName || "",
    contactPerson: lead.contactPerson || "",
    phone: lead.phone || "",
    email: lead.email || "",
    interestedService: lead.interestedService || "Other",
    status: lead.status || "New",
    priority: lead.priority || "Medium",
    followUpDate: lead.followUpDate || null,
    createdAt: lead.createdAt || null,
    salesExecutiveId: lead.salesExecutiveId ? String(lead.salesExecutiveId) : ""
  };
}

function safeCommissionRow(commission, executiveMap = new Map()) {
  return {
    id: String(commission._id || commission.id || ""),
    salesExecutiveId: commission.salesExecutiveId ? String(commission.salesExecutiveId) : "",
    salesExecutiveName: executiveMap.get(String(commission.salesExecutiveId)) || "Employee",
    commissionType: commission.commissionType || "Manual Bonus",
    commissionMonth: commission.commissionMonth || null,
    commissionYear: commission.commissionYear || null,
    amount: normalizeMoney(commission.amount),
    status: commission.status || "Pending",
    paidDate: commission.paidDate || null,
    createdAt: commission.createdAt || null
  };
}

function safeSupportRow(request) {
  return {
    id: String(request._id || request.id || ""),
    clientName: request.clientName || "",
    clientEmail: request.clientEmail || "",
    businessName: request.businessName || "",
    type: request.type || "support",
    subject: request.subject || "",
    priority: request.priority || "normal",
    status: request.status || "open",
    createdAt: request.createdAt || null,
    resolvedAt: request.resolvedAt || null
  };
}

async function loadReportData() {
  const [
    clients,
    projects,
    invoices,
    maintenancePlans,
    leads,
    commissions,
    salesExecutives,
    requests
  ] = await Promise.all([
    User.find(CLIENT_BASE_QUERY).lean(),
    Project.find({ isArchived: false }).lean(),
    Invoice.find({}).lean(),
    MaintenancePlan.find({}).lean(),
    Lead.find({ isArchived: false }).lean(),
    Commission.find({}).lean(),
    SalesExecutive.find({}).lean(),
    SupportRequest.find({}).lean()
  ]);

  const executiveMap = new Map(salesExecutives.map((executive) => [String(executive._id), executive.fullName || "Employee"]));

  return {
    clients: clients.map(serializeAdminClient).filter((client) => client.role === "client"),
    projects,
    invoices,
    maintenancePlans,
    leads,
    commissions,
    executiveMap,
    requests
  };
}

function buildRevenueReport(data, range) {
  const periodInvoices = data.invoices
    .filter((invoice) => invoice.status !== "cancelled")
    .filter((invoice) => inReportRange(invoice.issueDate || invoice.createdAt, range));
  const paidThisPeriod = data.invoices
    .filter((invoice) => invoice.status !== "cancelled")
    .filter((invoice) => inReportRange(invoice.paidDate, range));
  const overdueInvoices = data.invoices
    .filter((invoice) => invoice.status !== "cancelled")
    .filter((invoice) => invoice.status === "overdue" || (invoice.dueDate && toTimestamp(invoice.dueDate) < Date.now() && normalizeMoney(invoice.balance) > 0));
  const pendingInvoices = periodInvoices.filter((invoice) => ["draft", "sent", "partial", "overdue"].includes(invoice.status));

  return {
    range: { label: range.label, startDate: range.startDate, endDate: range.endDate },
    totalInvoiced: sumMoney(periodInvoices, "totalAmount"),
    totalPaid: sumMoney(paidThisPeriod, "paidAmount"),
    totalPending: sumMoney(pendingInvoices, "balance"),
    overdueBalance: sumMoney(overdueInvoices, "balance"),
    revenueByMonth: buildMonthlyMoneySeries(periodInvoices),
    revenueByInvoiceType: buildMoneyByField(periodInvoices, "invoiceType", "totalAmount"),
    overdueInvoices: overdueInvoices.map(safeInvoiceRow).slice(0, 25),
    unpaidInvoices: pendingInvoices.map(safeInvoiceRow).slice(0, 25),
    paidInvoicesThisPeriod: paidThisPeriod.map(safeInvoiceRow).slice(0, 25),
    totals: {
      invoiceCount: periodInvoices.length,
      paidInvoiceCount: paidThisPeriod.length,
      overdueInvoiceCount: overdueInvoices.length,
      pendingInvoiceCount: pendingInvoices.length
    }
  };
}

function buildProjectReport(data, range) {
  const now = Date.now();
  const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
  const completedThisPeriod = data.projects.filter((project) => project.status === "Completed" && inReportRange(project.completedDate || project.updatedAt, range));
  const atRiskProjects = data.projects.filter((project) => {
    if (["Completed", "Cancelled"].includes(project.status)) {
      return false;
    }

    const deadline = toTimestamp(project.expectedDeadline);
    return (deadline && deadline <= sevenDaysFromNow) || ["High", "Urgent"].includes(project.priority);
  });

  return {
    totalProjects: data.projects.length,
    activeProjects: data.projects.filter((project) => !["Completed", "Cancelled", "On Hold"].includes(project.status)).length,
    completedProjects: data.projects.filter((project) => project.status === "Completed").length,
    completedThisPeriod: completedThisPeriod.length,
    projectsByStatus: countBy(data.projects, "status"),
    projectsByType: countBy(data.projects, "projectType"),
    deadlineRiskProjects: atRiskProjects.map(safeProjectRow).slice(0, 25),
    completedProjectsThisPeriod: completedThisPeriod.map(safeProjectRow).slice(0, 25)
  };
}

function buildInvoiceReport(data, range) {
  const invoices = data.invoices.filter((invoice) => invoice.status !== "cancelled");
  const paidThisPeriod = invoices.filter((invoice) => inReportRange(invoice.paidDate, range));
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue" || (invoice.dueDate && toTimestamp(invoice.dueDate) < Date.now() && normalizeMoney(invoice.balance) > 0));
  const unpaidInvoices = invoices.filter((invoice) => ["draft", "sent", "partial"].includes(invoice.status));

  return {
    invoicesByPaymentStatus: countBy(invoices, "paymentStatus", { fallback: "Unpaid" }),
    invoicesByStatus: countBy(invoices, "status"),
    overdueInvoices: overdueInvoices.map(safeInvoiceRow).slice(0, 25),
    unpaidInvoices: unpaidInvoices.map(safeInvoiceRow).slice(0, 25),
    paidThisPeriod: paidThisPeriod.map(safeInvoiceRow).slice(0, 25),
    totals: {
      totalInvoices: invoices.length,
      overdueInvoices: overdueInvoices.length,
      unpaidInvoices: unpaidInvoices.length,
      paidThisPeriod: paidThisPeriod.length
    }
  };
}

function buildSalesReport(data, range) {
  const leadsThisPeriod = data.leads.filter((lead) => inReportRange(lead.createdAt, range));
  const convertedLeads = leadsThisPeriod.filter((lead) => lead.status === "Converted");
  const commissionsThisPeriod = data.commissions.filter((commission) => {
    if (commission.commissionYear && commission.commissionMonth) {
      const commissionDate = new Date(commission.commissionYear, commission.commissionMonth - 1, 1);
      return inReportRange(commissionDate, range);
    }

    return inReportRange(commission.createdAt, range);
  });
  const pendingCommissions = data.commissions.filter((commission) => ["Pending", "Approved"].includes(commission.status));
  const paidCommissions = data.commissions.filter((commission) => commission.status === "Paid" && inReportRange(commission.paidDate, range));
  const leadsByExecutive = data.leads.reduce((totals, lead) => {
    const executiveId = String(lead.salesExecutiveId || "");
    const name = data.executiveMap.get(executiveId) || "Unassigned";
    totals[name] = (totals[name] || 0) + 1;
    return totals;
  }, {});

  return {
    leadsByStatus: countBy(data.leads, "status"),
    leadsThisPeriod: leadsThisPeriod.length,
    convertedLeads: convertedLeads.length,
    conversionRate: leadsThisPeriod.length ? Number(((convertedLeads.length / leadsThisPeriod.length) * 100).toFixed(1)) : 0,
    leadsBySalesExecutive: leadsByExecutive,
    pendingCommissionAmount: sumMoney(pendingCommissions, "amount"),
    paidCommissionAmount: sumMoney(paidCommissions, "amount"),
    commissionsThisPeriodAmount: sumMoney(commissionsThisPeriod, "amount"),
    pendingCommissions: pendingCommissions.map((commission) => safeCommissionRow(commission, data.executiveMap)).slice(0, 25),
    paidCommissionsThisPeriod: paidCommissions.map((commission) => safeCommissionRow(commission, data.executiveMap)).slice(0, 25),
    newLeadsAndFollowUps: data.leads
      .filter((lead) => ["New", "Follow Up", "Interested", "Proposal Sent"].includes(lead.status))
      .map(safeLeadRow)
      .sort((left, right) => toTimestamp(left.followUpDate || left.createdAt) - toTimestamp(right.followUpDate || right.createdAt))
      .slice(0, 25)
  };
}

function buildMaintenanceReport(data) {
  const now = Date.now();
  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
  const activePlans = data.maintenancePlans.filter((plan) => plan.status === "Active");
  const expiringSoon = data.maintenancePlans.filter((plan) => {
    const renewalTime = toTimestamp(plan.renewalDate || plan.endDate);
    return plan.status === "Expiring Soon" || (renewalTime && renewalTime >= now && renewalTime <= thirtyDaysFromNow);
  });
  const expiredPlans = data.maintenancePlans.filter((plan) => plan.status === "Expired");

  return {
    activePlans: activePlans.length,
    expiringSoonPlans: expiringSoon.length,
    expiredPlans: expiredPlans.length,
    renewalAmountExpected: sumMoney(expiringSoon, "balanceAmount"),
    paymentStatusSummary: countBy(data.maintenancePlans, "paymentStatus", { fallback: "Pending" }),
    statusSummary: countBy(data.maintenancePlans, "status", { fallback: "Pending" }),
    expiringMaintenancePlans: expiringSoon.map(safeMaintenanceRow).slice(0, 25),
    expiredMaintenancePlans: expiredPlans.map(safeMaintenanceRow).slice(0, 25)
  };
}

function buildSupportReport(data, range) {
  const openRequests = data.requests.filter((request) => ["open", "in_progress"].includes(request.status));
  const resolvedThisPeriod = data.requests.filter((request) => request.status === "resolved" && inReportRange(request.resolvedAt || request.updatedAt, range));

  return {
    openRequests: openRequests.length,
    resolvedRequests: resolvedThisPeriod.length,
    pendingRequestsByType: countBy(openRequests, "type", { fallback: "support" }),
    pendingRequestsByStatus: countBy(openRequests, "status", { fallback: "open" }),
    requestsByType: countBy(data.requests, "type", { fallback: "support" }),
    requestsByStatus: countBy(data.requests, "status", { fallback: "open" }),
    openSupportRequests: openRequests.map(safeSupportRow).slice(0, 25),
    resolvedThisPeriod: resolvedThisPeriod.map(safeSupportRow).slice(0, 25)
  };
}

function buildBusinessOverviewReport(data, range) {
  const revenue = buildRevenueReport(data, range);
  const projects = buildProjectReport(data, range);
  const invoices = buildInvoiceReport(data, range);
  const sales = buildSalesReport(data, range);
  const maintenance = buildMaintenanceReport(data, range);
  const support = buildSupportReport(data, range);
  const activeClients = data.clients.filter((client) => client.accountStatus === "active").length;

  return {
    generatedAt: new Date().toISOString(),
    range: revenue.range,
    kpis: {
      totalClients: data.clients.length,
      activeClients,
      totalProjects: projects.totalProjects,
      activeProjects: projects.activeProjects,
      completedProjects: projects.completedProjects,
      pendingInvoices: invoices.totals.unpaidInvoices,
      overdueInvoices: invoices.totals.overdueInvoices,
      monthlyRevenue: revenue.totalInvoiced,
      monthlyPaidAmount: revenue.totalPaid,
      monthlyPendingBalance: revenue.totalPending,
      pendingCommission: sales.pendingCommissionAmount,
      paidCommissionThisMonth: sales.paidCommissionAmount,
      activeMaintenancePlans: maintenance.activePlans,
      expiringSoonMaintenancePlans: maintenance.expiringSoonPlans,
      newLeadsThisMonth: sales.leadsThisPeriod,
      convertedLeadsThisMonth: sales.convertedLeads,
      openSupportRequests: support.openRequests
    },
    revenue,
    projects,
    invoices,
    sales,
    maintenance,
    support,
    tables: {
      overdueInvoices: revenue.overdueInvoices,
      projectsAtRisk: projects.deadlineRiskProjects,
      expiringMaintenancePlans: maintenance.expiringMaintenancePlans,
      pendingCommissions: sales.pendingCommissions,
      newLeadsAndFollowUps: sales.newLeadsAndFollowUps,
      openSupportRequests: support.openSupportRequests
    }
  };
}

async function getBusinessReportPayload(req, res) {
  const range = parseReportDateRange(req.query || {});
  if (range.error) {
    sendError(res, 400, range.error);
    return null;
  }

  const data = await loadReportData();
  return { data, range, overview: buildBusinessOverviewReport(data, range) };
}

function buildInvoiceMutationPayload(body, currentInvoice = null, options = {}) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
  const title = normalizeInvoiceText(
    hasOwn("title") ? body.title : currentInvoice && currentInvoice.title,
    200
  );
  const description = normalizeInvoiceText(
    hasOwn("description") ? body.description : currentInvoice && currentInvoice.description,
    4000
  );
  const notes = normalizeInvoiceText(
    hasOwn("notes") ? body.notes : currentInvoice && currentInvoice.notes,
    5000
  );
  const adminNotes = normalizeInvoiceText(
    hasOwn("adminNotes") ? body.adminNotes : currentInvoice && currentInvoice.adminNotes,
    5000
  );
  const clientNotes = normalizeInvoiceText(
    hasOwn("clientNotes") ? body.clientNotes : currentInvoice && (currentInvoice.clientNotes || currentInvoice.notes),
    5000
  );
  const paymentNotes = normalizeInvoiceText(
    hasOwn("paymentNotes") ? body.paymentNotes : currentInvoice && currentInvoice.paymentNotes,
    5000
  );
  const defaultPaymentTerms = options.defaultPaymentTerms;
  const dueDate = normalizeInvoiceDate(
    hasOwn("dueDate") ? body.dueDate : currentInvoice && currentInvoice.dueDate
  ) || (!currentInvoice && !hasOwn("dueDate")
    ? buildDueDateFromTerms(
      normalizeInvoiceDate(hasOwn("issueDate") ? body.issueDate : null) || new Date(),
      defaultPaymentTerms
    )
    : null);
  const issueDate = normalizeInvoiceDate(
    hasOwn("issueDate") ? body.issueDate : currentInvoice && currentInvoice.issueDate
  ) || (currentInvoice && currentInvoice.issueDate) || new Date();
  const totals = calculateInvoiceTotals({
    items: hasOwn("items") ? body.items : currentInvoice && currentInvoice.items,
    discount: hasOwn("discount") ? body.discount : currentInvoice && currentInvoice.discount,
    tax: hasOwn("tax")
      ? body.tax
      : currentInvoice
        ? currentInvoice.tax
        : undefined,
    taxRate: !currentInvoice && !hasOwn("tax") ? options.defaultTaxRate : undefined,
    paidAmount: hasOwn("paidAmount") ? body.paidAmount : currentInvoice && currentInvoice.paidAmount
  });

  if (!title) {
    return { error: "Invoice title is required." };
  }

  if (!totals.items.length) {
    return { error: "Add at least one invoice item before saving." };
  }

  if (totals.paidAmount > totals.totalAmount) {
    return { error: "Paid amount cannot exceed the invoice total." };
  }

  const requestedStatus = hasOwn("paymentStatus") && paymentStatusToStatus(body.paymentStatus)
    ? paymentStatusToStatus(body.paymentStatus)
    : hasOwn("status")
      ? body.status
      : currentInvoice && currentInvoice.status;
  const status = resolveInvoiceStatus({
    requestedStatus,
    currentStatus: currentInvoice && currentInvoice.status,
    dueDate,
    totalAmount: totals.totalAmount,
    paidAmount: totals.paidAmount,
    balance: totals.balance
  });
  let paidDate = null;

  if (status === "paid") {
    paidDate = normalizeInvoiceDate(
      hasOwn("paidDate") ? body.paidDate : currentInvoice && currentInvoice.paidDate
    ) || (currentInvoice && currentInvoice.paidDate) || new Date();
  } else if (status === "cancelled" && currentInvoice && currentInvoice.paidDate) {
    paidDate = currentInvoice.paidDate;
  }

  return {
    title,
    description,
    items: totals.items,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    totalAmount: totals.totalAmount,
    paidAmount: totals.paidAmount,
    balance: totals.balance,
    balanceAmount: totals.balance,
    issueDate,
    dueDate,
    paidDate,
    notes,
    clientNotes,
    adminNotes,
    paymentNotes,
    paymentMethod: normalizeInvoicePaymentMethod(hasOwn("paymentMethod") ? body.paymentMethod : currentInvoice && currentInvoice.paymentMethod),
    invoiceType: normalizeInvoiceType(hasOwn("invoiceType") ? body.invoiceType : currentInvoice && currentInvoice.invoiceType),
    paymentStatus: statusToPaymentStatus(status),
    status
  };
}

function estimateMonthlyRevenue(clients) {
  return clients.reduce((total, client) => {
    const monthlyFee = normalizeMonthlyFee(client.monthlyFee);

    if (monthlyFee > 0) {
      return total + monthlyFee;
    }

    return total + (PLAN_PRICES[normalizePlan(client.plan)] || 0);
  }, 0);
}

function serializeAdminClient(client) {
  const plan = normalizePlan(client.plan);
  const accountStatus = resolveAccountStatus(client);
  const paymentStatus = normalizePaymentStatus(client.paymentStatus);
  const allowedFeatures = resolveAllowedFeatures(client);
  const monthlyFee = normalizeMonthlyFee(client.monthlyFee);
  const onboardingStatus = client.onboardingStatus || resolveOnboardingStatus({
    ...client,
    plan,
    accountStatus,
    paymentStatus,
    allowedFeatures
  });

  return {
    id: String(client._id || client.id),
    name: client.name,
    email: client.email,
    role: resolveTrustedRole(client),
    plan,
    packageName: plan,
    monthlyFee,
    accountStatus,
    paymentStatus,
    nextPaymentDate: client.nextPaymentDate || null,
    allowedFeatures,
    onboardingStatus,
    isActive: client.isActive,
    stripeCustomerId: client.stripeCustomerId || "",
    stripeSubscriptionId: client.stripeSubscriptionId || "",
    businessName: client.businessName || "",
    businessType: client.businessType || "",
    phone: client.phone || "",
    location: client.location || "",
    services: Array.isArray(client.services) ? client.services : [],
    workingHours: client.workingHours || "",
    bookingUrl: client.bookingUrl || "",
    chatbotLanguage: client.chatbotLanguage || "",
    planExpiresAt: client.planExpiresAt || null,
    createdAt: client.createdAt,
    bookingCount: typeof client.bookingCount === "number" ? client.bookingCount : undefined,
    inquiryCount: typeof client.inquiryCount === "number" ? client.inquiryCount : undefined,
    featureAccess: buildFeatureAccess({
      ...client,
      accountStatus,
      allowedFeatures
    })
  };
}

function serializeAdminUser(user) {
  return {
    id: String(user._id || user.id),
    name: user.name || "",
    email: user.email || "",
    role: resolveTrustedRole(user),
    status: user.status || (user.isActive ? "active" : "inactive"),
    accountStatus: resolveAccountStatus(user),
    paymentStatus: normalizePaymentStatus(user.paymentStatus),
    isActive: Boolean(user.isActive),
    businessName: user.businessName || "",
    createdAt: user.createdAt || null
  };
}

function serializeAuditLog(log) {
  return {
    id: String(log._id || log.id),
    actorId: log.actorId ? String(log.actorId) : "",
    actorName: log.actorName || "",
    actorEmail: log.actorEmail || "",
    actorRole: log.actorRole || "",
    action: log.action || "",
    module: log.module || "Other",
    targetType: log.targetType || "",
    targetId: log.targetId || "",
    targetLabel: log.targetLabel || "",
    oldValue: log.oldValue || null,
    newValue: log.newValue || null,
    ipAddress: log.ipAddress || "",
    userAgent: log.userAgent || "",
    severity: log.severity || "Low",
    createdAt: log.createdAt || null
  };
}

function normalizeUserStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["active", "inactive", "suspended"].includes(normalized) ? normalized : "";
}

function buildAuditQuery(query = {}) {
  const match = {};

  if (query.module && AUDIT_MODULES.includes(query.module)) {
    match.module = query.module;
  }

  if (query.severity && AUDIT_SEVERITIES.includes(query.severity)) {
    match.severity = query.severity;
  }

  if (query.action) {
    match.action = buildSearchRegex(query.action);
  }

  if (query.actor) {
    const actorPattern = buildSearchRegex(query.actor);
    if (actorPattern) {
      match.$or = [
        { actorName: actorPattern },
        { actorEmail: actorPattern }
      ];
    }
  }

  if (query.targetType) {
    match.targetType = buildSearchRegex(query.targetType);
  }

  const createdAt = {};
  if (query.from) {
    const from = new Date(query.from);
    if (!Number.isNaN(from.getTime())) {
      createdAt.$gte = from;
    }
  }

  if (query.to) {
    const to = new Date(query.to);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      createdAt.$lte = to;
    }
  }

  if (Object.keys(createdAt).length) {
    match.createdAt = createdAt;
  }

  const searchPattern = buildSearchRegex(query.search);
  if (searchPattern) {
    const searchOr = [
      { actorName: searchPattern },
      { actorEmail: searchPattern },
      { targetLabel: searchPattern },
      { action: searchPattern }
    ];
    match.$and = match.$and || [];
    match.$and.push({ $or: searchOr });
  }

  return match;
}

async function countActiveAdmins(excludeUserId = "") {
  const users = await User.find({
    isActive: true,
    status: { $ne: "suspended" }
  }, { email: 1, role: 1 }).lean();

  return users.filter((user) => {
    if (excludeUserId && String(user._id) === String(excludeUserId)) {
      return false;
    }

    return resolveTrustedRole(user) === "admin";
  }).length;
}

async function ensureAdminCanLoseAccess(user, currentAdminId) {
  if (isOfficialAdminEmail(user.email)) {
    return "The official AutomateX admin account must remain active.";
  }

  if (String(user._id) === String(currentAdminId) && resolveTrustedRole(user) === "admin") {
    return "You cannot remove your own admin access.";
  }

  if (resolveTrustedRole(user) === "admin" && await countActiveAdmins(user._id) < 1) {
    return "At least one active admin account is required.";
  }

  return "";
}

function enrichWithClientMap(items, clientMap) {
  return items.map((item) => {
    const client = clientMap.get(String(item.clientId));

    return {
      ...item,
      clientName: client?.name || "",
      clientEmail: client?.email || "",
      clientBusinessName: client?.businessName || ""
    };
  });
}

async function buildClientMap(clientIds) {
  const clients = await User.find(
    { _id: { $in: clientIds } },
    { name: 1, email: 1, businessName: 1 }
  ).lean();

  return new Map(clients.map((client) => [String(client._id), client]));
}

function validateBookingDateTime(date, time) {
  const errors = [];

  if (!BOOKING_DATE_PATTERN.test(String(date || ""))) {
    errors.push("Booking date must use YYYY-MM-DD format.");
  }

  if (!BOOKING_TIME_PATTERN.test(String(time || ""))) {
    errors.push("Booking time must use HH:MM format.");
  }

  return errors;
}

async function getStats(_req, res) {
  try {
    const { start, end } = getCurrentMonthRange();
    const activeAccountQuery = {
      ...CLIENT_BASE_QUERY,
      isActive: true,
      $or: [
        { accountStatus: "active" },
        {
          accountStatus: { $exists: false },
          plan: { $in: ["starter", "standard", "pro", "custom"] }
        }
      ]
    };

    const [
      totalClients,
      activeClientsCount,
      pendingClients,
      suspendedClients,
      bookingsThisMonth,
      totalBookings,
      inquiriesThisMonth,
      totalInquiries,
      pendingReviews,
      totalReviews,
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      suspendedEmployees,
      clientRecords
    ] = await Promise.all([
      User.countDocuments(CLIENT_BASE_QUERY),
      User.countDocuments(activeAccountQuery),
      User.countDocuments({ ...CLIENT_BASE_QUERY, accountStatus: "pending", isActive: true }),
      User.countDocuments({ ...CLIENT_BASE_QUERY, accountStatus: "suspended" }),
      Booking.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Booking.countDocuments({}),
      Inquiry.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Inquiry.countDocuments({}),
      Review.countDocuments({ status: "pending" }),
      Review.countDocuments({}),
      SalesExecutive.countDocuments({ isArchived: false }),
      SalesExecutive.countDocuments({ status: "Active", isArchived: false }),
      SalesExecutive.countDocuments({ status: "Inactive", isArchived: false }),
      SalesExecutive.countDocuments({ status: "Suspended", isArchived: false }),
      User.find(
        CLIENT_BASE_QUERY,
        { plan: 1, monthlyFee: 1, accountStatus: 1, paymentStatus: 1, nextPaymentDate: 1, isActive: 1 }
      ).lean()
    ]);

    const activePackages = {
      starter: 0,
      standard: 0,
      pro: 0,
      custom: 0
    };
    let unpaidMonthlyFees = 0;
    let overdueClients = 0;
    let paidClients = 0;
    let unpaidClients = 0;

    clientRecords.forEach((client) => {
      const plan = normalizePlan(client.plan);
      const accountStatus = resolveAccountStatus(client);
      const paymentStatus = normalizePaymentStatus(client.paymentStatus);
      const monthlyFee = normalizeMonthlyFee(client.monthlyFee);

      if (accountStatus === "active" && plan in activePackages) {
        activePackages[plan] += 1;
      }

      if (paymentStatus === "paid") {
        paidClients += 1;
      } else {
        unpaidClients += 1;
      }

      if (paymentStatus === "overdue") {
        overdueClients += 1;
      }

      if (monthlyFee > 0 && paymentStatus !== "paid") {
        unpaidMonthlyFees += monthlyFee;
      }
    });

    return sendSuccess(res, 200, {
      totalClients,
      activeClients: activeClientsCount,
      pendingClients,
      suspendedClients,
      totalBookingsThisMonth: bookingsThisMonth,
      totalBookings,
      totalInquiriesThisMonth: inquiriesThisMonth,
      totalInquiries,
      totalReviewsPendingModeration: pendingReviews,
      totalReviews,
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      suspendedEmployees,
      monthlyRevenueEstimate: estimateMonthlyRevenue(clientRecords.filter((client) => resolveAccountStatus(client) === "active")),
      unpaidMonthlyFees,
      overdueClients,
      paidClients,
      unpaidClients,
      activePackages,
      newLeadsThisMonth: inquiriesThisMonth,
      systemHealth: {
        api: "online",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        status: mongoose.connection.readyState === 1 ? "operational" : "degraded"
      }
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load admin stats right now.");
  }
}

async function getAuditLogs(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const match = buildAuditQuery(req.query);
    const [logs, total] = await Promise.all([
      AuditLog.find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(match)
    ]);

    return sendSuccess(res, 200, {
      logs: logs.map(serializeAuditLog),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      options: {
        modules: AUDIT_MODULES,
        severities: AUDIT_SEVERITIES
      }
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load audit logs right now.");
  }
}

async function getAuditLogById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid audit log ID.");
    }

    const log = await AuditLog.findById(req.params.id).lean();
    if (!log) {
      return sendError(res, 404, "Audit log not found.");
    }

    return sendSuccess(res, 200, {
      log: serializeAuditLog(log)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load audit log details right now.");
  }
}

async function getAdminUsers(req, res) {
  try {
    const match = {};
    const searchPattern = buildSearchRegex(req.query.search);
    if (searchPattern) {
      match.$or = [
        { name: searchPattern },
        { email: searchPattern },
        { businessName: searchPattern }
      ];
    }

    if (req.query.role) {
      const role = normalizeRole(req.query.role);
      if (!role) {
        return sendError(res, 400, "Invalid role filter.");
      }
      match.role = role;
    }

    if (req.query.status) {
      const status = normalizeUserStatus(req.query.status);
      if (!status) {
        return sendError(res, 400, "Invalid status filter.");
      }
      match.status = status;
    }

    const users = await User.find(match).sort({ createdAt: -1 }).lean();
    return sendSuccess(res, 200, {
      users: users.map(serializeAdminUser)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load users right now.");
  }
}

async function getAdminUserById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid user ID.");
    }

    const user = await User.findById(req.params.id).lean();
    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    return sendSuccess(res, 200, {
      user: serializeAdminUser(user)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load user details right now.");
  }
}

async function updateAdminUserRole(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid user ID.");
    }

    const role = normalizeRole(req.body.role);
    if (!role) {
      return sendError(res, 400, "Role must be Admin, Manager, Staff, or Client.");
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    if (role !== "admin") {
      const accessError = await ensureAdminCanLoseAccess(user, req.user.id);
      if (accessError) {
        return sendError(res, 400, accessError);
      }
    }

    const oldValue = { role: resolveTrustedRole(user) };
    user.role = isOfficialAdminEmail(user.email) ? "admin" : role;
    await user.save();

    await logAdminAction(req, {
      module: "Users",
      action: "users.role_updated",
      targetType: "User",
      targetId: String(user._id),
      targetLabel: user.email,
      oldValue,
      newValue: { role: resolveTrustedRole(user) },
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "User role updated successfully.",
      user: serializeAdminUser(user.toObject())
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update user role right now.");
  }
}

async function updateAdminUserStatus(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid user ID.");
    }

    const status = normalizeUserStatus(req.body.status);
    if (!status) {
      return sendError(res, 400, "Status must be active, inactive, or suspended.");
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    if (status !== "active") {
      const accessError = await ensureAdminCanLoseAccess(user, req.user.id);
      if (accessError) {
        return sendError(res, 400, accessError);
      }
    }

    const oldValue = { status: user.status || "active", isActive: user.isActive };
    user.status = isOfficialAdminEmail(user.email) ? "active" : status;
    user.isActive = user.status === "active";
    await user.save();

    await logAdminAction(req, {
      module: "Users",
      action: "users.status_updated",
      targetType: "User",
      targetId: String(user._id),
      targetLabel: user.email,
      oldValue,
      newValue: { status: user.status, isActive: user.isActive },
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "User status updated successfully.",
      user: serializeAdminUser(user.toObject())
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update user status right now.");
  }
}

async function activateAdminUser(req, res) {
  req.body = { status: "active" };
  return updateAdminUserStatus(req, res);
}

async function deactivateAdminUser(req, res) {
  req.body = { status: "inactive" };
  return updateAdminUserStatus(req, res);
}

async function getAdminSettings(_req, res) {
  try {
    const settings = await getCurrentAppSettings();
    return sendSuccess(res, 200, {
      settings
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load admin settings right now.");
  }
}

async function updateAdminSettings(req, res) {
  try {
    const updates = buildAppSettingsUpdatePayload(req.body || {});
    let settings = await AppSettings.findOne({}).sort({ updatedAt: -1, createdAt: -1 });
    const oldValue = settings ? serializeAppSettings(settings) : DEFAULT_APP_SETTINGS;

    if (!settings) {
      settings = new AppSettings(updates);
    } else {
      Object.assign(settings, updates);
    }

    await settings.save();
    await logAdminAction(req, {
      module: "Settings",
      action: "settings.updated",
      targetType: "AppSettings",
      targetId: String(settings._id),
      targetLabel: "AutomateX settings",
      oldValue,
      newValue: serializeAppSettings(settings),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Settings updated successfully.",
      settings: serializeAppSettings(settings)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update admin settings right now.");
  }
}

async function getReportsOverview(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    return sendSuccess(res, 200, payload.overview);
  } catch {
    return sendError(res, 500, "Unable to load the reports overview right now.");
  }
}

async function getReportsRevenue(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    return sendSuccess(res, 200, {
      generatedAt: payload.overview.generatedAt,
      range: payload.overview.range,
      revenue: payload.overview.revenue
    });
  } catch {
    return sendError(res, 500, "Unable to load the revenue report right now.");
  }
}

async function getReportsProjects(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    return sendSuccess(res, 200, {
      generatedAt: payload.overview.generatedAt,
      range: payload.overview.range,
      projects: payload.overview.projects
    });
  } catch {
    return sendError(res, 500, "Unable to load the project report right now.");
  }
}

async function getReportsInvoices(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    return sendSuccess(res, 200, {
      generatedAt: payload.overview.generatedAt,
      range: payload.overview.range,
      invoices: payload.overview.invoices
    });
  } catch {
    return sendError(res, 500, "Unable to load the invoice report right now.");
  }
}

async function getReportsSales(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    return sendSuccess(res, 200, {
      generatedAt: payload.overview.generatedAt,
      range: payload.overview.range,
      sales: payload.overview.sales
    });
  } catch {
    return sendError(res, 500, "Unable to load the sales report right now.");
  }
}

async function getReportsMaintenance(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    return sendSuccess(res, 200, {
      generatedAt: payload.overview.generatedAt,
      range: payload.overview.range,
      maintenance: payload.overview.maintenance
    });
  } catch {
    return sendError(res, 500, "Unable to load the maintenance report right now.");
  }
}

async function getReportsSupport(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    return sendSuccess(res, 200, {
      generatedAt: payload.overview.generatedAt,
      range: payload.overview.range,
      support: payload.overview.support
    });
  } catch {
    return sendError(res, 500, "Unable to load the support report right now.");
  }
}

async function getReportsSummary(_req, res) {
  try {
    const [
      clientRecords,
      invoiceRecords,
      requestRecords,
      bookingRecords,
      inquiryRecords,
      reviewRecords
    ] = await Promise.all([
      User.find(CLIENT_BASE_QUERY).lean(),
      Invoice.find({}).lean(),
      SupportRequest.find({}).lean(),
      Booking.find({}).sort({ createdAt: -1 }).limit(REPORT_ACTIVITY_LIMIT).lean(),
      Inquiry.find({}).sort({ createdAt: -1 }).limit(REPORT_ACTIVITY_LIMIT).lean(),
      Review.find({}).sort({ createdAt: -1 }).limit(REPORT_ACTIVITY_LIMIT).lean()
    ]);

    const clients = clientRecords
      .map(serializeAdminClient)
      .filter((client) => client.role === "client");
    const invoices = invoiceRecords.map(serializeInvoice);
    const requests = requestRecords.map((request) => serializeSupportRequest(request, { includeAdminFields: true }));
    const activityClientIds = [...new Set(
      [...bookingRecords, ...inquiryRecords, ...reviewRecords]
        .map((record) => String(record.clientId || ""))
        .filter(Boolean)
    )];
    const clientMap = await buildClientMap(activityClientIds);
    const recentBookings = enrichWithClientMap(bookingRecords, clientMap).map((booking) => ({
      id: String(booking._id || booking.id || ""),
      name: booking.name || "",
      service: booking.service || "",
      status: booking.status || "pending",
      date: booking.date || "",
      time: booking.time || "",
      clientName: booking.clientName || "",
      clientBusinessName: booking.clientBusinessName || "",
      createdAt: booking.createdAt || null
    }));
    const recentInquiries = enrichWithClientMap(inquiryRecords, clientMap).map((inquiry) => ({
      id: String(inquiry._id || inquiry.id || ""),
      name: inquiry.name || "",
      email: inquiry.email || "",
      message: inquiry.message || "",
      status: inquiry.status || "new",
      clientName: inquiry.clientName || "",
      clientBusinessName: inquiry.clientBusinessName || "",
      createdAt: inquiry.createdAt || null
    }));
    const recentReviews = enrichWithClientMap(reviewRecords, clientMap).map((review) => ({
      id: String(review._id || review.id || ""),
      name: review.name || "",
      rating: review.rating || 0,
      text: review.text || "",
      status: review.status || "pending",
      clientName: review.clientName || "",
      clientBusinessName: review.clientBusinessName || "",
      createdAt: review.createdAt || null
    }));

    return sendSuccess(res, 200, buildReportSummaryPayload({
      clients,
      invoices,
      requests,
      recentBookings,
      recentInquiries,
      recentReviews
    }));
  } catch (_error) {
    return sendError(res, 500, "Unable to load admin reports right now.");
  }
}

async function exportClientsReport(req, res) {
  try {
    const clients = (await User.find(CLIENT_BASE_QUERY).sort({ createdAt: -1 }).lean())
      .map(serializeAdminClient)
      .filter((client) => client.role === "client");

    const rows = clients.map((client) => ({
      businessName: client.businessName || "",
      ownerName: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      businessType: client.businessType || "",
      location: client.location || "",
      package: normalizePlan(client.plan),
      monthlyFee: normalizeMonthlyFee(client.monthlyFee),
      paymentStatus: client.paymentStatus || "",
      accountStatus: client.accountStatus || "",
      nextPaymentDate: formatCsvDate(client.nextPaymentDate),
      allowedFeatures: Array.isArray(client.allowedFeatures) ? client.allowedFeatures.join("; ") : "",
      createdAt: formatCsvDateTime(client.createdAt)
    }));

    await logSensitiveExport(req, "clients", rows.length);
    return sendCsvResponse(res, buildReportFilename("clients"), [
      "businessName",
      "ownerName",
      "email",
      "phone",
      "businessType",
      "location",
      "package",
      "monthlyFee",
      "paymentStatus",
      "accountStatus",
      "nextPaymentDate",
      "allowedFeatures",
      "createdAt"
    ], rows);
  } catch (_error) {
    return sendError(res, 500, "Unable to download the client report right now.");
  }
}

async function exportInvoicesReport(req, res) {
  try {
    const invoices = (await Invoice.find({}).sort({ createdAt: -1 }).lean()).map(serializeInvoice);
    const rows = invoices.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber || "",
      businessName: invoice.businessName || "",
      clientName: invoice.clientName || "",
      clientEmail: invoice.clientEmail || "",
      title: invoice.title || "",
      status: invoice.status || "",
      currency: invoice.currency || DEFAULT_INVOICE_CURRENCY,
      totalAmount: normalizeMoney(invoice.totalAmount),
      paidAmount: normalizeMoney(invoice.paidAmount),
      balance: normalizeMoney(invoice.balance),
      issueDate: formatCsvDate(invoice.issueDate),
      dueDate: formatCsvDate(invoice.dueDate),
      paidDate: formatCsvDate(invoice.paidDate),
      notes: invoice.notes || "",
      adminNotes: invoice.adminNotes || "",
      createdAt: formatCsvDateTime(invoice.createdAt)
    }));

    await logSensitiveExport(req, "invoices", rows.length);
    return sendCsvResponse(res, buildReportFilename("invoices"), [
      "invoiceNumber",
      "businessName",
      "clientName",
      "clientEmail",
      "title",
      "status",
      "currency",
      "totalAmount",
      "paidAmount",
      "balance",
      "issueDate",
      "dueDate",
      "paidDate",
      "notes",
      "adminNotes",
      "createdAt"
    ], rows);
  } catch (_error) {
    return sendError(res, 500, "Unable to download the invoice report right now.");
  }
}

async function exportRequestsReport(req, res) {
  try {
    const requests = (await SupportRequest.find({}).sort({ createdAt: -1 }).lean())
      .map((request) => serializeSupportRequest(request, { includeAdminFields: true }));
    const rows = requests.map((request) => ({
      businessName: request.businessName || "",
      clientName: request.clientName || "",
      clientEmail: request.clientEmail || "",
      type: request.type || "",
      requestedPackage: request.requestedPackage || "",
      subject: request.subject || "",
      message: request.message || "",
      priority: request.priority || "",
      status: request.status || "",
      adminNote: request.adminNote || "",
      createdAt: formatCsvDateTime(request.createdAt),
      updatedAt: formatCsvDateTime(request.updatedAt),
      resolvedAt: formatCsvDateTime(request.resolvedAt)
    }));

    await logSensitiveExport(req, "requests", rows.length);
    return sendCsvResponse(res, buildReportFilename("requests"), [
      "businessName",
      "clientName",
      "clientEmail",
      "type",
      "requestedPackage",
      "subject",
      "message",
      "priority",
      "status",
      "adminNote",
      "createdAt",
      "updatedAt",
      "resolvedAt"
    ], rows);
  } catch (_error) {
    return sendError(res, 500, "Unable to download the support request report right now.");
  }
}

async function exportRevenueReport(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    const rows = [
      ...payload.overview.revenue.revenueByMonth.map((row) => ({
        section: "monthly",
        label: row.month,
        invoiced: row.invoiced,
        paid: row.paid,
        pending: row.pending
      })),
      ...Object.entries(payload.overview.revenue.revenueByInvoiceType || {}).map(([type, amount]) => ({
        section: "invoice_type",
        label: type,
        invoiced: amount,
        paid: "",
        pending: ""
      }))
    ];

    await logSensitiveExport(req, "revenue", rows.length);
    return sendCsvResponse(res, buildReportFilename("revenue"), [
      "section",
      "label",
      "invoiced",
      "paid",
      "pending"
    ], rows);
  } catch {
    return sendError(res, 500, "Unable to download the income report right now.");
  }
}

async function exportProjectsReport(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    const rows = payload.overview.projects.deadlineRiskProjects.map((project) => ({
      projectTitle: project.projectTitle,
      projectType: project.projectType,
      status: project.status,
      priority: project.priority,
      progressPercentage: project.progressPercentage,
      expectedDeadline: formatCsvDate(project.expectedDeadline),
      totalAmount: project.totalAmount,
      paidAmount: project.paidAmount,
      balanceAmount: project.balanceAmount
    }));

    await logSensitiveExport(req, "projects-risk", rows.length);
    return sendCsvResponse(res, buildReportFilename("projects-risk"), [
      "projectTitle",
      "projectType",
      "status",
      "priority",
      "progressPercentage",
      "expectedDeadline",
      "totalAmount",
      "paidAmount",
      "balanceAmount"
    ], rows);
  } catch {
    return sendError(res, 500, "Unable to download the project report right now.");
  }
}

async function exportSalesReport(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    const rows = payload.overview.sales.pendingCommissions.map((commission) => ({
      salesExecutiveName: commission.salesExecutiveName,
      commissionType: commission.commissionType,
      commissionMonth: commission.commissionMonth,
      commissionYear: commission.commissionYear,
      amount: commission.amount,
      status: commission.status,
      paidDate: formatCsvDate(commission.paidDate),
      createdAt: formatCsvDateTime(commission.createdAt)
    }));

    await logSensitiveExport(req, "sales-commissions", rows.length);
    return sendCsvResponse(res, buildReportFilename("sales-commissions"), [
      "salesExecutiveName",
      "commissionType",
      "commissionMonth",
      "commissionYear",
      "amount",
      "status",
      "paidDate",
      "createdAt"
    ], rows);
  } catch {
    return sendError(res, 500, "Unable to download the employee leads report right now.");
  }
}

async function exportMaintenanceReport(req, res) {
  try {
    const payload = await getBusinessReportPayload(req, res);
    if (!payload) {
      return undefined;
    }

    const rows = payload.overview.maintenance.expiringMaintenancePlans.map((plan) => ({
      planName: plan.planName,
      planType: plan.planType,
      status: plan.status,
      paymentStatus: plan.paymentStatus,
      amount: plan.amount,
      paidAmount: plan.paidAmount,
      balanceAmount: plan.balanceAmount,
      renewalDate: formatCsvDate(plan.renewalDate),
      endDate: formatCsvDate(plan.endDate)
    }));

    await logSensitiveExport(req, "maintenance-renewals", rows.length);
    return sendCsvResponse(res, buildReportFilename("maintenance-renewals"), [
      "planName",
      "planType",
      "status",
      "paymentStatus",
      "amount",
      "paidAmount",
      "balanceAmount",
      "renewalDate",
      "endDate"
    ], rows);
  } catch {
    return sendError(res, 500, "Unable to download the maintenance report right now.");
  }
}

async function getClients(req, res) {
  try {
    const match = { ...CLIENT_BASE_QUERY };

    if (req.query.plan && PLAN_OPTIONS.includes(req.query.plan)) {
      match.plan = req.query.plan;
    }

    const isActive = parseBooleanFilter(req.query.isActive);
    if (typeof isActive === "boolean") {
      match.isActive = isActive;
    }

    const requestedAccountStatus = req.query.accountStatus && ACCOUNT_STATUS_OPTIONS.includes(req.query.accountStatus)
      ? req.query.accountStatus
      : "";
    const requestedPaymentStatus = req.query.paymentStatus && ADMIN_EDITABLE_PAYMENT_STATUS_OPTIONS.includes(req.query.paymentStatus)
      ? normalizePaymentStatus(req.query.paymentStatus)
      : "";

    const searchPattern = buildSearchRegex(req.query.search);
    if (searchPattern) {
      match.$or = [
        { name: searchPattern },
        { email: searchPattern },
        { businessName: searchPattern },
        { businessType: searchPattern },
        { phone: searchPattern }
      ];
    }

    const sortBy = String(req.query.sortBy || "createdAt");
    const sortDirection = getSortDirection(req.query.sortDirection);
    const sortMap = {
      createdAt: { createdAt: sortDirection },
      name: { name: sortDirection },
      monthlyFee: { monthlyFee: sortDirection }
    };

    const clients = await User.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "bookings",
          localField: "_id",
          foreignField: "clientId",
          as: "bookings"
        }
      },
      {
        $lookup: {
          from: "inquiries",
          localField: "_id",
          foreignField: "clientId",
          as: "inquiries"
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          businessName: 1,
          businessType: 1,
          phone: 1,
          location: 1,
          services: 1,
          workingHours: 1,
          bookingUrl: 1,
          chatbotLanguage: 1,
          plan: 1,
          monthlyFee: 1,
          accountStatus: 1,
          paymentStatus: 1,
          nextPaymentDate: 1,
          allowedFeatures: 1,
          onboardingStatus: 1,
          isActive: 1,
          createdAt: 1,
          bookingCount: { $size: "$bookings" },
          inquiryCount: { $size: "$inquiries" }
        }
      },
      { $sort: sortMap[sortBy] || sortMap.createdAt }
    ]);

    const serializedClients = clients
      .map(serializeAdminClient)
      .filter((client) => !requestedAccountStatus || client.accountStatus === requestedAccountStatus)
      .filter((client) => !requestedPaymentStatus || client.paymentStatus === requestedPaymentStatus);

    return sendSuccess(res, 200, {
      clients: serializedClients
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load clients right now.");
  }
}

async function getClientById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid client ID.");
    }

    const client = await User.findOne({
      _id: req.params.id,
      ...CLIENT_BASE_QUERY
    }).lean();

    if (!client || resolveTrustedRole(client) !== "client") {
      return sendError(res, 404, "Client not found.");
    }

    const [bookings, inquiries] = await Promise.all([
      Booking.find({ clientId: client._id }).sort({ createdAt: -1 }).limit(10).lean(),
      Inquiry.find({ clientId: client._id }).sort({ createdAt: -1 }).limit(10).lean()
    ]);

    return sendSuccess(res, 200, {
      client: serializeAdminClient(client),
      bookings,
      inquiries
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load the client profile right now.");
  }
}

async function updateClient(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid client ID.");
    }

    const updates = {};
    const requestedPlanInput = typeof req.body.plan === "string"
      ? String(req.body.plan || "").trim().toLowerCase()
      : null;
    const requestedPlan = requestedPlanInput !== null
      ? normalizePlan(requestedPlanInput)
      : null;
    const requestedAccountStatusInput = typeof req.body.accountStatus === "string"
      ? String(req.body.accountStatus || "").trim().toLowerCase()
      : null;
    const requestedAccountStatus = requestedAccountStatusInput !== null
      ? normalizeAccountStatus(requestedAccountStatusInput)
      : null;
    const paymentStatusInput = typeof req.body.paymentStatus === "string"
      ? String(req.body.paymentStatus || "").trim().toLowerCase()
      : null;

    if (requestedPlan !== null) {
      if (!PLAN_OPTIONS.includes(requestedPlanInput)) {
        return sendError(res, 400, "Plan must match a supported package.");
      }
      updates.plan = requestedPlan;
    }

    if (typeof req.body.isActive === "boolean") {
      updates.isActive = req.body.isActive;
    } else if (typeof req.body.isActive === "string") {
      updates.isActive = req.body.isActive === "true";
    }

    if (typeof req.body.monthlyFee !== "undefined") {
      updates.monthlyFee = normalizeMonthlyFee(req.body.monthlyFee);
    }

    if (requestedAccountStatus !== null) {
      if (!ACCOUNT_STATUS_OPTIONS.includes(requestedAccountStatusInput)) {
        return sendError(res, 400, "Account status must be pending, active, suspended, or rejected.");
      }
      updates.accountStatus = requestedAccountStatus;
    }

    if (paymentStatusInput !== null) {
      if (!ADMIN_EDITABLE_PAYMENT_STATUS_OPTIONS.includes(paymentStatusInput)) {
        return sendError(res, 400, "Payment status must be pending, paid, overdue, or trial.");
      }
      updates.paymentStatus = normalizePaymentStatus(paymentStatusInput);
    }

    if (typeof req.body.nextPaymentDate !== "undefined") {
      updates.nextPaymentDate = normalizeNextPaymentDate(req.body.nextPaymentDate);
    }
    const requestedAllowedFeatures = typeof req.body.allowedFeatures !== "undefined"
      ? normalizeAllowedFeatures(req.body.allowedFeatures)
      : null;

    [
      "businessName",
      "businessType",
      "phone",
      "location",
      "workingHours",
      "bookingUrl",
      "chatbotLanguage"
    ].forEach((field) => {
      if (typeof req.body[field] === "string") {
        updates[field] = req.body[field].trim();
      }
    });

    if (Array.isArray(req.body.services)) {
      updates.services = req.body.services
        .map((service) => String(service || "").trim())
        .filter(Boolean)
        .slice(0, 30);
    }

    const client = await User.findOne({ _id: req.params.id, ...CLIENT_BASE_QUERY });
    if (!client || resolveTrustedRole(client) !== "client") {
      return sendError(res, 404, "Client not found.");
    }
    const oldValue = serializeAdminClient(client.toObject());

    const finalPlan = normalizePlan(
      typeof updates.plan === "string" ? updates.plan : client.plan
    );
    const finalAccountStatus = requestedAccountStatus
      ? updates.accountStatus
      : resolveAccountStatus(client);

    if (finalAccountStatus === "active" && finalPlan === "not_assigned") {
      return sendError(res, 400, "Assign a package before activating this client.");
    }

    if (finalAccountStatus === "rejected") {
      updates.plan = "not_assigned";
      updates.monthlyFee = 0;
      updates.paymentStatus = "pending";
      updates.nextPaymentDate = null;
      updates.allowedFeatures = [];
      updates.isActive = false;
    } else if (finalPlan === "custom") {
      if (requestedAllowedFeatures !== null) {
        updates.allowedFeatures = requestedAllowedFeatures;
      }
    } else if (finalPlan === "not_assigned") {
      updates.allowedFeatures = [];
    } else {
      updates.allowedFeatures = getPlanDefaultFeatures(finalPlan);
    }

    Object.assign(client, updates);
    client.onboardingStatus = resolveOnboardingStatus(client);
    await client.save();
    await logAdminAction(req, {
      module: "Clients",
      action: "clients.updated",
      targetType: "User",
      targetId: String(client._id),
      targetLabel: client.businessName || client.name || client.email,
      oldValue,
      newValue: serializeAdminClient(client.toObject()),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Client saved successfully.",
      client: serializeAdminClient(client.toObject())
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the client right now.");
  }
}

async function softDeleteClient(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid client ID.");
    }

    const client = await User.findOneAndUpdate(
      { _id: req.params.id, ...CLIENT_BASE_QUERY },
      { isActive: true, accountStatus: "suspended", onboardingStatus: "approved" },
      { new: true }
    ).lean();

    if (!client || resolveTrustedRole(client) !== "client") {
      return sendError(res, 404, "Client not found.");
    }
    await logAdminAction(req, {
      module: "Clients",
      action: "clients.suspended",
      targetType: "User",
      targetId: String(client._id),
      targetLabel: client.businessName || client.name || client.email,
      newValue: serializeAdminClient(client),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Client suspended successfully.",
      client: serializeAdminClient(client)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to suspend the client right now.");
  }
}

async function getAdminBookings(req, res) {
  try {
    const query = {};

    if (req.query.clientId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.clientId)) {
        return sendError(res, 400, "Invalid client ID.");
      }
      query.clientId = req.query.clientId;
    }

    if (req.query.date) {
      if (/^\d{4}-\d{2}$/.test(req.query.date)) {
        query.date = { $regex: `^${req.query.date}` };
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
        query.date = req.query.date;
      } else {
        return sendError(res, 400, "Date filter must use YYYY-MM or YYYY-MM-DD format.");
      }
    }

    if (req.query.status) {
      if (!BOOKING_STATUS_OPTIONS.includes(req.query.status)) {
        return sendError(res, 400, "Invalid booking status filter.");
      }
      query.status = req.query.status;
    }

    const sortBy = String(req.query.sortBy || "createdAt");
    const sortDirection = getSortDirection(req.query.sortDirection);
    const sortMap = {
      createdAt: { createdAt: sortDirection },
      date: { date: sortDirection, time: sortDirection },
      status: { status: sortDirection }
    };
    const searchPattern = buildSearchRegex(req.query.search);

    const bookings = await Booking.find(query).sort(sortMap[sortBy] || sortMap.createdAt).lean();
    const clientMap = await buildClientMap([...new Set(bookings.map((booking) => String(booking.clientId)).filter(Boolean))]);

    const enrichedBookings = enrichWithClientMap(bookings, clientMap).filter((booking) => {
      if (!searchPattern) {
        return true;
      }

      return [
        booking.name,
        booking.email,
        booking.phone,
        booking.service,
        booking.clientName,
        booking.clientEmail,
        booking.clientBusinessName
      ].some((value) => searchPattern.test(String(value || "")));
    });

    return sendSuccess(res, 200, { bookings: enrichedBookings });
  } catch (_error) {
    return sendError(res, 500, "Unable to load bookings right now.");
  }
}

async function updateAdminBooking(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid booking ID.");
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return sendError(res, 404, "Booking not found.");
    }
    const oldValue = booking.toObject();

    if (typeof req.body.status === "string") {
      const status = String(req.body.status || "").trim();
      if (!BOOKING_STATUS_OPTIONS.includes(status)) {
        return sendError(res, 400, "Booking status is invalid.");
      }
      booking.status = status;
    }

    if (typeof req.body.adminNotes === "string") {
      booking.adminNotes = normalizeAdminNote(req.body.adminNotes);
    }

    ["name", "email", "phone", "service", "date", "time"].forEach((field) => {
      if (typeof req.body[field] === "string") {
        booking[field] = req.body[field].trim();
      }
    });

    const validationErrors = validateBookingDateTime(booking.date, booking.time);
    if (validationErrors.length) {
      return sendError(res, 400, validationErrors.join(" "));
    }

    const duplicateBooking = await Booking.findOne({
      _id: { $ne: booking._id },
      clientId: booking.clientId,
      date: booking.date,
      time: booking.time,
      status: { $in: ACTIVE_BOOKING_STATUSES }
    }).lean();

    if (duplicateBooking) {
      return sendError(res, 409, "Another booking already uses that client time slot.");
    }

    await booking.save();
    await logAdminAction(req, {
      module: "Bookings",
      action: "bookings.updated",
      targetType: "Booking",
      targetId: String(booking._id),
      targetLabel: booking.name || booking.service || "Booking",
      oldValue,
      newValue: booking.toObject(),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Booking updated successfully.",
      booking
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the booking right now.");
  }
}

async function getAdminInquiries(req, res) {
  try {
    const query = {};

    if (req.query.clientId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.clientId)) {
        return sendError(res, 400, "Invalid client ID.");
      }
      query.clientId = req.query.clientId;
    }

    if (req.query.status) {
      if (!INQUIRY_STATUS_OPTIONS.includes(req.query.status)) {
        return sendError(res, 400, "Invalid inquiry status filter.");
      }
      query.status = req.query.status;
    }

    const sortBy = String(req.query.sortBy || "createdAt");
    const sortDirection = getSortDirection(req.query.sortDirection);
    const sortMap = {
      createdAt: { createdAt: sortDirection },
      status: { status: sortDirection },
      name: { name: sortDirection }
    };
    const searchPattern = buildSearchRegex(req.query.search);

    const inquiries = await Inquiry.find(query).sort(sortMap[sortBy] || sortMap.createdAt).lean();
    const clientMap = await buildClientMap([...new Set(inquiries.map((inquiry) => String(inquiry.clientId)).filter(Boolean))]);

    const enrichedInquiries = enrichWithClientMap(inquiries, clientMap).filter((inquiry) => {
      if (!searchPattern) {
        return true;
      }

      return [
        inquiry.name,
        inquiry.email,
        inquiry.message,
        inquiry.clientName,
        inquiry.clientBusinessName
      ].some((value) => searchPattern.test(String(value || "")));
    });

    return sendSuccess(res, 200, { inquiries: enrichedInquiries });
  } catch (_error) {
    return sendError(res, 500, "Unable to load inquiries right now.");
  }
}

async function updateAdminInquiry(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid inquiry ID.");
    }

    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return sendError(res, 404, "Inquiry not found.");
    }
    const oldValue = inquiry.toObject();

    if (typeof req.body.status === "string") {
      const status = String(req.body.status || "").trim();
      if (!INQUIRY_STATUS_OPTIONS.includes(status)) {
        return sendError(res, 400, "Inquiry status is invalid.");
      }
      inquiry.status = status;
    }

    if (typeof req.body.adminNotes === "string") {
      inquiry.adminNotes = normalizeAdminNote(req.body.adminNotes);
    }

    await inquiry.save();
    await logAdminAction(req, {
      module: "Inquiries",
      action: "inquiries.updated",
      targetType: "Inquiry",
      targetId: String(inquiry._id),
      targetLabel: inquiry.name || inquiry.email || "Inquiry",
      oldValue,
      newValue: inquiry.toObject(),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Inquiry updated successfully.",
      inquiry
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the inquiry right now.");
  }
}

async function getAdminReviews(req, res) {
  try {
    const query = {};

    if (req.query.clientId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.clientId)) {
        return sendError(res, 400, "Invalid client ID.");
      }
      query.clientId = req.query.clientId;
    }

    if (req.query.rating) {
      const rating = Number(req.query.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return sendError(res, 400, "Rating filter must be between 1 and 5.");
      }
      query.rating = rating;
    }

    if (req.query.status) {
      const reviewStatusMap = {
        pending: "pending",
        approved: "published",
        rejected: "hidden",
        published: "published",
        hidden: "hidden"
      };
      const mappedStatus = reviewStatusMap[String(req.query.status || "").trim()];
      if (!mappedStatus) {
        return sendError(res, 400, "Invalid review status filter.");
      }
      query.status = mappedStatus;
    }

    const sortBy = String(req.query.sortBy || "createdAt");
    const sortDirection = getSortDirection(req.query.sortDirection);
    const sortMap = {
      createdAt: { createdAt: sortDirection },
      rating: { rating: sortDirection },
      status: { status: sortDirection }
    };
    const searchPattern = buildSearchRegex(req.query.search);

    const reviews = await Review.find(query).sort(sortMap[sortBy] || sortMap.createdAt).lean();
    const clientMap = await buildClientMap([...new Set(reviews.map((review) => String(review.clientId)).filter(Boolean))]);

    const enrichedReviews = enrichWithClientMap(reviews, clientMap).filter((review) => {
      if (!searchPattern) {
        return true;
      }

      return [
        review.name,
        review.role,
        review.text,
        review.clientName,
        review.clientBusinessName
      ].some((value) => searchPattern.test(String(value || "")));
    });

    return sendSuccess(res, 200, { reviews: enrichedReviews });
  } catch (_error) {
    return sendError(res, 500, "Unable to load reviews right now.");
  }
}

async function updateAdminReview(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid review ID.");
    }

    const review = await Review.findById(req.params.id);
    if (!review) {
      return sendError(res, 404, "Review not found.");
    }
    const oldValue = review.toObject();

    if (typeof req.body.status === "string") {
      const status = String(req.body.status || "").trim();
      if (!REVIEW_STATUS_OPTIONS.includes(status)) {
        return sendError(res, 400, "Review status must be pending, published, or hidden.");
      }
      review.status = status;
    }

    if (typeof req.body.adminNotes === "string") {
      review.adminNotes = normalizeAdminNote(req.body.adminNotes);
    }

    await review.save();
    await logAdminAction(req, {
      module: "Reviews",
      action: "reviews.updated",
      targetType: "Review",
      targetId: String(review._id),
      targetLabel: review.name || "Review",
      oldValue,
      newValue: review.toObject(),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Review updated successfully.",
      review
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the review right now.");
  }
}

async function getInvoices(req, res) {
  try {
    const query = {};

    if (req.query.clientId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.clientId)) {
        return sendError(res, 400, "Invalid client ID.");
      }
      query.clientId = req.query.clientId;
    }

    if (req.query.projectId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.projectId)) {
        return sendError(res, 400, "Invalid project ID.");
      }
      query.projectId = req.query.projectId;
    }

    if (req.query.invoiceType) {
      query.invoiceType = normalizeInvoiceType(req.query.invoiceType);
    }

    const issueDateRange = {};
    const fromDate = normalizeInvoiceDate(req.query.from);
    const toDate = normalizeInvoiceDate(req.query.to);
    const dueDateRange = {};
    const dueFromDate = normalizeInvoiceDate(req.query.dueFrom);
    const dueToDate = normalizeInvoiceDate(req.query.dueTo);

    if (fromDate) {
      issueDateRange.$gte = fromDate;
    }

    if (toDate) {
      issueDateRange.$lte = toDate;
    }

    if (Object.keys(issueDateRange).length) {
      query.issueDate = issueDateRange;
    }

    if (dueFromDate) {
      dueDateRange.$gte = dueFromDate;
    }

    if (dueToDate) {
      dueDateRange.$lte = dueToDate;
    }

    if (Object.keys(dueDateRange).length) {
      query.dueDate = dueDateRange;
    }

    const sortBy = String(req.query.sortBy || "createdAt");
    const sortDirection = getSortDirection(req.query.sortDirection);
    const sortMap = {
      createdAt: { createdAt: sortDirection },
      dueDate: { dueDate: sortDirection, createdAt: -1 },
      totalAmount: { totalAmount: sortDirection, createdAt: -1 },
      invoiceNumber: { invoiceNumber: sortDirection }
    };
    const searchPattern = buildSearchRegex(req.query.search);
    const requestedStatus = req.query.status && INVOICE_STATUS_OPTIONS.includes(String(req.query.status).trim().toLowerCase())
      ? normalizeInvoiceStatus(req.query.status)
      : paymentStatusToStatus(req.query.paymentStatus || "");

    const invoices = await Invoice.find(query)
      .populate("projectId", "projectTitle")
      .populate("maintenancePlanId", "planName")
      .populate("leadId", "businessName contactPerson")
      .populate("salesExecutiveId", "fullName")
      .sort(sortMap[sortBy] || sortMap.createdAt)
      .lean();
    const serializedInvoices = invoices
      .map(serializeInvoiceWithReferenceLabels)
      .filter((invoice) => !requestedStatus || invoice.status === requestedStatus)
      .filter((invoice) => {
        if (!searchPattern) {
          return true;
        }

        return [
          invoice.invoiceNumber,
          invoice.clientName,
          invoice.clientEmail,
          invoice.businessName,
          invoice.title,
          invoice.projectTitle,
          invoice.maintenancePlanName
        ].some((value) => searchPattern.test(String(value || "")));
      });

    return sendSuccess(res, 200, {
      invoices: serializedInvoices,
      analytics: buildInvoiceAnalytics(serializedInvoices)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load invoices right now.");
  }
}

async function createInvoice(req, res) {
  try {
    const client = await findInvoiceClient(req.body.clientId);
    if (!client) {
      return sendError(res, 404, "Select a valid client before creating an invoice.");
    }

    const settings = await getCurrentAppSettings();
    const payload = buildInvoiceMutationPayload(req.body, null, {
      defaultTaxRate: settings.defaultTaxRate,
      defaultPaymentTerms: settings.defaultPaymentTerms
    });
    if (payload.error) {
      return sendError(res, 400, payload.error);
    }
    const { links, errors: linkErrors } = await resolveInvoiceOptionalLinks(req.body, client._id);
    if (linkErrors.length) {
      return sendError(res, 400, "Please fix invoice links and try again.", linkErrors);
    }

    const invoice = new Invoice({
      invoiceNumber: await generateInvoiceNumber(settings.invoicePrefix),
      currency: settings.defaultCurrency || DEFAULT_INVOICE_CURRENCY,
      ...payload,
      ...links
    });
    applyInvoiceClientSnapshot(invoice, client);
    await invoice.save();
    await logAdminAction(req, {
      module: "Invoices",
      action: "invoices.created",
      targetType: "Invoice",
      targetId: String(invoice._id),
      targetLabel: invoice.invoiceNumber,
      newValue: serializeInvoice(invoice),
      severity: "Medium"
    });

    return sendSuccess(res, 201, {
      message: "Invoice saved successfully.",
      invoice: serializeInvoice(invoice)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to create the invoice right now.");
  }
}

async function getInvoiceById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid invoice ID.");
    }

    const invoice = await findInvoiceWithReferences({ _id: req.params.id });
    if (!invoice) {
      return sendError(res, 404, "Invoice not found.");
    }

    return sendSuccess(res, 200, {
      invoice
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load the invoice right now.");
  }
}

async function updateInvoice(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid invoice ID.");
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return sendError(res, 404, "Invoice not found.");
    }
    const oldValue = serializeInvoice(invoice);

    if (typeof req.body.clientId !== "undefined" && String(req.body.clientId) !== String(invoice.clientId)) {
      const client = await findInvoiceClient(req.body.clientId);
      if (!client) {
        return sendError(res, 404, "Select a valid client before updating this invoice.");
      }
      applyInvoiceClientSnapshot(invoice, client);
    }
    const { links, errors: linkErrors } = await resolveInvoiceOptionalLinks(req.body, invoice.clientId);
    if (linkErrors.length) {
      return sendError(res, 400, "Please fix invoice links and try again.", linkErrors);
    }

    const payload = buildInvoiceMutationPayload(req.body, invoice);
    if (payload.error) {
      return sendError(res, 400, payload.error);
    }

    Object.assign(invoice, payload, links);
    await invoice.save();
    await logAdminAction(req, {
      module: "Invoices",
      action: "invoices.updated",
      targetType: "Invoice",
      targetId: String(invoice._id),
      targetLabel: invoice.invoiceNumber,
      oldValue,
      newValue: serializeInvoice(invoice),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Invoice saved successfully.",
      invoice: serializeInvoice(invoice)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the invoice right now.");
  }
}

async function deleteInvoice(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid invoice ID.");
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return sendError(res, 404, "Invoice not found.");
    }
    const oldValue = serializeInvoice(invoice);

    invoice.status = "cancelled";
    invoice.paymentStatus = "Cancelled";
    if (typeof req.body.adminNotes === "string") {
      invoice.adminNotes = normalizeInvoiceText(req.body.adminNotes, 5000);
    }
    await invoice.save();
    await logAdminAction(req, {
      module: "Invoices",
      action: "invoices.cancelled",
      targetType: "Invoice",
      targetId: String(invoice._id),
      targetLabel: invoice.invoiceNumber,
      oldValue,
      newValue: serializeInvoice(invoice),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Invoice cancelled successfully.",
      invoice: serializeInvoice(invoice)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to cancel the invoice right now.");
  }
}

async function markInvoicePaid(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid invoice ID.");
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return sendError(res, 404, "Invoice not found.");
    }

    if (invoice.status === "cancelled") {
      return sendError(res, 400, "Cancelled invoices cannot be marked as paid.");
    }
    const oldValue = serializeInvoice(invoice);

    invoice.paidAmount = roundMoney(invoice.totalAmount);
    invoice.balance = 0;
    invoice.balanceAmount = 0;
    invoice.status = "paid";
    invoice.paymentStatus = "Paid";
    invoice.paymentMethod = normalizeInvoicePaymentMethod(req.body.paymentMethod || invoice.paymentMethod);
    invoice.paymentNotes = normalizeInvoiceText(req.body.paymentNotes || invoice.paymentNotes, 5000);
    invoice.paidDate = normalizeInvoiceDate(req.body.paidDate) || new Date();
    await invoice.save();
    await logAdminAction(req, {
      module: "Payments",
      action: "invoices.marked_paid",
      targetType: "Invoice",
      targetId: String(invoice._id),
      targetLabel: invoice.invoiceNumber,
      oldValue,
      newValue: serializeInvoice(invoice),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Invoice marked as paid. Commission approval remains manual.",
      invoice: serializeInvoice(invoice)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to mark the invoice as paid right now.");
  }
}

async function addInvoicePayment(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid invoice ID.");
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return sendError(res, 404, "Invoice not found.");
    }

    if (invoice.status === "cancelled") {
      return sendError(res, 400, "Cancelled invoices cannot receive payments.");
    }
    const oldValue = serializeInvoice(invoice);

    const paymentAmount = normalizeMoney(req.body.amount);
    if (paymentAmount <= 0) {
      return sendError(res, 400, "Enter a valid payment amount.");
    }

    const nextPaidAmount = roundMoney(normalizeMoney(invoice.paidAmount) + paymentAmount);
    if (nextPaidAmount > normalizeMoney(invoice.totalAmount)) {
      return sendError(res, 400, "Payment amount cannot exceed the remaining invoice balance.");
    }

    const totals = calculateInvoiceTotals({
      items: invoice.items,
      discount: invoice.discount,
      tax: invoice.tax,
      paidAmount: nextPaidAmount
    });
    const status = resolveInvoiceStatus({
      requestedStatus: invoice.status === "draft" ? "sent" : invoice.status,
      currentStatus: invoice.status,
      dueDate: invoice.dueDate,
      totalAmount: totals.totalAmount,
      paidAmount: totals.paidAmount,
      balance: totals.balance
    });

    invoice.paidAmount = totals.paidAmount;
    invoice.balance = totals.balance;
    invoice.balanceAmount = totals.balance;
    invoice.status = status;
    invoice.paymentStatus = statusToPaymentStatus(status);
    invoice.paymentMethod = normalizeInvoicePaymentMethod(req.body.paymentMethod || invoice.paymentMethod);
    invoice.paymentNotes = normalizeInvoiceText(req.body.paymentNotes || invoice.paymentNotes, 5000);
    invoice.paidDate = status === "paid"
      ? normalizeInvoiceDate(req.body.paidDate) || new Date()
      : null;

    if (typeof req.body.adminNotes === "string") {
      invoice.adminNotes = normalizeInvoiceText(req.body.adminNotes, 5000);
    }

    await invoice.save();
    await logAdminAction(req, {
      module: "Payments",
      action: "invoices.payment_added",
      targetType: "Invoice",
      targetId: String(invoice._id),
      targetLabel: invoice.invoiceNumber,
      oldValue,
      newValue: serializeInvoice(invoice),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: status === "paid"
        ? "Payment recorded and invoice marked as paid."
        : "Payment recorded successfully.",
      invoice: serializeInvoice(invoice)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to record the payment right now.");
  }
}

async function findInvoiceWithReferences(match) {
  const invoice = await Invoice.findOne(match)
    .populate("projectId", "projectTitle")
    .populate("maintenancePlanId", "planName")
    .populate("leadId", "businessName contactPerson")
    .populate("salesExecutiveId", "fullName")
    .lean();

  if (!invoice) {
    return null;
  }

  return serializeInvoiceWithReferenceLabels(invoice);
}

function serializeInvoiceWithReferenceLabels(invoice) {
  return serializeInvoice({
    ...invoice,
    projectTitle: invoice.projectId && invoice.projectId.projectTitle,
    maintenancePlanName: invoice.maintenancePlanId && invoice.maintenancePlanId.planName,
    leadBusinessName: invoice.leadId && (invoice.leadId.businessName || invoice.leadId.contactPerson),
    salesExecutiveName: invoice.salesExecutiveId && invoice.salesExecutiveId.fullName
  });
}

async function downloadInvoicePdf(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid invoice ID.");
    }

    const invoice = await findInvoiceWithReferences({ _id: req.params.id });
    if (!invoice) {
      return sendError(res, 404, "Invoice not found.");
    }

    const settings = await getCurrentAppSettings();
    const pdfBuffer = generateInvoicePdfBuffer({ invoice, settings });
    await logAdminAction(req, {
      module: "Invoices",
      action: "invoices.pdf_downloaded",
      targetType: "Invoice",
      targetId: String(req.params.id),
      targetLabel: invoice.invoiceNumber || "invoice",
      newValue: {
        invoiceNumber: invoice.invoiceNumber || "",
        clientEmail: invoice.clientEmail || ""
      },
      severity: "Medium"
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber || "invoice"}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (_error) {
    return sendError(res, 500, "Unable to generate the invoice PDF right now.");
  }
}

async function sendInvoiceToClient(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid invoice ID.");
    }

    const invoiceDocument = await Invoice.findById(req.params.id);
    if (!invoiceDocument) {
      return sendError(res, 404, "Invoice not found.");
    }

    const settings = await getCurrentAppSettings();
    const invoice = serializeInvoice(invoiceDocument);
    const result = await sendInvoiceEmail(invoice, settings);

    invoiceDocument.emailStatus = result.delivered ? "Sent" : "Failed";
    invoiceDocument.lastEmailSentAt = result.delivered ? new Date() : invoiceDocument.lastEmailSentAt;
    await invoiceDocument.save();
    await logAdminAction(req, {
      module: "Invoices",
      action: "invoices.email_sent",
      targetType: "Invoice",
      targetId: String(invoiceDocument._id),
      targetLabel: invoiceDocument.invoiceNumber,
      newValue: {
        emailStatus: invoiceDocument.emailStatus,
        delivered: Boolean(result.delivered),
        skipped: Boolean(result.skipped)
      },
      severity: result.delivered ? "Medium" : "High"
    });

    if (result.skipped) {
      return sendSuccess(res, 200, {
        message: "Invoice email was prepared, but email delivery is not configured.",
        emailStatus: invoiceDocument.emailStatus,
        reason: result.reason
      });
    }

    if (!result.delivered) {
      return sendError(res, 500, "Unable to send invoice email right now.");
    }

    return sendSuccess(res, 200, {
      message: "Invoice email sent successfully.",
      emailStatus: invoiceDocument.emailStatus,
      lastEmailSentAt: invoiceDocument.lastEmailSentAt
    });
  } catch (_error) {
    const invoiceDocument = mongoose.Types.ObjectId.isValid(req.params.id)
      ? await Invoice.findById(req.params.id)
      : null;
    if (invoiceDocument) {
      invoiceDocument.emailStatus = "Failed";
      await invoiceDocument.save();
    }
    return sendError(res, 500, "Unable to send invoice email right now.");
  }
}

async function getAdminRequests(req, res) {
  try {
    const query = {};

    if (req.query.clientId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.clientId)) {
        return sendError(res, 400, "Invalid client ID.");
      }
      query.clientId = req.query.clientId;
    }

    if (req.query.type) {
      const type = normalizeRequestType(req.query.type);
      if (!REQUEST_TYPE_OPTIONS.includes(type)) {
        return sendError(res, 400, "Invalid request type filter.");
      }
      query.type = type;
    }

    if (req.query.status) {
      const status = normalizeRequestStatus(req.query.status);
      if (!REQUEST_STATUS_OPTIONS.includes(status)) {
        return sendError(res, 400, "Invalid request status filter.");
      }
      query.status = status;
    }

    if (req.query.priority) {
      const priority = normalizeRequestPriority(req.query.priority);
      if (!REQUEST_PRIORITY_OPTIONS.includes(priority)) {
        return sendError(res, 400, "Invalid request priority filter.");
      }
      query.priority = priority;
    }

    const sortBy = String(req.query.sortBy || "createdAt");
    const sortDirection = getSortDirection(req.query.sortDirection);
    const sortMap = {
      createdAt: { createdAt: sortDirection },
      priority: { priority: sortDirection, createdAt: -1 },
      status: { status: sortDirection, createdAt: -1 }
    };
    const searchPattern = buildSearchRegex(req.query.search);

    const requests = await SupportRequest.find(query).sort(sortMap[sortBy] || sortMap.createdAt).lean();
    const serializedRequests = requests
      .map((request) => serializeSupportRequest(request, { includeAdminFields: true }))
      .filter((request) => {
        if (!searchPattern) {
          return true;
        }

        return [
          request.clientName,
          request.clientEmail,
          request.businessName,
          request.subject,
          request.message
        ].some((value) => searchPattern.test(String(value || "")));
      });

    return sendSuccess(res, 200, {
      requests: serializedRequests
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load support requests right now.");
  }
}

async function getAdminRequestById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "This request could not be found.");
    }

    const request = await SupportRequest.findById(req.params.id).lean();
    if (!request) {
      return sendError(res, 404, "This request could not be found.");
    }

    return sendSuccess(res, 200, {
      request: serializeSupportRequest(request, { includeAdminFields: true })
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load the request right now.");
  }
}

async function updateAdminRequest(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "This request could not be found.");
    }

    const request = await SupportRequest.findById(req.params.id);
    if (!request) {
      return sendError(res, 404, "This request could not be found.");
    }
    const oldValue = serializeSupportRequest(request, { includeAdminFields: true });

    if (typeof req.body.status === "string") {
      const status = normalizeRequestStatus(req.body.status);
      if (!REQUEST_STATUS_OPTIONS.includes(status)) {
        return sendError(res, 400, "Status must be open, in_progress, resolved, rejected, or closed.");
      }
      request.status = status;
      applyResolvedTimestamp(request, request.status);
    }

    if (typeof req.body.priority === "string") {
      const priority = normalizeRequestPriority(req.body.priority);
      if (!REQUEST_PRIORITY_OPTIONS.includes(priority)) {
        return sendError(res, 400, "Priority must be low, normal, high, or urgent.");
      }
      request.priority = priority;
    }

    if (typeof req.body.adminNote === "string") {
      request.adminNote = normalizeRequestText(req.body.adminNote, 5000);
    }

    await request.save();
    await logAdminAction(req, {
      module: "Support",
      action: "support.updated",
      targetType: "SupportRequest",
      targetId: String(request._id),
      targetLabel: request.subject || request.clientEmail || "Support request",
      oldValue,
      newValue: serializeSupportRequest(request, { includeAdminFields: true }),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Request saved successfully.",
      request: serializeSupportRequest(request, { includeAdminFields: true })
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the request right now.");
  }
}

async function deleteAdminRequest(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "This request could not be found.");
    }

    const request = await SupportRequest.findById(req.params.id);
    if (!request) {
      return sendError(res, 404, "This request could not be found.");
    }
    const oldValue = serializeSupportRequest(request, { includeAdminFields: true });

    request.status = "closed";
    applyResolvedTimestamp(request, request.status);

    if (typeof req.body.adminNote === "string") {
      request.adminNote = normalizeRequestText(req.body.adminNote, 5000);
    }

    await request.save();
    await logAdminAction(req, {
      module: "Support",
      action: "support.closed",
      targetType: "SupportRequest",
      targetId: String(request._id),
      targetLabel: request.subject || request.clientEmail || "Support request",
      oldValue,
      newValue: serializeSupportRequest(request, { includeAdminFields: true }),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Request marked as completed successfully.",
      request: serializeSupportRequest(request, { includeAdminFields: true })
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to close the request right now.");
  }
}

module.exports = {
  getStats,
  getAuditLogs,
  getAuditLogById,
  getAdminUsers,
  getAdminUserById,
  updateAdminUserRole,
  updateAdminUserStatus,
  activateAdminUser,
  deactivateAdminUser,
  getAdminSettings,
  updateAdminSettings,
  getReportsOverview,
  getReportsRevenue,
  getReportsProjects,
  getReportsInvoices,
  getReportsSales,
  getReportsMaintenance,
  getReportsSupport,
  getReportsSummary,
  exportClientsReport,
  exportInvoicesReport,
  exportRequestsReport,
  exportRevenueReport,
  exportProjectsReport,
  exportSalesReport,
  exportMaintenanceReport,
  getClients,
  getClientById,
  updateClient,
  softDeleteClient,
  getAdminBookings,
  updateAdminBooking,
  getAdminInquiries,
  updateAdminInquiry,
  getAdminReviews,
  updateAdminReview,
  getAdminRequests,
  getAdminRequestById,
  updateAdminRequest,
  deleteAdminRequest,
  getInvoices,
  createInvoice,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  markInvoicePaid,
  addInvoicePayment,
  downloadInvoicePdf,
  sendInvoiceToClient
};
