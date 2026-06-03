const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../models/User");
const { normalizeEmailAddress, resolveTrustedRole } = require("../utils/authRole");
const { connectToDatabase } = require("../utils/db");

dotenv.config();

const SALT_ROUNDS = 12;
const DEFAULT_ADMIN_NAME = "AutomateX Admin";

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

  if (existingUser) {
    const trustedRole = resolveTrustedRole(existingUser);

    if (trustedRole !== "admin") {
      throw new Error(`Refusing to modify non-admin account for ${email}.`);
    }

    existingUser.passwordHash = passwordHash;
    existingUser.role = "admin";
    existingUser.status = "active";
    existingUser.isActive = true;

    await existingUser.save();
    console.log(`Admin password reset completed for ${email}.`);
    return;
  }

  await User.create({
    name: process.env.ADMIN_NAME ? String(process.env.ADMIN_NAME).trim() : DEFAULT_ADMIN_NAME,
    email,
    passwordHash,
    role: "admin",
    status: "active",
    isActive: true,
    accountStatus: "active",
    onboardingStatus: "active"
  });

  console.log(`Admin user created successfully for ${email}.`);
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
