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
          t: "var(--color-cs2-t)",
          ct: "var(--color-cs2-ct)",
          win: "var(--color-cs2-win)",
          loss: "var(--color-cs2-loss)",
          accent: "var(--color-rust)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
