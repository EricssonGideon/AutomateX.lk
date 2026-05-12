const express = require("express");

const {
  getStats,
  getReportsSummary,
  exportClientsReport,
  exportInvoicesReport,
  exportRequestsReport,
  getClients,
  getClientById,
  updateClient,
  softDeleteClient,
  getInvoices,
  createInvoice,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  markInvoicePaid,
  addInvoicePayment,
  getAdminBookings,
  updateAdminBooking,
  getAdminInquiries,
  updateAdminInquiry,
  getAdminReviews,
  updateAdminReview,
  getAdminRequests,
  getAdminRequestById,
  updateAdminRequest,
  deleteAdminRequest
} = require("../controllers/adminController");
const { verifyToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/stats", getStats);
router.get("/reports/summary", getReportsSummary);
router.get("/reports/export/clients", exportClientsReport);
router.get("/reports/export/invoices", exportInvoicesReport);
router.get("/reports/export/requests", exportRequestsReport);
router.get("/clients", getClients);
router.get("/clients/:id", getClientById);
router.patch("/clients/:id", updateClient);
router.delete("/clients/:id", softDeleteClient);
router.get("/invoices", getInvoices);
router.post("/invoices", createInvoice);
router.get("/invoices/:id", getInvoiceById);
router.patch("/invoices/:id", updateInvoice);
router.delete("/invoices/:id", deleteInvoice);
router.patch("/invoices/:id/mark-paid", markInvoicePaid);
router.patch("/invoices/:id/add-payment", addInvoicePayment);
router.get("/bookings", getAdminBookings);
router.patch("/bookings/:id", updateAdminBooking);
router.get("/inquiries", getAdminInquiries);
router.patch("/inquiries/:id", updateAdminInquiry);
router.get("/reviews", getAdminReviews);
router.patch("/reviews/:id", updateAdminReview);
router.get("/requests", getAdminRequests);
router.get("/requests/:id", getAdminRequestById);
router.patch("/requests/:id", updateAdminRequest);
router.delete("/requests/:id", deleteAdminRequest);

module.exports = router;
