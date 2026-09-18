const mongoose = require("mongoose");
const {
  getPosLicensingMongoConnectionOptions,
  validatePosLicensingMongoConfiguration
} = require("../config/posLicensingMongo");

const globalMongoose = global;

if (!globalMongoose.mongooseCache) {
  globalMongoose.mongooseCache = {
    conn: null,
    promise: null
  };
}

function resolveDatabaseConnectionConfiguration(env = process.env) {
  const posLicensingMode = String(env.POS_LICENSING_MODE || "disabled").trim().toLowerCase();
  const isolatedLicensingEnvironment = ["staging", "production"].includes(posLicensingMode);
  if (isolatedLicensingEnvironment) {
    const mongo = validatePosLicensingMongoConfiguration(env, posLicensingMode);
    return Object.freeze({
      isolatedLicensingEnvironment: true,
      mongoUri: mongo.secrets.getMongoUri(),
      options: getPosLicensingMongoConnectionOptions(mongo.databaseName),
      mongo
    });
  }

  return Object.freeze({
    isolatedLicensingEnvironment: false,
    mongoUri: env.MONGO_URI || env.MONGODB_URI || "",
    options: Object.freeze({ bufferCommands: false }),
    mongo: null
  });
}

async function connectToDatabase() {
  const configuration = resolveDatabaseConnectionConfiguration(process.env);
  const { mongoUri } = configuration;

  if (!mongoUri) {
    console.error("Missing MONGO_URI environment variable.");
    return null;
  }

  if (globalMongoose.mongooseCache.conn && mongoose.connection.readyState === 1) {
    return globalMongoose.mongooseCache.conn;
  }

  if (!globalMongoose.mongooseCache.promise) {
    globalMongoose.mongooseCache.promise = mongoose.connect(mongoUri, configuration.options)
      .then((mongooseInstance) => {
        console.log("MongoDB connected");
        return mongooseInstance;
      })
      .catch((error) => {
        console.error("MongoDB connection failed.");
        globalMongoose.mongooseCache.promise = null;
        throw error;
      });
  }

  try {
    globalMongoose.mongooseCache.conn = await globalMongoose.mongooseCache.promise;
    return globalMongoose.mongooseCache.conn;
  } catch {
    globalMongoose.mongooseCache.conn = null;
    return null;
  }
}

module.exports = {
  connectToDatabase,
  resolveDatabaseConnectionConfiguration
};
