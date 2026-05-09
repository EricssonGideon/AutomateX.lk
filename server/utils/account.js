const PLAN_OPTIONS = ["not_assigned", "starter", "standard", "pro", "custom"];
const ACCOUNT_STATUS_OPTIONS = ["pending", "active", "suspended"];
const PAYMENT_STATUS_OPTIONS = ["pending", "paid", "unpaid", "overdue"];
const ONBOARDING_STATUS_OPTIONS = ["pending", "in_review", "approved", "active"];
const FEATURE_CATALOG = [
  { key: "ai-chatbot", label: "AI Chatbot" },
  { key: "booking-system", label: "Booking System" },
  { key: "inquiry-management", label: "Inquiry Management" },
  { key: "review-management", label: "Review Management" },
  { key: "billing-system", label: "Billing System" },
  { key: "whatsapp-automation", label: "WhatsApp Automation" },
  { key: "google-business-support", label: "Google Business Support" },
  { key: "website-maintenance", label: "Website Maintenance" }
];
const PLAN_DEFAULT_FEATURES = {
  not_assigned: [],
  starter: ["booking-system", "inquiry-management", "review-management", "billing-system"],
  standard: ["booking-system", "inquiry-management", "review-management", "billing-system", "whatsapp-automation", "google-business-support"],
  pro: [
    "ai-chatbot",
    "booking-system",
    "inquiry-management",
    "review-management",
    "billing-system",
    "whatsapp-automation",
    "google-business-support",
    "website-maintenance"
  ],
  custom: ["booking-system", "inquiry-management", "review-management", "billing-system"]
};

function normalizePlan(value) {
  if (typeof value !== "string") {
    return "not_assigned";
  }

  const normalized = value.trim().toLowerCase();
  if (PLAN_OPTIONS.includes(normalized)) {
    return normalized;
  }

  if (!normalized) {
    return "not_assigned";
  }

  return "custom";
}

function normalizeAccountStatus(value) {
  if (typeof value !== "string") {
    return "pending";
  }

  const normalized = value.trim().toLowerCase();
  return ACCOUNT_STATUS_OPTIONS.includes(normalized) ? normalized : "pending";
}

function resolveAccountStatus(user) {
  if (!user) {
    return "pending";
  }

  if (user.isActive === false) {
    return "suspended";
  }

  if (ACCOUNT_STATUS_OPTIONS.includes(user.accountStatus)) {
    return user.accountStatus;
  }

  const plan = normalizePlan(user.plan);
  return plan !== "not_assigned" ? "active" : "pending";
}

function normalizePaymentStatus(value) {
  if (typeof value !== "string") {
    return "pending";
  }

  const normalized = value.trim().toLowerCase();
  return PAYMENT_STATUS_OPTIONS.includes(normalized) ? normalized : "pending";
}

function normalizeAllowedFeatures(features) {
  if (!Array.isArray(features)) {
    return [];
  }

  const allowedKeys = new Set(FEATURE_CATALOG.map((feature) => feature.key));

  return [...new Set(
    features
      .map((feature) => String(feature || "").trim().toLowerCase())
      .filter((feature) => allowedKeys.has(feature))
  )];
}

function resolveAllowedFeatures(user) {
  if (user && Array.isArray(user.allowedFeatures)) {
    return normalizeAllowedFeatures(user.allowedFeatures);
  }

  const plan = normalizePlan(user && user.plan);
  return [...(PLAN_DEFAULT_FEATURES[plan] || [])];
}

function normalizeMonthlyFee(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return 0;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Number(numericValue.toFixed(2));
}

function normalizeNextPaymentDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveOnboardingStatus(user) {
  if (user.accountStatus === "suspended") {
    return "approved";
  }

  if (user.accountStatus === "active") {
    return user.paymentStatus === "paid" ? "active" : "approved";
  }

  const hasProfile = Boolean(
    (user.businessName && String(user.businessName).trim()) ||
    (user.businessType && String(user.businessType).trim()) ||
    (Array.isArray(user.services) && user.services.length)
  );

  return hasProfile ? "in_review" : "pending";
}

function hasCompletedBusinessProfile(user) {
  return Boolean(
    user.businessName &&
    user.businessType &&
    Array.isArray(user.services) &&
    user.services.length
  );
}

function buildFeatureAccess(user) {
  const allowedFeatures = resolveAllowedFeatures(user);
  const accountStatus = resolveAccountStatus(user);
  const isSuspended = accountStatus === "suspended";
  const isPending = accountStatus === "pending";

  return FEATURE_CATALOG.map((feature) => ({
    key: feature.key,
    label: feature.label,
    enabled: allowedFeatures.includes(feature.key) && accountStatus === "active",
    included: allowedFeatures.includes(feature.key),
    lockedReason: isSuspended
      ? "Your account is suspended. Please contact AutomateX support."
      : isPending
        ? "Your package is still pending admin approval."
        : allowedFeatures.includes(feature.key)
          ? ""
          : "Not included in your current package"
  }));
}

module.exports = {
  PLAN_OPTIONS,
  ACCOUNT_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  ONBOARDING_STATUS_OPTIONS,
  FEATURE_CATALOG,
  normalizePlan,
  normalizeAccountStatus,
  resolveAccountStatus,
  normalizePaymentStatus,
  normalizeAllowedFeatures,
  resolveAllowedFeatures,
  normalizeMonthlyFee,
  normalizeNextPaymentDate,
  resolveOnboardingStatus,
  hasCompletedBusinessProfile,
  buildFeatureAccess
};
