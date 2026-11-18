import React from "react";
import Link from "next/link";
import { ArrowLeft, Play, Calendar, Clock, Activity, Shield, Globe } from "lucide-react";
import { MatchRow } from "@/lib/types";
import { ShareMatchToggle } from "@/components/dashboard/ShareMatchToggle";

interface ScoreHeaderProps {
  match: MatchRow;
}

export function ScoreHeader({ match }: ScoreHeaderProps) {
  const isVictory = match.result === "W";
  const isDefeat = match.result === "L";

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}m ${s < 10 ? "0" : ""}${s}s`;
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return "Unknown date";
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-obsidian-surface border border-obsidian-border p-6 sm:p-8 shadow-2xl">
      {/* Background Subtle Glow */}
      <div
        className={`absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20 ${
          isVictory ? "bg-emerald-500" : isDefeat ? "bg-rose-500" : "bg-rust"
        }`}
      />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Left: Back Link & Match Info */}
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-white transition-colors mb-0.5 w-fit uppercase tracking-wider"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-rust" />
            <span>// Return to Dossiers</span>
          </Link>

          <div className="flex items-center gap-3 flex-wrap font-mono text-[11px]">
            <span className="px-3 py-1 rounded bg-obsidian-card border border-obsidian-border font-bold tracking-widest uppercase text-white font-mono">
              {match.map}
            </span>
            {match.result && (
              <span
                className={`px-3 py-1 rounded text-[11px] font-bold uppercase tracking-widest border ${
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
            <span className="text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              {formatDate(match.played_at || match.created_at)}
            </span>
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {formatDuration(match.duration_s)}
            </span>
            <span className="text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-slate-500" />
              {match.tick_rate} TICK
            </span>
          </div>

          {/* Teams and Monumental Didone Scores Display */}
          <div className="mt-3 flex items-center gap-6 sm:gap-8 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-cs2-ct" />
              <span className="text-xl sm:text-2xl font-display font-semibold text-white tracking-wide uppercase">
                {match.team_a_name}
              </span>
              <span className="text-[10px] font-mono font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-obsidian-subtle border border-obsidian-border uppercase">
                {match.team_a_first_side} 1st
              </span>
            </div>

            <div className="flex items-baseline gap-2 px-5 py-1.5 rounded-xl bg-obsidian-subtle border border-obsidian-border text-3xl sm:text-4xl font-display font-bold">
              <span className={match.score_a >= match.score_b ? "text-white font-extrabold" : "text-slate-400 font-medium"}>
                {match.score_a}
              </span>
              <span className="text-slate-500 font-mono text-xl mx-0.5">:</span>
              <span className={match.score_b >= match.score_a ? "text-white font-extrabold" : "text-slate-400 font-medium"}>
                {match.score_b}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-cs2-t" />
              <span className="text-xl sm:text-2xl font-display font-semibold text-white tracking-wide uppercase">
                {match.team_b_name}
              </span>
              <span className="text-[10px] font-mono font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-obsidian-subtle border border-obsidian-border uppercase">
                {match.team_a_first_side === "CT" ? "T" : "CT"} 1st
              </span>
            </div>
          </div>
        </div>

        {/* Right: Sharing & Watch 2D Replay Action */}
        <div className="flex items-center gap-3 flex-wrap">
          {match.is_owner ? (
            <ShareMatchToggle
              matchId={match.id}
              initialIsPublic={Boolean(match.is_public)}
            />
          ) : match.is_public ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-bold uppercase tracking-wider">
              <Globe className="w-3.5 h-3.5" />
              <span>Shared Link</span>
            </div>
          ) : null}
          <Link
            href={`/matches/${match.id}/replay`}
            className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-rust hover:bg-rust-hover text-white font-mono font-bold text-xs tracking-wider uppercase shadow-lg shadow-rust/20 transition-all hover:scale-105 active:scale-95"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Launch 2D Replay</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
