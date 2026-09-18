(function () {
  "use strict";

  const API_BASE = "/pos-admin";
  const FIXTURE_BASE = "/__fixtures";
  const CSRF_COOKIE_NAME = "automatex_csrf";
  const POS_EDITION_STANDARD = "standard";

  const state = {
    constants: {
      mandatoryModules: [],
      optionalModules: [],
      updateChannels: []
    },
    clients: [],
    projects: [],
    packages: [],
    activationCodes: [],
    currentPackage: null,
    currentLicence: null,
    selectedActivationLicenceId: "",
    packagePage: 1,
    licencePage: 1,
    activationPage: 1,
    packagePagination: null,
    licencePagination: null,
    activationPagination: null,
    packageSaving: false,
    licenceSaving: false,
    lifecycleSaving: false,
    activationSaving: false,
    revoking: false
  };

  const $ = (id) => document.getElementById(id);

  function csrfToken() {
    return document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`))
      ?.slice(CSRF_COOKIE_NAME.length + 1) || "";
  }

  class ApiError extends Error {
    constructor(status, body) {
      super(body && body.message ? body.message : "Request failed.");
      this.status = status;
      this.body = body || {};
    }
  }

  async function request(path, options = {}) {
    const method = options.method || "GET";
    const headers = {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(method === "GET" ? {} : { "x-csrf-token": csrfToken() }),
      ...(options.headers || {})
    };

    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(response.status, body);
    }
    return body;
  }

  function setText(element, value) {
    element.textContent = value == null ? "" : String(value);
  }

  function setStatus(id, message, kind) {
    const element = $(id);
    setText(element, message || "");
    element.className = kind ? `inline-status ${kind}` : "inline-status";
  }

  function setFormMessage(id, message, kind) {
    const element = $(id);
    setText(element, message || "");
    element.className = kind ? `form-message ${kind}` : "form-message";
  }

  function clearFieldErrors(prefix) {
    document.querySelectorAll(`[id^="${prefix}-"][id$="-error"]`).forEach((element) => setText(element, ""));
  }

  function placeFieldErrors(prefix, errors) {
    clearFieldErrors(prefix);
    (errors || []).forEach((error) => {
      const text = String(error || "");
      const lower = text.toLowerCase();
      let target = `${prefix}-form-message`;
      if (prefix === "package") {
        if (lower.includes("code")) target = "package-code-error";
        if (lower.includes("name")) target = "package-name-error";
        if (lower.includes("module")) target = "package-modules-error";
        if (lower.includes("channel")) target = "package-channels-error";
      } else if (prefix === "licence") {
        if (lower.includes("client")) target = "licence-client-error";
        if (lower.includes("project")) target = "licence-project-error";
        if (lower.includes("package")) target = "licence-package-error";
        if (lower.includes("module")) target = "licence-modules-error";
        if (lower.includes("channel")) target = "licence-channel-error";
        if (lower.includes("expiry") || lower.includes("date")) target = "licence-expiry-error";
      } else if (prefix === "activation") {
        if (lower.includes("expiry") || lower.includes("date")) target = "activation-expiry-error";
        if (lower.includes("redemption") || lower.includes("limit")) target = "activation-max-redemptions-error";
      }
      const element = $(target);
      if (element) {
        setText(element, element.textContent ? `${element.textContent} ${text}` : text);
      }
    });
  }

  function showError(prefix, error) {
    const details = Array.isArray(error.body && error.body.details) ? error.body.details : [];
    const message = error.status === 401
      ? "Session expired. Sign in again."
      : error.status === 403
        ? "You do not have permission for this action."
        : error.message || "Request outcome is uncertain. Inspect metadata before retrying.";
    placeFieldErrors(prefix, details);
    setFormMessage(`${prefix}-form-message`, message, "error");
  }

  function clearPlaintextCode() {
    const display = $("activation-code-display");
    if (display) {
      display.classList.add("hidden");
    }
    const plaintext = $("activation-plaintext");
    if (plaintext) {
      plaintext.textContent = "";
    }
  }

  function option(value, label) {
    const element = document.createElement("option");
    element.value = value;
    setText(element, label);
    return element;
  }

  function checkboxRow(name, value, label, checked, disabled) {
    const wrapper = document.createElement("label");
    wrapper.className = "checkbox-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = value;
    input.checked = Boolean(checked);
    input.disabled = Boolean(disabled);
    const span = document.createElement("span");
    setText(span, label);
    wrapper.append(input, span);
    return wrapper;
  }

  function renderModuleControls(containerId, name, modules, selected, disabled) {
    const container = $(containerId);
    container.replaceChildren();
    const selectedSet = new Set(selected || []);
    modules.forEach((moduleId) => {
      container.append(checkboxRow(name, moduleId, moduleId, selectedSet.has(moduleId) || disabled, disabled));
    });
  }

  function renderPackageModuleControls(selectedModules = [], selectedChannels = []) {
    renderModuleControls("package-mandatory-modules", "packageModule", state.constants.mandatoryModules, selectedModules, true);
    renderModuleControls("package-optional-modules", "packageModule", state.constants.optionalModules, selectedModules, false);
    const channelContainer = $("package-update-channels");
    channelContainer.replaceChildren();
    const selectedSet = new Set(selectedChannels || []);
    state.constants.updateChannels.forEach((channel) => {
      channelContainer.append(checkboxRow("packageChannel", channel, channel, selectedSet.has(channel), false));
    });
  }

  function selectedPackage() {
    const packageId = $("licence-package").value;
    return state.packages.find((record) => record.id === packageId) || null;
  }

  function renderLicenceModuleControls(selectedModules = []) {
    const pkg = selectedPackage();
    const allowedModules = new Set(pkg ? pkg.moduleIds : state.constants.mandatoryModules);
    const mandatory = state.constants.mandatoryModules.filter((moduleId) => allowedModules.has(moduleId));
    const optional = state.constants.optionalModules.filter((moduleId) => allowedModules.has(moduleId));
    renderModuleControls("licence-mandatory-modules", "licenceModule", mandatory, selectedModules, true);
    renderModuleControls("licence-optional-modules", "licenceModule", optional, selectedModules, false);

    const channelSelect = $("licence-update-channel");
    const current = channelSelect.value;
    channelSelect.replaceChildren(option("", "Select update channel"));
    const channels = pkg ? pkg.updateChannels : state.constants.updateChannels;
    channels.forEach((channel) => channelSelect.append(option(channel, channel)));
    channelSelect.value = channels.includes(current) ? current : "";
  }

  function selectedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
  }

  function isoDateInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function dateOrNull(value) {
    return value ? `${value}T00:00:00.000Z` : null;
  }

  function clientName(clientId) {
    return state.clients.find((client) => client.id === clientId)?.name || clientId || "No client";
  }

  function projectName(projectId) {
    return state.projects.find((project) => project.id === projectId)?.projectTitle || projectId || "No project";
  }

  function packageName(packageId) {
    return state.packages.find((pkg) => pkg.id === packageId)?.name || packageId || "No package";
  }

  function licenceLabel(licence) {
    return `${clientName(licence.clientId)} / ${projectName(licence.projectId)} / ${packageName(licence.packageId)}`;
  }

  function renderRecordList(containerId, records, emptyText, renderCard) {
    const container = $(containerId);
    container.replaceChildren();
    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      setText(empty, emptyText);
      container.append(empty);
      return;
    }
    records.forEach((record) => container.append(renderCard(record)));
  }

  function addMeta(container, text) {
    const pill = document.createElement("span");
    pill.className = "pill";
    setText(pill, text);
    container.append(pill);
  }

  function recordButton(text, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    setText(button, text);
    button.addEventListener("click", handler);
    return button;
  }

  function renderPackageCard(pkg) {
    const card = document.createElement("article");
    card.className = "record-card";
    const title = document.createElement("h3");
    setText(title, pkg.name || "Unnamed package");
    const code = document.createElement("p");
    setText(code, pkg.packageCode || "No package code");
    const meta = document.createElement("div");
    meta.className = "record-meta";
    addMeta(meta, `status: ${pkg.status}`);
    addMeta(meta, `modules: ${pkg.moduleIds.length}`);
    addMeta(meta, `channels: ${pkg.updateChannels.join(", ") || "none"}`);
    addMeta(meta, `version: ${pkg.version}`);
    const actions = document.createElement("div");
    actions.className = "record-actions";
    actions.append(
      recordButton("Edit", () => fillPackageForm(pkg)),
      recordButton("Readiness", () => checkPackageReadiness(pkg.id))
    );
    if (pkg.status === "draft") {
      actions.append(recordButton("Publish", () => publishPackage(pkg)));
    }
    card.append(title, code, meta, actions);
    return card;
  }

  function renderLicenceCard(licence) {
    const card = document.createElement("article");
    card.className = "record-card";
    const title = document.createElement("h3");
    setText(title, clientName(licence.clientId));
    const subtitle = document.createElement("p");
    setText(subtitle, `${projectName(licence.projectId)} / ${packageName(licence.packageId)}`);
    const meta = document.createElement("div");
    meta.className = "record-meta";
    addMeta(meta, `status: ${licence.status}`);
    addMeta(meta, `modules: ${licence.entitledModules.length}`);
    addMeta(meta, `channel: ${licence.updateChannel || "none"}`);
    addMeta(meta, `version: ${licence.version}`);
    const actions = document.createElement("div");
    actions.className = "record-actions";
    actions.append(
      recordButton("Edit", () => fillLicenceForm(licence)),
      recordButton("Readiness", () => checkLicenceReadiness(licence.id))
    );
    if (licence.status === "draft") {
      actions.append(recordButton("Approve", () => approveLicence(licence)));
    }
    if (licence.status === "active") {
      actions.append(recordButton("Codes", () => selectActivationLicence(licence)));
    }
    card.append(title, subtitle, meta, actions);
    return card;
  }

  function renderActivationCodeCard(code) {
    const card = document.createElement("article");
    card.className = "record-card";
    const title = document.createElement("h3");
    setText(title, `Activation code ${code.id.slice(-6)}`);
    const subtitle = document.createElement("p");
    setText(subtitle, `Expires: ${code.expiresAt ? new Date(code.expiresAt).toLocaleString() : "not set"}`);
    const meta = document.createElement("div");
    meta.className = "record-meta";
    addMeta(meta, `status: ${code.status}`);
    addMeta(meta, `redemptions: ${code.redeemedCount}/${code.maxRedemptions || "none"}`);
    addMeta(meta, `version: ${code.version}`);
    const actions = document.createElement("div");
    actions.className = "record-actions";
    if (code.status === "active" && Number(code.redeemedCount || 0) === 0) {
      actions.append(recordButton("Revoke Unused", () => revokeActivationCode(code)));
    }
    card.append(title, subtitle, meta, actions);
    return card;
  }

  function renderPagination(kind, pagination) {
    const page = pagination || { page: 1, totalPages: 0, total: 0 };
    $(`${kind}-page-summary`).textContent = `Page ${page.page} of ${page.totalPages || 1} - ${page.total} records`;
    $(`${kind}-prev`).disabled = page.page <= 1;
    $(`${kind}-next`).disabled = page.totalPages <= page.page;
  }

  async function loadPackages() {
    setStatus("package-list-status", "Loading packages...");
    try {
      const body = await request(`${API_BASE}/packages?page=${state.packagePage}&limit=10`);
      state.packages = body.packages || [];
      state.packagePagination = body.pagination;
      renderRecordList("package-list", state.packages, "No draft packages in the isolated test database.", renderPackageCard);
      renderPagination("package", state.packagePagination);
      renderPackageOptions();
      setStatus("package-list-status", "");
    } catch (error) {
      setStatus("package-list-status", error.status === 403 ? "You do not have permission to view packages." : error.message, "error");
    }
  }

  async function loadLicences() {
    setStatus("licence-list-status", "Loading licences...");
    try {
      const body = await request(`${API_BASE}/licences?page=${state.licencePage}&limit=10`);
      renderRecordList("licence-list", body.licences || [], "No draft licences in the isolated test database.", renderLicenceCard);
      state.licencePagination = body.pagination;
      renderPagination("licence", state.licencePagination);
      setStatus("licence-list-status", "");
    } catch (error) {
      setStatus("licence-list-status", error.status === 403 ? "You do not have permission to view licences." : error.message, "error");
    }
  }

  function resetPackageForm() {
    $("package-form").reset();
    $("package-id").value = "";
    $("package-version").value = "";
    $("package-form-title").textContent = "Create Draft Package";
    $("package-reload").classList.add("hidden");
    $("package-publish").classList.add("hidden");
    $("package-save").disabled = false;
    state.currentPackage = null;
    clearFieldErrors("package");
    setFormMessage("package-form-message", "");
    renderPackageModuleControls(state.constants.mandatoryModules, []);
  }

  function fillPackageForm(pkg) {
    $("package-id").value = pkg.id;
    $("package-version").value = String(pkg.version);
    $("package-code").value = pkg.packageCode || "";
    $("package-name").value = pkg.name || "";
    $("package-notes").value = pkg.notes || "";
    $("package-form-title").textContent = pkg.status === "draft" ? "Edit Draft Package" : "View Published Package";
    $("package-reload").classList.add("hidden");
    $("package-publish").classList.toggle("hidden", pkg.status !== "draft");
    $("package-save").disabled = pkg.status !== "draft";
    state.currentPackage = pkg;
    clearFieldErrors("package");
    setFormMessage("package-form-message", "");
    renderPackageModuleControls(pkg.moduleIds, pkg.updateChannels);
  }

  function packageBody() {
    return {
      packageCode: $("package-code").value,
      name: $("package-name").value,
      edition: POS_EDITION_STANDARD,
      moduleIds: selectedValues("packageModule"),
      updateChannels: selectedValues("packageChannel"),
      notes: $("package-notes").value
    };
  }

  async function savePackage(event) {
    event.preventDefault();
    if (state.packageSaving) return;
    state.packageSaving = true;
    $("package-save").disabled = true;
    clearFieldErrors("package");
    setFormMessage("package-form-message", "Saving...");
    const id = $("package-id").value;
    const body = packageBody();
    try {
      const result = id
        ? await request(`${API_BASE}/packages/${id}`, {
          method: "PATCH",
          body: { ...body, expectedVersion: Number($("package-version").value) }
        })
        : await request(`${API_BASE}/packages`, { method: "POST", body });
      const pkg = result.package;
      fillPackageForm(pkg);
      await loadPackages();
      const warning = result.audit && result.audit.ok === false ? ` Saved. ${result.audit.message}` : "Saved.";
      setFormMessage("package-form-message", warning, result.audit && result.audit.ok === false ? "warning" : "success");
    } catch (error) {
      if (error.status === 409 && id) {
        $("package-reload").classList.remove("hidden");
      }
      showError("package", error);
    } finally {
      state.packageSaving = false;
      $("package-save").disabled = false;
    }
  }

  function packageSummary(pkg) {
    return [
      `Package: ${pkg.name}`,
      `Code: ${pkg.packageCode}`,
      `Modules: ${pkg.moduleIds.join(", ") || "none"}`,
      `Channels: ${pkg.updateChannels.join(", ") || "none"}`,
      "Publishing makes this package definition immutable through draft editing."
    ].join("\n");
  }

  async function publishPackage(pkg = state.currentPackage) {
    if (!pkg || state.lifecycleSaving) return;
    if (!window.confirm(packageSummary(pkg))) return;
    state.lifecycleSaving = true;
    $("package-publish").disabled = true;
    clearPlaintextCode();
    setFormMessage("package-form-message", "Publishing...");
    try {
      const result = await request(`${API_BASE}/packages/${pkg.id}/publish`, {
        method: "POST",
        body: {
          expectedVersion: Number(pkg.version),
          reason: "Local admin publication"
        }
      });
      fillPackageForm(result.package);
      await loadPackages();
      setFormMessage("package-form-message", "Published. Draft editing is no longer available for this package.", "success");
    } catch (error) {
      if (error.status === 409) {
        $("package-reload").classList.remove("hidden");
      }
      showError("package", error);
    } finally {
      state.lifecycleSaving = false;
      $("package-publish").disabled = false;
    }
  }

  function renderClientProjectOptions() {
    const clientSelect = $("licence-client");
    const projectSelect = $("licence-project");
    const currentClient = clientSelect.value;
    const currentProject = projectSelect.value;
    clientSelect.replaceChildren(option("", "Select client"));
    state.clients.forEach((client) => clientSelect.append(option(client.id, client.name)));
    clientSelect.value = state.clients.some((client) => client.id === currentClient) ? currentClient : "";
    renderProjectOptions(currentProject);
  }

  function renderProjectOptions(currentProject = "") {
    const projectSelect = $("licence-project");
    const clientId = $("licence-client").value;
    projectSelect.replaceChildren(option("", "Select POS project"));
    state.projects
      .filter((project) => !clientId || project.clientId === clientId)
      .forEach((project) => projectSelect.append(option(project.id, project.projectTitle)));
    projectSelect.value = Array.from(projectSelect.options).some((item) => item.value === currentProject) ? currentProject : "";
  }

  function renderPackageOptions() {
    const select = $("licence-package");
    const current = select.value;
    select.replaceChildren(option("", "Select package"));
    state.packages.forEach((pkg) => select.append(option(pkg.id, `${pkg.name} (${pkg.packageCode})`)));
    select.value = state.packages.some((pkg) => pkg.id === current) ? current : "";
    renderLicenceModuleControls(selectedValues("licenceModule"));
  }

  function resetLicenceForm() {
    $("licence-form").reset();
    $("licence-id").value = "";
    $("licence-version").value = "";
    $("licence-form-title").textContent = "Create Draft Licence";
    $("licence-reload").classList.add("hidden");
    $("licence-approve").classList.add("hidden");
    $("licence-save").disabled = false;
    state.currentLicence = null;
    clearFieldErrors("licence");
    setFormMessage("licence-form-message", "");
    renderClientProjectOptions();
    renderPackageOptions();
  }

  function fillLicenceForm(licence) {
    $("licence-id").value = licence.id;
    $("licence-version").value = String(licence.version);
    $("licence-client").value = licence.clientId || "";
    renderProjectOptions(licence.projectId || "");
    $("licence-package").value = licence.packageId || "";
    $("licence-update-channel").value = licence.updateChannel || "";
    $("licence-expiry").value = isoDateInput(licence.licenceExpiry);
    $("support-expiry").value = isoDateInput(licence.supportExpiry);
    $("licence-notes").value = licence.notes || "";
    $("licence-form-title").textContent = licence.status === "draft" ? "Edit Draft Licence" : "View Approved Licence";
    $("licence-reload").classList.add("hidden");
    $("licence-approve").classList.toggle("hidden", licence.status !== "draft");
    $("licence-save").disabled = licence.status !== "draft";
    state.currentLicence = licence;
    clearFieldErrors("licence");
    setFormMessage("licence-form-message", "");
    renderLicenceModuleControls(licence.entitledModules);
    $("licence-update-channel").value = licence.updateChannel || "";
  }

  function licenceSummary(licence) {
    return [
      `Licence: ${licenceLabel(licence)}`,
      `Modules: ${licence.entitledModules.join(", ") || "none"}`,
      `Channel: ${licence.updateChannel || "none"}`,
      `Licence expiry: ${licence.licenceExpiry ? new Date(licence.licenceExpiry).toLocaleDateString() : "not set"}`,
      "Approving makes this licence eligible for future activation. It does not activate a POS installation."
    ].join("\n");
  }

  async function approveLicence(licence = state.currentLicence) {
    if (!licence || state.lifecycleSaving) return;
    if (!window.confirm(licenceSummary(licence))) return;
    state.lifecycleSaving = true;
    $("licence-approve").disabled = true;
    clearPlaintextCode();
    setFormMessage("licence-form-message", "Approving...");
    try {
      const result = await request(`${API_BASE}/licences/${licence.id}/approve`, {
        method: "POST",
        body: {
          expectedVersion: Number(licence.version),
          reason: "Local admin approval"
        }
      });
      fillLicenceForm(result.licence);
      await loadLicences();
      setFormMessage("licence-form-message", "Approved. This licence is eligible for future activation but no POS is activated.", "success");
    } catch (error) {
      if (error.status === 409) {
        $("licence-reload").classList.remove("hidden");
      }
      showError("licence", error);
    } finally {
      state.lifecycleSaving = false;
      $("licence-approve").disabled = false;
    }
  }

  function selectActivationLicence(licence) {
    clearPlaintextCode();
    state.selectedActivationLicenceId = licence.id;
    $("activation-licence-id").value = licence.id;
    $("activation-licence-display").value = licenceLabel(licence);
    setFormMessage("activation-form-message", "");
    state.activationPage = 1;
    loadActivationCodes();
  }

  async function loadActivationCodes() {
    clearPlaintextCode();
    const licenceId = state.selectedActivationLicenceId || $("activation-licence-id").value;
    renderPagination("activation", state.activationPagination || { page: 1, totalPages: 0, total: 0 });
    if (!licenceId) {
      renderRecordList("activation-code-list", [], "Select an approved licence to view activation-code metadata.", renderActivationCodeCard);
      setStatus("activation-list-status", "");
      return;
    }
    setStatus("activation-list-status", "Loading activation-code metadata...");
    try {
      const body = await request(`${API_BASE}/licences/${licenceId}/activation-codes?page=${state.activationPage}&limit=10`);
      state.activationCodes = body.activationCodes || [];
      state.activationPagination = body.pagination;
      renderRecordList("activation-code-list", state.activationCodes, "No activation-code metadata for this licence.", renderActivationCodeCard);
      renderPagination("activation", state.activationPagination);
      setStatus("activation-list-status", "");
    } catch (error) {
      setStatus("activation-list-status", error.message, "error");
    }
  }

  function activationExpiryIso(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  async function issueActivationCode(event) {
    event.preventDefault();
    if (state.activationSaving) return;
    clearPlaintextCode();
    clearFieldErrors("activation");
    const licenceId = state.selectedActivationLicenceId || $("activation-licence-id").value;
    if (!licenceId) {
      setFormMessage("activation-form-message", "Select an approved licence first.", "error");
      return;
    }
    state.activationSaving = true;
    $("activation-issue").disabled = true;
    setFormMessage("activation-form-message", "Issuing...");
    try {
      const result = await request(`${API_BASE}/licences/${licenceId}/activation-codes`, {
        method: "POST",
        body: {
          expiresAt: activationExpiryIso($("activation-expiry").value),
          maxRedemptions: $("activation-max-redemptions").value ? Number($("activation-max-redemptions").value) : undefined
        }
      });
      setText($("activation-plaintext"), result.activationCode || "");
      $("activation-code-display").classList.remove("hidden");
      setFormMessage("activation-form-message", "Issued. Plaintext is shown once.", "success");
      await loadActivationCodes();
      $("activation-code-display").classList.remove("hidden");
      setText($("activation-plaintext"), result.activationCode || "");
    } catch (error) {
      if (!error.status) {
        setFormMessage(
          "activation-form-message",
          "Request outcome is uncertain. Inspect metadata, revoke any unused code if necessary, then issue a replacement. Stored digests cannot recover plaintext.",
          "error"
        );
      } else {
        showError("activation", error);
      }
    } finally {
      state.activationSaving = false;
      $("activation-issue").disabled = false;
    }
  }

  async function revokeActivationCode(code) {
    if (state.revoking) return;
    if (!window.confirm("Revoke this unused activation code? This does not affect already redeemed codes.")) return;
    state.revoking = true;
    clearPlaintextCode();
    setFormMessage("activation-form-message", "Revoking...");
    try {
      await request(`${API_BASE}/activation-codes/${code.id}/revoke-unused`, {
        method: "POST",
        body: {}
      });
      setFormMessage("activation-form-message", "Revoked unused activation code.", "success");
      await loadActivationCodes();
    } catch (error) {
      showError("activation", error);
    } finally {
      state.revoking = false;
    }
  }

  function licenceBody() {
    const packageId = $("licence-package").value || null;
    return {
      clientId: $("licence-client").value || null,
      projectId: $("licence-project").value || null,
      packageId,
      edition: POS_EDITION_STANDARD,
      entitledModules: packageId ? selectedValues("licenceModule") : [],
      updateChannel: $("licence-update-channel").value,
      licenceExpiry: dateOrNull($("licence-expiry").value),
      supportExpiry: dateOrNull($("support-expiry").value),
      notes: $("licence-notes").value
    };
  }

  async function saveLicence(event) {
    event.preventDefault();
    if (state.licenceSaving) return;
    state.licenceSaving = true;
    $("licence-save").disabled = true;
    clearFieldErrors("licence");
    setFormMessage("licence-form-message", "Saving...");
    const id = $("licence-id").value;
    const body = licenceBody();
    try {
      const result = id
        ? await request(`${API_BASE}/licences/${id}`, {
          method: "PATCH",
          body: { ...body, expectedVersion: Number($("licence-version").value) }
        })
        : await request(`${API_BASE}/licences`, { method: "POST", body });
      fillLicenceForm(result.licence);
      await loadLicences();
      const warning = result.audit && result.audit.ok === false ? ` Saved. ${result.audit.message}` : "Saved.";
      setFormMessage("licence-form-message", warning, result.audit && result.audit.ok === false ? "warning" : "success");
    } catch (error) {
      if (error.status === 409 && id) {
        $("licence-reload").classList.remove("hidden");
      }
      showError("licence", error);
    } finally {
      state.licenceSaving = false;
      $("licence-save").disabled = false;
    }
  }

  function renderReadiness(result, recordKey) {
    const output = $("readiness-output");
    output.replaceChildren();
    const heading = document.createElement("strong");
    const readiness = result.readiness || { ready: false, errors: [] };
    setText(heading, readiness.ready ? "Ready for future issuance configuration." : "Not ready.");
    output.append(heading);
    if (result.readinessNote) {
      const note = document.createElement("p");
      setText(note, result.readinessNote);
      output.append(note);
    }
    const record = result[recordKey];
    if (record) {
      const meta = document.createElement("p");
      setText(meta, `${record.status} / version ${record.version}`);
      output.append(meta);
    }
    if (readiness.errors && readiness.errors.length) {
      const list = document.createElement("ul");
      readiness.errors.forEach((error) => {
        const item = document.createElement("li");
        setText(item, error);
        list.append(item);
      });
      output.append(list);
    }
  }

  async function checkPackageReadiness(id) {
    $("readiness-output").textContent = "Checking package readiness...";
    try {
      renderReadiness(await request(`${API_BASE}/packages/${id}/readiness`), "package");
    } catch (error) {
      $("readiness-output").textContent = error.message;
    }
  }

  async function checkLicenceReadiness(id) {
    $("readiness-output").textContent = "Checking licence readiness...";
    try {
      renderReadiness(await request(`${API_BASE}/licences/${id}/readiness`), "licence");
    } catch (error) {
      $("readiness-output").textContent = error.message;
    }
  }

  async function loadFixtureOptions() {
    const body = await request(`${FIXTURE_BASE}/options`);
    state.constants = body.constants || state.constants;
    state.clients = body.clients || [];
    state.projects = body.projects || [];
    renderPackageModuleControls(state.constants.mandatoryModules, []);
    renderClientProjectOptions();
  }

  async function login() {
    const role = $("fixture-role").value;
    try {
      const body = await request(`${FIXTURE_BASE}/login`, { method: "POST", body: { role } });
      $("session-status").textContent = `Signed in as ${body.user.role}.`;
      await loadFixtureOptions();
      await Promise.all([loadPackages(), loadLicences()]);
      resetPackageForm();
      resetLicenceForm();
    } catch (error) {
      $("session-status").textContent = error.message;
    }
  }

  async function logout() {
    await request(`${FIXTURE_BASE}/logout`, { method: "POST" }).catch(() => null);
    clearPlaintextCode();
    $("session-status").textContent = "Not signed in.";
    state.packages = [];
    state.activationCodes = [];
    state.selectedActivationLicenceId = "";
    renderRecordList("package-list", [], "Sign in to load package drafts.", renderPackageCard);
    renderRecordList("licence-list", [], "Sign in to load licence drafts.", renderLicenceCard);
    renderRecordList("activation-code-list", [], "Select an approved licence to view activation-code metadata.", renderActivationCodeCard);
    $("readiness-output").textContent = "Select a record readiness check.";
  }

  async function reloadPackageFromServer() {
    const id = $("package-id").value;
    if (!id) return;
    const body = await request(`${API_BASE}/packages/${id}`);
    fillPackageForm(body.package);
    setFormMessage("package-form-message", "Reloaded latest package values.", "success");
  }

  async function reloadLicenceFromServer() {
    const id = $("licence-id").value;
    if (!id) return;
    const body = await request(`${API_BASE}/licences/${id}`);
    fillLicenceForm(body.licence);
    setFormMessage("licence-form-message", "Reloaded latest licence values.", "success");
  }

  function bindEvents() {
    $("login-button").addEventListener("click", login);
    $("logout-button").addEventListener("click", logout);
    $("new-package-button").addEventListener("click", resetPackageForm);
    $("new-licence-button").addEventListener("click", resetLicenceForm);
    $("package-form").addEventListener("submit", savePackage);
    $("licence-form").addEventListener("submit", saveLicence);
    $("package-reload").addEventListener("click", reloadPackageFromServer);
    $("licence-reload").addEventListener("click", reloadLicenceFromServer);
    $("package-publish").addEventListener("click", () => publishPackage());
    $("licence-approve").addEventListener("click", () => approveLicence());
    $("activation-form").addEventListener("submit", issueActivationCode);
    $("activation-refresh").addEventListener("click", loadActivationCodes);
    $("activation-copy").addEventListener("click", async () => {
      const code = $("activation-plaintext").textContent;
      if (code && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        setFormMessage("activation-form-message", "Copied.", "success");
      }
    });
    $("activation-dismiss").addEventListener("click", clearPlaintextCode);
    $("package-prev").addEventListener("click", () => {
      state.packagePage = Math.max(1, state.packagePage - 1);
      loadPackages();
    });
    $("package-next").addEventListener("click", () => {
      state.packagePage += 1;
      loadPackages();
    });
    $("licence-prev").addEventListener("click", () => {
      state.licencePage = Math.max(1, state.licencePage - 1);
      loadLicences();
    });
    $("licence-next").addEventListener("click", () => {
      state.licencePage += 1;
      loadLicences();
    });
    $("activation-prev").addEventListener("click", () => {
      state.activationPage = Math.max(1, state.activationPage - 1);
      loadActivationCodes();
    });
    $("activation-next").addEventListener("click", () => {
      state.activationPage += 1;
      loadActivationCodes();
    });
    $("licence-client").addEventListener("change", () => renderProjectOptions());
    $("licence-package").addEventListener("change", () => renderLicenceModuleControls(selectedValues("licenceModule")));
    window.addEventListener("beforeunload", clearPlaintextCode);
  }

  function init() {
    bindEvents();
    resetPackageForm();
    resetLicenceForm();
    renderRecordList("package-list", [], "Sign in to load package drafts.", renderPackageCard);
    renderRecordList("licence-list", [], "Sign in to load licence drafts.", renderLicenceCard);
    renderRecordList("activation-code-list", [], "Select an approved licence to view activation-code metadata.", renderActivationCodeCard);
    renderPagination("activation", { page: 1, totalPages: 0, total: 0 });
  }

  document.addEventListener("DOMContentLoaded", init);
}());
