const path = require("path");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../server/models/User");
const {
  OFFICIAL_ADMIN_EMAIL,
  normalizeEmailAddress
} = require("../server/utils/authRole");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const TARGET_EMAIL = normalizeEmailAddress(OFFICIAL_ADMIN_EMAIL);
const TEMP_PASSWORD = process.env.TEMP_PASSWORD;
const DEFAULT_NAME = "AutomateX Admin";
const SALT_ROUNDS = 12;

async function connectToMongo() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("Missing MONGO_URI or MONGODB_URI environment variable.");
  }

  return mongoose.connect(mongoUri, {
    bufferCommands: false
  });
}

async function resetAdminUser() {
  if (!TEMP_PASSWORD) {
    throw new Error("Missing TEMP_PASSWORD environment variable.");
  }

  await connectToMongo();

  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, SALT_ROUNDS);
  const admin = await User.findOne({ email: TARGET_EMAIL }) || new User({
    name: DEFAULT_NAME,
    email: TARGET_EMAIL
  });

  if (!admin.name) {
    admin.name = DEFAULT_NAME;
  }

  admin.passwordHash = passwordHash;
  admin.role = "admin";
  admin.isActive = true;
  admin.accountStatus = "active";
  admin.onboardingStatus = "approved";
  admin.paymentStatus = "paid";
  admin.businessName = "AutomateX";

  const savedAdmin = await admin.save();
  const passwordVerified = await bcrypt.compare(TEMP_PASSWORD, savedAdmin.passwordHash);

  console.log("Admin reset complete.");
  console.log(`Email: ${savedAdmin.email}`);
  console.log(`Role: ${savedAdmin.role}`);
  console.log(`Account status: ${savedAdmin.accountStatus}`);
  console.log(`Onboarding status: ${savedAdmin.onboardingStatus}`);
  console.log(`Password verification: ${passwordVerified}`);
}

async function main() {
  try {
    await resetAdminUser();
  } catch (error) {
    if (
      error.message === "Missing TEMP_PASSWORD environment variable." ||
      error.message === "Missing MONGO_URI or MONGODB_URI environment variable."
    ) {
      console.error(error.message);
    } else {
      console.error("Unable to reset admin user.");
    }

    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => null);
  }
}

main();
