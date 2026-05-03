import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        basin: {
          black: "#030607",
          panel: "#101821",
          panel2: "#151f2b",
          border: "#2a3545",
          text: "#f8f3ea",
          muted: "#9aa7bb",
          green: "#45d36f",
          gold: "#d99a2b",
          red: "#ef6464",
          blue: "#71aaff",
          teal: "#29d6c2"
        }
      },
      boxShadow: {
        terminal: "0 22px 65px rgba(0,0,0,.45)"
      },
      fontFamily: {
        sans: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
