"use client";

import React from "react";
import { Crosshair, Eye, ShieldAlert, Zap, Skull } from "lucide-react";
import { useReplayStore } from "@/lib/store";
import { ReplayFile } from "@/lib/types";
import { DecodedRound } from "@/lib/replay/decode";
import { ReplayClock } from "@/lib/replay/clock";

interface KillFeedProps {
  replay: ReplayFile;
  decodedRound: DecodedRound;
  clock: ReplayClock;
}

export function KillFeed({ replay, decodedRound, clock }: KillFeedProps) {
  const uiFrame = useReplayStore((s) => s.uiFrame);

  // Kills that occurred up to current playhead frame
  const pastKills = decodedRound.kills.filter((k) => k[0] <= uiFrame);

  const getPlayerTeamColor = (pidx: number) => {
    if (pidx < 0) return "text-slate-400";
    const p = replay.players[pidx];
    if (!p) return "text-slate-400";
    const side = p.team === "A" ? decodedRound.side_a : decodedRound.side_a === "CT" ? "T" : "CT";
    return side === "CT" ? "text-blue-400" : "text-amber-400";
  };

  const getPlayerName = (pidx: number) => {
    if (pidx < 0) return "World";
    return replay.players[pidx]?.name || `Player ${pidx}`;
  };

  return (
    <div className="flex flex-col gap-1.5 pointer-events-auto h-full">
      {pastKills.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-center text-slate-500 py-4 select-none">
          <Skull className="w-5 h-5 text-slate-600 mb-1.5 opacity-40" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
            No casualties yet
          </span>
          <span className="text-[10px] font-mono text-slate-600 mt-0.5">
            Awaiting engagement
          </span>
        </div>
      ) : (
        pastKills.map((kill, idx) => {
          const [frame, killerPidx, victimPidx, assisterPidx, widx, flags] = kill;
          const weapon = replay.weapons[widx] || "";

          const isHeadshot = (flags & 1) !== 0;
          const isWallbang = (flags & 2) !== 0;
          const isThruSmoke = (flags & 4) !== 0;
          const isNoscope = (flags & 8) !== 0;
          const isAttackerBlind = (flags & 16) !== 0;
          const isFlashAssist = (flags & 32) !== 0;

          return (
            <button
              type="button"
              key={`${frame}-${victimPidx}-${idx}`}
              onClick={() => clock.seek(Math.max(0, frame - 16))}
              className="w-full h-[34px] min-h-[34px] max-h-[34px] text-left flex items-center justify-between px-2.5 py-1 rounded-lg bg-obsidian-surface/80 border border-obsidian-border text-xs font-medium backdrop-blur-md shadow-sm cursor-pointer hover:bg-obsidian-surface hover:border-rust focus:outline-none transition-colors flex-shrink-0"
              title={`Frame ${frame} (Click to jump 2s prior)`}
            >
              {/* Killer + optional Assister */}
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <span className={`font-semibold font-mono truncate max-w-[85px] text-xs leading-none ${getPlayerTeamColor(killerPidx)}`}>
                  {getPlayerName(killerPidx)}
                </span>
                {assisterPidx >= 0 && (
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-[45px] leading-none">
                    +{getPlayerName(assisterPidx)}
                  </span>
                )}
              </div>

              {/* Weapon & Modifiers */}
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-obsidian-deep border border-obsidian-border text-[10px] font-mono text-slate-300 flex-shrink-0 mx-1">
                <span>{weapon}</span>
                {isHeadshot && (
                  <span className="text-red-400 font-bold" title="Headshot">
                    HS
                  </span>
                )}
                {isThruSmoke && (
                  <span title="Through Smoke">
                    <Eye className="w-3 h-3 text-slate-400" />
                  </span>
                )}
                {isWallbang && (
                  <span title="Wallbang">
                    <ShieldAlert className="w-3 h-3 text-emerald-400" />
                  </span>
                )}
                {isNoscope && (
                  <span title="Noscope">
                    <Crosshair className="w-3 h-3 text-pink-400" />
                  </span>
                )}
              </div>

              {/* Victim */}
              <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
                <span className={`font-semibold font-mono truncate max-w-[85px] text-xs leading-none text-right ${getPlayerTeamColor(victimPidx)}`}>
                  {getPlayerName(victimPidx)}
                </span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
