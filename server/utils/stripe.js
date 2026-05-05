const Stripe = require("stripe");

let stripeClient = null;

const PLAN_PRICE_ENV_MAP = {
  starter: "STRIPE_STARTER_PRICE_ID",
  standard: "STRIPE_STANDARD_PRICE_ID",
  pro: "STRIPE_PRO_PRICE_ID"
};

/**
 * Returns a lazily initialized Stripe SDK client.
 *
 * @returns {import("stripe")} Configured Stripe client.
 * @throws {Error} When the Stripe secret key is missing.
 */
function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

/**
 * Resolves the configured Stripe price ID for a SaaS plan.
 *
 * @param {"starter"|"standard"|"pro"} plan - The requested subscription plan.
 * @returns {string} Stripe price ID for the plan.
 * @throws {Error} When the plan is invalid or not configured.
 */
function getPriceIdForPlan(plan) {
  const envKey = PLAN_PRICE_ENV_MAP[plan];

  if (!envKey) {
    throw new Error("Unsupported billing plan.");
  }

  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(`Missing ${envKey} environment variable.`);
  }

  return priceId;
}

/**
 * Maps a Stripe price ID back to the internal AutomateX plan slug.
 *
 * @param {string|null|undefined} priceId - Stripe recurring price ID.
 * @returns {"starter"|"standard"|"pro"|null} Internal plan slug or null when unknown.
 */
function getPlanForPriceId(priceId) {
  if (!priceId) {
    return null;
  }

  return Object.entries(PLAN_PRICE_ENV_MAP).find(([, envKey]) => process.env[envKey] === priceId)?.[0] || null;
}

module.exports = {
  getStripeClient,
  getPriceIdForPlan,
  getPlanForPriceId
};
