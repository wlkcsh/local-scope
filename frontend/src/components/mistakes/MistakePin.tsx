"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertTriangle, EyeOff, DollarSign, Skull, Package, Zap } from "lucide-react";
import { MistakeRow } from "@/lib/types";
import { projectWorldToRadar } from "@/lib/replay/project";

interface MistakePinProps {
  mistake: MistakeRow;
  mapName: string;
  activeLayer: number;
  playerName?: string;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function MistakePin({
  mistake,
  mapName,
  activeLayer,
  playerName,
  isSelected = false,
  onSelect,
}: MistakePinProps) {
  const [hovered, setHovered] = useState(false);

  const { percentX, percentY, layer } = projectWorldToRadar(
    mapName,
    mistake.x,
    mistake.y,
    mistake.z
  );

  const isCurrentLayer = mistake.layer === activeLayer;

  const getTypeConfig = (type: MistakeRow["type"]) => {
    switch (type) {
      case "unspent_utility":
        return {
          icon: DollarSign,
          color: "bg-amber-500",
          border: "border-amber-300",
          glow: "shadow-amber-500/50",
          label: "Unspent Utility",
        };
      case "team_flash":
        return {
          icon: EyeOff,
          color: "bg-purple-500",
          border: "border-purple-300",
          glow: "shadow-purple-500/50",
          label: "Team Flash",
        };
      case "untraded_early_death":
        return {
          icon: Skull,
          color: "bg-rose-500",
          border: "border-rose-300",
          glow: "shadow-rose-500/50",
          label: "Untraded Early Death",
        };
      case "died_holding_utility":
        return {
          icon: Package,
          color: "bg-orange-500",
          border: "border-orange-300",
          glow: "shadow-orange-500/50",
          label: "Holding Utility / Knife",
        };
      case "self_flash_death":
        return {
          icon: Zap,
          color: "bg-yellow-500",
          border: "border-yellow-300",
          glow: "shadow-yellow-500/50",
          label: "Self-Flash Death",
        };
      default:
        return {
          icon: AlertTriangle,
          color: "bg-yellow-500",
          border: "border-yellow-300",
          glow: "shadow-yellow-500/50",
          label: "Mistake",
        };
    }
  };

  const config = getTypeConfig(mistake.type);
  const Icon = config.icon;

  const sizeClasses = {
    1: "w-5 h-5",
    2: "w-6 h-6 ring-2 ring-white/40",
    3: "w-7 h-7 ring-2 ring-white/70 animate-pulse",
  }[mistake.severity];

  const replayTick = Math.max(0, mistake.tick - 192);
  const replayUrl = `/matches/${mistake.match_id}/replay?round=${mistake.round}&tick=${replayTick}`;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-200"
      style={{
        left: `${percentX}%`,
        top: `${percentY}%`,
        opacity: isCurrentLayer ? 1 : 0.25,
        zIndex: isSelected || hovered ? 40 : 20,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      <Link href={replayUrl} className="block relative group">
        <div
          className={`flex items-center justify-center rounded-full text-black font-bold border ${config.border} ${config.color} ${sizeClasses} shadow-lg ${config.glow}`}
        >
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>

        {/* Hover / selected Tooltip */}
        {(hovered || isSelected) && isCurrentLayer && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2.5 bg-surface-subtle/95 border border-surface-border backdrop-blur-md rounded-lg shadow-2xl text-left pointer-events-none z-50">
            <div className="flex items-center justify-between text-xs pb-1 mb-1 border-b border-surface-border">
              <span className="font-semibold text-white">{config.label}</span>
              <span className="text-[10px] font-mono px-1 rounded bg-surface border border-surface-border text-slate-300">
                R{mistake.round}
              </span>
            </div>
            {playerName && (
              <div className="text-xs text-slate-300 mb-1 font-medium">
                {playerName}
              </div>
            )}
            <div className="text-[11px] text-slate-400">
              {mistake.type === "unspent_utility" && (
                <span>
                  Died with ${mistake.meta?.value || 0} in nades:{" "}
                  {Array.isArray(mistake.meta?.items)
                    ? mistake.meta.items.join(", ")
                    : ""}
                </span>
              )}
              {mistake.type === "team_flash" && (
                <span>
                  Blinded teammate for{" "}
                  {typeof mistake.meta?.duration === "number"
                    ? mistake.meta.duration.toFixed(1)
                    : "?"}
                  s
                </span>
              )}
              {mistake.type === "untraded_early_death" && (
                <span>
                  Died {mistake.meta?.secs_into_round?.toFixed(1) || "?"}s into round without trade
                </span>
              )}
              {mistake.type === "died_holding_utility" && (
                <span>
                  Killed holding {mistake.meta?.weapon_held || "utility"}
                  {mistake.meta?.killer_weapon ? ` by ${mistake.meta.killer_weapon}` : ""}
                </span>
              )}
              {mistake.type === "self_flash_death" && (
                <span>
                  Died while blinded by self ({typeof mistake.meta?.blind_duration === "number" ? mistake.meta.blind_duration.toFixed(1) : "?"}s)
                </span>
              )}
            </div>
            <div className="text-[10px] text-cs2-ct font-semibold mt-1.5 flex items-center gap-1">
              <span>Click to watch 2D (tick {replayTick})</span>
            </div>
          </div>
        )}
      </Link>
    </div>
  );
}
