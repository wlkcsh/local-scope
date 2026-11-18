"use client";

import React, { useEffect, useState } from "react";
import { Moon, BookOpen } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "editorial">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("local-scope-theme");
    if (saved === "editorial") {
      setTheme("editorial");
      document.documentElement.classList.add("editorial");
      document.documentElement.classList.remove("dark");
    } else {
      setTheme("dark");
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("editorial");
    }
  }, []);

  const toggleTheme = (newTheme: "dark" | "editorial") => {
    setTheme(newTheme);
    localStorage.setItem("local-scope-theme", newTheme);
    if (newTheme === "editorial") {
      document.documentElement.classList.add("editorial");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("editorial");
    }
  };

  if (!mounted) {
    return (
      <div className="w-32 h-7 rounded-full bg-obsidian-card border border-obsidian-border" />
    );
  }

  return (
    <div className="flex items-center p-0.5 rounded-full bg-obsidian-card border border-obsidian-border text-xs font-mono">
      <button
        type="button"
        onClick={() => toggleTheme("dark")}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all ${
          theme === "dark"
            ? "bg-obsidian-surface text-slate-100 shadow-sm border border-obsidian-border/80 font-bold"
            : "text-slate-400 hover:text-slate-200"
        }`}
        title="Tactical Dark Mode (Obsidian Stealth)"
      >
        <Moon className="w-3 h-3 text-sky-400" />
        <span className="text-[10px] tracking-wider uppercase">Dark</span>
      </button>
      <button
        type="button"
        onClick={() => toggleTheme("editorial")}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all ${
          theme === "editorial"
            ? "bg-[#EDE4D2] text-[#43282A] shadow-sm border border-[#A86438]/40 font-bold"
            : "text-slate-400 hover:text-slate-200"
        }`}
        title="Editorial Archive Mode (Warm Cream Paper)"
      >
        <BookOpen className="w-3 h-3 text-rust" />
        <span className="text-[10px] tracking-wider uppercase">Paper</span>
      </button>
    </div>
  );
}
