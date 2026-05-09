const { URL } = require("url");
const mongoose = require("mongoose");

const User = require("../models/User");

function getConfiguredPublicEmail() {
  return [
    process.env.PUBLIC_LEAD_RECIPIENT_EMAIL,
    process.env.PUBLIC_INBOX_EMAIL,
    process.env.DEFAULT_PUBLIC_USER_EMAIL,
    process.env.ADMIN_EMAIL
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .find(Boolean);
}

async function resolveExplicitClientFromPublicProfileUrl(publicProfileUrl) {
  const parsedUrl = new URL(publicProfileUrl);
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const candidateId = segments[segments.length - 1];

  if (!mongoose.Types.ObjectId.isValid(candidateId)) {
    throw new Error("Invalid public profile URL.");
  }

  const client = await User.findOne({
    _id: candidateId,
    role: "client",
    isActive: true
  });

  if (!client) {
    throw new Error("Target client not found.");
  }

  return client;
}

async function resolveDefaultPublicAudienceUser() {
  const configuredEmail = getConfiguredPublicEmail();

  if (configuredEmail) {
    const configuredUser = await User.findOne({
      email: configuredEmail,
      isActive: true
    });

    if (configuredUser) {
      return configuredUser;
    }
  }

  const adminUser = await User.findOne({
    role: "admin",
    isActive: true
  }).sort({ createdAt: 1 });

  if (adminUser) {
    return adminUser;
  }

  const clientUser = await User.findOne({
    role: "client",
    isActive: true
  }).sort({ createdAt: 1 });

  if (clientUser) {
    return clientUser;
  }

  throw new Error("No public inbox user is configured.");
}

async function resolvePublicAudienceUser(publicProfileUrl = "") {
  const trimmedUrl = String(publicProfileUrl || "").trim();

  if (trimmedUrl) {
    return resolveExplicitClientFromPublicProfileUrl(trimmedUrl);
  }

  return resolveDefaultPublicAudienceUser();
}

module.exports = {
  resolvePublicAudienceUser
};
