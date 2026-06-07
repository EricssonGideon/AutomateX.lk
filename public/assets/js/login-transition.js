(() => {
  const transitionControllerKey = "__automatexLoginTransition";

  if (window[transitionControllerKey]?.initialized) {
    window[transitionControllerKey].reset?.();
    return;
  }

  const transitionController = {
    initialized: false,
    reset: null
  };
  window[transitionControllerKey] = transitionController;

  const loginSelector = 'a[href$="login.html"], a[href="/login.html"], a[data-login-transition="glass"]';
  const transitionElementSelector = ".login-glass-transition";
  const prefetchedTargets = new Set();
  let transitionActive = false;
  let activeOverlay = null;
  let waitingTimer = 0;
  let navigationTimer = 0;

  function clearTimers() {
    if (waitingTimer) {
      window.clearTimeout(waitingTimer);
      waitingTimer = 0;
    }

    if (navigationTimer) {
      window.clearTimeout(navigationTimer);
      navigationTimer = 0;
    }
  }

  function closeMobileMenu() {
    const siteHeader = document.querySelector(".site-header");
    const mobileMenuToggle = document.querySelector(".mobile-menu-toggle");
    const primaryNav = document.getElementById("primaryNav");

    if (!siteHeader || !mobileMenuToggle || !primaryNav) {
      return;
    }

    siteHeader.classList.remove("nav-open");
    mobileMenuToggle.setAttribute("aria-expanded", "false");
    mobileMenuToggle.setAttribute("aria-label", "Open navigation menu");
    primaryNav.style.maxHeight = "";
    primaryNav.style.paddingTop = "";
    primaryNav.style.borderTopColor = "";
    primaryNav.style.opacity = "";
    primaryNav.style.pointerEvents = "";
  }

  function resetLoginTransitionState() {
    transitionActive = false;
    activeOverlay = null;
    clearTimers();

    document.querySelectorAll(transitionElementSelector).forEach((element) => {
      element.remove();
    });

    document.querySelectorAll(loginSelector).forEach((link) => {
      link.style.pointerEvents = "";
      link.removeAttribute("aria-disabled");
    });

    closeMobileMenu();
  }

  transitionController.reset = resetLoginTransitionState;

  function getTargetUrl(link) {
    try {
      return new URL(link.dataset.loginTarget || link.getAttribute("href") || link.href, window.location.href).href;
    } catch {
      return link.href;
    }
  }

  function prefetchLoginPage(targetUrl) {
    if (!targetUrl || prefetchedTargets.has(targetUrl)) {
      return;
    }

    try {
      const target = new URL(targetUrl, window.location.href);

      if (target.origin !== window.location.origin) {
        return;
      }

      prefetchedTargets.add(targetUrl);

      const prefetchLink = document.createElement("link");
      prefetchLink.rel = "prefetch";
      prefetchLink.as = "document";
      prefetchLink.href = target.href;
      document.head.appendChild(prefetchLink);
    } catch {
      // Navigation still proceeds normally if prefetch is unavailable.
    }
  }

  function shouldUseSimpleFade() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const slowConnection = Boolean(
      connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g"
    );
    const lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
    const lowCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2;

    return Boolean(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 767px), (pointer: coarse)").matches ||
      slowConnection ||
      lowMemory ||
      lowCpu
    );
  }

  function getCrackOrigin(link) {
    const rect = link.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function buildCrackRays(cracks) {
    [
      { angle: "-148deg", length: "32vw", delay: "0.02s" },
      { angle: "-105deg", length: "28vw", delay: "0.04s" },
      { angle: "-56deg", length: "34vw", delay: "0.03s" },
      { angle: "-8deg", length: "36vw", delay: "0.05s" },
      { angle: "42deg", length: "30vw", delay: "0.04s" },
      { angle: "92deg", length: "33vw", delay: "0.06s" },
      { angle: "154deg", length: "27vw", delay: "0.03s" }
    ].forEach((pattern) => {
      const ray = document.createElement("span");
      ray.style.setProperty("--angle", pattern.angle);
      ray.style.setProperty("--ray-length", pattern.length);
      ray.style.setProperty("--ray-delay", pattern.delay);
      cracks.appendChild(ray);
    });
  }

  function buildLoginTransition(link) {
    const simpleFade = shouldUseSimpleFade();
    const origin = getCrackOrigin(link);
    const overlay = document.createElement("div");
    overlay.className = `login-glass-transition${simpleFade ? " simple-fade" : ""}`;
    overlay.style.setProperty("--crack-x", `${Math.round(origin.x)}px`);
    overlay.style.setProperty("--crack-y", `${Math.round(origin.y)}px`);

    if (!simpleFade) {
      const cracks = document.createElement("div");
      cracks.className = "login-glass-cracks";
      buildCrackRays(cracks);
      overlay.appendChild(cracks);
    }

    const status = document.createElement("div");
    status.className = "login-transition-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Opening secure login...";
    overlay.appendChild(status);

    return overlay;
  }

  function navigateNow(targetUrl) {
    window.location.assign(targetUrl);
  }

  function isStandardSameTabClick(event, link) {
    return Boolean(
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      (!link.target || link.target === "_self")
    );
  }

  function startLoginTransition(event, link) {
    if (!isStandardSameTabClick(event, link)) {
      return;
    }

    const targetUrl = getTargetUrl(link);

    if (!targetUrl) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    prefetchLoginPage(targetUrl);

    if (transitionActive) {
      navigateNow(targetUrl);
      return;
    }

    try {
      transitionActive = true;
      closeMobileMenu();

      activeOverlay = buildLoginTransition(link);
      document.body.appendChild(activeOverlay);
      activeOverlay.getBoundingClientRect();
      activeOverlay.classList.add("is-active");

      waitingTimer = window.setTimeout(() => {
        activeOverlay?.classList.add("is-waiting");
      }, 520);

      navigationTimer = window.setTimeout(() => {
        navigateNow(targetUrl);
      }, 0);
    } catch {
      resetLoginTransitionState();
      navigateNow(targetUrl);
    }
  }

  function prepareLoginLinks() {
    document.querySelectorAll(loginSelector).forEach((link) => {
      const targetUrl = getTargetUrl(link);

      link.dataset.loginTarget = targetUrl;
      link.dataset.loginTransition = "glass";
      link.style.pointerEvents = "";
      link.removeAttribute("aria-disabled");

      if (link.dataset.loginTransitionBound !== "true") {
        link.addEventListener("pointerdown", () => prefetchLoginPage(targetUrl), { passive: true });
        link.addEventListener("mouseenter", () => prefetchLoginPage(targetUrl), { passive: true });
        link.addEventListener("touchstart", () => prefetchLoginPage(targetUrl), { passive: true });
        link.dataset.loginTransitionBound = "true";
      }
    });
  }

  function handleLoginClick(event) {
    const clickedElement = event.target?.closest ? event.target : event.target?.parentElement;
    const link = clickedElement ? clickedElement.closest(loginSelector) : null;

    if (link) {
      startLoginTransition(event, link);
    }
  }

  prepareLoginLinks();

  document.addEventListener("click", handleLoginClick, true);
  document.addEventListener("DOMContentLoaded", prepareLoginLinks);
  window.addEventListener("pageshow", () => {
    resetLoginTransitionState();
    prepareLoginLinks();
  });
  window.addEventListener("pagehide", resetLoginTransitionState);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !document.querySelector(transitionElementSelector)) {
      resetLoginTransitionState();
      prepareLoginLinks();
    }
  });

  transitionController.initialized = true;
})();
