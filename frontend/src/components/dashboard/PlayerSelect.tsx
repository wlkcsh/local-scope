"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { User, Shield } from "lucide-react";
import { PlayerMatchStatRow } from "@/lib/types";

interface PlayerSelectProps {
  playerStats: PlayerMatchStatRow[];
  selectedSteamid: string;
  teamAName: string;
  teamBName: string;
}

export function PlayerSelect({
  playerStats,
  selectedSteamid,
  teamAName,
  teamBName,
}: PlayerSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = (steamid: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("player", steamid);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const teamAPlayers = playerStats.filter((p) => p.team === "A");
  const teamBPlayers = playerStats.filter((p) => p.team === "B");

  const renderPlayerTab = (p: PlayerMatchStatRow) => {
    const isSelected = p.steamid === selectedSteamid;
    const isTeamA = p.team === "A";

    return (
      <button
        key={p.steamid}
        onClick={() => handleSelect(p.steamid)}
        aria-pressed={isSelected}
        className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-left transition-all ${
          isSelected
            ? isTeamA
              ? "bg-blue-950/50 border-blue-500/80 text-white shadow-lg shadow-blue-950/40 ring-1 ring-blue-500/40"
              : "bg-amber-950/50 border-amber-500/80 text-white shadow-lg shadow-amber-950/40 ring-1 ring-amber-500/40"
            : "bg-obsidian-surface hover:bg-obsidian-surface/80 border-obsidian-border hover:border-obsidian-border-active text-slate-300"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isTeamA ? "bg-cs2-ct shadow-sm shadow-blue-400" : "bg-cs2-t shadow-sm shadow-amber-400"
            }`}
          />
          <span className="text-xs font-semibold truncate max-w-[100px] sm:max-w-[130px] tracking-tight">
            {p.name}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 flex-shrink-0 ml-2">
          <span className="font-medium text-slate-300">{p.kills}/{p.deaths}</span>
          <span className="text-slate-600">•</span>
          <span className={p.adr >= 90 ? "text-emerald-400 font-bold" : "text-slate-400"}>
            {p.adr.toFixed(0)} <span className="text-[9px] text-slate-500">ADR</span>
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-5 relative overflow-hidden backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-obsidian-border gap-2">
        <div>
          <div className="label-rust text-[10px] tracking-[0.22em] font-bold mb-0.5">
            SUBJECT ISOLATION
          </div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-rust" />
            <h4 className="font-display text-base font-medium tracking-wide text-white uppercase">
              Player Focus
            </h4>
          </div>
        </div>
        <span className="font-mono text-[11px] text-slate-400 tracking-wide">
          Select operative to isolate mechanics &amp; mistake telemetry
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Team A */}
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-cs2-ct uppercase tracking-wider mb-2.5">
            <span className="w-2 h-2 rounded-full bg-cs2-ct" />
            <span>{teamAName}</span>
            <span className="telemetry-tag ml-auto">TEAM A</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-2">
            {teamAPlayers.map(renderPlayerTab)}
          </div>
        </div>

        {/* Team B */}
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-cs2-t uppercase tracking-wider mb-2.5">
            <span className="w-2 h-2 rounded-full bg-cs2-t" />
            <span>{teamBName}</span>
            <span className="telemetry-tag ml-auto">TEAM B</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-2">
            {teamBPlayers.map(renderPlayerTab)}
          </div>
        </div>
      </div>
    </div>
  );
}
