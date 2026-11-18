import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-bodoni)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "SF Mono", "Menlo", "monospace"],
        sans: ["var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        obsidian: {
          deep: "var(--bg-obsidian-deep)",
          surface: "var(--bg-obsidian-surface)",
          card: "var(--bg-obsidian-card)",
          subtle: "var(--bg-obsidian-subtle)",
          border: "var(--border-obsidian)",
          "border-hover": "var(--border-obsidian-hover)",
          "border-active": "var(--border-obsidian-active)",
        },
        surface: {
          DEFAULT: "var(--bg-obsidian-surface)",
          hover: "var(--bg-obsidian-card)",
          subtle: "var(--bg-obsidian-subtle)",
          border: "var(--border-obsidian)",
        },
        rust: {
          DEFAULT: "var(--color-rust)",
          subtle: "var(--color-rust-subtle)",
          hover: "var(--color-rust-hover)",
          border: "var(--color-rust-border)",
        },
        cs2: {
          t: "#E58E26",
          ct: "#4A90E2",
          win: "#2ECC71",
          loss: "#E74C3C",
          accent: "#D97736",
        },
      },
    },
  },
  plugins: [],
};

export default config;
