"use client";

import React, { useEffect, useRef } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Layers,
  Sparkles,
  Flame,
  Shield,
  Crosshair,
} from "lucide-react";
import { useReplayStore } from "@/lib/store";
import { ReplayFile } from "@/lib/types";
import { DecodedRound } from "@/lib/replay/decode";
import { ReplayClock } from "@/lib/replay/clock";
import { hasMultiLayer } from "@/lib/replay/project";

interface ControlsProps {
  replay: ReplayFile;
  decodedRound: DecodedRound;
  clock: ReplayClock;
  onSelectRound: (roundIdx: number) => void;
}

export function Controls({
  replay,
  decodedRound,
  clock,
  onSelectRound,
}: ControlsProps) {
  const playing = useReplayStore((s) => s.playing);
  const speed = useReplayStore((s) => s.speed);
  const layer = useReplayStore((s) => s.layer);
  const autoLayer = useReplayStore((s) => s.autoLayer);
  const roundIdx = useReplayStore((s) => s.roundIdx);
  const uiFrame = useReplayStore((s) => s.uiFrame);

  const togglePlaying = useReplayStore((s) => s.togglePlaying);
  const setSpeed = useReplayStore((s) => s.setSpeed);
  const setLayer = useReplayStore((s) => s.setLayer);
  const setAutoLayer = useReplayStore((s) => s.setAutoLayer);

  const scrubberRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef<boolean>(false);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const timeTextRef = useRef<HTMLSpanElement>(null);
  const frameTextRef = useRef<HTMLSpanElement>(null);

  const nf = decodedRound.nf;
  const supportsMultiLayer = hasMultiLayer(replay.map);

  // High-frequency 60/120 FPS scrubber bar updates outside React render cycle
  useEffect(() => {
    return clock.subscribe((playhead) => {
      if (progressFillRef.current && nf > 1) {
        const pct = Math.max(0, Math.min(100, (playhead / (nf - 1)) * 100));
        progressFillRef.current.style.width = `${pct}%`;
      }
      if (timeTextRef.current) {
        timeTextRef.current.textContent = formatTime(Math.floor(playhead));
      }
      if (frameTextRef.current) {
        frameTextRef.current.textContent = `FRAME ${Math.floor(playhead)} / ${nf}`;
      }
    });
  }, [clock, nf]);

  // 1. Keyboard shortcuts: Space (Play/Pause), Left/Right (±16 frames / ±2s)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        clock.toggle();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        clock.seek(clock.playheadRef.current - 16);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        clock.seek(clock.playheadRef.current + 16);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clock, togglePlaying]);

  // 2. Scrubber seeking logic
  const handleScrubberPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const bar = scrubberRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetFrame = Math.floor(ratio * (nf - 1));
    clock.seek(targetFrame);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isScrubbingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleScrubberPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    handleScrubberPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isScrubbingRef.current = false;
  };

  const handleScrubberKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let targetFrame = uiFrame;
    const stepSmall = e.shiftKey ? 1 : 8; // 1 frame or 1 second (8 frames)
    const stepLarge = 40; // 5 seconds (40 frames)

    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        targetFrame = Math.max(0, uiFrame - stepSmall);
        break;
      case "ArrowRight":
      case "ArrowUp":
        targetFrame = Math.min(nf - 1, uiFrame + stepSmall);
        break;
      case "PageDown":
        targetFrame = Math.max(0, uiFrame - stepLarge);
        break;
      case "PageUp":
        targetFrame = Math.min(nf - 1, uiFrame + stepLarge);
        break;
      case "Home":
        targetFrame = 0;
        break;
      case "End":
        targetFrame = Math.max(0, nf - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
    clock.seek(targetFrame);
  };

  // Convert frame to seconds mm:ss
  const formatTime = (frame: number) => {
    const secs = Math.floor(frame / 8);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = nf > 1 ? (uiFrame / (nf - 1)) * 100 : 0;
  const freezeEndPercent = nf > 1 ? (decodedRound.fe / (nf - 1)) * 100 : 0;

  return (
    <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border px-4 py-2.5 shadow-2xl backdrop-blur-sm space-y-2 relative overflow-hidden flex-shrink-0">
      {/* Top Track Bar: Scrubber with timeline markers */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400">
          <span ref={timeTextRef} className="font-bold text-slate-200">
            {formatTime(uiFrame)}
          </span>
          <span ref={frameTextRef} className="text-[11px] text-slate-500 tracking-wider">
            FRAME {uiFrame} / {nf}
          </span>
          <span className="text-slate-400">{formatTime(nf - 1)}</span>
        </div>

        {/* Interactive Scrubber Bar */}
        <div
          ref={scrubberRef}
          role="slider"
          tabIndex={0}
          aria-label="Replay timeline scrubber"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, nf - 1)}
          aria-valuenow={uiFrame}
          aria-valuetext={`Frame ${uiFrame} of ${nf}`}
          onKeyDown={handleScrubberKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative w-full h-4 bg-obsidian-surface border border-obsidian-border rounded-full cursor-pointer flex items-center group py-2 focus:outline-none focus:ring-2 focus:ring-rust focus:ring-offset-2 focus:ring-offset-obsidian-card"
        >
          {/* Progress fill */}
          <div
            ref={progressFillRef}
            className="h-2 bg-gradient-to-r from-rust to-amber-500 rounded-full pointer-events-none relative will-change-[width]"
            style={{ width: `${progressPercent}%` }}
          >
            {/* Scrubber thumb */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-md border-2 border-rust scale-75 group-hover:scale-100 transition-transform" />
          </div>

          {/* Freeze-end vertical marker */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-slate-600 pointer-events-none"
            style={{ left: `${freezeEndPercent}%` }}
            title="Freeze End"
          />

          {/* Kill markers (red dots) */}
          {decodedRound.kills.map((k, idx) => {
            const killFrame = k[0];
            const pct = (killFrame / (nf - 1)) * 100;
            const killerName = replay.players[k[1]]?.name || "World";
            const victimName = replay.players[k[2]]?.name || "Player";

            return (
              <div
                key={idx}
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-rose-500 border border-white pointer-events-none hover:scale-150 transition-transform"
                style={{ left: `${pct}%` }}
                title={`Kill at frame ${killFrame}: ${killerName} ➔ ${victimName}`}
              />
            );
          })}

          {/* Bomb plant marker (gold dot) */}
          {decodedRound.bomb?.plant && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 border border-black pointer-events-none"
              style={{ left: `${(decodedRound.bomb.plant[0] / (nf - 1)) * 100}%` }}
              title="Bomb Planted"
            />
          )}
        </div>
      </div>

      {/* Bottom Controls Row: Play/Pause, Speed, Rounds, Layer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => clock.seek(0)}
            title="Restart Round"
            className="p-2 rounded-lg bg-obsidian-surface hover:bg-obsidian-surface/80 border border-obsidian-border text-slate-300 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => clock.seek(clock.playheadRef.current - 16)}
            title="Rewind 2s (Left Arrow)"
            className="p-2 rounded-lg bg-obsidian-surface hover:bg-obsidian-surface/80 border border-obsidian-border text-slate-300 hover:text-white transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => clock.toggle()}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            className="flex items-center justify-center w-11 h-11 rounded-lg bg-rust hover:bg-rust-hover text-white shadow-lg shadow-rust/20 transition-all hover:scale-105 active:scale-95"
          >
            {playing ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={() => clock.seek(clock.playheadRef.current + 16)}
            title="Forward 2s (Right Arrow)"
            className="p-2 rounded-lg bg-obsidian-surface hover:bg-obsidian-surface/80 border border-obsidian-border text-slate-300 hover:text-white transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Speed Selector */}
          <div className="inline-flex rounded-lg bg-obsidian-surface border border-obsidian-border p-0.5 ml-2">
            {([0.5, 1, 2, 4] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md transition-colors ${
                  speed === s
                    ? "bg-rust text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Round Selector & Map Layer Toggles */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Round Selector Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Round:</span>
            <select
              value={roundIdx}
              aria-label="Select round"
              onChange={(e) => onSelectRound(parseInt(e.target.value, 10))}
              className="bg-obsidian-surface border border-obsidian-border text-white text-xs font-mono font-semibold py-1.5 px-3 rounded-lg focus:outline-none focus:border-rust cursor-pointer"
            >
              {replay.rounds.map((r, i) => (
                <option key={r.n} value={i} className="bg-obsidian-deep">
                  Round {r.n} ({r.winner} win • {r.score[0]}:{r.score[1]})
                </option>
              ))}
            </select>
          </div>

          {/* Upper/Lower Layer Toggle (Nuke/Vertigo) */}
          {supportsMultiLayer && (
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-obsidian-surface border border-obsidian-border p-0.5">
                <button
                  onClick={() => setLayer(0)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors ${
                    layer === 0
                      ? "bg-rust text-white shadow-sm font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Upper
                </button>
                <button
                  onClick={() => setLayer(1)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors ${
                    layer === 1
                      ? "bg-rust text-white shadow-sm font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Lower
                </button>
              </div>

              <button
                onClick={() => setAutoLayer(!autoLayer)}
                title="Automatically switch radar layer to follow selected player"
                className={`px-2 py-1 text-[11px] font-mono font-medium rounded-md border transition-colors ${
                  autoLayer
                    ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-400"
                    : "bg-obsidian-surface border-obsidian-border text-slate-500 hover:text-slate-300"
                }`}
              >
                Auto-follow
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
