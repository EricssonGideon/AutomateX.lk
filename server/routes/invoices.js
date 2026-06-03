const express = require("express");

const { getClientInvoices, downloadClientInvoicePdf } = require("../controllers/invoiceController");
const { verifyToken, requireClient, requireActiveAccount } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken, requireClient, requireActiveAccount);
router.get("/", getClientInvoices);
router.get("/:id/pdf", downloadClientInvoicePdf);

module.exports = router;
