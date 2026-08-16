import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8f6",
          100: "#d5efe9",
          200: "#abdcd2",
          400: "#3aa892",
          500: "#1f8a75",
          600: "#166f5e",
          700: "#14594c",
          800: "#14483e",
          900: "#123c35",
        },
        ink: {
          50: "#f4f6f8",
          100: "#e4e9ef",
          200: "#cbd5e0",
          400: "#7b8b9d",
          500: "#5a6b7d",
          600: "#455564",
          700: "#364352",
          800: "#1e2a36",
          900: "#0f1720",
        },
        sand: {
          50: "#f7f5f1",
          100: "#efebe3",
          200: "#e2dbcf",
        },
        signal: {
          ok: "#1f7a4d",
          warn: "#9a6b12",
          bad: "#b42318",
        },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Segoe UI", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 1px 0 rgba(15, 23, 32, 0.04), 0 12px 32px -18px rgba(15, 23, 32, 0.28)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        draw: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
      },
      animation: {
        rise: "rise 0.55s ease-out both",
        "rise-delayed": "rise 0.55s ease-out 0.12s both",
        fade: "fade 0.45s ease-out both",
        draw: "draw 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
