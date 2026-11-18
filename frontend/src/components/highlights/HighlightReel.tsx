"use client";

import React, { useState } from "react";
import { Sparkles, Filter } from "lucide-react";
import { HighlightRow, PlayerMatchStatRow } from "@/lib/types";
import { HighlightCard } from "./HighlightCard";

interface HighlightReelProps {
  highlights: HighlightRow[];
  playerStats: PlayerMatchStatRow[];
  demoUrl?: string | null;
  focusedSteamid?: string | null;
}

export function HighlightReel({
  highlights,
  playerStats,
  demoUrl,
  focusedSteamid,
}: HighlightReelProps) {
  const [filterType, setFilterType] = useState<string>("all");
  const [onlyFocused, setOnlyFocused] = useState<boolean>(false);

  // Map steamid to player name
  const playerNames = new Map<string, string>();
  for (const p of playerStats) {
    playerNames.set(p.steamid, p.name);
  }

  const filteredHighlights = highlights.filter((h) => {
    if (onlyFocused && focusedSteamid && h.steamid !== focusedSteamid) {
      return false;
    }
    if (filterType !== "all" && h.type !== filterType) {
      return false;
    }
    return true;
  });

  return (
    <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-5 relative overflow-hidden backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-obsidian-border gap-3">
        <div>
          <div className="label-rust text-[10px] tracking-[0.22em] font-bold mb-0.5">
            EXCEPTIONAL COMBAT
          </div>
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="font-display text-base font-medium tracking-wide text-white uppercase">
              Highlight Reel
            </h3>
            <span className="telemetry-tag font-mono">
              {filteredHighlights.length} RECORDED
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {focusedSteamid && (
            <button
              onClick={() => setOnlyFocused(!onlyFocused)}
              className={`px-2.5 py-1 rounded border font-mono text-[11px] transition-colors ${
                onlyFocused
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold"
                  : "bg-obsidian-surface border-obsidian-border text-slate-400 hover:text-slate-200"
              }`}
            >
              SUBJECT ONLY
            </button>
          )}

          <div className="flex items-center gap-1 bg-obsidian-surface border border-obsidian-border rounded p-0.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <select
              value={filterType}
              aria-label="Filter highlights by type"
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-transparent text-slate-300 py-0.5 px-2 text-xs font-mono focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-obsidian-deep">ALL HIGHLIGHTS</option>
              <option value="ace" className="bg-obsidian-deep">ACES</option>
              <option value="4k" className="bg-obsidian-deep">4Ks</option>
              <option value="3k" className="bg-obsidian-deep">3Ks</option>
              <option value="clutch" className="bg-obsidian-deep">CLUTCHES</option>
              <option value="spray_transfer" className="bg-obsidian-deep">SPRAY TRANSFERS</option>
              <option value="wallbang" className="bg-obsidian-deep">WALLBANGS</option>
              <option value="noscope" className="bg-obsidian-deep">NOSCOPES</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {filteredHighlights.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-slate-400">
            NO HIGHLIGHTS RECORDED FOR CURRENT FILTER SELECTION.
          </div>
        ) : (
          filteredHighlights.map((hl) => (
            <HighlightCard
              key={hl.id}
              highlight={hl}
              playerName={playerNames.get(hl.steamid) || hl.steamid.slice(-6)}
              demoUrl={demoUrl}
            />
          ))
        )}
      </div>
    </div>
  );
}
