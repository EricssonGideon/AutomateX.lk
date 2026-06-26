const express = require("express");

const {
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
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  clearTestExpenses,
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
  getInvoices,
  createInvoice,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  markInvoicePaid,
  addInvoicePayment,
  downloadInvoicePdf,
  sendInvoiceToClient,
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
const {
  getAdminProjects,
  createAdminProject,
  getAdminProjectById,
  updateAdminProject,
  archiveAdminProject,
  updateAdminProjectStatus,
  updateAdminProjectProgress,
  updateAdminProjectMilestones,
  updateAdminProjectDeliverables
} = require("../controllers/projectController");
const {
  listAdminProjectFiles,
  createAdminProjectFile,
  archiveAdminProjectFile,
  updateAdminProjectFileVisibility,
  downloadAdminProjectFile
} = require("../controllers/projectFileController");
const {
  getAdminMaintenancePlans,
  getAdminMaintenancePlanById,
  createAdminMaintenancePlan,
  updateAdminMaintenancePlan,
  renewAdminMaintenancePlan,
  expireAdminMaintenancePlan,
  cancelAdminMaintenancePlan
} = require("../controllers/maintenancePlanController");
const {
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
} = require("../controllers/salesController");
const { verifyToken, requireAdmin, requirePermission, requireSystemAdmin } = require("../middleware/auth");

const router = express.Router();
const can = requirePermission;

router.use(verifyToken, requireAdmin);

router.get("/stats", can("stats:view"), getStats);
router.get("/audit-logs", can("audit:view"), getAuditLogs);
router.get("/audit-logs/:id", can("audit:view"), getAuditLogById);
router.get("/users", can("users:manage"), getAdminUsers);
router.get("/users/:id", can("users:manage"), getAdminUserById);
router.patch("/users/:id/role", can("users:manage"), updateAdminUserRole);
router.patch("/users/:id/status", can("users:manage"), updateAdminUserStatus);
router.patch("/users/:id/activate", can("users:manage"), activateAdminUser);
router.patch("/users/:id/deactivate", can("users:manage"), deactivateAdminUser);
router.get("/settings", can("settings:manage"), getAdminSettings);
router.patch("/settings", can("settings:manage"), updateAdminSettings);
router.get("/expenses", can("expenses:view"), getExpenses);
router.post("/expenses", can("expenses:manage"), createExpense);
router.delete("/expenses/test-records", can("expenses:manage"), requireSystemAdmin, clearTestExpenses);
router.patch("/expenses/:id", can("expenses:manage"), updateExpense);
router.delete("/expenses/:id", can("expenses:manage"), deleteExpense);
router.get("/reports/overview", can("reports:view"), getReportsOverview);
router.get("/reports/revenue", can("reports:view"), getReportsRevenue);
router.get("/reports/projects", can("reports:view"), getReportsProjects);
router.get("/reports/invoices", can("reports:view"), getReportsInvoices);
router.get("/reports/sales", can("reports:view"), getReportsSales);
router.get("/reports/maintenance", can("reports:view"), getReportsMaintenance);
router.get("/reports/support", can("reports:view"), getReportsSupport);
router.get("/reports/summary", can("reports:view"), getReportsSummary);
router.get("/reports/export/clients", can("reports:export"), exportClientsReport);
router.get("/reports/export/invoices", can("reports:export"), exportInvoicesReport);
router.get("/reports/export/requests", can("reports:export"), exportRequestsReport);
router.get("/reports/export/revenue", can("reports:export"), exportRevenueReport);
router.get("/reports/export/projects", can("reports:export"), exportProjectsReport);
router.get("/reports/export/sales", can("reports:export"), exportSalesReport);
router.get("/reports/export/maintenance", can("reports:export"), exportMaintenanceReport);
router.get("/clients", can("clients:view"), getClients);
router.get("/clients/:id", can("clients:view"), getClientById);
router.patch("/clients/:id", can("clients:manage"), updateClient);
router.delete("/clients/:id", can("clients:manage"), softDeleteClient);
router.get("/invoices", can("invoices:view"), getInvoices);
router.post("/invoices", can("invoices:manage"), createInvoice);
router.get("/invoices/:id", can("invoices:view"), getInvoiceById);
router.patch("/invoices/:id", can("invoices:manage"), updateInvoice);
router.delete("/invoices/:id", can("invoices:manage"), deleteInvoice);
router.get("/invoices/:id/pdf", can("invoices:view"), downloadInvoicePdf);
router.post("/invoices/:id/send-email", can("invoices:send-email"), sendInvoiceToClient);
router.patch("/invoices/:id/mark-paid", can("invoices:payment-update"), markInvoicePaid);
router.patch("/invoices/:id/add-payment", can("invoices:payment-update"), addInvoicePayment);
router.get("/bookings", can("bookings:view"), getAdminBookings);
router.patch("/bookings/:id", can("bookings:manage"), updateAdminBooking);
router.get("/inquiries", can("inquiries:view"), getAdminInquiries);
router.patch("/inquiries/:id", can("inquiries:manage"), updateAdminInquiry);
router.get("/reviews", can("reviews:view"), getAdminReviews);
router.patch("/reviews/:id", can("reviews:manage"), updateAdminReview);
router.get("/projects", can("projects:view"), getAdminProjects);
router.post("/projects", can("projects:manage"), createAdminProject);
router.get("/projects/:projectId/files", can("files:view"), listAdminProjectFiles);
router.post("/projects/:projectId/files", can("files:manage"), createAdminProjectFile);
router.get("/projects/:projectId/maintenance-plans", can("maintenance:view"), getAdminMaintenancePlans);
router.get("/projects/:id", can("projects:view"), getAdminProjectById);
router.patch("/projects/:id", can("projects:manage"), updateAdminProject);
router.delete("/projects/:id", can("projects:manage"), archiveAdminProject);
router.patch("/projects/:id/status", can("projects:update-status"), updateAdminProjectStatus);
router.patch("/projects/:id/progress", can("projects:update-status"), updateAdminProjectProgress);
router.patch("/projects/:id/milestones", can("projects:manage"), updateAdminProjectMilestones);
router.patch("/projects/:id/deliverables", can("projects:manage"), updateAdminProjectDeliverables);
router.get("/project-files/:fileId/download", can("files:view"), downloadAdminProjectFile);
router.patch("/project-files/:fileId/visibility", can("files:manage"), updateAdminProjectFileVisibility);
router.delete("/project-files/:fileId", can("files:manage"), archiveAdminProjectFile);
router.get("/maintenance-plans", can("maintenance:view"), getAdminMaintenancePlans);
router.post("/maintenance-plans", can("maintenance:manage"), createAdminMaintenancePlan);
router.get("/maintenance-plans/:id", can("maintenance:view"), getAdminMaintenancePlanById);
router.patch("/maintenance-plans/:id", can("maintenance:manage"), updateAdminMaintenancePlan);
router.patch("/maintenance-plans/:id/renew", can("maintenance:manage"), renewAdminMaintenancePlan);
router.patch("/maintenance-plans/:id/expire", can("maintenance:manage"), expireAdminMaintenancePlan);
router.patch("/maintenance-plans/:id/cancel", can("maintenance:manage"), cancelAdminMaintenancePlan);
router.get("/sales-summary", can("sales:view"), getAdminSalesSummary);
router.get("/sales-executives", can("sales:view"), getAdminSalesExecutives);
router.post("/sales-executives", can("sales:manage"), createAdminSalesExecutive);
router.get("/sales-executives/:id/commission-summary", can("commissions:view"), getSalesExecutiveCommissionSummary);
router.get("/sales-executives/:id", can("sales:view"), getAdminSalesExecutiveById);
router.patch("/sales-executives/:id", can("sales:manage"), updateAdminSalesExecutive);
router.patch("/sales-executives/:id/status", can("sales:manage"), updateAdminSalesExecutiveStatus);
router.delete("/sales-executives/:id", can("sales:manage"), archiveAdminSalesExecutive);
router.get("/leads", can("leads:view"), getAdminLeads);
router.post("/leads", can("leads:manage"), createAdminLead);
router.get("/leads/:id", can("leads:view"), getAdminLeadById);
router.patch("/leads/:id", can("leads:manage"), updateAdminLead);
router.patch("/leads/:id/status", can("leads:manage"), updateAdminLeadStatus);
router.patch("/leads/:id/convert", can("leads:manage"), convertAdminLead);
router.patch("/leads/:id/payment-approval", can("leads:manage"), updateAdminLeadPaymentApproval);
router.get("/commissions", can("commissions:view"), getAdminCommissions);
router.post("/commissions", can("commissions:manage"), createAdminCommission);
router.get("/commissions/:id", can("commissions:view"), getAdminCommissionById);
router.patch("/commissions/:id", can("commissions:manage"), updateAdminCommission);
router.patch("/commissions/:id/approve", can("commissions:approve"), approveAdminCommission);
router.patch("/commissions/:id/mark-paid", can("commissions:approve"), markAdminCommissionPaid);
router.patch("/commissions/:id/cancel", can("commissions:approve"), cancelAdminCommission);
router.get("/requests", can("support:view"), getAdminRequests);
router.get("/requests/:id", can("support:view"), getAdminRequestById);
router.patch("/requests/:id", can("support:manage"), updateAdminRequest);
router.delete("/requests/:id", can("support:manage"), deleteAdminRequest);

module.exports = router;
