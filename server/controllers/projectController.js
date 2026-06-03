const mongoose = require("mongoose");

const Project = require("../models/Project");
const ProjectFile = require("../models/ProjectFile");
const MaintenancePlan = require("../models/MaintenancePlan");
const User = require("../models/User");
const { serializeProjectFile } = require("./projectFileController");
const { serializeMaintenancePlan } = require("./maintenancePlanController");
const { resolveTrustedRole } = require("../utils/authRole");
const { logAdminAction } = require("../utils/auditLog");
const { sendSuccess, sendError } = require("../utils/response");

const PROJECT_TYPE_OPTIONS = Project.PROJECT_TYPE_OPTIONS;
const PROJECT_STATUS_OPTIONS = Project.PROJECT_STATUS_OPTIONS;
const PROJECT_PRIORITY_OPTIONS = Project.PROJECT_PRIORITY_OPTIONS;
const MILESTONE_STATUS_OPTIONS = Project.MILESTONE_STATUS_OPTIONS;
const DELIVERABLE_STATUS_OPTIONS = Project.DELIVERABLE_STATUS_OPTIONS;
const PROJECT_SORT_FIELDS = new Set(["createdAt", "expectedDeadline", "projectTitle", "status", "priority", "progressPercentage"]);

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

function normalizeProgress(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return 0;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
    return null;
  }

  return Math.round(numericValue);
}

function normalizeDate(value) {
  if (!value) {
    return null;
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

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchRegex(value) {
  const term = cleanText(value, 120);
  return term ? new RegExp(escapeRegExp(term), "i") : null;
}

async function findClientById(clientId) {
  if (!isValidObjectId(clientId)) {
    return null;
  }

  const client = await User.findOne({
    _id: clientId,
    isActive: true
  }).lean();

  if (!client || resolveTrustedRole(client) !== "client") {
    return null;
  }

  return client;
}

function normalizeMilestones(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((milestone) => {
      const title = cleanText(milestone && milestone.title, 160);
      const dueDate = normalizeDate(milestone && milestone.dueDate);
      const completedDate = normalizeDate(milestone && milestone.completedDate);

      if (!title || dueDate === undefined || completedDate === undefined) {
        return null;
      }

      return {
        title,
        description: cleanText(milestone && milestone.description, 2000),
        status: normalizeEnum(milestone && milestone.status, MILESTONE_STATUS_OPTIONS, "Pending"),
        dueDate,
        completedDate
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeDeliverables(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((deliverable) => {
      const title = cleanText(deliverable && deliverable.title, 160);
      const deliveredDate = normalizeDate(deliverable && deliverable.deliveredDate);

      if (!title || deliveredDate === undefined) {
        return null;
      }

      return {
        title,
        description: cleanText(deliverable && deliverable.description, 2000),
        status: normalizeEnum(deliverable && deliverable.status, DELIVERABLE_STATUS_OPTIONS, "Pending"),
        deliveredDate
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function buildProjectPayload(body, currentProject = null) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
  const payload = {};
  const errors = [];
  const title = cleanText(hasOwn("projectTitle") ? body.projectTitle : currentProject && currentProject.projectTitle, 180);
  const projectType = normalizeEnum(
    hasOwn("projectType") ? body.projectType : currentProject && currentProject.projectType,
    PROJECT_TYPE_OPTIONS,
    ""
  );
  const status = normalizeEnum(
    hasOwn("status") ? body.status : currentProject && currentProject.status,
    PROJECT_STATUS_OPTIONS,
    currentProject ? currentProject.status : "Planning"
  );
  const priority = normalizeEnum(
    hasOwn("priority") ? body.priority : currentProject && currentProject.priority,
    PROJECT_PRIORITY_OPTIONS,
    currentProject ? currentProject.priority : "Medium"
  );
  const totalAmount = normalizeMoney(hasOwn("totalAmount") ? body.totalAmount : currentProject && currentProject.totalAmount);
  const paidAmount = normalizeMoney(hasOwn("paidAmount") ? body.paidAmount : currentProject && currentProject.paidAmount);
  const progressPercentage = normalizeProgress(
    hasOwn("progressPercentage") ? body.progressPercentage : currentProject && currentProject.progressPercentage
  );

  if (!title) {
    errors.push("Project title is required.");
  }

  if (!projectType) {
    errors.push("Project type must match a supported AutomateX project type.");
  }

  if (!status) {
    errors.push("Project status must match a supported status.");
  }

  if (!priority) {
    errors.push("Project priority must be Low, Medium, High, or Urgent.");
  }

  if (totalAmount === null || paidAmount === null) {
    errors.push("Project amounts must be zero or greater.");
  } else if (paidAmount > totalAmount) {
    errors.push("Paid amount cannot exceed total amount.");
  }

  if (progressPercentage === null) {
    errors.push("Progress percentage must be between 0 and 100.");
  }

  ["startDate", "expectedDeadline", "completedDate"].forEach((field) => {
    if (hasOwn(field) || currentProject) {
      const normalizedDate = normalizeDate(hasOwn(field) ? body[field] : currentProject && currentProject[field]);
      if (normalizedDate === undefined) {
        errors.push(`${field} must be a valid date.`);
      } else {
        payload[field] = normalizedDate;
      }
    }
  });

  payload.projectTitle = title;
  payload.projectType = projectType;
  payload.packageName = cleanText(hasOwn("packageName") ? body.packageName : currentProject && currentProject.packageName, 100);
  payload.status = status;
  payload.priority = priority;
  payload.totalAmount = totalAmount === null ? 0 : totalAmount;
  payload.paidAmount = paidAmount === null ? 0 : paidAmount;
  payload.balanceAmount = Math.max(0, Number((payload.totalAmount - payload.paidAmount).toFixed(2)));
  payload.progressPercentage = progressPercentage === null ? 0 : progressPercentage;
  payload.description = cleanText(hasOwn("description") ? body.description : currentProject && currentProject.description, 5000);
  payload.requirements = cleanText(hasOwn("requirements") ? body.requirements : currentProject && currentProject.requirements, 8000);
  payload.adminNotes = cleanText(hasOwn("adminNotes") ? body.adminNotes : currentProject && currentProject.adminNotes, 8000);
  payload.clientNotes = cleanText(hasOwn("clientNotes") ? body.clientNotes : currentProject && currentProject.clientNotes, 5000);

  if (hasOwn("milestones")) {
    payload.milestones = normalizeMilestones(body.milestones);
  } else if (currentProject && Array.isArray(currentProject.milestones)) {
    payload.milestones = currentProject.milestones;
  }

  if (hasOwn("deliverables")) {
    payload.deliverables = normalizeDeliverables(body.deliverables);
  } else if (currentProject && Array.isArray(currentProject.deliverables)) {
    payload.deliverables = currentProject.deliverables;
  }

  return {
    payload,
    errors
  };
}

function serializeProject(project, options = {}) {
  const client = project.clientId && typeof project.clientId === "object" ? project.clientId : {};
  const base = {
    id: String(project._id || project.id),
    clientId: String(client._id || project.clientId || ""),
    clientName: client.name || project.clientName || "",
    clientEmail: client.email || project.clientEmail || "",
    clientBusinessName: client.businessName || project.clientBusinessName || "",
    projectTitle: project.projectTitle,
    projectType: project.projectType,
    packageName: project.packageName || "",
    status: project.status,
    priority: project.priority,
    startDate: project.startDate || null,
    expectedDeadline: project.expectedDeadline || null,
    completedDate: project.completedDate || null,
    totalAmount: project.totalAmount || 0,
    paidAmount: project.paidAmount || 0,
    balanceAmount: project.balanceAmount || 0,
    progressPercentage: project.progressPercentage || 0,
    description: project.description || "",
    requirements: project.requirements || "",
    clientNotes: project.clientNotes || "",
    milestones: Array.isArray(project.milestones) ? project.milestones : [],
    deliverables: Array.isArray(project.deliverables) ? project.deliverables : [],
    projectFiles: Array.isArray(project.projectFiles) ? project.projectFiles : [],
    maintenancePlans: Array.isArray(project.maintenancePlans) ? project.maintenancePlans : [],
    isArchived: Boolean(project.isArchived),
    archivedAt: project.archivedAt || null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };

  if (options.includeAdminFields) {
    base.adminNotes = project.adminNotes || "";
    base.createdBy = project.createdBy || null;
    base.updatedBy = project.updatedBy || null;
  }

  return base;
}

async function attachProjectRelations(projects, options = {}) {
  const projectList = Array.isArray(projects) ? projects : [projects];
  const projectIds = projectList.map((project) => project._id || project.id).filter(Boolean);

  if (!projectIds.length) {
    return Array.isArray(projects) ? [] : projects;
  }

  const fileMatch = {
    projectId: { $in: projectIds },
    status: "Active"
  };
  const maintenanceMatch = {
    projectId: { $in: projectIds }
  };

  if (options.clientId) {
    fileMatch.clientId = options.clientId;
    fileMatch.visibility = "Client Visible";
    maintenanceMatch.clientId = options.clientId;
  }

  const [files, maintenancePlans] = await Promise.all([
    ProjectFile.find(fileMatch).sort({ createdAt: -1 }).lean(),
    MaintenancePlan.find(maintenanceMatch)
      .populate("clientId", "name email businessName")
      .populate("projectId", "projectTitle")
      .sort({ renewalDate: 1, createdAt: -1 })
      .lean()
  ]);
  const filesByProject = files.reduce((collection, file) => {
    const key = String(file.projectId);
    collection[key] = collection[key] || [];
    collection[key].push(serializeProjectFile(file, options.clientId ? "client" : "admin"));
    return collection;
  }, {});
  const maintenanceByProject = maintenancePlans.reduce((collection, plan) => {
    const projectId = plan.projectId && typeof plan.projectId === "object" ? plan.projectId._id : plan.projectId;
    const key = String(projectId);
    collection[key] = collection[key] || [];
    collection[key].push(serializeMaintenancePlan(plan, { includeAdminFields: options.includeAdminFields }));
    return collection;
  }, {});
  const enrichedProjects = projectList.map((project) => ({
    ...project,
    projectFiles: filesByProject[String(project._id || project.id)] || [],
    maintenancePlans: maintenanceByProject[String(project._id || project.id)] || []
  }));

  return Array.isArray(projects) ? enrichedProjects : enrichedProjects[0];
}

async function getAdminProjects(req, res) {
  try {
    const match = { isArchived: req.query.includeArchived === "true" ? { $in: [true, false] } : false };

    if (req.query.clientId) {
      if (!isValidObjectId(req.query.clientId)) {
        return sendError(res, 400, "Invalid client filter.");
      }
      match.clientId = new mongoose.Types.ObjectId(req.query.clientId);
    }

    if (req.query.status && PROJECT_STATUS_OPTIONS.includes(req.query.status)) {
      match.status = req.query.status;
    }

    if (req.query.priority && PROJECT_PRIORITY_OPTIONS.includes(req.query.priority)) {
      match.priority = req.query.priority;
    }

    if (req.query.projectType && PROJECT_TYPE_OPTIONS.includes(req.query.projectType)) {
      match.projectType = req.query.projectType;
    }

    const searchPattern = buildSearchRegex(req.query.search);
    let searchMatch = null;
    if (searchPattern) {
      searchMatch = {
        $or: [
          { projectTitle: searchPattern },
          { projectType: searchPattern },
          { packageName: searchPattern },
          { description: searchPattern },
          { "client.name": searchPattern },
          { "client.email": searchPattern },
          { "client.businessName": searchPattern }
        ]
      };
    }

    const sortBy = PROJECT_SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : "createdAt";
    const sortDirection = getSortDirection(req.query.sortDirection);
    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "clientId",
          foreignField: "_id",
          as: "client"
        }
      },
      { $unwind: { path: "$client", preserveNullAndEmptyArrays: true } }
    ];

    if (searchMatch) {
      pipeline.push({ $match: searchMatch });
    }

    pipeline.push({ $sort: { [sortBy]: sortDirection } });

    const projects = await Project.aggregate(pipeline);

    return sendSuccess(res, 200, {
      projects: projects.map((project) => serializeProject({
        ...project,
        clientId: project.client || project.clientId
      }, { includeAdminFields: true }))
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load projects right now.");
  }
}

async function createAdminProject(req, res) {
  try {
    const client = await findClientById(req.body.clientId);
    if (!client) {
      return sendError(res, 400, "Select a valid active client before creating a project.");
    }

    const { payload, errors } = buildProjectPayload(req.body);
    if (errors.length) {
      return sendError(res, 400, "Please fix the project form and try again.", errors);
    }

    const project = await Project.create({
      ...payload,
      clientId: client._id,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });
    const populatedProject = await Project.findById(project._id).populate("clientId", "name email businessName").lean();
    await logAdminAction(req, {
      module: "Projects",
      action: "projects.created",
      targetType: "Project",
      targetId: String(project._id),
      targetLabel: project.projectTitle,
      newValue: serializeProject(populatedProject, { includeAdminFields: true }),
      severity: "Medium"
    });

    return sendSuccess(res, 201, {
      message: "Project created successfully.",
      project: serializeProject(populatedProject, { includeAdminFields: true })
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to create the project right now.");
  }
}

async function getAdminProjectById(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid project ID.");
    }

    const project = await Project.findById(req.params.id).populate("clientId", "name email businessName").lean();
    if (!project || project.isArchived) {
      return sendError(res, 404, "Project not found.");
    }

    const enrichedProject = await attachProjectRelations(project, { includeAdminFields: true });

    return sendSuccess(res, 200, {
      project: serializeProject(enrichedProject, { includeAdminFields: true })
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load the project right now.");
  }
}

async function updateAdminProject(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid project ID.");
    }

    const project = await Project.findById(req.params.id);
    if (!project || project.isArchived) {
      return sendError(res, 404, "Project not found.");
    }
    const oldValue = project.toObject();

    if (req.body.clientId && String(req.body.clientId) !== String(project.clientId)) {
      const client = await findClientById(req.body.clientId);
      if (!client) {
        return sendError(res, 400, "Select a valid active client for this project.");
      }
      project.clientId = client._id;
    }

    const { payload, errors } = buildProjectPayload(req.body, project.toObject());
    if (errors.length) {
      return sendError(res, 400, "Please fix the project form and try again.", errors);
    }

    Object.assign(project, payload, {
      updatedBy: req.user.id
    });
    await project.save();

    const populatedProject = await Project.findById(project._id).populate("clientId", "name email businessName").lean();
    await logAdminAction(req, {
      module: "Projects",
      action: req.auditAction || "projects.updated",
      targetType: "Project",
      targetId: String(project._id),
      targetLabel: project.projectTitle,
      oldValue,
      newValue: serializeProject(populatedProject, { includeAdminFields: true }),
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Project updated successfully.",
      project: serializeProject(populatedProject, { includeAdminFields: true })
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the project right now.");
  }
}

async function archiveAdminProject(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid project ID.");
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      {
        isArchived: true,
        archivedAt: new Date(),
        updatedBy: req.user.id
      },
      { new: true }
    ).populate("clientId", "name email businessName").lean();

    if (!project) {
      return sendError(res, 404, "Project not found.");
    }
    await logAdminAction(req, {
      module: "Projects",
      action: "projects.archived",
      targetType: "Project",
      targetId: String(project._id),
      targetLabel: project.projectTitle,
      newValue: serializeProject(project, { includeAdminFields: true }),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Project archived successfully.",
      project: serializeProject(project, { includeAdminFields: true })
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to archive the project right now.");
  }
}

async function updateAdminProjectStatus(req, res) {
  req.auditAction = "projects.status_updated";
  const nextBody = {
    status: req.body.status
  };

  if (typeof req.body.progressPercentage !== "undefined") {
    nextBody.progressPercentage = req.body.progressPercentage;
  }

  req.body = nextBody;
  return updateAdminProject(req, res);
}

async function updateAdminProjectProgress(req, res) {
  req.auditAction = "projects.progress_updated";
  const nextBody = {
    progressPercentage: req.body.progressPercentage
  };

  if (typeof req.body.status !== "undefined") {
    nextBody.status = req.body.status;
  }

  req.body = nextBody;
  return updateAdminProject(req, res);
}

async function updateAdminProjectMilestones(req, res) {
  req.body = {
    milestones: req.body.milestones
  };
  return updateAdminProject(req, res);
}

async function updateAdminProjectDeliverables(req, res) {
  req.body = {
    deliverables: req.body.deliverables
  };
  return updateAdminProject(req, res);
}

async function getClientProjects(req, res) {
  try {
    const projects = await Project.find({
      clientId: req.user.id,
      isArchived: false
    })
      .sort({ createdAt: -1 })
      .lean();

    const enrichedProjects = await attachProjectRelations(projects, { clientId: req.user.id });

    return sendSuccess(res, 200, {
      projects: enrichedProjects.map((project) => serializeProject(project))
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load your projects right now.");
  }
}

async function getClientProjectById(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid project ID.");
    }

    const project = await Project.findOne({
      _id: req.params.id,
      clientId: req.user.id,
      isArchived: false
    }).lean();

    if (!project) {
      return sendError(res, 404, "Project not found.");
    }

    const enrichedProject = await attachProjectRelations(project, { clientId: req.user.id });

    return sendSuccess(res, 200, {
      project: serializeProject(enrichedProject)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load the project right now.");
  }
}

module.exports = {
  PROJECT_TYPE_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  MILESTONE_STATUS_OPTIONS,
  DELIVERABLE_STATUS_OPTIONS,
  getAdminProjects,
  createAdminProject,
  getAdminProjectById,
  updateAdminProject,
  archiveAdminProject,
  updateAdminProjectStatus,
  updateAdminProjectProgress,
  updateAdminProjectMilestones,
  updateAdminProjectDeliverables,
  getClientProjects,
  getClientProjectById
};
