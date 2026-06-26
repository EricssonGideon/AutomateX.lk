const express = require("express");

const {
  getEmployeeDashboard,
  getEmployeeLeads,
  createEmployeeLead,
  updateEmployeeLead,
  submitEmployeeLeadForApproval
} = require("../controllers/employeeController");
const { verifyToken, requireEmployee } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken, requireEmployee);

router.get("/dashboard", getEmployeeDashboard);
router.get("/leads", getEmployeeLeads);
router.post("/leads", createEmployeeLead);
router.patch("/leads/:id", updateEmployeeLead);
router.patch("/leads/:id/submit-approval", submitEmployeeLeadForApproval);

module.exports = router;
