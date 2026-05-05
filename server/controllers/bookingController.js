const { body, validationResult } = require("express-validator");

const Booking = require("../models/Booking");
const User = require("../models/User");
const {
  sendBookingConfirmationToClient,
  sendBookingConfirmationToCustomer
} = require("../utils/email");
const { sendSuccess, sendValidationError, sendError } = require("../utils/response");

const AVAILABLE_TIMES = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30"
];

/**
 * Trims unknown input into a predictable string.
 *
 * @param {unknown} value - The value to normalize.
 * @returns {string} A trimmed string.
 */
function cleanString(value) {
  return String(value || "").trim();
}

/**
 * Extracts human-readable validation messages from express-validator.
 *
 * @param {import("express").Request} req - The incoming request.
 * @returns {string[]} A flat list of validation messages.
 */
function validationMessages(req) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return [];
  }

  return result.array().map((error) => error.msg);
}

/**
 * Converts an ISO date string into a local Date used for business-rule checks.
 *
 * @param {string} dateString - A `YYYY-MM-DD` date string.
 * @returns {Date} A normalized local Date instance.
 */
function normalizeDateForValidation(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Applies booking business rules that are shared by all tenants.
 *
 * @param {string} dateString - The requested booking date.
 * @param {string} timeString - The requested booking time.
 * @returns {string[]} Validation messages for any violated rules.
 */
function validateBookingBusinessRules(dateString, timeString) {
  const details = [];

  if (dateString) {
    const bookingDate = normalizeDateForValidation(dateString);
    bookingDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (bookingDate.getDay() === 0 || bookingDate.getDay() === 6) {
      details.push("Bookings are only available on weekdays.");
    }

    if (bookingDate < today) {
      details.push("Bookings cannot be made for past dates.");
    }
  }

  if (timeString && !AVAILABLE_TIMES.includes(timeString)) {
    details.push("Selected time is not available.");
  }

  return details;
}

const bookingValidators = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required.")
    .isLength({ max: 100 })
    .withMessage("Name must be 100 characters or fewer.")
    .escape(),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required.")
    .isEmail()
    .withMessage("Enter a valid email address.")
    .normalizeEmail(),
  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage("Phone must be 30 characters or fewer.")
    .escape(),
  body("service")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Service must be 100 characters or fewer.")
    .escape(),
  body("date")
    .trim()
    .notEmpty()
    .withMessage("Date is required.")
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage("Date format must use YYYY-MM-DD."),
  body("time")
    .trim()
    .notEmpty()
    .withMessage("Time is required.")
    .matches(/^\d{2}:\d{2}$/)
    .withMessage("Time format must use HH:MM.")
];

/**
 * Lists bookings for the authenticated client, or all bookings for admins.
 *
 * @param {import("express").Request} req - The incoming request with `req.user`.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} A filtered bookings response.
 */
async function getBookings(req, res) {
  try {
    const query = req.user.role === "admin" ? {} : { clientId: req.user.id };
    const bookings = await Booking.find(query).sort({ createdAt: -1 }).lean();

    return sendSuccess(res, 200, { bookings });
  } catch (_error) {
    return sendError(res, 500, "Unable to load bookings right now.");
  }
}

/**
 * Returns occupied slot keys for the authenticated client's calendar.
 *
 * @param {import("express").Request} req - The incoming request with `req.user`.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Availability response scoped to the tenant.
 */
async function getAvailability(req, res) {
  try {
    const month = req.query.month;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return sendError(res, 400, "Query parameter 'month' must use YYYY-MM format.");
    }

    const bookings = await Booking.find({
      clientId: req.user.id,
      date: { $regex: `^${month}` },
      status: "confirmed"
    })
      .select("date time -_id")
      .lean();

    const bookedSlots = bookings.map((booking) => `${booking.date}_${booking.time}`);
    return sendSuccess(res, 200, { bookedSlots });
  } catch (_error) {
    return sendError(res, 500, "Unable to load booking availability.");
  }
}

/**
 * Creates a booking for the authenticated tenant and attaches the tenant ID server-side.
 *
 * @param {import("express").Request} req - The incoming request with validated booking data.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Booking creation response.
 */
async function createBooking(req, res) {
  try {
    const details = validationMessages(req);
    const date = cleanString(req.body.date);
    const time = cleanString(req.body.time);

    details.push(...validateBookingBusinessRules(date, time));

    if (details.length) {
      return sendValidationError(res, "Please fix the booking form and try again.", details);
    }

    const existingBooking = await Booking.findOne({
      clientId: req.user.id,
      date,
      time,
      status: "confirmed"
    }).lean();

    if (existingBooking) {
      return sendError(res, 409, "This time slot is already booked. Please choose another one.");
    }

    const client = await User.findOne({
      _id: req.user.id,
      role: "client"
    }).lean();

    if (!client) {
      return sendError(res, 404, "Client not found.");
    }

    const booking = await Booking.create({
      clientId: req.user.id,
      name: cleanString(req.body.name),
      email: cleanString(req.body.email).toLowerCase(),
      phone: cleanString(req.body.phone),
      service: cleanString(req.body.service),
      date,
      time
    });

    const businessName = client.name || "AutomateX Client";

    await Promise.allSettled([
      sendBookingConfirmationToClient(booking, client),
      sendBookingConfirmationToCustomer(booking, businessName)
    ]);

    return sendSuccess(res, 201, {
      message: "Booking confirmed successfully.",
      booking: {
        id: booking._id,
        clientId: booking.clientId,
        name: booking.name,
        email: booking.email,
        phone: booking.phone,
        service: booking.service,
        date: booking.date,
        time: booking.time,
        status: booking.status
      }
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return sendError(res, 409, "This time slot is already booked. Please choose another one.");
    }

    return sendError(res, 500, "Server error while saving the booking.");
  }
}

/**
 * Cancels a booking owned by the authenticated client.
 *
 * @param {import("express").Request} req - The incoming authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Updated booking response.
 */
async function cancelBooking(req, res) {
  try {
    const query = {
      _id: req.params.bookingId
    };

    if (req.user.role !== "admin") {
      query.clientId = req.user.id;
    }

    const booking = await Booking.findOneAndUpdate(
      query,
      { status: "cancelled" },
      { new: true }
    ).lean();

    if (!booking) {
      return sendError(res, 404, "Booking not found.");
    }

    return sendSuccess(res, 200, {
      message: "Booking cancelled successfully.",
      booking
    });
  } catch (_error) {
    return sendError(res, 500, "Unable to cancel the booking right now.");
  }
}

module.exports = {
  bookingValidators,
  getBookings,
  getAvailability,
  createBooking,
  cancelBooking
};
