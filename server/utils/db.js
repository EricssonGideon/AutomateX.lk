const mongoose = require("mongoose");

const globalMongoose = global;

if (!globalMongoose.mongooseCache) {
  globalMongoose.mongooseCache = {
    conn: null,
    promise: null
  };
}

async function connectToDatabase() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error("Missing MONGO_URI environment variable.");
    return null;
  }

  if (globalMongoose.mongooseCache.conn && mongoose.connection.readyState === 1) {
    return globalMongoose.mongooseCache.conn;
  }

  if (!globalMongoose.mongooseCache.promise) {
    globalMongoose.mongooseCache.promise = mongoose.connect(mongoUri, {
      bufferCommands: false
    })
      .then((mongooseInstance) => {
        console.log("MongoDB connected");
        return mongooseInstance;
      })
      .catch((error) => {
        console.error("MongoDB connection failed:", error);
        globalMongoose.mongooseCache.promise = null;
        throw error;
      });
  }

  try {
    globalMongoose.mongooseCache.conn = await globalMongoose.mongooseCache.promise;
    return globalMongoose.mongooseCache.conn;
  } catch (error) {
    globalMongoose.mongooseCache.conn = null;
    return null;
  }
}

module.exports = {
  connectToDatabase
};
