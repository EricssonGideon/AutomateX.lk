const mongoose = require("mongoose");

const User = require("../models/User");
const Booking = require("../models/Booking");
const Inquiry = require("../models/Inquiry");
const Invoice = require("../models/Invoice");
const Review = require("../models/Review");
const SupportRequest = require("../models/SupportRequest");
const { OFFICIAL_ADMIN_EMAIL, resolveTrustedRole } = require("../utils/authRole");
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
  calculateInvoiceTotals,
  resolveInvoiceStatus,
  serializeInvoice
} = require("../utils/invoice");
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

async function generateInvoiceNumber() {
  let sequence = await Invoice.countDocuments({});

  while (true) {
    sequence += 1;
    const invoiceNumber = `AX-INV-${String(sequence).padStart(4, "0")}`;
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

function buildInvoiceMutationPayload(body, currentInvoice = null) {
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
  const dueDate = normalizeInvoiceDate(
    hasOwn("dueDate") ? body.dueDate : currentInvoice && currentInvoice.dueDate
  );
  const issueDate = normalizeInvoiceDate(
    hasOwn("issueDate") ? body.issueDate : currentInvoice && currentInvoice.issueDate
  ) || (currentInvoice && currentInvoice.issueDate) || new Date();
  const totals = calculateInvoiceTotals({
    items: hasOwn("items") ? body.items : currentInvoice && currentInvoice.items,
    discount: hasOwn("discount") ? body.discount : currentInvoice && currentInvoice.discount,
    tax: hasOwn("tax") ? body.tax : currentInvoice && currentInvoice.tax,
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

  const status = resolveInvoiceStatus({
    requestedStatus: hasOwn("status") ? body.status : currentInvoice && currentInvoice.status,
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
    issueDate,
    dueDate,
    paidDate,
    notes,
    adminNotes,
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

async function exportClientsReport(_req, res) {
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
    return sendError(res, 500, "Unable to export the client report right now.");
  }
}

async function exportInvoicesReport(_req, res) {
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
    return sendError(res, 500, "Unable to export the invoice report right now.");
  }
}

async function exportRequestsReport(_req, res) {
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
    return sendError(res, 500, "Unable to export the support request report right now.");
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

    return sendSuccess(res, 200, {
      message: "Client updated successfully.",
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

    const issueDateRange = {};
    const fromDate = normalizeInvoiceDate(req.query.from);
    const toDate = normalizeInvoiceDate(req.query.to);

    if (fromDate) {
      issueDateRange.$gte = fromDate;
    }

    if (toDate) {
      issueDateRange.$lte = toDate;
    }

    if (Object.keys(issueDateRange).length) {
      query.issueDate = issueDateRange;
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
      : "";

    const invoices = await Invoice.find(query).sort(sortMap[sortBy] || sortMap.createdAt).lean();
    const serializedInvoices = invoices
      .map(serializeInvoice)
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
          invoice.title
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

    const payload = buildInvoiceMutationPayload(req.body);
    if (payload.error) {
      return sendError(res, 400, payload.error);
    }

    const invoice = new Invoice({
      invoiceNumber: await generateInvoiceNumber(),
      currency: DEFAULT_INVOICE_CURRENCY,
      ...payload
    });
    applyInvoiceClientSnapshot(invoice, client);
    await invoice.save();

    return sendSuccess(res, 201, {
      message: "Invoice created successfully.",
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

    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) {
      return sendError(res, 404, "Invoice not found.");
    }

    return sendSuccess(res, 200, {
      invoice: serializeInvoice(invoice)
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

    if (typeof req.body.clientId !== "undefined" && String(req.body.clientId) !== String(invoice.clientId)) {
      const client = await findInvoiceClient(req.body.clientId);
      if (!client) {
        return sendError(res, 404, "Select a valid client before updating this invoice.");
      }
      applyInvoiceClientSnapshot(invoice, client);
    }

    const payload = buildInvoiceMutationPayload(req.body, invoice);
    if (payload.error) {
      return sendError(res, 400, payload.error);
    }

    Object.assign(invoice, payload);
    await invoice.save();

    return sendSuccess(res, 200, {
      message: "Invoice updated successfully.",
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

    invoice.status = "cancelled";
    if (typeof req.body.adminNotes === "string") {
      invoice.adminNotes = normalizeInvoiceText(req.body.adminNotes, 5000);
    }
    await invoice.save();

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

    invoice.paidAmount = roundMoney(invoice.totalAmount);
    invoice.balance = 0;
    invoice.status = "paid";
    invoice.paidDate = normalizeInvoiceDate(req.body.paidDate) || new Date();
    await invoice.save();

    return sendSuccess(res, 200, {
      message: "Invoice marked as paid.",
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
    invoice.status = status;
    invoice.paidDate = status === "paid"
      ? normalizeInvoiceDate(req.body.paidDate) || new Date()
      : null;

    if (typeof req.body.adminNotes === "string") {
      invoice.adminNotes = normalizeInvoiceText(req.body.adminNotes, 5000);
    }

    await invoice.save();

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
      return sendError(res, 400, "Invalid request ID.");
    }

    const request = await SupportRequest.findById(req.params.id).lean();
    if (!request) {
      return sendError(res, 404, "Request not found.");
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
      return sendError(res, 400, "Invalid request ID.");
    }

    const request = await SupportRequest.findById(req.params.id);
    if (!request) {
      return sendError(res, 404, "Request not found.");
    }

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

    return sendSuccess(res, 200, {
      message: "Request updated successfully.",
      request: serializeSupportRequest(request, { includeAdminFields: true })
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the request right now.");
  }
}

async function deleteAdminRequest(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid request ID.");
    }

    const request = await SupportRequest.findById(req.params.id);
    if (!request) {
      return sendError(res, 404, "Request not found.");
    }

    request.status = "closed";
    applyResolvedTimestamp(request, request.status);

    if (typeof req.body.adminNote === "string") {
      request.adminNote = normalizeRequestText(req.body.adminNote, 5000);
    }

    await request.save();

    return sendSuccess(res, 200, {
      message: "Request closed successfully.",
      request: serializeSupportRequest(request, { includeAdminFields: true })
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to close the request right now.");
  }
}

module.exports = {
  getStats,
  getReportsSummary,
  exportClientsReport,
  exportInvoicesReport,
  exportRequestsReport,
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
  addInvoicePayment
};
