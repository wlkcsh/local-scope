"use client";

import React from "react";
import Link from "next/link";
import { Play, Download, Flame, Crosshair, Eye, ShieldAlert, Sparkles } from "lucide-react";
import { HighlightRow } from "@/lib/types";
import { CopyCommandButton } from "./CopyCommandButton";

interface HighlightCardProps {
  highlight: HighlightRow;
  playerName: string;
  demoUrl?: string | null;
}

export function HighlightCard({
  highlight,
  playerName,
  demoUrl,
}: HighlightCardProps) {
  const getBadgeInfo = (type: HighlightRow["type"]) => {
    switch (type) {
      case "ace":
        return { label: "ACE", bg: "bg-red-500/20 text-red-400 border-red-500/40", icon: Flame };
      case "4k":
        return { label: "4K", bg: "bg-orange-500/20 text-orange-400 border-orange-500/40", icon: Flame };
      case "3k":
        return { label: "3K", bg: "bg-amber-500/20 text-amber-400 border-amber-500/40", icon: Crosshair };
      case "clutch":
        return {
          label: `1v${highlight.meta?.vs || "?"} CLUTCH`,
          bg: "bg-purple-500/20 text-purple-400 border-purple-500/40",
          icon: ShieldAlert,
        };
      case "spray_transfer":
        return {
          label: "SPRAY TRANSFER",
          bg: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
          icon: Sparkles,
        };
      case "wallbang":
        return { label: "WALLBANG", bg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40", icon: Crosshair };
      case "smoke_kill":
        return { label: "THRU SMOKE", bg: "bg-slate-500/20 text-slate-300 border-slate-500/40", icon: Eye };
      case "noscope":
        return { label: "NOSCOPE", bg: "bg-pink-500/20 text-pink-400 border-pink-500/40", icon: Crosshair };
      case "blind_kill":
        return { label: "BLIND KILL", bg: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", icon: Eye };
      default:
        return { label: type, bg: "bg-blue-500/20 text-blue-400 border-blue-500/40", icon: Crosshair };
    }
  };

  const badge = getBadgeInfo(highlight.type);
  const Icon = badge.icon;

  const replayUrl = `/matches/${highlight.match_id}/replay?round=${highlight.round}&tick=${highlight.start_tick}`;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-obsidian-surface hover:bg-obsidian-surface/80 rounded-lg border border-obsidian-border hover:border-obsidian-border-active transition-all gap-3.5">
      <div className="flex items-center gap-3.5">
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-md border ${badge.bg}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded border ${badge.bg}`}
            >
              {badge.label}
            </span>
            <span className="text-xs font-mono text-slate-400">
              ROUND {highlight.round}
            </span>
            {highlight.weapon && (
              <span className="text-xs font-mono text-slate-300 bg-obsidian-deep px-2 py-0.5 rounded border border-obsidian-border">
                {highlight.weapon}
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-slate-200 mt-1">
            <span className="font-display text-base font-semibold text-white tracking-wide">{playerName}</span>
            {highlight.type === "clutch" && (
              <span className="text-slate-400 text-xs font-mono ml-2">
                VICTORY 1v{highlight.meta?.vs}
              </span>
            )}
            {highlight.type === "spray_transfer" && highlight.meta?.span_ms && (
              <span className="text-slate-400 text-xs font-mono ml-2">
                IN {(highlight.meta.span_ms / 1000).toFixed(2)}s
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
        <Link
          href={replayUrl}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono font-bold text-white bg-rust hover:bg-rust-hover rounded transition-colors shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>WATCH REPLAY</span>
        </Link>

        <CopyCommandButton
          startTick={highlight.start_tick}
          playerName={playerName}
        />

        {demoUrl && (demoUrl.startsWith("http://") || demoUrl.startsWith("https://")) && (
          <a
            href={demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Download raw demo"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono font-medium text-slate-400 hover:text-slate-200 bg-obsidian-deep border border-obsidian-border rounded transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">DEMO</span>
          </a>
        )}
      </div>
    </div>
  );
}
