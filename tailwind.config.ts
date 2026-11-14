import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.25rem" }],
        sm: ["0.9375rem", { lineHeight: "1.5rem" }],
      },
      colors: {
        ink: "#101828",
        muted: "#667085",
        canvas: "#f4f6fa",
        line: "#e3e8f0",
        brand: "#4765e8",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        soft: "0 12px 32px rgba(23, 37, 84, .06), 0 2px 8px rgba(23, 37, 84, .035)",
      },
    },
  },
  plugins: [],
};

export default config;
