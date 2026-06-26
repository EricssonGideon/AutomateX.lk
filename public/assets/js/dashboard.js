/* eslint-disable no-unused-vars */

    const CLIENT_TOKEN_KEYS = ["automatex_client_token", "automatex_token"];
    const ADMIN_TOKEN_KEY = "automatex_admin_token";
    const ADMIN_USER_KEY = "automatex_admin_user";
    const USER_KEY = "automatex_client_user";
    const CSRF_TOKEN_KEY = "automatex_csrf_token";
    const AUTH_STORAGE_KEYS = [...CLIENT_TOKEN_KEYS, ADMIN_TOKEN_KEY, ADMIN_USER_KEY, USER_KEY, CSRF_TOKEN_KEY];
    const LOGOUT_MARKER_KEY = "automatex_auth_logged_out_at";
    const LOGIN_URL = "/login.html";
    const THEME_KEY = "automatex_dashboard_theme";
    const DEFAULT_MONEY_CURRENCY = "LKR";
    const FEATURE_LABELS = {
      "ai-chatbot": "AI Chatbot",
      "booking-system": "Booking System",
      "inquiry-management": "Inquiry Management",
      "review-management": "Review Management",
      "billing-system": "Billing System",
      "whatsapp-automation": "WhatsApp Automation",
      "google-business-support": "Google Business Support",
      "website-maintenance": "Website Maintenance"
    };
    const CLIENT_INQUIRY_STATUS_OPTIONS = ["new", "contacted", "converted", "closed", "in_progress"];
    const CLIENT_REQUEST_TYPE_OPTIONS = ["support", "upgrade", "bug", "feature", "payment"];
    const CLIENT_REQUEST_PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"];
    const state = {
      token: "",
      currentTab: "overview",
      bookingFilter: "month",
      user: null,
      projects: [],
      bookings: [],
      inquiries: [],
      reviews: [],
      invoices: [],
      requests: []
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
      return CLIENT_TOKEN_KEYS.map((key) => getStoredValue(key)).find(Boolean) ||
        getStoredValue(ADMIN_TOKEN_KEY) ||
        "";
    }

    function getCsrfToken() {
      return getStoredValue(CSRF_TOKEN_KEY) || "";
    }

    function saveToken(token) {
      CLIENT_TOKEN_KEYS.forEach((key) => {
        if (token) {
          localStorage.setItem(key, token);
          sessionStorage.removeItem(key);
        } else {
          removeStoredValue(key);
        }
      });
    }

    function redirectToLogin() {
      clearAuthStorage({ markLoggedOut: true });
      window.location.replace(LOGIN_URL);
    }

    function setFeedback(message, tone = "info") {
      const feedback = document.getElementById("feedback");
      feedback.textContent = message;
      feedback.className = `feedback-bar ${tone === "error" ? "error" : "info"}`;
    }

    function clearFeedback() {
      const feedback = document.getElementById("feedback");
      feedback.className = "hidden feedback-bar";
      feedback.textContent = "";
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function formatDate(value) {
      if (!value) {
        return "—";
      }

      return new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }

    function formatDateTime(value) {
      if (!value) {
        return "—";
      }

      return new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    }

    function normalizeCurrencyCode(value, fallback = DEFAULT_MONEY_CURRENCY) {
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

    function formatMoney(value, currency = DEFAULT_MONEY_CURRENCY) {
      const number = Number(value || 0);
      return new Intl.NumberFormat("en-LK", {
        style: "currency",
        currency: normalizeCurrencyCode(currency),
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(number);
    }

    function formatInvoiceMoney(value, currency = "LKR") {
      const number = Number(value || 0);
      return new Intl.NumberFormat("en-LK", {
        style: "currency",
        currency: normalizeCurrencyCode(currency),
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(number);
    }

    function formatPlanLabel(plan) {
      if (!plan || plan === "not_assigned") {
        return "Package Not Assigned";
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

    function hasAssignedPlan(user = state.user) {
      return Boolean(user?.plan && user.plan !== "not_assigned");
    }

    function getDisplayedPackageLabel(user = state.user) {
      if (hasAssignedPlan(user)) {
        return formatPlanLabel(user.plan);
      }

      return user?.accountStatus === "pending" ? "Pending Admin Approval" : "Package Not Assigned";
    }

    function formatStatusLabel(value) {
      return String(value || "pending")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function getThemePreference() {
      return localStorage.getItem(THEME_KEY) || "system";
    }

    function resolveTheme(preference) {
      if (preference === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }

      return preference;
    }

    function applyTheme(preference) {
      const resolvedTheme = resolveTheme(preference);
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.dataset.theme = resolvedTheme;
      localStorage.setItem(THEME_KEY, preference);

      ["themePreference", "themePreferenceMobile", "themePreferenceSettings"].forEach((id) => {
        const field = document.getElementById(id);
        if (field) {
          field.value = preference;
        }
      });
    }

    function getFeatureAccess() {
      return Array.isArray(state.user?.featureAccess) ? state.user.featureAccess : [];
    }

    function hasFeature(featureKey) {
      return getFeatureAccess().some((feature) => feature.key === featureKey && feature.enabled);
    }

    function isPendingAccount() {
      return state.user?.accountStatus === "pending";
    }

    function isSuspendedAccount() {
      return state.user?.accountStatus === "suspended";
    }

    function isRestrictedAccount() {
      return isPendingAccount() || isSuspendedAccount();
    }

    function canManageWorkspace() {
      return state.user?.accountStatus === "active" && state.user?.isActive !== false;
    }

    function getRestrictionMessage() {
      if (isSuspendedAccount()) {
        return "Your account is currently suspended. Please contact AutomateX support to restore access.";
      }

      if (isPendingAccount()) {
        return "Your account is pending admin approval. AutomateX will review your business details and activate your package soon.";
      }

      return "";
    }

    function showRestrictedDashboardState() {
      document.getElementById("dashboardSidebar").classList.add("hidden");
      document.getElementById("dashboardHeader").classList.add("hidden");
      document.getElementById("loadingShell").classList.add("hidden");
      document.getElementById("dashboardContent").classList.add("hidden");
      document.getElementById("accountStatusScreen").classList.remove("hidden");
    }

    function showActiveDashboardState() {
      document.getElementById("dashboardSidebar").classList.remove("hidden");
      document.getElementById("dashboardHeader").classList.remove("hidden");
      document.getElementById("loadingShell").classList.add("hidden");
      document.getElementById("accountStatusScreen").classList.add("hidden");
      document.getElementById("dashboardContent").classList.remove("hidden");
    }

    function renderAccountStatusScreen() {
      const businessName = state.user.businessName || state.user.name || "Your business";
      const title = isSuspendedAccount() ? "Account Suspended" : "Pending Admin Approval";
      const detail = isSuspendedAccount()
        ? "Your account is currently suspended. Please contact AutomateX support to restore access."
        : "Our team will review your submission, confirm your package setup, and activate your dashboard access once approval is complete.";
      const badge = document.getElementById("accountStatusScreenBadge");

      document.getElementById("accountStatusScreenTitle").textContent = title;
      document.getElementById("accountStatusScreenMessage").textContent = getRestrictionMessage();
      document.getElementById("accountStatusScreenBusiness").textContent = businessName;
      document.getElementById("accountStatusScreenEmail").textContent = state.user.email || "—";
      document.getElementById("accountStatusScreenDetail").textContent = detail;

      badge.textContent = isSuspendedAccount() ? "Suspended" : "Pending";
      badge.className = "inline-flex rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]";

      if (isSuspendedAccount()) {
        badge.classList.add("border-rose-500/30", "bg-rose-500/10", "text-rose-200");
      } else {
        badge.classList.add("border-amber-500/30", "bg-amber-500/10", "text-amber-200");
      }
    }

    async function apiRequest(path, options = {}) {
      const token = state.token || getToken();
      if (!token) {
        redirectToLogin();
        throw new Error("Missing authentication token.");
      }

      const response = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() } : {}),
          Authorization: `Bearer ${token}`,
          ...(options.headers || {})
        }
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 401) {
        redirectToLogin();
        throw new Error(payload.message || payload.error || "Authentication failed.");
      }

      if (!response.ok) {
        throw new Error(payload.message || payload.error || "Request failed.");
      }

      return payload;
    }

    async function downloadClientFile(path, fallbackFileName) {
      const token = state.token || getToken();
      if (!token) {
        redirectToLogin();
        throw new Error("Missing authentication token.");
      }

      const response = await fetch(path, {
        headers: {
          ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() } : {}),
          Authorization: `Bearer ${token}`
        }
      });

      if (response.status === 401) {
        redirectToLogin();
        throw new Error("Authentication failed.");
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || "Unable to download the project file.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch && fileNameMatch[1] ? fileNameMatch[1] : fallbackFileName;
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = blobUrl;
      link.download = fileName || "project-file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    }

    function isThisWeek(dateValue) {
      const now = new Date();
      const date = new Date(dateValue);
      const firstDay = new Date(now);
      const dayOfWeek = (firstDay.getDay() + 6) % 7;
      firstDay.setDate(now.getDate() - dayOfWeek);
      firstDay.setHours(0, 0, 0, 0);
      const lastDay = new Date(firstDay);
      lastDay.setDate(firstDay.getDate() + 7);
      return date >= firstDay && date < lastDay;
    }

    function isThisMonth(dateValue) {
      const now = new Date();
      const date = new Date(dateValue);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }

    function getFilteredBookings() {
      if (state.bookingFilter === "week") {
        return state.bookings.filter((booking) => isThisWeek(`${booking.date}T00:00:00`));
      }

      if (state.bookingFilter === "month") {
        return state.bookings.filter((booking) => isThisMonth(`${booking.date}T00:00:00`));
      }

      return state.bookings;
    }

    function getActiveProjects() {
      return (Array.isArray(state.projects) ? state.projects : []).filter((project) =>
        !["completed", "cancelled", "canceled"].includes(String(project.status || "").toLowerCase())
      );
    }

    function getOutstandingInvoiceBalance() {
      return (Array.isArray(state.invoices) ? state.invoices : [])
        .reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
    }

    function getOpenRequests() {
      return (Array.isArray(state.requests) ? state.requests : [])
        .filter((request) => ["open", "in_progress"].includes(request.status));
    }

    function getAllProjectFiles() {
      return (Array.isArray(state.projects) ? state.projects : []).flatMap((project) =>
        (Array.isArray(project.projectFiles) ? project.projectFiles : []).map((file) => ({
          ...file,
          projectTitle: project.projectTitle || "Project"
        }))
      );
    }

    function getAllMaintenancePlans() {
      return (Array.isArray(state.projects) ? state.projects : []).flatMap((project) =>
        (Array.isArray(project.maintenancePlans) ? project.maintenancePlans : []).map((plan) => ({
          ...plan,
          projectTitle: plan.projectTitle || project.projectTitle || "Project"
        }))
      );
    }

    function getNextMilestone() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return (Array.isArray(state.projects) ? state.projects : [])
        .flatMap((project) => (Array.isArray(project.milestones) ? project.milestones : [])
          .filter((milestone) => milestone.dueDate && milestone.status !== "Completed")
          .map((milestone) => ({
            ...milestone,
            projectTitle: project.projectTitle || "Project"
          })))
        .filter((milestone) => new Date(milestone.dueDate) >= today)
        .sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))[0] || null;
    }

    function setText(id, value) {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      }
    }

    function closeMobileMenu() {
      const sidebar = document.getElementById("dashboardSidebar");
      const backdrop = document.getElementById("sidebarBackdrop");
      const toggle = document.getElementById("mobileNavToggle");

      sidebar?.classList.remove("is-open");
      backdrop?.classList.remove("is-visible");
      document.body.classList.remove("mobile-menu-open");
      toggle?.setAttribute("aria-expanded", "false");
      sidebar?.setAttribute("aria-hidden", window.innerWidth >= 1024 ? "false" : "true");
      backdrop?.setAttribute("aria-hidden", "true");
    }

    function openMobileMenu() {
      const sidebar = document.getElementById("dashboardSidebar");
      const backdrop = document.getElementById("sidebarBackdrop");
      const toggle = document.getElementById("mobileNavToggle");

      sidebar?.classList.add("is-open");
      backdrop?.classList.add("is-visible");
      document.body.classList.add("mobile-menu-open");
      toggle?.setAttribute("aria-expanded", "true");
      sidebar?.setAttribute("aria-hidden", "false");
      backdrop?.setAttribute("aria-hidden", "false");
    }

    function updateHeaderForTab(tab) {
      const titleMap = {
        overview: ["Dashboard", "Your AutomateX workspace, project delivery, billing, and support in one place."],
        projects: ["My Projects", "Track project progress, milestones, deliverables, documents, and maintenance."],
        services: ["Services", "Review active package features and unavailable services."],
        invoices: ["Invoices & Payments", "Review balances, due dates, payment status, and PDF downloads."],
        requests: ["Support", "Send support tickets and monitor the response workflow."],
        bookings: ["Bookings", "Review customer reservations and booking activity."],
        inquiries: ["Leads & Inquiries", "Review and update incoming leads quickly."],
        reviews: ["Reviews", "See which reviews are published, pending, or hidden."],
        files: ["Files", "Access client-visible documents published across your projects."],
        settings: ["Settings", "Update your business profile and portal preferences."],
        upgrade: ["Upgrade Plan", "Unlock more automation and premium features."]
      };

      const nextTitle = titleMap[tab] || titleMap.overview;
      document.getElementById("pageTitle").textContent = nextTitle[0];
      document.getElementById("pageSubtitle").textContent = nextTitle[1];
    }

    function setActiveTab(tabName) {
      state.currentTab = tabName;
      updateHeaderForTab(tabName);

      document.querySelectorAll(".dashboard-tab").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.tab === tabName);
      });

      document.querySelectorAll(".dashboard-panel").forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
      });

      closeMobileMenu();
    }

    function statusBadge(status) {
      const normalized = String(status || "").toLowerCase().replace(/\s+/g, "_");

      if (["confirmed", "published", "paid", "resolved", "completed", "approved", "delivered"].includes(normalized)) {
        return "inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold capitalize text-emerald-300";
      }

      if (["cancelled", "overdue", "rejected"].includes(normalized)) {
        return "inline-flex rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold capitalize text-rose-300";
      }

      if (["pending", "sent", "open", "inquiry", "planning", "waiting_for_client", "on_hold"].includes(normalized)) {
        return "inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold capitalize text-amber-300";
      }

      if (["partial", "in_progress", "testing"].includes(normalized)) {
        return "inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold capitalize text-cyan-300";
      }

      return "inline-flex rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold capitalize text-slate-300";
    }

    function requestPriorityBadge(priority) {
      if (priority === "urgent") {
        return "inline-flex rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold capitalize text-rose-300";
      }

      if (priority === "high") {
        return "inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold capitalize text-amber-300";
      }

      if (priority === "low") {
        return "inline-flex rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold capitalize text-slate-300";
      }

      return "inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold capitalize text-cyan-300";
    }

    function renderOverview() {
      const businessName = state.user.businessName || state.user.name || "Your business";
      const hasAssignedPlanValue = hasAssignedPlan(state.user);
      const activeProjects = getActiveProjects();
      const nextMilestone = getNextMilestone();
      const outstandingBalance = getOutstandingInvoiceBalance();
      const outstandingInvoiceCount = state.invoices.filter((invoice) => Number(invoice.balance || 0) > 0).length;
      const openRequests = getOpenRequests();

      setText("welcomeBusinessName", businessName);
      setText("welcomeCopy", canManageWorkspace()
        ? hasAssignedPlanValue
          ? `Welcome back. ${businessName} is currently on the ${formatPlanLabel(state.user.plan)} package. Your portal is ready for project updates, billing, and support.`
          : `Welcome back. ${businessName} is active, but no package has been assigned yet.`
        : getRestrictionMessage());
      setText("overviewPlanBadge", getDisplayedPackageLabel(state.user));
      setText("overviewActiveProjectsCount", String(activeProjects.length));
      setText("overviewActiveProjectLabel", activeProjects[0]?.projectTitle || "No active projects yet");
      setText("overviewNextMilestoneDate", nextMilestone ? formatDate(nextMilestone.dueDate) : "—");
      setText("overviewNextMilestoneLabel", nextMilestone
        ? `${nextMilestone.title || "Milestone"} • ${nextMilestone.projectTitle}`
        : "No upcoming milestone");
      setText("overviewInvoiceBalance", formatInvoiceMoney(outstandingBalance));
      setText("overviewInvoiceCountLabel", outstandingInvoiceCount
        ? `${outstandingInvoiceCount} invoice${outstandingInvoiceCount === 1 ? "" : "s"} with open balance`
        : "No open invoices");
      setText("overviewOpenRequestsCount", String(openRequests.length));
      setText("overviewOpenRequestsLabel", openRequests[0]
        ? `${formatStatusLabel(openRequests[0].status)} • ${openRequests[0].subject || formatRequestTypeLabel(openRequests[0].type)}`
        : "No open tickets");
      setText("accountPlanValue", getDisplayedPackageLabel(state.user));
      setText("accountMonthlyFeeValue", hasAssignedPlanValue && Number(state.user.monthlyFee || 0) > 0
        ? formatMoney(state.user.monthlyFee)
        : "Waiting for admin");
      setText("accountPaymentStatusValue", formatStatusLabel(state.user.paymentStatus));
      setText("accountNextPaymentDateValue", state.user.nextPaymentDate
        ? formatDate(state.user.nextPaymentDate)
        : "Not scheduled");
      setText("accountStatusMessage", canManageWorkspace()
        ? "Your package and service access are active. Contact AutomateX support if you need any package changes."
        : getRestrictionMessage());

      renderAccountNotice();
      renderAccountStatusBadge();
      renderOnboardingChecklist();
      renderServices();
      renderFiles();
      syncDashboardActionState();
    }

    function renderAccountStatusBadge() {
      const badge = document.getElementById("overviewAccountStatusBadge");
      const status = state.user.accountStatus || "pending";
      badge.textContent = formatStatusLabel(status);
      badge.className = "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]";

      if (status === "active") {
        badge.classList.add("border-emerald-500/30", "bg-emerald-500/10", "text-emerald-300");
      } else if (status === "suspended") {
        badge.classList.add("border-rose-500/30", "bg-rose-500/10", "text-rose-300");
      } else {
        badge.classList.add("border-amber-500/30", "bg-amber-500/10", "text-amber-300");
      }
    }

    function renderAccountNotice() {
      const notice = document.getElementById("accountNotice");

      if (!isRestrictedAccount()) {
        notice.className = "hidden rounded-3xl border px-5 py-4 text-sm";
        notice.textContent = "";
        return;
      }

      notice.textContent = getRestrictionMessage();
      notice.className = "rounded-3xl border px-5 py-4 text-sm";

      if (isSuspendedAccount()) {
        notice.classList.add("border-rose-500/30", "bg-rose-500/10", "text-rose-200");
      } else {
        notice.classList.add("border-amber-500/30", "bg-amber-500/10", "text-amber-100");
      }
    }

    function renderOnboardingChecklist() {
      const items = [
        {
          label: "Complete business profile",
          done: Boolean(state.user.profileCompleted),
          hint: state.user.profileCompleted ? "Profile details are saved." : "Add your business name, type, and services in Settings."
        },
        {
          label: "Wait for admin approval",
          done: !isPendingAccount(),
          hint: isPendingAccount() ? "Your account is still under review." : "Admin review completed."
        },
        {
          label: "Package assigned",
          done: hasAssignedPlan(state.user),
          hint: hasAssignedPlan(state.user) ? `Assigned to ${formatPlanLabel(state.user.plan)}.` : "Your package will appear here once assigned."
        },
        {
          label: "First payment confirmed",
          done: state.user.paymentStatus === "paid",
          hint: state.user.paymentStatus === "paid" ? "Payment marked as paid by admin." : "Payment will be confirmed manually by admin."
        },
        {
          label: "Services activated",
          done: canManageWorkspace(),
          hint: canManageWorkspace() ? "Workspace access is fully active." : "Services unlock after approval and activation."
        }
      ];

      document.getElementById("onboardingChecklist").innerHTML = items.map((item) => `
        <article class="detail-tile">
          <div class="flex items-start gap-3">
            <span class="${item.done ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"} inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold">${item.done ? "✓" : "•"}</span>
            <div>
              <p class="font-semibold">${escapeHtml(item.label)}</p>
              <p class="dashboard-muted mt-1 text-sm">${escapeHtml(item.hint)}</p>
            </div>
          </div>
        </article>
      `).join("");
    }

    function renderServices() {
      const features = getFeatureAccess();
      const grid = document.getElementById("featureAccessGrid");

      if (!features.length) {
        grid.innerHTML = `<div class="empty-state md:col-span-2 xl:col-span-3">No services have been assigned to this account yet. Assigned package features will appear here automatically.</div>`;
        return;
      }

      grid.innerHTML = features.map((feature) => `
        <article class="service-card">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold">${escapeHtml(feature.label)}</p>
              <p class="dashboard-muted mt-2 text-sm leading-6">${escapeHtml(feature.enabled ? "Included in your active package." : (feature.lockedReason || "Not included in your current package"))}</p>
            </div>
            <span class="${feature.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-slate-600 bg-slate-800 text-slate-300"} inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">${feature.enabled ? "Active" : "Locked"}</span>
          </div>
          ${feature.enabled ? "" : '<p class="mt-3 text-xs text-amber-300">Not included in your current package</p>'}
        </article>
      `).join("");
    }

    function syncDashboardActionState() {
      const lockedButtons = [
        "copyBookingLinkButton",
        "viewPublicPageButton",
        "cancelSubscriptionButton",
        "openBillingPortalButton"
      ];

      lockedButtons.forEach((id) => {
        const button = document.getElementById(id);
        if (!button) {
          return;
        }

        button.disabled = isRestrictedAccount();
        button.classList.toggle("opacity-50", isRestrictedAccount());
        button.classList.toggle("cursor-not-allowed", isRestrictedAccount());
      });
    }

    function renderBookings() {
      const tbody = document.getElementById("bookingsTableBody");
      const mobileList = document.getElementById("bookingsMobileList");
      const bookings = getFilteredBookings();
      const bookingFeatureEnabled = hasFeature("booking-system");

      if (!canManageWorkspace()) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-400">${escapeHtml(getRestrictionMessage())}</td></tr>`;
        mobileList.innerHTML = `<div class="empty-state">${escapeHtml(getRestrictionMessage())}</div>`;
        return;
      }

      if (!bookingFeatureEnabled) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-amber-300">Booking management is not included in your current package.</td></tr>`;
        mobileList.innerHTML = `<div class="empty-state text-amber-300">Booking management is not included in your current package.</div>`;
        return;
      }

      if (!bookings.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-400">No bookings found for this filter.</td></tr>`;
        mobileList.innerHTML = `<div class="empty-state">No bookings found for this filter.</div>`;
        return;
      }

      tbody.innerHTML = bookings.map((booking) => `
        <tr>
          <td class="px-4 py-4 text-sm text-slate-300">${escapeHtml(booking.date)}</td>
          <td class="px-4 py-4 text-sm text-slate-300">${escapeHtml(booking.time)}</td>
          <td class="px-4 py-4 text-sm text-white">${escapeHtml(booking.name)}</td>
          <td class="px-4 py-4 text-sm text-slate-300">${escapeHtml(booking.email)}</td>
          <td class="px-4 py-4"><span class="${statusBadge(booking.status)}">${escapeHtml(booking.status)}</span></td>
          <td class="px-4 py-4">
            ${!bookingFeatureEnabled
              ? `<span class="text-xs text-amber-300">Not included in your current package</span>`
              : booking.status === "confirmed" && canManageWorkspace()
                ? `<button data-cancel-booking="${booking._id || booking.id}" class="rounded-2xl border border-rose-500/40 px-3 py-2 text-xs text-rose-300">Cancel</button>`
                : `<span class="text-xs text-slate-500">${isRestrictedAccount() ? "Awaiting activation" : "No action"}</span>`}
          </td>
        </tr>
      `).join("");

      mobileList.innerHTML = bookings.map((booking) => `
        <article class="mobile-data-card">
          <div class="mobile-data-card__header">
            <div>
              <strong>${escapeHtml(booking.name)}</strong>
              <span>${escapeHtml(booking.email)}</span>
            </div>
            <span class="${statusBadge(booking.status)}">${escapeHtml(formatStatusLabel(booking.status))}</span>
          </div>
          <dl class="mobile-data-grid">
            <div><dt>Date</dt><dd>${escapeHtml(booking.date || "—")}</dd></div>
            <div><dt>Time</dt><dd>${escapeHtml(booking.time || "—")}</dd></div>
          </dl>
          ${booking.status === "confirmed" && canManageWorkspace()
            ? `<button data-cancel-booking="${booking._id || booking.id}" class="secondary-button mt-3" type="button">Cancel booking</button>`
            : ""}
        </article>
      `).join("");

      document.querySelectorAll("[data-cancel-booking]").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await apiRequest(`/api/bookings/${button.dataset.cancelBooking}/cancel`, {
              method: "PATCH"
            });
            setFeedback("Booking cancelled successfully.");
            await loadBookings();
            renderOverview();
          } catch (error) {
            setFeedback(error.message, "error");
          }
        });
      });
    }

    function renderInquiries() {
      const list = document.getElementById("inquiriesList");
      const inquiryFeatureEnabled = hasFeature("inquiry-management");

      if (!canManageWorkspace()) {
        list.innerHTML = `<div class="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">${escapeHtml(getRestrictionMessage())}</div>`;
        return;
      }

      if (!inquiryFeatureEnabled) {
        list.innerHTML = `<div class="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-amber-300">Inquiry management is not included in your current package.</div>`;
        return;
      }

      if (!state.inquiries.length) {
        list.innerHTML = `<div class="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">No inquiries found yet.</div>`;
        return;
      }

      list.innerHTML = state.inquiries.map((inquiry) => `
        <article class="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="max-w-3xl">
              <div class="flex flex-wrap items-center gap-3">
                <h4 class="text-lg font-semibold">${escapeHtml(inquiry.name)}</h4>
                <span class="text-sm text-slate-400">${escapeHtml(inquiry.email)}</span>
                <span class="${statusBadge(inquiry.status)}">${escapeHtml(formatStatusLabel(inquiry.status))}</span>
              </div>
              <p class="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">${formatDateTime(inquiry.createdAt)}</p>
              <p class="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">Source: ${escapeHtml(formatStatusLabel(inquiry.source || "website"))}</p>
              <p class="mt-3 text-sm text-slate-300">${escapeHtml(inquiry.message.slice(0, 140))}${inquiry.message.length > 140 ? "..." : ""}</p>
              <details class="mt-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <summary class="cursor-pointer text-sm font-semibold text-cyan-300">View full message</summary>
                <p class="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">${escapeHtml(inquiry.message)}</p>
              </details>
            </div>
          </div>

          <form data-inquiry-form="${escapeHtml(inquiry._id || inquiry.id)}" class="mt-5 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <div class="grid gap-4 md:grid-cols-2">
              <label class="block">
                <span class="mb-2 block text-sm text-slate-300">Lead status</span>
                <select name="status" class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-cyan-400">
                  ${CLIENT_INQUIRY_STATUS_OPTIONS.map((status) => `
                    <option value="${status}" ${inquiry.status === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>
                  `).join("")}
                </select>
              </label>
              <div class="block">
                <span class="mb-2 block text-sm text-slate-300">Current visibility</span>
                <div class="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
                  Only your account can manage this lead from the client dashboard.
                </div>
              </div>
              <label class="block md:col-span-2">
                <span class="mb-2 block text-sm text-slate-300">Internal lead notes</span>
                <textarea name="clientNotes" class="min-h-[120px] w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-cyan-400" placeholder="Add follow-up notes, next steps, or conversion details for your team.">${escapeHtml(inquiry.clientNotes || "")}</textarea>
              </label>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Save status changes and notes to keep your lead pipeline current.</p>
              <button type="submit" class="rounded-2xl border border-cyan-500/30 px-4 py-2 text-sm font-semibold text-cyan-200">Save Lead Update</button>
            </div>
          </form>
        </article>
      `).join("");

      list.querySelectorAll("[data-inquiry-form]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submitButton = form.querySelector('button[type="submit"]');
          const statusField = form.querySelector('select[name="status"]');
          const notesField = form.querySelector('textarea[name="clientNotes"]');

          submitButton.disabled = true;
          submitButton.textContent = "Saving...";

          try {
            await apiRequest(`/api/inquiries/${form.dataset.inquiryForm}/status`, {
              method: "PATCH",
              body: JSON.stringify({
                status: statusField.value,
                clientNotes: notesField.value
              })
            });
            setFeedback("Lead updated successfully.");
            await loadInquiries();
            renderOverview();
          } catch (error) {
            setFeedback(error.message, "error");
          } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Save Lead Update";
          }
        });
      });
    }

    function renderStars(rating) {
      return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
    }

    function renderReviews() {
      const grid = document.getElementById("reviewsGrid");
      const reviewFeatureEnabled = hasFeature("review-management");

      if (!canManageWorkspace()) {
        grid.innerHTML = `<div class="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">${escapeHtml(getRestrictionMessage())}</div>`;
        return;
      }

      if (!reviewFeatureEnabled) {
        grid.innerHTML = `<div class="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-amber-300">Review management is not included in your current package.</div>`;
        return;
      }

      if (!state.reviews.length) {
        grid.innerHTML = `<div class="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">No reviews found yet.</div>`;
        return;
      }

      grid.innerHTML = state.reviews.map((review) => `
        <article class="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-lg font-semibold">${escapeHtml(review.name)}</h4>
              <p class="mt-1 text-sm text-slate-400">${escapeHtml(review.role || "Customer review")}</p>
            </div>
            <span class="${statusBadge(review.status)}">${escapeHtml(review.status)}</span>
          </div>
          <p class="mt-4 text-sm tracking-[0.2em] text-amber-300">${renderStars(Number(review.rating || 0))}</p>
          <p class="mt-3 text-sm leading-7 text-slate-300">${escapeHtml(review.text)}</p>
          <p class="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">${formatDateTime(review.createdAt)}</p>
          ${reviewFeatureEnabled ? "" : `<p class="mt-3 text-xs text-amber-300">Not included in your current package</p>`}
        </article>
      `).join("");
    }

    function renderSettings() {
      const user = state.user;
      document.getElementById("settingsBusinessName").value = user.businessName || "";
      document.getElementById("settingsOwnerName").value = user.name || "";
      document.getElementById("settingsBusinessType").value = user.businessType || "";
      document.getElementById("settingsPhone").value = user.phone || "";
      document.getElementById("settingsLocation").value = user.location || "";
      document.getElementById("settingsWorkingHours").value = user.workingHours || "";
      document.getElementById("settingsChatbotLanguage").value = user.chatbotLanguage || "";
      document.getElementById("settingsAccountEmail").value = user.email || "";
      document.getElementById("settingsServices").value = Array.isArray(user.services) ? user.services.join(", ") : "";
      applyTheme(getThemePreference());

      const saveButton = document.querySelector("#settingsForm button[type='submit']");
      saveButton.disabled = isSuspendedAccount();
      saveButton.classList.toggle("opacity-50", isSuspendedAccount());
      saveButton.classList.toggle("cursor-not-allowed", isSuspendedAccount());
    }

    function renderInvoices() {
      const invoices = Array.isArray(state.invoices) ? state.invoices : [];
      const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue");
      const outstandingBalance = invoices.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
      const emptyState = document.getElementById("invoicesEmptyState");
      const tableWrap = document.getElementById("invoicesTableWrap");
      const tableBody = document.getElementById("invoicesTableBody");
      const mobileList = document.getElementById("invoicesMobileList");

      document.getElementById("invoiceCountValue").textContent = String(invoices.length);
      document.getElementById("invoiceBalanceValue").textContent = formatInvoiceMoney(outstandingBalance);
      document.getElementById("invoiceOverdueValue").textContent = String(overdueInvoices.length);

      if (!invoices.length) {
        emptyState.classList.remove("hidden");
        tableWrap.classList.add("hidden");
        tableBody.innerHTML = "";
        mobileList.innerHTML = "";
        return;
      }

      emptyState.classList.add("hidden");
      tableWrap.classList.remove("hidden");
      tableBody.innerHTML = invoices.map((invoice) => `
        <tr>
          <td class="px-4 py-4">
            <div class="font-semibold">${escapeHtml(invoice.invoiceNumber || "Invoice")}</div>
            <div class="mt-1 text-sm text-slate-400">${escapeHtml(invoice.invoiceType || "Custom")} • ${escapeHtml(formatDate(invoice.issueDate))}</div>
          </td>
          <td class="px-4 py-4">
            <div class="font-semibold">${escapeHtml(invoice.title || "Invoice")}</div>
            <div class="mt-1 text-sm text-slate-400">${escapeHtml([invoice.projectTitle, invoice.maintenancePlanName, invoice.leadBusinessName].filter(Boolean).join(" • ") || invoice.businessName || state.user.businessName || "AutomateX Service")}</div>
          </td>
          <td class="px-4 py-4">${escapeHtml(formatInvoiceMoney(invoice.totalAmount, invoice.currency))}</td>
          <td class="px-4 py-4">${escapeHtml(formatInvoiceMoney(invoice.paidAmount, invoice.currency))}</td>
          <td class="px-4 py-4">${escapeHtml(formatInvoiceMoney(invoice.balance, invoice.currency))}</td>
          <td class="px-4 py-4"><span class="${statusBadge(invoice.status)}">${escapeHtml(invoice.paymentStatus || formatStatusLabel(invoice.status))}</span></td>
          <td class="px-4 py-4">${escapeHtml(formatDate(invoice.dueDate))}</td>
          <td class="px-4 py-4">
            <button
              class="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:border-cyan-300 hover:text-cyan-200"
              type="button"
              data-invoice-pdf-download="/api/invoices/${escapeHtml(invoice.id)}/pdf"
              data-invoice-file-name="${escapeHtml(invoice.invoiceNumber || "invoice")}.pdf"
            >Download</button>
          </td>
        </tr>
      `).join("");

      mobileList.innerHTML = invoices.map((invoice) => `
        <article class="mobile-data-card">
          <div class="mobile-data-card__header">
            <div>
              <strong>${escapeHtml(invoice.invoiceNumber || "Invoice")}</strong>
              <span>${escapeHtml(invoice.title || "AutomateX service")}</span>
            </div>
            <span class="${statusBadge(invoice.status)}">${escapeHtml(invoice.paymentStatus || formatStatusLabel(invoice.status))}</span>
          </div>
          <dl class="mobile-data-grid">
            <div><dt>Total</dt><dd>${escapeHtml(formatInvoiceMoney(invoice.totalAmount, invoice.currency))}</dd></div>
            <div><dt>Paid</dt><dd>${escapeHtml(formatInvoiceMoney(invoice.paidAmount, invoice.currency))}</dd></div>
            <div><dt>Balance</dt><dd>${escapeHtml(formatInvoiceMoney(invoice.balance, invoice.currency))}</dd></div>
            <div><dt>Due</dt><dd>${escapeHtml(formatDate(invoice.dueDate))}</dd></div>
          </dl>
          <button
            class="secondary-button mt-3"
            type="button"
            data-invoice-pdf-download="/api/invoices/${escapeHtml(invoice.id)}/pdf"
            data-invoice-file-name="${escapeHtml(invoice.invoiceNumber || "invoice")}.pdf"
          >Download PDF</button>
        </article>
      `).join("");
    }

    function renderProjectTimelineItems(items, emptyMessage) {
      if (!items || !items.length) {
        return `<div class="dashboard-soft-surface rounded-2xl border p-4 text-sm dashboard-muted">${escapeHtml(emptyMessage)}</div>`;
      }

      return items.map((item) => `
        <article class="dashboard-soft-surface rounded-2xl border p-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="font-semibold">${escapeHtml(item.title || "Untitled")}</p>
              <p class="dashboard-muted mt-1 text-sm leading-6">${escapeHtml(item.description || "No description added yet.")}</p>
            </div>
            <span class="${statusBadge(item.status)}">${escapeHtml(formatStatusLabel(item.status))}</span>
          </div>
          <p class="dashboard-muted mt-3 text-xs uppercase tracking-[0.18em]">
            ${item.dueDate ? `Due ${escapeHtml(formatDate(item.dueDate))}` : ""}
            ${item.deliveredDate ? `Delivered ${escapeHtml(formatDate(item.deliveredDate))}` : ""}
            ${item.completedDate ? `Completed ${escapeHtml(formatDate(item.completedDate))}` : ""}
          </p>
        </article>
      `).join("");
    }

    function renderProjectDocuments(files = []) {
      if (!files.length) {
        return `<div class="dashboard-soft-surface rounded-2xl border p-4 text-sm dashboard-muted">No client-visible project documents have been published yet.</div>`;
      }

      return files.map((file) => `
        <article class="dashboard-soft-surface rounded-2xl border p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="font-semibold">${escapeHtml(file.title || file.fileName || "Project document")}</p>
              <p class="dashboard-muted mt-1 text-sm">${escapeHtml(file.fileType || "Other")} • ${escapeHtml(formatDate(file.createdAt))}</p>
            </div>
            <button class="rounded-xl border border-cyan-500/40 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/10" type="button" data-project-file-download="${escapeHtml(file.downloadUrl || "")}" data-project-file-name="${escapeHtml(file.fileName || "project-file")}">Download</button>
          </div>
        </article>
      `).join("");
    }

    function renderIncludedServices(services = []) {
      if (!services.length) {
        return `<p class="dashboard-muted mt-3 text-sm">No included services have been listed yet.</p>`;
      }

      return `
        <div class="mt-3 grid gap-2">
          ${services.map((service) => `
            <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p class="text-sm font-semibold">${escapeHtml(service.serviceName || "Service")}</p>
              ${service.description ? `<p class="dashboard-muted mt-1 text-sm leading-6">${escapeHtml(service.description)}</p>` : ""}
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderMaintenancePlans(plans = []) {
      if (!plans.length) {
        return `<div class="dashboard-soft-surface rounded-2xl border p-4 text-sm dashboard-muted">No maintenance or renewal plan is active for this project yet.</div>`;
      }

      return plans.map((plan) => `
        <article class="dashboard-soft-surface rounded-2xl border p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="font-semibold">${escapeHtml(plan.planName || "Maintenance plan")}</p>
              <p class="dashboard-muted mt-1 text-sm">${escapeHtml(plan.projectTitle || "Project")} • ${escapeHtml(plan.planType || "Monthly")}</p>
            </div>
            <span class="${statusBadge(plan.status)}">${escapeHtml(formatStatusLabel(plan.status))}</span>
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <p class="dashboard-muted text-xs uppercase tracking-[0.18em]">Renewal</p>
              <p class="mt-1 font-semibold">${escapeHtml(formatDate(plan.renewalDate))}</p>
            </div>
            <div>
              <p class="dashboard-muted text-xs uppercase tracking-[0.18em]">Paid</p>
              <p class="mt-1 font-semibold">${escapeHtml(formatInvoiceMoney(plan.paidAmount))}</p>
            </div>
            <div>
              <p class="dashboard-muted text-xs uppercase tracking-[0.18em]">Balance</p>
              <p class="mt-1 font-semibold">${escapeHtml(formatInvoiceMoney(plan.balanceAmount))}</p>
            </div>
          </div>
          ${renderIncludedServices(plan.includedServices || [])}
          ${plan.notes ? `<p class="dashboard-muted mt-4 text-sm leading-7">${escapeHtml(plan.notes)}</p>` : ""}
        </article>
      `).join("");
    }

    function renderProjects() {
      const projects = Array.isArray(state.projects) ? state.projects : [];
      const list = document.getElementById("projectsList");
      const openBalance = projects.reduce((sum, project) => sum + Number(project.balanceAmount || 0), 0);

      document.getElementById("projectCountValue").textContent = String(projects.length);
      document.getElementById("projectBalanceValue").textContent = formatInvoiceMoney(openBalance);

      if (!canManageWorkspace()) {
        list.innerHTML = `<div class="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">${escapeHtml(getRestrictionMessage())}</div>`;
        return;
      }

      if (!projects.length) {
        list.innerHTML = `<div class="empty-state">No projects have been assigned to your account yet.</div>`;
        return;
      }

      list.innerHTML = projects.map((project, index) => `
        <details class="project-card" ${index === 0 ? "open" : ""}>
          <summary>
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-3">
                  <h4 class="text-xl font-semibold">${escapeHtml(project.projectTitle || "Project")}</h4>
                  <span class="${statusBadge(project.status)}">${escapeHtml(formatStatusLabel(project.status))}</span>
                </div>
                <p class="dashboard-muted mt-2 text-sm">${escapeHtml(project.projectType || "Project")} • ${escapeHtml(project.packageName || "Package not set")}</p>
                <p class="dashboard-muted mt-2 text-sm">Deadline: ${escapeHtml(formatDate(project.expectedDeadline))}</p>
              </div>
              <div class="w-full max-w-xs">
                <progress class="project-progress" max="100" value="${escapeHtml(Math.min(100, Math.max(0, Number(project.progressPercentage || 0))))}">${escapeHtml(project.progressPercentage || 0)}% complete</progress>
                <p class="mt-2 text-right text-sm font-semibold text-cyan-300">${escapeHtml(project.progressPercentage || 0)}% complete</p>
              </div>
            </div>
          </summary>

          <div class="summary-pair mt-5">
            <span><small>Total</small><strong>${escapeHtml(formatInvoiceMoney(project.totalAmount))}</strong></span>
            <span><small>Paid</small><strong>${escapeHtml(formatInvoiceMoney(project.paidAmount))}</strong></span>
            <span><small>Balance</small><strong>${escapeHtml(formatInvoiceMoney(project.balanceAmount))}</strong></span>
            <span><small>Deadline</small><strong>${escapeHtml(formatDate(project.expectedDeadline))}</strong></span>
          </div>

          ${project.description ? `<p class="dashboard-muted mt-5 text-sm leading-7">${escapeHtml(project.description)}</p>` : ""}
          ${project.clientNotes ? `<div class="note-box dashboard-soft-surface mt-4">${escapeHtml(project.clientNotes)}</div>` : ""}

          <div class="project-detail-grid">
            <section>
              <h5 class="section-kicker">Milestones</h5>
              <div class="mt-3 grid gap-3">${renderProjectTimelineItems(project.milestones, "No milestones have been published yet.")}</div>
            </section>
            <section>
              <h5 class="section-kicker">Deliverables</h5>
              <div class="mt-3 grid gap-3">${renderProjectTimelineItems(project.deliverables, "No deliverables have been published yet.")}</div>
            </section>
            <section>
              <h5 class="section-kicker">Documents</h5>
              <div class="mt-3 grid gap-3">${renderProjectDocuments(project.projectFiles || [])}</div>
            </section>
            <section>
              <h5 class="section-kicker">Maintenance</h5>
              <div class="mt-3 grid gap-3">${renderMaintenancePlans(project.maintenancePlans || [])}</div>
            </section>
          </div>
        </details>
      `).join("");
    }

    function renderFiles() {
      const files = getAllProjectFiles();
      const list = document.getElementById("filesList");

      setText("filesCountValue", String(files.length));

      if (!canManageWorkspace()) {
        list.innerHTML = `<div class="empty-state">${escapeHtml(getRestrictionMessage())}</div>`;
        return;
      }

      if (!files.length) {
        list.innerHTML = `<div class="empty-state">No client-visible files have been published yet. Project documents will appear here when they are available.</div>`;
        return;
      }

      list.innerHTML = files.map((file) => `
        <article class="file-card">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 class="font-semibold">${escapeHtml(file.title || file.fileName || "Project file")}</h4>
              <p class="dashboard-muted mt-1 text-sm">${escapeHtml(file.projectTitle || "Project")} • ${escapeHtml(file.fileType || "Other")}</p>
              <p class="dashboard-muted mt-1 text-xs uppercase tracking-[0.16em]">${escapeHtml(formatDate(file.createdAt))}</p>
            </div>
            <button class="secondary-button" type="button" data-project-file-download="${escapeHtml(file.downloadUrl || "")}" data-project-file-name="${escapeHtml(file.fileName || "project-file")}">Download</button>
          </div>
        </article>
      `).join("");
    }

    function toggleRequestPackageField() {
      const requestTypeField = document.getElementById("requestType");
      const packageField = document.getElementById("requestPackageField");
      const packageSelect = document.getElementById("requestPackage");
      const isUpgradeRequest = requestTypeField.value === "upgrade";

      packageField.classList.toggle("hidden", !isUpgradeRequest);
      packageSelect.disabled = !isUpgradeRequest;

      if (!isUpgradeRequest) {
        packageSelect.value = "starter";
      }
    }

    function renderRequests() {
      const requests = Array.isArray(state.requests) ? state.requests : [];
      const list = document.getElementById("requestsList");
      const openRequests = requests.filter((request) => request.status === "open").length;
      const inProgressRequests = requests.filter((request) => request.status === "in_progress").length;
      const resolvedRequests = requests.filter((request) => ["resolved", "closed"].includes(request.status)).length;

      document.getElementById("requestTotalCountValue").textContent = String(requests.length);
      document.getElementById("requestOpenCountValue").textContent = String(openRequests);
      document.getElementById("requestInProgressCountValue").textContent = String(inProgressRequests);
      document.getElementById("requestResolvedCountValue").textContent = String(resolvedRequests);

      if (!canManageWorkspace()) {
        list.innerHTML = `<div class="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">${escapeHtml(getRestrictionMessage())}</div>`;
        return;
      }

      if (!requests.length) {
        list.innerHTML = `<div class="empty-state">No support tickets have been submitted from your account yet.</div>`;
        return;
      }

      list.innerHTML = requests.map((request) => `
        <article class="ticket-card">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="max-w-3xl">
              <div class="flex flex-wrap items-center gap-3">
                <h4 class="text-lg font-semibold">${escapeHtml(request.subject || formatRequestTypeLabel(request.type))}</h4>
                <span class="${statusBadge(request.status)}">${escapeHtml(formatStatusLabel(request.status))}</span>
                <span class="${requestPriorityBadge(request.priority)}">${escapeHtml(formatStatusLabel(request.priority))}</span>
              </div>
              <p class="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">${escapeHtml(formatRequestTypeLabel(request.type))} • ${escapeHtml(formatDateTime(request.createdAt))}</p>
              ${request.type === "upgrade" && request.requestedPackage
                ? `<p class="mt-2 text-xs uppercase tracking-[0.18em] text-cyan-300">Requested package: ${escapeHtml(formatPlanLabel(request.requestedPackage))}</p>`
                : ""}
              <p class="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">${escapeHtml(request.message || "")}</p>
              ${request.resolvedAt
                ? `<p class="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">Last resolved update: ${escapeHtml(formatDateTime(request.resolvedAt))}</p>`
                : ""}
            </div>
            ${["open", "in_progress"].includes(request.status)
              ? `<button data-close-request="${escapeHtml(request.id)}" class="secondary-button" type="button">Close ticket</button>`
              : ""}
          </div>
        </article>
      `).join("");

      list.querySelectorAll("[data-close-request]").forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          button.textContent = "Closing...";

          try {
            await apiRequest(`/api/requests/${button.dataset.closeRequest}`, {
              method: "PATCH",
              body: JSON.stringify({ status: "closed" })
            });
            setFeedback("Support ticket closed successfully.");
            await loadRequests();
            renderOverview();
          } catch (error) {
            setFeedback(error.message, "error");
          } finally {
            button.disabled = false;
            button.textContent = "Close ticket";
          }
        });
      });
    }

    function updatePlanBadge() {
      const plan = state.user.plan || "not_assigned";
      const accountStatus = state.user.accountStatus || "pending";
      const badge = document.getElementById("planBadge");
      const planLabel = accountStatus === "active"
        ? getDisplayedPackageLabel(state.user)
        : accountStatus === "pending" && !hasAssignedPlan(state.user)
          ? "Pending Admin Approval"
          : formatStatusLabel(accountStatus);
      const statusLabel = formatStatusLabel(accountStatus);

      badge.textContent = planLabel;
      badge.className = "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]";

      if (accountStatus === "suspended") {
        badge.classList.add("border", "border-rose-500/30", "bg-rose-500/10", "text-rose-200");
      } else if (accountStatus === "pending") {
        badge.classList.add("border", "border-amber-500/30", "bg-amber-500/10", "text-amber-200");
      } else if (plan === "starter") {
        badge.classList.add("border", "border-amber-500/30", "bg-amber-500/10", "text-amber-200");
      } else if (plan === "standard") {
        badge.classList.add("border", "border-cyan-500/30", "bg-cyan-500/10", "text-cyan-200");
      } else if (plan === "not_assigned") {
        badge.classList.add("border", "border-slate-600", "bg-slate-800", "text-slate-200");
      } else {
        badge.classList.add("border", "border-emerald-500/30", "bg-emerald-500/10", "text-emerald-200");
      }

      const upgradeButton = document.getElementById("upgradePlanButton");
      if (plan === "starter" && accountStatus === "active") {
        upgradeButton.classList.add("ring-2", "ring-amber-300/30");
      } else {
        upgradeButton.classList.remove("ring-2", "ring-amber-300/30");
      }

      setText("mobilePlanLabel", `Plan: ${planLabel}`);
      setText("mobileStatusLabel", statusLabel);
      setText("drawerBusinessName", state.user.businessName || state.user.name || "Client account");
      setText("drawerPlanLabel", planLabel);
      setText("drawerStatusLabel", statusLabel);
    }

    async function loadProfile() {
      const payload = await apiRequest("/api/auth/me");
      if (!payload.user) {
        redirectToLogin();
        return false;
      }

      if (["admin", "manager", "staff"].includes(String(payload.user.role || "").toLowerCase())) {
        window.location.replace("/admin.html");
        return false;
      }

      if (payload.user.role === "employee") {
        window.location.replace("/employee.html");
        return false;
      }

      if (payload.user.role !== "client") {
        redirectToLogin();
        return false;
      }

      state.user = payload.user;
      clearLogoutMarker();
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
      updatePlanBadge();
      renderSettings();
      return true;
    }

    async function loadBookings() {
      const payload = await apiRequest("/api/bookings");
      state.bookings = payload.bookings || [];
      renderBookings();
    }

    async function loadInquiries() {
      const payload = await apiRequest("/api/inquiries");
      state.inquiries = payload.inquiries || [];
      renderInquiries();
    }

    async function loadReviews() {
      const payload = await apiRequest("/api/reviews/manage");
      state.reviews = payload.reviews || [];
      renderReviews();
    }

    async function loadInvoices() {
      const payload = await apiRequest("/api/invoices");
      state.invoices = payload.invoices || [];
      renderInvoices();
    }

    async function loadProjects() {
      const payload = await apiRequest("/api/projects");
      state.projects = payload.projects || [];
      renderProjects();
    }

    async function loadRequests() {
      const payload = await apiRequest("/api/requests");
      state.requests = payload.requests || [];
      renderRequests();
    }

    function handleQuickActions() {
      document.getElementById("copyBookingLinkButton").addEventListener("click", async () => {
        if (isRestrictedAccount()) {
          setFeedback(getRestrictionMessage(), "error");
          return;
        }

        try {
          const bookingUrl = state.user.bookingUrl || `${window.location.origin}/#booking`;
          await navigator.clipboard.writeText(bookingUrl);
          setFeedback("Booking link copied to clipboard.");
        } catch (_error) {
          setFeedback("Unable to copy the booking link right now.", "error");
        }
      });

      document.getElementById("viewPublicPageButton").addEventListener("click", () => {
        if (isRestrictedAccount()) {
          setFeedback(getRestrictionMessage(), "error");
          return;
        }

        const publicUrl = state.user.bookingUrl || `${window.location.origin}/#booking`;
        window.open(publicUrl, "_blank", "noopener,noreferrer");
      });

      document.getElementById("whatsAppSupportButton").addEventListener("click", () => {
        window.open("https://wa.me/94711861722", "_blank", "noopener,noreferrer");
      });
    }

    function handleRequestForm() {
      const form = document.getElementById("requestForm");
      const typeField = document.getElementById("requestType");
      const submitButton = document.getElementById("requestSubmitButton");

      toggleRequestPackageField();
      typeField.addEventListener("change", toggleRequestPackageField);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearFeedback();

        if (!canManageWorkspace()) {
          setFeedback(getRestrictionMessage(), "error");
          return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Sending...";

        try {
          await apiRequest("/api/requests", {
            method: "POST",
            body: JSON.stringify({
              type: document.getElementById("requestType").value,
              requestedPackage: document.getElementById("requestType").value === "upgrade"
                ? document.getElementById("requestPackage").value
                : null,
              priority: document.getElementById("requestPriority").value,
              subject: document.getElementById("requestSubject").value.trim(),
              message: document.getElementById("requestMessage").value.trim()
            })
          });

          form.reset();
          document.getElementById("requestPriority").value = "normal";
          document.getElementById("requestType").value = "support";
          toggleRequestPackageField();
          setFeedback("Your request was sent successfully.");
          await loadRequests();
          renderOverview();
          setActiveTab("requests");
        } catch (error) {
          setFeedback(error.message, "error");
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = "Send ticket";
        }
      });
    }

    function handleSettingsSubmit() {
      document.getElementById("settingsForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        clearFeedback();

        if (isSuspendedAccount()) {
          setFeedback(getRestrictionMessage(), "error");
          return;
        }

        try {
          const payload = await apiRequest("/api/auth/me", {
            method: "PATCH",
            body: JSON.stringify({
              name: document.getElementById("settingsOwnerName").value.trim(),
              businessName: document.getElementById("settingsBusinessName").value.trim(),
              businessType: document.getElementById("settingsBusinessType").value.trim(),
              phone: document.getElementById("settingsPhone").value.trim(),
              location: document.getElementById("settingsLocation").value.trim(),
              workingHours: document.getElementById("settingsWorkingHours").value.trim(),
              chatbotLanguage: document.getElementById("settingsChatbotLanguage").value.trim(),
              services: document.getElementById("settingsServices").value
                .split(",")
                .map((service) => service.trim())
                .filter(Boolean)
            })
          });

          state.user = payload.user;
          localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
          renderSettings();
          renderOverview();
          updatePlanBadge();
          setFeedback("Settings updated successfully.");
        } catch (error) {
          setFeedback(error.message, "error");
        }
      });
    }

    function handleBillingButtons() {
      const openPortal = async () => {
        if (isRestrictedAccount()) {
          setFeedback(getRestrictionMessage(), "error");
          return;
        }

        try {
          const payload = await apiRequest("/api/billing/portal");
          window.location.href = payload.portalUrl;
        } catch (error) {
          setFeedback(error.message, "error");
        }
      };

      [...new Set([
        document.getElementById("cancelSubscriptionButton"),
        document.getElementById("openBillingPortalButton"),
        document.getElementById("invoiceBillingPortalButton"),
        ...document.querySelectorAll("[data-billing-portal-trigger]")
      ].filter(Boolean))].forEach((button) => {
        button.addEventListener("click", openPortal);
      });
    }

    function handleThemeControls() {
      ["themePreference", "themePreferenceMobile", "themePreferenceSettings"].forEach((id) => {
        const field = document.getElementById(id);
        if (field) {
          field.addEventListener("change", () => {
            applyTheme(field.value);
          });
        }
      });

      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (getThemePreference() === "system") {
          applyTheme("system");
        }
      });
    }

    function handleBookingFilters() {
      document.querySelectorAll(".booking-filter").forEach((button) => {
        button.addEventListener("click", () => {
          state.bookingFilter = button.dataset.bookingFilter;
          document.querySelectorAll(".booking-filter").forEach((item) => {
            item.classList.toggle("is-active", item === button);
          });
          renderBookings();
        });
      });
    }

    function handleTabNavigation() {
      document.querySelectorAll(".dashboard-tab").forEach((button) => {
        button.addEventListener("click", () => setActiveTab(button.dataset.tab));
      });

      document.querySelectorAll("[data-tab-target]").forEach((button) => {
        button.addEventListener("click", () => setActiveTab(button.dataset.tabTarget));
      });
    }

    function handleMobileNavigation() {
      document.getElementById("mobileNavToggle")?.addEventListener("click", openMobileMenu);
      document.getElementById("sidebarCloseButton")?.addEventListener("click", closeMobileMenu);
      document.getElementById("sidebarBackdrop")?.addEventListener("click", closeMobileMenu);

      window.addEventListener("resize", () => {
        if (window.innerWidth >= 1024) {
          closeMobileMenu();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeMobileMenu();
        }
      });
    }

    function handleProjectFileDownloads() {
      document.addEventListener("click", (event) => {
        const invoiceButton = event.target.closest("[data-invoice-pdf-download]");
        if (invoiceButton) {
          downloadClientFile(invoiceButton.dataset.invoicePdfDownload, invoiceButton.dataset.invoiceFileName || "invoice.pdf")
            .catch((error) => setFeedback(error.message || "Unable to download the invoice PDF.", "error"));
          return;
        }

        const button = event.target.closest("[data-project-file-download]");
        if (!button) {
          return;
        }

        downloadClientFile(button.dataset.projectFileDownload, button.dataset.projectFileName || "project-file")
          .catch((error) => setFeedback(error.message || "Unable to download the project file.", "error"));
      });
    }

    async function logout() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        redirectToLogin();
      }
    }

    function attachStaticActions() {
      document.getElementById("logoutButtonMobile").addEventListener("click", logout);
      document.getElementById("logoutButtonDesktop").addEventListener("click", logout);
      document.getElementById("logoutButtonStatusScreen").addEventListener("click", logout);
      handleQuickActions();
      handleRequestForm();
      handleSettingsSubmit();
      handleBillingButtons();
      handleThemeControls();
      handleBookingFilters();
      handleTabNavigation();
      handleMobileNavigation();
      handleProjectFileDownloads();
    }

    async function initDashboard() {
      state.token = getToken();
      if (!state.token) {
        redirectToLogin();
        return;
      }

      applyTheme(getThemePreference());
      attachStaticActions();

      try {
        clearFeedback();
        const canContinue = await loadProfile();
        if (!canContinue) {
          return;
        }

        if (isRestrictedAccount()) {
          renderAccountStatusScreen();
          showRestrictedDashboardState();
          return;
        }

        const dataLoaders = [];

        if (hasFeature("booking-system")) {
          dataLoaders.push(loadBookings());
        } else {
          state.bookings = [];
          renderBookings();
        }

        if (hasFeature("inquiry-management")) {
          dataLoaders.push(loadInquiries());
        } else {
          state.inquiries = [];
          renderInquiries();
        }

        if (hasFeature("review-management")) {
          dataLoaders.push(loadReviews());
        } else {
          state.reviews = [];
          renderReviews();
        }

        dataLoaders.push(loadInvoices());
        dataLoaders.push(loadProjects());
        dataLoaders.push(loadRequests());

        await Promise.all(dataLoaders);

        renderOverview();
        renderProjects();
        renderInvoices();
        renderRequests();
        renderSettings();
        showActiveDashboardState();
        setActiveTab("overview");
      } catch (error) {
        setFeedback(error.message || "Unable to load your dashboard right now.", "error");
        showActiveDashboardState();
        setActiveTab("overview");
      }
    }

    initDashboard();
