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
  const transitionElementSelector = [
    ".login-glass-transition",
    ".login-glass-shards",
    ".login-glass-shards > span",
    ".login-glass-cracks",
    ".login-homepage-clone",
    ".login-transition-overlay",
    ".login-transition-root",
    ".login-transition-shard",
    ".login-transition-snapshot"
  ].join(",");
  const transitionClassNames = [
    "login-transition-active",
    "login-transition-lock",
    "login-transitioning",
    "is-login-transitioning"
  ];
  let transitionActive = false;
  let activeFallbackTimer = 0;
  let activeOverlay = null;
  let activeTransitionAudio = null;
  let activeAudioStopTimer = 0;

  function clearTransitionTimer() {
    if (activeFallbackTimer) {
      window.clearTimeout(activeFallbackTimer);
      activeFallbackTimer = 0;
    }
  }

  function clearTransitionSound() {
    if (activeAudioStopTimer) {
      window.clearTimeout(activeAudioStopTimer);
      activeAudioStopTimer = 0;
    }

    if (activeTransitionAudio) {
      activeTransitionAudio.pause();
      activeTransitionAudio.removeAttribute("src");
      activeTransitionAudio.load();
      activeTransitionAudio = null;
    }
  }

  function playTransitionSound(reducedMotion) {
    if (reducedMotion || activeTransitionAudio) {
      return;
    }

    try {
      const audio = new Audio("/assets/audio/glass-transition.mp3");
      audio.volume = 0.22;
      activeTransitionAudio = audio;

      activeAudioStopTimer = window.setTimeout(() => {
        clearTransitionSound();
      }, 1500);

      const playPromise = audio.play();

      if (playPromise?.catch) {
        playPromise.catch(() => {
          clearTransitionSound();
        });
      }
    } catch (error) {
      clearTransitionSound();
    }
  }

  function resetLoginTransitionState() {
    transitionActive = false;
    activeOverlay = null;
    clearTransitionTimer();
    clearTransitionSound();

    document.querySelectorAll(transitionElementSelector).forEach((element) => {
      element.remove();
    });

    transitionClassNames.forEach((className) => {
      document.documentElement.classList.remove(className);
      document.body?.classList.remove(className);
    });

    document.querySelectorAll(loginSelector).forEach((link) => {
      link.style.pointerEvents = "";
      link.removeAttribute("aria-disabled");
    });

    closeMobileMenu();
  }

  transitionController.reset = resetLoginTransitionState;

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

  function navigateToLogin(targetUrl) {
    transitionActive = false;
    activeOverlay = null;
    clearTransitionTimer();
    window.location.assign(targetUrl);
  }

  function getCrackOrigin(link) {
    const rect = link.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function buildHomepageClone(scrollY) {
    const cloneRoot = document.createElement("div");
    cloneRoot.className = "login-homepage-clone";
    cloneRoot.style.setProperty("--snapshot-offset", `${scrollY * -1}px`);
    cloneRoot.style.setProperty("--snapshot-height", `${Math.max(document.documentElement.scrollHeight, window.innerHeight)}px`);

    Array.from(document.body.children).forEach((child) => {
      if (
        child.matches("script") ||
        child.classList.contains("login-glass-transition")
      ) {
        return;
      }

      cloneRoot.appendChild(child.cloneNode(true));
    });

    return cloneRoot;
  }

  function buildCrackRays(cracks) {
    [
      { angle: "-156deg", length: "34vw", delay: "0.1s" },
      { angle: "-126deg", length: "42vw", delay: "0.13s" },
      { angle: "-98deg", length: "31vw", delay: "0.16s" },
      { angle: "-64deg", length: "44vw", delay: "0.11s" },
      { angle: "-28deg", length: "38vw", delay: "0.15s" },
      { angle: "8deg", length: "46vw", delay: "0.12s" },
      { angle: "34deg", length: "36vw", delay: "0.18s" },
      { angle: "72deg", length: "45vw", delay: "0.14s" },
      { angle: "112deg", length: "40vw", delay: "0.17s" },
      { angle: "148deg", length: "32vw", delay: "0.13s" }
    ].forEach((pattern) => {
      const ray = document.createElement("span");
      ray.style.setProperty("--angle", pattern.angle);
      ray.style.setProperty("--ray-length", pattern.length);
      ray.style.setProperty("--ray-delay", pattern.delay);
      cracks.appendChild(ray);
    });
  }

  function buildGlassTransition(targetUrl, reducedMotion, origin) {
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const overlay = document.createElement("div");
    overlay.className = `login-glass-transition${reducedMotion ? " reduced-motion" : ""}`;
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.setProperty("--crack-x", `${Math.round(origin.x)}px`);
    overlay.style.setProperty("--crack-y", `${Math.round(origin.y)}px`);

    const loginPreview = document.createElement("iframe");
    loginPreview.className = "login-page-preview";
    loginPreview.src = targetUrl;
    loginPreview.tabIndex = -1;
    loginPreview.setAttribute("aria-hidden", "true");
    loginPreview.setAttribute("title", "");
    overlay.appendChild(loginPreview);

    const shards = document.createElement("div");
    shards.className = "login-glass-shards";

    const cracks = document.createElement("div");
    cracks.className = "login-glass-cracks";

    if (!reducedMotion) {
      [
        { clip: "polygon(0 0, 28% 0, 22% 46%, 0 58%)", x: "-28vw", y: "118vh", r: "-14deg", d: "0.4s", s: "0.992" },
        { clip: "polygon(28% 0, 56% 0, 49% 38%, 22% 46%)", x: "-10vw", y: "122vh", r: "9deg", d: "0.42s", s: "0.988" },
        { clip: "polygon(56% 0, 100% 0, 100% 45%, 49% 38%)", x: "26vw", y: "120vh", r: "-10deg", d: "0.41s", s: "0.994" },
        { clip: "polygon(0 58%, 22% 46%, 37% 78%, 0 100%)", x: "-24vw", y: "128vh", r: "13deg", d: "0.44s", s: "0.99" },
        { clip: "polygon(22% 46%, 49% 38%, 51% 72%, 37% 78%)", x: "-5vw", y: "126vh", r: "-20deg", d: "0.38s", s: "0.986" },
        { clip: "polygon(49% 38%, 100% 45%, 100% 82%, 51% 72%)", x: "24vw", y: "128vh", r: "18deg", d: "0.43s", s: "0.991" },
        { clip: "polygon(0 100%, 37% 78%, 50% 100%)", x: "-14vw", y: "134vh", r: "-8deg", d: "0.45s", s: "0.996" },
        { clip: "polygon(37% 78%, 51% 72%, 50% 100%)", x: "0vw", y: "132vh", r: "16deg", d: "0.41s", s: "0.989" },
        { clip: "polygon(51% 72%, 100% 82%, 100% 100%, 50% 100%)", x: "20vw", y: "136vh", r: "-17deg", d: "0.44s", s: "0.993" },
        { clip: "polygon(22% 46%, 100% 45%, 51% 72%, 37% 78%)", x: "4vw", y: "130vh", r: "6deg", d: "0.39s", s: "0.987" }
      ].forEach((pattern) => {
        const shard = document.createElement("span");
        shard.style.setProperty("--clip", pattern.clip);
        shard.style.setProperty("--drop-x", pattern.x);
        shard.style.setProperty("--drop-y", pattern.y);
        shard.style.setProperty("--rotate", pattern.r);
        shard.style.setProperty("--delay", pattern.d);
        shard.style.setProperty("--scale", pattern.s);
        shard.appendChild(buildHomepageClone(scrollY));
        shards.appendChild(shard);
      });
    } else {
      const stillSnapshot = document.createElement("span");
      stillSnapshot.style.setProperty("--clip", "inset(0)");
      stillSnapshot.appendChild(buildHomepageClone(scrollY));
      shards.appendChild(stillSnapshot);
    }

    buildCrackRays(cracks);
    overlay.appendChild(shards);
    overlay.appendChild(cracks);

    return overlay;
  }

  function startLoginTransition(event, link) {
    const targetUrl = link.dataset.loginTarget || link.href;

    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    if (!targetUrl) {
      resetLoginTransitionState();
      return;
    }

    if (transitionActive && !document.querySelector(".login-glass-transition")) {
      resetLoginTransitionState();
    }

    if (transitionActive) {
      return;
    }

    let overlay;

    try {
      resetLoginTransitionState();
      const origin = getCrackOrigin(link);
      transitionActive = true;
      closeMobileMenu();

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      overlay = buildGlassTransition(targetUrl, reducedMotion, origin);
      activeOverlay = overlay;
      document.body.appendChild(overlay);
      playTransitionSound(reducedMotion);

      let finished = false;
      let completedShardAnimations = 0;
      const shardCount = overlay.querySelectorAll(".login-glass-shards > span").length;
      const navigationDelay = reducedMotion ? 300 : 1320;
      const finishTransition = () => {
        if (finished) {
          return;
        }

        finished = true;
        navigateToLogin(targetUrl);
      };
      activeFallbackTimer = window.setTimeout(finishTransition, navigationDelay + 300);

      window.addEventListener(
        "pagehide",
        () => {
          resetLoginTransitionState();
        },
        { once: true }
      );

      overlay.addEventListener("animationend", (animationEvent) => {
        if (
          animationEvent.animationName !== "shardDrop" &&
          animationEvent.animationName !== "snapshotFade"
        ) {
          return;
        }

        completedShardAnimations += 1;

        if (completedShardAnimations >= shardCount) {
          finishTransition();
        }
      });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (activeOverlay === overlay && document.body.contains(overlay)) {
            overlay.classList.add("is-active");
          }
        });
      });
    } catch (error) {
      resetLoginTransitionState();
      navigateToLogin(targetUrl);
    }
  }

  function prepareLoginLinks() {
    document.querySelectorAll(loginSelector).forEach((link) => {
      const targetUrl = link.href;

      link.dataset.loginTarget = targetUrl;
      link.dataset.loginTransition = "glass";
      link.style.pointerEvents = "";
      link.removeAttribute("aria-disabled");

      if (link.dataset.loginTransitionBound !== "true") {
        link.addEventListener("pointerdown", handleLoginActivation, true);
        link.addEventListener("click", handleLoginActivation, true);
        link.dataset.loginTransitionBound = "true";
      }
    });
  }

  function handlePageShow() {
    resetLoginTransitionState();
    prepareLoginLinks();
  }

  prepareLoginLinks();

  document.addEventListener("DOMContentLoaded", () => {
    resetLoginTransitionState();
    prepareLoginLinks();
  });

  window.addEventListener("pageshow", handlePageShow);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !document.querySelector(".login-glass-transition")) {
      resetLoginTransitionState();
      prepareLoginLinks();
    }
  });

  function handleLoginActivation(event) {
    if (event.type === "pointerdown" && event.button && event.button !== 0) {
      return;
    }

    const clickedElement = event.target?.closest ? event.target : event.target?.parentElement;
    const link = clickedElement ? clickedElement.closest(loginSelector) : null;

    if (link) {
      startLoginTransition(event, link);
    }
  }

  window.addEventListener(
    "pointerdown",
    handleLoginActivation,
    true
  );

  window.addEventListener(
    "click",
    (event) => {
      const clickedElement = event.target?.closest ? event.target : event.target?.parentElement;
      const link = clickedElement ? clickedElement.closest(loginSelector) : null;

      if (link) {
        startLoginTransition(event, link);
      }
    },
    true
  );

  transitionController.initialized = true;
})();
