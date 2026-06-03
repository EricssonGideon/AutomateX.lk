const INVOICE_STATUS_OPTIONS = ["draft", "sent", "paid", "partial", "overdue", "cancelled"];
const INVOICE_TYPE_OPTIONS = ["Project", "Maintenance", "Upgrade", "Custom"];
const INVOICE_EMAIL_STATUS_OPTIONS = ["Not Sent", "Sent", "Failed"];
const INVOICE_PAYMENT_METHOD_OPTIONS = ["Cash", "Bank Transfer", "Online", "Card", "Other"];
const DEFAULT_INVOICE_CURRENCY = "LKR";

function roundMoney(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Number(numericValue.toFixed(2));
}

function normalizeMoney(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return 0;
  }

  return Math.max(0, roundMoney(value));
}

function normalizeInvoiceText(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeInvoiceDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeInvoiceStatus(value) {
  if (typeof value !== "string") {
    return "draft";
  }

  const normalized = String(value || "").trim().toLowerCase();
  return INVOICE_STATUS_OPTIONS.includes(normalized) ? normalized : "draft";
}

function normalizeInvoiceType(value) {
  const normalized = normalizeInvoiceText(value, 40);
  return INVOICE_TYPE_OPTIONS.includes(normalized) ? normalized : "Custom";
}

function normalizeInvoiceEmailStatus(value) {
  const normalized = normalizeInvoiceText(value, 40);
  return INVOICE_EMAIL_STATUS_OPTIONS.includes(normalized) ? normalized : "Not Sent";
}

function normalizeInvoicePaymentMethod(value) {
  const normalized = normalizeInvoiceText(value, 40);
  return INVOICE_PAYMENT_METHOD_OPTIONS.includes(normalized) ? normalized : "Other";
}

function statusToPaymentStatus(status) {
  const normalizedStatus = normalizeInvoiceStatus(status);
  const labels = {
    draft: "Unpaid",
    sent: "Unpaid",
    paid: "Paid",
    partial: "Partial",
    overdue: "Overdue",
    cancelled: "Cancelled"
  };

  return labels[normalizedStatus] || "Unpaid";
}

function paymentStatusToStatus(paymentStatus) {
  const normalized = normalizeInvoiceText(paymentStatus, 40).toLowerCase();
  const statuses = {
    unpaid: "sent",
    partial: "partial",
    paid: "paid",
    overdue: "overdue",
    cancelled: "cancelled"
  };

  return statuses[normalized] || "";
}

function normalizeInvoiceCurrency(value) {
  const normalized = String(value || DEFAULT_INVOICE_CURRENCY).trim().toUpperCase();
  if (!normalized) {
    return DEFAULT_INVOICE_CURRENCY;
  }

  try {
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalized
    });
    return normalized;
  } catch {
    return DEFAULT_INVOICE_CURRENCY;
  }
}

function serializeObjectId(value) {
  if (!value) {
    return "";
  }

  if (value._id) {
    return String(value._id);
  }

  return String(value);
}

function normalizeInvoiceItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const name = normalizeInvoiceText(item && (item.name || item.description), 200);
      const description = normalizeInvoiceText(item && (item.description || item.name), 500);
      const quantity = normalizeMoney(item && item.quantity);
      const unitPrice = normalizeMoney(item && item.unitPrice);
      const total = roundMoney(quantity * unitPrice);
      const amount = total;

      if (!name || quantity <= 0) {
        return null;
      }

      return {
        name,
        description,
        quantity,
        unitPrice,
        total,
        amount
      };
    })
    .filter(Boolean);
}

function calculateInvoiceTotals({ items, discount, tax, paidAmount, taxRate }) {
  const normalizedItems = normalizeInvoiceItems(items);
  const subtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + roundMoney(item.total), 0));
  const normalizedDiscount = Math.min(subtotal, normalizeMoney(discount));
  const normalizedTaxRate = Number.isFinite(Number(taxRate))
    ? Math.max(0, Number(taxRate))
    : 0;
  const normalizedTax = typeof tax === "undefined" || tax === null || tax === ""
    ? roundMoney(Math.max(0, (subtotal - normalizedDiscount) * (normalizedTaxRate / 100)))
    : normalizeMoney(tax);
  const totalAmount = roundMoney(Math.max(0, subtotal - normalizedDiscount + normalizedTax));
  const normalizedPaidAmount = normalizeMoney(paidAmount);
  const balance = roundMoney(Math.max(0, totalAmount - normalizedPaidAmount));

  return {
    items: normalizedItems,
    subtotal,
    discount: normalizedDiscount,
    tax: normalizedTax,
    totalAmount,
    paidAmount: normalizedPaidAmount,
    balance
  };
}

function isOverdueDate(dueDate) {
  const parsedDate = normalizeInvoiceDate(dueDate);

  if (!parsedDate) {
    return false;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const dueDateStart = new Date(parsedDate);
  dueDateStart.setHours(0, 0, 0, 0);

  return dueDateStart.getTime() < todayStart.getTime();
}

function resolveInvoiceStatus({ requestedStatus, currentStatus, dueDate, totalAmount, paidAmount, balance }) {
  const desiredStatus = normalizeInvoiceStatus(requestedStatus || currentStatus || "draft");

  if (desiredStatus === "cancelled") {
    return "cancelled";
  }

  if (balance <= 0 && totalAmount > 0) {
    return "paid";
  }

  if (paidAmount > 0 && balance > 0) {
    return "partial";
  }

  if (desiredStatus === "draft") {
    return "draft";
  }

  if (isOverdueDate(dueDate) && balance > 0) {
    return "overdue";
  }

  return "sent";
}

function serializeInvoice(invoice) {
  const source = invoice && typeof invoice.toObject === "function"
    ? invoice.toObject()
    : invoice || {};
  const totals = calculateInvoiceTotals({
    items: source.items,
    discount: source.discount,
    tax: source.tax,
    paidAmount: source.paidAmount
  });
  const status = resolveInvoiceStatus({
    requestedStatus: source.status,
    currentStatus: source.status,
    dueDate: source.dueDate,
    totalAmount: totals.totalAmount,
    paidAmount: totals.paidAmount,
    balance: totals.balance
  });

  return {
    id: String(source._id || source.id || ""),
    invoiceNumber: source.invoiceNumber || "",
    clientId: serializeObjectId(source.clientId),
    projectId: serializeObjectId(source.projectId),
    maintenancePlanId: serializeObjectId(source.maintenancePlanId),
    leadId: serializeObjectId(source.leadId),
    salesExecutiveId: serializeObjectId(source.salesExecutiveId),
    projectTitle: source.projectTitle || "",
    maintenancePlanName: source.maintenancePlanName || "",
    leadBusinessName: source.leadBusinessName || "",
    salesExecutiveName: source.salesExecutiveName || "",
    clientName: source.clientName || "",
    clientEmail: source.clientEmail || "",
    businessName: source.businessName || "",
    invoiceType: normalizeInvoiceType(source.invoiceType),
    title: source.title || "",
    description: source.description || "",
    items: totals.items,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    totalAmount: totals.totalAmount,
    paidAmount: totals.paidAmount,
    balance: totals.balance,
    balanceAmount: totals.balance,
    currency: normalizeInvoiceCurrency(source.currency),
    status,
    paymentStatus: statusToPaymentStatus(status),
    paymentMethod: normalizeInvoicePaymentMethod(source.paymentMethod),
    paymentNotes: source.paymentNotes || "",
    issueDate: source.issueDate || null,
    dueDate: source.dueDate || null,
    paidDate: status === "paid" ? source.paidDate || source.updatedAt || source.issueDate || null : source.paidDate || null,
    notes: source.notes || "",
    clientNotes: source.clientNotes || source.notes || "",
    adminNotes: source.adminNotes || "",
    emailStatus: normalizeInvoiceEmailStatus(source.emailStatus),
    lastEmailSentAt: source.lastEmailSentAt || null,
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null
  };
}

module.exports = {
  INVOICE_STATUS_OPTIONS,
  INVOICE_TYPE_OPTIONS,
  INVOICE_EMAIL_STATUS_OPTIONS,
  INVOICE_PAYMENT_METHOD_OPTIONS,
  DEFAULT_INVOICE_CURRENCY,
  roundMoney,
  normalizeMoney,
  normalizeInvoiceText,
  normalizeInvoiceDate,
  normalizeInvoiceStatus,
  normalizeInvoiceType,
  normalizeInvoiceEmailStatus,
  normalizeInvoicePaymentMethod,
  normalizeInvoiceCurrency,
  normalizeInvoiceItems,
  calculateInvoiceTotals,
  isOverdueDate,
  resolveInvoiceStatus,
  statusToPaymentStatus,
  paymentStatusToStatus,
  serializeInvoice
};
