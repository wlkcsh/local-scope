import React from "react";
import { Award, Zap, ShieldCheck, Flame, Crosshair, Star } from "lucide-react";
import { PlayerMatchStatRow } from "@/lib/types";

interface MatchInsightsProps {
  playerStats: PlayerMatchStatRow[];
  teamAName?: string;
  teamBName?: string;
}

export function MatchInsights({
  playerStats,
  teamAName = "Team A",
  teamBName = "Team B",
}: MatchInsightsProps) {
  if (!playerStats || playerStats.length === 0) return null;

  // 1. Calculate MVP using HLTV-style composite impact formula
  const getRating = (p: PlayerMatchStatRow) => {
    const kRatio = p.deaths > 0 ? p.kills / p.deaths : p.kills;
    const adrScore = p.adr / 80;
    const kastScore = p.kast_pct / 70;
    const fkBonus = (p.first_kills * 0.15) - (p.first_deaths * 0.1);
    return Math.max(0.5, (kRatio * 0.45 + adrScore * 0.35 + kastScore * 0.2 + fkBonus));
  };

  const mvp = [...playerStats].sort((a, b) => getRating(b) - getRating(a))[0];
  const mvpRating = mvp ? getRating(mvp).toFixed(2) : "1.00";

  // 2. Compute 4 Category Leaders
  const fragLeader = [...playerStats].sort((a, b) => b.kills - a.kills)[0];
  const damageLeader = [...playerStats].sort((a, b) => b.adr - a.adr)[0];
  const kastLeader = [...playerStats].sort((a, b) => b.kast_pct - a.kast_pct)[0];
  const entryLeader = [...playerStats].sort((a, b) => b.first_kills - a.first_kills)[0];

  const getTeamName = (team: "A" | "B") => (team === "A" ? teamAName : teamBName);

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="label-rust text-[10px] tracking-[0.22em] font-bold mb-0.5">
            TACTICAL MERIT & IMPACT
          </div>
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-rust" />
            <h4 className="font-display text-base font-medium tracking-wide text-white uppercase">
              Match Insights & Honors
            </h4>
            <span className="telemetry-tag ml-1">HLTV 2.0+ ALIGNED</span>
          </div>
        </div>
        <span className="hidden sm:inline font-mono text-[11px] text-slate-400 tracking-wide">
          Calculated across all rounds
        </span>
      </div>

      {/* Grid: Left = MVP Spotlight Card (7 cols), Right = 4 Stat Leaders (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* MVP Spotlight Card */}
        {mvp && (
          <div className="lg:col-span-6 bg-obsidian-card/90 rounded-xl border border-obsidian-border p-5 relative overflow-hidden backdrop-blur-sm hover:-translate-y-0.5 transition-transform duration-200 flex flex-col justify-between">
            {/* Ambient Background Accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div>
              {/* Header Badge */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-obsidian-border">
                <div className="flex items-center gap-2 text-amber-400 font-mono text-[11px] font-bold tracking-widest uppercase">
                  <Star className="w-4 h-4 fill-current animate-pulse" />
                  <span>Match MVP Spotlight</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
                  <span>{mvpRating}</span>
                  <span className="text-[10px] opacity-75 font-normal">RATING</span>
                </div>
              </div>

              {/* Player Profile & Team Tag */}
              <div className="flex items-center gap-4 mb-5">
                <div className="relative">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center font-display font-bold text-xl text-white shadow-md border-2 ${
                    mvp.team === "A" ? "border-sky-500 bg-sky-950/40" : "border-amber-500 bg-amber-950/40"
                  }`}>
                    {mvp.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-obsidian-card ${
                    mvp.team === "A" ? "bg-sky-400" : "bg-amber-400"
                  }`} />
                </div>

                <div>
                  <h3 className="font-display text-xl font-bold text-white tracking-wide">
                    {mvp.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs text-slate-400">
                      {getTeamName(mvp.team)}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="font-mono text-[11px] text-rust font-semibold">
                      {mvp.clutches_won > 0 ? `${mvp.clutches_won} Clutches Won` : `${mvp.first_kills} Opening Frags`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4-Cell Telemetry Metric Strip */}
            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-obsidian-border text-center">
              <div className="bg-obsidian-surface/60 rounded-lg p-2 border border-obsidian-border/50">
                <div className="font-mono text-base font-bold text-slate-100 tabular-nums">
                  {mvp.adr.toFixed(1)}
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mt-0.5">
                  ADR
                </div>
              </div>

              <div className="bg-obsidian-surface/60 rounded-lg p-2 border border-obsidian-border/50">
                <div className="font-mono text-base font-bold text-slate-100 tabular-nums">
                  {mvp.kills}/{mvp.deaths}/{mvp.assists}
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mt-0.5">
                  K / D / A
                </div>
              </div>

              <div className="bg-obsidian-surface/60 rounded-lg p-2 border border-obsidian-border/50">
                <div className="font-mono text-base font-bold text-slate-100 tabular-nums">
                  {mvp.hs_pct.toFixed(1)}%
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mt-0.5">
                  HS %
                </div>
              </div>

              <div className="bg-obsidian-surface/60 rounded-lg p-2 border border-obsidian-border/50">
                <div className="font-mono text-base font-bold text-slate-100 tabular-nums">
                  {mvp.kast_pct.toFixed(0)}%
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mt-0.5">
                  KAST
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4-Pillar Stat Leaders Grid (6 cols) */}
        <div className="lg:col-span-6 grid grid-cols-2 gap-3">
          {/* 1. Frag Leader */}
          {fragLeader && (
            <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-4 flex flex-col justify-between hover:-translate-y-0.5 transition-transform duration-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-rust text-[10px] font-mono font-bold tracking-widest uppercase">
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Frag Leader</span>
                </div>
                <span className="font-mono text-lg font-bold text-white tabular-nums">
                  {fragLeader.kills}
                </span>
              </div>
              <div>
                <div className="font-display text-sm font-semibold text-white truncate">
                  {fragLeader.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${fragLeader.team === "A" ? "bg-sky-400" : "bg-amber-400"}`} />
                  <span>{getTeamName(fragLeader.team)}</span>
                  <span>•</span>
                  <span>{(fragLeader.kills / (playerStats.length > 0 ? playerStats[0].kills + playerStats[0].deaths : 1)).toFixed(2)} KPR</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. Damage Dealer */}
          {damageLeader && (
            <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-4 flex flex-col justify-between hover:-translate-y-0.5 transition-transform duration-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-rose-400 text-[10px] font-mono font-bold tracking-widest uppercase">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Damage King</span>
                </div>
                <span className="font-mono text-lg font-bold text-white tabular-nums">
                  {damageLeader.adr.toFixed(1)}
                </span>
              </div>
              <div>
                <div className="font-display text-sm font-semibold text-white truncate">
                  {damageLeader.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${damageLeader.team === "A" ? "bg-sky-400" : "bg-amber-400"}`} />
                  <span>{getTeamName(damageLeader.team)}</span>
                  <span>•</span>
                  <span>ADR</span>
                </div>
              </div>
            </div>
          )}

          {/* 3. Consistency Anchor (KAST) */}
          {kastLeader && (
            <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-4 flex flex-col justify-between hover:-translate-y-0.5 transition-transform duration-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-mono font-bold tracking-widest uppercase">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>KAST Anchor</span>
                </div>
                <span className="font-mono text-lg font-bold text-white tabular-nums">
                  {kastLeader.kast_pct.toFixed(0)}%
                </span>
              </div>
              <div>
                <div className="font-display text-sm font-semibold text-white truncate">
                  {kastLeader.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${kastLeader.team === "A" ? "bg-sky-400" : "bg-amber-400"}`} />
                  <span>{getTeamName(kastLeader.team)}</span>
                  <span>•</span>
                  <span>Round Impact</span>
                </div>
              </div>
            </div>
          )}

          {/* 4. Entry King */}
          {entryLeader && (
            <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-4 flex flex-col justify-between hover:-translate-y-0.5 transition-transform duration-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-amber-400 text-[10px] font-mono font-bold tracking-widest uppercase">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Entry Specialist</span>
                </div>
                <span className="font-mono text-lg font-bold text-white tabular-nums">
                  {entryLeader.first_kills}
                </span>
              </div>
              <div>
                <div className="font-display text-sm font-semibold text-white truncate">
                  {entryLeader.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${entryLeader.team === "A" ? "bg-sky-400" : "bg-amber-400"}`} />
                  <span>{getTeamName(entryLeader.team)}</span>
                  <span>•</span>
                  <span>{entryLeader.first_deaths} FD</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
