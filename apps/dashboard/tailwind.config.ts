import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f7f4",
          100: "#dceee6",
          500: "#1f6b4f",
          600: "#185a42",
          700: "#124833",
          900: "#0b2a1e",
        },
        ink: {
          50: "#f6f7f8",
          100: "#e8eaed",
          500: "#5b6470",
          700: "#2c333d",
          900: "#12151a",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Segoe UI", "sans-serif"],
        display: ["var(--font-geist-sans)", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
