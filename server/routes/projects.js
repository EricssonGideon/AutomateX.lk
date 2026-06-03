const express = require("express");

const {
  getClientProjects,
  getClientProjectById
} = require("../controllers/projectController");
const {
  listClientProjectFiles,
  downloadClientProjectFile
} = require("../controllers/projectFileController");
const {
  getClientMaintenancePlans
} = require("../controllers/maintenancePlanController");
const { verifyToken, requireClient, requireActiveAccount } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken, requireClient, requireActiveAccount);
router.get("/", getClientProjects);
router.get("/maintenance-plans", getClientMaintenancePlans);
router.get("/files/:fileId/download", downloadClientProjectFile);
router.get("/:projectId/files", listClientProjectFiles);
router.get("/:projectId/maintenance-plans", getClientMaintenancePlans);
router.get("/:id", getClientProjectById);

module.exports = router;
