const Invoice = require("../models/Invoice");
const mongoose = require("mongoose");
const { serializeInvoice } = require("../utils/invoice");
const { generateInvoicePdfBuffer } = require("../utils/invoicePdf");
const { sendSuccess, sendError } = require("../utils/response");

function serializeClientInvoice(invoice) {
  const serialized = serializeInvoice(invoice);
  delete serialized.adminNotes;
  return serialized;
}

async function getClientInvoices(req, res) {
  try {
    const invoices = await Invoice.find({ clientId: req.user.id }).sort({ createdAt: -1 }).lean();

    return sendSuccess(res, 200, {
      invoices: invoices.map(serializeClientInvoice)
    });
  } catch {
    return sendError(res, 500, "Unable to load invoices right now.");
  }
}

async function downloadClientInvoicePdf(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid invoice ID.");
    }

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      clientId: req.user.id
    }).lean();

    if (!invoice) {
      return sendError(res, 404, "Invoice not found.");
    }

    const serializedInvoice = serializeClientInvoice(invoice);
    const pdfBuffer = generateInvoicePdfBuffer({ invoice: serializedInvoice });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${serializedInvoice.invoiceNumber || "invoice"}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch {
    return sendError(res, 500, "Unable to generate the invoice PDF right now.");
  }
}

module.exports = {
  getClientInvoices,
  downloadClientInvoicePdf
};
