const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");

dotenv.config();

const apiRoutes = require("./routes");
const { handleCorsError } = require("./middleware/rateLimit");
const { connectToDatabase } = require("./utils/db");

const app = express();
app.set("trust proxy", 1);

const publicDirectory = path.join(__dirname, "..", "public");
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === "production";
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

function isSameOriginRequest(req, origin) {
  const host = req.get("host");

  if (!host) {
    return false;
  }

  return origin === `${req.protocol}://${host}`;
}

function isAllowedCorsOrigin(req, origin) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (isSameOriginRequest(req, origin)) {
    return true;
  }

  return !isProduction && localOriginPattern.test(origin);
}

function logStructuredError(payload) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    route: payload.route,
    errorMessage: payload.message,
    stack: payload.stack || ""
  }));
}

function corsOptionsDelegate(req, callback) {
  callback(null, {
    origin(requestOrigin, originCallback) {
      if (isAllowedCorsOrigin(req, requestOrigin)) {
        return originCallback(null, true);
      }

      return originCallback(new Error("Origin not allowed by CORS."));
    },
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
}

app.use(helmet());
app.use(morgan("combined"));
app.use(cors(corsOptionsDelegate));
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", async (_req, res, next) => {
  try {
    await connectToDatabase();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api", async (_req, _res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api", apiRoutes);
app.use(handleCorsError);

app.use("/api", (req, res) => {
  res.status(404).json({
    message: `API route not found: ${req.originalUrl}`
  });
});

app.use(express.static(publicDirectory));

app.use((req, res) => {
  res.status(404).send("Not found");
});

app.use((error, req, res, _next) => {
  logStructuredError({
    route: req.originalUrl,
    message: error.message || "Unhandled server error.",
    stack: error.stack
  });

  if (res.headersSent) {
    return;
  }

  res.status(error.statusCode || 500).json({
    message: "Internal server error."
  });
});

process.on("uncaughtException", (error) => {
  logStructuredError({
    route: "process:uncaughtException",
    message: error.message || "Uncaught exception.",
    stack: error.stack
  });
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logStructuredError({
    route: "process:unhandledRejection",
    message: error.message || "Unhandled rejection.",
    stack: error.stack
  });
});

module.exports = app;
module.exports.connectToDatabase = connectToDatabase;
