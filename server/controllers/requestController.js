const mongoose = require("mongoose");

const SupportRequest = require("../models/SupportRequest");
const User = require("../models/User");
const {
  REQUEST_TYPE_OPTIONS,
  REQUEST_PRIORITY_OPTIONS,
  REQUEST_STATUS_OPTIONS,
  REQUEST_TERMINAL_STATUSES,
  normalizeRequestText,
  normalizeRequestType,
  normalizeRequestPriority,
  normalizeRequestStatus,
  normalizeRequestedPackage,
  applyResolvedTimestamp,
  serializeSupportRequest
} = require("../utils/supportRequest");
const { sendSuccess, sendError } = require("../utils/response");

async function getClientRequests(req, res) {
  try {
    const requests = await SupportRequest.find({ clientId: req.user.id }).sort({ createdAt: -1 }).lean();

    return sendSuccess(res, 200, {
      requests: requests.map((request) => serializeSupportRequest(request))
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load your requests right now.");
  }
}

async function createClientRequest(req, res) {
  try {
    const client = await User.findById(req.user.id).lean();
    if (!client) {
      return sendError(res, 404, "Client account not found.");
    }

    const type = normalizeRequestType(req.body.type);
    const priority = normalizeRequestPriority(req.body.priority);
    const requestedPackage = type === "upgrade"
      ? normalizeRequestedPackage(req.body.requestedPackage)
      : null;
    const subject = normalizeRequestText(req.body.subject, 200);
    const message = normalizeRequestText(req.body.message, 5000);

    if (!REQUEST_TYPE_OPTIONS.includes(type)) {
      return sendError(res, 400, "Request type is not supported.");
    }

    if (!REQUEST_PRIORITY_OPTIONS.includes(priority)) {
      return sendError(res, 400, "Priority must be low, normal, high, or urgent.");
    }

    if (!subject) {
      return sendError(res, 400, "Request subject is required.");
    }

    if (!message) {
      return sendError(res, 400, "Request message is required.");
    }

    if (type === "upgrade" && !requestedPackage) {
      return sendError(res, 400, "Select the package you want to request.");
    }

    const request = await SupportRequest.create({
      clientId: client._id,
      clientName: client.name || client.businessName || "Client",
      clientEmail: client.email || "",
      businessName: client.businessName || client.name || "",
      type,
      requestedPackage,
      subject,
      message,
      priority,
      status: "open"
    });

    return sendSuccess(res, 201, {
      message: type === "upgrade"
        ? "Upgrade request sent successfully. AutomateX will review it manually."
        : "Support request sent successfully.",
      request: serializeSupportRequest(request)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to send your request right now.");
  }
}

async function updateClientRequest(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid request ID.");
    }

    const request = await SupportRequest.findOne({
      _id: req.params.id,
      clientId: req.user.id
    });

    if (!request) {
      return sendError(res, 404, "Request not found.");
    }

    if (REQUEST_TERMINAL_STATUSES.includes(request.status)) {
      return sendError(res, 400, "Closed, resolved, or rejected requests cannot be updated.");
    }

    if (typeof req.body.adminNote !== "undefined") {
      return sendError(res, 403, "Clients cannot update admin notes.");
    }

    const wantsClose = typeof req.body.status !== "undefined";
    if (wantsClose) {
      const requestedStatus = normalizeRequestStatus(req.body.status);
      if (requestedStatus !== "closed" || !REQUEST_STATUS_OPTIONS.includes(requestedStatus)) {
        return sendError(res, 400, "Clients can only close their own requests.");
      }
      request.status = "closed";
      applyResolvedTimestamp(request, request.status);
    }

    const isEditingContent = ["type", "requestedPackage", "subject", "message", "priority"].some((field) =>
      typeof req.body[field] !== "undefined"
    );

    if (isEditingContent && request.status !== "open") {
      return sendError(res, 400, "Only open requests can be edited. In-progress requests can only be closed.");
    }

    if (typeof req.body.type !== "undefined") {
      request.type = normalizeRequestType(req.body.type);
    }

    if (typeof req.body.priority !== "undefined") {
      request.priority = normalizeRequestPriority(req.body.priority);
    }

    if (typeof req.body.subject !== "undefined") {
      request.subject = normalizeRequestText(req.body.subject, 200);
      if (!request.subject) {
        return sendError(res, 400, "Request subject is required.");
      }
    }

    if (typeof req.body.message !== "undefined") {
      request.message = normalizeRequestText(req.body.message, 5000);
      if (!request.message) {
        return sendError(res, 400, "Request message is required.");
      }
    }

    if (request.type === "upgrade") {
      if (typeof req.body.requestedPackage !== "undefined") {
        request.requestedPackage = normalizeRequestedPackage(req.body.requestedPackage);
      }

      if (!request.requestedPackage) {
        return sendError(res, 400, "Upgrade requests must include the requested package.");
      }
    } else {
      request.requestedPackage = null;
    }

    await request.save();

    return sendSuccess(res, 200, {
      message: request.status === "closed"
        ? "Request closed successfully."
        : "Request updated successfully.",
      request: serializeSupportRequest(request)
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update your request right now.");
  }
}

module.exports = {
  getClientRequests,
  createClientRequest,
  updateClientRequest
};
