import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0b0f",
        panel: "#12141c",
        panel2: "#1a1d28",
        border: "#262a38",
        accent: "#5b8cff",
        good: "#3ddc97",
        warn: "#ffcc66",
        bad: "#ff6b6b",
        muted: "#8b91a7",
      },
    },
  },
  plugins: [],
};
export default config;
