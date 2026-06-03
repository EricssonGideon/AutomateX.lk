const mongoose = require("mongoose");

const Project = require("../models/Project");
const ProjectFile = require("../models/ProjectFile");
const { logAdminAction } = require("../utils/auditLog");
const { sendSuccess, sendError } = require("../utils/response");
const {
  MAX_PROJECT_FILE_SIZE,
  getExternalFileName,
  sanitizeFileName,
  saveProjectFile,
  sendStoredProjectFile,
  validateExternalFileUrl,
  validateProjectFileName
} = require("../utils/storage");

const PROJECT_FILE_TYPE_OPTIONS = ProjectFile.PROJECT_FILE_TYPE_OPTIONS;
const PROJECT_FILE_VISIBILITY_OPTIONS = ProjectFile.PROJECT_FILE_VISIBILITY_OPTIONS;

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEnum(value, options, fallback = "") {
  const normalized = cleanText(value, 100);
  return options.includes(normalized) ? normalized : fallback;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function normalizeProjectFilePayload(body) {
  const errors = [];
  const title = cleanText(body.title, 180);
  const description = cleanText(body.description, 2000);
  const fileType = normalizeEnum(body.fileType, PROJECT_FILE_TYPE_OPTIONS, "Other");
  const visibility = normalizeEnum(body.visibility, PROJECT_FILE_VISIBILITY_OPTIONS, "Admin Only");
  const fileUrl = cleanText(body.fileUrl, 1000);
  const fileContentBase64 = cleanText(body.fileContentBase64, MAX_PROJECT_FILE_SIZE * 2);
  let fileName = sanitizeFileName(body.fileName || "");

  if (!title) {
    errors.push("File title is required.");
  }

  if (fileUrl) {
    const urlError = validateExternalFileUrl(fileUrl);
    if (urlError) {
      errors.push(urlError);
    }
  }

  if (!fileUrl && !fileContentBase64) {
    errors.push("Add a file link or choose a file to upload.");
  }

  if (!fileName && fileUrl) {
    fileName = getExternalFileName(fileUrl, title);
  }

  if (!fileName && fileContentBase64) {
    errors.push("Uploaded files must include a file name.");
  }

  const fileNameError = validateProjectFileName(fileName, {
    mimeType: body.mimeType
  });
  if (fileNameError) {
    errors.push(fileNameError);
  }

  return {
    payload: {
      title,
      description,
      fileName,
      fileUrl,
      fileType,
      visibility,
      fileContentBase64,
      mimeType: cleanText(body.mimeType, 120)
    },
    errors
  };
}

function serializeProjectFile(file, role = "admin") {
  const fileId = String(file._id || file.id);
  const isClient = role === "client";

  return {
    id: fileId,
    projectId: String(file.projectId && file.projectId._id ? file.projectId._id : file.projectId || ""),
    clientId: String(file.clientId && file.clientId._id ? file.clientId._id : file.clientId || ""),
    title: file.title || "",
    description: file.description || "",
    fileName: file.fileName || "",
    fileUrl: file.fileUrl || "",
    downloadUrl: isClient ? `/api/projects/files/${fileId}/download` : `/api/admin/project-files/${fileId}/download`,
    fileType: file.fileType || "Other",
    visibility: file.visibility || "Admin Only",
    uploadedByRole: file.uploadedByRole || "",
    status: file.status || "Active",
    fileSize: file.fileSize || 0,
    mimeType: file.mimeType || "",
    createdAt: file.createdAt,
    updatedAt: file.updatedAt
  };
}

async function getProjectForAdmin(projectId) {
  if (!isValidObjectId(projectId)) {
    return null;
  }

  return Project.findOne({ _id: projectId, isArchived: false }).lean();
}

async function getProjectForClient(projectId, clientId) {
  if (!isValidObjectId(projectId)) {
    return null;
  }

  return Project.findOne({
    _id: projectId,
    clientId,
    isArchived: false
  }).lean();
}

async function listAdminProjectFiles(req, res) {
  try {
    const project = await getProjectForAdmin(req.params.projectId);
    if (!project) {
      return sendError(res, isValidObjectId(req.params.projectId) ? 404 : 400, "Project not found.");
    }

    const files = await ProjectFile.find({
      projectId: project._id,
      status: req.query.includeArchived === "true" ? { $in: ["Active", "Archived"] } : "Active"
    })
      .sort({ createdAt: -1 })
      .lean();

    return sendSuccess(res, 200, {
      files: files.map((file) => serializeProjectFile(file, "admin"))
    });
  } catch {
    return sendError(res, 500, "Unable to load project files right now.");
  }
}

async function createAdminProjectFile(req, res) {
  try {
    const project = await getProjectForAdmin(req.params.projectId);
    if (!project) {
      return sendError(res, isValidObjectId(req.params.projectId) ? 404 : 400, "Project not found.");
    }

    const { payload, errors } = normalizeProjectFilePayload(req.body);
    if (errors.length) {
      return sendError(res, 400, "Please fix the project file form and try again.", errors);
    }

    let storagePath = "";
    let storageDriver = "local";
    let fileSize = 0;

    if (payload.fileContentBase64) {
      const uploadResult = await saveProjectFile(payload);
      if (uploadResult.errors.length) {
        return sendError(res, 400, "Unable to accept this file upload.", uploadResult.errors);
      }
      storagePath = uploadResult.storagePath;
      storageDriver = uploadResult.storageDriver || "local";
      fileSize = uploadResult.fileSize;
    }

    const file = await ProjectFile.create({
      projectId: project._id,
      clientId: project.clientId,
      title: payload.title,
      description: payload.description,
      fileName: payload.fileName,
      fileUrl: payload.fileContentBase64 ? "" : payload.fileUrl,
      storagePath,
      storageDriver,
      mimeType: payload.mimeType,
      fileSize,
      fileType: payload.fileType,
      visibility: payload.visibility,
      uploadedBy: req.user.id,
      uploadedByRole: "Admin"
    });
    await logAdminAction(req, {
      module: "Files",
      action: "files.uploaded",
      targetType: "ProjectFile",
      targetId: String(file._id),
      targetLabel: file.title || file.fileName,
      newValue: serializeProjectFile(file.toObject(), "admin"),
      severity: "Medium"
    });

    return sendSuccess(res, 201, {
      message: "Project file added successfully.",
      file: serializeProjectFile(file.toObject(), "admin")
    });
  } catch {
    return sendError(res, 500, "Unable to add the project file right now.");
  }
}

async function archiveAdminProjectFile(req, res) {
  try {
    if (!isValidObjectId(req.params.fileId)) {
      return sendError(res, 400, "Invalid file ID.");
    }

    const file = await ProjectFile.findByIdAndUpdate(
      req.params.fileId,
      {
        status: "Archived",
        archivedAt: new Date(),
        archivedBy: req.user.id
      },
      { new: true }
    ).lean();

    if (!file) {
      return sendError(res, 404, "Project file not found.");
    }
    await logAdminAction(req, {
      module: "Files",
      action: "files.archived",
      targetType: "ProjectFile",
      targetId: String(file._id),
      targetLabel: file.title || file.fileName,
      newValue: serializeProjectFile(file, "admin"),
      severity: "High"
    });

    return sendSuccess(res, 200, {
      message: "Project file archived successfully.",
      file: serializeProjectFile(file, "admin")
    });
  } catch {
    return sendError(res, 500, "Unable to archive the project file right now.");
  }
}

async function updateAdminProjectFileVisibility(req, res) {
  try {
    if (!isValidObjectId(req.params.fileId)) {
      return sendError(res, 400, "Invalid file ID.");
    }

    const visibility = normalizeEnum(req.body.visibility, PROJECT_FILE_VISIBILITY_OPTIONS, "");
    if (!visibility) {
      return sendError(res, 400, "File visibility must be Admin Only or Client Visible.");
    }

    const previousFile = await ProjectFile.findOne({
      _id: req.params.fileId,
      status: "Active"
    }).lean();

    if (!previousFile) {
      return sendError(res, 404, "Project file not found.");
    }

    const file = await ProjectFile.findOneAndUpdate(
      {
        _id: req.params.fileId,
        status: "Active"
      },
      { visibility },
      { new: true }
    ).lean();
    await logAdminAction(req, {
      module: "Files",
      action: "files.visibility_updated",
      targetType: "ProjectFile",
      targetId: String(file._id),
      targetLabel: file.title || file.fileName,
      oldValue: { visibility: previousFile.visibility },
      newValue: { visibility: file.visibility },
      severity: "Medium"
    });

    return sendSuccess(res, 200, {
      message: "Project file visibility updated successfully.",
      file: serializeProjectFile(file, "admin")
    });
  } catch {
    return sendError(res, 500, "Unable to update the project file right now.");
  }
}

async function listClientProjectFiles(req, res) {
  try {
    const project = await getProjectForClient(req.params.projectId, req.user.id);
    if (!project) {
      return sendError(res, isValidObjectId(req.params.projectId) ? 404 : 400, "Project not found.");
    }

    const files = await ProjectFile.find({
      projectId: project._id,
      clientId: req.user.id,
      visibility: "Client Visible",
      status: "Active"
    })
      .sort({ createdAt: -1 })
      .lean();

    return sendSuccess(res, 200, {
      files: files.map((file) => serializeProjectFile(file, "client"))
    });
  } catch {
    return sendError(res, 500, "Unable to load project files right now.");
  }
}

async function downloadProjectFile(req, res, options = {}) {
  try {
    if (!isValidObjectId(req.params.fileId)) {
      return sendError(res, 400, "Invalid file ID.");
    }

    const match = {
      _id: req.params.fileId,
      status: "Active"
    };

    if (options.clientId) {
      match.clientId = options.clientId;
      match.visibility = "Client Visible";
    }

    const file = await ProjectFile.findOne(match).lean();
    if (!file) {
      return sendError(res, 404, "Project file not found.");
    }

    if (file.fileUrl) {
      if (req.user && req.user.role !== "client") {
        await logAdminAction(req, {
          module: "Files",
          action: "files.downloaded",
          targetType: "ProjectFile",
          targetId: String(file._id),
          targetLabel: file.title || file.fileName,
          newValue: {
            fileName: file.fileName || "",
            fileUrl: file.fileUrl || "",
            storageDriver: file.storageDriver || "",
            storage: "external-link"
          },
          severity: "Medium"
        });
      }
      return res.redirect(file.fileUrl);
    }

    if (req.user && req.user.role !== "client") {
      await logAdminAction(req, {
        module: "Files",
        action: "files.downloaded",
        targetType: "ProjectFile",
        targetId: String(file._id),
        targetLabel: file.title || file.fileName,
        newValue: {
          fileName: file.fileName || "",
          fileSize: file.fileSize || 0,
          storageDriver: file.storageDriver || "local",
          storage: file.storagePath ? "stored-file" : "missing"
        },
        severity: "Medium"
      });
    }

    return sendStoredProjectFile(res, file);
  } catch {
    return sendError(res, 500, "Unable to download the project file right now.");
  }
}

function downloadAdminProjectFile(req, res) {
  return downloadProjectFile(req, res);
}

function downloadClientProjectFile(req, res) {
  return downloadProjectFile(req, res, { clientId: req.user.id });
}

module.exports = {
  PROJECT_FILE_TYPE_OPTIONS,
  PROJECT_FILE_VISIBILITY_OPTIONS,
  normalizeProjectFilePayload,
  serializeProjectFile,
  listAdminProjectFiles,
  createAdminProjectFile,
  archiveAdminProjectFile,
  updateAdminProjectFileVisibility,
  listClientProjectFiles,
  downloadAdminProjectFile,
  downloadClientProjectFile
};
