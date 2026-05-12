const express = require("express");

const {
  getClientRequests,
  createClientRequest,
  updateClientRequest
} = require("../controllers/requestController");
const { verifyToken, requireClient, requireActiveAccount } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken, requireClient, requireActiveAccount);
router.get("/", getClientRequests);
router.post("/", createClientRequest);
router.patch("/:id", updateClientRequest);

module.exports = router;
