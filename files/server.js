const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const crypto = require("crypto");

const Booking = require("./models/Booking");
const Inquiry = require("./models/Inquiry");
const Review = require("./models/Review");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/automatex";

// ─── Admin credentials (set in .env) ───────────────────────────────────────
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "automatex2024";
const ADMIN_SECRET   = process.env.ADMIN_SECRET   || "change-this-secret-in-production";

// ─── Simple token store (swap for JWT library in production) ─────────────────
const activeTokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  next();
}

// ─── Email helper (Nodemailer) ───────────────────────────────────────────────
let transporter = null;

async function setupEmail() {
  try {
    const nodemailer = require("nodemailer");

    if (process.env.EMAIL_HOST) {
      // Production: use real SMTP (e.g. SendGrid, Mailgun, Gmail)
      transporter = nodemailer.createTransport({
        host:   process.env.EMAIL_HOST,
        port:   Number(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === "true",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    } else {
      // Development: Ethereal fake SMTP – prints preview URL in console
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host:   "smtp.ethereal.email",
        port:   587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass }
      });
      console.log("📧  Ethereal test email active – URLs printed in console");
    }
  } catch {
    console.warn("⚠️  Nodemailer not installed. Run: npm install nodemailer");
    transporter = null;
  }
}

async function sendEmail(to, subject, html) {
  if (!transporter) return;
  try {
    const nodemailer = require("nodemailer");
    const info = await transporter.sendMail({
      from: `"AutomateX" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || "noreply@automatex.com"}>`,
      to,
      subject,
      html
    });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log("📧  Preview:", preview);
  } catch (err) {
    console.error("Email error:", err.message);
  }
}

function bookingConfirmationHTML(booking) {
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0b0d12;color:#e8eaf0;border-radius:12px;overflow:hidden">
    <div style="background:#12151d;padding:28px 32px;border-bottom:1px solid #1e2230">
      <h1 style="color:#4fd1c5;font-size:1.4rem;margin:0">AutomateX</h1>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 8px">Booking Confirmed ✅</h2>
      <p style="color:#9ca3af;margin:0 0 24px">Hi ${booking.name}, your discovery call is booked.</p>
      <table style="width:100%;border-collapse:collapse;font-size:.9rem">
        <tr><td style="padding:8px 0;color:#6b7280;width:120px">Date</td><td style="color:#e8eaf0"><strong>${booking.date}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Time</td><td style="color:#e8eaf0"><strong>${booking.time}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Service</td><td style="color:#e8eaf0">${booking.service || "Discovery Call"}</td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:.85rem;color:#6b7280">We'll reach out to confirm the details. Questions? Reply to this email.</p>
    </div>
  </div>`;
}

function adminBookingAlertHTML(booking) {
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0b0d12;color:#e8eaf0;border-radius:12px;overflow:hidden">
    <div style="background:#12151d;padding:24px 32px;border-bottom:1px solid #1e2230">
      <h1 style="color:#f5b944;font-size:1.2rem;margin:0">⚡ New Booking Alert</h1>
    </div>
    <div style="padding:32px">
      <table style="width:100%;border-collapse:collapse;font-size:.9rem">
        <tr><td style="padding:6px 0;color:#6b7280;width:100px">Name</td><td>${booking.name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td>${booking.email}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Phone</td><td>${booking.phone || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Service</td><td>${booking.service || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Date</td><td><strong>${booking.date}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Time</td><td><strong>${booking.time}</strong></td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:.82rem;color:#6b7280">Manage this booking in your <a href="${process.env.ADMIN_URL || "http://localhost:5000/admin.html"}" style="color:#4fd1c5">Admin Dashboard</a>.</p>
    </div>
  </div>`;
}

function inquiryAlertHTML(inquiry) {
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0b0d12;color:#e8eaf0;border-radius:12px;overflow:hidden">
    <div style="background:#12151d;padding:24px 32px;border-bottom:1px solid #1e2230">
      <h1 style="color:#a78bfa;font-size:1.2rem;margin:0">💬 New Project Inquiry</h1>
    </div>
    <div style="padding:32px">
      <p><strong>${inquiry.name}</strong> (${inquiry.email}) sent an inquiry:</p>
      <blockquote style="border-left:3px solid #4fd1c5;margin:16px 0;padding:12px 16px;background:#12151d;border-radius:0 8px 8px 0;color:#9ca3af;font-size:.9rem">${inquiry.message}</blockquote>
    </div>
  </div>`;
}

// ─── App setup ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const AVAILABLE_TIMES = [
  "09:00","09:30","10:00","10:30","11:00","11:30",
  "14:00","14:30","15:00","15:30","16:00","16:30"
];

function isValidDateString(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v); }
function isValidTimeString(v) { return /^\d{2}:\d{2}$/.test(v); }
function isValidEmail(v)      { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function cleanString(v)       { return String(v || "").trim(); }

function sendValidationError(res, message, details = []) {
  return res.status(400).json({ message, details });
}

// ─── Public routes ────────────────────────────────────────────────────────────

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
      .sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({
      reviews: reviews.map(r => ({
        id: r._id, name: r.name, role: r.role,
        text: r.text, rating: r.rating, createdAt: r.createdAt
      }))
    });
  } catch { return res.status(500).json({ message: "Unable to load reviews right now." }); }
});

app.post("/api/reviews", async (req, res) => {
  try {
    const name   = cleanString(req.body.name);
    const role   = cleanString(req.body.role);
    const text   = cleanString(req.body.text);
    const rating = Number(req.body.rating);
    const details = [];

    if (!name)                                        details.push("Name is required.");
    if (!text)                                        details.push("Review text is required.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) details.push("Rating must be 1–5.");
    if (name.length > 40)                             details.push("Name must be 40 chars or fewer.");
    if (role.length > 50)                             details.push("Role must be 50 chars or fewer.");
    if (text.length > 280)                            details.push("Review must be 280 chars or fewer.");
    if (details.length) return sendValidationError(res, "Please fix the review form.", details);

    // New reviews go into pending state; admin publishes them
    const review = await Review.create({ name, role, text, rating, status: "pending" });
    return res.status(201).json({
      message: "Review submitted. It will appear after moderation.",
      review: { id: review._id, name: review.name, role: review.role, text: review.text, rating: review.rating, createdAt: review.createdAt }
    });
  } catch { return res.status(500).json({ message: "Unable to save your review right now." }); }
});

app.post("/api/inquiries", async (req, res) => {
  try {
    const name    = cleanString(req.body.name);
    const email   = cleanString(req.body.email).toLowerCase();
    const message = cleanString(req.body.message);
    const details = [];

    if (!name)                       details.push("Name is required.");
    if (!email)                      details.push("Email is required.");
    else if (!isValidEmail(email))   details.push("Enter a valid email address.");
    if (!message)                    details.push("Project details are required.");
    if (name.length > 80)            details.push("Name must be 80 chars or fewer.");
    if (message.length > 2000)       details.push("Project details must be 2000 chars or fewer.");
    if (details.length) return sendValidationError(res, "Please fix the contact form.", details);

    const inquiry = await Inquiry.create({ name, email, message });

    // Notify admin
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      sendEmail(adminEmail, `💬 New inquiry from ${name}`, inquiryAlertHTML({ name, email, message }));
    }

    return res.status(201).json({
      message: "Inquiry sent successfully.",
      inquiry: { id: inquiry._id, name: inquiry.name, email: inquiry.email, status: inquiry.status, createdAt: inquiry.createdAt }
    });
  } catch { return res.status(500).json({ message: "Unable to send your inquiry right now." }); }
});

app.get("/api/bookings/availability", async (req, res) => {
  try {
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Query parameter 'month' must use YYYY-MM format." });
    }
    const bookings = await Booking.find({ date: { $regex: `^${month}` }, status: "confirmed" })
      .select("date time -_id").lean();
    return res.json({ bookedSlots: bookings.map(b => `${b.date}_${b.time}`) });
  } catch { return res.status(500).json({ message: "Unable to load booking availability." }); }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const name    = cleanString(req.body.name);
    const email   = cleanString(req.body.email).toLowerCase();
    const phone   = cleanString(req.body.phone);
    const service = cleanString(req.body.service);
    const date    = cleanString(req.body.date);
    const time    = cleanString(req.body.time);
    const details = [];

    if (!name)                       details.push("Name is required.");
    if (!email)                      details.push("Email is required.");
    else if (!isValidEmail(email))   details.push("Enter a valid email address.");
    if (!date)                       details.push("Date is required.");
    if (!time)                       details.push("Time is required.");
    if (date && !isValidDateString(date)) details.push("Date format must use YYYY-MM-DD.");
    if (time && !isValidTimeString(time)) details.push("Time format must use HH:MM.");
    if (time && !AVAILABLE_TIMES.includes(time)) details.push("Selected time is not available.");
    if (name.length > 80)            details.push("Name must be 80 chars or fewer.");
    if (phone.length > 30)           details.push("Phone must be 30 chars or fewer.");
    if (service.length > 80)         details.push("Service must be 80 chars or fewer.");
    if (details.length) return sendValidationError(res, "Please fix the booking form.", details);

    const existing = await Booking.findOne({ date, time, status: "confirmed" }).lean();
    if (existing) return res.status(409).json({ message: "This time slot is already booked." });

    const booking = await Booking.create({ name, email, phone, service, date, time });

    // ── Send emails ──────────────────────────────────────────────────────────
    // 1. Confirmation to client
    sendEmail(email, "✅ Your AutomateX booking is confirmed", bookingConfirmationHTML({ name, date, time, service }));

    // 2. Alert to admin
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      sendEmail(adminEmail, `⚡ New booking – ${name} on ${date} at ${time}`, adminBookingAlertHTML({ name, email, phone, service, date, time }));
    }

    return res.status(201).json({
      message: "Booking confirmed successfully.",
      booking: {
        id: booking._id, name: booking.name, email: booking.email,
        phone: booking.phone, service: booking.service,
        date: booking.date, time: booking.time, status: booking.status
      }
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "This time slot is already booked." });
    }
    return res.status(500).json({ message: "Server error while saving the booking." });
  }
});

// ─── Admin auth ──────────────────────────────────────────────────────────────

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid credentials." });
  }
  const token = generateToken();
  activeTokens.add(token);
  // Auto-expire token after 8 hours
  setTimeout(() => activeTokens.delete(token), 8 * 60 * 60 * 1000);
  return res.json({ token });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = req.headers.authorization.slice(7);
  activeTokens.delete(token);
  res.json({ ok: true });
});

// ─── Admin: bookings ─────────────────────────────────────────────────────────

app.get("/api/admin/bookings", requireAdmin, async (_req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 }).lean();
    return res.json({ bookings });
  } catch { return res.status(500).json({ message: "Unable to fetch bookings." }); }
});

app.patch("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["confirmed", "pending", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }
    const booking = await Booking.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    // Send cancellation email if status changed to cancelled
    if (status === "cancelled") {
      sendEmail(
        booking.email,
        "Your AutomateX booking has been cancelled",
        `<p style="font-family:sans-serif">Hi ${booking.name}, your booking on ${booking.date} at ${booking.time} has been cancelled. Please rebook at your convenience or contact us.</p>`
      );
    }

    return res.json({ message: "Booking updated.", booking });
  } catch { return res.status(500).json({ message: "Unable to update booking." }); }
});

// ─── Admin: inquiries ────────────────────────────────────────────────────────

app.get("/api/admin/inquiries", requireAdmin, async (_req, res) => {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 }).lean();
    return res.json({ inquiries });
  } catch { return res.status(500).json({ message: "Unable to fetch inquiries." }); }
});

app.patch("/api/admin/inquiries/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!inquiry) return res.status(404).json({ message: "Inquiry not found." });
    return res.json({ message: "Inquiry updated.", inquiry });
  } catch { return res.status(500).json({ message: "Unable to update inquiry." }); }
});

app.delete("/api/admin/inquiries/:id", requireAdmin, async (req, res) => {
  try {
    await Inquiry.findByIdAndDelete(req.params.id);
    return res.json({ message: "Inquiry deleted." });
  } catch { return res.status(500).json({ message: "Unable to delete inquiry." }); }
});

// ─── Admin: reviews ──────────────────────────────────────────────────────────

app.get("/api/admin/reviews", requireAdmin, async (_req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 }).lean();
    return res.json({ reviews });
  } catch { return res.status(500).json({ message: "Unable to fetch reviews." }); }
});

app.patch("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const review = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!review) return res.status(404).json({ message: "Review not found." });
    return res.json({ message: "Review updated.", review });
  } catch { return res.status(500).json({ message: "Unable to update review." }); }
});

app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    return res.json({ message: "Review deleted." });
  } catch { return res.status(500).json({ message: "Unable to delete review." }); }
});

// ─── Catch-all ───────────────────────────────────────────────────────────────

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─── Boot ────────────────────────────────────────────────────────────────────

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅  MongoDB connected");
    await setupEmail();

    const server = app.listen(PORT, () => {
      console.log(`🚀  AutomateX server → http://localhost:${PORT}`);
      console.log(`🔐  Admin dashboard  → http://localhost:${PORT}/admin.html`);
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
