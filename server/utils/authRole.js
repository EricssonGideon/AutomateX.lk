const OFFICIAL_ADMIN_EMAIL = "automatex100@gmail.com";
const ADMIN_ROLE_OPTIONS = ["admin", "manager", "staff"];
const ROLE_OPTIONS = [...ADMIN_ROLE_OPTIONS, "client"];

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
  const role = typeof userOrEmail === "object" && userOrEmail
    ? String(userOrEmail.role || "").trim().toLowerCase()
    : "";

  if (isOfficialAdminEmail(email)) {
    return "admin";
  }

  return ROLE_OPTIONS.includes(role) ? role : "client";
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return ROLE_OPTIONS.includes(normalized) ? normalized : "";
}

function isAdminRole(role) {
  return ADMIN_ROLE_OPTIONS.includes(String(role || "").trim().toLowerCase());
}

module.exports = {
  ADMIN_ROLE_OPTIONS,
  OFFICIAL_ADMIN_EMAIL,
  ROLE_OPTIONS,
  isAdminRole,
  normalizeEmailAddress,
  normalizeRole,
  isOfficialAdminEmail,
  resolveTrustedRole
};
