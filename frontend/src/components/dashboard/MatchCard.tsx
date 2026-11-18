import React from "react";
import Link from "next/link";
import { Calendar, Clock, Activity, ArrowRight, Play } from "lucide-react";
import { MatchRow } from "@/lib/types";

interface MatchCardProps {
  match: MatchRow;
}

export function MatchCard({ match }: MatchCardProps) {
  const isVictory = match.result === "W";
  const isDefeat = match.result === "L";

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return "Recent";
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    return `${mins} mins`;
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-obsidian-surface hover:bg-obsidian-card border border-obsidian-border hover:border-obsidian-border-active transition-all duration-300 shadow-xl flex flex-col justify-between">
      {/* Subtle Background Radial Gradient */}
      <div
        className={`absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-15 transition-opacity group-hover:opacity-25 ${
          isVictory ? "bg-emerald-500" : isDefeat ? "bg-rose-500" : "bg-rust"
        }`}
      />

      {/* Top Banner with Map and Result */}
      <div className="p-6 pb-4 relative z-10">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-obsidian-subtle border border-obsidian-border text-[11px] font-mono font-bold tracking-wider uppercase text-white">
              {match.map}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {match.rounds_total} ROUNDS
            </span>
          </div>

          {match.result && (
            <span
              className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-widest border ${
                isVictory
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                  : isDefeat
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                  : "bg-slate-500/15 border-slate-500/40 text-slate-300"
              }`}
            >
              {isVictory ? "VICTORY" : isDefeat ? "DEFEAT" : "DRAW"}
            </span>
          )}
        </div>

        {/* Score and Teams in Didone Typography */}
        <div className="flex items-center justify-between gap-4 my-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cs2-ct flex-shrink-0" />
              <span className="text-sm font-semibold text-white truncate font-sans">
                {match.team_a_name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cs2-t flex-shrink-0" />
              <span className="text-sm font-semibold text-white truncate font-sans">
                {match.team_b_name}
              </span>
            </div>
          </div>

          {/* Monumental Didone Score Display */}
          <div className="flex items-baseline gap-1 px-4 py-1.5 rounded-xl bg-obsidian-subtle border border-obsidian-border font-display text-2xl font-bold tracking-tight">
            <span className={match.score_a > match.score_b ? "text-emerald-400" : "text-white"}>
              {match.score_a}
            </span>
            <span className="text-slate-600 text-lg font-mono mx-0.5">:</span>
            <span className={match.score_b > match.score_a ? "text-emerald-400" : "text-white"}>
              {match.score_b}
            </span>
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="px-6 py-3.5 border-t border-obsidian-border bg-obsidian-subtle/80 flex items-center justify-between text-xs text-slate-400 relative z-10 font-mono text-[11px]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Calendar className="w-3 h-3 text-slate-500" />
            {formatDate(match.played_at || match.created_at)}
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <Clock className="w-3 h-3 text-slate-500" />
            {formatDuration(match.duration_s)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/matches/${match.id}/replay`}
            className="p-1.5 rounded-md hover:bg-surface text-slate-400 hover:text-rust transition-colors"
            title="Watch 2D Replay"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </Link>

          <Link
            href={`/matches/${match.id}`}
            className="inline-flex items-center gap-1 font-semibold text-slate-200 hover:text-white transition-colors group/link"
          >
            <span>Dossier</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform text-rust" />
          </Link>
        </div>
      </div>
    </div>
  );
}
