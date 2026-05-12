const express = require("express");

const authRoutes = require("./auth");
const adminRoutes = require("./admin");
const billingRoutes = require("./billing");
const bookingRoutes = require("./bookings");
const chatRoutes = require("./chat");
const featureRoutes = require("./features");
const inquiryRoutes = require("./inquiries");
const invoiceRoutes = require("./invoices");
const requestRoutes = require("./requests");
const reviewRoutes = require("./reviews");
const { getHealth } = require("../controllers/indexController");

const router = express.Router();

router.get("/health", getHealth);
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/billing", billingRoutes);
router.use("/bookings", bookingRoutes);
router.use("/chat", chatRoutes);
router.use("/features", featureRoutes);
router.use("/inquiries", inquiryRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/requests", requestRoutes);
router.use("/reviews", reviewRoutes);

module.exports = router;
