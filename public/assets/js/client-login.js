    const OFFICIAL_ADMIN_EMAIL = "automatex100@gmail.com";
/* eslint-disable no-unused-vars */

    if (window.location.pathname.endsWith("/client-login.html")) {
      window.location.replace(`/login.html${window.location.search}${window.location.hash}`);
    }

    const ADMIN_TOKEN_KEY = "automatex_admin_token";
    const PRIMARY_TOKEN_KEY = "automatex_client_token";
    const FALLBACK_TOKEN_KEY = "automatex_token";
    const ADMIN_USER_KEY = "automatex_admin_user";
    const CLIENT_USER_KEY = "automatex_client_user";
    const CSRF_TOKEN_KEY = "automatex_csrf_token";
    const AUTH_STORAGE_KEYS = [
      ADMIN_TOKEN_KEY,
      PRIMARY_TOKEN_KEY,
      FALLBACK_TOKEN_KEY,
      ADMIN_USER_KEY,
      CLIENT_USER_KEY,
      CSRF_TOKEN_KEY
    ];
    const LOGOUT_MARKER_KEY = "automatex_auth_logged_out_at";
    const LOGOUT_MARKER_TTL_MS = 15000;
    const feedback = document.getElementById("feedback");
    const submitButton = document.getElementById("submitButton");

    function showMessage(message, tone = "error") {
      feedback.textContent = message;
      feedback.className = "mt-4 rounded-2xl border px-4 py-3 text-sm";

      if (tone === "success") {
        feedback.classList.add("border-emerald-500/40", "bg-emerald-500/10", "text-emerald-200");
      } else {
        feedback.classList.add("border-rose-500/40", "bg-rose-500/10", "text-rose-200");
      }
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

    function clearClientSession(options = {}) {
      AUTH_STORAGE_KEYS.forEach(removeStoredValue);

      if (!options.preserveLogoutMarker) {
        clearLogoutMarker();
      }
    }

    function saveAdminSession(token, user, csrfToken = "") {
      clearClientSession();
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem(FALLBACK_TOKEN_KEY, token);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
      if (csrfToken) {
        localStorage.setItem(CSRF_TOKEN_KEY, csrfToken);
      }
    }

    function saveClientSession(token, user, csrfToken = "") {
      clearClientSession();
      localStorage.setItem(PRIMARY_TOKEN_KEY, token);
      localStorage.setItem(FALLBACK_TOKEN_KEY, token);
      localStorage.setItem(CLIENT_USER_KEY, JSON.stringify(user));
      if (csrfToken) {
        localStorage.setItem(CSRF_TOKEN_KEY, csrfToken);
      }
    }

    function isOfficialAdmin(user) {
      return Boolean(
        user &&
        user.role === "admin" &&
        String(user.email || "").trim().toLowerCase() === OFFICIAL_ADMIN_EMAIL
      );
    }

    async function verifyExistingClientSession() {
      if (hasRecentLogoutMarker()) {
        clearClientSession({ preserveLogoutMarker: true });
        return;
      }

      const token = getStoredValue(PRIMARY_TOKEN_KEY) || getStoredValue(FALLBACK_TOKEN_KEY);
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

        if (isOfficialAdmin(payload.user)) {
          saveAdminSession(token, payload.user, payload.csrfToken);
          window.location.href = "/admin.html";
          return;
        }

        if (payload.user.role !== "client") {
          throw new Error("Client access required");
        }

        saveClientSession(token, payload.user, payload.csrfToken);
        window.location.href = "/dashboard.html";
      } catch (_error) {
        clearClientSession({ preserveLogoutMarker: true });
      }
    }

    document.getElementById("clientLoginForm").addEventListener("submit", async (event) => {
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
          throw new Error(payload.message || "Unable to sign in right now.");
        }

        if (!payload.user || !payload.token) {
          throw new Error("Login response was incomplete. Please try again.");
        }

        if (isOfficialAdmin(payload.user)) {
          saveAdminSession(payload.token, payload.user, payload.csrfToken);
          showMessage("Login successful. Redirecting to admin dashboard...", "success");
          window.location.href = "/admin.html";
          return;
        }

        if (payload.user.role !== "client") {
          clearClientSession({ preserveLogoutMarker: true });
          throw new Error("This account cannot access the client dashboard.");
        }

        saveClientSession(payload.token, payload.user, payload.csrfToken);
        showMessage(
          payload.user.accountStatus === "pending"
            ? "Login successful. Redirecting to your approval status..."
            : "Login successful. Redirecting...",
          "success"
        );
        window.location.href = "/dashboard.html";
      } catch (error) {
        clearClientSession({ preserveLogoutMarker: true });
        showMessage(error.message || "Unable to sign in right now.");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Sign In";
      }
    });

    verifyExistingClientSession();
