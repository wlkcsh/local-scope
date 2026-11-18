"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, List, Users } from "lucide-react";
import { PlayerMatchStatRow } from "@/lib/types";
import {
  DEFAULT_SCOREBOARD_VIEW_MODE,
  ScoreboardSortField,
  ScoreboardViewMode,
  groupPlayerStatsByTeam,
  sortPlayerStats,
} from "@/lib/scoreboard";

interface ScoreboardProps {
  playerStats: PlayerMatchStatRow[];
  selectedSteamid?: string | null;
  onSelectPlayer?: (steamid: string) => void;
  teamAName?: string;
  teamBName?: string;
  scoreA?: number;
  scoreB?: number;
}

interface ColumnDef {
  field: ScoreboardSortField;
  label: string;
  align: "left" | "right";
  paddingClass: string;
}

const COLUMNS: readonly ColumnDef[] = [
  { field: "name", label: "Player", align: "left", paddingClass: "px-4" },
  { field: "kills", label: "K", align: "right", paddingClass: "px-3" },
  { field: "deaths", label: "D", align: "right", paddingClass: "px-3" },
  { field: "assists", label: "A", align: "right", paddingClass: "px-3" },
  { field: "diff", label: "+/-", align: "right", paddingClass: "px-3" },
  { field: "adr", label: "ADR", align: "right", paddingClass: "px-3" },
  { field: "hs_pct", label: "HS %", align: "right", paddingClass: "px-3" },
  { field: "kast_pct", label: "KAST %", align: "right", paddingClass: "px-3" },
  { field: "first_kills", label: "Entry", align: "right", paddingClass: "px-3" },
  { field: "trade_kills", label: "Trades", align: "right", paddingClass: "px-3" },
  { field: "utility_damage", label: "Util Dmg", align: "right", paddingClass: "px-4" },
];

interface PlayerRowProps {
  player: PlayerMatchStatRow;
  isSelected: boolean;
  showTeamBadge: boolean;
  onSelect: (steamid: string) => void;
}

function PlayerRow({
  player: p,
  isSelected,
  showTeamBadge,
  onSelect,
}: PlayerRowProps) {
  const diff = p.kills - p.deaths;
  const isTeamA = p.team === "A";

  return (
    <tr
      tabIndex={0}
      aria-selected={isSelected}
      onClick={() => onSelect(p.steamid)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(p.steamid);
        }
      }}
      className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-rust ${
        isSelected
          ? "bg-rust-subtle text-white font-medium border-l-2 border-rust"
          : "hover:bg-slate-500/10 text-slate-300"
      }`}
    >
      <td className="py-2.5 px-4 font-sans">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isTeamA ? "bg-cs2-ct" : "bg-cs2-t"
            }`}
          />
          <span className="font-semibold text-slate-100 font-sans">
            {p.name}
          </span>
          {showTeamBadge && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-obsidian-card border border-obsidian-border text-slate-400">
              Team {p.team}
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 text-right font-bold text-white">
        {p.kills}
      </td>
      <td className="py-2.5 px-3 text-right text-slate-400">
        {p.deaths}
      </td>
      <td className="py-2.5 px-3 text-right text-slate-400">
        {p.assists}
      </td>
      <td
        className={`py-2.5 px-3 text-right font-semibold ${
          diff > 0
            ? "text-emerald-400"
            : diff < 0
            ? "text-rose-400"
            : "text-slate-400"
        }`}
      >
        {diff > 0 ? `+${diff}` : diff}
      </td>
      <td
        className={`py-2.5 px-3 text-right font-bold ${
          p.adr >= 90
            ? "text-emerald-400"
            : p.adr >= 75
            ? "text-white"
            : "text-slate-400"
        }`}
      >
        {p.adr.toFixed(1)}
      </td>
      <td className="py-2.5 px-3 text-right text-slate-300">
        {p.hs_pct.toFixed(0)}%
      </td>
      <td
        className={`py-2.5 px-3 text-right ${
          p.kast_pct >= 75
            ? "text-emerald-400 font-semibold"
            : "text-slate-300"
        }`}
      >
        {p.kast_pct.toFixed(1)}%
      </td>
      <td className="py-2.5 px-3 text-right text-slate-300">
        {p.first_kills}/{p.first_deaths}
      </td>
      <td className="py-2.5 px-3 text-right text-slate-300">
        {p.trade_kills}/{p.traded_deaths}
      </td>
      <td className="py-2.5 px-4 text-right text-slate-300">
        {p.utility_damage}
      </td>
    </tr>
  );
}

export function Scoreboard({
  playerStats,
  selectedSteamid,
  onSelectPlayer,
  teamAName,
  teamBName,
  scoreA,
  scoreB,
}: ScoreboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sortField, setSortField] = useState<ScoreboardSortField>("adr");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ScoreboardViewMode>(
    DEFAULT_SCOREBOARD_VIEW_MODE
  );

  const handleSort = (field: ScoreboardSortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleSelectPlayer = (steamid: string) => {
    if (onSelectPlayer) {
      onSelectPlayer(steamid);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("player", steamid);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const getAriaSort = (field: ScoreboardSortField) =>
    sortField === field ? (sortAsc ? "ascending" : "descending") : "none";

  const combinedStats = useMemo(
    () =>
      viewMode === "combined"
        ? sortPlayerStats(playerStats, sortField, sortAsc)
        : [],
    [playerStats, sortField, sortAsc, viewMode]
  );

  const teamGroups = useMemo(
    () =>
      viewMode === "teams"
        ? groupPlayerStatsByTeam(playerStats, sortField, sortAsc, {
            teamAName,
            teamBName,
            scoreA,
            scoreB,
          })
        : [],
    [playerStats, sortField, sortAsc, viewMode, teamAName, teamBName, scoreA, scoreB]
  );

  const isEmpty = playerStats.length === 0;

  return (
    <div className="bg-obsidian-surface rounded-2xl border border-obsidian-border overflow-hidden shadow-2xl">
      <div className="px-6 py-4 border-b border-obsidian-border flex flex-wrap items-center justify-between gap-3 bg-obsidian-subtle/60">
        <div className="flex items-center gap-3">
          <span className="label-rust">COMBAT TELEMETRY</span>
          <span className="text-slate-600 font-mono text-xs">//</span>
          <h3
            id="scoreboard-title"
            className="font-display text-lg text-white font-semibold tracking-wide uppercase"
          >
            Match Scoreboard
          </h3>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase hidden lg:inline">
            Click any column to sort // Click player for telemetry
          </span>

          <div
            role="group"
            aria-label="Scoreboard view mode"
            className="inline-flex items-center rounded-lg bg-obsidian-card border border-obsidian-border p-0.5 font-mono text-[10px] tracking-wider uppercase"
          >
            <button
              type="button"
              onClick={() => setViewMode("teams")}
              aria-pressed={viewMode === "teams"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors ${
                viewMode === "teams"
                  ? "bg-rust-subtle text-rust border-rust-border font-semibold"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Users className="w-3 h-3" />
              <span>By Team</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("combined")}
              aria-pressed={viewMode === "combined"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors ${
                viewMode === "combined"
                  ? "bg-rust-subtle text-rust border-rust-border font-semibold"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <List className="w-3 h-3" />
              <span>Combined</span>
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table
          aria-labelledby="scoreboard-title"
          className="w-full text-left text-xs whitespace-nowrap"
        >
          <thead className="bg-obsidian-card/40 text-[11px] font-mono text-slate-400 tracking-wider uppercase border-b border-obsidian-border select-none">
            <tr>
              {COLUMNS.map((col) => {
                const isActiveSort = sortField === col.field;
                const SortIcon = isActiveSort
                  ? sortAsc
                    ? ArrowUp
                    : ArrowDown
                  : col.field === "name"
                  ? ArrowUpDown
                  : null;

                return (
                  <th
                    key={col.field}
                    scope="col"
                    aria-sort={getAriaSort(col.field)}
                    className={`py-3 ${col.paddingClass} ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.field)}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-white focus-visible:outline-none focus-visible:text-rust ${
                        col.align === "right" ? "justify-end ml-auto" : "justify-start"
                      } ${isActiveSort ? "text-rust font-semibold" : ""}`}
                    >
                      <span>{col.label}</span>
                      {SortIcon && (
                        <SortIcon
                          className={`w-3 h-3 ${
                            isActiveSort ? "opacity-100" : "opacity-60"
                          }`}
                        />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          {isEmpty ? (
            <tbody>
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="py-8 text-center text-slate-500 font-mono"
                >
                  No combat telemetry recorded
                </td>
              </tr>
            </tbody>
          ) : viewMode === "teams" ? (
            teamGroups.map((group, groupIdx) => {
              const isTeamA = group.team === "A";
              const defaultTag = isTeamA ? "Team A" : "Team B";
              const showTeamTag =
                group.label.toLowerCase() !== defaultTag.toLowerCase();
              const hasBothScores = scoreA !== undefined && scoreB !== undefined;
              const isWinning =
                hasBothScores && (isTeamA ? scoreA > scoreB : scoreB > scoreA);

              return (
                <tbody
                  key={group.team}
                  className={`divide-y divide-surface-border font-mono ${
                    groupIdx > 0 ? "border-t-2 border-obsidian-border" : ""
                  }`}
                >
                  <tr className={isTeamA ? "bg-sky-950/20" : "bg-amber-950/20"}>
                    <th
                      scope="rowgroup"
                      colSpan={COLUMNS.length}
                      className={`py-2 px-4 text-left font-normal border-l-2 ${
                        isTeamA ? "border-cs2-ct" : "border-cs2-t"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isTeamA ? "bg-cs2-ct" : "bg-cs2-t"
                            }`}
                          />
                          <span
                            className={`font-mono text-[11px] font-bold uppercase tracking-widest ${
                              isTeamA ? "text-cs2-ct" : "text-cs2-t"
                            }`}
                          >
                            {group.label}
                          </span>
                          {showTeamTag && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-obsidian-surface border border-obsidian-border text-slate-400 uppercase">
                              {defaultTag}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 font-mono text-[10px] tracking-wider uppercase text-slate-400">
                          {group.score !== undefined && (
                            <span
                              className={`px-2 py-0.5 rounded border tabular-nums font-bold ${
                                isWinning
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                  : "bg-obsidian-surface border-obsidian-border text-slate-300"
                              }`}
                            >
                              {group.score} RDS
                            </span>
                          )}
                          <span>
                            {group.players.length}{" "}
                            {group.players.length === 1 ? "Player" : "Players"}
                          </span>
                        </div>
                      </div>
                    </th>
                  </tr>

                  {group.players.map((p) => (
                    <PlayerRow
                      key={p.steamid}
                      player={p}
                      isSelected={p.steamid === selectedSteamid}
                      showTeamBadge={false}
                      onSelect={handleSelectPlayer}
                    />
                  ))}
                </tbody>
              );
            })
          ) : (
            <tbody className="divide-y divide-surface-border font-mono">
              {combinedStats.map((p) => (
                <PlayerRow
                  key={p.steamid}
                  player={p}
                  isSelected={p.steamid === selectedSteamid}
                  showTeamBadge
                  onSelect={handleSelectPlayer}
                />
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}
