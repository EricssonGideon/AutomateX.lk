const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../models/User");
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

async function createOrPromoteAdmin() {
  const name = getRequiredEnv("ADMIN_NAME");
  const email = getRequiredEnv("ADMIN_EMAIL").toLowerCase();
  const password = getRequiredEnv("ADMIN_PASSWORD");

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters long.");
  }

  const connection = await connectToDatabase();

  if (!connection) {
    throw new Error("Database connection failed. Check MONGO_URI or MONGODB_URI.");
  }

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    const updates = {};

    if (existingUser.role !== "admin") {
      updates.role = "admin";
    }

    if (!existingUser.isActive) {
      updates.isActive = true;
    }

    if (!Object.keys(updates).length) {
      console.log(`Admin already exists for ${email}. No changes were needed.`);
      return;
    }

    await User.updateOne({ _id: existingUser._id }, { $set: updates });
    console.log(`Existing user ${email} was promoted to admin safely.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await User.create({
    name,
    email,
    passwordHash,
    role: "admin",
    isActive: true
  });

  console.log(`Admin user created successfully for ${email}.`);
}

async function main() {
  try {
    await createOrPromoteAdmin();
  } catch (error) {
    console.error(error.message || "Unable to create admin user.");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => null);
  }
}

main();
