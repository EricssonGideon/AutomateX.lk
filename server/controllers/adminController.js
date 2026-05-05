const mongoose = require("mongoose");

const User = require("../models/User");
const Booking = require("../models/Booking");
const Inquiry = require("../models/Inquiry");
const Review = require("../models/Review");
const { sendSuccess, sendError } = require("../utils/response");

const PLAN_PRICES = {
  starter: 49,
  standard: 99,
  pro: 199
};

/**
 * Creates a normalized month date range from the current time.
 *
 * @returns {{start: Date, end: Date}} The first moment of this month and next month.
 */
function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/**
 * Creates a normalized month date range from a `YYYY-MM` query string.
 *
 * @param {string} value - The month filter in `YYYY-MM` format.
 * @returns {{start: Date, end: Date}|null} The range or null if the value is invalid.
 */
function getMonthRangeFromString(value) {
  if (!/^\d{4}-\d{2}$/.test(value || "")) {
    return null;
  }

  const [year, month] = value.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

/**
 * Parses a boolean-ish string query param into a real boolean when provided.
 *
 * @param {string|undefined} value - The raw query string value.
 * @returns {boolean|undefined} Parsed boolean, or undefined if omitted.
 */
function parseBooleanFilter(value) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

/**
 * Builds a monthly revenue estimate using active client plan counts.
 *
 * @param {{starter: number, standard: number, pro: number}} planCounts - Active plan totals.
 * @returns {number} Estimated monthly recurring revenue.
 */
function estimateMonthlyRevenue(planCounts) {
  return (
    planCounts.starter * PLAN_PRICES.starter +
    planCounts.standard * PLAN_PRICES.standard +
    planCounts.pro * PLAN_PRICES.pro
  );
}

/**
 * Returns high-level dashboard totals for the admin overview cards.
 *
 * @param {import("express").Request} _req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Stats payload for the admin dashboard.
 */
async function getStats(_req, res) {
  try {
    const { start, end } = getCurrentMonthRange();

    const [
      totalClients,
      activeSubscriptions,
      bookingsThisMonth,
      inquiriesThisMonth,
      pendingReviews,
      activePlanCounts
    ] = await Promise.all([
      User.countDocuments({ role: "client" }),
      User.countDocuments({ role: "client", isActive: true }),
      Booking.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Inquiry.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Review.countDocuments({ status: "pending" }),
      User.aggregate([
        {
          $match: {
            role: "client",
            isActive: true
          }
        },
        {
          $group: {
            _id: "$plan",
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const planCounts = {
      starter: 0,
      standard: 0,
      pro: 0
    };

    activePlanCounts.forEach((row) => {
      if (row._id in planCounts) {
        planCounts[row._id] = row.count;
      }
    });

    return sendSuccess(res, 200, {
      totalClients,
      activeSubscriptions,
      totalBookingsThisMonth: bookingsThisMonth,
      totalInquiriesThisMonth: inquiriesThisMonth,
      totalReviewsPendingModeration: pendingReviews,
      monthlyRevenueEstimate: estimateMonthlyRevenue(planCounts),
      planCounts
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load admin stats right now.");
  }
}

/**
 * Returns a filtered client list with booking and inquiry counts for each client.
 *
 * @param {import("express").Request} req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Client list payload.
 */
async function getClients(req, res) {
  try {
    const match = { role: "client" };

    if (req.query.plan && ["starter", "standard", "pro"].includes(req.query.plan)) {
      match.plan = req.query.plan;
    }

    const isActive = parseBooleanFilter(req.query.isActive);
    if (typeof isActive === "boolean") {
      match.isActive = isActive;
    }

    if (req.query.search) {
      const searchPattern = new RegExp(req.query.search, "i");
      match.$or = [
        { name: searchPattern },
        { email: searchPattern }
      ];
    }

    const clients = await User.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "bookings",
          localField: "_id",
          foreignField: "clientId",
          as: "bookings"
        }
      },
      {
        $lookup: {
          from: "inquiries",
          localField: "_id",
          foreignField: "clientId",
          as: "inquiries"
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          plan: 1,
          isActive: 1,
          createdAt: 1,
          bookingCount: { $size: "$bookings" },
          inquiryCount: { $size: "$inquiries" }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    return sendSuccess(res, 200, { clients });
  } catch (_error) {
    return sendError(res, 500, "Unable to load clients right now.");
  }
}

/**
 * Returns one client profile plus the client's ten most recent bookings and inquiries.
 *
 * @param {import("express").Request} req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Client detail payload.
 */
async function getClientById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid client ID.");
    }

    const client = await User.findOne({
      _id: req.params.id,
      role: "client"
    }).lean();

    if (!client) {
      return sendError(res, 404, "Client not found.");
    }

    const [bookings, inquiries] = await Promise.all([
      Booking.find({ clientId: client._id }).sort({ createdAt: -1 }).limit(10).lean(),
      Inquiry.find({ clientId: client._id }).sort({ createdAt: -1 }).limit(10).lean()
    ]);

    return sendSuccess(res, 200, {
      client: {
        id: client._id,
        name: client.name,
        email: client.email,
        role: client.role,
        plan: client.plan,
        isActive: client.isActive,
        stripeCustomerId: client.stripeCustomerId,
        stripeSubscriptionId: client.stripeSubscriptionId,
        planExpiresAt: client.planExpiresAt,
        createdAt: client.createdAt
      },
      bookings,
      inquiries
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to load the client profile right now.");
  }
}

/**
 * Updates a client's editable admin fields.
 *
 * @param {import("express").Request} req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Updated client payload.
 */
async function updateClient(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid client ID.");
    }

    const updates = {};

    if (req.body.plan) {
      if (!["starter", "standard", "pro"].includes(req.body.plan)) {
        return sendError(res, 400, "Plan must be starter, standard, or pro.");
      }
      updates.plan = req.body.plan;
    }

    if (typeof req.body.isActive === "boolean") {
      updates.isActive = req.body.isActive;
    }

    const client = await User.findOneAndUpdate(
      { _id: req.params.id, role: "client" },
      updates,
      { new: true }
    ).lean();

    if (!client) {
      return sendError(res, 404, "Client not found.");
    }

    return sendSuccess(res, 200, {
      message: "Client updated successfully.",
      client
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the client right now.");
  }
}

/**
 * Soft-deletes a client by deactivating the account instead of removing it.
 *
 * @param {import("express").Request} req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Deactivation response.
 */
async function softDeleteClient(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid client ID.");
    }

    const client = await User.findOneAndUpdate(
      { _id: req.params.id, role: "client" },
      { isActive: false },
      { new: true }
    ).lean();

    if (!client) {
      return sendError(res, 404, "Client not found.");
    }

    return sendSuccess(res, 200, {
      message: "Client deactivated successfully.",
      client
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to deactivate the client right now.");
  }
}

/**
 * Returns all bookings across all tenants with optional client and booking-month filters.
 *
 * @param {import("express").Request} req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Booking list payload.
 */
async function getAdminBookings(req, res) {
  try {
    const query = {};

    if (req.query.clientId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.clientId)) {
        return sendError(res, 400, "Invalid client ID.");
      }
      query.clientId = req.query.clientId;
    }

    if (req.query.date) {
      if (!/^\d{4}-\d{2}$/.test(req.query.date)) {
        return sendError(res, 400, "Date filter must use YYYY-MM format.");
      }
      query.date = { $regex: `^${req.query.date}` };
    }

    const bookings = await Booking.find(query).sort({ createdAt: -1 }).lean();
    return sendSuccess(res, 200, { bookings });
  } catch (_error) {
    return sendError(res, 500, "Unable to load bookings right now.");
  }
}

/**
 * Returns all inquiries across all tenants, newest first.
 *
 * @param {import("express").Request} _req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Inquiry list payload.
 */
async function getAdminInquiries(_req, res) {
  try {
    const inquiries = await Inquiry.find({}).sort({ createdAt: -1 }).lean();
    return sendSuccess(res, 200, { inquiries });
  } catch (_error) {
    return sendError(res, 500, "Unable to load inquiries right now.");
  }
}

/**
 * Returns all reviews with pending items sorted to the top.
 *
 * @param {import("express").Request} _req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Review moderation payload.
 */
async function getAdminReviews(_req, res) {
  try {
    const reviews = await Review.find({})
      .sort({ status: 1, createdAt: -1 })
      .lean();

    reviews.sort((left, right) => {
      if (left.status === "pending" && right.status !== "pending") {
        return -1;
      }

      if (left.status !== "pending" && right.status === "pending") {
        return 1;
      }

      return new Date(right.createdAt) - new Date(left.createdAt);
    });

    return sendSuccess(res, 200, { reviews });
  } catch (_error) {
    return sendError(res, 500, "Unable to load reviews right now.");
  }
}

/**
 * Updates a review's moderation status.
 *
 * @param {import("express").Request} req - The incoming admin request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Updated review payload.
 */
async function updateAdminReview(req, res) {
  try {
    const status = String(req.body.status || "").trim();

    if (!["published", "hidden"].includes(status)) {
      return sendError(res, 400, "Review status must be either 'published' or 'hidden'.");
    }

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).lean();

    if (!review) {
      return sendError(res, 404, "Review not found.");
    }

    return sendSuccess(res, 200, {
      message: "Review updated successfully.",
      review
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to update the review right now.");
  }
}

module.exports = {
  getStats,
  getClients,
  getClientById,
  updateClient,
  softDeleteClient,
  getAdminBookings,
  getAdminInquiries,
  getAdminReviews,
  updateAdminReview
};
