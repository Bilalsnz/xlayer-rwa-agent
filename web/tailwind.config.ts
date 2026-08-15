import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#070b14",
        panel: "#0f1422",
        panel2: "#161c2e",
        border: "#24304a",
        accent: "#3b9eff",       // brighter electric blue
        good: "#34d399",
        warn: "#fbbf24",
        bad: "#f87171",
        muted: "#94a3b8",
      },
      boxShadow: {
        glow: "0 0 20px rgba(59, 158, 255, 0.15)",
      },
    },
  },
  plugins: [],
};
export default config;