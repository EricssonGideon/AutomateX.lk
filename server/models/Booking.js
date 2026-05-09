const mongoose = require("mongoose");
const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

const bookingSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      default: "",
      trim: true
    },
    service: {
      type: String,
      default: "",
      trim: true
    },
    date: {
      type: String,
      required: true
    },
    time: {
      type: String,
      required: true
    },
    status: {
      type: String,
      default: "confirmed",
      enum: ["pending", "confirmed", "completed", "cancelled"]
    },
    adminNotes: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    timestamps: true
  }
);

bookingSchema.index(
  { clientId: 1, date: 1, time: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ACTIVE_BOOKING_STATUSES }
    },
    name: "booking_active_slot_unique"
  }
);

module.exports = mongoose.model("Booking", bookingSchema);
