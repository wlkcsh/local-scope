import React from "react";
import Link from "next/link";
import { Award, Zap, ShieldCheck, Flame, Crosshair, Star, Target } from "lucide-react";
import { HighlightRow, MistakeRow, PlayerMatchStatRow } from "@/lib/types";
import { computeMatchInsights, TacticalHonor } from "@/lib/insights";
import { KeyMomentsStrip } from "./KeyMomentsStrip";
import { TeamMacroBar } from "./TeamMacroBar";

interface MatchInsightsProps {
  matchId: string;
  playerStats: PlayerMatchStatRow[];
  roundsTotal: number;
  highlights?: HighlightRow[];
  mistakes?: MistakeRow[];
  focusedSteamid?: string | null;
  teamAName?: string;
  teamBName?: string;
}

const HONOR_ICONS: Record<TacticalHonor["id"], React.ReactNode> = {
  mechanics: <Target className="w-3.5 h-3.5" />,
  entry: <Zap className="w-3.5 h-3.5" />,
  utility: <ShieldCheck className="w-3.5 h-3.5" />,
  impact: <Flame className="w-3.5 h-3.5" />,
};

export function MatchInsights({
  matchId,
  playerStats,
  roundsTotal,
  highlights = [],
  mistakes = [],
  focusedSteamid = null,
  teamAName = "Team A",
  teamBName = "Team B",
}: MatchInsightsProps) {
  if (!playerStats || playerStats.length === 0) return null;

  const { mvp, honors, keyMoments, teamMacro, focusedSummary } = computeMatchInsights(
    playerStats,
    highlights,
    mistakes,
    roundsTotal,
    focusedSteamid
  );

  const getTeamName = (team: "A" | "B") => (team === "A" ? teamAName : teamBName);
  const focusHref = (steamid: string) => `?player=${encodeURIComponent(steamid)}`;

  return (
    <section className="space-y-4">
      {/* Section Header + Focused Player Rank Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="label-rust text-[10px] tracking-[0.22em] font-bold mb-0.5">
            TACTICAL MERIT &amp; KEY MOMENTS
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Award className="w-4 h-4 text-rust" />
            <h4 className="font-display text-base font-medium tracking-wide text-white uppercase">
              Match Insights &amp; Honors
            </h4>
            <span className="telemetry-tag ml-1">HLTV 2.0 · {roundsTotal} ROUNDS</span>
          </div>
        </div>

        {focusedSummary ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-[11px] font-mono self-start sm:self-auto">
            <Crosshair className="w-3.5 h-3.5 text-rust" />
            <span className="font-semibold text-white">{focusedSummary.player.name}</span>
            <span className="text-slate-500">·</span>
            <span className="text-emerald-400 font-bold">
              #{focusedSummary.ratingRank}/{focusedSummary.totalPlayers} Rating ({focusedSummary.rating.toFixed(2)})
            </span>
            <span className="text-slate-500 hidden md:inline">·</span>
            <span className="text-slate-400 hidden md:inline">
              {focusedSummary.mistakeCount} {focusedSummary.mistakeCount === 1 ? "mistake" : "mistakes"}
            </span>
          </div>
        ) : (
          <span className="hidden sm:inline font-mono text-[11px] text-slate-400">
            Click any card to focus operative
          </span>
        )}
      </div>

      {/* Top Row: MVP Spotlight (Left 6) + 4 Clickable Tactical Honors (Right 6) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {mvp && (
          <Link
            href={focusHref(mvp.player.steamid)}
            scroll={false}
            title={`Click to inspect ${mvp.player.name}'s full mechanics & mistakes`}
            className={`lg:col-span-6 bg-obsidian-card/90 rounded-xl border p-5 relative overflow-hidden backdrop-blur-sm transition-all flex flex-col justify-between group ${
              focusedSteamid === mvp.player.steamid
                ? "border-rust shadow-md"
                : "border-obsidian-border hover:border-rust/60"
            }`}
          >
            <div className="absolute top-0 right-0 w-56 h-56 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-obsidian-border">
                <div className="flex items-center gap-2 text-amber-400 font-mono text-[11px] font-bold tracking-widest uppercase">
                  <Star className="w-4 h-4 fill-current" />
                  <span>Match MVP Spotlight</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                    Impact {mvp.breakdown.impact.toFixed(2)}
                  </span>
                  <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold tabular-nums">
                    <span>{mvp.breakdown.rating.toFixed(2)}</span>
                    <span className="text-[9px] opacity-80 font-normal">RTG</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <div className="relative flex-shrink-0">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center font-display font-bold text-xl text-white shadow-sm border-2 ${
                      mvp.player.team === "A"
                        ? "border-sky-500 bg-sky-950/40"
                        : "border-amber-500 bg-amber-950/40"
                    }`}
                  >
                    {mvp.player.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-obsidian-card ${
                      mvp.player.team === "A" ? "bg-cs2-ct" : "bg-cs2-t"
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <h3 className="font-display text-xl font-bold text-white tracking-wide truncate group-hover:text-rust transition-colors">
                    {mvp.player.name}
                  </h3>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="font-mono text-xs text-slate-400">
                      {getTeamName(mvp.player.team)}
                    </span>
                    {mvp.highlightsSummary.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded bg-rust-subtle text-rust font-mono text-[10px] font-semibold"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5 pt-3 border-t border-obsidian-border text-center">
              {[
                { val: mvp.player.adr.toFixed(1), label: "ADR" },
                { val: `${mvp.player.kills}/${mvp.player.deaths}/${mvp.player.assists}`, label: "K / D / A" },
                { val: mvp.breakdown.kpr.toFixed(2), label: "Kills/Rd" },
                { val: `${mvp.player.hs_pct.toFixed(0)}%`, label: "HS %" },
                { val: `${mvp.player.kast_pct.toFixed(0)}%`, label: "KAST" },
              ].map((cell) => (
                <div
                  key={cell.label}
                  className="bg-obsidian-surface/80 rounded-lg py-2 px-1 border border-obsidian-border/60"
                >
                  <div className="font-mono text-sm font-bold text-slate-100 tabular-nums truncate">
                    {cell.val}
                  </div>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mt-0.5">
                    {cell.label}
                  </div>
                </div>
              ))}
            </div>
          </Link>
        )}

        {/* 4 Non-Redundant Clickable Tactical Honors */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {honors.map((honor) => {
            const isFocused = focusedSteamid === honor.player.steamid;
            return (
              <Link
                key={honor.id}
                href={focusHref(honor.player.steamid)}
                scroll={false}
                title={`${honor.explanation} — Click to focus ${honor.player.name}`}
                className={`group bg-obsidian-card/90 rounded-xl border p-4 flex flex-col justify-between gap-2.5 transition-all ${
                  isFocused
                    ? "border-rust shadow-sm"
                    : "border-obsidian-border hover:border-rust/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest uppercase ${honor.accentClass}`}>
                    {HONOR_ICONS[honor.id]}
                    <span>{honor.title}</span>
                  </div>
                  <div className="font-mono text-lg font-bold text-white tabular-nums leading-none">
                    {honor.primaryValue}
                    {honor.primaryUnit && (
                      <span className="text-[10px] font-normal text-slate-400 ml-0.5">
                        {honor.primaryUnit}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        honor.player.team === "A" ? "bg-cs2-ct" : "bg-cs2-t"
                      }`}
                    />
                    <span className="font-display text-sm font-semibold text-white truncate group-hover:text-rust transition-colors">
                      {honor.player.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 ml-auto">
                      {getTeamName(honor.player.team)}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                    {honor.detailText}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Key Match Moments: Clutches, Aces & Multi-Kills, Unique Kills */}
      <KeyMomentsStrip
        matchId={matchId}
        clutches={keyMoments.clutches}
        multiKills={keyMoments.multiKills}
        uniqueKills={keyMoments.uniqueKills}
        focusedSteamid={focusedSteamid}
      />

      {/* Team A vs Team B Macro Deciders */}
      <TeamMacroBar metrics={teamMacro} teamAName={teamAName} teamBName={teamBName} />
    </section>
  );
}
