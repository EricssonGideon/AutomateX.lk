const path = require("path");
const mongoose = require("mongoose");

const appModule = require("./server/server");

const app = appModule;
const { connectToDatabase } = appModule;
const PORT = Number(process.env.PORT) || 5000;
const publicDirectory = path.join(__dirname, "public");

let hasLoggedInitialDatabaseState = false;

function logDatabaseStatus(status) {
  console.log(`[startup] Database status: ${status}`);
}

mongoose.connection.on("connected", () => {
  hasLoggedInitialDatabaseState = true;
  logDatabaseStatus("connected");
});

mongoose.connection.on("disconnected", () => {
  if (!hasLoggedInitialDatabaseState) {
    return;
  }

  logDatabaseStatus("disconnected");
});

mongoose.connection.on("error", (error) => {
  console.error(`[startup] Database error: ${error.message}`);
});

async function startServer() {
  try {
    const connection = await connectToDatabase();

    if (connection && mongoose.connection.readyState === 1) {
      hasLoggedInitialDatabaseState = true;
    } else if (process.env.MONGO_URI || process.env.MONGODB_URI) {
      hasLoggedInitialDatabaseState = true;
      logDatabaseStatus("disconnected");
    } else {
      hasLoggedInitialDatabaseState = true;
      logDatabaseStatus("not configured");
    }
  } catch (error) {
    hasLoggedInitialDatabaseState = true;
    console.error(`[startup] Database startup check failed: ${error.message}`);
    logDatabaseStatus("disconnected");
  }

  const server = app.listen(PORT, () => {
    console.log(`[startup] Express server listening on port ${PORT}`);
    console.log(`[startup] Serving static files from ${publicDirectory}`);
    console.log(`[startup] API routes available under /api`);
  });

  server.on("error", (error) => {
    console.error(`[startup] Server failed to start: ${error.message}`);
    process.exitCode = 1;
  });

  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`[startup] Unhandled startup failure: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.startServer = startServer;
