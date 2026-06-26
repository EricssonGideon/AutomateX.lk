/* eslint-disable no-unused-vars */

(() => {
  const TOKEN_KEYS = ["automatex_token", "automatex_client_token", "automatex_admin_token"];
  const USER_KEY = "automatex_employee_user";
  const CSRF_TOKEN_KEY = "automatex_csrf_token";
  const LOGOUT_MARKER_KEY = "automatex_auth_logged_out_at";
  const state = {
    user: null,
    dashboard: null,
    leads: [],
    currentTab: "overview",
    viewState: "loading"
  };

  function getStoredValue(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  }

  function getToken() {
    return TOKEN_KEYS.map(getStoredValue).find(Boolean) || "";
  }

  function clearAuthStorage() {
    [
      "automatex_token",
      "automatex_client_token",
      "automatex_admin_token",
      "automatex_client_user",
      "automatex_admin_user",
      USER_KEY,
      CSRF_TOKEN_KEY
    ].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  function redirectToLogin() {
    clearAuthStorage();
    window.location.replace("/login.html");
  }

  function createRedirectError(message = "Authentication required.") {
    const error = new Error(message);
    error.isRedirecting = true;
    return error;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) {
      return "Not set";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function toDateInputValue(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showFeedback(message, tone = "error") {
    const feedback = document.getElementById("feedback");
    feedback.textContent = message;
    feedback.className = `feedback ${tone}`;
  }

  function hideFeedback() {
    const feedback = document.getElementById("feedback");
    feedback.textContent = "";
    feedback.className = "feedback hidden";
  }

  async function apiRequest(path, options = {}) {
    const token = getToken();
    if (!token) {
      redirectToLogin();
      throw createRedirectError();
    }

    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };
    if (options.body) {
      headers["Content-Type"] = "application/json";
      const csrfToken = getStoredValue(CSRF_TOKEN_KEY);
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken;
      }
    }

    const response = await fetch(path, {
      ...options,
      headers
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      if (payload.error === "Employee access required" || /employee profile/i.test(payload.message || "")) {
        throw new Error(payload.message || "Employee access is not active.");
      }
      redirectToLogin();
      throw createRedirectError(payload.message || "Authentication required.");
    }

    if (!response.ok) {
      throw new Error(payload.message || "Request failed.");
    }

    return payload;
  }

  function statusClass(status) {
    const normalized = String(status || "").toLowerCase();
    if (["approved", "paid / closed"].includes(normalized)) {
      return "status-pill is-success";
    }
    if (["pending", "payment pending", "quotation sent"].includes(normalized)) {
      return "status-pill is-warning";
    }
    if (["rejected", "cancelled", "not interested"].includes(normalized)) {
      return "status-pill is-danger";
    }
    return "status-pill";
  }

  function setTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll(".nav-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === tab);
    });
    if (state.viewState !== "ready") {
      return;
    }
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== `tab-${tab}`);
    });
  }

  function setAppControlsDisabled(isDisabled) {
    document.querySelectorAll("[data-open-lead-form], [data-refresh-dashboard], #refreshButton, #leadStatusFilter").forEach((control) => {
      control.disabled = isDisabled;
    });
  }

  function showLoadingState() {
    state.viewState = "loading";
    hideFeedback();
    document.getElementById("loadingState").classList.remove("hidden");
    document.getElementById("loadingState").setAttribute("aria-busy", "true");
    document.getElementById("errorState").classList.add("hidden");
    document.getElementById("dashboardContent").classList.add("hidden");
    setAppControlsDisabled(true);
  }

  function showReadyState() {
    state.viewState = "ready";
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("loadingState").setAttribute("aria-busy", "false");
    document.getElementById("errorState").classList.add("hidden");
    document.getElementById("dashboardContent").classList.remove("hidden");
    setAppControlsDisabled(false);
    setTab(state.currentTab);
  }

  function showErrorState(message) {
    state.viewState = "error";
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("loadingState").setAttribute("aria-busy", "false");
    document.getElementById("dashboardContent").classList.add("hidden");
    document.getElementById("errorState").classList.remove("hidden");
    document.getElementById("errorStateMessage").textContent = message || "Please check your connection and try again.";
    setAppControlsDisabled(true);
  }

  function renderDashboard() {
    const dashboard = state.dashboard || {};
    const employee = dashboard.employee || {};
    const performance = dashboard.targetPerformance || {};
    const approved = performance.approvedPaidClients || 0;
    const target = performance.monthlyTarget || 3;
    const employeeName = employee.fullName || state.user?.name || "Employee";

    document.getElementById("welcomeTitle").textContent = `Welcome, ${employeeName}`;
    document.getElementById("mobileEmployeeName").textContent = employeeName;
    document.getElementById("welcomeSubtitle").textContent = "Track your leads, follow-ups, approved clients, and AutomateX sales target progress.";
    document.getElementById("targetCount").textContent = `${approved}/${target}`;
    document.getElementById("targetRemaining").textContent = performance.remainingClients
      ? `${performance.remainingClients} clients remaining`
      : "Target achieved";
    document.getElementById("estimatedCommission").textContent = formatCurrency(dashboard.estimatedCommission || 0);
    document.getElementById("approvedCommission").textContent = formatCurrency(dashboard.approvedCommission || 0);
    document.getElementById("pendingApprovals").textContent = String(dashboard.pendingApprovalClients || 0);
    document.getElementById("targetHeading").textContent = `${approved} of ${target} approved paid clients`;
    document.getElementById("targetBadge").textContent = performance.targetAchieved ? "Target achieved" : "In progress";
    document.getElementById("targetBadge").className = performance.targetAchieved ? "status-pill is-success" : "status-pill is-warning";
    document.getElementById("targetProgressBar").style.width = `${performance.progressPercent || 0}%`;

    const followUps = dashboard.todayFollowUps || [];
    document.getElementById("todayFollowUps").innerHTML = followUps.length
      ? followUps.map((lead) => `
          <div class="list-item">
            <strong>${escapeHtml(lead.businessName || lead.clientName || "Lead")}</strong>
            <p>${escapeHtml(lead.phone || "")} • ${escapeHtml(lead.interestedService || "Other")}</p>
          </div>
        `).join("")
      : `<div class="list-item">No follow-ups scheduled for today.</div>`;

    const pipeline = dashboard.pipelineSummary || {};
    const entries = Object.entries(pipeline);
    document.getElementById("pipelineSummary").innerHTML = entries.length
      ? entries.map(([status, count]) => `
          <div class="pipeline-item">
            <span class="${statusClass(status)}">${escapeHtml(status)}</span>
            <strong>${escapeHtml(count)}</strong>
          </div>
        `).join("")
      : `<div class="pipeline-item">No leads yet.</div>`;
  }

  function getFilteredLeads() {
    const status = document.getElementById("leadStatusFilter").value;
    return state.leads.filter((lead) => !status || lead.status === status);
  }

  function renderLeads() {
    const leads = getFilteredLeads();
    if (!state.leads.length) {
      document.getElementById("leadList").innerHTML = `
        <article class="empty-state-panel">
          <div class="state-icon" aria-hidden="true">+</div>
          <div>
            <p class="eyebrow">No leads yet</p>
            <h3>Start your sales pipeline</h3>
            <p>Add your first prospect to begin tracking follow-ups, paid-client submissions, and monthly target progress.</p>
            <button class="primary-button" type="button" data-open-lead-form>Add New Lead</button>
          </div>
        </article>
      `;
      return;
    }

    document.getElementById("leadList").innerHTML = leads.length
      ? leads.map((lead) => `
          <article class="lead-card">
            <div class="lead-card-header">
              <div>
                <h3>${escapeHtml(lead.businessName || lead.clientName || "Lead")}</h3>
                <p>${escapeHtml(lead.clientName || "Contact")} • ${escapeHtml(lead.phone || "No phone")}</p>
              </div>
              <div class="topbar-actions">
                <span class="${statusClass(lead.status)}">${escapeHtml(lead.status || "New Lead")}</span>
                <span class="${statusClass(lead.approvalStatus)}">${escapeHtml(lead.approvalStatus || "not_submitted")}</span>
              </div>
            </div>
            <div class="lead-meta">
              <div><span>Service</span><strong>${escapeHtml(lead.interestedService || "Other")}</strong></div>
              <div><span>Value</span><strong>${escapeHtml(formatCurrency(lead.estimatedPackageValue || 0))}</strong></div>
              <div><span>Follow-up</span><strong>${escapeHtml(formatDate(lead.followUpDate))}</strong></div>
              <div><span>Updated</span><strong>${escapeHtml(formatDate(lead.updatedAt))}</strong></div>
            </div>
            ${lead.adminNote ? `<p class="notice">${escapeHtml(lead.adminNote)}</p>` : ""}
            <div class="topbar-actions">
              <button class="secondary-button" type="button" data-edit-lead="${escapeHtml(lead.id)}">Edit</button>
              ${lead.approvalStatus === "approved" ? "" : `<button class="primary-button" type="button" data-submit-approval="${escapeHtml(lead.id)}">Submit Paid Client</button>`}
            </div>
          </article>
        `).join("")
      : `
          <article class="empty-state-panel">
            <div class="state-icon" aria-hidden="true">?</div>
            <div>
              <p class="eyebrow">No matching leads</p>
              <h3>Adjust the status filter</h3>
              <p>No leads match the selected status. Clear the filter to return to your full pipeline.</p>
            </div>
          </article>
        `;
  }

  function openLeadModal(lead = {}) {
    document.getElementById("leadModalTitle").textContent = lead.id ? "Edit Lead" : "Add Lead";
    document.getElementById("leadId").value = lead.id || "";
    document.getElementById("clientName").value = lead.clientName || "";
    document.getElementById("businessName").value = lead.businessName || "";
    document.getElementById("phone").value = lead.phone || "";
    document.getElementById("email").value = lead.email || "";
    document.getElementById("businessType").value = lead.businessType || "";
    document.getElementById("interestedService").value = lead.interestedService || "Website";
    document.getElementById("estimatedPackageValue").value = lead.estimatedPackageValue || "";
    document.getElementById("status").value = lead.status || "New Lead";
    document.getElementById("followUpDate").value = toDateInputValue(lead.followUpDate);
    document.getElementById("notes").value = lead.notes || "";
    document.getElementById("amountReceived").value = lead.amountReceived || "";
    document.getElementById("packageSold").value = lead.packageSold || lead.interestedService || "";
    document.getElementById("paymentDate").value = toDateInputValue(lead.paymentDate);
    document.getElementById("submitApprovalButton").disabled = !lead.id || lead.approvalStatus === "approved";
    document.getElementById("leadModal").classList.remove("hidden");
    document.getElementById("leadModal").setAttribute("aria-hidden", "false");
  }

  function closeLeadModal() {
    document.getElementById("leadModal").classList.add("hidden");
    document.getElementById("leadModal").setAttribute("aria-hidden", "true");
    document.getElementById("leadForm").reset();
  }

  function getLeadFormPayload() {
    return {
      clientName: document.getElementById("clientName").value.trim(),
      businessName: document.getElementById("businessName").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      email: document.getElementById("email").value.trim(),
      businessType: document.getElementById("businessType").value.trim(),
      interestedService: document.getElementById("interestedService").value,
      estimatedPackageValue: document.getElementById("estimatedPackageValue").value,
      status: document.getElementById("status").value,
      followUpDate: document.getElementById("followUpDate").value || null,
      notes: document.getElementById("notes").value.trim()
    };
  }

  async function saveLead(event) {
    event.preventDefault();
    hideFeedback();
    const leadId = document.getElementById("leadId").value;
    const payload = getLeadFormPayload();

    await apiRequest(leadId ? `/api/employee/leads/${leadId}` : "/api/employee/leads", {
      method: leadId ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    closeLeadModal();
    await loadData();
    showFeedback(leadId ? "Lead updated successfully." : "Lead created successfully.", "success");
  }

  async function submitApproval(leadId) {
    const id = leadId || document.getElementById("leadId").value;
    if (!id) {
      showFeedback("Save the lead before submitting it for approval.");
      return;
    }

    const payload = {
      amountReceived: document.getElementById("amountReceived").value,
      packageSold: document.getElementById("packageSold").value.trim(),
      paymentDate: document.getElementById("paymentDate").value || new Date().toISOString()
    };

    await apiRequest(`/api/employee/leads/${id}/submit-approval`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    closeLeadModal();
    await loadData();
    showFeedback("Paid client submitted for admin approval.", "success");
  }

  async function verifyProfile() {
    const payload = await apiRequest("/api/auth/me");
    const user = payload.user;
    if (!user) {
      redirectToLogin();
      return false;
    }

    const role = String(user.role || "").toLowerCase();
    if (["admin", "manager", "staff"].includes(role)) {
      window.location.replace("/admin.html");
      return false;
    }
    if (role === "client") {
      window.location.replace("/dashboard.html");
      return false;
    }
    if (role !== "employee") {
      redirectToLogin();
      return false;
    }

    state.user = user;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.removeItem(LOGOUT_MARKER_KEY);
    return true;
  }

  async function loadData() {
    showLoadingState();
    const [dashboardPayload, leadsPayload] = await Promise.all([
      apiRequest("/api/employee/dashboard"),
      apiRequest("/api/employee/leads")
    ]);
    state.dashboard = dashboardPayload.dashboard || {};
    state.leads = leadsPayload.leads || [];
    renderDashboard();
    renderLeads();
    showReadyState();
  }

  async function loadEmployeeApp() {
    showLoadingState();
    const profileOk = await verifyProfile();
    if (profileOk) {
      await loadData();
    }
  }

  function refreshDashboard() {
    loadData().catch((error) => {
      if (!error.isRedirecting) {
        showErrorState(error.message || "Unable to refresh employee dashboard.");
      }
    });
  }

  async function logoutEmployee() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (_error) {
      // Local session cleanup still completes below.
    }
    clearAuthStorage();
    localStorage.setItem(LOGOUT_MARKER_KEY, String(Date.now()));
    window.location.replace("/login.html");
  }

  function attachEvents() {
    document.querySelectorAll(".nav-tab").forEach((button) => {
      button.addEventListener("click", () => {
        setTab(button.dataset.tab);
        if (window.matchMedia("(max-width: 640px)").matches) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });
    document.addEventListener("click", (event) => {
      const addLeadButton = event.target.closest("[data-open-lead-form]");
      if (addLeadButton && !addLeadButton.disabled) {
        openLeadModal();
      }
    });
    document.querySelectorAll("[data-close-modal]").forEach((element) => {
      element.addEventListener("click", closeLeadModal);
    });
    document.getElementById("leadForm").addEventListener("submit", (event) => {
      saveLead(event).catch((error) => showFeedback(error.message || "Unable to save lead."));
    });
    document.getElementById("submitApprovalButton").addEventListener("click", () => {
      submitApproval().catch((error) => showFeedback(error.message || "Unable to submit approval."));
    });
    document.getElementById("refreshButton").addEventListener("click", refreshDashboard);
    document.querySelectorAll("[data-refresh-dashboard]").forEach((button) => {
      button.addEventListener("click", refreshDashboard);
    });
    document.getElementById("retryLoadButton").addEventListener("click", () => {
      loadEmployeeApp().catch((error) => {
        if (!error.isRedirecting) {
          showErrorState(error.message || "Unable to load employee dashboard.");
        }
      });
    });
    document.getElementById("leadStatusFilter").addEventListener("change", renderLeads);
    document.getElementById("leadList").addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit-lead]");
      if (editButton) {
        const lead = state.leads.find((item) => item.id === editButton.dataset.editLead);
        if (lead) {
          openLeadModal(lead);
        }
        return;
      }

      const approvalButton = event.target.closest("[data-submit-approval]");
      if (approvalButton) {
        const lead = state.leads.find((item) => item.id === approvalButton.dataset.submitApproval);
        if (lead) {
          openLeadModal(lead);
          setTimeout(() => {
            document.getElementById("amountReceived").focus();
          }, 0);
        }
      }
    });
    document.querySelectorAll("#logoutButton, [data-logout]").forEach((button) => {
      button.addEventListener("click", () => {
        logoutEmployee().catch(() => {
          clearAuthStorage();
          window.location.replace("/login.html");
        });
      });
    });
  }

  async function init() {
    attachEvents();
    try {
      await loadEmployeeApp();
    } catch (error) {
      if (!error.isRedirecting) {
        showErrorState(error.message || "Unable to load employee dashboard.");
      }
    }
  }

  init();
})();
