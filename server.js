const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");

const apiRoutes = require("./server/routes");
const { apiLimiter, handleCorsError } = require("./server/middleware/rateLimit");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/automatex";
const PROJECT_ROOT = __dirname;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

let serverInstance = null;
let shuttingDown = false;

/**
 * Writes structured production-friendly error logs.
 *
 * @param {{route: string, message: string, stack?: string}} payload - Error details to log.
 * @returns {void}
 */
function logStructuredError(payload) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    route: payload.route,
    errorMessage: payload.message,
    stack: payload.stack || ""
  }));
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS."));
  }
};

app.use(helmet());
app.use(morgan("combined"));
app.use(cors(corsOptions));
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PROJECT_ROOT));
app.use("/vendor", express.static(path.join(PROJECT_ROOT, "node_modules")));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.use("/api", apiLimiter, apiRoutes);
app.use(handleCorsError);

app.get("/", (_req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, "index.html"));
});

app.use("/api", (req, res) => {
  res.status(404).json({
    message: `API route not found: ${req.originalUrl}`
  });
});

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

/**
 * Gracefully stops the HTTP server and closes the MongoDB connection.
 *
 * @param {string} signal - Process signal name.
 * @returns {Promise<void>}
 */
async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`${signal} received. Shutting down gracefully...`);

  try {
    if (serverInstance) {
      await new Promise((resolve) => {
        serverInstance.close(resolve);
      });
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logStructuredError({
      route: "process:shutdown",
      message: error.message || "Shutdown failed.",
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Connects MongoDB and starts the Express server.
 *
 * @returns {Promise<void>}
 */
async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected");

    serverInstance = app.listen(PORT, () => {
      console.log(`AutomateX server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logStructuredError({
      route: "process:startServer",
      message: error.message || "Failed to start server.",
      stack: error.stack
    });
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
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

startServer();

module.exports = app;
