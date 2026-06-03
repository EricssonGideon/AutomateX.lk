const systemSans = [
  "Inter",
  "ui-sans-serif",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "\"Segoe UI\"",
  "sans-serif"
];

module.exports = {
  content: [
    "./public/*.html",
    "./public/assets/js/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: systemSans,
        display: systemSans
      },
      colors: {
        ink: "#08111f",
        mist: "#eef4ff",
        line: "rgba(148, 163, 184, 0.22)",
        brand: "#ff6b3d",
        brandSoft: "#ff8f6a",
        aqua: "#7dd3fc",
        navy: "#0c1a2f"
      },
      boxShadow: {
        glow: "0 30px 80px rgba(8, 17, 31, 0.22)",
        float: "0 18px 40px rgba(8, 17, 31, 0.14)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-14px)" }
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "0.9", transform: "scale(1.08)" }
        },
        premiumZoom: {
          "0%, 100%": { transform: "scale(1.02)" },
          "50%": { transform: "scale(1.035)" }
        },
        badgeFloat: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" }
        },
        pulseSoft: {
          "0%, 100%": { transform: "scale(1)", boxShadow: "0 12px 24px rgba(255, 107, 61, 0.18)" },
          "50%": { transform: "scale(1.04)", boxShadow: "0 18px 34px rgba(255, 107, 61, 0.28)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.8s ease forwards",
        float: "float 7s ease-in-out infinite",
        pulseGlow: "pulseGlow 7s ease-in-out infinite",
        premiumZoom: "premiumZoom 4.5s ease-in-out infinite",
        badgeFloat: "badgeFloat 3s ease-in-out infinite",
        pulseSoft: "pulseSoft 0.9s ease-in-out"
      }
    }
  }
};
