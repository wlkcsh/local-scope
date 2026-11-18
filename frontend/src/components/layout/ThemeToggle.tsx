"use client";

import React, { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Moon, BookOpen } from "lucide-react";
import {
  applyThemeClass,
  readSavedTheme,
  runCircleThemeTransition,
  type ThemeMode,
} from "@/lib/theme-transition";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = readSavedTheme();
    setTheme(saved);
    applyThemeClass(saved);
  }, []);

  const handleSelectTheme = (
    newTheme: ThemeMode,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (newTheme === theme) return;

    void runCircleThemeTransition({
      originEl: event.currentTarget,
      onUpdateDom: () => {
        applyThemeClass(newTheme);
        flushSync(() => {
          setTheme(newTheme);
        });
      },
    });
  };

  if (!mounted) {
    return (
      <div
        aria-hidden="true"
        className="w-32 h-7 rounded-full bg-obsidian-card border border-obsidian-border"
      />
    );
  }

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="flex items-center p-0.5 rounded-full bg-obsidian-card border border-obsidian-border text-xs font-mono"
    >
      <button
        type="button"
        aria-pressed={theme === "dark"}
        onClick={(e) => handleSelectTheme("dark", e)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-1 focus-visible:ring-offset-obsidian-deep ${
          theme === "dark"
            ? "bg-obsidian-surface text-slate-100 shadow-sm border border-obsidian-border/80 font-bold"
            : "text-slate-400 hover:text-white"
        }`}
        title="Tactical Dark Mode (Obsidian Stealth)"
      >
        <Moon aria-hidden="true" className="w-3 h-3 text-sky-400" />
        <span className="text-[10px] tracking-wider uppercase">Dark</span>
      </button>
      <button
        type="button"
        aria-pressed={theme === "editorial"}
        onClick={(e) => handleSelectTheme("editorial", e)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-1 focus-visible:ring-offset-obsidian-deep ${
          theme === "editorial"
            ? "bg-[#EDE4D2] text-[#43282A] shadow-sm border border-[#A86438]/40 font-bold"
            : "text-slate-400 hover:text-white"
        }`}
        title="Editorial Archive Mode (Warm Cream Paper)"
      >
        <BookOpen aria-hidden="true" className="w-3 h-3 text-rust" />
        <span className="text-[10px] tracking-wider uppercase">Paper</span>
      </button>
    </div>
  );
}
