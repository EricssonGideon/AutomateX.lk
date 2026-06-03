const mongoose = require("mongoose");

const MaintenancePlan = require("../models/MaintenancePlan");
const Project = require("../models/Project");
const { logAdminAction } = require("../utils/auditLog");
const { sendSuccess, sendError } = require("../utils/response");

const MAINTENANCE_PLAN_TYPE_OPTIONS = MaintenancePlan.MAINTENANCE_PLAN_TYPE_OPTIONS;
const MAINTENANCE_STATUS_OPTIONS = MaintenancePlan.MAINTENANCE_STATUS_OPTIONS;
const MAINTENANCE_PAYMENT_STATUS_OPTIONS = MaintenancePlan.MAINTENANCE_PAYMENT_STATUS_OPTIONS;
const MAINTENANCE_SORT_FIELDS = new Set(["createdAt", "renewalDate", "status", "paymentStatus", "planName"]);

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEnum(value, options, fallback = "") {
  const normalized = cleanText(value, 100);
  return options.includes(normalized) ? normalized : fallback;
}

function normalizeMoney(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return 0;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  return Number(numericValue.toFixed(2));
}

function normalizeDate(value, options = {}) {
  if (!value) {
    return options.required ? undefined : null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function getSortDirection(value) {
  return value === "asc" ? 1 : -1;
}

function isExpiringSoon(plan) {
  if (!plan || !plan.renewalDate || plan.status !== "Active") {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewalDate = new Date(plan.renewalDate);
  renewalDate.setHours(0, 0, 0, 0);
  const daysUntilRenewal = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  return daysUntilRenewal >= 0 && daysUntilRenewal <= 30;
}

function serializeMaintenancePlan(plan, options = {}) {
  const client = plan.clientId && typeof plan.clientId === "object" ? plan.clientId : {};
  const project = plan.projectId && typeof plan.projectId === "object" ? plan.projectId : {};
  const status = isExpiringSoon(plan) ? "Expiring Soon" : plan.status;
  const base = {
    id: String(plan._id || plan.id),
    clientId: String(client._id || plan.clientId || ""),
    clientName: client.name || plan.clientName || "",
    clientEmail: client.email || plan.clientEmail || "",
    clientBusinessName: client.businessName || plan.clientBusinessName || "",
    projectId: String(project._id || plan.projectId || ""),
    projectTitle: project.projectTitle || plan.projectTitle || "",
    planName: plan.planName || "",
    planType: plan.planType || "Monthly",
    status,
    startDate: plan.startDate || null,
    endDate: plan.endDate || null,
    renewalDate: plan.renewalDate || null,
    amount: plan.amount || 0,
    paidAmount: plan.paidAmount || 0,
    balanceAmount: plan.balanceAmount || 0,
    paymentStatus: plan.paymentStatus || "Pending",
    includedServices: Array.isArray(plan.includedServices) ? plan.includedServices : [],
    notes: plan.notes || "",
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  };

  if (options.includeAdminFields) {
    base.adminNotes = plan.adminNotes || "";
    base.createdBy = plan.createdBy || null;
    base.updatedBy = plan.updatedBy || null;
  }

  return base;
}

function normalizeIncludedServices(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((service) => {
      const serviceName = cleanText(service && service.serviceName, 160);

      if (!serviceName) {
        return null;
      }

      return {
        serviceName,
        description: cleanText(service && service.description, 1000)
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function buildMaintenancePayload(body, currentPlan = null) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
  const payload = {};
  const errors = [];
  const planName = cleanText(hasOwn("planName") ? body.planName : currentPlan && currentPlan.planName, 180);
  const planType = normalizeEnum(
    hasOwn("planType") ? body.planType : currentPlan && currentPlan.planType,
    MAINTENANCE_PLAN_TYPE_OPTIONS,
    currentPlan ? currentPlan.planType : "Monthly"
  );
  const status = normalizeEnum(
    hasOwn("status") ? body.status : currentPlan && currentPlan.status,
    MAINTENANCE_STATUS_OPTIONS,
    currentPlan ? currentPlan.status : "Pending"
  );
  const paymentStatus = normalizeEnum(
    hasOwn("paymentStatus") ? body.paymentStatus : currentPlan && currentPlan.paymentStatus,
    MAINTENANCE_PAYMENT_STATUS_OPTIONS,
    currentPlan ? currentPlan.paymentStatus : "Pending"
  );
  const amount = normalizeMoney(hasOwn("amount") ? body.amount : currentPlan && currentPlan.amount);
  const paidAmount = normalizeMoney(hasOwn("paidAmount") ? body.paidAmount : currentPlan && currentPlan.paidAmount);

  if (!planName) {
    errors.push("Plan name is required.");
  }

  if (!planType) {
    errors.push("Plan type must be Monthly, Quarterly, Yearly, One Time, or Custom.");
  }

  if (!status) {
    errors.push("Maintenance status must match a supported status.");
  }

  if (!paymentStatus) {
    errors.push("Payment status must match a supported status.");
  }

  if (amount === null || paidAmount === null) {
    errors.push("Maintenance amounts must be zero or greater.");
  } else if (paidAmount > amount) {
    errors.push("Paid amount cannot exceed plan amount.");
  }

  ["startDate", "endDate", "renewalDate"].forEach((field) => {
    if (hasOwn(field) || currentPlan || field === "startDate") {
      const normalizedDate = normalizeDate(hasOwn(field) ? body[field] : currentPlan && currentPlan[field], {
        required: field === "startDate"
      });
      if (normalizedDate === undefined) {
        errors.push(`${field} must be a valid date.`);
      } else {
        payload[field] = normalizedDate;
      }
    }
  });

  payload.planName = planName;
  payload.planType = planType;
  payload.status = status;
  payload.amount = amount === null ? 0 : amount;
  payload.paidAmount = paidAmount === null ? 0 : paidAmount;
  payload.balanceAmount = Math.max(0, Number((payload.amount - payload.paidAmount).toFixed(2)));
  payload.paymentStatus = paymentStatus;
  payload.notes = cleanText(hasOwn("notes") ? body.notes : currentPlan && currentPlan.notes, 5000);
  payload.adminNotes = cleanText(hasOwn("adminNotes") ? body.adminNotes : currentPlan && currentPlan.adminNotes, 8000);

  if (hasOwn("includedServices")) {
    payload.includedServices = normalizeIncludedServices(body.includedServices);
  } else if (currentPlan && Array.isArray(currentPlan.includedServices)) {
    payload.includedServices = currentPlan.includedServices;
  }

  return {
    payload,
    errors
  };
}

async function findActiveProject(projectId) {
  if (!isValidObjectId(projectId)) {
    return null;
  }

  return Project.findOne({ _id: projectId, isArchived: false }).lean();
}

async function getAdminMaintenancePlans(req, res) {
  try {
    const match = {};

    if (req.query.status && MAINTENANCE_STATUS_OPTIONS.includes(req.query.status)) {
      if (req.query.status === "Expiring Soon") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const soon = new Date(today);
        soon.setDate(today.getDate() + 30);
        match.status = "Active";
        match.renewalDate = { $gte: today, $lte: soon };
      } else {
        match.status = req.query.status;
      }
    }

    if (req.query.paymentStatus && MAINTENANCE_PAYMENT_STATUS_OPTIONS.includes(req.query.paymentStatus)) {
      match.paymentStatus = req.query.paymentStatus;
    }

    if (req.query.clientId) {
      if (!isValidObjectId(req.query.clientId)) {
        return sendError(res, 400, "Invalid client filter.");
      }
      match.clientId = new mongoose.Types.ObjectId(req.query.clientId);
    }

    const projectIdFilter = req.params.projectId || req.query.projectId;
    if (projectIdFilter) {
      if (!isValidObjectId(projectIdFilter)) {
        return sendError(res, 400, "Invalid project filter.");
      }
      match.projectId = new mongoose.Types.ObjectId(projectIdFilter);
    }

    const renewalDate = {};
    const renewalFrom = normalizeDate(req.query.renewalFrom);
    const renewalTo = normalizeDate(req.query.renewalTo);

    if (renewalFrom === undefined || renewalTo === undefined) {
      return sendError(res, 400, "Renewal date filters must be valid dates.");
    }

    if (renewalFrom) {
      renewalDate.$gte = renewalFrom;
    }
    if (renewalTo) {
      renewalDate.$lte = renewalTo;
    }
    if (Object.keys(renewalDate).length) {
      match.renewalDate = {
        ...(match.renewalDate || {}),
        ...renewalDate
      };
    }

    const sortBy = MAINTENANCE_SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : "renewalDate";
    const sortDirection = getSortDirection(req.query.sortDirection);
    const plans = await MaintenancePlan.find(match)
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .sort({ [sortBy]: sortDirection, createdAt: -1 })
      .lean();

    return sendSuccess(res, 200, {
      maintenancePlans: plans.map((plan) => serializeMaintenancePlan(plan, { includeAdminFields: true }))
    });
  } catch {
    return sendError(res, 500, "Unable to load maintenance plans right now.");
  }
}

async function getAdminMaintenancePlanById(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid maintenance plan ID.");
    }

    const plan = await MaintenancePlan.findById(req.params.id)
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .lean();

    if (!plan) {
      return sendError(res, 404, "Maintenance plan not found.");
    }

    return sendSuccess(res, 200, {
      maintenancePlan: serializeMaintenancePlan(plan, { includeAdminFields: true })
    });
  } catch {
    return sendError(res, 500, "Unable to load the maintenance plan right now.");
  }
}

async function createAdminMaintenancePlan(req, res) {
  try {
    const project = await findActiveProject(req.body.projectId);
    if (!project) {
      return sendError(res, isValidObjectId(req.body.projectId) ? 404 : 400, "Select a valid active project for this maintenance plan.");
    }

    if (req.body.clientId && String(req.body.clientId) !== String(project.clientId)) {
      return sendError(res, 400, "Selected client must match the selected project.");
    }

    const { payload, errors } = buildMaintenancePayload(req.body);
    if (errors.length) {
      return sendError(res, 400, "Please fix the maintenance plan form and try again.", errors);
    }

    const plan = await MaintenancePlan.create({
      ...payload,
      clientId: project.clientId,
      projectId: project._id,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });
    const populatedPlan = await MaintenancePlan.findById(plan._id)
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .lean();
    await logAdminAction(req, {
      module: "Maintenance",
      action: "maintenance.created",
      targetType: "MaintenancePlan",
      targetId: String(plan._id),
      targetLabel: plan.planName,
      newValue: serializeMaintenancePlan(populatedPlan, { includeAdminFields: true }),
      severity: "Medium"
    });

    return sendSuccess(res, 201, {
      message: "Maintenance plan created successfully.",
      maintenancePlan: serializeMaintenancePlan(populatedPlan, { includeAdminFields: true })
    });
  } catch {
    return sendError(res, 500, "Unable to create the maintenance plan right now.");
  }
}

async function updateAdminMaintenancePlan(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid maintenance plan ID.");
    }

    const plan = await MaintenancePlan.findById(req.params.id);
    if (!plan) {
      return sendError(res, 404, "Maintenance plan not found.");
    }
    const oldValue = plan.toObject();

    if (req.body.projectId && String(req.body.projectId) !== String(plan.projectId)) {
      const project = await findActiveProject(req.body.projectId);
      if (!project) {
        return sendError(res, isValidObjectId(req.body.projectId) ? 404 : 400, "Select a valid active project for this maintenance plan.");
      }
      plan.projectId = project._id;
      plan.clientId = project.clientId;
    }

    const { payload, errors } = buildMaintenancePayload(req.body, plan.toObject());
    if (errors.length) {
      return sendError(res, 400, "Please fix the maintenance plan form and try again.", errors);
    }

    Object.assign(plan, payload, {
      updatedBy: req.user.id
    });
    await plan.save();

    const populatedPlan = await MaintenancePlan.findById(plan._id)
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .lean();
    await logAdminAction(req, {
      module: "Maintenance",
      action: req.auditAction || "maintenance.updated",
      targetType: "MaintenancePlan",
      targetId: String(plan._id),
      targetLabel: plan.planName,
      oldValue,
      newValue: serializeMaintenancePlan(populatedPlan, { includeAdminFields: true }),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Maintenance plan updated successfully.",
      maintenancePlan: serializeMaintenancePlan(populatedPlan, { includeAdminFields: true })
    });
  } catch {
    return sendError(res, 500, "Unable to update the maintenance plan right now.");
  }
}

async function updateMaintenanceStatus(req, res, status, message) {
  req.body = {
    ...req.body,
    status
  };

  await updateAdminMaintenancePlan(req, res);

  if (!res.headersSent) {
    return sendSuccess(res, 200, { message });
  }

  return undefined;
}

async function renewAdminMaintenancePlan(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid maintenance plan ID.");
    }

    const plan = await MaintenancePlan.findById(req.params.id);
    if (!plan) {
      return sendError(res, 404, "Maintenance plan not found.");
    }
    const oldValue = plan.toObject();

    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key);
    const startDate = hasOwn("startDate") ? normalizeDate(req.body.startDate) : plan.startDate;
    const endDate = hasOwn("endDate") ? normalizeDate(req.body.endDate) : plan.endDate;
    const renewalDate = hasOwn("renewalDate") ? normalizeDate(req.body.renewalDate) : plan.renewalDate;

    if (endDate === undefined || renewalDate === undefined) {
      return sendError(res, 400, "Renewal dates must be valid.");
    }

    plan.startDate = startDate;
    plan.endDate = endDate;
    plan.renewalDate = renewalDate;
    plan.status = "Active";
    plan.updatedBy = req.user.id;
    await plan.save();

    const populatedPlan = await MaintenancePlan.findById(plan._id)
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .lean();
    await logAdminAction(req, {
      module: "Maintenance",
      action: "maintenance.renewed",
      targetType: "MaintenancePlan",
      targetId: String(plan._id),
      targetLabel: plan.planName,
      oldValue,
      newValue: serializeMaintenancePlan(populatedPlan, { includeAdminFields: true }),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Maintenance plan renewed successfully.",
      maintenancePlan: serializeMaintenancePlan(populatedPlan, { includeAdminFields: true })
    });
  } catch {
    return sendError(res, 500, "Unable to renew the maintenance plan right now.");
  }
}

function expireAdminMaintenancePlan(req, res) {
  req.auditAction = "maintenance.expired";
  return updateMaintenanceStatus(req, res, "Expired", "Maintenance plan marked as expired.");
}

function cancelAdminMaintenancePlan(req, res) {
  req.auditAction = "maintenance.cancelled";
  return updateMaintenanceStatus(req, res, "Cancelled", "Maintenance plan marked as cancelled.");
}

async function getClientMaintenancePlans(req, res) {
  try {
    const match = { clientId: req.user.id };

    if (req.params.projectId) {
      if (!isValidObjectId(req.params.projectId)) {
        return sendError(res, 400, "Invalid project ID.");
      }
      match.projectId = req.params.projectId;
    }

    const plans = await MaintenancePlan.find(match)
      .populate("projectId", "projectTitle")
      .sort({ renewalDate: 1, createdAt: -1 })
      .lean();

    return sendSuccess(res, 200, {
      maintenancePlans: plans.map((plan) => serializeMaintenancePlan(plan))
    });
  } catch {
    return sendError(res, 500, "Unable to load maintenance plans right now.");
  }
}

module.exports = {
  MAINTENANCE_PLAN_TYPE_OPTIONS,
  MAINTENANCE_STATUS_OPTIONS,
  MAINTENANCE_PAYMENT_STATUS_OPTIONS,
  serializeMaintenancePlan,
  getAdminMaintenancePlans,
  getAdminMaintenancePlanById,
  createAdminMaintenancePlan,
  updateAdminMaintenancePlan,
  renewAdminMaintenancePlan,
  expireAdminMaintenancePlan,
  cancelAdminMaintenancePlan,
  getClientMaintenancePlans
};
