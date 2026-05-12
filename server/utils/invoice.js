const INVOICE_STATUS_OPTIONS = ["draft", "sent", "paid", "partial", "overdue", "cancelled"];
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

function normalizeInvoiceCurrency(value) {
  const normalized = String(value || DEFAULT_INVOICE_CURRENCY).trim().toUpperCase();
  return normalized || DEFAULT_INVOICE_CURRENCY;
}

function normalizeInvoiceItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const name = normalizeInvoiceText(item && item.name, 200);
      const quantity = normalizeMoney(item && item.quantity);
      const unitPrice = normalizeMoney(item && item.unitPrice);
      const total = roundMoney(quantity * unitPrice);

      if (!name || quantity <= 0) {
        return null;
      }

      return {
        name,
        quantity,
        unitPrice,
        total
      };
    })
    .filter(Boolean);
}

function calculateInvoiceTotals({ items, discount, tax, paidAmount }) {
  const normalizedItems = normalizeInvoiceItems(items);
  const subtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + roundMoney(item.total), 0));
  const normalizedDiscount = Math.min(subtotal, normalizeMoney(discount));
  const normalizedTax = normalizeMoney(tax);
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
    clientId: source.clientId ? String(source.clientId) : "",
    clientName: source.clientName || "",
    clientEmail: source.clientEmail || "",
    businessName: source.businessName || "",
    title: source.title || "",
    description: source.description || "",
    items: totals.items,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    totalAmount: totals.totalAmount,
    paidAmount: totals.paidAmount,
    balance: totals.balance,
    currency: normalizeInvoiceCurrency(source.currency),
    status,
    issueDate: source.issueDate || null,
    dueDate: source.dueDate || null,
    paidDate: status === "paid" ? source.paidDate || source.updatedAt || source.issueDate || null : source.paidDate || null,
    notes: source.notes || "",
    adminNotes: source.adminNotes || "",
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null
  };
}

module.exports = {
  INVOICE_STATUS_OPTIONS,
  DEFAULT_INVOICE_CURRENCY,
  roundMoney,
  normalizeMoney,
  normalizeInvoiceText,
  normalizeInvoiceDate,
  normalizeInvoiceStatus,
  normalizeInvoiceCurrency,
  normalizeInvoiceItems,
  calculateInvoiceTotals,
  isOverdueDate,
  resolveInvoiceStatus,
  serializeInvoice
};
