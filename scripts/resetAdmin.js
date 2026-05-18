const path = require("path");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../server/models/User");
const { connectToDatabase } = require("../server/utils/db");
const {
  OFFICIAL_ADMIN_EMAIL,
  normalizeEmailAddress,
  resolveTrustedRole
} = require("../server/utils/authRole");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const TARGET_EMAIL = normalizeEmailAddress(OFFICIAL_ADMIN_EMAIL);
const TEMP_PASSWORD = "Admin123456";
const DEFAULT_NAME = "AutomateX Admin";
const SALT_ROUNDS = 12;

async function connectSilently() {
  const originalConsoleLog = console.log;

  console.log = () => {};

  try {
    return await connectToDatabase();
  } finally {
    console.log = originalConsoleLog;
  }
}

async function resetAdminUser() {
  const connection = await connectSilently();

  if (!connection) {
    throw new Error("Database connection failed. Check MONGO_URI or MONGODB_URI.");
  }

  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, SALT_ROUNDS);
  const role = resolveTrustedRole(TARGET_EMAIL);
  const existingUser = await User.findOne({ email: TARGET_EMAIL });

  if (existingUser) {
    await User.updateOne(
      { _id: existingUser._id },
      {
        $set: {
          passwordHash,
          role,
          isActive: true,
          accountStatus: "active",
          onboardingStatus: "approved"
        }
      }
    );

    console.log("Admin reset complete.");
    return;
  }

  await User.create({
    name: DEFAULT_NAME,
    email: TARGET_EMAIL,
    passwordHash,
    role,
    isActive: true,
    accountStatus: "active",
    onboardingStatus: "approved"
  });

  console.log("Admin reset complete.");
}

async function main() {
  try {
    await resetAdminUser();
  } catch (error) {
    console.error(error.message || "Unable to reset admin user.");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => null);
  }
}

main();
