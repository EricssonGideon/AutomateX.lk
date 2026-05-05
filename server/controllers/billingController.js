const { body, validationResult } = require("express-validator");

const User = require("../models/User");
const {
  sendEmail,
  sendPaymentFailedWarning
} = require("../utils/email");
const { sendSuccess, sendValidationError, sendError } = require("../utils/response");
const { getStripeClient, getPriceIdForPlan, getPlanForPriceId } = require("../utils/stripe");

const BILLING_PLANS = ["starter", "standard", "pro"];

const checkoutValidators = [
  body("plan")
    .trim()
    .isIn(BILLING_PLANS)
    .withMessage("Plan must be starter, standard, or pro.")
];

/**
 * Extracts validation messages from an express-validator pipeline.
 *
 * @param {import("express").Request} req - The incoming request.
 * @returns {string[]} Flat validation error list.
 */
function validationMessages(req) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return [];
  }

  return result.array().map((error) => error.msg);
}

/**
 * Resolves the application's public base URL for Stripe redirects.
 *
 * @param {import("express").Request} req - The incoming request.
 * @returns {string} Public base URL.
 */
function getBaseUrl(req) {
  return process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
}

/**
 * Resolves the client dashboard redirect destination after successful checkout.
 *
 * @param {import("express").Request} req - The incoming request.
 * @returns {string} Redirect destination.
 */
function getClientDashboardUrl(req) {
  return process.env.CLIENT_DASHBOARD_URL || `${getBaseUrl(req)}/dashboard.html`;
}

/**
 * Creates or retrieves the Stripe customer linked to a user.
 *
 * @param {import("../models/User")} user - The authenticated user.
 * @returns {Promise<{customerId: string, user: import("../models/User")}>} Stripe customer ID and updated user.
 */
async function ensureStripeCustomer(user) {
  const stripe = getStripeClient();

  if (user.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
      if (!customer.deleted) {
        return {
          customerId: user.stripeCustomerId,
          user
        };
      }
    } catch (_error) {
      // Fall through and create a replacement customer record.
    }
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      userId: String(user._id)
    }
  });

  user.stripeCustomerId = customer.id;
  await user.save();

  return {
    customerId: customer.id,
    user
  };
}

/**
 * Finds a local user using Stripe customer metadata or stored customer ID.
 *
 * @param {string|import("stripe").Stripe.Customer|null} customerRef - Customer object or customer ID from Stripe.
 * @returns {Promise<import("../models/User")|null>} Matching AutomateX user if found.
 */
async function findUserByStripeCustomer(customerRef) {
  const stripe = getStripeClient();
  let customer = customerRef;

  if (!customer) {
    return null;
  }

  if (typeof customerRef === "string") {
    customer = await stripe.customers.retrieve(customerRef);
  }

  if (!customer || customer.deleted) {
    return null;
  }

  if (customer.metadata && customer.metadata.userId) {
    const user = await User.findById(customer.metadata.userId);
    if (user) {
      if (!user.stripeCustomerId) {
        user.stripeCustomerId = customer.id;
        await user.save();
      }
      return user;
    }
  }

  if (customer.id) {
    return User.findOne({ stripeCustomerId: customer.id });
  }

  return null;
}

/**
 * Applies subscription fields to a user based on a Stripe subscription object.
 *
 * @param {import("../models/User")} user - The local user record to update.
 * @param {import("stripe").Stripe.Subscription} subscription - Stripe subscription payload.
 * @returns {Promise<void>} Resolves after persistence.
 */
async function applySubscriptionToUser(user, subscription) {
  const lineItem = subscription.items && subscription.items.data && subscription.items.data[0];
  const priceId = lineItem && lineItem.price ? lineItem.price.id : null;
  const nextPlan = getPlanForPriceId(priceId);

  user.plan = nextPlan;
  user.isActive = true;
  user.stripeCustomerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer && subscription.customer.id
      ? subscription.customer.id
      : user.stripeCustomerId;
  user.stripeSubscriptionId = subscription.id || "";
  user.planExpiresAt = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  await user.save();
}

/**
 * Creates a Stripe Checkout Session for the chosen plan.
 *
 * @param {import("express").Request} req - The incoming authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Checkout URL response.
 */
async function createCheckoutSession(req, res) {
  try {
    const details = validationMessages(req);
    if (details.length) {
      return sendValidationError(res, "Please choose a valid billing plan.", details);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    const plan = String(req.body.plan || "").trim();
    const priceId = getPriceIdForPlan(plan);
    const stripe = getStripeClient();
    const baseUrl = getBaseUrl(req);
    const { customerId } = await ensureStripeCustomer(user);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${baseUrl}/api/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      client_reference_id: String(user._id),
      metadata: {
        userId: String(user._id),
        plan
      }
    });

    if (!session.url) {
      return sendError(res, 500, "Stripe did not return a checkout URL.");
    }

    return sendSuccess(res, 200, {
      checkoutUrl: session.url
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Unable to create the checkout session.");
  }
}

/**
 * Verifies a completed Stripe Checkout Session and upgrades the matching user.
 *
 * @param {import("express").Request} req - The incoming Stripe redirect request.
 * @param {import("express").Response} res - The outgoing redirect response.
 * @returns {Promise<void>} Redirects the browser after processing.
 */
async function handleBillingSuccess(req, res) {
  try {
    const sessionId = String(req.query.session_id || "").trim();
    if (!sessionId) {
      return res.redirect(`${getClientDashboardUrl(req)}?billing=missing-session`);
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"]
    });

    if (!session || session.payment_status !== "paid" || session.mode !== "subscription") {
      return res.redirect(`${getClientDashboardUrl(req)}?billing=unverified`);
    }

    const userId = session.metadata && session.metadata.userId
      ? session.metadata.userId
      : session.client_reference_id;

    let user = userId ? await User.findById(userId) : null;
    if (!user) {
      user = await findUserByStripeCustomer(session.customer || null);
    }

    if (!user) {
      return res.redirect(`${getClientDashboardUrl(req)}?billing=user-not-found`);
    }

    if (!session.subscription || typeof session.subscription === "string") {
      return res.redirect(`${getClientDashboardUrl(req)}?billing=missing-subscription`);
    }

    await applySubscriptionToUser(user, session.subscription);
    return res.redirect(`${getClientDashboardUrl(req)}?billing=success`);
  } catch (_error) {
    return res.redirect(`${getClientDashboardUrl(req)}?billing=error`);
  }
}

/**
 * Creates a Stripe Customer Portal session for an authenticated customer.
 *
 * @param {import("express").Request} req - The incoming authenticated request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Portal URL response.
 */
async function createBillingPortal(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    const stripe = getStripeClient();
    const { customerId } = await ensureStripeCustomer(user);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: getClientDashboardUrl(req)
    });

    return sendSuccess(res, 200, {
      portalUrl: portalSession.url
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Unable to create the billing portal session.");
  }
}

/**
 * Handles Stripe subscription updates by syncing the user's plan and renewal date.
 *
 * @param {import("stripe").Stripe.Subscription} subscription - Stripe subscription payload.
 * @returns {Promise<void>} Resolves after the user is updated.
 */
async function handleSubscriptionUpdated(subscription) {
  const user = await findUserByStripeCustomer(subscription.customer);
  if (!user) {
    return;
  }

  await applySubscriptionToUser(user, subscription);
}

/**
 * Handles Stripe subscription deletion by deactivating the associated tenant.
 *
 * @param {import("stripe").Stripe.Subscription} subscription - Stripe subscription payload.
 * @returns {Promise<void>} Resolves after the user is updated.
 */
async function handleSubscriptionDeleted(subscription) {
  const user = await findUserByStripeCustomer(subscription.customer);
  if (!user) {
    return;
  }

  user.plan = null;
  user.isActive = false;
  user.stripeSubscriptionId = "";
  user.planExpiresAt = null;
  await user.save();
}

/**
 * Sends a billing warning email after an invoice payment failure.
 *
 * @param {import("stripe").Stripe.Invoice} invoice - Stripe invoice payload.
 * @returns {Promise<void>} Resolves after the email attempt.
 */
async function handleInvoicePaymentFailed(invoice) {
  const user = await findUserByStripeCustomer(invoice.customer || null);
  if (!user) {
    return;
  }

  await sendPaymentFailedWarning(user);
}

/**
 * Logs successful invoice payments and emails a receipt notice to the client.
 *
 * @param {import("stripe").Stripe.Invoice} invoice - Stripe invoice payload.
 * @returns {Promise<void>} Resolves after logging and the email attempt.
 */
async function handleInvoicePaymentSucceeded(invoice) {
  const user = await findUserByStripeCustomer(invoice.customer || null);
  if (!user) {
    return;
  }

  console.log("Stripe invoice payment succeeded", {
    userId: String(user._id),
    invoiceId: invoice.id,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency
  });

  await sendEmail({
    to: user.email,
    subject: "AutomateX payment received",
    text: `Hi ${user.name}, we received your AutomateX subscription payment successfully. Thank you for staying with us.`,
    html: `<p>Hi ${user.name},</p><p>We received your AutomateX subscription payment successfully. Thank you for staying with us.</p>`
  });
}

/**
 * Verifies a Stripe webhook signature and processes supported billing events.
 *
 * @param {import("express").Request & {body: Buffer}} req - The incoming raw webhook request.
 * @param {import("express").Response} res - The outgoing response.
 * @returns {Promise<import("express").Response>} Webhook acknowledgement response.
 */
async function handleBillingWebhook(req, res) {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return sendError(res, 500, "Missing STRIPE_WEBHOOK_SECRET environment variable.");
    }

    const stripe = getStripeClient();
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return sendError(res, 400, "Missing Stripe signature header.");
    }

    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      default:
        break;
    }

    return sendSuccess(res, 200, { received: true });
  } catch (error) {
    return sendError(res, 400, error.message || "Stripe webhook verification failed.");
  }
}

module.exports = {
  checkoutValidators,
  createCheckoutSession,
  handleBillingSuccess,
  createBillingPortal,
  handleBillingWebhook
};
