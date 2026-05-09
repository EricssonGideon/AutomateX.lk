const mongoose = require("mongoose");

const User = require("../models/User");
const Booking = require("../models/Booking");
const Inquiry = require("../models/Inquiry");
const Review = require("../models/Review");
const {
  PLAN_OPTIONS,
  ACCOUNT_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  normalizePlan,
  resolveAccountStatus,
  normalizePaymentStatus,
  normalizeAllowedFeatures,
  resolveAllowedFeatures,
  normalizeMonthlyFee,
  normalizeNextPaymentDate,
  resolveOnboardingStatus,
  buildFeatureAccess
} = require("../utils/account");
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
function estimateMonthlyRevenue(clients) {
  return clients.reduce((total, client) => {
    const monthlyFee = normalizeMonthlyFee(client.monthlyFee);

    if (monthlyFee > 0) {
      return total + monthlyFee;
    }

    return total + (PLAN_PRICES[normalizePlan(client.plan)] || 0);
  }, 0);
}

function serializeAdminClient(client) {
  const plan = normalizePlan(client.plan);
  const accountStatus = resolveAccountStatus(client);
  const paymentStatus = normalizePaymentStatus(client.paymentStatus);
  const allowedFeatures = resolveAllowedFeatures(client);
  const monthlyFee = normalizeMonthlyFee(client.monthlyFee);
  const onboardingStatus = client.onboardingStatus || resolveOnboardingStatus({
    ...client,
    plan,
    accountStatus,
    paymentStatus,
    allowedFeatures
  });

  return {
    id: String(client._id || client.id),
    name: client.name,
    email: client.email,
    role: client.role,
    plan,
    packageName: plan,
    monthlyFee,
    accountStatus,
    paymentStatus,
    nextPaymentDate: client.nextPaymentDate || null,
    allowedFeatures,
    onboardingStatus,
    isActive: client.isActive,
    stripeCustomerId: client.stripeCustomerId || "",
    stripeSubscriptionId: client.stripeSubscriptionId || "",
    planExpiresAt: client.planExpiresAt || null,
    createdAt: client.createdAt,
    bookingCount: typeof client.bookingCount === "number" ? client.bookingCount : undefined,
    inquiryCount: typeof client.inquiryCount === "number" ? client.inquiryCount : undefined,
    featureAccess: buildFeatureAccess({
      ...client,
      accountStatus,
      allowedFeatures
    })
  };
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
    const activeAccountQuery = {
      role: "client",
      isActive: true,
      $or: [
        { accountStatus: "active" },
        {
          accountStatus: { $exists: false },
          plan: { $in: ["starter", "standard", "pro", "custom"] }
        }
      ]
    };

    const [
      totalClients,
      activeSubscriptions,
      bookingsThisMonth,
      inquiriesThisMonth,
      pendingReviews,
      activeClients
    ] = await Promise.all([
      User.countDocuments({ role: "client" }),
      User.countDocuments(activeAccountQuery),
      Booking.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Inquiry.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Review.countDocuments({ status: "pending" }),
      User.find(
        activeAccountQuery,
        { plan: 1, monthlyFee: 1, accountStatus: 1 }
      ).lean()
    ]);

    const planCounts = {
      starter: 0,
      standard: 0,
      pro: 0
    };

    activeClients.forEach((client) => {
      const plan = normalizePlan(client.plan);
      if (plan in planCounts) {
        planCounts[plan] += 1;
      }
    });

    return sendSuccess(res, 200, {
      totalClients,
      activeSubscriptions,
      totalBookingsThisMonth: bookingsThisMonth,
      totalInquiriesThisMonth: inquiriesThisMonth,
      totalReviewsPendingModeration: pendingReviews,
      monthlyRevenueEstimate: estimateMonthlyRevenue(activeClients),
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

    if (req.query.plan && PLAN_OPTIONS.includes(req.query.plan)) {
      match.plan = req.query.plan;
    }

    const isActive = parseBooleanFilter(req.query.isActive);
    if (typeof isActive === "boolean") {
      match.isActive = isActive;
    }

    const requestedAccountStatus = req.query.accountStatus && ACCOUNT_STATUS_OPTIONS.includes(req.query.accountStatus)
      ? req.query.accountStatus
      : "";

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
          monthlyFee: 1,
          accountStatus: 1,
          paymentStatus: 1,
          nextPaymentDate: 1,
          allowedFeatures: 1,
          onboardingStatus: 1,
          isActive: 1,
          createdAt: 1,
          bookingCount: { $size: "$bookings" },
          inquiryCount: { $size: "$inquiries" }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    const serializedClients = clients
      .map(serializeAdminClient)
      .filter((client) => !requestedAccountStatus || client.accountStatus === requestedAccountStatus);

    return sendSuccess(res, 200, {
      clients: serializedClients
    });
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
        ...serializeAdminClient(client)
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

    if (typeof req.body.plan === "string") {
      const normalizedPlan = normalizePlan(req.body.plan);
      if (!PLAN_OPTIONS.includes(normalizedPlan)) {
        return sendError(res, 400, "Plan must match a supported package.");
      }
      updates.plan = normalizedPlan;
    }

    if (typeof req.body.isActive === "boolean") {
      updates.isActive = req.body.isActive;
    }

    if (typeof req.body.monthlyFee !== "undefined") {
      updates.monthlyFee = normalizeMonthlyFee(req.body.monthlyFee);
    }

    if (typeof req.body.accountStatus === "string") {
      if (!ACCOUNT_STATUS_OPTIONS.includes(req.body.accountStatus)) {
        return sendError(res, 400, "Account status must be pending, active, or suspended.");
      }
      updates.accountStatus = req.body.accountStatus;
    }

    if (typeof req.body.paymentStatus === "string") {
      if (!PAYMENT_STATUS_OPTIONS.includes(req.body.paymentStatus)) {
        return sendError(res, 400, "Payment status must be pending, paid, unpaid, or overdue.");
      }
      updates.paymentStatus = req.body.paymentStatus;
    }

    if (typeof req.body.nextPaymentDate !== "undefined") {
      updates.nextPaymentDate = normalizeNextPaymentDate(req.body.nextPaymentDate);
    }

    if (typeof req.body.allowedFeatures !== "undefined") {
      updates.allowedFeatures = normalizeAllowedFeatures(req.body.allowedFeatures);
    }

    const clientBeforeUpdate = await User.findOne({ _id: req.params.id, role: "client" });
    if (!clientBeforeUpdate) {
      return sendError(res, 404, "Client not found.");
    }

    Object.assign(clientBeforeUpdate, updates);
    clientBeforeUpdate.onboardingStatus = resolveOnboardingStatus(clientBeforeUpdate);
    await clientBeforeUpdate.save();

    return sendSuccess(res, 200, {
      message: "Client updated successfully.",
      client: serializeAdminClient(clientBeforeUpdate.toObject())
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
      { isActive: false, accountStatus: "suspended" },
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
