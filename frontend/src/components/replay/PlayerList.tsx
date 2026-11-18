"use client";

import React from "react";
import { useReplayStore } from "@/lib/store";
import { ReplayFile } from "@/lib/types";
import { DecodedRound } from "@/lib/replay/decode";
import { Skull, EyeOff } from "lucide-react";

interface PlayerListProps {
  replay: ReplayFile;
  decodedRound: DecodedRound;
  filterSide?: "CT" | "T";
}

export function PlayerList({ replay, decodedRound, filterSide }: PlayerListProps) {
  const selectedPidx = useReplayStore((s) => s.selectedPidx);
  const setSelectedPidx = useReplayStore((s) => s.setSelectedPidx);
  const setLayer = useReplayStore((s) => s.setLayer);
  const autoLayer = useReplayStore((s) => s.autoLayer);
  const uiFrame = useReplayStore((s) => s.uiFrame);

  // Split players into CT and T
  const ctPlayers: { pidx: number; def: ReplayFile["players"][0] }[] = [];
  const tPlayers: { pidx: number; def: ReplayFile["players"][0] }[] = [];

  replay.players.forEach((p, idx) => {
    const isTeamA = p.team === "A";
    const side = isTeamA
      ? decodedRound.side_a
      : decodedRound.side_a === "CT"
      ? "T"
      : "CT";

    if (side === "CT") {
      ctPlayers.push({ pidx: idx, def: p });
    } else {
      tPlayers.push({ pidx: idx, def: p });
    }
  });

  const handlePlayerClick = (pidx: number) => {
    if (selectedPidx === pidx) {
      setSelectedPidx(null);
    } else {
      setSelectedPidx(pidx);
      // Auto-switch layer if autoLayer is on
      const track = decodedRound.tracks[pidx];
      if (track && autoLayer) {
        const frame = Math.min(uiFrame, track.n - 1);
        const l = track.l[frame] || 0;
        setLayer(l as 0 | 1);
      }
    }
  };

  const renderRoster = (
    players: { pidx: number; def: ReplayFile["players"][0] }[],
    teamSide: "CT" | "T"
  ) => {
    const isCT = teamSide === "CT";
    const teamColor = isCT ? "text-blue-400" : "text-amber-400";
    const headerBorder = isCT ? "border-blue-500/50" : "border-amber-500/50";
    const teamBadgeBg = isCT ? "bg-blue-500/20 text-blue-300" : "bg-amber-500/20 text-amber-300";

    return (
      <div className="h-[285px] min-h-[285px] max-h-[285px] flex-shrink-0 bg-obsidian-card/90 rounded-xl border border-obsidian-border p-3 flex flex-col justify-between backdrop-blur-sm shadow-xl select-none">
        {/* Roster Header */}
        <div className={`flex items-center justify-between pb-2 border-b ${headerBorder} flex-shrink-0`}>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${teamBadgeBg}`}>
              {teamSide}
            </span>
            <span className={`text-xs font-mono font-bold uppercase tracking-wider ${teamColor}`}>
              {isCT
                ? decodedRound.side_a === "CT"
                  ? "Team A"
                  : "Team B"
                : decodedRound.side_a === "T"
                ? "Team A"
                : "Team B"}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {players.filter((p) => {
              const track = decodedRound.tracks[p.pidx];
              return track && uiFrame < track.n;
            }).length}{" "}
            ALIVE
          </span>
        </div>

        {/* 5 Fixed-Height Player Rows */}
        <div className="space-y-1 flex-1 flex flex-col justify-between pt-1">
          {players.map(({ pidx, def }) => {
            const track = decodedRound.tracks[pidx];
            const isAlive = track ? uiFrame < track.n : false;
            const currentFrame = track ? Math.min(uiFrame, track.n - 1) : 0;
            const hp = track ? track.hp[currentFrame] ?? 0 : 0;
            const weaponIdx = track ? track.w[currentFrame] ?? 0 : 0;
            const weaponName = replay.weapons[weaponIdx] || "";
            const isBlinded = track ? track.blinded[currentFrame] === 1 : false;
            const isSelected = selectedPidx === pidx;

            return (
              <button
                key={pidx}
                onClick={() => handlePlayerClick(pidx)}
                className={`w-full h-[42px] min-h-[42px] max-h-[42px] flex items-center justify-between px-2.5 py-1 rounded-lg border text-left transition-colors ${
                  !isAlive
                    ? "bg-obsidian-deep/60 border-obsidian-border/50 opacity-65 hover:opacity-85"
                    : isSelected
                    ? isCT
                      ? "bg-blue-950/60 border-blue-400 text-white shadow-md shadow-blue-500/20"
                      : "bg-amber-950/60 border-amber-400 text-white shadow-md shadow-amber-500/20"
                    : "bg-obsidian-surface hover:bg-obsidian-surface/80 border-obsidian-border hover:border-obsidian-border-active text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Alive Dot or Dead Skull */}
                  {isAlive ? (
                    <div
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        isCT ? "bg-blue-500" : "bg-amber-500"
                      }`}
                    />
                  ) : (
                    <Skull className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  )}

                  {/* 2-line constant height name + weapon */}
                  <div className="flex flex-col min-w-0 justify-center h-[32px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold truncate max-w-[125px] leading-tight ${!isAlive ? "text-slate-500 line-through" : ""}`}>
                        {def.name}
                      </span>
                      {isBlinded && isAlive && (
                        <span title="Blinded">
                          <EyeOff className="w-3 h-3 text-white animate-pulse" />
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-mono truncate leading-tight ${!isAlive ? "text-slate-600 line-through" : "text-slate-400"}`}>
                      {weaponName || (!isAlive ? "eliminated" : "knife")}
                    </span>
                  </div>
                </div>

                {/* Constant height HP display + track */}
                <div className="flex flex-col items-end justify-center h-[32px] gap-1 flex-shrink-0 ml-2">
                  <span
                    className={`text-[11px] font-mono font-bold leading-none ${
                      !isAlive
                        ? "text-slate-500"
                        : hp > 50
                        ? "text-emerald-400"
                        : hp > 20
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  >
                    {isAlive ? `${hp} HP` : "DEAD"}
                  </span>
                  <div className="w-14 h-1.5 bg-obsidian-deep rounded-full overflow-hidden border border-obsidian-border/50">
                    <div
                      className={`h-full rounded-full transition-[width] duration-200 ease-out ${
                        !isAlive
                          ? "w-0 bg-transparent"
                          : hp > 50
                          ? "bg-emerald-500"
                          : hp > 20
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      style={{ width: isAlive ? `${Math.max(0, Math.min(100, hp))}%` : "0%" }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (filterSide === "CT") {
    return renderRoster(ctPlayers, "CT");
  }

  if (filterSide === "T") {
    return renderRoster(tPlayers, "T");
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {renderRoster(ctPlayers, "CT")}
      {renderRoster(tPlayers, "T")}
    </div>
  );
}
