const { Resend } = require("resend");

let resendClient = null;

/**
 * Returns the configured sender email for transactional messages.
 *
 * @returns {string} Sender email address.
 */
function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL || "AutomateX <no-reply@automatex.com>";
}

/**
 * Returns the support email address shown in transactional messages.
 *
 * @returns {string} Support email address.
 */
function getSupportEmail() {
  return process.env.SUPPORT_EMAIL || "support@automatex.com";
}

/**
 * Returns the public client dashboard URL used in transactional messages.
 *
 * @returns {string} Dashboard URL.
 */
function getDashboardUrl() {
  return process.env.CLIENT_DASHBOARD_URL || "http://localhost:5000/dashboard.html";
}

/**
 * Escapes a string for safe HTML email interpolation.
 *
 * @param {unknown} value - The value to escape.
 * @returns {string} Escaped HTML-safe string.
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns a singleton Resend client when the API key is configured.
 *
 * @returns {Resend|null} Configured Resend client or null when not configured.
 */
function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

/**
 * Wraps email body content in a mobile-friendly inline-styled layout.
 *
 * @param {string} title - Email heading.
 * @param {string} intro - Lead paragraph.
 * @param {string} content - Inner HTML content block.
 * @returns {string} Full HTML email markup.
 */
function renderEmailLayout(title, intro, content) {
  return `
    <div style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="padding:32px 28px;background:#0f172a;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#22d3ee;">AutomateX</p>
            <h1 style="margin:0;font-size:28px;line-height:1.2;">${escapeHtml(title)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">${escapeHtml(intro)}</p>
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">Need help? Reply to this email or contact ${escapeHtml(getSupportEmail())}.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

/**
 * Builds a key-value details table for HTML email bodies.
 *
 * @param {Array<{label: string, value: unknown}>} rows - Details to render.
 * @returns {string} HTML details table.
 */
function renderDetailsTable(rows) {
  const bodyRows = rows
    .map((row) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;width:180px;">${escapeHtml(row.label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;">${escapeHtml(row.value)}</td>
      </tr>
    `)
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#ffffff;margin:0 0 20px;">
      ${bodyRows}
    </table>
  `;
}

/**
 * Renders a primary CTA button for HTML email bodies.
 *
 * @param {string} label - Button label.
 * @param {string} url - Destination URL.
 * @returns {string} Button HTML.
 */
function renderButton(label, url) {
  return `
    <div style="margin:24px 0;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#22d3ee;color:#082f49;text-decoration:none;font-weight:700;font-size:14px;">${escapeHtml(label)}</a>
    </div>
  `;
}

/**
 * Sends an email through Resend when configured.
 *
 * @param {{to: string, subject: string, html: string, text?: string}} payload - Email payload values.
 * @returns {Promise<{delivered: boolean, skipped: boolean, reason?: string, id?: string}>} Delivery result metadata.
 */
async function sendEmail({ to, subject, html, text }) {
  const resend = getResendClient();

  if (!resend) {
    return {
      delivered: false,
      skipped: true,
      reason: "RESEND_API_KEY is not configured."
    };
  }

  const response = await resend.emails.send({
    from: getFromEmail(),
    to,
    subject,
    html,
    text
  });

  return {
    delivered: true,
    skipped: false,
    id: response.data && response.data.id ? response.data.id : undefined
  };
}

/**
 * Sends a welcome email to a newly created client account.
 *
 * @param {{name: string, email: string, plan: string|null}} user - User receiving the email.
 * @returns {Promise<{delivered: boolean, skipped: boolean, reason?: string, id?: string}>} Delivery result metadata.
 */
async function sendWelcomeEmail(user) {
  const dashboardUrl = getDashboardUrl();
  const planLabel = user.plan && user.plan !== "not_assigned"
    ? user.plan
    : "Pending Admin Approval";

  return sendEmail({
    to: user.email,
    subject: "Welcome to AutomateX!",
    text: `Hi ${user.name}, welcome to AutomateX. Your current plan is ${planLabel}. Open your dashboard at ${dashboardUrl}. Need help? Contact ${getSupportEmail()}.`,
    html: renderEmailLayout(
      "Welcome to AutomateX!",
      `Hi ${user.name}, your AutomateX account is ready and we're excited to have you on board.`,
      `
        ${renderDetailsTable([
          { label: "Account name", value: user.name },
          { label: "Current plan", value: planLabel },
          { label: "Dashboard", value: dashboardUrl },
          { label: "Support", value: getSupportEmail() }
        ])}
        ${renderButton("Open your dashboard", dashboardUrl)}
      `
    )
  });
}

/**
 * Sends a booking notification to the subscribed client.
 *
 * @param {{name: string, email: string, date: string, time: string, service?: string, phone?: string}} booking - Booking details.
 * @param {{email: string, name?: string}} client - Client receiving the alert.
 * @returns {Promise<{delivered: boolean, skipped: boolean, reason?: string, id?: string}>} Delivery result metadata.
 */
async function sendBookingConfirmationToClient(booking, client) {
  return sendEmail({
    to: client.email,
    subject: `New booking received — ${booking.name}`,
    text: `A new booking was received from ${booking.name} (${booking.email}) for ${booking.date} at ${booking.time}. Service: ${booking.service || "General booking"}.`,
    html: renderEmailLayout(
      "New booking received",
      `A new booking has been created for your AutomateX workspace.`,
      `
        ${renderDetailsTable([
          { label: "Customer name", value: booking.name },
          { label: "Customer email", value: booking.email },
          { label: "Customer phone", value: booking.phone || "Not provided" },
          { label: "Date", value: booking.date },
          { label: "Time", value: booking.time },
          { label: "Service", value: booking.service || "General booking" }
        ])}
        ${renderButton("Open dashboard", getDashboardUrl())}
      `
    )
  });
}

/**
 * Sends a booking confirmation to the end customer who placed the booking.
 *
 * @param {{name: string, email: string, date: string, time: string, service?: string}} booking - Booking details.
 * @param {string} businessName - Business name shown to the customer.
 * @returns {Promise<{delivered: boolean, skipped: boolean, reason?: string, id?: string}>} Delivery result metadata.
 */
async function sendBookingConfirmationToCustomer(booking, businessName) {
  return sendEmail({
    to: booking.email,
    subject: `Your booking is confirmed at ${businessName}`,
    text: `Your booking at ${businessName} is confirmed for ${booking.date} at ${booking.time}. Service: ${booking.service || "General booking"}. If you need help, contact ${getSupportEmail()}.`,
    html: renderEmailLayout(
      `Your booking is confirmed at ${businessName}`,
      `Thanks ${booking.name}, your booking has been confirmed.`,
      `
        ${renderDetailsTable([
          { label: "Business", value: businessName },
          { label: "Date", value: booking.date },
          { label: "Time", value: booking.time },
          { label: "Service", value: booking.service || "General booking" },
          { label: "What to expect", value: "You'll receive follow-up communication if anything changes before your scheduled time." },
          { label: "Contact", value: getSupportEmail() }
        ])}
      `
    )
  });
}

/**
 * Sends a new inquiry notification to the subscribed client.
 *
 * @param {{name: string, email: string, message: string, createdAt?: Date|string}} inquiry - Inquiry details.
 * @param {{email: string}} client - Client receiving the alert.
 * @returns {Promise<{delivered: boolean, skipped: boolean, reason?: string, id?: string}>} Delivery result metadata.
 */
async function sendInquiryNotification(inquiry, client) {
  const replyUrl = `mailto:${encodeURIComponent(inquiry.email)}`;

  return sendEmail({
    to: client.email,
    subject: `New inquiry from ${inquiry.name}`,
    text: `New inquiry from ${inquiry.name} (${inquiry.email}). Message: ${inquiry.message}`,
    html: renderEmailLayout(
      "New inquiry received",
      "A new lead has contacted you through your AutomateX-powered form.",
      `
        ${renderDetailsTable([
          { label: "Contact name", value: inquiry.name },
          { label: "Contact email", value: inquiry.email },
          { label: "Received", value: inquiry.createdAt || "Just now" },
          { label: "Message", value: inquiry.message }
        ])}
        ${renderButton("Reply to inquiry", replyUrl)}
      `
    )
  });
}

/**
 * Sends a payment-failed warning to a subscribed client.
 *
 * @param {{name: string, email: string}} user - User receiving the warning.
 * @returns {Promise<{delivered: boolean, skipped: boolean, reason?: string, id?: string}>} Delivery result metadata.
 */
async function sendPaymentFailedWarning(user) {
  const billingUrl = `${getDashboardUrl()}?tab=billing`;

  return sendEmail({
    to: user.email,
    subject: "Action required — AutomateX payment failed",
    text: `Hi ${user.name}, your AutomateX subscription payment failed. Please update your payment method at ${billingUrl} to avoid service interruption.`,
    html: renderEmailLayout(
      "Payment update required",
      `Hi ${user.name}, we couldn't process your latest AutomateX subscription payment.`,
      `
        <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#334155;">Please update your payment method soon. If the issue is not resolved, your subscription features may be paused.</p>
        ${renderButton("Update payment method", billingUrl)}
      `
    )
  });
}

/**
 * Sends a weekly SaaS activity summary to a client.
 *
 * @param {{name: string, email: string}} user - User receiving the summary.
 * @param {{bookingsThisWeek: number, inquiriesThisWeek: number, reviewsReceived: number}} stats - Weekly metric summary.
 * @returns {Promise<{delivered: boolean, skipped: boolean, reason?: string, id?: string}>} Delivery result metadata.
 */
async function sendWeeklySummary(user, stats) {
  return sendEmail({
    to: user.email,
    subject: "Your AutomateX weekly summary",
    text: `Hi ${user.name}, this week you received ${stats.bookingsThisWeek} bookings, ${stats.inquiriesThisWeek} inquiries, and ${stats.reviewsReceived} reviews.`,
    html: renderEmailLayout(
      "Your AutomateX weekly summary",
      `Hi ${user.name}, here's a quick look at how your workspace performed this week.`,
      `
        ${renderDetailsTable([
          { label: "Bookings this week", value: stats.bookingsThisWeek },
          { label: "Inquiries this week", value: stats.inquiriesThisWeek },
          { label: "Reviews received", value: stats.reviewsReceived }
        ])}
        ${renderButton("Open dashboard", getDashboardUrl())}
      `
    )
  });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendBookingConfirmationToClient,
  sendBookingConfirmationToCustomer,
  sendInquiryNotification,
  sendPaymentFailedWarning,
  sendWeeklySummary
};
