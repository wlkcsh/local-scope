"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Activity, ChevronLeft, ChevronRight, Crosshair, Shield, Bomb } from "lucide-react";
import { ReplayFile } from "@/lib/types";
import { decodeRound, DecodedRound } from "@/lib/replay/decode";
import { ReplayClock } from "@/lib/replay/clock";
import { useReplayStore } from "@/lib/store";
import { RadarCanvas } from "./RadarCanvas";
import { Controls } from "./Controls";
import { KillFeed } from "./KillFeed";
import { PlayerList } from "./PlayerList";

interface ReplayPlayerProps {
  replay: ReplayFile;
  initialRound?: number; // 1-based round
  initialTick?: number;
}

export function ReplayPlayer({
  replay,
  initialRound = 1,
  initialTick,
}: ReplayPlayerProps) {
  // Find round index matching initialRound (1-based to 0-based index)
  const initialRoundIdx = Math.max(
    0,
    Math.min(
      replay.rounds.length - 1,
      replay.rounds.findIndex((r) => r.n === initialRound) !== -1
        ? replay.rounds.findIndex((r) => r.n === initialRound)
        : initialRound - 1
    )
  );

  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(initialRoundIdx);
  const setStoreReplay = useReplayStore((s) => s.setReplay);
  const setStoreRoundIdx = useReplayStore((s) => s.setRoundIdx);

  // ReplayClock manages 60fps rAF loop outside React VDOM
  const [clock] = useState(() => new ReplayClock());

  // Bind store and dispose clock on unmount
  useEffect(() => {
    clock.bindStore();
    return () => {
      clock.dispose();
      useReplayStore.getState().reset();
    };
  }, [clock]);

  // Decode active round lazily & cached
  const decodedRound: DecodedRound = useMemo(() => {
    return decodeRound(replay, currentRoundIdx);
  }, [replay, currentRoundIdx]);

  // Handle round setup and initial tick seek
  const initialSeekDoneRef = useRef(false);
  useEffect(() => {
    setStoreReplay(replay);
    setStoreRoundIdx(currentRoundIdx);
    clock.setMaxFrames(decodedRound.nf);

    if (!initialSeekDoneRef.current && initialTick != null) {
      const targetFrame = Math.max(
        0,
        Math.min(
          decodedRound.nf - 1,
          Math.floor((initialTick - decodedRound.t0) / replay.frame_step)
        )
      );
      clock.seek(targetFrame);
      initialSeekDoneRef.current = true;
    } else if (!initialSeekDoneRef.current) {
      clock.seek(0);
      initialSeekDoneRef.current = true;
    }
  }, [replay, currentRoundIdx, decodedRound, initialTick, clock, setStoreReplay, setStoreRoundIdx]);

  const handleSelectRound = (roundIdx: number) => {
    setCurrentRoundIdx(roundIdx);
    setStoreRoundIdx(roundIdx);
    clock.stop();
    clock.seek(0);
  };

  const currentRound = replay.rounds[currentRoundIdx];

  return (
    <div className="h-[calc(100dvh-4rem)] w-full flex flex-col p-2 sm:p-3 gap-2 overflow-hidden select-none bg-obsidian-deep">
      {/* 1. Tactical Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-obsidian-card/90 border border-obsidian-border text-xs flex-shrink-0 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/matches/${replay.match_id}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-obsidian-surface hover:bg-obsidian-surface/80 border border-obsidian-border text-xs font-mono font-medium text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>DOSSIER</span>
          </Link>
          <span className="text-slate-600 font-mono text-xs">•</span>
          <span className="px-2 py-0.5 rounded bg-obsidian-surface border border-obsidian-border text-[11px] font-mono font-bold uppercase tracking-wider text-slate-200">
            {replay.map}
          </span>

          {/* Quick Round Navigation */}
          <div className="flex items-center gap-1 ml-1 bg-obsidian-surface px-2 py-0.5 rounded-lg border border-obsidian-border font-mono text-xs">
            <button
              disabled={currentRoundIdx <= 0}
              onClick={() => handleSelectRound(currentRoundIdx - 1)}
              className="p-0.5 rounded hover:text-white text-slate-400 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
              title="Previous Round"
              aria-label="Previous Round"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-200 px-1">
              ROUND {currentRound.n} / {replay.rounds.length}
            </span>
            <button
              disabled={currentRoundIdx >= replay.rounds.length - 1}
              onClick={() => handleSelectRound(currentRoundIdx + 1)}
              className="p-0.5 rounded hover:text-white text-slate-400 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
              title="Next Round"
              aria-label="Next Round"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: Live Round Score & Outcome */}
        <div className="flex items-center gap-2.5 px-3 py-1 rounded-lg bg-obsidian-surface border border-obsidian-border font-mono">
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <span className={currentRound.side_a === "CT" ? "text-cs2-ct font-extrabold" : "text-cs2-t font-extrabold"}>
              {currentRound.score[0]}
            </span>
            <span className="text-slate-600">:</span>
            <span className={currentRound.side_a === "CT" ? "text-cs2-t font-extrabold" : "text-cs2-ct font-extrabold"}>
              {currentRound.score[1]}
            </span>
          </div>
          <span className="text-slate-600 text-xs">•</span>
          <span className={`text-[11px] font-bold uppercase tracking-wider ${currentRound.winner === "CT" ? "text-cs2-ct" : "text-cs2-t"}`}>
            {currentRound.winner} WIN
          </span>
          <span className="text-[10px] text-slate-400 tracking-tight capitalize hidden sm:inline">
            ({currentRound.reason.replace(/_/g, " ")})
          </span>
        </div>

        {/* Right: Telemetry Engine Badge */}
        <div className="hidden md:flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
          <Activity className="w-3.5 h-3.5 text-rust" />
          <span>{replay.tick_rate} TICK • 8 HZ 2D COCKPIT</span>
        </div>
      </div>

      {/* 2. Main 3-Column Scope.gg Cockpit Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-2 sm:gap-3 items-stretch">
        {/* Left Column: CT Team Roster (Top) + Tactical Telemetry (Bottom) */}
        <div className="col-span-3 xl:col-span-3 flex flex-col gap-2 min-h-0">
          <div className="flex-shrink-0">
            <PlayerList
              replay={replay}
              decodedRound={decodedRound}
              filterSide="CT"
            />
          </div>

          {/* Left Bottom: Tactical Telemetry */}
          <div className="flex-1 min-h-[140px] flex flex-col bg-obsidian-card/90 rounded-xl border border-obsidian-border p-3 backdrop-blur-sm shadow-xl overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-obsidian-border flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                  Tactical Telemetry
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                ROUND {decodedRound.n}
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 select-none">
              {/* Objective Status Banner */}
              <div className="p-2 rounded-lg bg-obsidian-surface border border-obsidian-border flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-slate-400">
                  Objective Status
                </span>
                <span className={`text-[11px] font-mono font-bold uppercase ${
                  decodedRound.bomb?.plant ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {decodedRound.bomb?.explode != null
                    ? "Detonated"
                    : decodedRound.bomb?.defuse
                    ? "Defused"
                    : decodedRound.bomb?.plant
                    ? "C4 Planted"
                    : "Sites Clear"}
                </span>
              </div>

              {/* Utility Telemetry Grid */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="p-2 rounded-lg bg-obsidian-surface/60 border border-obsidian-border/50 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">Utility Thrown</span>
                  <span className="text-sm font-mono font-bold text-slate-200">
                    {decodedRound.nades.length} nades
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-obsidian-surface/60 border border-obsidian-border/50 flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">Round Pace</span>
                  <span className="text-sm font-mono font-bold text-slate-200">
                    {Math.round(decodedRound.nf / 8)}s duration
                  </span>
                </div>
              </div>

              {/* Firefight Metrics */}
              <div className="p-2 rounded-lg bg-obsidian-surface/60 border border-obsidian-border/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Crosshair className="w-3 h-3 text-rust" />
                  <span className="text-[10px] font-mono text-slate-400">Combat Shots</span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {decodedRound.shots.frames.length} rounds fired
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Column: Radar Map Canvas (Clean & Centered) */}
        <div className="col-span-6 xl:col-span-6 flex flex-col items-center justify-center min-h-0 min-w-0 relative bg-[#07090d] rounded-xl border border-obsidian-border overflow-hidden p-1 shadow-inner">
          <RadarCanvas
            replay={replay}
            decodedRound={decodedRound}
            clock={clock}
          />
        </div>

        {/* Right Column: T Team Roster (Top) + KillFeed Combat Log (Bottom) */}
        <div className="col-span-3 xl:col-span-3 flex flex-col gap-2 min-h-0">
          {/* T Roster */}
          <div className="flex-shrink-0">
            <PlayerList
              replay={replay}
              decodedRound={decodedRound}
              filterSide="T"
            />
          </div>

          {/* Killfeed Combat Log */}
          <div className="flex-1 min-h-[140px] flex flex-col bg-obsidian-card/90 rounded-xl border border-obsidian-border p-3 backdrop-blur-sm shadow-xl overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-obsidian-border flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-rust" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                  Combat Log
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {decodedRound.kills.length} {decodedRound.kills.length === 1 ? "CASUALTY" : "CASUALTIES"}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <KillFeed
                replay={replay}
                decodedRound={decodedRound}
                clock={clock}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bottom Full-width Cockpit Controls */}
      <div className="flex-shrink-0">
        <Controls
          replay={replay}
          decodedRound={decodedRound}
          clock={clock}
          onSelectRound={handleSelectRound}
        />
      </div>
    </div>
  );
}
