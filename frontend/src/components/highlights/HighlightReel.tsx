"use client";

import React, { useState } from "react";
import { Sparkles, Filter } from "lucide-react";
import { HighlightRow, PlayerMatchStatRow } from "@/lib/types";
import { HighlightCard } from "./HighlightCard";
import { TacticalSelect, TacticalSelectOption } from "@/components/ui/TacticalSelect";

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

          <TacticalSelect
            value={filterType}
            ariaLabel="Filter highlights by type"
            onChange={(val) => setFilterType(val)}
            icon={<Filter className="w-3.5 h-3.5" />}
            minMenuWidth={230}
            options={((): TacticalSelectOption[] => {
              const scoped = onlyFocused && focusedSteamid
                ? highlights.filter((h) => h.steamid === focusedSteamid)
                : highlights;
              const count = (t: string) =>
                t === "all" ? scoped.length : scoped.filter((h) => h.type === t).length;
              return [
                { value: "all", label: "ALL HIGHLIGHTS", badge: String(count("all")) },
                { value: "ace", label: "ACES", dotClassName: "bg-amber-500", badge: String(count("ace")) },
                { value: "4k", label: "4Ks", dotClassName: "bg-amber-400", badge: String(count("4k")) },
                { value: "3k", label: "3Ks", dotClassName: "bg-rust", badge: String(count("3k")) },
                { value: "clutch", label: "CLUTCHES", dotClassName: "bg-emerald-500", badge: String(count("clutch")) },
                { value: "spray_transfer", label: "SPRAY TRANSFERS", dotClassName: "bg-sky-400", badge: String(count("spray_transfer")) },
                { value: "wallbang", label: "WALLBANGS", dotClassName: "bg-rose-500", badge: String(count("wallbang")) },
                { value: "noscope", label: "NOSCOPES", dotClassName: "bg-purple-400", badge: String(count("noscope")) },
              ];
            })()}
          />
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
