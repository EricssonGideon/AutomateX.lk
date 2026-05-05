const express = require("express");

const {
  getStats,
  getClients,
  getClientById,
  updateClient,
  softDeleteClient,
  getAdminBookings,
  getAdminInquiries,
  getAdminReviews,
  updateAdminReview
} = require("../controllers/adminController");
const { verifyToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/stats", getStats);
router.get("/clients", getClients);
router.get("/clients/:id", getClientById);
router.patch("/clients/:id", updateClient);
router.delete("/clients/:id", softDeleteClient);
router.get("/bookings", getAdminBookings);
router.get("/inquiries", getAdminInquiries);
router.get("/reviews", getAdminReviews);
router.patch("/reviews/:id", updateAdminReview);

module.exports = router;
