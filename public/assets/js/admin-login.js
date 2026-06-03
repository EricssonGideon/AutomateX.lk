/* eslint-disable no-unused-vars */

    const ADMIN_TOKEN_KEY = "automatex_admin_token";
    const CLIENT_TOKEN_KEY = "automatex_client_token";
    const FALLBACK_TOKEN_KEY = "automatex_token";
    const ADMIN_USER_KEY = "automatex_admin_user";
    const CLIENT_USER_KEY = "automatex_client_user";
    const CSRF_TOKEN_KEY = "automatex_csrf_token";
    const AUTH_STORAGE_KEYS = [
      ADMIN_TOKEN_KEY,
      CLIENT_TOKEN_KEY,
      FALLBACK_TOKEN_KEY,
      ADMIN_USER_KEY,
      CLIENT_USER_KEY,
      CSRF_TOKEN_KEY
    ];
    const LOGOUT_MARKER_KEY = "automatex_auth_logged_out_at";
    const LOGOUT_MARKER_TTL_MS = 15000;
    const feedback = document.getElementById("feedback");
    const submitButton = document.getElementById("submitButton");

    function showError(message) {
      feedback.textContent = message;
      feedback.classList.remove("hidden");
    }

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

    function hasRecentLogoutMarker() {
      const timestamps = [localStorage.getItem(LOGOUT_MARKER_KEY), sessionStorage.getItem(LOGOUT_MARKER_KEY)]
        .map((value) => Number(value || 0))
        .filter(Boolean);

      if (!timestamps.length) {
        return false;
      }

      if (Date.now() - Math.max(...timestamps) < LOGOUT_MARKER_TTL_MS) {
        return true;
      }

      clearLogoutMarker();
      return false;
    }

    function clearSessions(options = {}) {
      AUTH_STORAGE_KEYS.forEach(removeStoredValue);

      if (!options.preserveLogoutMarker) {
        clearLogoutMarker();
      }
    }

    function saveAdminSession(token, user, csrfToken = "") {
      clearSessions();
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem(FALLBACK_TOKEN_KEY, token);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
      if (csrfToken) {
        localStorage.setItem(CSRF_TOKEN_KEY, csrfToken);
      }
    }

    function saveClientSession(token, user, csrfToken = "") {
      clearSessions();
      localStorage.setItem(CLIENT_TOKEN_KEY, token);
      localStorage.setItem(FALLBACK_TOKEN_KEY, token);
      localStorage.setItem(CLIENT_USER_KEY, JSON.stringify(user));
      if (csrfToken) {
        localStorage.setItem(CSRF_TOKEN_KEY, csrfToken);
      }
    }

    function getExistingToken() {
      return getStoredValue(FALLBACK_TOKEN_KEY) ||
        getStoredValue(ADMIN_TOKEN_KEY) ||
        getStoredValue(CLIENT_TOKEN_KEY) ||
        "";
    }

    function isAdminUser(user) {
      return Boolean(user && ["admin", "manager", "staff"].includes(String(user.role || "").toLowerCase()));
    }

    async function verifyExistingAdminSession() {
      if (hasRecentLogoutMarker()) {
        clearSessions({ preserveLogoutMarker: true });
        return;
      }

      const token = getExistingToken();
      if (!token) {
        return;
      }

      try {
        const response = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error("Session invalid");
        }

        const payload = await response.json();
        if (!payload.user) {
          throw new Error("Session invalid");
        }

        if (isAdminUser(payload.user)) {
          saveAdminSession(token, payload.user, payload.csrfToken);
          window.location.href = "/admin.html";
          return;
        }

        saveClientSession(token, payload.user, payload.csrfToken);
        window.location.href = "/dashboard.html";
      } catch (_error) {
        clearSessions({ preserveLogoutMarker: true });
      }
    }

    document.getElementById("adminLoginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      feedback.classList.add("hidden");
      submitButton.disabled = true;
      submitButton.textContent = "Signing In...";

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Unable to sign in.");
        }

        if (!payload.user || !payload.token) {
          throw new Error("Login response was incomplete. Please try again.");
        }

        if (isAdminUser(payload.user)) {
          saveAdminSession(payload.token, payload.user, payload.csrfToken);
          window.location.href = "/admin.html";
          return;
        }

        saveClientSession(payload.token, payload.user, payload.csrfToken);
        window.location.href = "/dashboard.html";
      } catch (error) {
        clearSessions({ preserveLogoutMarker: true });
        showError(error.message || "Unable to sign in.");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Sign In";
      }
    });

    verifyExistingAdminSession();
