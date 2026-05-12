const express = require("express");

const { getClientInvoices } = require("../controllers/invoiceController");
const { verifyToken, requireClient, requireActiveAccount } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken, requireClient, requireActiveAccount);
router.get("/", getClientInvoices);

module.exports = router;
