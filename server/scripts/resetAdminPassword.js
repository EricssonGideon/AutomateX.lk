const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../models/User");
const { normalizeEmailAddress } = require("../utils/authRole");
const { connectToDatabase } = require("../utils/db");

dotenv.config();

const SALT_ROUNDS = 12;

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function validatePassword(password) {
  if (password.length < 8 || password.length > 128) {
    throw new Error("ADMIN_PASSWORD must be between 8 and 128 characters long.");
  }
}

async function resetAdminPassword() {
  const email = normalizeEmailAddress(getRequiredEnv("ADMIN_EMAIL"));
  const password = getRequiredEnv("ADMIN_PASSWORD");

  validatePassword(password);

  const connection = await connectToDatabase();
  if (!connection) {
    throw new Error("Database connection failed. Check MONGO_URI or MONGODB_URI.");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const existingUser = await User.findOne({ email });

  if (!existingUser) {
    throw new Error(`No existing user was found for ADMIN_EMAIL ${email}. Run seed:admin only if you intend to create the admin account.`);
  }

  existingUser.passwordHash = passwordHash;
  existingUser.role = "admin";
  existingUser.status = "active";
  existingUser.isActive = true;
  existingUser.accountStatus = "active";
  existingUser.onboardingStatus = "active";

  await existingUser.save();

  const savedUser = await User.findOne({ email }).select("+passwordHash");
  const passwordVerified = savedUser
    ? await bcrypt.compare(password, savedUser.passwordHash)
    : false;

  if (!passwordVerified) {
    throw new Error(`Admin password reset verification failed for ${email}.`);
  }

  console.log(`Admin password reset completed for ${email}.`);
  console.log("Password hash verification: passed.");
}

async function main() {
  try {
    await resetAdminPassword();
  } catch (error) {
    console.error(error.message || "Unable to reset admin password.");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => null);
  }
}

main();
