import React from "react";
import { Scale } from "lucide-react";
import { TeamMacroMetric } from "@/lib/insights";

interface TeamMacroBarProps {
  metrics: TeamMacroMetric[];
  teamAName: string;
  teamBName: string;
}

export function TeamMacroBar({ metrics, teamAName, teamBName }: TeamMacroBarProps) {
  if (!metrics || metrics.length === 0) return null;

  return (
    <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-obsidian-border">
        <div className="flex items-center gap-2">
          <Scale className="w-3.5 h-3.5 text-rust" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-white">
            Team Macro Comparison
          </span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            — How the match was decided
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <span className="w-2 h-2 rounded-full bg-cs2-ct" />
            {teamAName}
          </span>
          <span className="text-slate-500">vs</span>
          <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <span className="w-2 h-2 rounded-full bg-cs2-t" />
            {teamBName}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {metrics.map((m) => {
          const total = m.valueA + m.valueB;
          const pctA = total > 0 ? Math.round((m.valueA / total) * 100) : 50;
          const pctB = 100 - pctA;

          const aLeads = m.lowerIsBetter ? m.valueA < m.valueB : m.valueA > m.valueB;
          const bLeads = m.lowerIsBetter ? m.valueB < m.valueA : m.valueB > m.valueA;

          return (
            <div
              key={m.id}
              className="rounded-lg bg-obsidian-surface/80 border border-obsidian-border p-2.5 flex flex-col justify-between gap-1.5"
            >
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                {m.label}
              </div>

              <div className="flex items-baseline justify-between font-mono text-xs tabular-nums">
                <span className={aLeads ? "font-bold text-cs2-ct" : "text-slate-400"}>
                  {m.displayA}
                </span>
                <span className={bLeads ? "font-bold text-cs2-t" : "text-slate-400"}>
                  {m.displayB}
                </span>
              </div>

              <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-obsidian-subtle">
                <div
                  className="h-full bg-cs2-ct transition-all"
                  style={{ width: `${pctA}%` }}
                />
                <div
                  className="h-full bg-cs2-t transition-all"
                  style={{ width: `${pctB}%` }}
                />
              </div>

              {m.note && (
                <div className="text-[10px] text-slate-500 truncate">{m.note}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
