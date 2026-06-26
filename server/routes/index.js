const express = require("express");

const authRoutes = require("./auth");
const adminRoutes = require("./admin");
const billingRoutes = require("./billing");
const bookingRoutes = require("./bookings");
const chatRoutes = require("./chat");
const employeeRoutes = require("./employee");
const featureRoutes = require("./features");
const inquiryRoutes = require("./inquiries");
const invoiceRoutes = require("./invoices");
const projectRoutes = require("./projects");
const requestRoutes = require("./requests");
const reviewRoutes = require("./reviews");
const { getHealth } = require("../controllers/indexController");
const {
  authenticatedApiLimiter,
  chatLimiter
} = require("../middleware/rateLimit");

const router = express.Router();

router.get("/health", getHealth);
router.use("/auth", authRoutes);
router.use("/admin", authenticatedApiLimiter, adminRoutes);
router.use("/billing", billingRoutes);
router.use("/bookings", bookingRoutes);
router.use("/chat", chatLimiter, chatRoutes);
router.use("/employee", authenticatedApiLimiter, employeeRoutes);
router.use("/features", authenticatedApiLimiter, featureRoutes);
router.use("/inquiries", inquiryRoutes);
router.use("/invoices", authenticatedApiLimiter, invoiceRoutes);
router.use("/projects", authenticatedApiLimiter, projectRoutes);
router.use("/requests", authenticatedApiLimiter, requestRoutes);
router.use("/reviews", reviewRoutes);

module.exports = router;
