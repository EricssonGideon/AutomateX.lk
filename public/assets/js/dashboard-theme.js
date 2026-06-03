    (() => {
      const storedTheme = localStorage.getItem("automatex_dashboard_theme") || "system";
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const effectiveTheme = storedTheme === "system" ? (prefersDark ? "dark" : "light") : storedTheme;
      document.documentElement.dataset.theme = effectiveTheme;
      document.documentElement.dataset.themePreference = storedTheme;
    })();