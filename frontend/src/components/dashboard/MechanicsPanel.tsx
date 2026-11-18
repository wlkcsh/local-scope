import React from "react";
import { Gauge, Crosshair, Zap, ShieldCheck, Flame, Eye, Skull, Target } from "lucide-react";
import { PlayerMatchStatRow } from "@/lib/types";

interface MechanicsPanelProps {
  stats: PlayerMatchStatRow;
}

export function MechanicsPanel({ stats }: MechanicsPanelProps) {
  // Evaluation helpers
  const getTtdRating = (ttd?: number | null, samples = 0) => {
    if (ttd == null || samples < 5) return { label: "N/A", color: "text-slate-500", desc: "< 5 samples" };
    if (ttd <= 250) return { label: "PRO TIER", color: "text-emerald-400", desc: "Elite reaction time" };
    if (ttd <= 350) return { label: "FAST", color: "text-cyan-400", desc: "Competitive speed" };
    if (ttd <= 500) return { label: "AVERAGE", color: "text-amber-400", desc: "Work on crosshair placement" };
    return { label: "SLOW", color: "text-rose-400", desc: "High engagement latency" };
  };

  const getCsRating = (cs?: number | null, samples = 0) => {
    if (cs == null || samples < 20) return { label: "N/A", color: "text-slate-500", desc: "< 20 samples" };
    if (cs >= 85) return { label: "EXCELLENT", color: "text-emerald-400", desc: "Pinpoint movement stopping" };
    if (cs >= 70) return { label: "DECENT", color: "text-cyan-400", desc: "Solid stopping technique" };
    return { label: "NEEDS WORK", color: "text-rose-400", desc: "Frequent shooting while moving" };
  };

  const ttdRating = getTtdRating(stats.ttd_ms_median, stats.ttd_samples);
  const csRating = getCsRating(stats.counter_strafe_pct, stats.counter_strafe_samples);

  return (
    <div className="bg-obsidian-surface rounded-2xl border border-obsidian-border p-6 shadow-2xl space-y-5">
      {/* Editorial Header */}
      <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
        <div className="flex items-center gap-3">
          <span className="label-rust">TELEMETRY ANALYSIS</span>
          <span className="text-slate-600 font-mono text-xs">//</span>
          <h3 className="font-display text-lg text-white font-semibold tracking-wide uppercase">
            Aim &amp; Movement Mechanics
          </h3>
        </div>
        <span className="text-xs font-mono font-bold text-white px-3 py-1 rounded bg-obsidian-card border border-obsidian-border tracking-wider uppercase">
          {stats.name}
        </span>
      </div>

      {/* Asymmetric Cockpit Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Time to Damage (TTD) */}
        <div className="p-4 rounded-xl bg-obsidian-card/70 border border-obsidian-border flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-amber-400" />
              Time to Damage
            </span>
            <div className="font-mono text-2xl font-black text-white">
              {stats.ttd_ms_median != null && stats.ttd_samples >= 5
                ? `${Math.round(stats.ttd_ms_median)} ms`
                : "—"}
            </div>
            <span className="text-[10px] font-mono text-slate-500 mt-1">
              {stats.ttd_samples} engagements
            </span>
          </div>

          <div className="w-[1px] h-12 bg-obsidian-border self-center" />

          <div className="flex flex-col items-end text-right">
            <span className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded border border-obsidian-border ${ttdRating.color}`}>
              {ttdRating.label}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 font-sans">
              {ttdRating.desc}
            </span>
          </div>
        </div>

        {/* Metric 2: Counter-Strafing % */}
        <div className="p-4 rounded-xl bg-obsidian-card/70 border border-obsidian-border flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Crosshair className="w-3 h-3 text-cyan-400" />
              Counter-Strafe
            </span>
            <div className="font-mono text-2xl font-black text-white">
              {stats.counter_strafe_pct != null && stats.counter_strafe_samples >= 20
                ? `${stats.counter_strafe_pct.toFixed(1)}%`
                : "—"}
            </div>
            <span className="text-[10px] font-mono text-slate-500 mt-1">
              {stats.counter_strafe_samples} burst shots
            </span>
          </div>

          <div className="w-[1px] h-12 bg-obsidian-border self-center" />

          <div className="flex flex-col items-end text-right">
            <span className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded border border-obsidian-border ${csRating.color}`}>
              {csRating.label}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 font-sans">
              {csRating.desc}
            </span>
          </div>
        </div>

        {/* Metric 3: KAST % */}
        <div className="p-4 rounded-xl bg-obsidian-card/70 border border-obsidian-border flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              KAST %
            </span>
            <div className="font-mono text-2xl font-black text-white">
              {stats.kast_pct.toFixed(1)}%
            </div>
            <span className="text-[10px] font-mono text-slate-500 mt-1">
              Consistency rate
            </span>
          </div>

          <div className="w-[1px] h-12 bg-obsidian-border self-center" />

          <div className="flex flex-col items-end text-right">
            <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded border border-obsidian-border text-emerald-400">
              ROUND CONTRIB
            </span>
            <span className="text-[10px] text-slate-500 mt-1 font-sans">
              K/A/Surv/Trade
            </span>
          </div>
        </div>

        {/* Metric 4: Clutches */}
        <div className="p-4 rounded-xl bg-obsidian-card/70 border border-obsidian-border flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Flame className="w-3 h-3 text-rose-400" />
              Clutches
            </span>
            <div className="font-mono text-2xl font-black text-white">
              {stats.clutches_won} / {stats.clutches_played}
            </div>
            <span className="text-[10px] font-mono text-slate-500 mt-1">
              {stats.clutches_played > 0
                ? `${Math.round((stats.clutches_won / stats.clutches_played) * 100)}% conversion`
                : "0 situations"}
            </span>
          </div>

          <div className="w-[1px] h-12 bg-obsidian-border self-center" />

          <div className="flex flex-col items-end text-right">
            <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded border border-obsidian-border text-amber-400">
              1vX DUELLING
            </span>
            <span className="text-[10px] text-slate-500 mt-1 font-sans">
              Clutch victory
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-3 border-t border-obsidian-border/60 text-xs font-mono text-[11px]">
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-card/40 border border-obsidian-border">
          <span className="text-slate-400">First Duels:</span>
          <span className="font-bold text-slate-200">
            {stats.first_kills}W - {stats.first_deaths}L
          </span>
        </div>
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-card/40 border border-obsidian-border">
          <span className="text-slate-400">Trade Duels:</span>
          <span className="font-bold text-slate-200">
            {stats.trade_kills} done / {stats.traded_deaths} got
          </span>
        </div>
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-card/40 border border-obsidian-border">
          <span className="text-slate-400 flex items-center gap-1">
            <Target className="w-3 h-3 text-emerald-400" />
            1st Bullet Acc:
          </span>
          <span className="font-bold text-emerald-400">
            {stats.first_bullet_acc_pct != null && (stats.first_bullet_acc_samples ?? 0) >= 15
              ? `${stats.first_bullet_acc_pct.toFixed(1)}%`
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-card/40 border border-obsidian-border">
          <span className="text-slate-400">Utility Damage:</span>
          <span className="font-bold text-rust">
            {stats.utility_damage} HP
          </span>
        </div>
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-card/40 border border-obsidian-border col-span-2 sm:col-span-1">
          <span className="text-slate-400">Flash Assists:</span>
          <span className="font-bold text-slate-200">
            {stats.flash_assists} ({stats.enemies_flashed} blind)
          </span>
        </div>
      </div>
    </div>
  );
}
