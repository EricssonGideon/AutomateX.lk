const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
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
      enum: ["confirmed", "cancelled"]
    }
  },
  {
    timestamps: true
  }
);

bookingSchema.index({ date: 1, time: 1 }, { unique: true });

module.exports = mongoose.model("Booking", bookingSchema);
