const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const Booking = require("./models/Booking");
const Inquiry = require("./models/Inquiry");
const Review = require("./models/Review");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/automatex";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

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

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeString(value) {
  return /^\d{2}:\d{2}$/.test(value);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanString(value) {
  return String(value || "").trim();
}

function sendValidationError(res, message, details = []) {
  return res.status(400).json({
    message,
    details
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "AutomateX API",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timeSlots: AVAILABLE_TIMES
  });
});

app.get("/api/reviews", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);
    const reviews = await Review.find({ status: "published" })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      reviews: reviews.map((review) => ({
        id: review._id,
        name: review.name,
        role: review.role,
        text: review.text,
        rating: review.rating,
        createdAt: review.createdAt
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load reviews right now." });
  }
});

app.post("/api/reviews", async (req, res) => {
  try {
    const name = cleanString(req.body.name);
    const role = cleanString(req.body.role);
    const text = cleanString(req.body.text);
    const rating = Number(req.body.rating);
    const details = [];

    if (!name) {
      details.push("Name is required.");
    }

    if (!text) {
      details.push("Review text is required.");
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      details.push("Rating must be a whole number between 1 and 5.");
    }

    if (name.length > 40) {
      details.push("Name must be 40 characters or fewer.");
    }

    if (role.length > 50) {
      details.push("Role must be 50 characters or fewer.");
    }

    if (text.length > 280) {
      details.push("Review must be 280 characters or fewer.");
    }

    if (details.length) {
      return sendValidationError(res, "Please fix the review form and try again.", details);
    }

    const review = await Review.create({
      name,
      role,
      text,
      rating
    });

    return res.status(201).json({
      message: "Review posted successfully.",
      review: {
        id: review._id,
        name: review.name,
        role: review.role,
        text: review.text,
        rating: review.rating,
        createdAt: review.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to save your review right now." });
  }
});

app.post("/api/inquiries", async (req, res) => {
  try {
    const name = cleanString(req.body.name);
    const email = cleanString(req.body.email).toLowerCase();
    const message = cleanString(req.body.message);
    const details = [];

    if (!name) {
      details.push("Name is required.");
    }

    if (!email) {
      details.push("Email is required.");
    } else if (!isValidEmail(email)) {
      details.push("Enter a valid email address.");
    }

    if (!message) {
      details.push("Project details are required.");
    }

    if (name.length > 80) {
      details.push("Name must be 80 characters or fewer.");
    }

    if (message.length > 2000) {
      details.push("Project details must be 2000 characters or fewer.");
    }

    if (details.length) {
      return sendValidationError(res, "Please fix the contact form and try again.", details);
    }

    const inquiry = await Inquiry.create({
      name,
      email,
      message
    });

    return res.status(201).json({
      message: "Inquiry sent successfully.",
      inquiry: {
        id: inquiry._id,
        name: inquiry.name,
        email: inquiry.email,
        status: inquiry.status,
        createdAt: inquiry.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to send your inquiry right now." });
  }
});

app.get("/api/bookings/availability", async (req, res) => {
  try {
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Query parameter 'month' must use YYYY-MM format." });
    }

    const bookings = await Booking.find({
      date: { $regex: `^${month}` },
      status: "confirmed"
    })
      .select("date time -_id")
      .lean();

    const bookedSlots = bookings.map((booking) => `${booking.date}_${booking.time}`);
    return res.json({ bookedSlots });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load booking availability." });
  }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const name = cleanString(req.body.name);
    const email = cleanString(req.body.email).toLowerCase();
    const phone = cleanString(req.body.phone);
    const service = cleanString(req.body.service);
    const date = cleanString(req.body.date);
    const time = cleanString(req.body.time);
    const details = [];

    if (!name) {
      details.push("Name is required.");
    }

    if (!email) {
      details.push("Email is required.");
    } else if (!isValidEmail(email)) {
      details.push("Enter a valid email address.");
    }

    if (!date) {
      details.push("Date is required.");
    }

    if (!time) {
      details.push("Time is required.");
    }

    if (date && !isValidDateString(date)) {
      details.push("Date format must use YYYY-MM-DD.");
    }

    if (time && !isValidTimeString(time)) {
      details.push("Time format must use HH:MM.");
    }

    if (time && !AVAILABLE_TIMES.includes(time)) {
      details.push("Selected time is not available.");
    }

    if (name.length > 80) {
      details.push("Name must be 80 characters or fewer.");
    }

    if (phone.length > 30) {
      details.push("Phone must be 30 characters or fewer.");
    }

    if (service.length > 80) {
      details.push("Service must be 80 characters or fewer.");
    }

    if (details.length) {
      return sendValidationError(res, "Please fix the booking form and try again.", details);
    }

    const existingBooking = await Booking.findOne({
      date,
      time,
      status: "confirmed"
    }).lean();

    if (existingBooking) {
      return res.status(409).json({
        message: "This time slot is already booked. Please choose another one."
      });
    }

    const booking = await Booking.create({
      name,
      email,
      phone,
      service,
      date,
      time
    });

    return res.status(201).json({
      message: "Booking confirmed successfully.",
      booking: {
        id: booking._id,
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
      return res.status(409).json({
        message: "This time slot is already booked. Please choose another one."
      });
    }

    return res.status(500).json({
      message: "Server error while saving the booking."
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected");
    const server = app.listen(PORT, () => {
      console.log(`AutomateX server running on http://localhost:${PORT}`);
    });

    const shutdown = async () => {
      await mongoose.connection.close();
      server.close(() => process.exit(0));
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
