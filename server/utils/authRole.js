const OFFICIAL_ADMIN_EMAIL = "automatex100@gmail.com";

function normalizeEmailAddress(email) {
  return String(email || "").trim().toLowerCase();
}

function isOfficialAdminEmail(email) {
  return normalizeEmailAddress(email) === OFFICIAL_ADMIN_EMAIL;
}

function resolveTrustedRole(userOrEmail) {
  const email = typeof userOrEmail === "string"
    ? userOrEmail
    : userOrEmail && userOrEmail.email;

  return isOfficialAdminEmail(email) ? "admin" : "client";
}

module.exports = {
  OFFICIAL_ADMIN_EMAIL,
  normalizeEmailAddress,
  isOfficialAdminEmail,
  resolveTrustedRole
};
