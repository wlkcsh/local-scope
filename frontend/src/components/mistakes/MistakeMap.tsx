"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Layers, MapPin, Filter } from "lucide-react";
import { MistakeRow, PlayerMatchStatRow } from "@/lib/types";
import { getRadarImageUrl, hasMultiLayer } from "@/lib/replay/project";
import { MistakePin } from "./MistakePin";

interface MistakeMapProps {
  mapName: string;
  mistakes: MistakeRow[];
  playerStats: PlayerMatchStatRow[];
  focusedSteamid?: string | null;
  selectedMistakeId?: number | null;
  onSelectMistake?: (id: number) => void;
}

export function MistakeMap({
  mapName,
  mistakes,
  playerStats,
  focusedSteamid,
  selectedMistakeId,
  onSelectMistake,
}: MistakeMapProps) {
  const [activeLayer, setActiveLayer] = useState<number>(0);
  const [filterType, setFilterType] = useState<string>("all");
  const [onlyFocused, setOnlyFocused] = useState<boolean>(true);

  const supportsMultiLayer = hasMultiLayer(mapName);
  const radarUrl = getRadarImageUrl(mapName, activeLayer);

  // Map steamids to player names
  const playerNames = new Map<string, string>();
  for (const p of playerStats) {
    playerNames.set(p.steamid, p.name);
  }

  const filteredMistakes = mistakes.filter((m) => {
    if (onlyFocused && focusedSteamid && m.steamid !== focusedSteamid) {
      return false;
    }
    if (filterType !== "all" && m.type !== filterType) {
      return false;
    }
    return true;
  });

  return (
    <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-5 flex flex-col relative overflow-hidden backdrop-blur-sm">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-obsidian-border gap-3">
        <div>
          <div className="label-rust text-[10px] tracking-[0.22em] font-bold mb-0.5">
            SPATIAL TELEMETRY
          </div>
          <div className="flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-rose-400" />
            <h3 className="font-display text-base font-medium tracking-wide text-white uppercase">
              Mistake Radar
            </h3>
            <span className="telemetry-tag font-mono">
              {filteredMistakes.length} FLAGS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Focused Player Filter */}
          {focusedSteamid && (
            <button
              onClick={() => setOnlyFocused(!onlyFocused)}
              className={`px-2.5 py-1 rounded border font-mono text-[11px] transition-colors ${
                onlyFocused
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-300 font-bold"
                  : "bg-obsidian-surface border-obsidian-border text-slate-400 hover:text-slate-200"
              }`}
            >
              SUBJECT ONLY
            </button>
          )}

          {/* Type filter */}
          <div className="flex items-center gap-1 bg-obsidian-surface border border-obsidian-border rounded p-0.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <select
              value={filterType}
              aria-label="Filter mistakes by type"
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-transparent text-slate-300 py-0.5 px-2 text-xs font-mono focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-obsidian-deep">ALL ANOMALIES</option>
              <option value="unspent_utility" className="bg-obsidian-deep">UNSPENT UTILITY ($500+)</option>
              <option value="team_flash" className="bg-obsidian-deep">TEAM FLASHES (&gt;1.5s)</option>
              <option value="untraded_early_death" className="bg-obsidian-deep">UNTRADED DEATHS (&lt;15s)</option>
            </select>
          </div>

          {/* Multi-layer Toggle (Nuke, Vertigo) */}
          {supportsMultiLayer && (
            <div className="inline-flex rounded-md border border-obsidian-border bg-obsidian-surface p-0.5">
              <button
                onClick={() => setActiveLayer(0)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors ${
                  activeLayer === 0
                    ? "bg-rust text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Layers className="w-3 h-3" />
                UPPER
              </button>
              <button
                onClick={() => setActiveLayer(1)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors ${
                  activeLayer === 1
                    ? "bg-rust text-white shadow-sm font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Layers className="w-3 h-3" />
                LOWER
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Radar Map Container with Exact 1024x1024 Aspect Ratio */}
      <div className="mt-4 flex-1 flex flex-col items-center justify-center">
        <div className="relative w-full max-w-[540px] aspect-square rounded-lg overflow-hidden border border-obsidian-border bg-obsidian-deep shadow-2xl select-none">
          {/* Radar Background Image */}
          <img
            src={radarUrl}
            alt={`${mapName} Radar`}
            className="w-full h-full object-cover pointer-events-none"
            loading="eager"
          />

          {/* Render Mistake Pins */}
          {filteredMistakes.map((m) => (
            <MistakePin
              key={m.id}
              mistake={m}
              mapName={mapName}
              activeLayer={activeLayer}
              playerName={playerNames.get(m.steamid)}
              isSelected={selectedMistakeId === m.id}
              onSelect={() => onSelectMistake && onSelectMistake(m.id)}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs font-mono text-slate-400 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>UNSPENT UTILITY</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <span>TEAM FLASH</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>UNTRADED DEATH</span>
          </div>
          {supportsMultiLayer && (
            <span className="text-[11px] text-slate-500">
              * Dimmed pins are on opposite layer
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
