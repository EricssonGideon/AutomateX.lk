const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");

const apiRoutes = require("./routes");
const { apiLimiter, handleCorsError } = require("./middleware/rateLimit");

dotenv.config();

const app = express();
const projectRoot = path.resolve(__dirname, "..");
const mongoUri = process.env.MONGODB_URI;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

let mongoConnectionPromise = null;

function logStructuredError(payload) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    route: payload.route,
    errorMessage: payload.message,
    stack: payload.stack || ""
  }));
}

async function connectToDatabase() {
  if (!mongoUri) {
    console.warn("MONGODB_URI is not configured. Continuing without a database connection.");
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoConnectionPromise) {
    return mongoConnectionPromise;
  }

  mongoConnectionPromise = mongoose.connect(mongoUri)
    .then(() => mongoose.connection)
    .catch((error) => {
      mongoConnectionPromise = null;
      logStructuredError({
        route: "process:mongodb",
        message: error.message || "Failed to connect to MongoDB.",
        stack: error.stack
      });
      return null;
    });

  return mongoConnectionPromise;
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
app.use(express.static(projectRoot));
app.use("/vendor", express.static(path.join(projectRoot, "node_modules")));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.use("/api", async (_req, _res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api", apiLimiter, apiRoutes);
app.use(handleCorsError);

app.get("/", (_req, res) => {
  res.sendFile(path.join(projectRoot, "index.html"));
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
