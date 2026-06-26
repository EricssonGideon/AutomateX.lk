/* eslint-disable no-unused-vars */

    const ADMIN_TOKEN_KEY = "automatex_admin_token";
    const CLIENT_TOKEN_KEY = "automatex_client_token";
    const FALLBACK_TOKEN_KEY = "automatex_token";
    const ADMIN_USER_KEY = "automatex_admin_user";
    const CLIENT_USER_KEY = "automatex_client_user";
    const EMPLOYEE_USER_KEY = "automatex_employee_user";
    const CSRF_TOKEN_KEY = "automatex_csrf_token";
    const AUTH_STORAGE_KEYS = [
      ADMIN_TOKEN_KEY,
      CLIENT_TOKEN_KEY,
      FALLBACK_TOKEN_KEY,
      ADMIN_USER_KEY,
      CLIENT_USER_KEY,
      EMPLOYEE_USER_KEY,
      CSRF_TOKEN_KEY
    ];
    const LOGOUT_MARKER_KEY = "automatex_auth_logged_out_at";
    const LOGOUT_MARKER_TTL_MS = 15000;

    const feedback = document.getElementById("feedback");
    const loginPanel = document.getElementById("loginPanel");
    const forgotPasswordPanel = document.getElementById("forgotPasswordPanel");
    const resetPasswordPanel = document.getElementById("resetPasswordPanel");
    const signupPanel = document.getElementById("signupPanel");
    const tabLogin = document.getElementById("tabLogin");
    const tabSignup = document.getElementById("tabSignup");
    const loginSubmitButton = document.getElementById("loginSubmitButton");
    const signupSubmitButton = document.getElementById("signupSubmitButton");
    const forgotPasswordSubmitButton = document.getElementById("forgotPasswordSubmitButton");
    const resetPasswordSubmitButton = document.getElementById("resetPasswordSubmitButton");
    const resetToken = new URLSearchParams(window.location.search).get("resetToken") || "";

    function setActiveTab(tabName) {
      const loginActive = tabName === "login";
      tabLogin.className = loginActive
        ? "auth-tab rounded-2xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950"
        : "auth-tab rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-300";
      tabSignup.className = loginActive
        ? "auth-tab rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-300"
        : "auth-tab rounded-2xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950";
      loginPanel.classList.toggle("hidden", !loginActive);
      signupPanel.classList.toggle("hidden", loginActive);
      forgotPasswordPanel.classList.add("hidden");
      resetPasswordPanel.classList.add("hidden");
      clearMessage();
    }

    function showAuthPanel(panelName) {
      loginPanel.classList.toggle("hidden", panelName !== "login");
      signupPanel.classList.toggle("hidden", panelName !== "signup");
      forgotPasswordPanel.classList.toggle("hidden", panelName !== "forgot");
      resetPasswordPanel.classList.toggle("hidden", panelName !== "reset");
      tabLogin.className = panelName === "login" || panelName === "forgot" || panelName === "reset"
        ? "auth-tab rounded-2xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950"
        : "auth-tab rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-300";
      tabSignup.className = panelName === "signup"
        ? "auth-tab rounded-2xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950"
        : "auth-tab rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-300";
      clearMessage();
    }

    function showMessage(message, tone = "error") {
      feedback.textContent = message;
      feedback.className = "mt-5 rounded-2xl border px-4 py-3 text-sm";

      if (tone === "success") {
        feedback.classList.add("border-emerald-500/40", "bg-emerald-500/10", "text-emerald-200");
      } else if (tone === "info") {
        feedback.classList.add("border-cyan-500/40", "bg-cyan-500/10", "text-cyan-100");
      } else {
        feedback.classList.add("border-rose-500/40", "bg-rose-500/10", "text-rose-200");
      }
    }

    function clearMessage() {
      feedback.className = "mt-5 hidden rounded-2xl border px-4 py-3 text-sm";
      feedback.textContent = "";
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

    function clearSession(options = {}) {
      AUTH_STORAGE_KEYS.forEach(removeStoredValue);

      if (!options.preserveLogoutMarker) {
        clearLogoutMarker();
      }
    }

    function saveAdminSession(token, user, csrfToken = "") {
      clearSession();
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem(FALLBACK_TOKEN_KEY, token);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
      if (csrfToken) {
        localStorage.setItem(CSRF_TOKEN_KEY, csrfToken);
      }
    }

    function saveClientSession(token, user, csrfToken = "") {
      clearSession();
      localStorage.setItem(CLIENT_TOKEN_KEY, token);
      localStorage.setItem(FALLBACK_TOKEN_KEY, token);
      localStorage.setItem(CLIENT_USER_KEY, JSON.stringify(user));
      if (csrfToken) {
        localStorage.setItem(CSRF_TOKEN_KEY, csrfToken);
      }
    }

    function saveEmployeeSession(token, user, csrfToken = "") {
      clearSession();
      localStorage.setItem(FALLBACK_TOKEN_KEY, token);
      localStorage.setItem(EMPLOYEE_USER_KEY, JSON.stringify(user));
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

    function isEmployeeUser(user) {
      return Boolean(user && String(user.role || "").toLowerCase() === "employee");
    }

    async function verifyExistingSession() {
      if (hasRecentLogoutMarker()) {
        clearSession({ preserveLogoutMarker: true });
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

        if (isEmployeeUser(payload.user)) {
          saveEmployeeSession(token, payload.user, payload.csrfToken);
          window.location.href = "/employee.html";
          return;
        }

        saveClientSession(token, payload.user, payload.csrfToken);
        window.location.href = "/dashboard.html";
      } catch (_error) {
        clearSession({ preserveLogoutMarker: true });
      }
    }

    function setLoading(button, isLoading, loadingText, idleText) {
      button.disabled = isLoading;
      button.textContent = isLoading ? loadingText : idleText;
    }

    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.togglePassword);
        const showing = target.type === "text";
        target.type = showing ? "password" : "text";
        button.textContent = showing ? "Show" : "Hide";
      });
    });

    document.getElementById("forgotPasswordButton").addEventListener("click", () => {
      const email = document.getElementById("loginEmail").value.trim();
      document.getElementById("forgotPasswordEmail").value = email;
      showAuthPanel("forgot");
    });

    document.querySelectorAll("[data-auth-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        showAuthPanel(button.dataset.authPanel || "login");
      });
    });

    tabLogin.addEventListener("click", () => setActiveTab("login"));
    tabSignup.addEventListener("click", () => setActiveTab("signup"));

    document.getElementById("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage();
      setLoading(loginSubmitButton, true, "Signing In...", "Sign In");

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: document.getElementById("loginEmail").value.trim(),
            password: document.getElementById("loginPassword").value
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Unable to sign in right now.");
        }

        if (!payload.user || !payload.token) {
          throw new Error("Login response was incomplete. Please try again.");
        }

        if (isAdminUser(payload.user)) {
          saveAdminSession(payload.token, payload.user, payload.csrfToken);
          showMessage("Login successful. Redirecting to admin dashboard...", "success");
          window.location.href = "/admin.html";
          return;
        }

        if (isEmployeeUser(payload.user)) {
          saveEmployeeSession(payload.token, payload.user, payload.csrfToken);
          showMessage("Login successful. Redirecting to employee dashboard...", "success");
          window.location.href = "/employee.html";
          return;
        }

        saveClientSession(payload.token, payload.user, payload.csrfToken);
        showMessage(
          payload.user.accountStatus === "pending"
            ? "Login successful. Redirecting to your approval status..."
            : "Login successful. Redirecting to your dashboard...",
          "success"
        );
        window.location.href = "/dashboard.html";
      } catch (error) {
        clearSession({ preserveLogoutMarker: true });
        showMessage(error.message || "Unable to sign in right now.");
      } finally {
        setLoading(loginSubmitButton, false, "Signing In...", "Sign In");
      }
    });

    document.getElementById("signupForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage();

      const businessName = document.getElementById("signupBusinessName").value.trim();
      const ownerName = document.getElementById("signupOwnerName").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const phone = document.getElementById("signupPhone").value.trim();
      const businessType = document.getElementById("signupBusinessType").value.trim();
      const password = document.getElementById("signupPassword").value;
      const confirmPassword = document.getElementById("signupConfirmPassword").value;

      if (!businessName || !ownerName || !email || !phone || !businessType || !password || !confirmPassword) {
        showMessage("Please complete all required fields.");
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage("Please enter a valid email address.");
        return;
      }

      if (password.length < 8) {
        showMessage("Password must be at least 8 characters long.");
        return;
      }

      if (password !== confirmPassword) {
        showMessage("Password and confirm password must match.");
        return;
      }

      setLoading(signupSubmitButton, true, "Creating Account...", "Create Account");

      try {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: ownerName,
            email,
            password,
            businessName,
            businessType,
            phone
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Unable to create your account right now.");
        }

        if (!payload.user || !payload.token) {
          throw new Error("Signup response was incomplete. Please try again.");
        }

        if (isAdminUser(payload.user)) {
          saveAdminSession(payload.token, payload.user, payload.csrfToken);
          showMessage("Account created successfully. Redirecting to admin dashboard...", "success");
          window.location.href = "/admin.html";
          return;
        }

        saveClientSession(payload.token, payload.user, payload.csrfToken);
        showMessage("Account created successfully. Your account is pending admin approval. Redirecting...", "success");
        window.location.href = "/dashboard.html";
      } catch (error) {
        clearSession({ preserveLogoutMarker: true });
        showMessage(error.message || "Unable to create your account right now.");
      } finally {
        setLoading(signupSubmitButton, false, "Creating Account...", "Create Account");
      }
    });

    document.getElementById("forgotPasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage();
      const email = document.getElementById("forgotPasswordEmail").value.trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage("Please enter a valid email address.");
        return;
      }

      setLoading(forgotPasswordSubmitButton, true, "Sending...", "Send Reset Link");

      try {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Unable to request a password reset right now.");
        }
        showMessage(payload.message || "If an account exists for that email, password reset instructions will be sent shortly.", "success");
      } catch (error) {
        showMessage(error.message || "Unable to request a password reset right now.");
      } finally {
        setLoading(forgotPasswordSubmitButton, false, "Sending...", "Send Reset Link");
      }
    });

    document.getElementById("resetPasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage();
      const password = document.getElementById("resetPassword").value;
      const confirmPassword = document.getElementById("resetConfirmPassword").value;

      if (!resetToken) {
        showMessage("This password reset link is missing a token.");
        return;
      }

      if (password !== confirmPassword) {
        showMessage("Password and confirm password must match.");
        return;
      }

      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}/.test(password)) {
        showMessage("Password must be 8-128 characters and include uppercase, lowercase, and a number.");
        return;
      }

      setLoading(resetPasswordSubmitButton, true, "Resetting...", "Reset Password");

      try {
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ token: resetToken, password })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Unable to reset your password right now.");
        }
        window.history.replaceState({}, document.title, "/login.html");
        showAuthPanel("login");
        showMessage(payload.message || "Password reset successful. You can now sign in.", "success");
      } catch (error) {
        showMessage(error.message || "Unable to reset your password right now.");
      } finally {
        setLoading(resetPasswordSubmitButton, false, "Resetting...", "Reset Password");
      }
    });

    if (resetToken) {
      showAuthPanel("reset");
    } else {
      setActiveTab("login");
      verifyExistingSession();
    }
