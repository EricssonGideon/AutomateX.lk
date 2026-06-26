/* eslint-disable no-unused-vars */

    const OFFICIAL_ADMIN_EMAIL = "automatex100@gmail.com";
    const TOKEN_KEY = "automatex_admin_token";
    const USER_KEY = "automatex_admin_user";
    const CSRF_TOKEN_KEY = "automatex_csrf_token";
    const AUTH_STORAGE_KEYS = [
      "automatex_admin_token",
      "automatex_client_token",
      "automatex_token",
      "automatex_admin_user",
      "automatex_client_user",
      CSRF_TOKEN_KEY
    ];
    const LOGOUT_MARKER_KEY = "automatex_auth_logged_out_at";
    const THEME_KEY = "automatex_admin_theme";
    const PLAN_PRICE_MAP = {
      not_assigned: 0,
      starter: 49,
      standard: 99,
      pro: 199,
      custom: 0
    };
    const FEATURE_OPTIONS = [
      { key: "ai-chatbot", label: "AI Chatbot" },
      { key: "booking-system", label: "Booking Management" },
      { key: "review-management", label: "Review Management" },
      { key: "inquiry-management", label: "Inquiry Management" },
      { key: "billing-system", label: "Billing Tools" },
      { key: "google-business-support", label: "Analytics / Business Support" },
      { key: "whatsapp-automation", label: "WhatsApp Feature" },
      { key: "website-maintenance", label: "Premium Support / Website Integration" }
    ];
    const PLAN_FEATURE_DEFAULTS = {
      not_assigned: [],
      starter: ["booking-system", "inquiry-management", "review-management", "billing-system"],
      standard: [
        "booking-system",
        "inquiry-management",
        "review-management",
        "billing-system",
        "whatsapp-automation",
        "google-business-support"
      ],
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
      custom: []
    };
    const CLIENT_ACCOUNT_STATUS_OPTIONS = ["pending", "active", "suspended", "rejected"];
    const CLIENT_PAYMENT_STATUS_OPTIONS = ["pending", "paid", "overdue", "trial"];
    const INVOICE_STATUS_OPTIONS = ["draft", "sent", "partial", "paid", "overdue", "cancelled"];
    const INVOICE_TYPE_OPTIONS = ["Project", "Maintenance", "Upgrade", "Custom"];
    const INVOICE_PAYMENT_METHOD_OPTIONS = ["Cash", "Bank Transfer", "Online", "Card", "Other"];
    const REQUEST_TYPE_OPTIONS = ["support", "upgrade", "bug", "feature", "payment", "general"];
    const REQUEST_STATUS_OPTIONS = ["open", "in_progress", "resolved", "rejected", "closed"];
    const REQUEST_PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"];
    const REQUEST_PACKAGE_OPTIONS = ["starter", "standard", "pro", "custom"];
    const PROJECT_TYPE_OPTIONS = ["Website", "POS System", "Business System", "School System", "Clinic System", "Pharmacy System", "Tuition System", "Hotel System", "AI Chatbot", "Automation", "WhatsApp Automation", "E-commerce", "Custom Software", "Other"];
    const PROJECT_STATUS_OPTIONS = ["Inquiry", "Planning", "In Progress", "Waiting for Client", "Testing", "Completed", "On Hold", "Cancelled"];
    const PROJECT_PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];
    const MILESTONE_STATUS_OPTIONS = ["Pending", "In Progress", "Completed"];
    const DELIVERABLE_STATUS_OPTIONS = ["Pending", "Delivered", "Approved"];
    const PROJECT_FILE_TYPE_OPTIONS = ["Requirement", "Proposal", "Agreement", "Invoice", "Design", "Source Code", "Final Delivery", "Training Document", "Other"];
    const PROJECT_FILE_VISIBILITY_OPTIONS = ["Admin Only", "Client Visible"];
    const MAINTENANCE_PLAN_TYPE_OPTIONS = ["Monthly", "Quarterly", "Yearly", "One Time", "Custom"];
    const MAINTENANCE_STATUS_OPTIONS = ["Active", "Expiring Soon", "Expired", "Cancelled", "Pending"];
    const MAINTENANCE_PAYMENT_STATUS_OPTIONS = ["Paid", "Pending", "Partial", "Overdue"];
    const SALES_EXECUTIVE_STATUS_OPTIONS = ["Active", "Inactive", "Suspended"];
    const SALES_EXECUTIVE_WORK_TYPE_OPTIONS = ["Part Time", "Full Time", "Freelancer"];
    const SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS = ["Cash", "Bank Transfer", "Online", "Other"];
    const SALES_COMMISSION_RULE_TYPE_OPTIONS = ["Fixed Target", "Percentage", "Custom"];
    const LEAD_INTERESTED_SERVICE_OPTIONS = PROJECT_TYPE_OPTIONS;
    const LEAD_SOURCE_OPTIONS = ["Sales Executive", "Website", "WhatsApp", "Facebook", "Instagram", "Referral", "Other"];
    const LEAD_STATUS_OPTIONS = ["New Lead", "New", "Contacted", "Follow Up", "Interested", "Proposal Sent", "Quotation Sent", "Payment Pending", "Paid / Closed", "Converted", "Rejected", "Not Interested", "Cancelled", "Not Responding"];
    const LEAD_PRIORITY_OPTIONS = ["Low", "Medium", "High"];
    const COMMISSION_TYPE_OPTIONS = ["Base Target", "Extra Client", "Percentage", "Manual Bonus", "Adjustment"];
    const COMMISSION_STATUS_OPTIONS = ["Pending", "Approved", "Paid", "Cancelled"];
    const ADMIN_ROLE_OPTIONS = ["admin", "manager", "staff", "client"];
    const USER_STATUS_OPTIONS = ["active", "inactive", "suspended"];
    const DEFAULT_APP_SETTINGS = {
      companyName: "AutomateX",
      companyEmail: OFFICIAL_ADMIN_EMAIL,
      companyPhone: "",
      whatsappNumber: "",
      businessAddress: "",
      websiteUrl: "",
      logoUrl: "",
      invoicePrefix: "AX-INV",
      defaultCurrency: "LKR",
      defaultTaxRate: 0,
      defaultPaymentTerms: 30,
      supportEmail: OFFICIAL_ADMIN_EMAIL,
      defaultSupportMessage: "",
      paymentInstructions: "",
      bankName: "",
      bankAccountName: "",
      bankAccountNumber: "",
      bankBranch: "",
      createdAt: null,
      updatedAt: null
    };
    const SECTION_META = {
      dashboard: {
        title: "Dashboard",
        subtitle: "Review approvals, income, and platform activity from the Admin Panel."
      },
      clients: {
        title: "Clients",
        subtitle: "Manage client accounts, package assignment, billing state, and operational readiness."
      },
      "pending-approvals": {
        title: "Pending Approvals",
        subtitle: "Review waiting signups, assign the right package, and activate dashboard access professionally."
      },
      packages: {
        title: "Packages",
        subtitle: "See how service tiers are distributed across the AutomateX client base."
      },
      invoices: {
        title: "Payments & Invoices",
        subtitle: "Create invoices, track balances, and follow payment progress without changing the current payment-gateway setup."
      },
      payments: {
        title: "Payments",
        subtitle: "Review unpaid balances, payment states, and expected recurring income across active accounts."
      },
      projects: {
        title: "Projects",
        subtitle: "Manage AutomateX client projects, milestones, deliverables, deadlines, and payment progress."
      },
      sales: {
        title: "Employees",
        subtitle: "Manage employees, login access, lead approval, targets, and commission tracking."
      },
      bookings: {
        title: "Bookings",
        subtitle: "Manage booking activity platform-wide without altering the public booking experience."
      },
      inquiries: {
        title: "Inquiries",
        subtitle: "Track current inquiries, follow-up progress, and message volume across AutomateX."
      },
      reviews: {
        title: "Reviews",
        subtitle: "Moderate customer reviews with clear visibility into the connected client business."
      },
      support: {
        title: "Support Requests",
        subtitle: "Manage support, upgrade, bug, feature, and payment requests from active AutomateX clients."
      },
      reports: {
        title: "Reports",
        subtitle: "Review income, clients, packages, and support, then download CSV reports from the Admin Panel."
      },
      users: {
        title: "Users & Roles",
        subtitle: "Manage admin, manager, staff, and client access without exposing passwords or authentication secrets."
      },
      "audit-logs": {
        title: "Audit Logs",
        subtitle: "Review protected admin activity, severity, actor details, target records, IP addresses, and before/after summaries."
      },
      settings: {
        title: "Settings",
        subtitle: "Manage AutomateX business defaults, billing settings, support contacts, and Admin Panel preferences."
      }
    };
    const state = {
      currentSection: "dashboard",
      admin: null,
      stats: null,
      appSettings: null,
      reportsSummary: null,
      reportOverview: null,
      allClients: [],
      allInvoices: [],
      allProjects: [],
      allMaintenancePlans: [],
      allSalesExecutives: [],
      allLeads: [],
      allCommissions: [],
      salesSummary: null,
      allRequests: [],
      allBookings: [],
      allInquiries: [],
      allReviews: [],
      allUsers: [],
      allAuditLogs: [],
      drawer: null
    };
    const ROLE_PERMISSION_MAP = {
      admin: ["*"],
      manager: [
        "stats:view",
        "reports:view",
        "reports:export",
        "clients:view",
        "clients:manage",
        "invoices:view",
        "invoices:manage",
        "invoices:payment-update",
        "invoices:send-email",
        "bookings:view",
        "bookings:manage",
        "inquiries:view",
        "inquiries:manage",
        "reviews:view",
        "reviews:manage",
        "projects:view",
        "projects:manage",
        "projects:update-status",
        "files:view",
        "files:manage",
        "maintenance:view",
        "maintenance:manage",
        "sales:view",
        "sales:manage",
        "leads:view",
        "leads:manage",
        "commissions:view",
        "commissions:manage",
        "commissions:approve",
        "support:view",
        "support:manage"
      ],
      staff: [
        "stats:view",
        "reports:view",
        "clients:view",
        "invoices:view",
        "bookings:view",
        "inquiries:view",
        "reviews:view",
        "projects:view",
        "projects:update-status",
        "files:view",
        "maintenance:view",
        "sales:view",
        "leads:view",
        "commissions:view",
        "support:view",
        "support:manage"
      ],
      client: []
    };

    function getStoredValue(key) {
      return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
    }

    function removeStoredValue(key) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }

    function clearLogoutMarker() {
      removeStoredValue(LOGOUT_MARKER_KEY);
    }

    function markExplicitLogout() {
      const timestamp = String(Date.now());
      localStorage.setItem(LOGOUT_MARKER_KEY, timestamp);
      sessionStorage.setItem(LOGOUT_MARKER_KEY, timestamp);
    }

    function clearAuthStorage(options = {}) {
      AUTH_STORAGE_KEYS.forEach(removeStoredValue);

      if (options.markLoggedOut) {
        markExplicitLogout();
        return;
      }

      if (!options.preserveLogoutMarker) {
        clearLogoutMarker();
      }
    }

    function getToken() {
      return getStoredValue(TOKEN_KEY) || "";
    }

    function getCsrfToken() {
      return getStoredValue(CSRF_TOKEN_KEY) || "";
    }

    function redirectToLogin() {
      clearAuthStorage({ markLoggedOut: true });
      window.location.replace("/admin-login.html");
    }

    function redirectNonAdminUser(role) {
      if (role === "client") {
        window.location.replace("/dashboard.html");
        return;
      }
      if (role === "employee") {
        window.location.replace("/employee.html");
        return;
      }

      redirectToLogin();
    }

    function isAdminUser(user) {
      return Boolean(user && ["admin", "manager", "staff"].includes(String(user.role || "").toLowerCase()));
    }

    function canManageSystem() {
      return Boolean(state.admin && state.admin.role === "admin");
    }

    function hasAdminPermission(permission) {
      const role = String(state.admin && state.admin.role || "").toLowerCase();
      const permissions = ROLE_PERMISSION_MAP[role] || [];

      return permissions.includes("*") || permissions.includes(permission);
    }

    function applyRoleVisibility() {
      document.querySelectorAll(".system-admin-only").forEach((element) => {
        element.style.display = canManageSystem() ? "" : "none";
      });
      document.querySelectorAll("[data-required-permission]").forEach((element) => {
        const isAllowed = hasAdminPermission(element.dataset.requiredPermission);
        element.hidden = !isAllowed;
        element.disabled = !isAllowed;
        element.setAttribute("aria-hidden", String(!isAllowed));
      });
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function toNumber(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function normalizeCurrencyCode(value, fallback = DEFAULT_APP_SETTINGS.defaultCurrency) {
      const normalized = String(value || fallback).trim().toUpperCase();

      if (!normalized) {
        return fallback;
      }

      try {
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: normalized
        });
        return normalized;
      } catch (_error) {
        return fallback;
      }
    }

    function formatCurrency(value) {
      return new Intl.NumberFormat("en-LK", {
        style: "currency",
        currency: normalizeCurrencyCode(state.appSettings && state.appSettings.defaultCurrency),
        currencyDisplay: "code",
        maximumFractionDigits: 0
      }).format(toNumber(value)).replace(/\u00A0/g, " ");
    }

    function formatInvoiceCurrency(value, currency = "LKR") {
      return new Intl.NumberFormat("en-LK", {
        style: "currency",
        currency: normalizeCurrencyCode(currency),
        currencyDisplay: "code",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(toNumber(value)).replace(/\u00A0/g, " ");
    }

    function formatDate(value) {
      if (!value) {
        return "—";
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return "—";
      }

      return parsed.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    }

    function formatShortDate(value) {
      if (!value) {
        return "—";
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return "—";
      }

      return parsed.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    }

    function toDateInputValue(value) {
      if (!value) {
        return "";
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return "";
      }

      return parsed.toISOString().slice(0, 10);
    }

    function getAppSettings() {
      return {
        ...DEFAULT_APP_SETTINGS,
        ...(state.appSettings || {})
      };
    }

    function buildPaymentInstructionsText(settings = getAppSettings()) {
      return [
        settings.bankName ? `Bank: ${settings.bankName}` : "",
        settings.bankAccountName ? `Account Name: ${settings.bankAccountName}` : "",
        settings.bankAccountNumber ? `Account Number: ${settings.bankAccountNumber}` : "",
        settings.bankBranch ? `Branch: ${settings.bankBranch}` : "",
        settings.paymentInstructions || ""
      ].filter(Boolean).join("\n");
    }

    function calculateDueDateInputValue(issueDate, paymentTerms) {
      const baseDate = issueDate ? new Date(issueDate) : new Date();
      const days = Math.max(0, Math.round(toNumber(paymentTerms)));

      if (Number.isNaN(baseDate.getTime()) || days <= 0) {
        return "";
      }

      baseDate.setDate(baseDate.getDate() + days);
      return baseDate.toISOString().slice(0, 10);
    }

    function formatPlanLabel(plan) {
      if (!plan || plan === "not_assigned") {
        return "Not Assigned";
      }

      return String(plan)
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }

    function formatRequestTypeLabel(type) {
      const labels = {
        support: "General Support",
        upgrade: "Upgrade Request",
        bug: "Bug Report",
        feature: "Feature Request",
        payment: "Payment Question",
        general: "General"
      };

      return labels[String(type || "support")] || formatStatusLabel(type);
    }

    function formatRequestedPackageLabel(requestedPackage) {
      return requestedPackage ? formatPlanLabel(requestedPackage) : "Not requested";
    }

    function formatStatusLabel(value) {
      if (String(value || "").toLowerCase() === "resolved") {
        return "Completed";
      }

      return String(value || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function formatDisplayValue(value, fallback = "—") {
      if (value === null || value === undefined) {
        return fallback;
      }

      const normalized = String(value).trim();
      return normalized ? normalized : fallback;
    }

    function buildTitleAttribute(value) {
      const titleText = formatDisplayValue(value, "");
      return titleText ? ` title="${escapeHtml(titleText)}"` : "";
    }

    function renderTextValue(value, classes = "", options = {}) {
      const display = formatDisplayValue(value, options.fallback);
      const titleSource = options.title === false ? "" : (options.titleValue ?? value);
      const className = classes ? ` class="${classes}"` : "";

      return `<span${className}${buildTitleAttribute(titleSource)}>${escapeHtml(display)}</span>`;
    }

    function ratingStars(value) {
      const count = Math.max(0, Math.min(5, toNumber(value)));
      return `${"★".repeat(count)}${"☆".repeat(Math.max(0, 5 - count))}`;
    }

    function estimateClientFee(client) {
      const monthlyFee = toNumber(client && client.monthlyFee);
      if (monthlyFee > 0) {
        return monthlyFee;
      }

      return PLAN_PRICE_MAP[String(client && client.plan || "not_assigned")] || 0;
    }

    function getPlanFeatureDefaults(plan) {
      return [...(PLAN_FEATURE_DEFAULTS[String(plan || "not_assigned")] || [])];
    }

    function usesAutomaticFeatureDefaults(plan) {
      return ["starter", "standard", "pro", "not_assigned"].includes(String(plan || "not_assigned"));
    }

    function badgeClass(value) {
      const normalized = String(value || "pending").toLowerCase();

      if (["active", "paid", "confirmed", "completed", "published", "approved", "connected", "operational", "resolved"].includes(normalized)) {
        return "badge active";
      }

      if (["pending", "new", "open"].includes(normalized)) {
        return normalized === "new" ? "badge new" : "badge pending";
      }

      if (["contacted", "converted", "in_progress"].includes(normalized)) {
        return `badge ${normalized}`;
      }

      return `badge ${normalized}`;
    }

    function projectBadgeClass(value) {
      return badgeClass(String(value || "").toLowerCase().replace(/\s+/g, "_"));
    }

    function requestPriorityBadgeClass(priority) {
      const normalized = String(priority || "normal").toLowerCase();

      if (normalized === "urgent") {
        return "badge overdue";
      }

      if (normalized === "high") {
        return "badge pending";
      }

      if (normalized === "low") {
        return "badge draft";
      }

      return "badge in_progress";
    }

    function buildReportsActivityFeed() {
      const activity = state.reportsSummary && state.reportsSummary.activity
        ? state.reportsSummary.activity
        : {};
      const items = [];
      const pushItem = (item) => {
        if (item && item.date) {
          items.push(item);
        }
      };

      (activity.recentClients || []).forEach((client) => {
        pushItem({
          type: "Client",
          title: client.businessName || client.name || client.email || "New client",
          details: [client.name, client.email, formatPlanLabel(client.plan)].filter(Boolean).join(" • "),
          status: client.accountStatus || "pending",
          date: client.createdAt
        });
      });

      (activity.recentInvoices || []).forEach((invoice) => {
        pushItem({
          type: "Invoice",
          title: invoice.invoiceNumber || "Invoice",
          details: [
            invoice.businessName || invoice.clientName || "Client",
            invoice.title || "Manual invoice",
            formatInvoiceCurrency(invoice.totalAmount, invoice.currency)
          ].filter(Boolean).join(" • "),
          status: invoice.status || "draft",
          date: invoice.createdAt
        });
      });

      (activity.recentRequests || []).forEach((request) => {
        pushItem({
          type: "Request",
          title: formatRequestTypeLabel(request.type),
          details: [
            request.businessName || request.clientName || "Client",
            request.subject || "Support request",
            formatStatusLabel(request.priority || "normal")
          ].filter(Boolean).join(" • "),
          status: request.status || "open",
          date: request.createdAt
        });
      });

      (activity.recentBookings || []).forEach((booking) => {
        pushItem({
          type: "Booking",
          title: booking.service || booking.name || "Booking",
          details: [
            booking.clientBusinessName || booking.clientName || "Client",
            [booking.date, booking.time].filter(Boolean).join(" ")
          ].filter(Boolean).join(" • "),
          status: booking.status || "pending",
          date: booking.createdAt
        });
      });

      (activity.recentInquiries || []).forEach((inquiry) => {
        pushItem({
          type: "Inquiry",
          title: inquiry.name || "Inquiry",
          details: [
            inquiry.clientBusinessName || inquiry.clientName || "Client",
            (inquiry.message || "").slice(0, 72)
          ].filter(Boolean).join(" • "),
          status: inquiry.status || "new",
          date: inquiry.createdAt
        });
      });

      (activity.recentReviews || []).forEach((review) => {
        pushItem({
          type: "Review",
          title: review.name || "Review",
          details: [
            review.clientBusinessName || review.clientName || "Client",
            `${toNumber(review.rating)} stars`
          ].filter(Boolean).join(" • "),
          status: review.status || "pending",
          date: review.createdAt
        });
      });

      return items
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
        .slice(0, 12);
    }

    function normalizeDisplayReviewStatus(review) {
      if (!review || !review.status) {
        return "pending";
      }

      if (review.status === "published") {
        return "approved";
      }

      if (review.status === "hidden") {
        return "rejected";
      }

      return review.status;
    }

    function parseDateNumber(value) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    }

    function compareStrings(left, right) {
      return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
    }

    function matchesSearch(fields, searchTerm) {
      if (!searchTerm) {
        return true;
      }

      return fields.some((field) => String(field || "").toLowerCase().includes(searchTerm));
    }

    function getPendingApprovals() {
      return [...state.allClients]
        .filter((client) => client.accountStatus === "pending")
        .sort((left, right) => parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt));
    }

    function getClientFilters() {
      return {
        search: String(document.getElementById("clientSearch").value || "").trim().toLowerCase(),
        plan: document.getElementById("clientPlanFilter").value,
        accountStatus: document.getElementById("clientStatusFilter").value,
        paymentStatus: document.getElementById("clientPaymentFilter").value,
        sortBy: document.getElementById("clientSortBy").value
      };
    }

    function getFilteredClients() {
      const { search, plan, accountStatus, paymentStatus, sortBy } = getClientFilters();
      const items = state.allClients.filter((client) => {
        if (plan && client.plan !== plan) {
          return false;
        }

        if (accountStatus && client.accountStatus !== accountStatus) {
          return false;
        }

        if (paymentStatus && client.paymentStatus !== paymentStatus) {
          return false;
        }

        return matchesSearch(
          [client.businessName, client.name, client.email, client.phone, client.businessType, client.location],
          search
        );
      });

      items.sort((left, right) => {
        if (sortBy === "name") {
          return compareStrings(left.businessName || left.name, right.businessName || right.name);
        }

        if (sortBy === "monthlyFee") {
          return estimateClientFee(right) - estimateClientFee(left);
        }

        return parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt);
      });

      return items;
    }

    function getClientStatusCounts(items = state.allClients) {
      return items.reduce((totals, client) => {
        const status = String(client.accountStatus || "pending");
        totals[status] = (totals[status] || 0) + 1;
        return totals;
      }, {
        pending: 0,
        active: 0,
        suspended: 0,
        rejected: 0
      });
    }

    function getInvoiceClients() {
      return [...state.allClients]
        .filter((client) => client.accountStatus !== "rejected")
        .sort((left, right) => compareStrings(left.businessName || left.name, right.businessName || right.name));
    }

    function getInvoiceFilters() {
      return {
        search: String(document.getElementById("invoiceSearch").value || "").trim().toLowerCase(),
        status: document.getElementById("invoiceStatusFilter").value,
        invoiceType: document.getElementById("invoiceTypeFilter").value,
        month: String(document.getElementById("invoiceMonthFilter").value || "").trim(),
        dueFrom: String(document.getElementById("invoiceDueFromFilter").value || "").trim(),
        dueTo: String(document.getElementById("invoiceDueToFilter").value || "").trim()
      };
    }

    function getFilteredInvoices() {
      const { search, status, invoiceType, month, dueFrom, dueTo } = getInvoiceFilters();
      const invoices = state.allInvoices.filter((invoice) => {
        if (status && invoice.status !== status) {
          return false;
        }

        if (invoiceType && invoice.invoiceType !== invoiceType) {
          return false;
        }

        if (month) {
          const issueMonth = invoice.issueDate ? new Date(invoice.issueDate).toISOString().slice(0, 7) : "";
          const dueMonth = invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 7) : "";

          if (issueMonth !== month && dueMonth !== month) {
            return false;
          }
        }

        if (dueFrom || dueTo) {
          const dueTime = invoice.dueDate ? new Date(invoice.dueDate).getTime() : 0;
          const fromTime = dueFrom ? new Date(dueFrom).getTime() : 0;
          const toTime = dueTo ? new Date(`${dueTo}T23:59:59`).getTime() : 0;

          if (!dueTime || (fromTime && dueTime < fromTime) || (toTime && dueTime > toTime)) {
            return false;
          }
        }

        return matchesSearch(
          [
            invoice.invoiceNumber,
            invoice.clientName,
            invoice.clientEmail,
            invoice.businessName,
            invoice.invoiceType,
            invoice.projectTitle,
            invoice.maintenancePlanName,
            invoice.leadBusinessName,
            invoice.salesExecutiveName,
            invoice.title
          ],
          search
        );
      });

      invoices.sort((left, right) => {
        const dueDateDelta = parseDateNumber(right.dueDate) - parseDateNumber(left.dueDate);
        if (dueDateDelta !== 0) {
          return dueDateDelta;
        }

        return parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt);
      });

      return invoices;
    }

    function getInvoiceAnalytics(items = state.allInvoices) {
      return items.reduce((totals, invoice) => {
        totals.totalInvoices += 1;
        totals.totalValue += toNumber(invoice.totalAmount);
        totals.totalPaid += toNumber(invoice.paidAmount);
        totals.totalBalance += toNumber(invoice.balance);

        if (invoice.status === "paid") {
          totals.paidInvoices += 1;
        } else if (invoice.status === "overdue") {
          totals.overdueInvoices += 1;
        } else if (invoice.status !== "cancelled") {
          totals.pendingInvoices += 1;
        }

        totals.statusCounts[invoice.status] = (totals.statusCounts[invoice.status] || 0) + 1;
        return totals;
      }, {
        totalInvoices: 0,
        paidInvoices: 0,
        pendingInvoices: 0,
        overdueInvoices: 0,
        totalValue: 0,
        totalPaid: 0,
        totalBalance: 0,
        statusCounts: {
          draft: 0,
          sent: 0,
          partial: 0,
          paid: 0,
          overdue: 0,
          cancelled: 0
        }
      });
    }

    function getProjectFilters() {
      return {
        search: String(document.getElementById("projectSearch").value || "").trim().toLowerCase(),
        status: document.getElementById("projectStatusFilter").value,
        priority: document.getElementById("projectPriorityFilter").value,
        projectType: document.getElementById("projectTypeFilter").value
      };
    }

    function getFilteredProjects() {
      const { search, status, priority, projectType } = getProjectFilters();
      const projects = state.allProjects.filter((project) => {
        if (status && project.status !== status) {
          return false;
        }

        if (priority && project.priority !== priority) {
          return false;
        }

        if (projectType && project.projectType !== projectType) {
          return false;
        }

        return matchesSearch(
          [project.projectTitle, project.projectType, project.packageName, project.clientName, project.clientEmail, project.clientBusinessName],
          search
        );
      });

      projects.sort((left, right) => parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt));
      return projects;
    }

    function getProjectAnalytics(items = state.allProjects) {
      return items.reduce((totals, project) => {
        totals.totalProjects += 1;
        totals.balanceAmount += toNumber(project.balanceAmount);

        if (project.status === "Completed") {
          totals.completedProjects += 1;
        } else if (!["Cancelled", "On Hold"].includes(project.status)) {
          totals.activeProjects += 1;
        }

        if (project.priority === "High" || project.priority === "Urgent") {
          totals.highPriorityProjects += 1;
        }

        totals.averageProgress += toNumber(project.progressPercentage);
        return totals;
      }, {
        totalProjects: 0,
        activeProjects: 0,
        completedProjects: 0,
        highPriorityProjects: 0,
        averageProgress: 0,
        balanceAmount: 0
      });
    }

    function formatFileSize(value) {
      const size = Number(value || 0);

      if (!size) {
        return "Link";
      }

      if (size < 1024) {
        return `${size} B`;
      }

      if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
      }

      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    function getMaintenanceFilters() {
      return {
        search: String(document.getElementById("maintenanceSearch").value || "").trim().toLowerCase(),
        status: document.getElementById("maintenanceStatusFilter").value,
        paymentStatus: document.getElementById("maintenancePaymentFilter").value
      };
    }

    function getFilteredMaintenancePlans() {
      const { search, status, paymentStatus } = getMaintenanceFilters();

      return state.allMaintenancePlans.filter((plan) => {
        if (status && plan.status !== status) {
          return false;
        }

        if (paymentStatus && plan.paymentStatus !== paymentStatus) {
          return false;
        }

        if (!search) {
          return true;
        }

        return [plan.planName, plan.planType, plan.clientName, plan.clientEmail, plan.clientBusinessName, plan.projectTitle]
        .some((value) => String(value || "").toLowerCase().includes(search));
      }).sort((left, right) => parseDateNumber(left.renewalDate) - parseDateNumber(right.renewalDate));
    }

    function getSalesExecutiveFilters() {
      return {
        search: String(document.getElementById("salesExecutiveSearch").value || "").trim().toLowerCase(),
        status: document.getElementById("salesExecutiveStatusFilter").value,
        workType: document.getElementById("salesExecutiveWorkTypeFilter").value
      };
    }

    function getFilteredSalesExecutives() {
      const { search, status, workType } = getSalesExecutiveFilters();

      return state.allSalesExecutives.filter((executive) => {
        if (status && executive.status !== status) {
          return false;
        }

        if (workType && executive.workType !== workType) {
          return false;
        }

        if (!search) {
          return true;
        }

        return [executive.fullName, executive.phone, executive.email, executive.nicNumber]
          .some((value) => String(value || "").toLowerCase().includes(search));
      }).sort((left, right) => parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt));
    }

    function getLeadFilters() {
      return {
        search: String(document.getElementById("leadSearch").value || "").trim().toLowerCase(),
        salesExecutiveId: document.getElementById("leadSalesExecutiveFilter").value,
        status: document.getElementById("leadStatusFilter").value,
        interestedService: document.getElementById("leadServiceFilter").value,
        priority: document.getElementById("leadPriorityFilter").value
      };
    }

    function getFilteredLeads() {
      const { search, salesExecutiveId, status, interestedService, priority } = getLeadFilters();

      return state.allLeads.filter((lead) => {
        if (salesExecutiveId && lead.salesExecutiveId !== salesExecutiveId) {
          return false;
        }

        if (status && lead.status !== status) {
          return false;
        }

        if (interestedService && lead.interestedService !== interestedService) {
          return false;
        }

        if (priority && lead.priority !== priority) {
          return false;
        }

        if (!search) {
          return true;
        }

        return [lead.businessName, lead.contactPerson, lead.phone, lead.location]
          .some((value) => String(value || "").toLowerCase().includes(search));
      }).sort((left, right) => parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt));
    }

    function getCommissionFilters() {
      return {
        salesExecutiveId: document.getElementById("commissionSalesExecutiveFilter").value,
        status: document.getElementById("commissionStatusFilter").value,
        month: document.getElementById("commissionMonthFilter").value,
        year: document.getElementById("commissionYearFilter").value
      };
    }

    function getFilteredCommissions() {
      const { salesExecutiveId, status, month, year } = getCommissionFilters();

      return state.allCommissions.filter((commission) => {
        if (salesExecutiveId && commission.salesExecutiveId !== salesExecutiveId) {
          return false;
        }

        if (status && commission.status !== status) {
          return false;
        }

        if (month && Number(commission.commissionMonth) !== Number(month)) {
          return false;
        }

        if (year && Number(commission.commissionYear) !== Number(year)) {
          return false;
        }

        return true;
      }).sort((left, right) => {
        const leftKey = Number(left.commissionYear || 0) * 100 + Number(left.commissionMonth || 0);
        const rightKey = Number(right.commissionYear || 0) * 100 + Number(right.commissionMonth || 0);
        return rightKey - leftKey || parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt);
      });
    }

    function getSupportFilters() {
      return {
        search: String(document.getElementById("supportSearch").value || "").trim().toLowerCase(),
        type: document.getElementById("supportTypeFilter").value,
        status: document.getElementById("supportStatusFilter").value,
        priority: document.getElementById("supportPriorityFilter").value
      };
    }

    function getFilteredSupportRequests() {
      const { search, type, status, priority } = getSupportFilters();
      const requests = state.allRequests.filter((request) => {
        if (type && request.type !== type) {
          return false;
        }

        if (status && request.status !== status) {
          return false;
        }

        if (priority && request.priority !== priority) {
          return false;
        }

        return matchesSearch(
          [request.clientName, request.clientEmail, request.businessName, request.subject, request.message],
          search
        );
      });

      requests.sort((left, right) => parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt));
      return requests;
    }

    function getSupportRequestAnalytics(items = state.allRequests) {
      return items.reduce((totals, request) => {
        totals.totalRequests += 1;
        totals.statusCounts[request.status] = (totals.statusCounts[request.status] || 0) + 1;
        totals.typeCounts[request.type] = (totals.typeCounts[request.type] || 0) + 1;
        return totals;
      }, {
        totalRequests: 0,
        statusCounts: {
          open: 0,
          in_progress: 0,
          resolved: 0,
          rejected: 0,
          closed: 0
        },
        typeCounts: {
          support: 0,
          upgrade: 0,
          bug: 0,
          feature: 0,
          payment: 0,
          general: 0
        }
      });
    }

    function getBookingFilters() {
      return {
        search: String(document.getElementById("bookingSearch").value || "").trim().toLowerCase(),
        status: document.getElementById("bookingStatusFilter").value,
        date: String(document.getElementById("bookingDateFilter").value || "").trim(),
        sortBy: document.getElementById("bookingSortBy").value
      };
    }

    function getFilteredBookings() {
      const { search, status, date, sortBy } = getBookingFilters();
      const items = state.allBookings.filter((booking) => {
        if (status && booking.status !== status) {
          return false;
        }

        if (date && !String(booking.date || "").startsWith(date)) {
          return false;
        }

        return matchesSearch(
          [
            booking.name,
            booking.email,
            booking.phone,
            booking.service,
            booking.clientName,
            booking.clientEmail,
            booking.clientBusinessName
          ],
          search
        );
      });

      items.sort((left, right) => {
        if (sortBy === "date") {
          return compareStrings(`${right.date} ${right.time}`, `${left.date} ${left.time}`);
        }

        if (sortBy === "status") {
          return compareStrings(left.status, right.status);
        }

        return parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt);
      });

      return items;
    }

    function getInquiryFilters() {
      return {
        search: String(document.getElementById("inquirySearch").value || "").trim().toLowerCase(),
        status: document.getElementById("inquiryStatusFilter").value,
        sortBy: document.getElementById("inquirySortBy").value
      };
    }

    function getFilteredInquiries() {
      const { search, status, sortBy } = getInquiryFilters();
      const items = state.allInquiries.filter((inquiry) => {
        if (status && inquiry.status !== status) {
          return false;
        }

        return matchesSearch(
          [inquiry.name, inquiry.email, inquiry.message, inquiry.clientName, inquiry.clientBusinessName],
          search
        );
      });

      items.sort((left, right) => {
        if (sortBy === "name") {
          return compareStrings(left.name, right.name);
        }

        if (sortBy === "status") {
          return compareStrings(left.status, right.status);
        }

        return parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt);
      });

      return items;
    }

    function getReviewFilters() {
      return {
        search: String(document.getElementById("reviewSearch").value || "").trim().toLowerCase(),
        status: document.getElementById("reviewStatusFilter").value,
        rating: document.getElementById("reviewRatingFilter").value,
        sortBy: document.getElementById("reviewSortBy").value
      };
    }

    function getFilteredReviews() {
      const { search, status, rating, sortBy } = getReviewFilters();
      const items = state.allReviews.filter((review) => {
        if (status && normalizeDisplayReviewStatus(review) !== status) {
          return false;
        }

        if (rating && String(review.rating) !== rating) {
          return false;
        }

        return matchesSearch(
          [review.name, review.role, review.text, review.clientName, review.clientBusinessName],
          search
        );
      });

      items.sort((left, right) => {
        if (sortBy === "rating") {
          return toNumber(right.rating) - toNumber(left.rating);
        }

        if (sortBy === "status") {
          return compareStrings(normalizeDisplayReviewStatus(left), normalizeDisplayReviewStatus(right));
        }

        return parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt);
      });

      return items;
    }

    function getRecentItems(items, limit = 4) {
      return [...items]
        .sort((left, right) => parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt))
        .slice(0, limit);
    }

    function getPaymentAnalytics() {
      return state.allClients.reduce((totals, client) => {
        const fee = estimateClientFee(client);
        const status = String(client.paymentStatus || "pending");

        if (status === "paid") {
          totals.paidAccounts += 1;
          totals.estimatedPaidRevenue += fee;
        } else if (status === "overdue") {
          totals.overdueAccounts += 1;
          totals.overdueRevenue += fee;
        } else if (status === "pending" || status === "trial") {
          totals.pendingAccounts += 1;
          totals.pendingRevenue += fee;
        } else {
          totals.unpaidAccounts += 1;
          totals.pendingRevenue += fee;
        }

        if (client.nextPaymentDate) {
          totals.scheduledPayments += 1;
        }

        return totals;
      }, {
        paidAccounts: 0,
        estimatedPaidRevenue: 0,
        overdueAccounts: 0,
        overdueRevenue: 0,
        pendingAccounts: 0,
        unpaidAccounts: 0,
        pendingRevenue: 0,
        scheduledPayments: 0
      });
    }

    function getPackageAnalytics() {
      const groups = {
        not_assigned: [],
        starter: [],
        standard: [],
        pro: [],
        custom: []
      };

      state.allClients.forEach((client) => {
        const key = String(client.plan || "not_assigned");
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(client);
      });

      return Object.entries(groups).map(([plan, clients]) => ({
        plan,
        clients,
        total: clients.length,
        active: clients.filter((client) => client.accountStatus === "active").length,
        pending: clients.filter((client) => client.accountStatus === "pending").length,
        estimatedRevenue: clients.reduce((sum, client) => sum + estimateClientFee(client), 0)
      }));
    }

    function getSystemHealthRows() {
      return [
        ["API", state.stats && state.stats.systemHealth ? state.stats.systemHealth.api : "Not available"],
        ["Database", state.stats && state.stats.systemHealth ? state.stats.systemHealth.database : "Not available"],
        ["Overall", state.stats && state.stats.systemHealth ? state.stats.systemHealth.status : "Not available"]
      ];
    }

    function showBanner(message, tone = "info") {
      const banner = document.getElementById("banner");
      banner.textContent = message;
      banner.dataset.tone = tone;
      banner.classList.add("is-visible");
    }

    function hideBanner() {
      const banner = document.getElementById("banner");
      banner.classList.remove("is-visible");
      banner.textContent = "";
      banner.dataset.tone = "info";
    }

    function showToast(title, message, tone = "success") {
      const stack = document.getElementById("toastStack");
      const toast = document.createElement("div");
      toast.className = `toast ${tone}`;
      toast.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>`;
      stack.appendChild(toast);

      window.setTimeout(() => {
        toast.remove();
      }, 4200);
    }

    function formatApiErrorMessage(payload, fallbackMessage = "Request failed.") {
      const message = payload && payload.message ? payload.message : fallbackMessage;
      const details = Array.isArray(payload && payload.details)
        ? payload.details.filter(Boolean)
        : [];

      if (!details.length) {
        return message;
      }

      return `${message} ${details.slice(0, 4).join(" ")}`;
    }

    function formatForbiddenMessage(payload) {
      const message = String(payload && payload.message || "");
      const error = String(payload && payload.error || "");
      const combined = `${message} ${error}`.toLowerCase();

      if (/csrf|security/.test(combined)) {
        return "Security check failed. Please refresh and try again.";
      }

      if (/permission|access|forbidden|role|not allowed|not have access/.test(combined)) {
        return "You do not have permission to do this.";
      }

      return "This action is not allowed.";
    }

    async function apiFetch(path, options = {}) {
      const token = getToken();
      if (!token) {
        redirectToLogin();
        throw new Error("Your session expired. Please log in again.");
      }

      let response;
      try {
        response = await fetch(path, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() } : {}),
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
          }
        });
      } catch (_error) {
        throw new Error("Connection problem. Please try again.");
      }

      const payload = await response.json().catch(() => ({}));

      if (response.status === 401) {
        redirectToLogin();
        throw new Error("Your session expired. Please log in again.");
      }

      if (response.status === 403) {
        throw new Error(formatForbiddenMessage(payload));
      }

      if (!response.ok) {
        throw new Error(formatApiErrorMessage(payload));
      }

      return payload;
    }

    async function downloadAdminFile(path, fallbackFileName) {
      const token = getToken();
      if (!token) {
        redirectToLogin();
        throw new Error("Your session expired. Please log in again.");
      }

      let response;
      try {
        response = await fetch(path, {
          headers: {
            ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() } : {}),
            Authorization: `Bearer ${token}`
          }
        });
      } catch (_error) {
        throw new Error("Connection problem. Please try again.");
      }

      if (response.status === 401) {
        redirectToLogin();
        throw new Error("Your session expired. Please log in again.");
      }

      if (response.status === 403) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(formatForbiddenMessage(payload));
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to download the report.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch && fileNameMatch[1]
        ? fileNameMatch[1]
        : fallbackFileName;
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    }

    function getThemePreference() {
      return localStorage.getItem(THEME_KEY) || "dark";
    }

    function resolveTheme(preference) {
      if (preference === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }

      return preference;
    }

    function applyTheme(preference) {
      document.documentElement.dataset.theme = resolveTheme(preference);
      localStorage.setItem(THEME_KEY, preference);
      document.querySelectorAll(".theme-control").forEach((field) => {
        field.value = preference;
      });
    }

    function openSidebar() {
      document.getElementById("sidebar").classList.add("is-open");
      document.getElementById("sidebarBackdrop").classList.add("is-visible");
    }

    function closeSidebar() {
      document.getElementById("sidebar").classList.remove("is-open");
      document.getElementById("sidebarBackdrop").classList.remove("is-visible");
    }

    function setSection(sectionName) {
      if (["reports", "users", "audit-logs", "settings"].includes(sectionName) && !canManageSystem()) {
        sectionName = "dashboard";
        showBanner("You do not have permission to open this admin section.", "error");
      }

      state.currentSection = sectionName;

      document.querySelectorAll(".section").forEach((section) => {
        section.classList.toggle("is-active", section.id === `section-${sectionName}`);
      });

      document.querySelectorAll("#sidebarNav .nav-button").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.section === sectionName);
      });

      document.getElementById("pageTitle").textContent = SECTION_META[sectionName].title;
      document.getElementById("pageSubtitle").textContent = SECTION_META[sectionName].subtitle;
      closeSidebar();
    }

    function setTableState(tableBodyId, emptyStateId, items, rowMarkup, emptyMessage = "No records found for the current view.") {
      const tableBody = document.getElementById(tableBodyId);
      const emptyState = document.getElementById(emptyStateId);

      if (!items.length) {
        tableBody.innerHTML = "";
        emptyState.textContent = emptyMessage;
        emptyState.style.display = "block";
        return;
      }

      emptyState.style.display = "none";
      tableBody.innerHTML = items.map(rowMarkup).join("");
    }

    function renderMetricList(containerId, rows, emptyMessage = "No records found.") {
      const container = document.getElementById(containerId);

      if (!rows.length) {
        container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
        return;
      }

      container.innerHTML = rows.map((row) => `
        <div class="metric-row">
          <div>
            <div class="cell-title">${escapeHtml(row.label)}</div>
            <small>${escapeHtml(row.hint || "")}</small>
          </div>
          <strong${buildTitleAttribute(row.value)}>${escapeHtml(row.value)}</strong>
        </div>
      `).join("");
    }

    function renderPreviewList(containerId, items, itemMarkup, emptyMessage) {
      const container = document.getElementById(containerId);

      if (!items.length) {
        container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
        return;
      }

      container.innerHTML = `<div class="preview-list">${items.map(itemMarkup).join("")}</div>`;
    }

    function renderDashboardKpis() {
      const requestAnalytics = getSupportRequestAnalytics();
      const stats = state.stats || {};
      const kpis = state.reportOverview && state.reportOverview.kpis ? state.reportOverview.kpis : {};
      const cards = [
        {
          label: "Total Clients",
          value: String(kpis.totalClients ?? stats.totalClients ?? state.allClients.length ?? 0),
          copy: "All client business records currently stored in AutomateX."
        },
        {
          label: "Active Clients",
          value: String(kpis.activeClients ?? stats.activeClients ?? 0),
          copy: "Live service accounts currently active on the platform."
        },
        {
          label: "Total Employees",
          value: String(state.salesSummary?.totalEmployees ?? stats.totalEmployees ?? state.allSalesExecutives.length ?? 0),
          copy: "Employee records currently saved in the admin system."
        },
        {
          label: "Total Projects",
          value: String(kpis.totalProjects ?? state.allProjects.length ?? 0),
          copy: "Non-archived AutomateX projects currently tracked."
        },
        {
          label: "Active Projects",
          value: String(kpis.activeProjects ?? state.allProjects.filter((project) => !["Completed", "Cancelled", "On Hold"].includes(project.status)).length),
          copy: "Projects actively moving through planning, build, testing, or client-waiting states."
        },
        {
          label: "Completed Projects",
          value: String(kpis.completedProjects ?? state.allProjects.filter((project) => project.status === "Completed").length),
          copy: "Projects marked completed across the workspace."
        },
        {
          label: "Monthly Income",
          value: formatInvoiceCurrency(kpis.monthlyRevenue || 0),
          copy: "Invoice value issued in the active reports period."
        },
        {
          label: "Monthly Paid",
          value: formatInvoiceCurrency(kpis.monthlyPaidAmount || 0),
          copy: "Invoice payments recorded in the active reports period."
        },
        {
          label: "Pending Balance",
          value: formatInvoiceCurrency(kpis.monthlyPendingBalance || 0),
          copy: "Open invoice balance from the active reports period."
        },
        {
          label: "Overdue Invoices",
          value: String(kpis.overdueInvoices ?? 0),
          copy: "Invoices past due or marked overdue."
        },
        {
          label: "Pending Commission",
          value: formatInvoiceCurrency(kpis.pendingCommission || 0),
          copy: "Pending or approved sales commission not yet paid."
        },
        {
          label: "Active Maintenance",
          value: String(kpis.activeMaintenancePlans ?? state.allMaintenancePlans.filter((plan) => plan.status === "Active").length),
          copy: "Maintenance plans currently active."
        },
        {
          label: "Support Requests",
          value: String(kpis.openSupportRequests ?? requestAnalytics.totalRequests),
          copy: "Open or in-progress client support workload."
        }
      ];

      document.getElementById("dashboardKpiGrid").innerHTML = cards.map((card) => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <strong class="${card.muted ? "is-muted" : ""}"${buildTitleAttribute(card.value)}>${escapeHtml(card.value)}</strong>
          <div class="kpi-copy">${escapeHtml(card.copy)}</div>
        </article>
      `).join("");
    }

    function renderDashboardRevenue() {
      const payment = getPaymentAnalytics();
      const stats = state.stats || {};

      renderMetricList("revenueOverviewList", [
        {
          label: "Expected monthly income",
          value: formatCurrency(stats.monthlyRevenueEstimate ?? 0),
          hint: "Expected recurring income from active client packages."
        },
        {
          label: "Paid amount this month",
          value: "Not available",
          hint: "Monthly payment-history totals are not returned by the current backend."
        },
        {
          label: "Pending and unpaid income",
          value: formatCurrency(payment.pendingRevenue),
          hint: "Estimated value tied to accounts marked pending or unpaid."
        },
        {
          label: "Overdue income",
          value: formatCurrency(payment.overdueRevenue),
          hint: "Estimated value tied to accounts already marked overdue."
        }
      ]);
    }

    function pendingPreviewMarkup(client) {
      return `
        <article class="preview-item">
          <div class="preview-top">
            <div>
              <strong${buildTitleAttribute(client.businessName || client.name)}>${escapeHtml(client.businessName || client.name)}</strong>
              <p${buildTitleAttribute([client.name, client.businessType].filter(Boolean).join(" • "))}>${escapeHtml(client.name)}${client.businessType ? ` • ${escapeHtml(client.businessType)}` : ""}</p>
            </div>
            <span class="${badgeClass(client.accountStatus)}" title="${escapeHtml(formatStatusLabel(client.accountStatus))}">${escapeHtml(formatStatusLabel(client.accountStatus))}</span>
          </div>
          <div class="preview-meta"${buildTitleAttribute(`Signed up ${formatDate(client.createdAt)} • ${client.email || "—"}`)}>Signed up ${escapeHtml(formatShortDate(client.createdAt))} • ${escapeHtml(client.email || "—")}</div>
          <div class="preview-actions">
            <button class="mini-button is-warning" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="approve">Approve</button>
            <button class="mini-button" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="review">Review</button>
          </div>
        </article>
      `;
    }

    function recentClientMarkup(client) {
      return `
        <article class="preview-item">
          <div class="preview-top">
            <div>
              <strong${buildTitleAttribute(client.businessName || client.name)}>${escapeHtml(client.businessName || client.name)}</strong>
              <p${buildTitleAttribute(client.email || "—")}>${escapeHtml(client.email || "—")}</p>
            </div>
            <span class="${badgeClass(client.accountStatus)}" title="${escapeHtml(formatStatusLabel(client.accountStatus))}">${escapeHtml(formatStatusLabel(client.accountStatus))}</span>
          </div>
          <div class="preview-meta"${buildTitleAttribute(`${formatPlanLabel(client.plan)} • ${formatDate(client.createdAt)}`)}>${escapeHtml(formatPlanLabel(client.plan))} • ${escapeHtml(formatShortDate(client.createdAt))}</div>
          <div class="preview-actions">
            <button class="mini-button" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="${client.accountStatus === "pending" ? "review" : "manage"}">Open Client</button>
          </div>
        </article>
      `;
    }

    function recentBookingMarkup(booking) {
      return `
        <article class="preview-item">
          <div class="preview-top">
            <div>
              <strong${buildTitleAttribute(booking.name || "—")}>${escapeHtml(booking.name)}</strong>
              <p${buildTitleAttribute([booking.clientBusinessName || booking.clientName || "Client", booking.service || "General booking"].join(" • "))}>${escapeHtml(booking.clientBusinessName || booking.clientName || "Client")} • ${escapeHtml(booking.service || "General booking")}</p>
            </div>
            <span class="${badgeClass(booking.status)}" title="${escapeHtml(formatStatusLabel(booking.status))}">${escapeHtml(formatStatusLabel(booking.status))}</span>
          </div>
          <div class="preview-meta"${buildTitleAttribute([booking.date, booking.time].filter(Boolean).join(" • ") || "—")}>${escapeHtml(booking.date || "—")}${booking.time ? ` • ${escapeHtml(booking.time)}` : ""}</div>
          <div class="preview-actions">
            <button class="mini-button" type="button" data-booking-id="${escapeHtml(booking._id)}">Open Booking</button>
          </div>
        </article>
      `;
    }

    function recentInquiryMarkup(inquiry) {
      return `
        <article class="preview-item">
          <div class="preview-top">
            <div>
              <strong${buildTitleAttribute(inquiry.name || "—")}>${escapeHtml(inquiry.name)}</strong>
              <p${buildTitleAttribute(inquiry.clientBusinessName || inquiry.clientName || inquiry.source || "Platform lead")}>${escapeHtml(inquiry.clientBusinessName || inquiry.clientName || inquiry.source || "Platform lead")}</p>
            </div>
            <span class="${badgeClass(inquiry.status)}" title="${escapeHtml(formatStatusLabel(inquiry.status))}">${escapeHtml(formatStatusLabel(inquiry.status))}</span>
          </div>
          <div class="preview-meta"${buildTitleAttribute(`${formatDate(inquiry.createdAt)} • ${inquiry.message || "—"}`)}>${escapeHtml(formatShortDate(inquiry.createdAt))} • ${escapeHtml((inquiry.message || "").slice(0, 80))}${String(inquiry.message || "").length > 80 ? "..." : ""}</div>
          <div class="preview-actions">
            <button class="mini-button" type="button" data-inquiry-id="${escapeHtml(inquiry._id)}">Open Inquiry</button>
          </div>
        </article>
      `;
    }

    function recentReviewMarkup(review) {
      const displayStatus = normalizeDisplayReviewStatus(review);

      return `
        <article class="preview-item">
          <div class="preview-top">
            <div>
              <strong${buildTitleAttribute(review.name || "—")}>${escapeHtml(review.name)}</strong>
              <p${buildTitleAttribute(`${review.clientBusinessName || review.clientName || "Client"} • ${ratingStars(review.rating)}`)}>${escapeHtml(review.clientBusinessName || review.clientName || "Client")} • ${escapeHtml(ratingStars(review.rating))}</p>
            </div>
            <span class="${badgeClass(displayStatus)}" title="${escapeHtml(formatStatusLabel(displayStatus))}">${escapeHtml(formatStatusLabel(displayStatus))}</span>
          </div>
          <div class="preview-meta"${buildTitleAttribute(review.text || "—")}>${escapeHtml((review.text || "").slice(0, 88))}${String(review.text || "").length > 88 ? "..." : ""}</div>
          <div class="preview-actions">
            <button class="mini-button" type="button" data-review-id="${escapeHtml(review._id)}">Open Review</button>
          </div>
        </article>
      `;
    }

    function renderDashboardPreviews() {
      renderPreviewList(
        "dashboardPendingPreview",
        getPendingApprovals().slice(0, 4),
        pendingPreviewMarkup,
        "No pending approvals right now."
      );

      renderPreviewList(
        "dashboardRecentClients",
        getRecentItems(state.allClients, 4),
        recentClientMarkup,
        "No client records are available yet."
      );

      renderPreviewList(
        "dashboardRecentBookings",
        getRecentItems(state.allBookings, 3),
        recentBookingMarkup,
        "No bookings are available yet."
      );

      renderPreviewList(
        "dashboardRecentInquiries",
        getRecentItems(state.allInquiries, 3),
        recentInquiryMarkup,
        "No inquiries yet."
      );

      renderPreviewList(
        "dashboardRecentReviews",
        getRecentItems(state.allReviews, 3),
        recentReviewMarkup,
        "No reviews are available yet."
      );
    }

    function renderClientsSection() {
      const clients = getFilteredClients();
      const statusCounts = getClientStatusCounts();
      const canManageClients = hasAdminPermission("clients:manage");

      document.getElementById("clientsSummaryChips").innerHTML = [
        { label: "Total Clients", value: state.allClients.length },
        { label: "Pending", value: statusCounts.pending },
        { label: "Active", value: statusCounts.active },
        { label: "Suspended", value: statusCounts.suspended },
        { label: "Rejected", value: statusCounts.rejected }
      ].map((item) => `
        <span class="data-chip"><strong>${escapeHtml(item.value)}</strong>${escapeHtml(item.label)}</span>
      `).join("");

      setTableState("clientsTableBody", "clientsEmptyState", clients, (client) => `
        <tr class="${client.accountStatus === "pending" ? "pending-row" : ""}">
          <td>
            <div class="cell-title">${renderTextValue(client.businessName || client.name, "text-ellipsis text-business")}</div>
            <div class="cell-subtitle">${renderTextValue(client.businessType || "Business type not set", "text-ellipsis", { titleValue: client.businessType || "Business type not set" })}</div>
          </td>
          <td>${renderTextValue(client.name || "—", "text-ellipsis text-person")}</td>
          <td>
            <div class="cell-title">${renderTextValue(client.email || "—", "text-ellipsis text-email text-mono")}</div>
            <div class="cell-subtitle">${renderTextValue(client.location || "Location not set", "text-ellipsis text-location")}</div>
          </td>
          <td>${renderTextValue(client.phone || "—", "text-ellipsis text-phone text-mono")}</td>
          <td>${renderTextValue(formatPlanLabel(client.plan), "text-ellipsis text-package", { titleValue: formatPlanLabel(client.plan) })}</td>
          <td>${renderTextValue(formatCurrency(client.monthlyFee), "text-ellipsis text-currency text-mono")}</td>
          <td><span class="${badgeClass(client.paymentStatus)}" title="${escapeHtml(formatStatusLabel(client.paymentStatus))}">${escapeHtml(formatStatusLabel(client.paymentStatus))}</span></td>
          <td><span class="${badgeClass(client.accountStatus)}" title="${escapeHtml(formatStatusLabel(client.accountStatus))}">${escapeHtml(formatStatusLabel(client.accountStatus))}</span></td>
          <td>${renderTextValue(formatShortDate(client.nextPaymentDate), "text-ellipsis text-date text-mono", { titleValue: formatDate(client.nextPaymentDate) })}</td>
          <td>${renderTextValue(formatShortDate(client.createdAt), "text-ellipsis text-date text-mono", { titleValue: formatDate(client.createdAt) })}</td>
          <td class="actions-cell">
            <div class="actions">
              ${canManageClients && client.accountStatus === "pending"
                ? `
                    <button class="mini-button is-warning" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="approve">Approve</button>
                    <button class="mini-button" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="review">Review</button>
                  `
                : ""}
              ${canManageClients && client.accountStatus !== "pending"
                ? `<button class="mini-button" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="manage">Manage</button>`
                : ""}
            </div>
          </td>
        </tr>
      `, "No client accounts match the current search or filter.");
    }

    function renderPendingApprovalsSection() {
      const pendingApprovals = getPendingApprovals();
      const notAssignedCount = pendingApprovals.filter((client) => client.plan === "not_assigned").length;
      const newestSignup = pendingApprovals.length ? formatShortDate(pendingApprovals[0].createdAt) : "—";
      const canManageClients = hasAdminPermission("clients:manage");

      document.getElementById("pendingApprovalCountBadge").textContent = `${pendingApprovals.length} Waiting`;
      document.getElementById("pendingApprovalChips").innerHTML = [
        { label: "Waiting for approval", value: pendingApprovals.length },
        { label: "Without package", value: notAssignedCount },
        { label: "Newest signup", value: newestSignup }
      ].map((item) => `
        <span class="data-chip"><strong>${escapeHtml(item.value)}</strong>${escapeHtml(item.label)}</span>
      `).join("");

      setTableState("pendingApprovalsTableBody", "pendingApprovalsEmptyState", pendingApprovals, (client) => `
        <tr class="pending-row">
          <td>${renderTextValue(client.name || "—", "text-ellipsis text-person")}</td>
          <td>
            <div class="cell-title">${renderTextValue(client.businessName || "Business name not set", "text-ellipsis text-business")}</div>
            <div class="cell-subtitle">${renderTextValue(formatPlanLabel(client.plan), "text-ellipsis text-package", { titleValue: formatPlanLabel(client.plan) })}</div>
          </td>
          <td>${renderTextValue(client.email || "—", "text-ellipsis text-email text-mono")}</td>
          <td>${renderTextValue(client.phone || "—", "text-ellipsis text-phone text-mono")}</td>
          <td>${renderTextValue(client.businessType || "—", "text-ellipsis")}</td>
          <td>${renderTextValue(client.location || "—", "text-ellipsis text-location")}</td>
          <td>${renderTextValue(formatDate(client.createdAt), "text-ellipsis text-date text-mono")}</td>
          <td><span class="${badgeClass(client.accountStatus)}" title="${escapeHtml(formatStatusLabel(client.accountStatus))}">${escapeHtml(formatStatusLabel(client.accountStatus))}</span></td>
          <td class="actions-cell">
            <div class="actions">
              ${canManageClients
                ? `
                    <button class="mini-button is-warning" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="approve">Approve</button>
                    <button class="mini-button" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="review">Review</button>
                  `
                : ""}
            </div>
          </td>
        </tr>
      `, "No pending clients are waiting for approval.");
    }

    function renderPackagesSection() {
      const packageAnalytics = getPackageAnalytics();
      const stats = state.stats || {};
      const activePackageCount = Object.values(stats.activePackages || {}).reduce((sum, count) => sum + toNumber(count), 0);
      const canManageClients = hasAdminPermission("clients:manage");

      document.getElementById("packageKpiGrid").innerHTML = packageAnalytics.map((entry) => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(formatPlanLabel(entry.plan))}</div>
          <strong${buildTitleAttribute(entry.active)}>${escapeHtml(entry.active)}</strong>
          <div class="kpi-copy">${escapeHtml(entry.total)} total clients • ${escapeHtml(formatCurrency(entry.estimatedRevenue))} estimated monthly value</div>
        </article>
      `).join("");

      renderMetricList("packageDistributionList", packageAnalytics.map((entry) => ({
        label: formatPlanLabel(entry.plan),
        value: `${entry.active} active`,
        hint: `${entry.total} total assigned • ${entry.pending} pending`
      })));

      renderMetricList("packageHealthList", [
        {
          label: "Active package assignments",
          value: String(activePackageCount),
          hint: "Clients currently active on a package according to the admin stats endpoint."
        },
        {
          label: "Accounts without package",
          value: String(packageAnalytics.find((entry) => entry.plan === "not_assigned")?.total || 0),
          hint: "These accounts still need package assignment before full activation."
        },
        {
          label: "Estimated monthly value",
          value: formatCurrency(packageAnalytics.reduce((sum, entry) => sum + entry.estimatedRevenue, 0)),
          hint: "Derived from current monthly fee values or known plan pricing defaults."
        }
      ]);

      const rows = [...state.allClients].sort((left, right) => {
        if (left.plan === right.plan) {
          return compareStrings(left.businessName || left.name, right.businessName || right.name);
        }

        return compareStrings(left.plan, right.plan);
      });

      setTableState("packageClientsTableBody", "packageClientsEmptyState", rows, (client) => `
        <tr class="${client.accountStatus === "pending" ? "pending-row" : ""}">
          <td>
            <div class="cell-title">${renderTextValue(client.businessName || client.name, "text-ellipsis text-business")}</div>
            <div class="cell-subtitle">${renderTextValue(client.email || "—", "text-ellipsis text-email text-mono")}</div>
          </td>
          <td>${renderTextValue(formatPlanLabel(client.plan), "text-ellipsis text-package", { titleValue: formatPlanLabel(client.plan) })}</td>
          <td><span class="${badgeClass(client.accountStatus)}" title="${escapeHtml(formatStatusLabel(client.accountStatus))}">${escapeHtml(formatStatusLabel(client.accountStatus))}</span></td>
          <td><span class="${badgeClass(client.paymentStatus)}" title="${escapeHtml(formatStatusLabel(client.paymentStatus))}">${escapeHtml(formatStatusLabel(client.paymentStatus))}</span></td>
          <td>${renderTextValue(formatCurrency(estimateClientFee(client)), "text-ellipsis text-currency text-mono")}</td>
          <td>${renderTextValue((client.allowedFeatures || []).length, "text-ellipsis text-mono", { title: false })}</td>
          <td class="actions-cell">
            <div class="actions">
              ${canManageClients ? `<button class="mini-button" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="manage">Manage</button>` : ""}
            </div>
          </td>
        </tr>
      `);
    }

    function renderInvoicesSection() {
      const analytics = getInvoiceAnalytics();
      const invoices = getFilteredInvoices();
      const canManageInvoices = hasAdminPermission("invoices:manage");
      const canSendInvoices = hasAdminPermission("invoices:send-email");
      const canUpdateInvoicePayments = hasAdminPermission("invoices:payment-update");

      document.getElementById("invoicesKpiGrid").innerHTML = [
        {
          label: "Total Invoices",
          value: String(analytics.totalInvoices),
          copy: "Every manual invoice currently stored inside AutomateX."
        },
        {
          label: "Paid Invoices",
          value: String(analytics.paidInvoices),
          copy: "Invoices whose balances are fully cleared."
        },
        {
          label: "Pending Invoices",
          value: String(analytics.pendingInvoices),
          copy: "Draft, sent, or partial invoices still waiting for full collection."
        },
        {
          label: "Overdue Invoices",
          value: String(analytics.overdueInvoices),
          copy: "Invoices with unpaid balances whose due dates have already passed."
        },
        {
          label: "Total Invoice Value",
          value: formatInvoiceCurrency(analytics.totalValue),
          copy: "Combined face value of all invoice records."
        },
        {
          label: "Total Paid",
          value: formatInvoiceCurrency(analytics.totalPaid),
          copy: "Collected value recorded across manual invoice payments."
        },
        {
          label: "Total Balance",
          value: formatInvoiceCurrency(analytics.totalBalance),
          copy: "Outstanding balance that still remains to be collected."
        }
      ].map((card) => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <strong${buildTitleAttribute(card.value)}>${escapeHtml(card.value)}</strong>
          <div class="kpi-copy">${escapeHtml(card.copy)}</div>
        </article>
      `).join("");

      renderMetricList("invoiceCollectionsSummaryList", [
        {
          label: "Outstanding balance",
          value: formatInvoiceCurrency(analytics.totalBalance),
          hint: "The remaining value not yet collected from all invoice records."
        },
        {
          label: "Collected value",
          value: formatInvoiceCurrency(analytics.totalPaid),
          hint: "Manual invoice payments recorded so far."
        },
        {
          label: "Invoices awaiting collection",
          value: String(analytics.pendingInvoices + analytics.overdueInvoices),
          hint: "Invoices still open and not fully paid."
        }
      ]);

      renderMetricList("invoiceStatusSummaryList", [
        {
          label: "Draft invoices",
          value: String(analytics.statusCounts.draft || 0),
          hint: "Created but not yet sent to the client."
        },
        {
          label: "Sent invoices",
          value: String(analytics.statusCounts.sent || 0),
          hint: "Waiting for payment with no partial payment recorded yet."
        },
        {
          label: "Partial payments",
          value: String(analytics.statusCounts.partial || 0),
          hint: "Invoices that have received some payment but still have balance left."
        },
        {
          label: "Cancelled invoices",
          value: String(analytics.statusCounts.cancelled || 0),
          hint: "Invoices that were cancelled instead of collected."
        }
      ]);

      setTableState("invoicesTableBody", "invoicesEmptyState", invoices, (invoice) => `
        <tr class="${invoice.status === "overdue" ? "pending-row" : ""}">
          <td>
            <div class="cell-title">${renderTextValue(invoice.invoiceNumber || "—", "text-ellipsis text-invoice text-mono")}</div>
            <div class="cell-subtitle">${renderTextValue(`Issued ${formatShortDate(invoice.issueDate)}`, "text-ellipsis text-date text-mono", { titleValue: `Issued ${formatDate(invoice.issueDate)}` })}</div>
          </td>
          <td>
            <div class="cell-title">${renderTextValue(invoice.businessName || invoice.clientName || "Client", "text-ellipsis text-business")}</div>
            <div class="cell-subtitle">${renderTextValue([invoice.clientName || "—", invoice.clientEmail || "—"].join(" • "), "text-ellipsis", { titleValue: [invoice.clientName, invoice.clientEmail].filter(Boolean).join(" • ") || "—" })}</div>
          </td>
          <td>
            <div class="cell-title">${renderTextValue(invoice.title || "Invoice", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(invoiceReferenceLabel(invoice) || "Custom invoice", "text-note", { titleValue: invoiceReferenceLabel(invoice) || "Custom invoice" })}</div>
          </td>
          <td>${renderTextValue(formatInvoiceCurrency(invoice.totalAmount, invoice.currency), "text-ellipsis text-currency text-mono")}</td>
          <td>${renderTextValue(formatInvoiceCurrency(invoice.paidAmount, invoice.currency), "text-ellipsis text-currency text-mono")}</td>
          <td>${renderTextValue(formatInvoiceCurrency(invoice.balance, invoice.currency), "text-ellipsis text-currency text-mono")}</td>
          <td><span class="${badgeClass(invoice.status)}" title="${escapeHtml(invoice.paymentStatus || formatStatusLabel(invoice.status))}">${escapeHtml(invoice.paymentStatus || formatStatusLabel(invoice.status))}</span></td>
          <td><span class="${badgeClass(invoice.emailStatus === "Sent" ? "paid" : invoice.emailStatus === "Failed" ? "overdue" : "draft")}" title="${escapeHtml(invoice.lastEmailSentAt ? `Last sent ${formatDate(invoice.lastEmailSentAt)}` : invoice.emailStatus || "Not Sent")}">${escapeHtml(invoice.emailStatus || "Not Sent")}</span></td>
          <td>${renderTextValue(formatShortDate(invoice.dueDate), "text-ellipsis text-date text-mono", { titleValue: formatDate(invoice.dueDate) })}</td>
          <td class="actions-cell">
            <div class="actions">
              <button class="mini-button" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="view">View</button>
              ${canManageInvoices ? `<button class="mini-button" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="edit">Edit</button>` : ""}
              <button class="mini-button" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="download-pdf">PDF</button>
              ${canSendInvoices ? `<button class="mini-button" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="send-email">Email</button>` : ""}
              ${canUpdateInvoicePayments && invoice.status !== "cancelled" && toNumber(invoice.balance) > 0
                ? `<button class="mini-button" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="add-payment">Add Payment</button>`
                : ""}
              ${canUpdateInvoicePayments && invoice.status !== "cancelled" && toNumber(invoice.balance) > 0
                ? `<button class="mini-button is-warning" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="mark-paid">Mark Paid</button>`
                : ""}
              ${canManageInvoices && invoice.status !== "cancelled"
                ? `<button class="mini-button is-danger" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="cancel">Cancel</button>`
                : ""}
            </div>
          </td>
        </tr>
      `, "No invoices found.");
    }

    function renderPaymentsSection() {
      const stats = state.stats || {};
      const payment = getPaymentAnalytics();
      const billingRows = [...state.allClients]
        .filter((client) => toNumber(client.monthlyFee) > 0 || client.plan !== "not_assigned")
        .sort((left, right) => estimateClientFee(right) - estimateClientFee(left));

      document.getElementById("paymentsKpiGrid").innerHTML = [
        {
          label: "Expected Income",
          value: formatCurrency(stats.monthlyRevenueEstimate ?? 0),
          copy: "Expected recurring income from currently active client assignments."
        },
        {
          label: "Unpaid Income",
          value: formatCurrency(payment.pendingRevenue + payment.overdueRevenue),
          copy: "Estimated pending, unpaid, and overdue value requiring follow-up."
        },
        {
          label: "Overdue Income",
          value: formatCurrency(payment.overdueRevenue),
          copy: "Estimated monthly value currently tied to overdue accounts."
        },
        {
          label: "Paid Accounts",
          value: String(payment.paidAccounts),
          copy: "Accounts marked paid in the current client state."
        }
      ].map((card) => `
        <article class="kpi-card is-wide">
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <strong${buildTitleAttribute(card.value)}>${escapeHtml(card.value)}</strong>
          <div class="kpi-copy">${escapeHtml(card.copy)}</div>
        </article>
      `).join("");

      renderMetricList("paymentsSummaryList", [
        {
          label: "Pending or unpaid accounts",
          value: String(payment.pendingAccounts + payment.unpaidAccounts),
          hint: "Accounts marked pending or unpaid and not yet overdue."
        },
        {
          label: "Overdue accounts",
          value: String(payment.overdueAccounts),
          hint: "Accounts already marked overdue by the admin payment state."
        },
        {
          label: "Accounts with scheduled next payment",
          value: String(payment.scheduledPayments),
          hint: "Clients that currently have a next payment date set."
        }
      ]);

      renderMetricList("paymentAlertsList", [
        {
          label: "Unpaid monthly fees",
          value: formatCurrency(stats.unpaidMonthlyFees ?? 0),
          hint: "Outstanding monthly fees from the current admin stats endpoint."
        },
        {
          label: "Paid this month",
          value: "Not available",
          hint: "Monthly paid totals need invoice or payment-history backend support."
        },
        {
          label: "Overdue follow-up",
          value: payment.overdueAccounts ? `${payment.overdueAccounts} accounts` : "Clear",
          hint: "Use the client drawer to manage overdue account status and billing fields."
        }
      ]);

      setTableState("paymentsTableBody", "paymentsEmptyState", billingRows, (client) => `
        <tr class="${client.paymentStatus === "overdue" ? "pending-row" : ""}">
          <td>
            <div class="cell-title">${renderTextValue(client.businessName || client.name, "text-ellipsis text-business")}</div>
            <div class="cell-subtitle">${renderTextValue(client.email || "—", "text-ellipsis text-email text-mono")}</div>
          </td>
          <td>${renderTextValue(formatPlanLabel(client.plan), "text-ellipsis text-package", { titleValue: formatPlanLabel(client.plan) })}</td>
          <td>${renderTextValue(formatCurrency(client.monthlyFee), "text-ellipsis text-currency text-mono")}</td>
          <td><span class="${badgeClass(client.paymentStatus)}" title="${escapeHtml(formatStatusLabel(client.paymentStatus))}">${escapeHtml(formatStatusLabel(client.paymentStatus))}</span></td>
          <td>${renderTextValue(formatShortDate(client.nextPaymentDate), "text-ellipsis text-date text-mono", { titleValue: formatDate(client.nextPaymentDate) })}</td>
          <td><span class="${badgeClass(client.accountStatus)}" title="${escapeHtml(formatStatusLabel(client.accountStatus))}">${escapeHtml(formatStatusLabel(client.accountStatus))}</span></td>
          <td class="actions-cell">
            <div class="actions">
              <button class="mini-button" type="button" data-client-id="${escapeHtml(client.id)}" data-client-action="manage">Manage Billing</button>
            </div>
          </td>
        </tr>
      `);
    }

    function renderProjectsSection() {
      const projects = getFilteredProjects();
      const analytics = getProjectAnalytics();
      const canManageProjects = hasAdminPermission("projects:manage");
      const canUpdateProjectStatus = hasAdminPermission("projects:update-status");
      const averageProgress = analytics.totalProjects
        ? Math.round(analytics.averageProgress / analytics.totalProjects)
        : 0;

      document.getElementById("projectsKpiGrid").innerHTML = [
        {
          label: "Total Projects",
          value: String(analytics.totalProjects),
          copy: "All active project records inside the Admin Panel."
        },
        {
          label: "Active Delivery",
          value: String(analytics.activeProjects),
          copy: "Projects currently moving through planning, build, testing, or client review."
        },
        {
          label: "Completed",
          value: String(analytics.completedProjects),
          copy: "Projects marked completed and ready for maintenance or renewal workflows later."
        },
        {
          label: "High Priority",
          value: String(analytics.highPriorityProjects),
          copy: "Projects marked High or Urgent for admin attention."
        },
        {
          label: "Average Progress",
          value: `${averageProgress}%`,
          copy: "Average completion percentage across visible project records."
        },
        {
          label: "Open Balance",
          value: formatInvoiceCurrency(analytics.balanceAmount),
          copy: "Unpaid balance across current project records."
        }
      ].map((card) => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <strong${buildTitleAttribute(card.value)}>${escapeHtml(card.value)}</strong>
          <div class="kpi-copy">${escapeHtml(card.copy)}</div>
        </article>
      `).join("");

      setTableState("projectsTableBody", "projectsEmptyState", projects, (project) => `
        <tr class="${project.priority === "Urgent" ? "pending-row" : ""}">
          <td>
            <div class="cell-title">${renderTextValue(project.projectTitle || "Project", "text-ellipsis text-title")}</div>
            <div class="cell-subtitle">${renderTextValue(project.packageName || "No package set", "text-ellipsis text-package")}</div>
          </td>
          <td>
            <div class="cell-title">${renderTextValue(project.clientBusinessName || project.clientName || "Client", "text-ellipsis text-business")}</div>
            <div class="cell-subtitle">${renderTextValue(project.clientEmail || "—", "text-ellipsis text-email text-mono")}</div>
          </td>
          <td>${renderTextValue(project.projectType || "Other", "text-ellipsis")}</td>
          <td><span class="${projectBadgeClass(project.status)}" title="${escapeHtml(project.status)}">${escapeHtml(project.status)}</span></td>
          <td><span class="${projectBadgeClass(project.priority)}" title="${escapeHtml(project.priority)}">${escapeHtml(project.priority)}</span></td>
          <td>${renderTextValue(`${toNumber(project.progressPercentage)}%`, "text-ellipsis text-mono")}</td>
          <td>${renderTextValue(formatShortDate(project.expectedDeadline), "text-ellipsis text-date text-mono", { titleValue: formatDate(project.expectedDeadline) })}</td>
          <td>${renderTextValue(formatInvoiceCurrency(project.balanceAmount || 0), "text-ellipsis text-money")}</td>
          <td class="actions-cell">
            <div class="actions">
              ${canManageProjects || canUpdateProjectStatus
                ? `<button class="mini-button" type="button" data-project-id="${escapeHtml(project.id)}">${canManageProjects ? "Edit" : "Update"}</button>`
                : ""}
              ${canManageProjects
                ? `<button class="mini-button is-warning" type="button" data-project-id="${escapeHtml(project.id)}" data-project-action="archive">Hide from active list</button>`
                : ""}
            </div>
          </td>
        </tr>
      `, "No projects found.");
    }

    function renderMaintenanceSection() {
      const plans = getFilteredMaintenancePlans();
      const canManageMaintenance = hasAdminPermission("maintenance:manage");

      setTableState("maintenanceTableBody", "maintenanceEmptyState", plans, (plan) => `
        <tr class="${plan.status === "Expiring Soon" || plan.paymentStatus === "Overdue" ? "pending-row" : ""}">
          <td>
            <div class="cell-title">${renderTextValue(plan.clientBusinessName || plan.clientName || "Client", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(plan.clientEmail || "—", "text-ellipsis text-email text-mono")}</div>
          </td>
          <td>${renderTextValue(plan.projectTitle || "Project", "text-ellipsis text-title")}</td>
          <td>
            <div class="cell-title">${renderTextValue(plan.planName || "Maintenance", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(plan.planType || "Monthly", "text-ellipsis")}</div>
          </td>
          <td><span class="${projectBadgeClass(plan.status)}">${escapeHtml(plan.status || "Pending")}</span></td>
          <td>${renderTextValue(formatShortDate(plan.renewalDate), "text-ellipsis text-date text-mono", { titleValue: formatDate(plan.renewalDate) })}</td>
          <td>${renderTextValue(formatInvoiceCurrency(plan.amount || 0), "text-ellipsis text-money")}</td>
          <td><span class="${projectBadgeClass(plan.paymentStatus || "Pending")}">${escapeHtml(plan.paymentStatus || "Pending")}</span></td>
          <td>
            <div class="table-actions">
              ${canManageMaintenance
                ? `
                    <button class="mini-button" type="button" data-maintenance-id="${escapeHtml(plan.id)}">Edit</button>
                    <button class="mini-button" type="button" data-maintenance-id="${escapeHtml(plan.id)}" data-maintenance-action="renew">Renew</button>
                    <button class="mini-button is-warning" type="button" data-maintenance-id="${escapeHtml(plan.id)}" data-maintenance-action="expire">Expire</button>
                    <button class="mini-button is-danger" type="button" data-maintenance-id="${escapeHtml(plan.id)}" data-maintenance-action="cancel">Cancel</button>
                  `
                : ""}
            </div>
          </td>
        </tr>
      `, "No maintenance plans match the current filters.");
    }

    function updateSalesFilterOptions() {
      const salesExecutiveOptions = state.allSalesExecutives.map((executive) => `
        <option value="${escapeHtml(executive.id)}">${escapeHtml(executive.fullName || "Employee")}</option>
      `).join("");
      const leadSalesExecutiveFilter = document.getElementById("leadSalesExecutiveFilter");
      const commissionSalesExecutiveFilter = document.getElementById("commissionSalesExecutiveFilter");
      const currentLeadValue = leadSalesExecutiveFilter.value;
      const currentCommissionValue = commissionSalesExecutiveFilter.value;

      leadSalesExecutiveFilter.innerHTML = `<option value="">All employees</option>${salesExecutiveOptions}`;
      commissionSalesExecutiveFilter.innerHTML = `<option value="">All employees</option>${salesExecutiveOptions}`;
      leadSalesExecutiveFilter.value = currentLeadValue;
      commissionSalesExecutiveFilter.value = currentCommissionValue;
    }

    function renderSalesSection() {
      updateSalesFilterOptions();

      const salesSummary = state.salesSummary || {};
      const salesExecutives = getFilteredSalesExecutives();
      const leads = getFilteredLeads();
      const commissions = getFilteredCommissions();
      const canManageSales = hasAdminPermission("sales:manage");
      const canManageLeads = hasAdminPermission("leads:manage");
      const canManageCommissions = hasAdminPermission("commissions:manage");
      const canApproveCommissions = hasAdminPermission("commissions:approve");

      document.getElementById("salesKpiGrid").innerHTML = [
        {
          label: "Active Employees",
          value: String(salesSummary.activeEmployees ?? salesSummary.activeSalesExecutives ?? 0),
          copy: "Employees currently active and able to log in."
        },
        {
          label: "Leads This Month",
          value: String(salesSummary.totalLeadsThisMonth || 0),
          copy: "Employee-created and admin-created leads this month."
        },
        {
          label: "New Leads",
          value: String(salesSummary.newLeads || 0),
          copy: "Leads still waiting for first contact."
        },
        {
          label: "Follow-up Leads",
          value: String(salesSummary.followUpLeads || 0),
          copy: "Leads currently scheduled for follow-up."
        },
        {
          label: "Confirmed Paid Clients",
          value: String(salesSummary.confirmedPaidClients || salesSummary.convertedLeads || 0),
          copy: "Only admin-approved paid clients count toward target and commission."
        },
        {
          label: "Pending Approval",
          value: String(salesSummary.pendingApprovalClients || 0),
          copy: "Paid clients submitted by employees and waiting for admin confirmation."
        },
        {
          label: "Pending Commission",
          value: formatInvoiceCurrency(salesSummary.pendingCommission || 0),
          copy: "Pending or approved commissions not yet marked paid."
        },
        {
          label: "Paid This Month",
          value: formatInvoiceCurrency(salesSummary.paidCommissionThisMonth || 0),
          copy: "Commissions paid in the active summary month."
        }
      ].map((card) => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <strong>${escapeHtml(card.value)}</strong>
          <div class="kpi-copy">${escapeHtml(card.copy)}</div>
        </article>
      `).join("");

      setTableState("salesExecutivesTableBody", "salesExecutivesEmptyState", salesExecutives, (executive) => `
        <tr>
          <td>
            <div class="cell-title">${renderTextValue(executive.fullName || "Employee", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(executive.email || "No email", "text-ellipsis text-email")}</div>
          </td>
          <td>${renderTextValue(executive.phone || "—", "text-ellipsis text-mono")}</td>
          <td><span class="${projectBadgeClass(executive.status)}">${escapeHtml(executive.status || "Active")}</span></td>
          <td>${renderTextValue(executive.workType || "Part Time", "text-ellipsis")}</td>
          <td>${renderTextValue(formatShortDate(executive.joinedDate), "text-ellipsis text-date text-mono", { titleValue: formatDate(executive.joinedDate) })}</td>
          <td>
            <div class="cell-title">${renderTextValue(`${executive.monthlyPerformance && executive.monthlyPerformance.approvedPaidClients || 0}/${executive.monthlyPerformance && executive.monthlyPerformance.monthlyTarget || executive.commissionRules && executive.commissionRules.baseTargetClientsPerMonth || 3} approved`, "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(`${formatInvoiceCurrency(executive.commissionRules && executive.commissionRules.baseCommissionAmount || 0)} target • ${formatInvoiceCurrency(executive.commissionRules && executive.commissionRules.extraClientCommission || 0)} extra`, "text-ellipsis")}</div>
          </td>
          <td>
            <div class="table-actions">
              ${canManageSales ? `<button class="mini-button" type="button" data-sales-executive-id="${escapeHtml(executive.id)}">Edit</button>` : ""}
              <button class="mini-button" type="button" data-sales-executive-id="${escapeHtml(executive.id)}" data-sales-executive-action="summary">Summary</button>
              ${canManageSales ? `<button class="mini-button is-warning" type="button" data-sales-executive-id="${escapeHtml(executive.id)}" data-sales-executive-action="archive">Hide from active list</button>` : ""}
            </div>
          </td>
        </tr>
      `, "No employees found.");

      setTableState("leadsTableBody", "leadsEmptyState", leads, (lead) => `
        <tr class="${lead.priority === "High" ? "pending-row" : ""}">
          <td>
            <div class="cell-title">${renderTextValue(lead.businessName || lead.contactPerson || "Lead", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(lead.location || "No location", "text-ellipsis")}</div>
          </td>
          <td>
            <div class="cell-title">${renderTextValue(lead.contactPerson || "Contact", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(lead.phone || "—", "text-ellipsis text-mono")}</div>
          </td>
          <td>${renderTextValue(lead.interestedService || "Other", "text-ellipsis")}</td>
          <td>${renderTextValue(lead.salesExecutiveName || "Unassigned", "text-ellipsis")}</td>
          <td><span class="${projectBadgeClass(lead.status)}">${escapeHtml(lead.status || "New")}</span></td>
          <td><span class="${projectBadgeClass(lead.priority)}">${escapeHtml(lead.priority || "Medium")}</span></td>
          <td>${renderTextValue(formatShortDate(lead.followUpDate), "text-ellipsis text-date text-mono", { titleValue: formatDate(lead.followUpDate) })}</td>
          <td>
            <div class="table-actions">
              ${canManageLeads
                ? `
                    <button class="mini-button" type="button" data-lead-id="${escapeHtml(lead.id)}">Edit</button>
                    <button class="mini-button" type="button" data-lead-id="${escapeHtml(lead.id)}" data-lead-action="convert">Convert</button>
                    ${lead.approvalStatus === "pending" ? `<button class="mini-button" type="button" data-lead-id="${escapeHtml(lead.id)}" data-lead-action="approve-payment">Approve</button>` : ""}
                    ${lead.approvalStatus === "pending" ? `<button class="mini-button is-danger" type="button" data-lead-id="${escapeHtml(lead.id)}" data-lead-action="reject-payment">Reject</button>` : ""}
                  `
                : ""}
            </div>
          </td>
        </tr>
      `, "No leads match the current filters.");

      setTableState("commissionsTableBody", "commissionsEmptyState", commissions, (commission) => `
        <tr>
          <td>${renderTextValue(commission.salesExecutiveName || "Employee", "text-ellipsis")}</td>
          <td>
            <div class="cell-title">${renderTextValue(commission.projectTitle || commission.clientBusinessName || commission.clientName || commission.leadBusinessName || "Manual commission", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(commission.paymentReference || commission.invoiceNumber || "No payment reference", "text-ellipsis")}</div>
          </td>
          <td>${renderTextValue(commission.commissionType || "Manual Bonus", "text-ellipsis")}</td>
          <td>${renderTextValue(`${commission.commissionMonth || "—"}/${commission.commissionYear || "—"}`, "text-ellipsis text-mono")}</td>
          <td>${renderTextValue(formatInvoiceCurrency(commission.amount || 0), "text-ellipsis text-money")}</td>
          <td><span class="${projectBadgeClass(commission.status)}">${escapeHtml(commission.status || "Pending")}</span></td>
          <td>
            <div class="table-actions">
              ${canManageCommissions ? `<button class="mini-button" type="button" data-commission-id="${escapeHtml(commission.id)}">Edit</button>` : ""}
              ${canApproveCommissions
                ? `
                    <button class="mini-button" type="button" data-commission-id="${escapeHtml(commission.id)}" data-commission-action="approve">Approve</button>
                    <button class="mini-button" type="button" data-commission-id="${escapeHtml(commission.id)}" data-commission-action="mark-paid">Paid</button>
                    <button class="mini-button is-danger" type="button" data-commission-id="${escapeHtml(commission.id)}" data-commission-action="cancel">Cancel</button>
                  `
                : ""}
            </div>
          </td>
        </tr>
      `, "No commissions match the current filters.");
    }

    function renderBookingsSection() {
      const bookings = getFilteredBookings();

      setTableState("bookingsTableBody", "bookingsEmptyState", bookings, (booking) => `
        <tr>
          <td>
            <div class="cell-title">${renderTextValue(booking.name || "—", "text-ellipsis text-person")}</div>
            <div class="cell-subtitle">${renderTextValue([booking.email || "—", booking.phone].filter(Boolean).join(" • "), "text-ellipsis", { titleValue: [booking.email, booking.phone].filter(Boolean).join(" • ") || "—" })}</div>
          </td>
          <td>
            <div class="cell-title">${renderTextValue(booking.clientBusinessName || booking.clientName || "Client", "text-ellipsis text-business")}</div>
            <div class="cell-subtitle">${renderTextValue(booking.clientEmail || "—", "text-ellipsis text-email text-mono")}</div>
          </td>
          <td>${renderTextValue(booking.service || "General booking", "text-ellipsis")}</td>
          <td>
            <div class="cell-title">${renderTextValue(booking.date || "—", "text-ellipsis text-date text-mono")}</div>
            <div class="cell-subtitle">${renderTextValue(booking.time || "—", "text-ellipsis text-mono")}</div>
          </td>
          <td><span class="${badgeClass(booking.status)}" title="${escapeHtml(formatStatusLabel(booking.status))}">${escapeHtml(formatStatusLabel(booking.status))}</span></td>
          <td>${renderTextValue(booking.adminNotes || "—", "text-note", { titleValue: booking.adminNotes || "—" })}</td>
          <td class="actions-cell">
            <div class="actions">
              <button class="mini-button" type="button" data-booking-id="${escapeHtml(booking._id)}">Edit</button>
            </div>
          </td>
        </tr>
      `);
    }

    function renderInquiriesSection() {
      const inquiries = getFilteredInquiries();

      setTableState("inquiriesTableBody", "inquiriesEmptyState", inquiries, (inquiry) => `
        <tr>
          <td>
            <div class="cell-title">${renderTextValue(inquiry.name || "—", "text-ellipsis text-person")}</div>
            <div class="cell-subtitle">${renderTextValue(inquiry.email || "—", "text-ellipsis text-email text-mono")}</div>
          </td>
          <td>
            <div class="cell-title">${renderTextValue(inquiry.clientBusinessName || inquiry.clientName || inquiry.source || "Platform inquiry", "text-ellipsis text-business")}</div>
            <div class="cell-subtitle">${renderTextValue(inquiry.clientEmail || "—", "text-ellipsis text-email text-mono")}</div>
          </td>
          <td>${renderTextValue(inquiry.message || "—", "text-note", { titleValue: inquiry.message || "—" })}</td>
          <td><span class="${badgeClass(inquiry.status)}" title="${escapeHtml(formatStatusLabel(inquiry.status))}">${escapeHtml(formatStatusLabel(inquiry.status))}</span></td>
          <td>${renderTextValue(inquiry.source || "website", "text-ellipsis")}</td>
          <td>${renderTextValue(inquiry.adminNotes || "—", "text-note", { titleValue: inquiry.adminNotes || "—" })}</td>
          <td class="actions-cell">
            <div class="actions">
              <button class="mini-button" type="button" data-inquiry-id="${escapeHtml(inquiry._id)}">Edit</button>
            </div>
          </td>
        </tr>
      `);
    }

    function renderReviewsSection() {
      const reviews = getFilteredReviews();

      setTableState("reviewsTableBody", "reviewsEmptyState", reviews, (review) => {
        const displayStatus = normalizeDisplayReviewStatus(review);

        return `
          <tr>
            <td>
              <div class="cell-title">${renderTextValue(review.name || "—", "text-ellipsis text-person")}</div>
              <div class="cell-subtitle">${renderTextValue(review.role || "Customer", "text-ellipsis")}</div>
            </td>
            <td>
              <div class="cell-title">${renderTextValue(review.clientBusinessName || review.clientName || "Client", "text-ellipsis text-business")}</div>
              <div class="cell-subtitle">${renderTextValue(review.clientEmail || "—", "text-ellipsis text-email text-mono")}</div>
            </td>
            <td>${renderTextValue(ratingStars(review.rating), "text-ellipsis")}</td>
            <td>${renderTextValue(review.text || "—", "text-note", { titleValue: review.text || "—" })}</td>
            <td><span class="${badgeClass(displayStatus)}" title="${escapeHtml(formatStatusLabel(displayStatus))}">${escapeHtml(formatStatusLabel(displayStatus))}</span></td>
            <td>${renderTextValue(review.adminNotes || "—", "text-note", { titleValue: review.adminNotes || "—" })}</td>
            <td class="actions-cell">
              <div class="actions">
                <button class="mini-button" type="button" data-review-id="${escapeHtml(review._id)}">Moderate</button>
              </div>
            </td>
          </tr>
        `;
      });
    }

    function renderSupportSection() {
      const requests = getFilteredSupportRequests();
      const analytics = getSupportRequestAnalytics();

      document.getElementById("supportKpiGrid").innerHTML = [
        {
          label: "Total Requests",
          value: String(analytics.totalRequests),
          copy: "All support and upgrade requests currently stored in the client queue."
        },
        {
          label: "Open Requests",
          value: String(analytics.statusCounts.open || 0),
          copy: "Newly submitted requests that still need admin attention."
        },
        {
          label: "In Progress",
          value: String(analytics.statusCounts.in_progress || 0),
          copy: "Requests currently being handled by the AutomateX admin team."
        },
        {
          label: "Completed",
          value: String(analytics.statusCounts.resolved || 0),
          copy: "Requests that have been completed successfully."
        },
        {
          label: "Upgrade Requests",
          value: String(analytics.typeCounts.upgrade || 0),
          copy: "Manual package change requests waiting for admin review."
        },
        {
          label: "Bug Reports",
          value: String(analytics.typeCounts.bug || 0),
          copy: "Client-reported issues that may need investigation or follow-up."
        }
      ].map((card) => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <strong${buildTitleAttribute(card.value)}>${escapeHtml(card.value)}</strong>
          <div class="kpi-copy">${escapeHtml(card.copy)}</div>
        </article>
      `).join("");

      setTableState("supportRequestsTableBody", "supportRequestsEmptyState", requests, (request) => `
        <tr class="${request.priority === "urgent" || request.status === "open" ? "pending-row" : ""}">
          <td>
            <div class="cell-title">${renderTextValue(request.businessName || request.clientName || "Client", "text-ellipsis text-business")}</div>
            <div class="cell-subtitle">${renderTextValue([request.clientName || "—", request.clientEmail || "—"].join(" • "), "text-ellipsis", { titleValue: [request.clientName, request.clientEmail].filter(Boolean).join(" • ") || "—" })}</div>
          </td>
          <td>
            <div class="cell-title">${renderTextValue(formatRequestTypeLabel(request.type), "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(formatRequestedPackageLabel(request.requestedPackage), "text-ellipsis text-package")}</div>
          </td>
          <td>
            <div class="cell-title">${renderTextValue(request.subject || "Request", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(`${(request.message || "").slice(0, 90)}${String(request.message || "").length > 90 ? "..." : ""}` || "—", "text-note", { titleValue: request.message || "—" })}</div>
          </td>
          <td><span class="${requestPriorityBadgeClass(request.priority)}" title="${escapeHtml(formatStatusLabel(request.priority))}">${escapeHtml(formatStatusLabel(request.priority))}</span></td>
          <td><span class="${badgeClass(request.status)}" title="${escapeHtml(formatStatusLabel(request.status))}">${escapeHtml(formatStatusLabel(request.status))}</span></td>
          <td>${renderTextValue(formatShortDate(request.createdAt), "text-ellipsis text-date text-mono", { titleValue: formatDate(request.createdAt) })}</td>
          <td class="actions-cell">
            <div class="actions">
              <button class="mini-button" type="button" data-request-id="${escapeHtml(request.id)}" data-request-action="manage">Manage</button>
              ${["open", "in_progress"].includes(request.status)
                ? `<button class="mini-button is-warning" type="button" data-request-id="${escapeHtml(request.id)}" data-request-action="resolve">Mark as completed</button>`
                : ""}
            </div>
          </td>
        </tr>
      `, "No support or upgrade requests match the current filters.");
    }

    function getUserFilters() {
      return {
        search: String(document.getElementById("userSearch").value || "").trim().toLowerCase(),
        role: document.getElementById("userRoleFilter").value,
        status: document.getElementById("userStatusFilter").value
      };
    }

    function getFilteredUsers() {
      const { search, role, status } = getUserFilters();
      return state.allUsers
        .filter((user) => !role || user.role === role)
        .filter((user) => !status || user.status === status)
        .filter((user) => matchesSearch([user.name, user.email, user.businessName, user.accountStatus], search))
        .sort((left, right) => parseDateNumber(right.createdAt) - parseDateNumber(left.createdAt));
    }

    function getAuditFilters() {
      return {
        search: String(document.getElementById("auditSearch").value || "").trim().toLowerCase(),
        module: document.getElementById("auditModuleFilter").value,
        severity: document.getElementById("auditSeverityFilter").value,
        from: document.getElementById("auditFromFilter").value,
        to: document.getElementById("auditToFilter").value
      };
    }

    function getFilteredAuditLogs() {
      const { search, module, severity, from, to } = getAuditFilters();
      const fromTime = from ? new Date(from).getTime() : 0;
      const toTime = to ? new Date(`${to}T23:59:59`).getTime() : 0;

      return state.allAuditLogs
        .filter((log) => !module || log.module === module)
        .filter((log) => !severity || log.severity === severity)
        .filter((log) => {
          const time = parseDateNumber(log.createdAt);
          return (!fromTime || time >= fromTime) && (!toTime || time <= toTime);
        })
        .filter((log) => matchesSearch([log.actorName, log.actorEmail, log.targetLabel, log.action, log.targetType], search));
    }

    function renderUsersSection() {
      if (!canManageSystem()) {
        return;
      }

      setTableState("usersTableBody", "usersEmptyState", getFilteredUsers(), (user) => `
        <tr>
          <td>
            <div class="cell-title">${renderTextValue(user.name || user.businessName || "User", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(user.businessName || "No business name", "text-ellipsis")}</div>
          </td>
          <td>${renderTextValue(user.email || "—", "text-ellipsis text-email text-mono")}</td>
          <td><span class="${badgeClass(user.role)}">${escapeHtml(formatStatusLabel(user.role))}</span></td>
          <td><span class="${badgeClass(user.status)}">${escapeHtml(formatStatusLabel(user.status))}</span></td>
          <td><span class="${badgeClass(user.accountStatus)}">${escapeHtml(formatStatusLabel(user.accountStatus))}</span></td>
          <td>${renderTextValue(formatShortDate(user.createdAt), "text-ellipsis text-date text-mono", { titleValue: formatDate(user.createdAt) })}</td>
          <td>
            <div class="table-actions">
              <button class="mini-button" type="button" data-user-id="${escapeHtml(user.id)}">Manage</button>
            </div>
          </td>
        </tr>
      `, "No users match the current filters.");
    }

    function renderAuditLogsSection() {
      if (!canManageSystem()) {
        return;
      }

      setTableState("auditLogsTableBody", "auditLogsEmptyState", getFilteredAuditLogs(), (log) => `
        <tr>
          <td>${renderTextValue(formatDate(log.createdAt), "text-ellipsis text-date text-mono")}</td>
          <td>
            <div class="cell-title">${renderTextValue(log.actorName || log.actorEmail || "System", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(log.actorEmail || log.actorRole || "—", "text-ellipsis text-email")}</div>
          </td>
          <td><span class="${badgeClass(log.module)}">${escapeHtml(log.module || "Other")}</span></td>
          <td>${renderTextValue(log.action || "admin.action", "text-ellipsis text-mono")}</td>
          <td>
            <div class="cell-title">${renderTextValue(log.targetLabel || log.targetType || "—", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue([log.targetType, log.targetId].filter(Boolean).join(" • "), "text-ellipsis text-mono")}</div>
          </td>
          <td><span class="${badgeClass(log.severity)}">${escapeHtml(log.severity || "Low")}</span></td>
          <td>${renderTextValue(log.ipAddress || "—", "text-ellipsis text-mono")}</td>
          <td><button class="mini-button" type="button" data-audit-log-id="${escapeHtml(log.id)}">Details</button></td>
        </tr>
      `, "No audit logs match the current filters.");
    }

    function buildReportsQueryString() {
      const params = new URLSearchParams();
      const month = String(document.getElementById("reportsMonthFilter").value || "").trim();
      const from = String(document.getElementById("reportsFromFilter").value || "").trim();
      const to = String(document.getElementById("reportsToFilter").value || "").trim();

      if (from || to) {
        if (from) {
          params.set("from", from);
        }
        if (to) {
          params.set("to", to);
        }
      } else if (month) {
        params.set("month", month);
      }

      const query = params.toString();
      return query ? `?${query}` : "";
    }

    function setReportsCurrentMonthFields() {
      const now = new Date();
      document.getElementById("reportsMonthFilter").value = now.toISOString().slice(0, 7);
      document.getElementById("reportsFromFilter").value = "";
      document.getElementById("reportsToFilter").value = "";
    }

    function renderDistributionBars(containerId, values, formatter = (value) => String(value)) {
      const entries = Object.entries(values || {}).filter(([, value]) => toNumber(value) > 0);
      const maxValue = Math.max(...entries.map(([, value]) => toNumber(value)), 1);

      if (!entries.length) {
        document.getElementById(containerId).innerHTML = `<div class="empty-state">No distribution data available.</div>`;
        return;
      }

      document.getElementById(containerId).innerHTML = entries.map(([label, value]) => {
        const width = Math.max(6, Math.round((toNumber(value) / maxValue) * 100));
        return `
          <div class="metric-row">
            <div class="admin-min-w-0">
              <div class="cell-title">${escapeHtml(formatStatusLabel(label))}</div>
              <progress class="metric-progress" max="100" value="${escapeHtml(width)}">${escapeHtml(width)}%</progress>
            </div>
            <strong>${escapeHtml(formatter(value))}</strong>
          </div>
        `;
      }).join("");
    }

    function renderReportsTables(overview) {
      const tables = overview.tables || {};

      setTableState("reportsOverdueInvoicesTableBody", "reportsOverdueInvoicesEmptyState", tables.overdueInvoices || [], (invoice) => `
        <tr>
          <td>${renderTextValue(invoice.invoiceNumber || "Invoice", "text-ellipsis text-mono")}</td>
          <td>${renderTextValue(invoice.businessName || invoice.clientName || "Client", "text-ellipsis")}</td>
          <td>${renderTextValue(formatInvoiceCurrency(invoice.balance || 0, invoice.currency), "text-ellipsis text-money")}</td>
          <td>${renderTextValue(formatShortDate(invoice.dueDate), "text-ellipsis text-date text-mono", { titleValue: formatDate(invoice.dueDate) })}</td>
        </tr>
      `, "No overdue invoices found for this report.");

      setTableState("reportsProjectsAtRiskTableBody", "reportsProjectsAtRiskEmptyState", tables.projectsAtRisk || [], (project) => `
        <tr>
          <td>${renderTextValue(project.projectTitle || "Project", "text-ellipsis")}</td>
          <td><span class="${projectBadgeClass(project.status)}">${escapeHtml(project.status || "Planning")}</span></td>
          <td>${renderTextValue(`${toNumber(project.progressPercentage)}%`, "text-ellipsis text-mono")}</td>
          <td>${renderTextValue(formatShortDate(project.expectedDeadline), "text-ellipsis text-date text-mono", { titleValue: formatDate(project.expectedDeadline) })}</td>
        </tr>
      `, "No projects at risk found.");

      setTableState("reportsMaintenanceTableBody", "reportsMaintenanceEmptyState", tables.expiringMaintenancePlans || [], (plan) => `
        <tr>
          <td>${renderTextValue(plan.planName || "Maintenance plan", "text-ellipsis")}</td>
          <td><span class="${projectBadgeClass(plan.status)}">${escapeHtml(plan.status || "Pending")}</span></td>
          <td>${renderTextValue(formatInvoiceCurrency(plan.balanceAmount || 0), "text-ellipsis text-money")}</td>
          <td>${renderTextValue(formatShortDate(plan.renewalDate || plan.endDate), "text-ellipsis text-date text-mono")}</td>
        </tr>
      `, "No expiring maintenance plans found.");

      setTableState("reportsCommissionsTableBody", "reportsCommissionsEmptyState", tables.pendingCommissions || [], (commission) => `
        <tr>
          <td>${renderTextValue(commission.salesExecutiveName || "Employee", "text-ellipsis")}</td>
          <td>${renderTextValue(commission.commissionType || "Commission", "text-ellipsis")}</td>
          <td>${renderTextValue(formatInvoiceCurrency(commission.amount || 0), "text-ellipsis text-money")}</td>
          <td><span class="${projectBadgeClass(commission.status)}">${escapeHtml(commission.status || "Pending")}</span></td>
        </tr>
      `, "No pending commissions found.");

      setTableState("reportsLeadsTableBody", "reportsLeadsEmptyState", tables.newLeadsAndFollowUps || [], (lead) => `
        <tr>
          <td>
            <div class="cell-title">${renderTextValue(lead.businessName || lead.contactPerson || "Lead", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(lead.phone || lead.email || "—", "text-ellipsis")}</div>
          </td>
          <td>${renderTextValue(lead.interestedService || "Other", "text-ellipsis")}</td>
          <td><span class="${projectBadgeClass(lead.status)}">${escapeHtml(lead.status || "New")}</span></td>
          <td>${renderTextValue(formatShortDate(lead.followUpDate), "text-ellipsis text-date text-mono")}</td>
        </tr>
      `, "No lead follow-ups found.");

      setTableState("reportsSupportTableBody", "reportsSupportEmptyState", tables.openSupportRequests || [], (request) => `
        <tr>
          <td>
            <div class="cell-title">${renderTextValue(request.subject || formatRequestTypeLabel(request.type), "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(formatRequestTypeLabel(request.type), "text-ellipsis")}</div>
          </td>
          <td>${renderTextValue(request.businessName || request.clientName || "Client", "text-ellipsis")}</td>
          <td><span class="${requestPriorityBadgeClass(request.priority)}">${escapeHtml(formatStatusLabel(request.priority))}</span></td>
          <td><span class="${badgeClass(request.status)}">${escapeHtml(formatStatusLabel(request.status))}</span></td>
        </tr>
      `, "No open support requests found.");
    }

    function renderReportsSection() {
      const reports = state.reportsSummary || {};
      const overview = state.reportOverview || {};
      const kpis = overview.kpis || {};
      const revenue = overview.revenue || reports.revenue || {};
      const projectReport = overview.projects || {};
      const invoiceReport = overview.invoices || {};
      const salesReport = overview.sales || {};
      const maintenanceReport = overview.maintenance || {};
      const clients = reports.clients || {};
      const packages = reports.packages || {};
      const requests = overview.support || reports.requests || {};
      const packageCounts = packages.counts || {};
      const packageRevenue = packages.expectedMonthlyRevenue || {};
      const activityFeed = buildReportsActivityFeed();

      document.getElementById("reportsKpiGrid").innerHTML = [
        {
          label: "Total Clients",
          value: String(kpis.totalClients ?? clients.totalClients ?? 0),
          copy: "All AutomateX client records in the reporting scope."
        },
        {
          label: "Active Clients",
          value: String(kpis.activeClients ?? clients.activeClients ?? 0),
          copy: "Clients currently approved and active."
        },
        {
          label: "Total Projects",
          value: String(kpis.totalProjects ?? 0),
          copy: "All non-archived projects currently tracked."
        },
        {
          label: "Active Projects",
          value: String(kpis.activeProjects ?? 0),
          copy: "Projects not completed, cancelled, or on hold."
        },
        {
          label: "Completed Projects",
          value: String(kpis.completedProjects ?? 0),
          copy: "Projects marked completed."
        },
        {
          label: "Pending Invoices",
          value: String(kpis.pendingInvoices ?? ((revenue.totals && revenue.totals.pendingInvoiceCount) || 0)),
          copy: "Draft, sent, partial, or overdue invoices with open balances."
        },
        {
          label: "Overdue Invoices",
          value: String(kpis.overdueInvoices ?? ((revenue.totals && revenue.totals.overdueInvoiceCount) || 0)),
          copy: "Invoices past due or marked overdue."
        },
        {
          label: "Monthly Income",
          value: formatInvoiceCurrency(kpis.monthlyRevenue || revenue.totalInvoiced || 0),
          copy: "Invoice value issued in the selected period."
        },
        {
          label: "Monthly Paid",
          value: formatInvoiceCurrency(kpis.monthlyPaidAmount || revenue.totalPaid || 0),
          copy: "Paid invoice amount recorded in the selected period."
        },
        {
          label: "Monthly Pending",
          value: formatInvoiceCurrency(kpis.monthlyPendingBalance || revenue.totalPending || 0),
          copy: "Open invoice balance from the selected period."
        },
        {
          label: "Pending Commission",
          value: formatInvoiceCurrency(kpis.pendingCommission || salesReport.pendingCommissionAmount || 0),
          copy: "Pending or approved commissions not yet paid."
        },
        {
          label: "Paid Commission",
          value: formatInvoiceCurrency(kpis.paidCommissionThisMonth || salesReport.paidCommissionAmount || 0),
          copy: "Commission paid in the selected period."
        },
        {
          label: "Active Maintenance",
          value: String(kpis.activeMaintenancePlans ?? maintenanceReport.activePlans ?? 0),
          copy: "Maintenance plans currently active."
        },
        {
          label: "Expiring Soon",
          value: String(kpis.expiringSoonMaintenancePlans ?? maintenanceReport.expiringSoonPlans ?? 0),
          copy: "Maintenance renewals needing near-term follow-up."
        },
        {
          label: "New Leads",
          value: String(kpis.newLeadsThisMonth ?? salesReport.leadsThisPeriod ?? 0),
          copy: "Leads created in the selected period."
        },
        {
          label: "Converted Leads",
          value: String(kpis.convertedLeadsThisMonth ?? salesReport.convertedLeads ?? 0),
          copy: "Leads converted during the selected period."
        },
        {
          label: "Open Support",
          value: String(kpis.openSupportRequests ?? requests.openRequests ?? 0),
          copy: "Open or in-progress support workload."
        }
      ].map((card) => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <strong${buildTitleAttribute(card.value)}>${escapeHtml(card.value)}</strong>
          <div class="kpi-copy">${escapeHtml(card.copy)}</div>
        </article>
      `).join("");

      renderMetricList("reportsRevenueList", [
        {
          label: "Total invoice value",
          value: formatInvoiceCurrency(revenue.totalInvoiced || revenue.totalInvoiceValue || 0),
          hint: "All active invoice totals combined, excluding cancelled records."
        },
        {
          label: "Total paid",
          value: formatInvoiceCurrency(revenue.totalPaid || 0),
          hint: "Current paid amounts recorded on manual invoices."
        },
        {
          label: "Total balance",
          value: formatInvoiceCurrency(revenue.totalPending || revenue.totalBalance || 0),
          hint: "Remaining balances still outstanding across the invoice ledger."
        },
        {
          label: "Overdue amount",
          value: formatInvoiceCurrency(revenue.overdueBalance || revenue.overdueAmount || 0),
          hint: "Invoice balances already past due and still unpaid."
        },
        {
          label: "Paid this month",
          value: formatInvoiceCurrency(revenue.totalPaid || revenue.paidThisMonth || 0),
          hint: "Invoices recorded as paid during the current month."
        },
        {
          label: "Pending amount",
          value: formatInvoiceCurrency(revenue.totalPending || revenue.pendingAmount || 0),
          hint: "Open balances still in draft, sent, or partial payment states."
        }
      ], "No income report data found.");
      renderDistributionBars("reportsRevenueBars", revenue.revenueByInvoiceType || {}, formatInvoiceCurrency);

      renderMetricList("reportsClientList", [
        {
          label: "Total clients",
          value: String(clients.totalClients ?? 0),
          hint: "All client records excluding the official AutomateX admin account."
        },
        {
          label: "Active clients",
          value: String(clients.activeClients ?? 0),
          hint: "Clients currently approved and able to use their dashboards normally."
        },
        {
          label: "Pending clients",
          value: String(clients.pendingClients ?? 0),
          hint: "Signups still waiting on package assignment or approval."
        },
        {
          label: "Suspended clients",
          value: String(clients.suspendedClients ?? 0),
          hint: "Accounts currently paused from full client access."
        },
        {
          label: "Rejected clients",
          value: String(clients.rejectedClients ?? 0),
          hint: "Accounts declined through the client-management approval process."
        },
        {
          label: "New clients this month",
          value: String(clients.newClientsThisMonth ?? 0),
          hint: "Fresh signups created in the current month."
        }
      ], "No client reporting data is available yet.");

      renderMetricList("reportsPackageList", [
        {
          label: "Starter clients",
          value: `${String(packageCounts.starter ?? 0)} • ${formatInvoiceCurrency(packageRevenue.starter || 0)}`,
          hint: "Client count and expected monthly income from active Starter accounts."
        },
        {
          label: "Standard clients",
          value: `${String(packageCounts.standard ?? 0)} • ${formatInvoiceCurrency(packageRevenue.standard || 0)}`,
          hint: "Client count and expected monthly income from active Standard accounts."
        },
        {
          label: "Pro clients",
          value: `${String(packageCounts.pro ?? 0)} • ${formatInvoiceCurrency(packageRevenue.pro || 0)}`,
          hint: "Client count and expected monthly income from active Pro accounts."
        },
        {
          label: "Custom clients",
          value: `${String(packageCounts.custom ?? 0)} • ${formatInvoiceCurrency(packageRevenue.custom || 0)}`,
          hint: "Client count and expected monthly income from active Custom accounts."
        },
        {
          label: "Not assigned clients",
          value: `${String(packageCounts.not_assigned ?? 0)} • ${formatInvoiceCurrency(packageRevenue.not_assigned || 0)}`,
          hint: "Clients without an assigned service package yet."
        },
        {
          label: "Expected monthly income",
          value: formatInvoiceCurrency(packageRevenue.total || 0),
          hint: "Combined active package income estimate based on current client fees."
        }
      ], "No package reporting data is available yet.");

      renderMetricList("reportsRequestList", [
        {
          label: "Total requests",
          value: String(requests.openRequests ?? ((reports.requests && reports.requests.totalRequests) || 0)),
          hint: "All support, upgrade, bug, feature, payment, and general requests on record."
        },
        {
          label: "Open requests",
          value: String(requests.openRequests ?? 0),
          hint: "Tickets that still need first response or follow-up."
        },
        {
          label: "In progress",
          value: String(requests.inProgressRequests ?? 0),
          hint: "Requests currently being worked through by the admin."
        },
        {
          label: "Completed requests",
          value: String(requests.resolvedRequests ?? 0),
          hint: "Requests already completed and closed."
        },
        {
          label: "Upgrade requests",
          value: String(requests.upgradeRequests ?? 0),
          hint: "Manual package-change requests that still require admin action in client management."
        },
        {
          label: "Bug / urgent-high priority",
          value: `${String(requests.bugReports ?? 0)} • ${String(requests.urgentHighPriorityRequests ?? 0)}`,
          hint: "Bug reports alongside tickets marked high or urgent priority."
        }
      ], "No request reporting data is available yet.");

      renderDistributionBars("reportsProjectBars", projectReport.projectsByStatus || {});

      renderMetricList("reportsSalesList", [
        {
          label: "Leads this period",
          value: String(salesReport.leadsThisPeriod ?? 0),
          hint: "New leads created in the selected report period."
        },
        {
          label: "Converted leads",
          value: String(salesReport.convertedLeads ?? 0),
          hint: "Leads converted during the selected report period."
        },
        {
          label: "Conversion rate",
          value: `${toNumber(salesReport.conversionRate).toFixed(1)}%`,
          hint: "Converted leads divided by new leads in the selected period."
        },
        {
          label: "Pending commission",
          value: formatInvoiceCurrency(salesReport.pendingCommissionAmount || 0),
          hint: "Pending or approved commissions not yet paid."
        },
        {
          label: "Paid commission",
          value: formatInvoiceCurrency(salesReport.paidCommissionAmount || 0),
          hint: "Commission paid during the selected period."
        }
      ], "No sales reporting data is available yet.");

      renderMetricList("reportsMaintenanceList", [
        {
          label: "Active plans",
          value: String(maintenanceReport.activePlans ?? 0),
          hint: "Maintenance plans currently active."
        },
        {
          label: "Expiring soon",
          value: String(maintenanceReport.expiringSoonPlans ?? 0),
          hint: "Renewals marked expiring soon or due within 30 days."
        },
        {
          label: "Expired plans",
          value: String(maintenanceReport.expiredPlans ?? 0),
          hint: "Plans currently marked expired."
        },
        {
          label: "Expected renewal amount",
          value: formatInvoiceCurrency(maintenanceReport.renewalAmountExpected || 0),
          hint: "Open balance expected from expiring maintenance renewals."
        }
      ], "No maintenance reporting data is available yet.");

      renderDistributionBars("reportsInvoiceBars", invoiceReport.invoicesByPaymentStatus || {});
      renderReportsTables(overview);

      renderMetricList("reportsExportList", [
        {
          label: "Clients CSV",
          value: `${String(clients.totalClients ?? 0)} rows`,
          hint: "Downloads business, owner, package, billing, and account-status fields only."
        },
        {
          label: "Invoices CSV",
          value: `${String((revenue.totals && revenue.totals.invoiceCount) || revenue.totalInvoices || 0)} rows`,
          hint: "Downloads invoice, balance, due-date, and notes fields for manual reporting."
        },
        {
          label: "Income / Projects / Employee Leads / Maintenance CSV",
          value: "Available",
          hint: "Downloads focused report rows using the active report period filters."
        },
        {
          label: "Requests CSV",
          value: `${String(requests.totalRequests ?? 0)} rows`,
          hint: "Downloads client support and upgrade request history, including admin notes."
        },
        {
          label: "Security scope",
          value: "Sensitive auth fields excluded",
          hint: "Password hashes, tokens, and private login data are never downloaded."
        }
      ], "No download details found.");

      setTableState("reportsActivityTableBody", "reportsActivityEmptyState", activityFeed, (entry) => `
        <tr>
          <td>
            <div class="cell-title">${renderTextValue(entry.type || "Activity", "text-ellipsis")}</div>
            <div class="cell-subtitle">${renderTextValue(entry.title || "Activity", "text-ellipsis")}</div>
          </td>
          <td>
            <div class="cell-title">${renderTextValue(entry.details || "No additional details available.", "text-note", { titleValue: entry.details || "No additional details available." })}</div>
          </td>
          <td><span class="${badgeClass(entry.status)}" title="${escapeHtml(formatStatusLabel(entry.status))}">${escapeHtml(formatStatusLabel(entry.status))}</span></td>
          <td>${renderTextValue(formatDate(entry.date), "text-ellipsis text-date text-mono")}</td>
        </tr>
      `, "No recent activity is available for the current reporting window.");
    }

    function renderSettingsSection() {
      const settings = getAppSettings();
      document.getElementById("settingsAdminInfo").innerHTML = [
        {
          label: "Admin email",
          value: state.admin ? state.admin.email : "Not available"
        },
        {
          label: "Role",
          value: state.admin ? state.admin.role : "Not available"
        },
        {
          label: "Secure auth route",
          value: "/api/auth/me"
        },
        {
          label: "Admin data routes",
          value: "/api/admin/*"
        },
        {
          label: "Settings route",
          value: "/api/admin/settings"
        }
      ].map((item) => `
        <div class="settings-item">
          <span>${escapeHtml(item.label)}</span>
          <strong>${renderTextValue(item.value, "text-ellipsis")}</strong>
        </div>
      `).join("");

      [
        ["settingsCompanyName", settings.companyName],
        ["settingsCompanyEmail", settings.companyEmail],
        ["settingsCompanyPhone", settings.companyPhone],
        ["settingsWebsiteUrl", settings.websiteUrl],
        ["settingsLogoUrl", settings.logoUrl],
        ["settingsBusinessAddress", settings.businessAddress],
        ["settingsInvoicePrefix", settings.invoicePrefix],
        ["settingsDefaultCurrency", settings.defaultCurrency],
        ["settingsDefaultTaxRate", settings.defaultTaxRate],
        ["settingsDefaultPaymentTerms", settings.defaultPaymentTerms],
        ["settingsSupportEmail", settings.supportEmail],
        ["settingsWhatsappNumber", settings.whatsappNumber],
        ["settingsDefaultSupportMessage", settings.defaultSupportMessage],
        ["settingsBankName", settings.bankName],
        ["settingsBankBranch", settings.bankBranch],
        ["settingsBankAccountName", settings.bankAccountName],
        ["settingsBankAccountNumber", settings.bankAccountNumber],
        ["settingsPaymentInstructions", settings.paymentInstructions]
      ].forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) {
          field.value = value ?? "";
        }
      });

      document.getElementById("settingsBusinessSummary").innerHTML = [
        {
          label: "Invoice prefix",
          value: settings.invoicePrefix || DEFAULT_APP_SETTINGS.invoicePrefix
        },
        {
          label: "Default currency",
          value: settings.defaultCurrency || DEFAULT_APP_SETTINGS.defaultCurrency
        },
        {
          label: "Default tax rate",
          value: `${toNumber(settings.defaultTaxRate).toFixed(2)}%`
        },
        {
          label: "Payment terms",
          value: `${Math.round(toNumber(settings.defaultPaymentTerms))} days`
        },
        {
          label: "Support email",
          value: settings.supportEmail || "Not set"
        },
        {
          label: "Last updated",
          value: settings.updatedAt ? formatDate(settings.updatedAt) : "Using default values"
        }
      ].map((item) => `
        <div class="settings-item">
          <span>${escapeHtml(item.label)}</span>
          <strong>${renderTextValue(item.value, "text-ellipsis")}</strong>
        </div>
      `).join("");

      renderMetricList("settingsHealthList", getSystemHealthRows().map(([label, value]) => ({
        label,
        value: formatStatusLabel(value),
        hint: "Backend-reported system health field."
      })));
    }

    function renderNavCounters() {
      const packageAnalytics = getPackageAnalytics();
      const invoiceAnalytics = getInvoiceAnalytics();
      const requestAnalytics = getSupportRequestAnalytics();
      const billingAttentionCount = invoiceAnalytics.pendingInvoices + invoiceAnalytics.overdueInvoices + getPaymentAnalytics().overdueAccounts;
      document.getElementById("navCountClients").textContent = String(state.allClients.length);
      document.getElementById("navCountPending").textContent = String(getPendingApprovals().length);
      document.getElementById("navCountPackages").textContent = String(packageAnalytics.reduce((sum, entry) => sum + entry.active, 0));
      document.getElementById("navCountInvoices").textContent = String(billingAttentionCount);
      document.getElementById("navCountPayments").textContent = String(getPaymentAnalytics().overdueAccounts);
      document.getElementById("navCountProjects").textContent = String(state.allProjects.length);
      document.getElementById("navCountSales").textContent = String(
        state.salesSummary && Number.isFinite(Number(state.salesSummary.totalEmployees))
          ? Number(state.salesSummary.totalEmployees)
          : state.allSalesExecutives.length
      );
      document.getElementById("navCountBookings").textContent = String(state.allBookings.length);
      document.getElementById("navCountInquiries").textContent = String(state.allInquiries.length);
      document.getElementById("navCountReviews").textContent = String(
        state.allReviews.filter((review) => normalizeDisplayReviewStatus(review) === "pending").length
      );
      document.getElementById("navCountSupport").textContent = String(
        (requestAnalytics.statusCounts.open || 0) + (requestAnalytics.statusCounts.in_progress || 0)
      );
      const userCounter = document.getElementById("navCountUsers");
      const auditCounter = document.getElementById("navCountAuditLogs");
      if (userCounter) {
        userCounter.textContent = String(state.allUsers.length);
      }
      if (auditCounter) {
        auditCounter.textContent = String(state.allAuditLogs.length);
      }
    }

    function renderAll() {
      renderNavCounters();
      renderDashboardKpis();
      renderDashboardRevenue();
      renderDashboardPreviews();
      renderClientsSection();
      renderPendingApprovalsSection();
      renderPackagesSection();
      renderInvoicesSection();
      renderPaymentsSection();
      renderProjectsSection();
      renderMaintenanceSection();
      renderSalesSection();
      renderBookingsSection();
      renderInquiriesSection();
      renderReviewsSection();
      renderSupportSection();
      renderReportsSection();
      renderUsersSection();
      renderAuditLogsSection();
      renderSettingsSection();
      applyRoleVisibility();
    }

    async function verifyAdminSession() {
      const payload = await apiFetch("/api/auth/me");

      if (!payload.user) {
        redirectToLogin();
        throw new Error("Admin access is required.");
      }

      if (!isAdminUser(payload.user)) {
        redirectNonAdminUser(payload.user.role);
        throw new Error("Admin access is required.");
      }

      state.admin = payload.user;
      applyRoleVisibility();
      clearLogoutMarker();
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
      document.getElementById("adminIdentity").textContent = payload.user.email;
      document.getElementById("adminIdentity").title = payload.user.email;
    }

    async function loadStats() {
      state.stats = await apiFetch("/api/admin/stats");
    }

    async function loadSettings() {
      if (!canManageSystem()) {
        state.appSettings = { ...DEFAULT_APP_SETTINGS };
        return;
      }

      const payload = await apiFetch("/api/admin/settings");
      state.appSettings = payload.settings || { ...DEFAULT_APP_SETTINGS };
    }

    async function loadReportsSummary() {
      const query = buildReportsQueryString();
      const [summaryPayload, overviewPayload] = await Promise.all([
        apiFetch("/api/admin/reports/summary"),
        apiFetch(`/api/admin/reports/overview${query}`)
      ]);
      state.reportsSummary = summaryPayload;
      state.reportOverview = overviewPayload;
    }

    async function loadClients() {
      const payload = await apiFetch("/api/admin/clients");
      state.allClients = payload.clients || [];
    }

    async function loadInvoices() {
      const payload = await apiFetch("/api/admin/invoices");
      state.allInvoices = payload.invoices || [];
    }

    async function loadProjects() {
      const payload = await apiFetch("/api/admin/projects");
      state.allProjects = payload.projects || [];
    }

    async function loadMaintenancePlans() {
      const payload = await apiFetch("/api/admin/maintenance-plans");
      state.allMaintenancePlans = payload.maintenancePlans || [];
    }

    async function loadSalesData() {
      const [executivesPayload, leadsPayload, commissionsPayload, summaryPayload] = await Promise.all([
        apiFetch("/api/admin/sales-executives"),
        apiFetch("/api/admin/leads"),
        apiFetch("/api/admin/commissions"),
        apiFetch("/api/admin/sales-summary")
      ]);

      state.allSalesExecutives = executivesPayload.salesExecutives || [];
      state.allLeads = leadsPayload.leads || [];
      state.allCommissions = commissionsPayload.commissions || [];
      state.salesSummary = summaryPayload.salesSummary || null;
    }

    async function loadRequests() {
      const payload = await apiFetch("/api/admin/requests");
      state.allRequests = payload.requests || [];
    }

    async function loadBookings() {
      const payload = await apiFetch("/api/admin/bookings");
      state.allBookings = payload.bookings || [];
    }

    async function loadInquiries() {
      const payload = await apiFetch("/api/admin/inquiries");
      state.allInquiries = payload.inquiries || [];
    }

    async function loadReviews() {
      const payload = await apiFetch("/api/admin/reviews");
      state.allReviews = payload.reviews || [];
    }

    async function loadUsers() {
      if (!canManageSystem()) {
        state.allUsers = [];
        return;
      }

      const payload = await apiFetch("/api/admin/users");
      state.allUsers = payload.users || [];
    }

    async function loadAuditLogs() {
      if (!canManageSystem()) {
        state.allAuditLogs = [];
        return;
      }

      const payload = await apiFetch("/api/admin/audit-logs?limit=100");
      state.allAuditLogs = payload.logs || [];
    }

    async function refreshAllData() {
      const loaders = [
        { label: "admin stats", run: loadStats },
        { label: "settings", run: loadSettings },
        { label: "reports", run: loadReportsSummary },
        { label: "clients", run: loadClients },
        { label: "invoices", run: loadInvoices },
        { label: "projects", run: loadProjects },
        { label: "maintenance plans", run: loadMaintenancePlans },
        { label: "employee data", run: loadSalesData },
        { label: "support requests", run: loadRequests },
        { label: "bookings", run: loadBookings },
        { label: "inquiries", run: loadInquiries },
        { label: "reviews", run: loadReviews },
        { label: "users", run: loadUsers },
        { label: "audit logs", run: loadAuditLogs }
      ];
      const results = await Promise.allSettled(loaders.map((loader) => loader.run()));
      const failedModules = results
        .map((result, index) => result.status === "rejected" ? loaders[index].label : "")
        .filter(Boolean);

      renderAll();

      if (failedModules.length) {
        showBanner(`Some admin data could not be updated: ${failedModules.join(", ")}. Other sections are still available.`, "warning");
      } else {
        hideBanner();
      }

      return failedModules;
    }

    function openDrawer(config) {
      state.drawer = config;
      document.getElementById("drawerEyebrow").textContent = config.eyebrow;
      document.getElementById("drawerTitle").textContent = config.title;
      document.getElementById("drawerSubtitle").textContent = config.subtitle;
      document.getElementById("drawerTitle").title = config.title || "";
      document.getElementById("drawerSubtitle").title = config.subtitle || "";
      document.getElementById("drawerBody").innerHTML = config.body;
      document.getElementById("drawerShell").classList.add("is-open");
      attachDrawerHandlers();
    }

    function closeDrawer() {
      state.drawer = null;
      document.getElementById("drawerShell").classList.remove("is-open");
      document.getElementById("drawerBody").innerHTML = "";
    }

    function userDetailSection(user) {
      return `
        <form id="userRoleForm">
          <input type="hidden" name="userId" value="${escapeHtml(user.id)}">
          <div class="inline-note">
            Role and status changes affect admin access immediately. The final active admin and the official AutomateX admin account are protected by the server.
          </div>
          <div class="drawer-grid admin-mt-16">
            <div class="field">
              <label>Name</label>
              <input class="input" value="${escapeHtml(user.name || "")}" disabled>
            </div>
            <div class="field">
              <label>Email</label>
              <input class="input" value="${escapeHtml(user.email || "")}" disabled>
            </div>
            <div class="field">
              <label>Role</label>
              <select class="select" name="role">
                ${ADMIN_ROLE_OPTIONS.map((role) => `
                  <option value="${role}" ${user.role === role ? "selected" : ""}>${escapeHtml(formatStatusLabel(role))}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>Status</label>
              <select class="select" name="status">
                ${USER_STATUS_OPTIONS.map((status) => `
                  <option value="${status}" ${user.status === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>
                `).join("")}
              </select>
            </div>
          </div>
          <div class="settings-grid admin-mt-16">
            ${[
              ["Account status", formatStatusLabel(user.accountStatus)],
              ["Payment status", formatStatusLabel(user.paymentStatus)],
              ["Created", formatDate(user.createdAt)],
              ["Business", user.businessName || "Not set"]
            ].map(([label, value]) => `
              <div class="settings-item">
                <span>${escapeHtml(label)}</span>
                <strong>${renderTextValue(value, "text-ellipsis")}</strong>
              </div>
            `).join("")}
          </div>
          <div class="drawer-actions">
            <button class="button button-primary" type="submit">Save Access</button>
          </div>
        </form>
      `;
    }

    function auditLogDetailSection(log) {
      const renderJson = (value) => `<pre class="inline-note admin-json-note">${escapeHtml(JSON.stringify(value || null, null, 2))}</pre>`;
      return `
        <div class="settings-grid">
          ${[
            ["Date/time", formatDate(log.createdAt)],
            ["Actor", [log.actorName, log.actorEmail].filter(Boolean).join(" • ") || "System"],
            ["Role", formatStatusLabel(log.actorRole || "system")],
            ["Module", log.module || "Other"],
            ["Action", log.action || "admin.action"],
            ["Target", [log.targetType, log.targetLabel].filter(Boolean).join(" • ") || "—"],
            ["Target ID", log.targetId || "—"],
            ["Severity", log.severity || "Low"],
            ["IP", log.ipAddress || "—"],
            ["User agent", log.userAgent || "—"]
          ].map(([label, value]) => `
            <div class="settings-item">
              <span>${escapeHtml(label)}</span>
              <strong>${renderTextValue(value, "text-ellipsis")}</strong>
            </div>
          `).join("")}
        </div>
        <div class="drawer-section">
          <small class="kicker">Previous Value</small>
          ${renderJson(log.oldValue)}
        </div>
        <div class="drawer-section">
          <small class="kicker">New Value</small>
          ${renderJson(log.newValue)}
        </div>
      `;
    }

    function openUserDrawer(userId) {
      const user = state.allUsers.find((item) => item.id === userId);
      if (!user) {
        throw new Error("User was not found in the current list.");
      }

      openDrawer({
        eyebrow: "User Access",
        title: user.email || "User",
        subtitle: "Review and update this account role or active status.",
        body: userDetailSection(user)
      });
    }

    function openAuditLogDrawer(logId) {
      const log = state.allAuditLogs.find((item) => item.id === logId);
      if (!log) {
        throw new Error("Audit log was not found in the current list.");
      }

      openDrawer({
        eyebrow: "Audit Detail",
        title: log.action || "Audit entry",
        subtitle: [log.module, log.severity, formatDate(log.createdAt)].filter(Boolean).join(" • "),
        body: auditLogDetailSection(log)
      });
    }

    function clientDetailSection(client, options = {}) {
      const approvalMode = options.approvalMode === true;
      const selectedPlan = approvalMode && client.plan === "not_assigned" ? "not_assigned" : client.plan;
      const selectedFeatures = Array.isArray(client.allowedFeatures) ? client.allowedFeatures : [];

      return `
        <form id="clientDrawerForm" data-approval-mode="${approvalMode ? "true" : "false"}">
          <input type="hidden" name="clientId" value="${escapeHtml(client.id)}">

          ${approvalMode
            ? `
                <div class="inline-note">
                  Approving this client will activate the account, assign the chosen package, save billing values, and unlock the selected feature access for the official AutomateX client dashboard.
                </div>
              `
            : ""}

          <div class="chip-row ${approvalMode ? "admin-mt-16" : ""}">
            <span class="data-chip"><strong>${renderTextValue(formatShortDate(client.createdAt), "text-ellipsis text-date text-mono", { titleValue: formatDate(client.createdAt) })}</strong>Signup Date</span>
            <span class="data-chip"><strong>${renderTextValue(formatStatusLabel(client.accountStatus), "text-ellipsis text-status", { titleValue: formatStatusLabel(client.accountStatus) })}</strong>Current Status</span>
            <span class="data-chip"><strong>${renderTextValue(client.location || "Not set", "text-ellipsis text-location")}</strong>Location</span>
          </div>

          <div class="drawer-grid admin-mt-16">
            <div class="field">
              <label>Owner name</label>
              <input class="input" name="name" value="${escapeHtml(client.name)}" disabled>
            </div>
            <div class="field">
              <label>Business name</label>
              <input class="input" name="businessName" value="${escapeHtml(client.businessName)}">
            </div>
            <div class="field">
              <label>Email</label>
              <input class="input" name="email" value="${escapeHtml(client.email)}" disabled>
            </div>
            <div class="field">
              <label>Phone</label>
              <input class="input" name="phone" value="${escapeHtml(client.phone)}">
            </div>
            <div class="field">
              <label>Business type</label>
              <input class="input" name="businessType" value="${escapeHtml(client.businessType)}">
            </div>
            <div class="field">
              <label>Location</label>
              <input class="input" name="location" value="${escapeHtml(client.location)}">
            </div>
            <div class="field">
              <label>Package</label>
              <select class="select" name="plan">
                ${["not_assigned", "starter", "standard", "pro", "custom"].map((plan) => `
                  <option value="${plan}" ${selectedPlan === plan ? "selected" : ""}>${escapeHtml(formatPlanLabel(plan))}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>Account status</label>
              ${approvalMode
                ? `
                    <input type="hidden" name="accountStatus" value="active">
                    <select class="select" disabled>
                      <option value="active" selected>Active</option>
                    </select>
                  `
                : `
                    <select class="select" name="accountStatus">
                      ${CLIENT_ACCOUNT_STATUS_OPTIONS.map((status) => `
                        <option value="${status}" ${client.accountStatus === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>
                      `).join("")}
                    </select>
                  `}
            </div>
            <div class="field">
              <label>Monthly fee</label>
              <input class="input" name="monthlyFee" type="number" step="0.01" min="0" value="${escapeHtml(client.monthlyFee)}">
            </div>
            <div class="field">
              <label>Payment status</label>
              <select class="select" name="paymentStatus">
                ${CLIENT_PAYMENT_STATUS_OPTIONS.map((status) => `
                  <option value="${status}" ${client.paymentStatus === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>Next payment date</label>
              <input class="input" name="nextPaymentDate" type="date" value="${client.nextPaymentDate ? new Date(client.nextPaymentDate).toISOString().slice(0, 10) : ""}">
            </div>
            <div class="field">
              <label>Account access</label>
              ${approvalMode
                ? `
                    <input type="hidden" name="isActive" value="true">
                    <select class="select" disabled>
                      <option value="true" selected>Enabled</option>
                    </select>
                  `
                : `
                    <select class="select" name="isActive">
                      <option value="true" ${client.isActive ? "selected" : ""}>Enabled</option>
                      <option value="false" ${!client.isActive ? "selected" : ""}>Disabled</option>
                    </select>
                  `}
            </div>
          </div>

          <div class="drawer-section">
            <div class="field">
              <label>Working hours</label>
              <input class="input" name="workingHours" value="${escapeHtml(client.workingHours)}">
            </div>
            <div class="field admin-mt-14">
              <label>Booking URL</label>
              <input class="input" name="bookingUrl" value="${escapeHtml(client.bookingUrl)}">
            </div>
            <div class="field admin-mt-14">
              <label>Chatbot language</label>
              <input class="input" name="chatbotLanguage" value="${escapeHtml(client.chatbotLanguage)}">
            </div>
            <div class="field admin-mt-14">
              <label>Services (comma separated)</label>
              <textarea class="textarea" name="services">${escapeHtml((client.services || []).join(", "))}</textarea>
            </div>
          </div>

          <div class="drawer-section">
            <small class="kicker">Feature Access</small>
            <p class="subtle client-feature-hint" id="clientFeatureHint">
              ${usesAutomaticFeatureDefaults(selectedPlan)
                ? selectedPlan === "not_assigned"
                  ? "No features are enabled until a package is assigned."
                  : `${formatPlanLabel(selectedPlan)} uses the AutomateX package defaults shown below. Switch to Custom to manually control feature access.`
                : "Custom package selected. Choose the allowed features for this client manually."}
            </p>
            <div class="checkbox-grid admin-mt-14">
              ${FEATURE_OPTIONS.map((feature) => `
                <label class="feature-card">
                  <input
                    type="checkbox"
                    name="allowedFeatures"
                    value="${feature.key}"
                    ${selectedFeatures.includes(feature.key) ? "checked" : ""}
                    ${usesAutomaticFeatureDefaults(selectedPlan) ? "disabled" : ""}
                  >
                  <span>${escapeHtml(feature.label)}</span>
                </label>
              `).join("")}
            </div>
          </div>

          <div class="drawer-actions">
            ${approvalMode
              ? `
                  <button class="button button-danger" id="clientRejectButton" type="button">Reject Client</button>
                  <button class="button button-primary" type="submit">Approve Client</button>
                `
              : `
                  <button class="button button-danger" id="clientSuspendButton" type="button">Suspend Client</button>
                  <button class="button button-primary" type="submit">Save Client</button>
                `}
          </div>
        </form>
      `;
    }

    function syncClientFeatureAccessForm() {
      const clientForm = document.getElementById("clientDrawerForm");
      if (!clientForm) {
        return;
      }

      const planField = clientForm.querySelector('[name="plan"]');
      const featureHint = document.getElementById("clientFeatureHint");
      const featureInputs = Array.from(clientForm.querySelectorAll('input[name="allowedFeatures"]'));
      if (!planField || !featureInputs.length) {
        return;
      }

      const selectedPlan = String(planField.value || "not_assigned");
      const automaticDefaults = usesAutomaticFeatureDefaults(selectedPlan);
      const defaultFeatures = new Set(getPlanFeatureDefaults(selectedPlan));

      featureInputs.forEach((input) => {
        if (automaticDefaults) {
          input.checked = defaultFeatures.has(input.value);
          input.disabled = true;
          return;
        }

        input.disabled = false;
      });

      if (!featureHint) {
        return;
      }

      if (selectedPlan === "not_assigned") {
        featureHint.textContent = "No features are enabled until a package is assigned.";
      } else if (automaticDefaults) {
        featureHint.textContent = `${formatPlanLabel(selectedPlan)} uses the AutomateX package defaults shown below. Switch to Custom to manually control feature access.`;
      } else {
        featureHint.textContent = "Custom package selected. Choose the allowed features for this client manually.";
      }
    }

    function bookingDetailSection(booking) {
      return `
        <form id="bookingDrawerForm">
          <input type="hidden" name="bookingId" value="${escapeHtml(booking._id)}">
          <div class="drawer-grid">
            <div class="field">
              <label>Customer name</label>
              <input class="input" name="name" value="${escapeHtml(booking.name)}">
            </div>
            <div class="field">
              <label>Customer email</label>
              <input class="input" name="email" value="${escapeHtml(booking.email)}">
            </div>
            <div class="field">
              <label>Phone</label>
              <input class="input" name="phone" value="${escapeHtml(booking.phone || "")}">
            </div>
            <div class="field">
              <label>Service</label>
              <input class="input" name="service" value="${escapeHtml(booking.service || "")}">
            </div>
            <div class="field">
              <label>Date</label>
              <input class="input" name="date" value="${escapeHtml(booking.date)}" placeholder="YYYY-MM-DD">
            </div>
            <div class="field">
              <label>Time</label>
              <input class="input" name="time" value="${escapeHtml(booking.time)}" placeholder="HH:MM">
            </div>
            <div class="field">
              <label>Status</label>
              <select class="select" name="status">
                ${["pending", "confirmed", "completed", "cancelled"].map((status) => `
                  <option value="${status}" ${booking.status === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>Linked business</label>
              <input class="input" value="${escapeHtml(booking.clientBusinessName || booking.clientName || "Client")}" disabled>
            </div>
          </div>

          <div class="drawer-section">
            <div class="field">
              <label>Admin notes</label>
              <textarea class="textarea" name="adminNotes">${escapeHtml(booking.adminNotes || "")}</textarea>
            </div>
          </div>

          <div class="drawer-actions">
            <button class="button button-danger" type="button" id="bookingCancelButton">Mark Cancelled</button>
            <button class="button button-primary" type="submit">Save Booking</button>
          </div>
        </form>
      `;
    }

    function inquiryDetailSection(inquiry) {
      return `
        <form id="inquiryDrawerForm">
          <input type="hidden" name="inquiryId" value="${escapeHtml(inquiry._id)}">
          <div class="drawer-grid">
            <div class="field">
              <label>Lead name</label>
              <input class="input" value="${escapeHtml(inquiry.name)}" disabled>
            </div>
            <div class="field">
              <label>Lead email</label>
              <input class="input" value="${escapeHtml(inquiry.email)}" disabled>
            </div>
            <div class="field">
              <label>Linked business</label>
              <input class="input" value="${escapeHtml(inquiry.clientBusinessName || inquiry.clientName || inquiry.source || "Platform inquiry")}" disabled>
            </div>
            <div class="field">
              <label>Status</label>
              <select class="select" name="status">
                ${["new", "contacted", "converted", "closed", "in_progress"].map((status) => `
                  <option value="${status}" ${inquiry.status === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>
                `).join("")}
              </select>
            </div>
          </div>

          <div class="drawer-section">
            <div class="field">
              <label>Lead message</label>
              <textarea class="textarea" disabled>${escapeHtml(inquiry.message)}</textarea>
            </div>
            <div class="field admin-mt-14">
              <label>Client notes</label>
              <textarea class="textarea" disabled>${escapeHtml(inquiry.clientNotes || "")}</textarea>
            </div>
            <div class="field admin-mt-14">
              <label>Admin notes</label>
              <textarea class="textarea" name="adminNotes">${escapeHtml(inquiry.adminNotes || "")}</textarea>
            </div>
          </div>

          <div class="drawer-actions">
            <button class="button button-secondary" type="button" id="inquiryConvertedButton">Mark Converted</button>
            <button class="button button-primary" type="submit">Save Inquiry</button>
          </div>
        </form>
      `;
    }

    function reviewDetailSection(review) {
      return `
        <form id="reviewDrawerForm">
          <input type="hidden" name="reviewId" value="${escapeHtml(review._id)}">
          <div class="drawer-grid">
            <div class="field">
              <label>Reviewer</label>
              <input class="input" value="${escapeHtml(review.name)}" disabled>
            </div>
            <div class="field">
              <label>Linked business</label>
              <input class="input" value="${escapeHtml(review.clientBusinessName || review.clientName || "Client")}" disabled>
            </div>
            <div class="field">
              <label>Rating</label>
              <input class="input" value="${escapeHtml(ratingStars(review.rating))}" disabled>
            </div>
            <div class="field">
              <label>Moderation status</label>
              <select class="select" name="status">
                <option value="pending" ${review.status === "pending" ? "selected" : ""}>Pending</option>
                <option value="published" ${review.status === "published" ? "selected" : ""}>Approved</option>
                <option value="hidden" ${review.status === "hidden" ? "selected" : ""}>Rejected</option>
              </select>
            </div>
          </div>

          <div class="drawer-section">
            <div class="field">
              <label>Review message</label>
              <textarea class="textarea" disabled>${escapeHtml(review.text)}</textarea>
            </div>
            <div class="field admin-mt-14">
              <label>Admin notes</label>
              <textarea class="textarea" name="adminNotes">${escapeHtml(review.adminNotes || "")}</textarea>
            </div>
          </div>

          <div class="drawer-actions">
            <button class="button button-secondary" type="button" id="reviewApproveButton">Approve</button>
            <button class="button button-danger" type="button" id="reviewRejectButton">Reject</button>
            <button class="button button-primary" type="submit">Save Review</button>
          </div>
        </form>
      `;
    }

    function invoiceClientOptionsMarkup(selectedClientId = "") {
      const clients = getInvoiceClients();

      if (!clients.length) {
        return `<option value="">No clients added yet</option>`;
      }

      return clients.map((client) => `
        <option value="${escapeHtml(client.id)}" ${selectedClientId === client.id ? "selected" : ""}>
          ${escapeHtml(client.businessName || client.name)} • ${escapeHtml(client.name)}
        </option>
      `).join("");
    }

    function invoiceProjectOptionsMarkup(selectedProjectId = "") {
      return [
        `<option value="">No project link</option>`,
        ...state.allProjects
          .sort((left, right) => compareStrings(left.projectTitle, right.projectTitle))
          .map((project) => `
            <option value="${escapeHtml(project.id)}" ${selectedProjectId === project.id ? "selected" : ""}>
              ${escapeHtml(project.projectTitle || "Project")} • ${escapeHtml(project.businessName || project.clientName || "Client")}
            </option>
          `)
      ].join("");
    }

    function invoiceMaintenanceOptionsMarkup(selectedPlanId = "") {
      return [
        `<option value="">No maintenance link</option>`,
        ...state.allMaintenancePlans
          .sort((left, right) => compareStrings(left.planName, right.planName))
          .map((plan) => `
            <option value="${escapeHtml(plan.id)}" ${selectedPlanId === plan.id ? "selected" : ""}>
              ${escapeHtml(plan.planName || plan.projectTitle || "Maintenance")} • ${escapeHtml(plan.businessName || plan.clientName || "Client")}
            </option>
          `)
      ].join("");
    }

    function invoiceLeadOptionsMarkup(selectedLeadId = "") {
      return [
        `<option value="">No lead link</option>`,
        ...state.allLeads
          .sort((left, right) => compareStrings(left.businessName, right.businessName))
          .map((lead) => `
            <option value="${escapeHtml(lead.id)}" ${selectedLeadId === lead.id ? "selected" : ""}>
              ${escapeHtml(lead.businessName || lead.contactName || "Lead")} • ${escapeHtml(lead.status || "Lead")}
            </option>
          `)
      ].join("");
    }

    function invoiceSalesExecutiveOptionsMarkup(selectedExecutiveId = "") {
      return [
        `<option value="">No employee</option>`,
        ...state.allSalesExecutives
          .sort((left, right) => compareStrings(left.fullName, right.fullName))
          .map((executive) => `
            <option value="${escapeHtml(executive.id)}" ${selectedExecutiveId === executive.id ? "selected" : ""}>
              ${escapeHtml(executive.fullName || "Employee")}
            </option>
          `)
      ].join("");
    }

    function invoiceReferenceLabel(invoice) {
      return [
        invoice.invoiceType || "Custom",
        invoice.projectTitle,
        invoice.maintenancePlanName,
        invoice.leadBusinessName,
        invoice.salesExecutiveName
      ].filter(Boolean).join(" • ");
    }

    function invoiceItemEditorMarkup(item = {}) {
      const quantity = toNumber(item.quantity) || 1;
      const unitPrice = toNumber(item.unitPrice);
      const total = toNumber(item.total || quantity * unitPrice);

      return `
        <article class="preview-item" data-invoice-item-row>
          <div class="drawer-grid">
            <div class="field admin-grid-span-2">
              <label>Item name</label>
              <input class="input" name="itemName" value="${escapeHtml(item.name || "")}" placeholder="Monthly service, campaign setup, support retainers">
            </div>
            <div class="field">
              <label>Quantity</label>
              <input class="input" name="itemQuantity" type="number" min="0" step="0.01" value="${escapeHtml(quantity)}">
            </div>
            <div class="field">
              <label>Unit price</label>
              <input class="input" name="itemUnitPrice" type="number" min="0" step="0.01" value="${escapeHtml(unitPrice)}">
            </div>
          </div>
          <div class="preview-actions admin-mt-16">
            <span class="data-chip"><strong data-invoice-item-total>${escapeHtml(formatInvoiceCurrency(total))}</strong>Item Total</span>
            <button class="mini-button is-danger" type="button" data-remove-invoice-item="true">Remove</button>
          </div>
        </article>
      `;
    }

    function invoiceReadonlySection(invoice) {
      const paymentInstructions = buildPaymentInstructionsText();
      const canManageInvoices = hasAdminPermission("invoices:manage");
      const canSendInvoices = hasAdminPermission("invoices:send-email");
      const canUpdateInvoicePayments = hasAdminPermission("invoices:payment-update");
      const lineItemsMarkup = Array.isArray(invoice.items) && invoice.items.length
        ? `<div class="preview-list admin-mt-14">${invoice.items.map((item) => `
            <article class="preview-item">
              <div class="preview-top">
                <div>
                  <strong>${escapeHtml(item.name)}</strong>
                  <p>${escapeHtml(item.quantity)} × ${escapeHtml(formatInvoiceCurrency(item.unitPrice, invoice.currency))}</p>
                </div>
                <span class="data-chip"><strong>${escapeHtml(formatInvoiceCurrency(item.total, invoice.currency))}</strong>Total</span>
              </div>
            </article>
          `).join("")}</div>`
        : `<div class="empty-state">No invoice items were saved for this record.</div>`;

      return `
        <div class="chip-row">
          <span class="data-chip"><strong>${renderTextValue(invoice.invoiceNumber || "—", "text-ellipsis text-invoice text-mono")}</strong>Invoice Number</span>
          <span class="data-chip"><strong>${renderTextValue(invoice.paymentStatus || formatStatusLabel(invoice.status), "text-ellipsis text-status")}</strong>Payment Status</span>
          <span class="data-chip"><strong>${renderTextValue(invoice.invoiceType || "Custom", "text-ellipsis")}</strong>Type</span>
          <span class="data-chip"><strong>${renderTextValue(invoice.emailStatus || "Not Sent", "text-ellipsis text-status")}</strong>Email</span>
          <span class="data-chip"><strong>${renderTextValue(formatShortDate(invoice.issueDate), "text-ellipsis text-date text-mono", { titleValue: formatDate(invoice.issueDate) })}</strong>Issue Date</span>
          <span class="data-chip"><strong>${renderTextValue(formatShortDate(invoice.dueDate), "text-ellipsis text-date text-mono", { titleValue: formatDate(invoice.dueDate) })}</strong>Due Date</span>
        </div>

        <div class="settings-grid admin-mt-18">
          <div class="settings-item">
            <span>Client</span>
            <strong>${renderTextValue(invoice.clientName || "—", "text-ellipsis text-person")}</strong>
          </div>
          <div class="settings-item">
            <span>Business</span>
            <strong>${renderTextValue(invoice.businessName || "—", "text-ellipsis text-business")}</strong>
          </div>
          <div class="settings-item">
            <span>Total Amount</span>
            <strong>${renderTextValue(formatInvoiceCurrency(invoice.totalAmount, invoice.currency), "text-ellipsis text-currency text-mono")}</strong>
          </div>
          <div class="settings-item">
            <span>Balance</span>
            <strong>${renderTextValue(formatInvoiceCurrency(invoice.balance, invoice.currency), "text-ellipsis text-currency text-mono")}</strong>
          </div>
          <div class="settings-item">
            <span>Reference</span>
            <strong>${renderTextValue(invoiceReferenceLabel(invoice) || "Custom invoice", "text-ellipsis")}</strong>
          </div>
          <div class="settings-item">
            <span>Payment Method</span>
            <strong>${renderTextValue(invoice.paymentMethod || "Other", "text-ellipsis")}</strong>
          </div>
        </div>

        <div class="drawer-section">
          <small class="kicker">Invoice Details</small>
          <div class="metric-list admin-mt-14">
            <div class="metric-row">
              <div>
                <div class="cell-title">${escapeHtml(invoice.title || "Invoice")}</div>
                <small>${escapeHtml(invoice.description || "No description added.")}</small>
              </div>
              <strong>${escapeHtml(formatInvoiceCurrency(invoice.totalAmount, invoice.currency))}</strong>
            </div>
            <div class="metric-row">
              <div>
                <div class="cell-title">Collected Amount</div>
                <small>Paid amount recorded manually by the admin team.</small>
              </div>
              <strong>${escapeHtml(formatInvoiceCurrency(invoice.paidAmount, invoice.currency))}</strong>
            </div>
            <div class="metric-row">
              <div>
                <div class="cell-title">Payment Notes</div>
                <small>${escapeHtml(invoice.paymentNotes || "No payment notes added.")}</small>
              </div>
              <strong>${escapeHtml(invoice.paidDate ? formatShortDate(invoice.paidDate) : "Open")}</strong>
            </div>
          </div>
        </div>

        <div class="drawer-section">
          <small class="kicker">Line Items</small>
          ${lineItemsMarkup}
        </div>

        <div class="drawer-section">
          <small class="kicker">Notes</small>
          <div class="metric-list admin-mt-14">
            <div class="metric-row">
              <div>
                <div class="cell-title">Client Notes</div>
                <small>${escapeHtml(invoice.notes || "No invoice notes added.")}</small>
              </div>
              <strong>${escapeHtml(invoice.clientEmail || "—")}</strong>
            </div>
            <div class="metric-row">
              <div>
                <div class="cell-title">Admin Notes</div>
                <small>${escapeHtml(invoice.adminNotes || "No internal notes added.")}</small>
              </div>
              <strong>${escapeHtml(invoice.paidDate ? formatShortDate(invoice.paidDate) : "Not paid")}</strong>
            </div>
          </div>
        </div>

        ${paymentInstructions
          ? `
              <div class="drawer-section">
                <small class="kicker">Payment Instructions</small>
                <div class="metric-list admin-mt-14">
                  <div class="metric-row">
                    <div>
                      <div class="cell-title">Manual payment details</div>
                      <small>${escapeHtml(paymentInstructions).replace(/\n/g, "<br>")}</small>
                    </div>
                    <strong>${escapeHtml(getAppSettings().supportEmail || getAppSettings().companyEmail || "AutomateX")}</strong>
                  </div>
                </div>
              </div>
            `
          : ""}

        <div class="drawer-actions">
          <button class="button button-secondary" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="download-pdf">Download PDF</button>
          ${canSendInvoices ? `<button class="button button-secondary" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="send-email">Email Client</button>` : ""}
          ${canManageInvoices ? `<button class="button button-secondary" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="edit">Edit Invoice</button>` : ""}
          ${canUpdateInvoicePayments && invoice.status !== "cancelled" && toNumber(invoice.balance) > 0
            ? `<button class="button button-secondary" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="add-payment">Add Payment</button>`
            : ""}
          ${canUpdateInvoicePayments && invoice.status !== "cancelled" && toNumber(invoice.balance) > 0
            ? `<button class="button button-primary" type="button" data-invoice-id="${escapeHtml(invoice.id)}" data-invoice-action="mark-paid">Mark Paid</button>`
            : ""}
        </div>
      `;
    }

    function invoiceFormSection(invoice = null, options = {}) {
      const mode = options.mode || (invoice ? "edit" : "create");
      const statusOptions = mode === "create" ? ["draft", "sent"] : INVOICE_STATUS_OPTIONS;
      const settings = getAppSettings();
      const defaultIssueDate = new Date().toISOString();
      const defaultDueDate = calculateDueDateInputValue(defaultIssueDate, settings.defaultPaymentTerms);
      const canSendInvoices = hasAdminPermission("invoices:send-email");
      const canUpdateInvoicePayments = hasAdminPermission("invoices:payment-update");
      const canManageInvoices = hasAdminPermission("invoices:manage");
      const currentInvoice = invoice || {
        id: "",
        clientId: getInvoiceClients()[0] ? getInvoiceClients()[0].id : "",
        title: "",
        description: "",
        items: [{ name: "", quantity: 1, unitPrice: 0, total: 0 }],
        subtotal: 0,
        discount: 0,
        tax: 0,
        totalAmount: 0,
        paidAmount: 0,
        balance: 0,
        currency: settings.defaultCurrency || "LKR",
        status: "draft",
        invoiceType: "Custom",
        projectId: "",
        maintenancePlanId: "",
        leadId: "",
        salesExecutiveId: "",
        paymentMethod: "Other",
        paymentNotes: "",
        issueDate: defaultIssueDate,
        dueDate: defaultDueDate || null,
        notes: "",
        clientNotes: "",
        adminNotes: ""
      };
      const itemRows = Array.isArray(currentInvoice.items) && currentInvoice.items.length
        ? currentInvoice.items
        : [{ name: "", quantity: 1, unitPrice: 0, total: 0 }];
      const autoTaxEnabled = !invoice && toNumber(settings.defaultTaxRate) > 0;
      const autoDueDateEnabled = !invoice && Boolean(defaultDueDate);

      return `
        <form
          id="invoiceDrawerForm"
          data-mode="${escapeHtml(mode)}"
          data-currency="${escapeHtml(currentInvoice.currency || "LKR")}"
          data-paid-amount="${escapeHtml(currentInvoice.paidAmount || 0)}"
          data-default-tax-rate="${escapeHtml(settings.defaultTaxRate || 0)}"
          data-auto-tax="${autoTaxEnabled ? "true" : "false"}"
          data-default-payment-terms="${escapeHtml(settings.defaultPaymentTerms || 0)}"
          data-auto-due-date="${autoDueDateEnabled ? "true" : "false"}"
        >
          <input type="hidden" name="invoiceId" value="${escapeHtml(currentInvoice.id || "")}">

          <div class="drawer-grid">
            <div class="field">
              <label>Client</label>
              <select class="select" name="clientId">
                ${invoiceClientOptionsMarkup(currentInvoice.clientId || "")}
              </select>
            </div>
            <div class="field">
              <label>Status</label>
              <select class="select" name="status">
                ${statusOptions.map((status) => `
                  <option value="${status}" ${currentInvoice.status === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>Invoice type</label>
              <select class="select" name="invoiceType">
                ${selectOptionsMarkup(INVOICE_TYPE_OPTIONS, currentInvoice.invoiceType || "Custom")}
              </select>
            </div>
            <div class="field">
              <label>Payment method</label>
              <select class="select" name="paymentMethod">
                ${selectOptionsMarkup(INVOICE_PAYMENT_METHOD_OPTIONS, currentInvoice.paymentMethod || "Other")}
              </select>
            </div>
            <div class="field admin-grid-span-2">
              <label>Invoice title</label>
              <input class="input" name="title" value="${escapeHtml(currentInvoice.title || "")}" placeholder="Monthly service retainer">
            </div>
            <div class="field admin-grid-span-2">
              <label>Description</label>
              <textarea class="textarea" name="description">${escapeHtml(currentInvoice.description || "")}</textarea>
            </div>
            <div class="field">
              <label>Project link</label>
              <select class="select" name="projectId">${invoiceProjectOptionsMarkup(currentInvoice.projectId || "")}</select>
            </div>
            <div class="field">
              <label>Maintenance link</label>
              <select class="select" name="maintenancePlanId">${invoiceMaintenanceOptionsMarkup(currentInvoice.maintenancePlanId || "")}</select>
            </div>
            <div class="field">
              <label>Lead link</label>
              <select class="select" name="leadId">${invoiceLeadOptionsMarkup(currentInvoice.leadId || "")}</select>
            </div>
            <div class="field">
              <label>Sales executive</label>
              <select class="select" name="salesExecutiveId">${invoiceSalesExecutiveOptionsMarkup(currentInvoice.salesExecutiveId || "")}</select>
            </div>
            <div class="field">
              <label>Issue date</label>
              <input class="input" name="issueDate" type="date" value="${escapeHtml(toDateInputValue(currentInvoice.issueDate))}">
            </div>
            <div class="field">
              <label>Due date</label>
              <input class="input" name="dueDate" type="date" value="${escapeHtml(toDateInputValue(currentInvoice.dueDate))}">
            </div>
          </div>

          <div class="drawer-section">
            <div class="panel-header admin-mb-14">
              <div>
                <small class="kicker">Invoice Items</small>
                <h3>Line items and pricing</h3>
              </div>
              <div class="panel-actions">
                <button class="button button-secondary" type="button" data-add-invoice-item="true">Add Item</button>
              </div>
            </div>
            <div id="invoiceItemsList" class="preview-list">
              ${itemRows.map(invoiceItemEditorMarkup).join("")}
            </div>
          </div>

          <div class="drawer-section">
            <div class="drawer-grid">
              <div class="field">
                <label>Discount</label>
                <input class="input" name="discount" type="number" min="0" step="0.01" value="${escapeHtml(currentInvoice.discount || 0)}">
              </div>
              <div class="field">
                <label>Tax amount</label>
                <input class="input" name="tax" type="number" min="0" step="0.01" value="${escapeHtml(currentInvoice.tax || 0)}">
                <small class="subtle">Default tax rate: ${escapeHtml(toNumber(settings.defaultTaxRate).toFixed(2))}%</small>
              </div>
            </div>
            <div class="settings-grid admin-mt-16">
              <div class="settings-item">
                <span>Subtotal</span>
                <strong id="invoiceSubtotalValue">${escapeHtml(formatInvoiceCurrency(currentInvoice.subtotal || 0, currentInvoice.currency))}</strong>
              </div>
              <div class="settings-item">
                <span>Total</span>
                <strong id="invoiceTotalValue">${escapeHtml(formatInvoiceCurrency(currentInvoice.totalAmount || 0, currentInvoice.currency))}</strong>
              </div>
              <div class="settings-item">
                <span>Paid Amount</span>
                <strong id="invoicePaidValue">${escapeHtml(formatInvoiceCurrency(currentInvoice.paidAmount || 0, currentInvoice.currency))}</strong>
              </div>
              <div class="settings-item">
                <span>Balance</span>
                <strong id="invoiceBalanceValue">${escapeHtml(formatInvoiceCurrency(currentInvoice.balance || 0, currentInvoice.currency))}</strong>
              </div>
            </div>
          </div>

          <div class="drawer-section">
            <div class="field">
              <label>Client notes</label>
              <textarea class="textarea" name="notes">${escapeHtml(currentInvoice.clientNotes || currentInvoice.notes || "")}</textarea>
            </div>
            <div class="field admin-mt-14">
              <label>Payment notes</label>
              <textarea class="textarea" name="paymentNotes">${escapeHtml(currentInvoice.paymentNotes || "")}</textarea>
            </div>
            <div class="field admin-mt-14">
              <label>Admin notes</label>
              <textarea class="textarea" name="adminNotes">${escapeHtml(currentInvoice.adminNotes || "")}</textarea>
            </div>
            ${buildPaymentInstructionsText(settings)
              ? `
                  <div class="inline-note admin-mt-16">
                    ${escapeHtml(buildPaymentInstructionsText(settings)).replace(/\n/g, "<br>")}
                  </div>
                `
              : ""}
          </div>

          <div class="drawer-actions">
            ${mode === "edit"
              ? `
                  <button class="button button-secondary" type="button" data-invoice-id="${escapeHtml(currentInvoice.id)}" data-invoice-action="download-pdf">Download PDF</button>
                  ${canSendInvoices ? `<button class="button button-secondary" type="button" data-invoice-id="${escapeHtml(currentInvoice.id)}" data-invoice-action="send-email">Email Client</button>` : ""}
                `
              : ""}
            ${mode === "create"
              ? `
                  <button class="button button-secondary" type="submit" data-submit-invoice-status="draft">Save Draft</button>
                  <button class="button button-primary" type="submit" data-submit-invoice-status="sent">Save & Send</button>
                `
              : `
                  ${canUpdateInvoicePayments && currentInvoice.status !== "cancelled" && toNumber(currentInvoice.balance) > 0
                    ? `<button class="button button-secondary" type="button" data-invoice-id="${escapeHtml(currentInvoice.id)}" data-invoice-action="add-payment">Add Payment</button>`
                    : ""}
                  ${canUpdateInvoicePayments && currentInvoice.status !== "cancelled" && toNumber(currentInvoice.balance) > 0
                    ? `<button class="button button-secondary" type="button" data-invoice-id="${escapeHtml(currentInvoice.id)}" data-invoice-action="mark-paid">Mark Paid</button>`
                    : ""}
                  ${canManageInvoices && currentInvoice.status !== "cancelled"
                    ? `<button class="button button-danger" type="button" data-invoice-id="${escapeHtml(currentInvoice.id)}" data-invoice-action="cancel">Cancel Invoice</button>`
                    : ""}
                  <button class="button button-primary" type="submit">Save Invoice</button>
                `}
          </div>
        </form>
      `;
    }

    function invoicePaymentSection(invoice) {
      return `
        <form id="invoicePaymentForm" data-currency="${escapeHtml(invoice.currency || "LKR")}">
          <input type="hidden" name="invoiceId" value="${escapeHtml(invoice.id)}">

          <div class="chip-row">
            <span class="data-chip"><strong>${renderTextValue(invoice.invoiceNumber || "—", "text-ellipsis text-invoice text-mono")}</strong>Invoice Number</span>
            <span class="data-chip"><strong>${renderTextValue(formatInvoiceCurrency(invoice.totalAmount, invoice.currency), "text-ellipsis text-currency text-mono")}</strong>Total</span>
            <span class="data-chip"><strong>${renderTextValue(formatInvoiceCurrency(invoice.balance, invoice.currency), "text-ellipsis text-currency text-mono")}</strong>Balance</span>
          </div>

        <div class="drawer-grid admin-mt-18">
            <div class="field">
              <label>Payment amount</label>
              <input class="input" name="amount" type="number" min="0" max="${escapeHtml(invoice.balance)}" step="0.01" value="${escapeHtml(invoice.balance)}">
            </div>
            <div class="field">
              <label>Paid date</label>
              <input class="input" name="paidDate" type="date" value="${escapeHtml(toDateInputValue(new Date()))}">
            </div>
            <div class="field">
              <label>Payment method</label>
              <select class="select" name="paymentMethod">
                ${selectOptionsMarkup(INVOICE_PAYMENT_METHOD_OPTIONS, invoice.paymentMethod || "Other")}
              </select>
            </div>
            <div class="field">
              <label>Payment status</label>
              <input class="input" value="${escapeHtml(invoice.paymentStatus || formatStatusLabel(invoice.status))}" disabled>
            </div>
          </div>

          <div class="field admin-mt-16">
            <label>Payment notes</label>
            <textarea class="textarea" name="paymentNotes">${escapeHtml(invoice.paymentNotes || "")}</textarea>
          </div>

          <div class="field admin-mt-16">
            <label>Admin notes</label>
            <textarea class="textarea" name="adminNotes">${escapeHtml(invoice.adminNotes || "")}</textarea>
          </div>

          <div class="drawer-actions">
            <button class="button button-primary" type="submit">Record Payment</button>
          </div>
        </form>
      `;
    }

    function collectInvoiceItems(invoiceForm) {
      return Array.from(invoiceForm.querySelectorAll("[data-invoice-item-row]")).map((row) => ({
        name: row.querySelector('[name="itemName"]').value.trim(),
        quantity: toNumber(row.querySelector('[name="itemQuantity"]').value),
        unitPrice: toNumber(row.querySelector('[name="itemUnitPrice"]').value),
        total: toNumber(row.querySelector('[data-invoice-item-total]').textContent.replace(/[^0-9.-]/g, ""))
      }));
    }

    function syncInvoiceComposerForm() {
      const invoiceForm = document.getElementById("invoiceDrawerForm");
      if (!invoiceForm) {
        return;
      }

      const currency = invoiceForm.dataset.currency || "LKR";
      const paidAmount = toNumber(invoiceForm.dataset.paidAmount);
      let subtotal = 0;

      Array.from(invoiceForm.querySelectorAll("[data-invoice-item-row]")).forEach((row) => {
        const quantity = toNumber(row.querySelector('[name="itemQuantity"]').value);
        const unitPrice = toNumber(row.querySelector('[name="itemUnitPrice"]').value);
        const name = row.querySelector('[name="itemName"]').value.trim();
        const total = Math.max(0, quantity * unitPrice);

        row.querySelector("[data-invoice-item-total]").textContent = formatInvoiceCurrency(total, currency);
        if (name && quantity > 0) {
          subtotal += total;
        }
      });

      const discountField = invoiceForm.querySelector('[name="discount"]');
      const taxField = invoiceForm.querySelector('[name="tax"]');
      const issueDateField = invoiceForm.querySelector('[name="issueDate"]');
      const dueDateField = invoiceForm.querySelector('[name="dueDate"]');
      const discount = Math.min(subtotal, Math.max(0, toNumber(discountField.value)));
      const defaultTaxRate = Math.max(0, toNumber(invoiceForm.dataset.defaultTaxRate));

      if (invoiceForm.dataset.autoTax === "true") {
        taxField.value = Math.max(0, (subtotal - discount) * (defaultTaxRate / 100)).toFixed(2);
      }

      if (invoiceForm.dataset.autoDueDate === "true" && dueDateField && issueDateField) {
        dueDateField.value = calculateDueDateInputValue(issueDateField.value, invoiceForm.dataset.defaultPaymentTerms);
      }

      const tax = Math.max(0, toNumber(taxField.value));
      const totalAmount = Math.max(0, subtotal - discount + tax);
      const balance = Math.max(0, totalAmount - paidAmount);

      document.getElementById("invoiceSubtotalValue").textContent = formatInvoiceCurrency(subtotal, currency);
      document.getElementById("invoiceTotalValue").textContent = formatInvoiceCurrency(totalAmount, currency);
      document.getElementById("invoicePaidValue").textContent = formatInvoiceCurrency(paidAmount, currency);
      document.getElementById("invoiceBalanceValue").textContent = formatInvoiceCurrency(balance, currency);
    }

    function openCreateInvoiceDrawer() {
      if (!getInvoiceClients().length) {
        showBanner("Create at least one client account before issuing invoices.", "warning");
        return;
      }

      openDrawer({
        eyebrow: "New Invoice",
        title: "Create Invoice",
        subtitle: "Select a client, add line items, and save the invoice as a draft or sent record.",
        body: invoiceFormSection(null, { mode: "create" })
      });
    }

    async function openInvoiceDrawer(invoiceId, mode = "view") {
      const payload = await apiFetch(`/api/admin/invoices/${invoiceId}`);
      const invoice = payload.invoice;

      openDrawer({
        eyebrow: mode === "view" ? "Invoice Record" : "Edit Invoice",
        title: invoice.invoiceNumber,
        subtitle: mode === "view"
          ? "Review invoice totals, notes, and current collection status."
          : "Update line items, due dates, notes, and invoice status safely.",
        body: mode === "view"
          ? invoiceReadonlySection(invoice)
          : invoiceFormSection(invoice, { mode: "edit" })
      });
    }

    async function openInvoicePaymentDrawer(invoiceId) {
      const payload = await apiFetch(`/api/admin/invoices/${invoiceId}`);
      const invoice = payload.invoice;

      openDrawer({
        eyebrow: "Record Payment",
        title: invoice.invoiceNumber,
        subtitle: "Add a manual payment to this invoice and update the outstanding balance.",
        body: invoicePaymentSection(invoice)
      });
    }

    async function handleInvoiceAction(invoiceId, action) {
      if (action === "view") {
        await openInvoiceDrawer(invoiceId, "view");
        return;
      }

      if (action === "edit") {
        await openInvoiceDrawer(invoiceId, "edit");
        return;
      }

      if (action === "add-payment") {
        await openInvoicePaymentDrawer(invoiceId);
        return;
      }

      if (action === "download-pdf") {
        await downloadAdminFile(`/api/admin/invoices/${invoiceId}/pdf`, `automatex-invoice-${invoiceId}.pdf`);
        showToast("Invoice PDF downloaded", "The invoice PDF is ready for review or manual sharing.");
        return;
      }

      if (action === "send-email") {
        if (!window.confirm("Email this invoice to the client?")) {
          return;
        }

        const payload = await apiFetch(`/api/admin/invoices/${invoiceId}/send-email`, {
          method: "POST",
          body: JSON.stringify({})
        });
        await refreshAllData();
        showToast("Invoice email updated", payload.message || "The invoice email action completed.");
        return;
      }

      if (action === "mark-paid") {
        if (!window.confirm("Mark this invoice as fully paid?")) {
          return;
        }

        await apiFetch(`/api/admin/invoices/${invoiceId}/mark-paid`, {
          method: "PATCH",
          body: JSON.stringify({})
        });
        await refreshAllData();
        closeDrawer();
        showToast("Invoice paid", "The invoice was marked as paid and its balance was cleared.");
        return;
      }

      if (action === "cancel") {
        if (!window.confirm("Cancel this invoice? The record will remain in history with cancelled status.")) {
          return;
        }

        await apiFetch(`/api/admin/invoices/${invoiceId}`, {
          method: "DELETE",
          body: JSON.stringify({})
        });
        await refreshAllData();
        closeDrawer();
        showToast("Invoice cancelled", "The invoice remains stored, but it is now marked as cancelled.");
      }
    }

    function requestDetailSection(request) {
      return `
        <form id="requestDrawerForm">
          <input type="hidden" name="requestId" value="${escapeHtml(request.id)}">

          <div class="chip-row">
            <span class="data-chip"><strong>${renderTextValue(formatRequestTypeLabel(request.type), "text-ellipsis")}</strong>Request Type</span>
            <span class="data-chip"><strong>${renderTextValue(formatStatusLabel(request.priority), "text-ellipsis text-status")}</strong>Priority</span>
            <span class="data-chip"><strong>${renderTextValue(formatStatusLabel(request.status), "text-ellipsis text-status")}</strong>Status</span>
            <span class="data-chip"><strong>${renderTextValue(formatShortDate(request.createdAt), "text-ellipsis text-date text-mono", { titleValue: formatDate(request.createdAt) })}</strong>Created</span>
          </div>

          <div class="settings-grid admin-mt-18">
            <div class="settings-item">
              <span>Business</span>
              <strong>${renderTextValue(request.businessName || "—", "text-ellipsis text-business")}</strong>
            </div>
            <div class="settings-item">
              <span>Client</span>
              <strong>${renderTextValue(request.clientName || "—", "text-ellipsis text-person")}</strong>
            </div>
            <div class="settings-item">
              <span>Email</span>
              <strong>${renderTextValue(request.clientEmail || "—", "text-ellipsis text-email text-mono")}</strong>
            </div>
            <div class="settings-item">
              <span>Requested Package</span>
              <strong>${renderTextValue(formatRequestedPackageLabel(request.requestedPackage), "text-ellipsis text-package")}</strong>
            </div>
          </div>

          <div class="drawer-section">
            <div class="field">
              <label>Subject</label>
              <input class="input" value="${escapeHtml(request.subject || "")}" disabled>
            </div>
            <div class="field admin-mt-14">
              <label>Client message</label>
              <textarea class="textarea" disabled>${escapeHtml(request.message || "")}</textarea>
            </div>
          </div>

          <div class="drawer-section">
            <div class="drawer-grid">
              <div class="field">
                <label>Status</label>
                <select class="select" name="status">
                  ${REQUEST_STATUS_OPTIONS.map((status) => `
                    <option value="${status}" ${request.status === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>
                  `).join("")}
                </select>
              </div>
              <div class="field">
                <label>Priority</label>
                <select class="select" name="priority">
                  ${REQUEST_PRIORITY_OPTIONS.map((priority) => `
                    <option value="${priority}" ${request.priority === priority ? "selected" : ""}>${escapeHtml(formatStatusLabel(priority))}</option>
                  `).join("")}
                </select>
              </div>
            </div>

            <div class="field admin-mt-14">
              <label>Admin note</label>
              <textarea class="textarea" name="adminNote">${escapeHtml(request.adminNote || "")}</textarea>
            </div>
          </div>

          <div class="drawer-actions">
            ${!["resolved", "rejected", "closed"].includes(request.status)
              ? `<button class="button button-secondary" id="requestResolveButton" type="button">Mark as completed</button>`
              : ""}
            ${!["rejected", "closed"].includes(request.status)
              ? `<button class="button button-danger" id="requestRejectButton" type="button">Reject Request</button>`
              : ""}
            ${request.status !== "closed"
              ? `<button class="button button-secondary" id="requestCloseButton" type="button">Close Request</button>`
              : ""}
            <button class="button button-primary" type="submit">Save Request</button>
          </div>
        </form>
      `;
    }

    async function openRequestDrawer(requestId) {
      const payload = await apiFetch(`/api/admin/requests/${requestId}`);
      const request = payload.request;

      openDrawer({
        eyebrow: "Support Request",
        title: request.subject || formatRequestTypeLabel(request.type),
        subtitle: "Review the client request, update workflow status, and keep internal admin notes attached to the record.",
        body: requestDetailSection(request)
      });
    }

    async function handleRequestAction(requestId, action) {
      if (action === "manage" || action === "view") {
        await openRequestDrawer(requestId);
        return;
      }

      if (action === "resolve") {
        await apiFetch(`/api/admin/requests/${requestId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "resolved" })
        });
        await refreshAllData();
        closeDrawer();
        showToast("Request resolved", "The client request has been marked as resolved.");
        return;
      }

      if (action === "reject") {
        await apiFetch(`/api/admin/requests/${requestId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "rejected" })
        });
        await refreshAllData();
        closeDrawer();
        showToast("Request rejected", "The request has been marked as rejected.");
        return;
      }

      if (action === "close") {
        await apiFetch(`/api/admin/requests/${requestId}`, {
          method: "DELETE",
          body: JSON.stringify({})
        });
        await refreshAllData();
        closeDrawer();
        showToast("Request closed", "The request remains on record and is now marked as closed.");
      }
    }

    function selectOptionsMarkup(options, selectedValue, labelMap = {}) {
      return options.map((option) => `
        <option value="${escapeHtml(option)}" ${selectedValue === option ? "selected" : ""}>${escapeHtml(labelMap[option] || option)}</option>
      `).join("");
    }

    function projectClientOptionsMarkup(selectedClientId = "") {
      const clients = getInvoiceClients();

      if (!clients.length) {
        return `<option value="">No clients added yet</option>`;
      }

      return clients.map((client) => `
        <option value="${escapeHtml(client.id)}" ${selectedClientId === client.id ? "selected" : ""}>
          ${escapeHtml(client.businessName || client.name)} • ${escapeHtml(client.email)}
        </option>
      `).join("");
    }

    function encodeMilestoneLines(items = []) {
      return (items || []).map((item) => [
        item.title || "",
        item.status || "Pending",
        toDateInputValue(item.dueDate),
        toDateInputValue(item.completedDate),
        item.description || ""
      ].map((part) => String(part || "").replace(/\|/g, "/")).join(" | ")).join("\n");
    }

    function encodeDeliverableLines(items = []) {
      return (items || []).map((item) => [
        item.title || "",
        item.status || "Pending",
        toDateInputValue(item.deliveredDate),
        item.description || ""
      ].map((part) => String(part || "").replace(/\|/g, "/")).join(" | ")).join("\n");
    }

    function parseMilestoneLines(value) {
      return String(value || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [title, status, dueDate, completedDate, ...descriptionParts] = line.split("|").map((part) => part.trim());
          return {
            title,
            status: MILESTONE_STATUS_OPTIONS.includes(status) ? status : "Pending",
            dueDate: dueDate || null,
            completedDate: completedDate || null,
            description: descriptionParts.join(" | ")
          };
        })
        .filter((item) => item.title);
    }

    function parseDeliverableLines(value) {
      return String(value || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [title, status, deliveredDate, ...descriptionParts] = line.split("|").map((part) => part.trim());
          return {
            title,
            status: DELIVERABLE_STATUS_OPTIONS.includes(status) ? status : "Pending",
            deliveredDate: deliveredDate || null,
            description: descriptionParts.join(" | ")
          };
        })
        .filter((item) => item.title);
    }

    function encodeIncludedServiceLines(items = []) {
      return (items || []).map((item) => [
        item.serviceName || "",
        item.description || ""
      ].map((part) => String(part || "").replace(/\|/g, "/")).join(" | ")).join("\n");
    }

    function parseIncludedServiceLines(value) {
      return String(value || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [serviceName, ...descriptionParts] = line.split("|").map((part) => part.trim());
          return {
            serviceName,
            description: descriptionParts.join(" | ")
          };
        })
        .filter((item) => item.serviceName);
    }

    function projectOptionsMarkup(selectedProjectId = "", includeBlank = true) {
      if (!state.allProjects.length) {
        return `<option value="">No projects added yet</option>`;
      }

      const options = state.allProjects.map((project) => `
        <option value="${escapeHtml(project.id)}" ${selectedProjectId === project.id ? "selected" : ""}>
          ${escapeHtml(project.projectTitle || "Project")} • ${escapeHtml(project.clientBusinessName || project.clientName || "Client")}
        </option>
      `).join("");

      return `${includeBlank ? `<option value="">Not linked</option>` : ""}${options}`;
    }

    function renderProjectFilesDrawer(files = []) {
      if (!files.length) {
        return `<div class="empty-state">No project files have been added yet.</div>`;
      }

      const canManageFiles = hasAdminPermission("files:manage");

      return `
        <div class="stack-list">
          ${files.map((file) => `
            <article class="summary-card">
              <div>
                <div class="cell-title">${renderTextValue(file.title || file.fileName || "Project file", "text-ellipsis")}</div>
                <div class="cell-subtitle">${escapeHtml(file.fileType || "Other")} • ${escapeHtml(file.visibility || "Admin Only")} • ${escapeHtml(formatShortDate(file.createdAt))} • ${escapeHtml(formatFileSize(file.fileSize))}</div>
              </div>
              <div class="table-actions">
                <button class="mini-button" type="button" data-file-id="${escapeHtml(file.id)}" data-file-action="download" data-file-name="${escapeHtml(file.fileName || "project-file")}">Download</button>
                ${canManageFiles
                  ? `
                      <button class="mini-button" type="button" data-file-id="${escapeHtml(file.id)}" data-file-action="visibility" data-visibility="${escapeHtml(file.visibility === "Client Visible" ? "Admin Only" : "Client Visible")}">${file.visibility === "Client Visible" ? "Admin Only" : "Client Visible"}</button>
                      <button class="mini-button is-warning" type="button" data-file-id="${escapeHtml(file.id)}" data-file-action="archive">Hide from active list</button>
                    `
                  : ""}
              </div>
            </article>
          `).join("")}
        </div>
      `;
    }

    function renderProjectMaintenanceDrawer(plans = []) {
      if (!plans.length) {
        return `<div class="empty-state">No maintenance plan is connected to this project yet.</div>`;
      }

      return `
        <div class="stack-list">
          ${plans.map((plan) => `
            <article class="summary-card">
              <div>
                <div class="cell-title">${renderTextValue(plan.planName || "Maintenance", "text-ellipsis")}</div>
                <div class="cell-subtitle">${escapeHtml(plan.planType || "Monthly")} • ${escapeHtml(plan.status || "Pending")} • Renewal ${escapeHtml(formatShortDate(plan.renewalDate))} • ${escapeHtml(formatInvoiceCurrency(plan.balanceAmount || 0))} balance</div>
              </div>
              <div class="table-actions">
                <button class="mini-button" type="button" data-maintenance-id="${escapeHtml(plan.id)}">Edit</button>
                <button class="mini-button" type="button" data-maintenance-id="${escapeHtml(plan.id)}" data-maintenance-action="renew">Renew</button>
                <button class="mini-button is-warning" type="button" data-maintenance-id="${escapeHtml(plan.id)}" data-maintenance-action="expire">Expire</button>
              </div>
            </article>
          `).join("")}
        </div>
      `;
    }

    function projectFileSection(project = {}) {
      if (!project.id) {
        return "";
      }

      return `
        <section class="drawer-section">
          <div class="section-heading">
            <div>
              <small class="kicker">Documents</small>
              <h3>Project Files</h3>
            </div>
          </div>

          ${renderProjectFilesDrawer(project.projectFiles || [])}

          <form id="projectFileForm" data-project-id="${escapeHtml(project.id)}">
            <div class="form-grid">
              <label>
                <span>Title</span>
                <input class="input" name="title" placeholder="Signed agreement">
              </label>
              <label>
                <span>File type</span>
                <select class="select" name="fileType">
                  ${selectOptionsMarkup(PROJECT_FILE_TYPE_OPTIONS, "Other")}
                </select>
              </label>
              <label>
                <span>Visibility</span>
                <select class="select" name="visibility">
                  ${selectOptionsMarkup(PROJECT_FILE_VISIBILITY_OPTIONS, "Admin Only")}
                </select>
              </label>
              <label>
                <span>Upload file</span>
                <input class="input" name="uploadFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp,.zip">
              </label>
            </div>
            <label>
              <span>Or file link</span>
              <input class="input" name="fileUrl" placeholder="https://example.com/client-document.pdf">
            </label>
            <label>
              <span>Description</span>
              <textarea class="textarea" name="description"></textarea>
            </label>
            <div class="form-actions">
              <button class="button button-primary" type="submit">Add File</button>
            </div>
          </form>
        </section>
      `;
    }

    function projectMaintenanceSection(project = {}) {
      if (!project.id) {
        return "";
      }

      return `
        <section class="drawer-section">
          <div class="section-heading">
            <div>
              <small class="kicker">Maintenance</small>
              <h3>Maintenance Status</h3>
            </div>
            <button class="mini-button" type="button" data-maintenance-create-project-id="${escapeHtml(project.id)}">Add Plan</button>
          </div>
          ${renderProjectMaintenanceDrawer(project.maintenancePlans || [])}
        </section>
      `;
    }

    function maintenanceDetailSection(plan = {}) {
      const isCreate = !plan.id;
      const selectedProjectId = plan.projectId || (state.allProjects[0] ? state.allProjects[0].id : "");

      return `
        <form id="maintenanceDrawerForm" data-mode="${isCreate ? "create" : "edit"}">
          <input type="hidden" name="maintenancePlanId" value="${escapeHtml(plan.id || "")}">
          <div class="form-grid">
            <label>
              <span>Project</span>
              <select class="select" name="projectId">
                ${projectOptionsMarkup(selectedProjectId, false)}
              </select>
            </label>
            <label>
              <span>Plan name</span>
              <input class="input" name="planName" value="${escapeHtml(plan.planName || "")}" placeholder="Website care plan">
            </label>
            <label>
              <span>Plan type</span>
              <select class="select" name="planType">
                ${selectOptionsMarkup(MAINTENANCE_PLAN_TYPE_OPTIONS, plan.planType || "Monthly")}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select class="select" name="status">
                ${selectOptionsMarkup(MAINTENANCE_STATUS_OPTIONS, plan.status || "Pending")}
              </select>
            </label>
            <label>
              <span>Start date</span>
              <input class="input" name="startDate" type="date" value="${escapeHtml(toDateInputValue(plan.startDate || new Date()))}">
            </label>
            <label>
              <span>End date</span>
              <input class="input" name="endDate" type="date" value="${escapeHtml(toDateInputValue(plan.endDate))}">
            </label>
            <label>
              <span>Renewal date</span>
              <input class="input" name="renewalDate" type="date" value="${escapeHtml(toDateInputValue(plan.renewalDate))}">
            </label>
            <label>
              <span>Amount</span>
              <input class="input" name="amount" type="number" min="0" step="0.01" value="${escapeHtml(plan.amount || 0)}">
            </label>
            <label>
              <span>Paid amount</span>
              <input class="input" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(plan.paidAmount || 0)}">
            </label>
            <label>
              <span>Payment status</span>
              <select class="select" name="paymentStatus">
                ${selectOptionsMarkup(MAINTENANCE_PAYMENT_STATUS_OPTIONS, plan.paymentStatus || "Pending")}
              </select>
            </label>
          </div>
          <div class="inline-note">
            Included services format: service name | description.
          </div>
          <textarea class="textarea" name="includedServices" placeholder="Monthly backup | Backup verification and restore point">${escapeHtml(encodeIncludedServiceLines(plan.includedServices))}</textarea>
          <label>
            <span>Client-visible notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(plan.notes || "")}</textarea>
          </label>
          <label>
            <span>Private admin notes</span>
            <textarea class="textarea" name="adminNotes">${escapeHtml(plan.adminNotes || "")}</textarea>
          </label>
          <div class="form-actions">
            <button class="button button-primary" type="submit">${isCreate ? "Create Plan" : "Save Plan"}</button>
          </div>
        </form>
      `;
    }

    function salesExecutiveOptionsMarkup(selectedExecutiveId = "", includeBlank = true) {
      const options = state.allSalesExecutives.map((executive) => `
        <option value="${escapeHtml(executive.id)}" ${selectedExecutiveId === executive.id ? "selected" : ""}>${escapeHtml(executive.fullName || "Employee")}</option>
      `).join("");

      return `${includeBlank ? `<option value="">Unassigned</option>` : ""}${options || `<option value="">No employees added yet</option>`}`;
    }

    function clientOptionsMarkup(selectedClientId = "", includeBlank = true) {
      const options = getInvoiceClients().map((client) => `
        <option value="${escapeHtml(client.id)}" ${selectedClientId === client.id ? "selected" : ""}>${escapeHtml(client.businessName || client.name)} • ${escapeHtml(client.email)}</option>
      `).join("");

      return `${includeBlank ? `<option value="">Not linked</option>` : ""}${options || `<option value="">No clients added yet</option>`}`;
    }

    function leadOptionsMarkup(selectedLeadId = "", includeBlank = true) {
      const options = state.allLeads.map((lead) => `
        <option value="${escapeHtml(lead.id)}" ${selectedLeadId === lead.id ? "selected" : ""}>${escapeHtml(lead.businessName || lead.contactPerson || "Lead")}</option>
      `).join("");

      return `${includeBlank ? `<option value="">No lead link</option>` : ""}${options || `<option value="">No leads available</option>`}`;
    }

    function invoiceOptionsMarkup(selectedInvoiceId = "", includeBlank = true) {
      const options = state.allInvoices.map((invoice) => `
        <option value="${escapeHtml(invoice.id)}" ${selectedInvoiceId === invoice.id ? "selected" : ""}>${escapeHtml(invoice.invoiceNumber || invoice.title || "Invoice")} • ${escapeHtml(invoice.clientBusinessName || invoice.businessName || "")}</option>
      `).join("");

      return `${includeBlank ? `<option value="">No invoice link</option>` : ""}${options || `<option value="">No invoices found</option>`}`;
    }

    function valueOrDefault(value, fallback = "") {
      return value === null || typeof value === "undefined" ? fallback : value;
    }

    function salesExecutiveDetailSection(executive = {}) {
      const isCreate = !executive.id;
      const rules = executive.commissionRules || {};
      const bank = executive.bankDetails || {};
      const joinedDateValue = toDateInputValue(valueOrDefault(executive.joinedDate, isCreate ? new Date() : null));
      const loginHelperText = isCreate
        ? "Employee login is enabled when an email and password are saved. Setting status to Inactive or Suspended disables login."
        : "Leave blank to keep current login password. Enter a new password only if you want to reset it.";

      return `
        <form id="salesExecutiveDrawerForm" data-mode="${isCreate ? "create" : "edit"}">
          <input type="hidden" name="salesExecutiveId" value="${escapeHtml(executive.id || "")}">
          <div class="form-grid">
            <label>
              <span>Full name</span>
              <input class="input" name="fullName" value="${escapeHtml(executive.fullName || "")}" placeholder="Employee name">
            </label>
            <label>
              <span>Phone</span>
              <input class="input" name="phone" value="${escapeHtml(executive.phone || "")}" placeholder="+94...">
            </label>
            <label>
              <span>Email</span>
              <input class="input" name="email" type="email" value="${escapeHtml(executive.email || "")}" placeholder="name@example.com">
            </label>
            <label>
              <span>${isCreate ? "Login password" : "New login password"}</span>
              <input class="input" name="password" type="password" autocomplete="new-password" placeholder="${isCreate ? "Minimum 8 characters" : "Leave blank to keep current password"}">
              <small class="field-helper login-helper-note">${escapeHtml(loginHelperText)}</small>
            </label>
            <label>
              <span>NIC number</span>
              <input class="input" name="nicNumber" value="${escapeHtml(executive.nicNumber || "")}">
            </label>
            <label>
              <span>Status</span>
              <select class="select" name="status">${selectOptionsMarkup(SALES_EXECUTIVE_STATUS_OPTIONS, executive.status || "Active")}</select>
            </label>
            <label>
              <span>Work type</span>
              <select class="select" name="workType">${selectOptionsMarkup(SALES_EXECUTIVE_WORK_TYPE_OPTIONS, executive.workType || "Part Time")}</select>
            </label>
            <label>
              <span>Joined date</span>
              <input class="input" name="joinedDate" type="date" value="${escapeHtml(joinedDateValue)}">
            </label>
            <label>
              <span>Payment method</span>
              <select class="select" name="paymentMethod">${selectOptionsMarkup(SALES_EXECUTIVE_PAYMENT_METHOD_OPTIONS, executive.paymentMethod || "Cash")}</select>
            </label>
          </div>
          <label>
            <span>Address</span>
            <textarea class="textarea" name="address">${escapeHtml(executive.address || "")}</textarea>
          </label>
          <div class="form-grid">
            <label>
              <span>Base target clients/month</span>
              <input class="input" name="baseTargetClientsPerMonth" type="number" min="0" step="1" value="${escapeHtml(valueOrDefault(rules.baseTargetClientsPerMonth, 3))}">
            </label>
            <label>
              <span>Base commission</span>
              <input class="input" name="baseCommissionAmount" type="number" min="0" step="0.01" value="${escapeHtml(valueOrDefault(rules.baseCommissionAmount, 15000))}">
            </label>
            <label>
              <span>Extra client commission</span>
              <input class="input" name="extraClientCommission" type="number" min="0" step="0.01" value="${escapeHtml(valueOrDefault(rules.extraClientCommission, 6000))}">
            </label>
            <label>
              <span>Commission type</span>
              <select class="select" name="commissionRuleType">${selectOptionsMarkup(SALES_COMMISSION_RULE_TYPE_OPTIONS, rules.commissionType || "Fixed Target")}</select>
            </label>
            <label>
              <span>Percentage rate</span>
              <input class="input" name="percentageRate" type="number" min="0" max="100" step="0.01" value="${escapeHtml(valueOrDefault(rules.percentageRate, 0))}">
            </label>
          </div>
          <div class="form-grid">
            <label>
              <span>Bank name</span>
              <input class="input" name="bankName" value="${escapeHtml(bank.bankName || "")}">
            </label>
            <label>
              <span>Account holder</span>
              <input class="input" name="accountHolderName" value="${escapeHtml(bank.accountHolderName || "")}">
            </label>
            <label>
              <span>Account number</span>
              <input class="input" name="accountNumber" value="${escapeHtml(bank.accountNumber || "")}">
            </label>
            <label>
              <span>Branch</span>
              <input class="input" name="branch" value="${escapeHtml(bank.branch || "")}">
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(executive.notes || "")}</textarea>
          </label>
          <div class="form-actions">
            <button class="button button-primary" type="submit">${isCreate ? "Create Employee" : "Save Employee"}</button>
            ${isCreate || !hasAdminPermission("sales:manage") ? "" : `<button class="button button-danger" id="archiveSalesExecutiveButton" type="button">Hide from active list</button>`}
          </div>
        </form>
      `;
    }

    function leadDetailSection(lead = {}) {
      const isCreate = !lead.id;

      return `
        <form id="leadDrawerForm" data-mode="${isCreate ? "create" : "edit"}">
          <input type="hidden" name="leadId" value="${escapeHtml(lead.id || "")}">
          <div class="form-grid">
            <label>
              <span>Employee</span>
              <select class="select" name="salesExecutiveId">${salesExecutiveOptionsMarkup(lead.salesExecutiveId || "")}</select>
            </label>
            <label>
              <span>Business name</span>
              <input class="input" name="businessName" value="${escapeHtml(lead.businessName || "")}">
            </label>
            <label>
              <span>Contact person</span>
              <input class="input" name="contactPerson" value="${escapeHtml(lead.contactPerson || "")}">
            </label>
            <label>
              <span>Phone</span>
              <input class="input" name="phone" value="${escapeHtml(lead.phone || "")}">
            </label>
            <label>
              <span>Email</span>
              <input class="input" name="email" type="email" value="${escapeHtml(lead.email || "")}">
            </label>
            <label>
              <span>Business type</span>
              <input class="input" name="businessType" value="${escapeHtml(lead.businessType || "")}">
            </label>
            <label>
              <span>Location</span>
              <input class="input" name="location" value="${escapeHtml(lead.location || "")}">
            </label>
            <label>
              <span>Interested service</span>
              <select class="select" name="interestedService">${selectOptionsMarkup(LEAD_INTERESTED_SERVICE_OPTIONS, lead.interestedService || "Other")}</select>
            </label>
            <label>
              <span>Lead source</span>
              <select class="select" name="leadSource">${selectOptionsMarkup(LEAD_SOURCE_OPTIONS, lead.leadSource || "Sales Executive", { "Sales Executive": "Employee" })}</select>
            </label>
            <label>
              <span>Status</span>
              <select class="select" name="status">${selectOptionsMarkup(LEAD_STATUS_OPTIONS, lead.status || "New")}</select>
            </label>
            <label>
              <span>Priority</span>
              <select class="select" name="priority">${selectOptionsMarkup(LEAD_PRIORITY_OPTIONS, lead.priority || "Medium")}</select>
            </label>
            <label>
              <span>Estimated budget</span>
              <input class="input" name="estimatedBudget" type="number" min="0" step="0.01" value="${escapeHtml(lead.estimatedBudget || 0)}">
            </label>
            <label>
              <span>Approval status</span>
              <select class="select" name="approvalStatus">
                ${selectOptionsMarkup(["not_submitted", "pending", "approved", "rejected"], lead.approvalStatus || "not_submitted")}
              </select>
            </label>
            <label>
              <span>Amount received</span>
              <input class="input" name="amountReceived" type="number" min="0" step="0.01" value="${escapeHtml(lead.amountReceived || 0)}">
            </label>
            <label>
              <span>Package/service sold</span>
              <input class="input" name="packageSold" value="${escapeHtml(lead.packageSold || "")}">
            </label>
            <label>
              <span>Payment date</span>
              <input class="input" name="paymentDate" type="date" value="${escapeHtml(toDateInputValue(lead.paymentDate))}">
            </label>
            <label>
              <span>Follow-up date</span>
              <input class="input" name="followUpDate" type="date" value="${escapeHtml(toDateInputValue(lead.followUpDate))}">
            </label>
            <label>
              <span>Linked client</span>
              <select class="select" name="clientId">${clientOptionsMarkup(lead.clientId || "")}</select>
            </label>
            <label>
              <span>Converted project</span>
              <select class="select" name="convertedProjectId">${projectOptionsMarkup(lead.convertedProjectId || "")}</select>
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(lead.notes || "")}</textarea>
          </label>
          <label>
            <span>Rejection reason</span>
            <textarea class="textarea" name="rejectionReason">${escapeHtml(lead.rejectionReason || "")}</textarea>
          </label>
          <label>
            <span>Admin approval note</span>
            <textarea class="textarea" name="adminNote">${escapeHtml(lead.adminNote || "")}</textarea>
          </label>
          <div class="form-actions">
            <button class="button button-primary" type="submit">${isCreate ? "Create Lead" : "Save Lead"}</button>
            ${isCreate ? "" : `<button class="button button-secondary" id="convertLeadButton" type="button">Convert Lead</button>`}
            ${isCreate ? "" : `<button class="button button-secondary" id="approveLeadPaymentButton" type="button">Approve Payment</button>`}
            ${isCreate ? "" : `<button class="button button-danger" id="rejectLeadPaymentButton" type="button">Reject Payment</button>`}
          </div>
        </form>
      `;
    }

    function commissionDetailSection(commission = {}) {
      const isCreate = !commission.id;
      const now = new Date();

      return `
        <form id="commissionDrawerForm" data-mode="${isCreate ? "create" : "edit"}">
          <input type="hidden" name="commissionId" value="${escapeHtml(commission.id || "")}">
          <div class="form-grid">
            <label>
              <span>Employee</span>
              <select class="select" name="salesExecutiveId">${salesExecutiveOptionsMarkup(commission.salesExecutiveId || "", false)}</select>
            </label>
            <label>
              <span>Lead</span>
              <select class="select" name="leadId">${leadOptionsMarkup(commission.leadId || "")}</select>
            </label>
            <label>
              <span>Client</span>
              <select class="select" name="clientId">${clientOptionsMarkup(commission.clientId || "")}</select>
            </label>
            <label>
              <span>Project</span>
              <select class="select" name="projectId">${projectOptionsMarkup(commission.projectId || "")}</select>
            </label>
            <label>
              <span>Invoice</span>
              <select class="select" name="invoiceId">${invoiceOptionsMarkup(commission.invoiceId || "")}</select>
            </label>
            <label>
              <span>Payment reference</span>
              <input class="input" name="paymentReference" value="${escapeHtml(commission.paymentReference || "")}">
            </label>
            <label>
              <span>Month</span>
              <input class="input" name="commissionMonth" type="number" min="1" max="12" value="${escapeHtml(commission.commissionMonth || now.getMonth() + 1)}">
            </label>
            <label>
              <span>Year</span>
              <input class="input" name="commissionYear" type="number" min="2000" max="2100" value="${escapeHtml(commission.commissionYear || now.getFullYear())}">
            </label>
            <label>
              <span>Type</span>
              <select class="select" name="commissionType">${selectOptionsMarkup(COMMISSION_TYPE_OPTIONS, commission.commissionType || "Manual Bonus")}</select>
            </label>
            <label>
              <span>Amount</span>
              <input class="input" name="amount" type="number" min="0" step="0.01" value="${escapeHtml(commission.amount || 0)}">
            </label>
            <label>
              <span>Status</span>
              <select class="select" name="status">${selectOptionsMarkup(COMMISSION_STATUS_OPTIONS, commission.status || "Pending")}</select>
            </label>
            <label>
              <span>Paid date</span>
              <input class="input" name="paidDate" type="date" value="${escapeHtml(toDateInputValue(commission.paidDate))}">
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(commission.notes || "")}</textarea>
          </label>
          <div class="form-actions">
            <button class="button button-primary" type="submit">${isCreate ? "Create Commission" : "Save Commission"}</button>
          </div>
        </form>
      `;
    }

    function projectDetailSection(project = {}) {
      const isCreate = !project.id;
      const canManageProjects = hasAdminPermission("projects:manage");
      const selectedClientId = project.clientId || (getInvoiceClients()[0] ? getInvoiceClients()[0].id : "");

      return `
        <form id="projectDrawerForm" data-mode="${isCreate ? "create" : "edit"}">
          <input type="hidden" name="projectId" value="${escapeHtml(project.id || "")}">

          <div class="form-grid">
            <label>
              <span>Client</span>
              <select class="select" name="clientId" ${isCreate ? "" : ""}>
                ${projectClientOptionsMarkup(selectedClientId)}
              </select>
            </label>
            <label>
              <span>Project title</span>
              <input class="input" name="projectTitle" value="${escapeHtml(project.projectTitle || "")}" placeholder="Business website redesign">
            </label>
            <label>
              <span>Project type</span>
              <select class="select" name="projectType">
                ${selectOptionsMarkup(PROJECT_TYPE_OPTIONS, project.projectType || "Website")}
              </select>
            </label>
            <label>
              <span>Package name</span>
              <input class="input" name="packageName" value="${escapeHtml(project.packageName || "")}" placeholder="Standard Solution">
            </label>
            <label>
              <span>Status</span>
              <select class="select" name="status">
                ${selectOptionsMarkup(PROJECT_STATUS_OPTIONS, project.status || "Planning")}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select class="select" name="priority">
                ${selectOptionsMarkup(PROJECT_PRIORITY_OPTIONS, project.priority || "Medium")}
              </select>
            </label>
            <label>
              <span>Progress %</span>
              <input class="input" name="progressPercentage" type="number" min="0" max="100" step="1" value="${escapeHtml(project.progressPercentage || 0)}">
            </label>
            <label>
              <span>Total amount</span>
              <input class="input" name="totalAmount" type="number" min="0" step="0.01" value="${escapeHtml(project.totalAmount || 0)}">
            </label>
            <label>
              <span>Paid amount</span>
              <input class="input" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(project.paidAmount || 0)}">
            </label>
            <label>
              <span>Start date</span>
              <input class="input" name="startDate" type="date" value="${escapeHtml(toDateInputValue(project.startDate))}">
            </label>
            <label>
              <span>Expected deadline</span>
              <input class="input" name="expectedDeadline" type="date" value="${escapeHtml(toDateInputValue(project.expectedDeadline))}">
            </label>
            <label>
              <span>Completed date</span>
              <input class="input" name="completedDate" type="date" value="${escapeHtml(toDateInputValue(project.completedDate))}">
            </label>
          </div>

          <label>
            <span>Description</span>
            <textarea class="textarea" name="description">${escapeHtml(project.description || "")}</textarea>
          </label>
          <label>
            <span>Requirements</span>
            <textarea class="textarea" name="requirements">${escapeHtml(project.requirements || "")}</textarea>
          </label>
          <label>
            <span>Client-visible notes</span>
            <textarea class="textarea" name="clientNotes">${escapeHtml(project.clientNotes || "")}</textarea>
          </label>
          <label>
            <span>Private admin notes</span>
            <textarea class="textarea" name="adminNotes">${escapeHtml(project.adminNotes || "")}</textarea>
          </label>

          <div class="inline-note">
            Milestones format: title | status | due date YYYY-MM-DD | completed date YYYY-MM-DD | description. Supported statuses: ${escapeHtml(MILESTONE_STATUS_OPTIONS.join(", "))}.
          </div>
          <textarea class="textarea" name="milestones" placeholder="Design approval | Pending | 2026-07-15 | | Homepage design and brand direction">${escapeHtml(encodeMilestoneLines(project.milestones))}</textarea>

          <div class="inline-note">
            Deliverables format: title | status | delivered date YYYY-MM-DD | description. Supported statuses: ${escapeHtml(DELIVERABLE_STATUS_OPTIONS.join(", "))}.
          </div>
          <textarea class="textarea" name="deliverables" placeholder="Live website | Pending | | Production deployment and handover">${escapeHtml(encodeDeliverableLines(project.deliverables))}</textarea>

          <div class="form-actions">
            <button class="button button-primary" type="submit">${isCreate ? "Create Project" : canManageProjects ? "Save Project" : "Update Status"}</button>
            ${isCreate || !canManageProjects ? "" : `<button class="button button-danger" id="archiveProjectButton" type="button">Hide from active list</button>`}
          </div>
        </form>
        ${projectFileSection(project)}
        ${projectMaintenanceSection(project)}
      `;
    }

    function openCreateProjectDrawer() {
      if (!getInvoiceClients().length) {
        showBanner("Create or activate at least one client account before creating a project.", "warning");
        return;
      }

      openDrawer({
        eyebrow: "Project",
        title: "Create Project",
        subtitle: "Create a client-linked project with status, progress, milestones, deliverables, and payment summary.",
        body: projectDetailSection({
          projectType: "Website",
          status: "Planning",
          priority: "Medium",
          progressPercentage: 0,
          totalAmount: 0,
          paidAmount: 0,
          milestones: [],
          deliverables: []
        })
      });
    }

    async function openProjectDrawer(projectId) {
      const payload = await apiFetch(`/api/admin/projects/${projectId}`);
      const project = payload.project;

      openDrawer({
        eyebrow: "Project",
        title: project.projectTitle || "Project",
        subtitle: "Manage delivery status, payment progress, milestones, deliverables, and client-visible updates.",
        projectId: project.id,
        body: projectDetailSection(project)
      });
    }

    async function archiveProject(projectId) {
      await apiFetch(`/api/admin/projects/${projectId}`, {
        method: "DELETE",
        body: JSON.stringify({})
      });
      await refreshAllData();
      closeDrawer();
      showToast("Project hidden", "The project was hidden from active admin and client views.");
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Unable to read the selected file."));
        reader.readAsDataURL(file);
      });
    }

    async function openCreateMaintenanceDrawer(projectId = "") {
      if (!state.allProjects.length) {
        showBanner("Create a client-linked project before creating a maintenance plan.", "warning");
        return;
      }

      openDrawer({
        eyebrow: "Maintenance",
        title: "Create Maintenance Plan",
        subtitle: "Create a project-linked maintenance or renewal record with payment status and included services.",
        body: maintenanceDetailSection({
          projectId: projectId || state.allProjects[0].id,
          planType: "Monthly",
          status: "Pending",
          paymentStatus: "Pending",
          amount: 0,
          paidAmount: 0,
          includedServices: []
        })
      });
    }

    async function openMaintenanceDrawer(planId) {
      const payload = await apiFetch(`/api/admin/maintenance-plans/${planId}`);
      const plan = payload.maintenancePlan;

      openDrawer({
        eyebrow: "Maintenance",
        title: plan.planName || "Maintenance Plan",
        subtitle: "Update maintenance status, renewal timing, payment state, included services, and private admin notes.",
        body: maintenanceDetailSection(plan)
      });
    }

    async function updateMaintenanceAction(planId, action) {
      const endpointByAction = {
        renew: "renew",
        expire: "expire",
        cancel: "cancel"
      };
      const endpoint = endpointByAction[action];

      if (!endpoint) {
        await openMaintenanceDrawer(planId);
        return;
      }

      await apiFetch(`/api/admin/maintenance-plans/${planId}/${endpoint}`, {
        method: "PATCH",
        body: JSON.stringify({})
      });
      await refreshAllData();
      closeDrawer();
      showToast("Maintenance updated", "The maintenance plan status was updated successfully.");
    }

    async function handleProjectFileAction(button) {
      const fileId = button.dataset.fileId;
      const action = button.dataset.fileAction;

      if (action === "download") {
        await downloadAdminFile(`/api/admin/project-files/${fileId}/download`, button.dataset.fileName || "project-file");
        return;
      }

      if (action === "visibility") {
        await apiFetch(`/api/admin/project-files/${fileId}/visibility`, {
          method: "PATCH",
          body: JSON.stringify({ visibility: button.dataset.visibility })
        });
      } else if (action === "archive") {
        await apiFetch(`/api/admin/project-files/${fileId}`, {
          method: "DELETE",
          body: JSON.stringify({})
        });
      }

      await refreshAllData();
      if (state.drawer && state.drawer.projectId) {
        await openProjectDrawer(state.drawer.projectId);
      }
      showToast("Project file updated", "Project document visibility was updated.");
    }

    function salesExecutiveSummarySection(summary = {}) {
      const executive = summary.salesExecutive || {};

      return `
        <div class="chip-row">
          <span class="data-chip"><strong>${escapeHtml(summary.totalLeads || 0)}</strong>Total Leads</span>
          <span class="data-chip"><strong>${escapeHtml(summary.convertedLeads || 0)}</strong>Converted</span>
          <span class="data-chip"><strong>${escapeHtml(summary.activeProjects || 0)}</strong>Active Projects</span>
          <span class="data-chip"><strong>${escapeHtml(`${summary.month}/${summary.year}`)}</strong>Month</span>
        </div>
        <div class="settings-grid admin-mt-18">
          <div class="settings-item"><span>Employee</span><strong>${escapeHtml(executive.fullName || "Employee")}</strong></div>
          <div class="settings-item"><span>Monthly Target</span><strong>${escapeHtml(summary.monthlyTarget || 0)} clients</strong></div>
          <div class="settings-item"><span>Target Progress</span><strong>${escapeHtml(summary.monthlyTargetProgress || 0)}%</strong></div>
          <div class="settings-item"><span>Pending Commission</span><strong>${escapeHtml(formatInvoiceCurrency(summary.totalCommissionPending || 0))}</strong></div>
          <div class="settings-item"><span>Paid Commission</span><strong>${escapeHtml(formatInvoiceCurrency(summary.totalCommissionPaid || 0))}</strong></div>
        </div>
      `;
    }

    function openCreateSalesExecutiveDrawer() {
      openDrawer({
        eyebrow: "Sales",
        title: "Add Employee",
        subtitle: "Create a part-time, full-time, or freelance employee profile with target and commission rules.",
        body: salesExecutiveDetailSection({
          status: "Active",
          workType: "Part Time",
          paymentMethod: "Cash",
          commissionRules: {
            baseTargetClientsPerMonth: 3,
            baseCommissionAmount: 15000,
            extraClientCommission: 6000,
            commissionType: "Fixed Target",
            percentageRate: 0
          }
        })
      });
    }

    async function openSalesExecutiveDrawer(executiveId) {
      const payload = await apiFetch(`/api/admin/sales-executives/${executiveId}`);
      const executive = payload.salesExecutive;

      openDrawer({
        eyebrow: "Employee",
        title: executive.fullName || "Employee",
        subtitle: "Update profile, payment method, bank details, and commission rules.",
        body: salesExecutiveDetailSection(executive)
      });
    }

    async function archiveSalesExecutive(executiveId) {
      await apiFetch(`/api/admin/sales-executives/${executiveId}`, {
        method: "DELETE",
        body: JSON.stringify({})
      });
      await refreshAllData();
      closeDrawer();
      showToast("Employee hidden", "The employee was hidden from the active list.");
    }

    async function openSalesExecutiveSummaryDrawer(executiveId) {
      const payload = await apiFetch(`/api/admin/sales-executives/${executiveId}/commission-summary`);
      const summary = payload.summary || {};

      openDrawer({
        eyebrow: "Commission Summary",
        title: summary.salesExecutive && summary.salesExecutive.fullName ? summary.salesExecutive.fullName : "Employee",
        subtitle: "Monthly lead conversion, target progress, and commission totals.",
        body: salesExecutiveSummarySection(summary)
      });
    }

    function openCreateLeadDrawer() {
      openDrawer({
        eyebrow: "Lead",
        title: "Add Lead",
        subtitle: "Create a lead and assign it to an employee for follow-up.",
        body: leadDetailSection({
          leadSource: "Sales Executive",
          status: "New",
          priority: "Medium",
          interestedService: "Website",
          estimatedBudget: 0
        })
      });
    }

    async function openLeadDrawer(leadId) {
      const payload = await apiFetch(`/api/admin/leads/${leadId}`);
      const lead = payload.lead;

      openDrawer({
        eyebrow: "Lead",
        title: lead.businessName || lead.contactPerson || "Lead",
        subtitle: "Update lead status, assignment, follow-up, conversion links, and notes.",
        body: leadDetailSection(lead)
      });
    }

    async function convertLead(leadId, payload = {}) {
      await apiFetch(`/api/admin/leads/${leadId}/convert`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      await refreshAllData();
      closeDrawer();
      showToast("Lead converted", "The lead was marked as converted.");
    }

    function openCreateCommissionDrawer() {
      if (!state.allSalesExecutives.length) {
        showBanner("Add at least one employee before creating commissions.", "warning");
        return;
      }

      openDrawer({
        eyebrow: "Commission",
        title: "Create Commission",
        subtitle: "Record a manual, target, percentage, bonus, or adjustment commission.",
        body: commissionDetailSection({
          salesExecutiveId: state.allSalesExecutives[0].id,
          commissionType: "Manual Bonus",
          status: "Pending",
          amount: 0
        })
      });
    }

    async function openCommissionDrawer(commissionId) {
      const payload = await apiFetch(`/api/admin/commissions/${commissionId}`);
      const commission = payload.commission;

      openDrawer({
        eyebrow: "Commission",
        title: commission.salesExecutiveName || "Commission",
        subtitle: "Update commission links, amount, month, status, and payment reference.",
        body: commissionDetailSection(commission)
      });
    }

    async function handleCommissionAction(commissionId, action) {
      if (!action || action === "edit") {
        await openCommissionDrawer(commissionId);
        return;
      }

      const endpointByAction = {
        approve: "approve",
        "mark-paid": "mark-paid",
        cancel: "cancel"
      };
      const endpoint = endpointByAction[action];

      if (!endpoint) {
        return;
      }

      await apiFetch(`/api/admin/commissions/${commissionId}/${endpoint}`, {
        method: "PATCH",
        body: JSON.stringify({})
      });
      await refreshAllData();
      closeDrawer();
      showToast("Commission updated", "Commission status was updated successfully.");
    }

    function attachSalesExecutiveEnterNavigation(form) {
      const fields = [
        "fullName",
        "phone",
        "email",
        "password",
        "nicNumber",
        "status",
        "workType",
        "joinedDate",
        "paymentMethod",
        "address",
        "baseTargetClientsPerMonth",
        "baseCommissionAmount",
        "extraClientCommission",
        "commissionRuleType",
        "percentageRate",
        "bankName",
        "accountHolderName",
        "accountNumber",
        "branch",
        "notes"
      ];

      form.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }

        const field = event.target;
        if (!field || !field.name || !fields.includes(field.name)) {
          return;
        }

        if (field.tagName === "TEXTAREA" && event.shiftKey) {
          return;
        }

        event.preventDefault();

        if (field.name === "notes") {
          form.requestSubmit();
          return;
        }

        const nextFieldName = fields[fields.indexOf(field.name) + 1];
        const nextField = nextFieldName ? form.elements[nextFieldName] : null;
        if (nextField && typeof nextField.focus === "function") {
          nextField.focus();
        }
      });
    }

    function attachDrawerHandlers() {
      const userRoleForm = document.getElementById("userRoleForm");
      if (userRoleForm) {
        userRoleForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(userRoleForm);
          const userId = formData.get("userId");
          const selectedRole = formData.get("role");
          const selectedStatus = formData.get("status");
          const currentUser = state.allUsers.find((item) => item.id === userId) || {};

          if (!window.confirm("Save this role/status change? Access changes apply immediately.")) {
            return;
          }

          try {
            if (selectedRole !== currentUser.role) {
              await apiFetch(`/api/admin/users/${userId}/role`, {
                method: "PATCH",
                body: JSON.stringify({ role: selectedRole })
              });
            }

            if (selectedStatus !== currentUser.status) {
              await apiFetch(`/api/admin/users/${userId}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status: selectedStatus })
              });
            }

            await refreshAllData();
            closeDrawer();
            showToast("User access updated", "Role and status changes were saved.");
          } catch (error) {
            showBanner(error.message || "Unable to update user access.", "error");
          }
        });
      }

      const projectForm = document.getElementById("projectDrawerForm");
      if (projectForm) {
        projectForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(projectForm);
          const mode = projectForm.dataset.mode || "create";
          const projectId = formData.get("projectId");
          const payload = {
            clientId: formData.get("clientId"),
            projectTitle: formData.get("projectTitle"),
            projectType: formData.get("projectType"),
            packageName: formData.get("packageName"),
            status: formData.get("status"),
            priority: formData.get("priority"),
            progressPercentage: formData.get("progressPercentage"),
            startDate: formData.get("startDate") || null,
            expectedDeadline: formData.get("expectedDeadline") || null,
            completedDate: formData.get("completedDate") || null,
            totalAmount: formData.get("totalAmount"),
            paidAmount: formData.get("paidAmount"),
            description: formData.get("description"),
            requirements: formData.get("requirements"),
            clientNotes: formData.get("clientNotes"),
            adminNotes: formData.get("adminNotes"),
            milestones: parseMilestoneLines(formData.get("milestones")),
            deliverables: parseDeliverableLines(formData.get("deliverables"))
          };

          try {
            if (mode === "create" || hasAdminPermission("projects:manage")) {
              await apiFetch(mode === "create" ? "/api/admin/projects" : `/api/admin/projects/${projectId}`, {
                method: mode === "create" ? "POST" : "PATCH",
                body: JSON.stringify(payload)
              });
            } else {
              await apiFetch(`/api/admin/projects/${projectId}/status`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: payload.status,
                  progressPercentage: payload.progressPercentage
                })
              });
            }

            await refreshAllData();
            closeDrawer();
            showToast(mode === "create" ? "Project created" : "Project saved", "Project management records were updated successfully.");
          } catch (error) {
            showBanner(error.message || "Unable to save the project.", "error");
          }
        });

        const archiveButton = document.getElementById("archiveProjectButton");
        if (archiveButton) {
          archiveButton.addEventListener("click", async () => {
            try {
              await archiveProject(new FormData(projectForm).get("projectId"));
            } catch (error) {
              showBanner(error.message || "Unable to archive the project.", "error");
            }
          });
        }
      }

      const projectFileForm = document.getElementById("projectFileForm");
      if (projectFileForm) {
        projectFileForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(projectFileForm);
          const selectedFile = projectFileForm.querySelector('input[name="uploadFile"]').files[0] || null;
          const payload = {
            title: formData.get("title"),
            description: formData.get("description"),
            fileName: selectedFile ? selectedFile.name : "",
            fileUrl: formData.get("fileUrl"),
            fileType: formData.get("fileType"),
            visibility: formData.get("visibility"),
            mimeType: selectedFile ? selectedFile.type : "",
            fileContentBase64: selectedFile ? await readFileAsDataUrl(selectedFile) : ""
          };

          try {
            await apiFetch(`/api/admin/projects/${projectFileForm.dataset.projectId}/files`, {
              method: "POST",
              body: JSON.stringify(payload)
            });

            await refreshAllData();
            await openProjectDrawer(projectFileForm.dataset.projectId);
            showToast("Project file added", "The document is now connected to this project.");
          } catch (error) {
            showBanner(error.message || "Unable to add the project file.", "error");
          }
        });
      }

      document.querySelectorAll("[data-file-id]").forEach((button) => {
        button.addEventListener("click", () => {
          handleProjectFileAction(button)
            .catch((error) => showBanner(error.message || "Unable to update the project file.", "error"));
        });
      });

      document.querySelectorAll("[data-maintenance-create-project-id]").forEach((button) => {
        button.addEventListener("click", () => {
          openCreateMaintenanceDrawer(button.dataset.maintenanceCreateProjectId)
            .catch((error) => showBanner(error.message || "Unable to open maintenance form.", "error"));
        });
      });

      const maintenanceForm = document.getElementById("maintenanceDrawerForm");
      if (maintenanceForm) {
        maintenanceForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(maintenanceForm);
          const mode = maintenanceForm.dataset.mode || "create";
          const planId = formData.get("maintenancePlanId");
          const payload = {
            projectId: formData.get("projectId"),
            planName: formData.get("planName"),
            planType: formData.get("planType"),
            status: formData.get("status"),
            startDate: formData.get("startDate"),
            endDate: formData.get("endDate") || null,
            renewalDate: formData.get("renewalDate") || null,
            amount: formData.get("amount"),
            paidAmount: formData.get("paidAmount"),
            paymentStatus: formData.get("paymentStatus"),
            includedServices: parseIncludedServiceLines(formData.get("includedServices")),
            notes: formData.get("notes"),
            adminNotes: formData.get("adminNotes")
          };

          try {
            await apiFetch(mode === "create" ? "/api/admin/maintenance-plans" : `/api/admin/maintenance-plans/${planId}`, {
              method: mode === "create" ? "POST" : "PATCH",
              body: JSON.stringify(payload)
            });

            await refreshAllData();
            closeDrawer();
            showToast(mode === "create" ? "Maintenance plan created" : "Maintenance plan saved", "Maintenance tracking was updated successfully.");
          } catch (error) {
            showBanner(error.message || "Unable to save the maintenance plan.", "error");
          }
        });
      }

      const salesExecutiveForm = document.getElementById("salesExecutiveDrawerForm");
      if (salesExecutiveForm) {
        attachSalesExecutiveEnterNavigation(salesExecutiveForm);

        salesExecutiveForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(salesExecutiveForm);
          const mode = salesExecutiveForm.dataset.mode || "create";
          const executiveId = formData.get("salesExecutiveId");
          const payload = {
            fullName: formData.get("fullName"),
            phone: formData.get("phone"),
            email: formData.get("email"),
            address: formData.get("address"),
            nicNumber: formData.get("nicNumber"),
            status: formData.get("status"),
            joinedDate: formData.get("joinedDate"),
            workType: formData.get("workType"),
            notes: formData.get("notes"),
            paymentMethod: formData.get("paymentMethod"),
            bankDetails: {
              bankName: formData.get("bankName"),
              accountHolderName: formData.get("accountHolderName"),
              accountNumber: formData.get("accountNumber"),
              branch: formData.get("branch")
            },
            commissionRules: {
              baseTargetClientsPerMonth: formData.get("baseTargetClientsPerMonth"),
              baseCommissionAmount: formData.get("baseCommissionAmount"),
              extraClientCommission: formData.get("extraClientCommission"),
              commissionType: formData.get("commissionRuleType"),
              percentageRate: formData.get("percentageRate")
            }
          };
          if (String(formData.get("password") || "").trim()) {
            payload.password = formData.get("password");
          }

          try {
            const result = await apiFetch(mode === "create" ? "/api/admin/sales-executives" : `/api/admin/sales-executives/${executiveId}`, {
              method: mode === "create" ? "POST" : "PATCH",
              body: JSON.stringify(payload)
            });
            await refreshAllData();
            closeDrawer();
            const savedExecutive = result.salesExecutive || {};
            const successTitle = savedExecutive.loginEnabled
              ? (mode === "create" ? "Employee created successfully. Login account created." : "Employee saved successfully. Login account created.")
              : "Employee saved. Login account not created.";
            showToast(successTitle, "The employee list has been updated.");
          } catch (error) {
            showBanner(error.message || "Unable to save the employee.", "error");
          }
        });

        const archiveButton = document.getElementById("archiveSalesExecutiveButton");
        if (archiveButton) {
          archiveButton.addEventListener("click", async () => {
            try {
              await archiveSalesExecutive(new FormData(salesExecutiveForm).get("salesExecutiveId"));
            } catch (error) {
              showBanner(error.message || "Unable to hide the employee from the active list.", "error");
            }
          });
        }
      }

      const leadForm = document.getElementById("leadDrawerForm");
      if (leadForm) {
        leadForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(leadForm);
          const mode = leadForm.dataset.mode || "create";
          const leadId = formData.get("leadId");
          const payload = {
            salesExecutiveId: formData.get("salesExecutiveId"),
            businessName: formData.get("businessName"),
            contactPerson: formData.get("contactPerson"),
            phone: formData.get("phone"),
            email: formData.get("email"),
            businessType: formData.get("businessType"),
            location: formData.get("location"),
            interestedService: formData.get("interestedService"),
            leadSource: formData.get("leadSource"),
            status: formData.get("status"),
            priority: formData.get("priority"),
            estimatedBudget: formData.get("estimatedBudget"),
            approvalStatus: formData.get("approvalStatus"),
            amountReceived: formData.get("amountReceived"),
            packageSold: formData.get("packageSold"),
            paymentDate: formData.get("paymentDate") || null,
            followUpDate: formData.get("followUpDate") || null,
            notes: formData.get("notes"),
            rejectionReason: formData.get("rejectionReason"),
            adminNote: formData.get("adminNote")
          };

          try {
            await apiFetch(mode === "create" ? "/api/admin/leads" : `/api/admin/leads/${leadId}`, {
              method: mode === "create" ? "POST" : "PATCH",
              body: JSON.stringify(payload)
            });
            await refreshAllData();
            closeDrawer();
            showToast(mode === "create" ? "Lead created" : "Lead saved", "Sales lead records were updated successfully.");
          } catch (error) {
            showBanner(error.message || "Unable to save the lead.", "error");
          }
        });

        const convertButton = document.getElementById("convertLeadButton");
        if (convertButton) {
          convertButton.addEventListener("click", async () => {
            const formData = new FormData(leadForm);
            try {
              await convertLead(formData.get("leadId"), {
                clientId: formData.get("clientId"),
                convertedProjectId: formData.get("convertedProjectId")
              });
            } catch (error) {
              showBanner(error.message || "Unable to convert the lead.", "error");
            }
          });
        }

        const approvePaymentButton = document.getElementById("approveLeadPaymentButton");
        if (approvePaymentButton) {
          approvePaymentButton.addEventListener("click", async () => {
            const formData = new FormData(leadForm);
            try {
              await apiFetch(`/api/admin/leads/${formData.get("leadId")}/payment-approval`, {
                method: "PATCH",
                body: JSON.stringify({
                  approvalStatus: "approved",
                  paymentReceived: true,
                  amountReceived: formData.get("amountReceived"),
                  packageSold: formData.get("packageSold"),
                  paymentDate: formData.get("paymentDate") || new Date().toISOString(),
                  adminNote: formData.get("adminNote")
                })
              });
              await refreshAllData();
              closeDrawer();
              showToast("Payment approved", "This paid client now counts toward the employee target.");
            } catch (error) {
              showBanner(error.message || "Unable to approve payment.", "error");
            }
          });
        }

        const rejectPaymentButton = document.getElementById("rejectLeadPaymentButton");
        if (rejectPaymentButton) {
          rejectPaymentButton.addEventListener("click", async () => {
            const formData = new FormData(leadForm);
            try {
              await apiFetch(`/api/admin/leads/${formData.get("leadId")}/payment-approval`, {
                method: "PATCH",
                body: JSON.stringify({
                  approvalStatus: "rejected",
                  paymentReceived: false,
                  amountReceived: formData.get("amountReceived"),
                  packageSold: formData.get("packageSold"),
                  paymentDate: formData.get("paymentDate") || null,
                  adminNote: formData.get("adminNote") || formData.get("rejectionReason")
                })
              });
              await refreshAllData();
              closeDrawer();
              showToast("Payment rejected", "The lead was rejected for target and commission counting.");
            } catch (error) {
              showBanner(error.message || "Unable to reject payment.", "error");
            }
          });
        }
      }

      const commissionForm = document.getElementById("commissionDrawerForm");
      if (commissionForm) {
        commissionForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(commissionForm);
          const mode = commissionForm.dataset.mode || "create";
          const commissionId = formData.get("commissionId");
          const payload = {
            salesExecutiveId: formData.get("salesExecutiveId"),
            leadId: formData.get("leadId"),
            clientId: formData.get("clientId"),
            projectId: formData.get("projectId"),
            invoiceId: formData.get("invoiceId"),
            paymentReference: formData.get("paymentReference"),
            commissionMonth: formData.get("commissionMonth"),
            commissionYear: formData.get("commissionYear"),
            commissionType: formData.get("commissionType"),
            amount: formData.get("amount"),
            status: formData.get("status"),
            paidDate: formData.get("paidDate") || null,
            notes: formData.get("notes")
          };

          try {
            await apiFetch(mode === "create" ? "/api/admin/commissions" : `/api/admin/commissions/${commissionId}`, {
              method: mode === "create" ? "POST" : "PATCH",
              body: JSON.stringify(payload)
            });
            await refreshAllData();
            closeDrawer();
            showToast(mode === "create" ? "Commission created" : "Commission saved", "Commission records were updated successfully.");
          } catch (error) {
            showBanner(error.message || "Unable to save the commission.", "error");
          }
        });
      }

      const requestForm = document.getElementById("requestDrawerForm");
      if (requestForm) {
        requestForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(requestForm);

          try {
            await apiFetch(`/api/admin/requests/${formData.get("requestId")}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: formData.get("status"),
                priority: formData.get("priority"),
                adminNote: formData.get("adminNote")
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast("Request saved", "Request status, priority, and internal note were updated.");
          } catch (error) {
            showBanner(error.message || "Unable to update the request.", "error");
          }
        });

        const resolveButton = document.getElementById("requestResolveButton");
        if (resolveButton) {
          resolveButton.addEventListener("click", async () => {
            try {
              await apiFetch(`/api/admin/requests/${new FormData(requestForm).get("requestId")}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: "resolved",
                  priority: new FormData(requestForm).get("priority"),
                  adminNote: new FormData(requestForm).get("adminNote")
                })
              });

              await refreshAllData();
              closeDrawer();
              showToast("Request resolved", "The request has been marked as resolved.");
            } catch (error) {
              showBanner(error.message || "Unable to resolve the request.", "error");
            }
          });
        }

        const rejectButton = document.getElementById("requestRejectButton");
        if (rejectButton) {
          rejectButton.addEventListener("click", async () => {
            try {
              await apiFetch(`/api/admin/requests/${new FormData(requestForm).get("requestId")}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: "rejected",
                  priority: new FormData(requestForm).get("priority"),
                  adminNote: new FormData(requestForm).get("adminNote")
                })
              });

              await refreshAllData();
              closeDrawer();
              showToast("Request rejected", "The request has been marked as rejected.");
            } catch (error) {
              showBanner(error.message || "Unable to reject the request.", "error");
            }
          });
        }

        const closeButton = document.getElementById("requestCloseButton");
        if (closeButton) {
          closeButton.addEventListener("click", async () => {
            try {
              await apiFetch(`/api/admin/requests/${new FormData(requestForm).get("requestId")}`, {
                method: "DELETE",
                body: JSON.stringify({
                  adminNote: new FormData(requestForm).get("adminNote")
                })
              });

              await refreshAllData();
              closeDrawer();
              showToast("Request closed", "The request has been marked as closed.");
            } catch (error) {
              showBanner(error.message || "Unable to close the request.", "error");
            }
          });
        }
      }

      const invoiceForm = document.getElementById("invoiceDrawerForm");
      if (invoiceForm) {
        syncInvoiceComposerForm();

        invoiceForm.addEventListener("input", (event) => {
          if (event.target.name === "tax") {
            invoiceForm.dataset.autoTax = "false";
          }

          if (event.target.name === "dueDate") {
            invoiceForm.dataset.autoDueDate = "false";
          }

          if (["itemName", "itemQuantity", "itemUnitPrice", "discount", "tax", "issueDate", "dueDate"].includes(event.target.name)) {
            syncInvoiceComposerForm();
          }
        });

        invoiceForm.addEventListener("click", (event) => {
          const addButton = event.target.closest("[data-add-invoice-item]");
          if (addButton) {
            document.getElementById("invoiceItemsList").insertAdjacentHTML("beforeend", invoiceItemEditorMarkup({ name: "", quantity: 1, unitPrice: 0, total: 0 }));
            syncInvoiceComposerForm();
            return;
          }

          const removeButton = event.target.closest("[data-remove-invoice-item]");
          if (removeButton) {
            const rows = invoiceForm.querySelectorAll("[data-invoice-item-row]");
            if (rows.length === 1) {
              rows[0].remove();
              document.getElementById("invoiceItemsList").insertAdjacentHTML("beforeend", invoiceItemEditorMarkup({ name: "", quantity: 1, unitPrice: 0, total: 0 }));
            } else {
              removeButton.closest("[data-invoice-item-row]").remove();
            }
            syncInvoiceComposerForm();
          }
        });

        invoiceForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(invoiceForm);
          const submitter = event.submitter;
          const mode = invoiceForm.dataset.mode || "create";
          const invoiceId = formData.get("invoiceId");
          const payload = {
            clientId: formData.get("clientId"),
            title: formData.get("title"),
            description: formData.get("description"),
            invoiceType: formData.get("invoiceType"),
            projectId: formData.get("projectId") || null,
            maintenancePlanId: formData.get("maintenancePlanId") || null,
            leadId: formData.get("leadId") || null,
            salesExecutiveId: formData.get("salesExecutiveId") || null,
            items: collectInvoiceItems(invoiceForm),
            discount: formData.get("discount"),
            tax: formData.get("tax"),
            issueDate: formData.get("issueDate"),
            dueDate: formData.get("dueDate") || null,
            status: submitter && submitter.dataset.submitInvoiceStatus
              ? submitter.dataset.submitInvoiceStatus
              : formData.get("status"),
            paymentMethod: formData.get("paymentMethod"),
            paymentNotes: formData.get("paymentNotes"),
            notes: formData.get("notes"),
            clientNotes: formData.get("notes"),
            adminNotes: formData.get("adminNotes")
          };

          try {
            await apiFetch(mode === "create" ? "/api/admin/invoices" : `/api/admin/invoices/${invoiceId}`, {
              method: mode === "create" ? "POST" : "PATCH",
              body: JSON.stringify(payload)
            });

            await refreshAllData();
            closeDrawer();
            showToast(
              mode === "create" ? "Invoice created" : "Invoice saved",
              mode === "create"
                ? "The invoice has been saved and added to the billing workspace."
                : "Invoice totals, line items, and notes were updated successfully."
            );
          } catch (error) {
            showBanner(error.message || "Unable to save the invoice.", "error");
          }
        });
      }

      const invoicePaymentForm = document.getElementById("invoicePaymentForm");
      if (invoicePaymentForm) {
        invoicePaymentForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(invoicePaymentForm);

          try {
            await apiFetch(`/api/admin/invoices/${formData.get("invoiceId")}/add-payment`, {
              method: "PATCH",
              body: JSON.stringify({
                amount: formData.get("amount"),
                paidDate: formData.get("paidDate"),
                paymentMethod: formData.get("paymentMethod"),
                paymentNotes: formData.get("paymentNotes"),
                adminNotes: formData.get("adminNotes")
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast("Payment recorded", "The invoice payment was recorded and the balance was recalculated.");
          } catch (error) {
            showBanner(error.message || "Unable to record the payment.", "error");
          }
        });
      }

      const clientForm = document.getElementById("clientDrawerForm");
      if (clientForm) {
        const planField = clientForm.querySelector('[name="plan"]');
        if (planField) {
          syncClientFeatureAccessForm();
          planField.addEventListener("change", syncClientFeatureAccessForm);
        }

        clientForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(clientForm);
          const approvalMode = clientForm.dataset.approvalMode === "true";
          const allowedFeatures = Array.from(clientForm.querySelectorAll('input[name="allowedFeatures"]:checked')).map((input) => input.value);
          const services = String(formData.get("services") || "")
            .split(",")
            .map((service) => service.trim())
            .filter(Boolean);

          try {
            if (approvalMode && formData.get("plan") === "not_assigned") {
              throw new Error("Select a package before approving this client.");
            }

            await apiFetch(`/api/admin/clients/${formData.get("clientId")}`, {
              method: "PATCH",
              body: JSON.stringify({
                plan: formData.get("plan"),
                accountStatus: approvalMode ? "active" : formData.get("accountStatus"),
                monthlyFee: formData.get("monthlyFee"),
                paymentStatus: formData.get("paymentStatus"),
                nextPaymentDate: formData.get("nextPaymentDate") || null,
                isActive: approvalMode ? true : formData.get("isActive") === "true",
                businessName: formData.get("businessName"),
                businessType: formData.get("businessType"),
                phone: formData.get("phone"),
                location: formData.get("location"),
                workingHours: formData.get("workingHours"),
                bookingUrl: formData.get("bookingUrl"),
                chatbotLanguage: formData.get("chatbotLanguage"),
                services,
                allowedFeatures
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast(
              approvalMode ? "Client approved" : "Client saved",
              approvalMode
                ? "The client is now active with the selected package, billing setup, and feature access."
                : "Client package, billing, and business profile details were updated."
            );
          } catch (error) {
            showBanner(error.message || "Unable to save the client.", "error");
          }
        });

        const clientRejectButton = document.getElementById("clientRejectButton");
        if (clientRejectButton) {
          clientRejectButton.addEventListener("click", async () => {
            try {
              await apiFetch(`/api/admin/clients/${new FormData(clientForm).get("clientId")}`, {
                method: "PATCH",
                body: JSON.stringify({
                  accountStatus: "rejected"
                })
              });

              await refreshAllData();
              closeDrawer();
              showToast("Client rejected", "The signup has been rejected and removed from the pending approval queue.");
            } catch (error) {
              showBanner(error.message || "Unable to reject the client.", "error");
            }
          });
        }

        const clientSuspendButton = document.getElementById("clientSuspendButton");
        if (clientSuspendButton) {
          clientSuspendButton.addEventListener("click", async () => {
            try {
              await apiFetch(`/api/admin/clients/${new FormData(clientForm).get("clientId")}`, {
                method: "PATCH",
                body: JSON.stringify({
                  accountStatus: "suspended",
                  isActive: true
                })
              });

              await refreshAllData();
              closeDrawer();
              showToast("Client suspended", "The client account is now suspended and restricted from full dashboard access.");
            } catch (error) {
              showBanner(error.message || "Unable to suspend the client.", "error");
            }
          });
        }
      }

      const bookingForm = document.getElementById("bookingDrawerForm");
      if (bookingForm) {
        bookingForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(bookingForm);

          try {
            await apiFetch(`/api/admin/bookings/${formData.get("bookingId")}`, {
              method: "PATCH",
              body: JSON.stringify({
                name: formData.get("name"),
                email: formData.get("email"),
                phone: formData.get("phone"),
                service: formData.get("service"),
                date: formData.get("date"),
                time: formData.get("time"),
                status: formData.get("status"),
                adminNotes: formData.get("adminNotes")
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast("Booking saved", "Booking details were updated successfully.");
          } catch (error) {
            showBanner(error.message || "Unable to update the booking.", "error");
          }
        });

        document.getElementById("bookingCancelButton").addEventListener("click", async () => {
          try {
            await apiFetch(`/api/admin/bookings/${new FormData(bookingForm).get("bookingId")}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: "cancelled",
                adminNotes: new FormData(bookingForm).get("adminNotes")
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast("Booking cancelled", "The booking has been marked as cancelled.");
          } catch (error) {
            showBanner(error.message || "Unable to cancel the booking.", "error");
          }
        });
      }

      const inquiryForm = document.getElementById("inquiryDrawerForm");
      if (inquiryForm) {
        inquiryForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(inquiryForm);

          try {
            await apiFetch(`/api/admin/inquiries/${formData.get("inquiryId")}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: formData.get("status"),
                adminNotes: formData.get("adminNotes")
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast("Inquiry saved", "Inquiry status and admin notes were updated.");
          } catch (error) {
            showBanner(error.message || "Unable to update the inquiry.", "error");
          }
        });

        document.getElementById("inquiryConvertedButton").addEventListener("click", async () => {
          try {
            await apiFetch(`/api/admin/inquiries/${new FormData(inquiryForm).get("inquiryId")}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: "converted",
                adminNotes: new FormData(inquiryForm).get("adminNotes")
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast("Inquiry converted", "The inquiry has been marked as converted.");
          } catch (error) {
            showBanner(error.message || "Unable to convert the inquiry.", "error");
          }
        });
      }

      const reviewForm = document.getElementById("reviewDrawerForm");
      if (reviewForm) {
        reviewForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(reviewForm);

          try {
            await apiFetch(`/api/admin/reviews/${formData.get("reviewId")}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: formData.get("status"),
                adminNotes: formData.get("adminNotes")
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast("Review saved", "Review moderation details were updated.");
          } catch (error) {
            showBanner(error.message || "Unable to update the review.", "error");
          }
        });

        document.getElementById("reviewApproveButton").addEventListener("click", async () => {
          try {
            await apiFetch(`/api/admin/reviews/${new FormData(reviewForm).get("reviewId")}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: "published",
                adminNotes: new FormData(reviewForm).get("adminNotes")
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast("Review approved", "The review is now marked approved.");
          } catch (error) {
            showBanner(error.message || "Unable to approve the review.", "error");
          }
        });

        document.getElementById("reviewRejectButton").addEventListener("click", async () => {
          try {
            await apiFetch(`/api/admin/reviews/${new FormData(reviewForm).get("reviewId")}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: "hidden",
                adminNotes: new FormData(reviewForm).get("adminNotes")
              })
            });

            await refreshAllData();
            closeDrawer();
            showToast("Review rejected", "The review has been hidden from public display.");
          } catch (error) {
            showBanner(error.message || "Unable to reject the review.", "error");
          }
        });
      }
    }

    async function openClientDrawer(clientId, options = {}) {
      const payload = await apiFetch(`/api/admin/clients/${clientId}`);
      const client = payload.client;
      const approvalMode = options.approvalMode === true;

      openDrawer({
        eyebrow: approvalMode ? "Pending Approval" : "Client Account",
        title: client.businessName || client.name,
        subtitle: approvalMode
          ? "Approve or reject this signup after assigning package, monthly fee, payment state, and feature access."
          : "Manage package assignment, billing state, business profile details, and feature access.",
        body: clientDetailSection(client, options)
      });
    }

    function openBookingDrawer(bookingId) {
      const booking = state.allBookings.find((item) => item._id === bookingId);
      if (!booking) {
        return;
      }

      openDrawer({
        eyebrow: "Booking Record",
        title: `${booking.name} • ${booking.date} ${booking.time}`,
        subtitle: "Edit schedule details, move the booking through its lifecycle, and keep internal notes for the admin team.",
        body: bookingDetailSection(booking)
      });
    }

    function openInquiryDrawer(inquiryId) {
      const inquiry = state.allInquiries.find((item) => item._id === inquiryId);
      if (!inquiry) {
        return;
      }

      openDrawer({
        eyebrow: "Inquiry Record",
        title: inquiry.name,
        subtitle: "Track follow-up progress, lead conversion state, and internal admin notes.",
        body: inquiryDetailSection(inquiry)
      });
    }

    function openReviewDrawer(reviewId) {
      const review = state.allReviews.find((item) => item._id === reviewId);
      if (!review) {
        return;
      }

      openDrawer({
        eyebrow: "Review Moderation",
        title: review.name,
        subtitle: "Approve or reject this review while keeping moderation notes attached to the record.",
        body: reviewDetailSection(review)
      });
    }

    function attachGlobalEvents() {
      document.getElementById("sidebarNav").addEventListener("click", (event) => {
        const button = event.target.closest(".nav-button");
        if (!button) {
          return;
        }

        setSection(button.dataset.section);
      });

      document.getElementById("sidebarToggle").addEventListener("click", openSidebar);
      document.getElementById("sidebarClose").addEventListener("click", closeSidebar);
      document.getElementById("sidebarBackdrop").addEventListener("click", closeSidebar);
      document.getElementById("drawerCloseButton").addEventListener("click", closeDrawer);
      document.getElementById("drawerBackdrop").addEventListener("click", closeDrawer);

      document.querySelectorAll(".theme-control").forEach((field) => {
        field.addEventListener("change", () => {
          applyTheme(field.value);
        });
      });

      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (getThemePreference() === "system") {
          applyTheme("system");
        }
      });

      ["logoutButtonSidebar"].forEach((id) => {
        document.getElementById(id).addEventListener("click", async () => {
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } finally {
            redirectToLogin();
          }
        });
      });

      document.getElementById("headerPendingButton").addEventListener("click", () => {
        setSection("pending-approvals");
      });

      document.getElementById("headerRefreshButton").addEventListener("click", () => {
        refreshAllData()
          .then(() => {
            hideBanner();
            showToast("Data updated", "Admin dashboard data has been updated.");
          })
          .catch((error) => showBanner(error.message || "Unable to update admin data.", "error"));
      });

      document.addEventListener("click", (event) => {
        const sectionTarget = event.target.closest("[data-section-target]");
        if (sectionTarget) {
          setSection(sectionTarget.dataset.sectionTarget);

          if (sectionTarget.dataset.notice) {
            showBanner(sectionTarget.dataset.notice, sectionTarget.dataset.noticeTone || "info");
          } else {
            hideBanner();
          }

          return;
        }

        const invoiceButton = event.target.closest("[data-invoice-id]");
        if (invoiceButton) {
          handleInvoiceAction(invoiceButton.dataset.invoiceId, invoiceButton.dataset.invoiceAction || "view")
            .catch((error) => showBanner(error.message || "Unable to open the invoice record.", "error"));
          return;
        }

        const requestButton = event.target.closest("[data-request-id]");
        if (requestButton) {
          handleRequestAction(requestButton.dataset.requestId, requestButton.dataset.requestAction || "manage")
            .catch((error) => showBanner(error.message || "Unable to open the request record.", "error"));
          return;
        }

        const projectButton = event.target.closest("[data-project-id]");
        if (projectButton) {
          if (projectButton.dataset.projectAction === "archive") {
            archiveProject(projectButton.dataset.projectId)
              .catch((error) => showBanner(error.message || "Unable to archive the project.", "error"));
          } else {
            openProjectDrawer(projectButton.dataset.projectId)
              .catch((error) => showBanner(error.message || "Unable to open the project record.", "error"));
          }
          return;
        }

        const maintenanceButton = event.target.closest("[data-maintenance-id]");
        if (maintenanceButton) {
          updateMaintenanceAction(maintenanceButton.dataset.maintenanceId, maintenanceButton.dataset.maintenanceAction || "edit")
            .catch((error) => showBanner(error.message || "Unable to update the maintenance plan.", "error"));
          return;
        }

        const salesExecutiveButton = event.target.closest("[data-sales-executive-id]");
        if (salesExecutiveButton) {
          const action = salesExecutiveButton.dataset.salesExecutiveAction || "edit";
          if (action === "archive") {
            archiveSalesExecutive(salesExecutiveButton.dataset.salesExecutiveId)
              .catch((error) => showBanner(error.message || "Unable to hide the employee from the active list.", "error"));
          } else if (action === "summary") {
            openSalesExecutiveSummaryDrawer(salesExecutiveButton.dataset.salesExecutiveId)
              .catch((error) => showBanner(error.message || "Unable to load employee summary.", "error"));
          } else {
            openSalesExecutiveDrawer(salesExecutiveButton.dataset.salesExecutiveId)
              .catch((error) => showBanner(error.message || "Unable to open employee record.", "error"));
          }
          return;
        }

        const leadButton = event.target.closest("[data-lead-id]");
        if (leadButton) {
          if (leadButton.dataset.leadAction === "convert") {
            convertLead(leadButton.dataset.leadId)
              .catch((error) => showBanner(error.message || "Unable to convert the lead.", "error"));
          } else if (leadButton.dataset.leadAction === "approve-payment" || leadButton.dataset.leadAction === "reject-payment") {
            const isApproval = leadButton.dataset.leadAction === "approve-payment";
            apiFetch(`/api/admin/leads/${leadButton.dataset.leadId}/payment-approval`, {
              method: "PATCH",
              body: JSON.stringify({
                approvalStatus: isApproval ? "approved" : "rejected",
                paymentReceived: isApproval,
                paymentDate: new Date().toISOString()
              })
            })
              .then(refreshAllData)
              .then(() => showToast(isApproval ? "Payment approved" : "Payment rejected", isApproval ? "The paid client now counts toward target." : "The paid client was rejected."))
              .catch((error) => showBanner(error.message || "Unable to update payment approval.", "error"));
          } else {
            openLeadDrawer(leadButton.dataset.leadId)
              .catch((error) => showBanner(error.message || "Unable to open the lead record.", "error"));
          }
          return;
        }

        const commissionButton = event.target.closest("[data-commission-id]");
        if (commissionButton) {
          handleCommissionAction(commissionButton.dataset.commissionId, commissionButton.dataset.commissionAction || "edit")
            .catch((error) => showBanner(error.message || "Unable to update the commission.", "error"));
          return;
        }

        const clientButton = event.target.closest("[data-client-id]");
        if (clientButton) {
          const action = clientButton.dataset.clientAction || "manage";
          openClientDrawer(clientButton.dataset.clientId, {
            approvalMode: action === "approve" || action === "review"
          }).catch((error) => showBanner(error.message || "Unable to open the client record.", "error"));
          return;
        }

        const bookingButton = event.target.closest("[data-booking-id]");
        if (bookingButton) {
          openBookingDrawer(bookingButton.dataset.bookingId);
          return;
        }

        const inquiryButton = event.target.closest("[data-inquiry-id]");
        if (inquiryButton) {
          openInquiryDrawer(inquiryButton.dataset.inquiryId);
          return;
        }

        const reviewButton = event.target.closest("[data-review-id]");
        if (reviewButton) {
          openReviewDrawer(reviewButton.dataset.reviewId);
          return;
        }

        const userButton = event.target.closest("[data-user-id]");
        if (userButton) {
          try {
            openUserDrawer(userButton.dataset.userId);
          } catch (error) {
            showBanner(error.message || "Unable to open user details.", "error");
          }
          return;
        }

        const auditLogButton = event.target.closest("[data-audit-log-id]");
        if (auditLogButton) {
          try {
            openAuditLogDrawer(auditLogButton.dataset.auditLogId);
          } catch (error) {
            showBanner(error.message || "Unable to open audit log details.", "error");
          }
        }
      });

      document.getElementById("createInvoiceButton").addEventListener("click", openCreateInvoiceDrawer);
      document.getElementById("createProjectButton").addEventListener("click", openCreateProjectDrawer);
      document.getElementById("createMaintenanceButton").addEventListener("click", () => {
        openCreateMaintenanceDrawer().catch((error) => showBanner(error.message || "Unable to open maintenance form.", "error"));
      });
      document.getElementById("createSalesExecutiveButton").addEventListener("click", openCreateSalesExecutiveDrawer);
      document.getElementById("createLeadButton").addEventListener("click", openCreateLeadDrawer);
      document.getElementById("createCommissionButton").addEventListener("click", openCreateCommissionDrawer);
      document.getElementById("refreshClientsButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update clients.", "error"));
      });
      document.getElementById("refreshPendingApprovalsButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update pending approvals.", "error"));
      });
      document.getElementById("refreshInvoicesButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update invoices.", "error"));
      });
      document.getElementById("refreshPaymentsButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update payments.", "error"));
      });
      document.getElementById("refreshProjectsButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update projects.", "error"));
      });
      document.getElementById("refreshMaintenanceButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update maintenance plans.", "error"));
      });
      document.getElementById("refreshSalesButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update employee data.", "error"));
      });
      document.getElementById("refreshBookingsButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update bookings.", "error"));
      });
      document.getElementById("refreshInquiriesButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update inquiries.", "error"));
      });
      document.getElementById("refreshReviewsButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update reviews.", "error"));
      });
      document.getElementById("refreshSupportButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update support requests.", "error"));
      });
      document.getElementById("refreshReportsButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update reports.", "error"));
      });
      document.getElementById("applyReportsFilterButton").addEventListener("click", () => {
        refreshAllData()
          .then(() => showToast("Reports updated", "Reports were updated for the selected period."))
          .catch((error) => showBanner(error.message || "Unable to apply the report filter.", "error"));
      });
      document.getElementById("reportsCurrentMonthButton").addEventListener("click", () => {
        setReportsCurrentMonthFields();
        refreshAllData()
          .then(() => showToast("Reports updated", "Reports were reset to the current month."))
          .catch((error) => showBanner(error.message || "Unable to update current-month reports.", "error"));
      });
      document.getElementById("refreshUsersButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update users.", "error"));
      });
      document.getElementById("refreshAuditLogsButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update audit logs.", "error"));
      });
      document.getElementById("refreshSettingsButton").addEventListener("click", () => {
        refreshAllData().catch((error) => showBanner(error.message || "Unable to update settings.", "error"));
      });
      document.getElementById("exportClientsReportButton").addEventListener("click", () => {
        downloadAdminFile("/api/admin/reports/export/clients", "automatex-clients-report.csv")
          .then(() => showToast("Clients CSV ready", "The client report has been downloaded."))
          .catch((error) => showBanner(error.message || "Unable to download the client report.", "error"));
      });
      document.getElementById("exportRevenueReportButton").addEventListener("click", () => {
        downloadAdminFile(`/api/admin/reports/export/revenue${buildReportsQueryString()}`, "automatex-income-report.csv")
          .then(() => showToast("Income CSV ready", "The income report has been downloaded."))
          .catch((error) => showBanner(error.message || "Unable to download the income report.", "error"));
      });
      document.getElementById("exportProjectsReportButton").addEventListener("click", () => {
        downloadAdminFile(`/api/admin/reports/export/projects${buildReportsQueryString()}`, "automatex-projects-report.csv")
          .then(() => showToast("Projects CSV ready", "The project report has been downloaded."))
          .catch((error) => showBanner(error.message || "Unable to download the project report.", "error"));
      });
      document.getElementById("exportInvoicesReportButton").addEventListener("click", () => {
        downloadAdminFile("/api/admin/reports/export/invoices", "automatex-invoices-report.csv")
          .then(() => showToast("Invoices CSV ready", "The invoice report has been downloaded."))
          .catch((error) => showBanner(error.message || "Unable to download the invoice report.", "error"));
      });
      document.getElementById("exportSalesReportButton").addEventListener("click", () => {
        downloadAdminFile(`/api/admin/reports/export/sales${buildReportsQueryString()}`, "automatex-sales-report.csv")
          .then(() => showToast("Employee leads CSV ready", "The employee leads and commission report has been downloaded."))
          .catch((error) => showBanner(error.message || "Unable to download the employee leads report.", "error"));
      });
      document.getElementById("exportMaintenanceReportButton").addEventListener("click", () => {
        downloadAdminFile(`/api/admin/reports/export/maintenance${buildReportsQueryString()}`, "automatex-maintenance-report.csv")
          .then(() => showToast("Maintenance CSV ready", "The maintenance report has been downloaded."))
          .catch((error) => showBanner(error.message || "Unable to download the maintenance report.", "error"));
      });
      document.getElementById("exportRequestsReportButton").addEventListener("click", () => {
        downloadAdminFile("/api/admin/reports/export/requests", "automatex-requests-report.csv")
          .then(() => showToast("Requests CSV ready", "The support request report has been downloaded."))
          .catch((error) => showBanner(error.message || "Unable to download the support request report.", "error"));
      });
      document.getElementById("adminSettingsForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const saveButton = document.getElementById("saveSettingsButton");
        const originalLabel = saveButton.textContent;
        const payload = {
          companyName: formData.get("companyName"),
          companyEmail: formData.get("companyEmail"),
          companyPhone: formData.get("companyPhone"),
          whatsappNumber: formData.get("whatsappNumber"),
          businessAddress: formData.get("businessAddress"),
          websiteUrl: formData.get("websiteUrl"),
          logoUrl: formData.get("logoUrl"),
          invoicePrefix: formData.get("invoicePrefix"),
          defaultCurrency: formData.get("defaultCurrency"),
          defaultTaxRate: formData.get("defaultTaxRate"),
          defaultPaymentTerms: formData.get("defaultPaymentTerms"),
          supportEmail: formData.get("supportEmail"),
          defaultSupportMessage: formData.get("defaultSupportMessage"),
          paymentInstructions: formData.get("paymentInstructions"),
          bankName: formData.get("bankName"),
          bankAccountName: formData.get("bankAccountName"),
          bankAccountNumber: formData.get("bankAccountNumber"),
          bankBranch: formData.get("bankBranch")
        };

        try {
          saveButton.disabled = true;
          saveButton.textContent = "Saving...";
          const response = await apiFetch("/api/admin/settings", {
            method: "PATCH",
            body: JSON.stringify(payload)
          });

          state.appSettings = response.settings || state.appSettings;
          renderSettingsSection();
          hideBanner();
          showToast("Settings saved", "AutomateX business settings were updated successfully.");
        } catch (error) {
          showBanner(error.message || "Unable to save admin settings.", "error");
        } finally {
          saveButton.disabled = false;
          saveButton.textContent = originalLabel;
        }
      });

      ["clientSearch", "clientPlanFilter", "clientStatusFilter", "clientPaymentFilter", "clientSortBy"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderClientsSection);
        field.addEventListener("change", renderClientsSection);
      });

      ["invoiceSearch", "invoiceStatusFilter", "invoiceTypeFilter", "invoiceMonthFilter", "invoiceDueFromFilter", "invoiceDueToFilter"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderInvoicesSection);
        field.addEventListener("change", renderInvoicesSection);
      });

      document.querySelector("[data-clear-invoice-filters='true']").addEventListener("click", () => {
        document.getElementById("invoiceSearch").value = "";
        document.getElementById("invoiceStatusFilter").value = "";
        document.getElementById("invoiceTypeFilter").value = "";
        document.getElementById("invoiceMonthFilter").value = "";
        document.getElementById("invoiceDueFromFilter").value = "";
        document.getElementById("invoiceDueToFilter").value = "";
        renderInvoicesSection();
      });

      ["projectSearch", "projectStatusFilter", "projectPriorityFilter", "projectTypeFilter"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderProjectsSection);
        field.addEventListener("change", renderProjectsSection);
      });
      ["maintenanceSearch", "maintenanceStatusFilter", "maintenancePaymentFilter"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderMaintenanceSection);
        field.addEventListener("change", renderMaintenanceSection);
      });

      [
        "salesExecutiveSearch",
        "salesExecutiveStatusFilter",
        "salesExecutiveWorkTypeFilter",
        "leadSearch",
        "leadSalesExecutiveFilter",
        "leadStatusFilter",
        "leadServiceFilter",
        "leadPriorityFilter",
        "commissionSalesExecutiveFilter",
        "commissionStatusFilter",
        "commissionMonthFilter",
        "commissionYearFilter"
      ].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderSalesSection);
        field.addEventListener("change", renderSalesSection);
      });

      ["bookingSearch", "bookingStatusFilter", "bookingDateFilter", "bookingSortBy"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderBookingsSection);
        field.addEventListener("change", renderBookingsSection);
      });

      ["inquirySearch", "inquiryStatusFilter", "inquirySortBy"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderInquiriesSection);
        field.addEventListener("change", renderInquiriesSection);
      });

      ["reviewSearch", "reviewStatusFilter", "reviewRatingFilter", "reviewSortBy"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderReviewsSection);
        field.addEventListener("change", renderReviewsSection);
      });

      ["supportSearch", "supportTypeFilter", "supportStatusFilter", "supportPriorityFilter"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderSupportSection);
        field.addEventListener("change", renderSupportSection);
      });

      ["userSearch", "userRoleFilter", "userStatusFilter"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderUsersSection);
        field.addEventListener("change", renderUsersSection);
      });

      ["auditSearch", "auditModuleFilter", "auditSeverityFilter", "auditFromFilter", "auditToFilter"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("input", renderAuditLogsSection);
        field.addEventListener("change", renderAuditLogsSection);
      });

      ["reportsMonthFilter", "reportsFromFilter", "reportsToFilter"].forEach((id) => {
        const field = document.getElementById(id);
        field.addEventListener("change", () => {
          if (id === "reportsFromFilter" || id === "reportsToFilter") {
            document.getElementById("reportsMonthFilter").value = "";
          }
        });
      });
    }

    async function initDashboard() {
      try {
        applyTheme(getThemePreference());
        setReportsCurrentMonthFields();
        attachGlobalEvents();

        if (!getToken()) {
          redirectToLogin();
          return;
        }

        await verifyAdminSession();
        await refreshAllData();
      } catch (error) {
        showBanner(error.message || "Unable to load the Admin Panel.", "error");
      }
    }

    initDashboard();
