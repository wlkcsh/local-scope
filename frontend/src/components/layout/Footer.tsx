import React from "react";

export function Footer() {
  return (
    <footer className="border-t border-obsidian-border py-6 mt-12 bg-obsidian-surface/60 text-slate-500 text-xs relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-rust" />
          <span>LOCAL-SCOPE • ZERO PERSISTENT RAW DEMOS • SCOPE.GG COMPATIBLE</span>
        </div>
        <div className="text-slate-500 tracking-wider">
          TICK-RATE: 64 HZ // REPLAY QUANTS: POS/2 YAW/3
        </div>
      </div>
    </footer>
  );
}
