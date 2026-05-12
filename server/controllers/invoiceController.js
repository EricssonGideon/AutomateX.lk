const Invoice = require("../models/Invoice");
const { serializeInvoice } = require("../utils/invoice");
const { sendSuccess, sendError } = require("../utils/response");

async function getClientInvoices(req, res) {
  try {
    const invoices = await Invoice.find({ clientId: req.user.id }).sort({ createdAt: -1 }).lean();

    return sendSuccess(res, 200, {
      invoices: invoices.map(serializeInvoice)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load invoices right now.");
  }
}

module.exports = {
  getClientInvoices
};
