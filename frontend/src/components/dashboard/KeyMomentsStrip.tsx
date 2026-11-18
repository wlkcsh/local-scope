import React from "react";
import Link from "next/link";
import { Trophy, Flame, Sparkles, Play } from "lucide-react";
import { KeyMomentItem } from "@/lib/insights";

interface KeyMomentsStripProps {
  matchId: string;
  clutches: KeyMomentItem[];
  multiKills: KeyMomentItem[];
  uniqueKills: KeyMomentItem[];
  focusedSteamid?: string | null;
}

const BADGE_TONE_CLASSES: Record<KeyMomentItem["badgeTone"], string> = {
  amber: "bg-amber-500/15 border-amber-500/35 text-amber-400",
  emerald: "bg-emerald-500/15 border-emerald-500/35 text-emerald-400",
  rose: "bg-rose-500/15 border-rose-500/35 text-rose-400",
  sky: "bg-blue-500/20 border-sky-500/35 text-sky-400",
  purple: "bg-purple-500/15 border-purple-500/35 text-purple-400",
  rust: "bg-rust-subtle border-rust/35 text-rust",
};

export function KeyMomentsStrip({
  matchId,
  clutches,
  multiKills,
  uniqueKills,
  focusedSteamid,
}: KeyMomentsStripProps) {
  const renderBucket = (
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    items: KeyMomentItem[],
    emptyText: string
  ) => (
    <div className="bg-obsidian-card/90 rounded-xl border border-obsidian-border p-4 flex flex-col">
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-obsidian-border">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold tracking-wider uppercase text-white">
            {icon}
            <span>{title}</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-obsidian-subtle border border-obsidian-border text-[10px] font-mono font-bold text-slate-300 tabular-nums">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-5 text-center text-[11px] font-mono text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
          {items.map((item) => {
            const isFocused = focusedSteamid && item.steamid === focusedSteamid;
            const replayHref = `/matches/${encodeURIComponent(matchId)}/replay?round=${item.round}&tick=${Math.max(0, item.startTick)}`;

            return (
              <Link
                key={item.id}
                href={replayHref}
                title={`Watch ${item.playerName}'s ${item.badge} in Round ${item.round}`}
                className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border transition-all ${
                  isFocused
                    ? "bg-obsidian-surface border-rust/60 shadow-sm"
                    : "bg-obsidian-surface/80 border-obsidian-border hover:border-rust/50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold uppercase flex-shrink-0 ${
                      BADGE_TONE_CLASSES[item.badgeTone]
                    }`}
                  >
                    {item.badge}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      item.team === "A" ? "bg-cs2-ct" : "bg-cs2-t"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate leading-tight">
                      {item.playerName}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate leading-tight">
                      {item.weaponLabel}
                      {item.subtitle ? ` · ${item.subtitle}` : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-obsidian-subtle">
                    R{item.round}
                  </span>
                  <Play className="w-3 h-3 text-slate-400 group-hover:text-rust fill-current transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
      {renderBucket(
        "Clutches Won",
        "1v1 to 1v5 round saves · click to watch",
        <Trophy className="w-3.5 h-3.5 text-amber-400" />,
        clutches,
        "No clutches won this match"
      )}
      {renderBucket(
        "Multi-Kills & Aces",
        "3K, 4K & 5K Ace rounds · click to watch",
        <Flame className="w-3.5 h-3.5 text-rose-400" />,
        multiKills,
        "No 3K, 4K, or 5K Ace rounds recorded"
      )}
      {renderBucket(
        "Unique Kills",
        "No-scopes, wallbangs, smoke & blind kills",
        <Sparkles className="w-3.5 h-3.5 text-purple-400" />,
        uniqueKills,
        "No special kills recorded"
      )}
    </div>
  );
}
