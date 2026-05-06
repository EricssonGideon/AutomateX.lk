const mongoose = require("mongoose");
const { sendSuccess } = require("../utils/response");
const { connectToDatabase } = require("../utils/db");

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

async function getHealth(_req, res) {
  await connectToDatabase();

  return sendSuccess(res, 200, {
    ok: true,
    service: "AutomateX API",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timeSlots: AVAILABLE_TIMES
  });
}

module.exports = {
  getHealth
};
