"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, Play, DollarSign, EyeOff, Skull, Package, Zap } from "lucide-react";
import { MistakeRow, PlayerMatchStatRow } from "@/lib/types";

interface MistakeListProps {
  mistakes: MistakeRow[];
  playerStats: PlayerMatchStatRow[];
  focusedSteamid?: string | null;
  selectedMistakeId?: number | null;
  onSelectMistake?: (id: number) => void;
}

export function MistakeList({
  mistakes,
  playerStats,
  focusedSteamid,
  selectedMistakeId,
  onSelectMistake,
}: MistakeListProps) {
  // Map steamids to player names
  const playerNames = new Map<string, string>();
  for (const p of playerStats) {
    playerNames.set(p.steamid, p.name);
  }

  // Filter or sort by severity descending
  const relevantMistakes = mistakes
    .filter((m) => (!focusedSteamid ? true : m.steamid === focusedSteamid))
    .sort((a, b) => b.severity - a.severity || a.round - b.round);

  const getTypeIcon = (type: MistakeRow["type"]) => {
    switch (type) {
      case "unspent_utility":
        return <DollarSign className="w-4 h-4 text-amber-400" />;
      case "team_flash":
        return <EyeOff className="w-4 h-4 text-purple-400" />;
      case "untraded_early_death":
        return <Skull className="w-4 h-4 text-rose-400" />;
      case "died_holding_utility":
        return <Package className="w-4 h-4 text-orange-400" />;
      case "self_flash_death":
        return <Zap className="w-4 h-4 text-yellow-300" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getSeverityBadge = (severity: MistakeRow["severity"]) => {
    switch (severity) {
      case 3:
        return (
          <span className="px-2 py-0.5 text-[9px] font-mono font-bold tracking-wider rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
            SEV.1 CRITICAL
          </span>
        );
      case 2:
        return (
          <span className="px-2 py-0.5 text-[9px] font-mono font-bold tracking-wider rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            SEV.2 MEDIUM
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-[9px] font-mono font-bold tracking-wider rounded bg-slate-500/15 text-slate-300 border border-slate-500/30">
            SEV.3 MINOR
          </span>
        );
    }
  };

  return (
    <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-5 flex flex-col h-full relative overflow-hidden backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-obsidian-border gap-2">
        <div>
          <div className="label-rust text-[10px] tracking-[0.22em] font-bold mb-0.5">
            TACTICAL ANOMALIES
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <h3 className="font-display text-base font-medium tracking-wide text-white uppercase">
              Mistake Log
            </h3>
          </div>
        </div>
        <span className="telemetry-tag font-mono self-start sm:self-auto">
          {relevantMistakes.length} OCCURRENCES
        </span>
      </div>

      <div className="mt-4 space-y-2.5 overflow-y-auto max-h-[500px] pr-1 scrollbar-thin">
        {relevantMistakes.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-slate-400">
            NO ANOMALIES DETECTED FOR SUBJECT. PRISTINE PROTOCOL EXECUTION.
          </div>
        ) : (
          relevantMistakes.map((m) => {
            const replayTick = Math.max(0, m.tick - 192);
            const replayUrl = `/matches/${m.match_id}/replay?round=${m.round}&tick=${replayTick}`;
            const isSelected = selectedMistakeId === m.id;

            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => onSelectMistake && onSelectMistake(m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectMistake && onSelectMistake(m.id);
                  }
                }}
                className={`p-3.5 rounded-lg border transition-all cursor-pointer focus:outline-none ${
                  isSelected
                    ? "bg-obsidian-surface border-rust ring-1 ring-rust/40 shadow-lg shadow-black/40"
                    : "bg-obsidian-surface hover:bg-obsidian-surface/80 border-obsidian-border hover:border-obsidian-border-active"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded bg-obsidian-deep border border-obsidian-border">
                      {getTypeIcon(m.type)}
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-white uppercase tracking-wide">
                        Round {m.round}
                      </span>
                      <span className="text-xs text-slate-400 ml-2 font-medium">
                        {playerNames.get(m.steamid) || m.steamid.slice(-6)}
                      </span>
                    </div>
                  </div>
                  {getSeverityBadge(m.severity)}
                </div>

                <div className="mt-2 text-xs text-slate-300">
                  {m.type === "unspent_utility" && (
                    <div>
                      Died with{" "}
                      <span className="font-mono font-bold text-amber-400">
                        ${m.meta?.value || 0}
                      </span>{" "}
                      in unused utility:{" "}
                      <span className="text-slate-400 font-mono text-[11px]">
                        {Array.isArray(m.meta?.items)
                          ? m.meta.items.join(", ")
                          : ""}
                      </span>
                    </div>
                  )}

                  {m.type === "team_flash" && (
                    <div>
                      Flashed teammate for{" "}
                      <span className="font-mono font-bold text-purple-400">
                        {typeof m.meta?.duration === "number"
                          ? m.meta.duration.toFixed(1)
                          : "?"}
                        s
                      </span>
                    </div>
                  )}

                  {m.type === "untraded_early_death" && (
                    <div>
                      Died{" "}
                      <span className="font-mono font-bold text-rose-400">
                        {m.meta?.secs_into_round != null
                          ? Number(m.meta.secs_into_round).toFixed(1)
                          : "?"}
                        s
                      </span>{" "}
                      into round with no teammate trade
                    </div>
                  )}

                  {m.type === "died_holding_utility" && (
                    <div>
                      Killed while holding{" "}
                      <span className="font-mono font-bold text-orange-400 uppercase">
                        {m.meta?.weapon_held || "utility"}
                      </span>
                      {m.meta?.killer_weapon ? (
                        <> by enemy <span className="font-mono text-slate-400">{m.meta.killer_weapon}</span></>
                      ) : null}
                      {m.meta?.first_death ? (
                        <span className="text-rose-400 text-[10px] ml-1.5 font-mono font-bold">(ENTRY DEATH)</span>
                      ) : null}
                    </div>
                  )}

                  {m.type === "self_flash_death" && (
                    <div>
                      Blinded self for{" "}
                      <span className="font-mono font-bold text-yellow-300">
                        {typeof m.meta?.blind_duration === "number"
                          ? m.meta.blind_duration.toFixed(1)
                          : "?"}
                        s
                      </span>{" "}
                      and eliminated while blind
                    </div>
                  )}
                </div>

                <div className="mt-2.5 pt-2 border-t border-obsidian-border flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">
                    TICK: {m.tick} {m.layer === 1 ? "(LOWER)" : "(UPPER)"}
                  </span>
                  <Link
                    href={replayUrl}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold text-rust hover:text-amber-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>WATCH REPLAY</span>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
