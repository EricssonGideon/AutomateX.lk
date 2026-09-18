const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  approveDraftLicence,
  checkLicenceReadiness,
  checkPackageReadiness,
  createDraftLicence,
  createDraftPackage,
  getLicence,
  getPackage,
  issueActivationCode,
  listActivationCodes,
  listLicences,
  listPackages,
  publishDraftPackage,
  revokeUnusedActivationCode,
  updateDraftLicence,
  updateDraftPackage
} = require("../controllers/posLicenceAdminController");
const {
  requireLicencePermission,
  verifyToken
} = require("../middleware/auth");

const router = express.Router();
const canViewLicences = requireLicencePermission("licences:view");
const canManageLicences = requireLicencePermission("licences:manage");
const actionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    return res.status(429).json({ message: "Too many POS licensing administration actions. Try again later." });
  }
});

router.use(verifyToken);

router.get("/packages", canViewLicences, listPackages);
router.post("/packages", canManageLicences, createDraftPackage);
router.get("/packages/:packageId", canViewLicences, getPackage);
router.patch("/packages/:packageId", canManageLicences, updateDraftPackage);
router.get("/packages/:packageId/readiness", canViewLicences, checkPackageReadiness);
router.post("/packages/:packageId/publish", actionRateLimit, canManageLicences, publishDraftPackage);

router.get("/licences", canViewLicences, listLicences);
router.post("/licences", canManageLicences, createDraftLicence);
router.get("/licences/:licenceId", canViewLicences, getLicence);
router.patch("/licences/:licenceId", canManageLicences, updateDraftLicence);
router.get("/licences/:licenceId/readiness", canViewLicences, checkLicenceReadiness);
router.post("/licences/:licenceId/approve", actionRateLimit, canManageLicences, approveDraftLicence);
router.get("/licences/:licenceId/activation-codes", canViewLicences, listActivationCodes);
router.post("/licences/:licenceId/activation-codes", actionRateLimit, canManageLicences, issueActivationCode);
router.post("/activation-codes/:activationCodeId/revoke-unused", actionRateLimit, canManageLicences, revokeUnusedActivationCode);

module.exports = router;
