import React from "react";
import Link from "next/link";
import { History, Play, Bomb, Shield, Crosshair, Clock } from "lucide-react";
import { RoundSummaryRow } from "@/lib/types";

interface RoundTimelineProps {
  matchId: string;
  roundsTotal: number;
  scoreA: number;
  scoreB: number;
  rounds?: RoundSummaryRow[];
  teamAName?: string;
  teamBName?: string;
}

export function RoundTimeline({
  matchId,
  roundsTotal,
  scoreA,
  scoreB,
  rounds = [],
  teamAName = "Team A",
  teamBName = "Team B",
}: RoundTimelineProps) {
  const roundIndices = Array.from({ length: roundsTotal }, (_, i) => i + 1);
  const roundsMap = new Map<number, RoundSummaryRow>();
  rounds.forEach((r) => roundsMap.set(r.round_num, r));

  const getReasonMeta = (reason: string, winnerSide: string) => {
    const r = reason.toLowerCase();
    if (r.includes("defuse")) {
      return {
        label: "Bomb Defused",
        icon: Shield,
        color: "text-sky-400",
      };
    }
    if (r.includes("bomb") || r.includes("exploded") || r === "target_bombed") {
      return {
        label: "Bomb Detonated",
        icon: Bomb,
        color: "text-amber-400",
      };
    }
    if (r.includes("time") || r.includes("saved") || r === "target_saved") {
      return {
        label: "Time Expired",
        icon: Clock,
        color: "text-sky-300",
      };
    }
    return {
      label: winnerSide === "CT" ? "Ts Eliminated" : "CTs Eliminated",
      icon: Crosshair,
      color: winnerSide === "CT" ? "text-sky-400" : "text-amber-400",
    };
  };

  return (
    <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-5 relative overflow-hidden backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-obsidian-border gap-2">
        <div>
          <div className="label-rust text-[10px] tracking-[0.22em] font-bold mb-0.5">
            TACTICAL CHRONOLOGY
          </div>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-rust" />
            <h4 className="font-display text-base font-medium tracking-wide text-white uppercase">
              Round Timeline
            </h4>
            <span className="telemetry-tag ml-1">MR12</span>
          </div>
        </div>

        {/* Tactical Legend for Quick Decryption */}
        <div className="flex items-center flex-wrap gap-3 font-mono text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.7)]" />
            <span className="text-slate-300">CT Win</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]" />
            <span className="text-slate-300">T Win</span>
          </div>
          <div className="hidden md:flex items-center gap-2 border-l border-obsidian-border pl-3 text-slate-500">
            <span className="flex items-center gap-1"><Bomb className="w-3 h-3 text-amber-400" /> Detonation</span>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-sky-400" /> Defusal</span>
            <span className="flex items-center gap-1"><Crosshair className="w-3 h-3 text-slate-400" /> Elimination</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
        {roundIndices.map((roundNum) => {
          const isHalfTime = roundNum === 12;
          const isRegulationEnd = roundNum === 24;
          const rData = roundsMap.get(roundNum);

          const isCT = rData?.winner_side === "CT";
          const isT = rData?.winner_side === "T";
          const winnerTeamName = rData?.winner_team === "A" ? teamAName : teamBName;
          const reasonMeta = rData ? getReasonMeta(rData.reason, rData.winner_side) : null;
          const ReasonIcon = reasonMeta?.icon || Play;

          // Tooltip description
          const tooltipText = rData
            ? `Round ${roundNum} • Winner: ${winnerTeamName} (${rData.winner_side}) • ${reasonMeta?.label} • Score: ${rData.score_a}-${rData.score_b}`
            : `Jump to Round ${roundNum}`;

          return (
            <React.Fragment key={roundNum}>
              <Link
                href={`/matches/${matchId}/replay?round=${roundNum}`}
                className={`group relative flex flex-col items-center justify-between min-w-[38px] h-14 py-1.5 px-1 rounded-lg border transition-all text-center ${
                  isCT
                    ? "bg-sky-950/20 hover:bg-sky-900/35 border-sky-500/30 hover:border-sky-400 hover:shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                    : isT
                    ? "bg-amber-950/20 hover:bg-amber-900/35 border-amber-500/30 hover:border-amber-400 hover:shadow-[0_0_12px_rgba(251,191,36,0.2)]"
                    : "bg-obsidian-surface hover:bg-obsidian-surface/80 border-obsidian-border hover:border-rust"
                }`}
                title={tooltipText}
              >
                {/* Winner Pill Dot */}
                <div className="flex items-center justify-center w-full">
                  {isCT ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_4px_rgba(56,189,248,0.8)]" />
                  ) : isT ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.8)]" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  )}
                </div>

                {/* Round Number */}
                <span className={`text-[12px] font-mono font-bold ${
                  isCT ? "text-sky-200 group-hover:text-white" : isT ? "text-amber-200 group-hover:text-white" : "text-slate-300 group-hover:text-white"
                }`}>
                  {roundNum}
                </span>

                {/* Micro Win Reason Icon or Play Glyph */}
                <div className="flex items-center justify-center">
                  {reasonMeta ? (
                    <ReasonIcon className={`w-3 h-3 ${reasonMeta.color} opacity-80 group-hover:opacity-100 transition-opacity`} />
                  ) : (
                    <Play className="w-2.5 h-2.5 text-rust opacity-0 group-hover:opacity-100 transition-opacity fill-current" />
                  )}
                </div>
              </Link>

              {/* MR12 Half-time separator */}
              {isHalfTime && (
                <div className="flex flex-col items-center justify-center px-1.5">
                  <div className="w-[1px] h-9 bg-rust/50" />
                  <span className="font-mono text-[9px] font-bold text-rust uppercase tracking-wider mt-0.5">
                    Half
                  </span>
                </div>
              )}

              {/* OT separator */}
              {isRegulationEnd && roundsTotal > 24 && (
                <div className="flex flex-col items-center justify-center px-1.5">
                  <div className="w-[1px] h-9 bg-amber-500/50" />
                  <span className="font-mono text-[9px] font-bold text-amber-400 uppercase tracking-wider mt-0.5">
                    OT
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
