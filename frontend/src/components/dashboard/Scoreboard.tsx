"use client";

import React, { useState } from "react";
import { ArrowUpDown, Trophy } from "lucide-react";
import { PlayerMatchStatRow } from "@/lib/types";

interface ScoreboardProps {
  playerStats: PlayerMatchStatRow[];
  selectedSteamid?: string | null;
  onSelectPlayer?: (steamid: string) => void;
}

type SortField =
  | "name"
  | "kills"
  | "deaths"
  | "assists"
  | "diff"
  | "adr"
  | "hs_pct"
  | "kast_pct"
  | "first_kills"
  | "trade_kills"
  | "utility_damage";

export function Scoreboard({
  playerStats,
  selectedSteamid,
  onSelectPlayer,
}: ScoreboardProps) {
  const [sortField, setSortField] = useState<SortField>("adr");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getAriaSort = (field: SortField) =>
    sortField === field ? (sortAsc ? "ascending" : "descending") : "none";

  const sortedStats = [...playerStats].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortField) {
      case "name":
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case "kills":
        aVal = a.kills;
        bVal = b.kills;
        break;
      case "deaths":
        aVal = a.deaths;
        bVal = b.deaths;
        break;
      case "assists":
        aVal = a.assists;
        bVal = b.assists;
        break;
      case "diff":
        aVal = a.kills - a.deaths;
        bVal = b.kills - b.deaths;
        break;
      case "adr":
        aVal = a.adr;
        bVal = b.adr;
        break;
      case "hs_pct":
        aVal = a.hs_pct;
        bVal = b.hs_pct;
        break;
      case "kast_pct":
        aVal = a.kast_pct;
        bVal = b.kast_pct;
        break;
      case "first_kills":
        aVal = a.first_kills;
        bVal = b.first_kills;
        break;
      case "trade_kills":
        aVal = a.trade_kills;
        bVal = b.trade_kills;
        break;
      case "utility_damage":
        aVal = a.utility_damage;
        bVal = b.utility_damage;
        break;
    }

    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });

  return (
    <div className="bg-obsidian-surface rounded-2xl border border-obsidian-border overflow-hidden shadow-2xl">
      <div className="px-6 py-4 border-b border-obsidian-border flex items-center justify-between bg-obsidian-subtle/60">
        <div className="flex items-center gap-3">
          <span className="label-rust">COMBAT TELEMETRY</span>
          <span className="text-slate-600 font-mono text-xs">//</span>
          <h3 className="font-display text-lg text-white font-semibold tracking-wide uppercase">
            Match Scoreboard
          </h3>
        </div>
        <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase hidden sm:inline">
          Click any column to sort // Click player for telemetry
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-obsidian-card/40 text-[11px] font-mono text-slate-400 tracking-wider uppercase border-b border-obsidian-border select-none">
            <tr>
              <th
                onClick={() => handleSort("name")}
                aria-sort={getAriaSort("name")}
                className="py-3 px-4 cursor-pointer hover:text-white"
              >
                <div className="flex items-center gap-1">
                  <span>Player</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => handleSort("kills")}
                aria-sort={getAriaSort("kills")}
                className="py-3 px-3 cursor-pointer hover:text-white text-right"
              >
                K
              </th>
              <th
                onClick={() => handleSort("deaths")}
                aria-sort={getAriaSort("deaths")}
                className="py-3 px-3 cursor-pointer hover:text-white text-right"
              >
                D
              </th>
              <th
                onClick={() => handleSort("assists")}
                aria-sort={getAriaSort("assists")}
                className="py-3 px-3 cursor-pointer hover:text-white text-right"
              >
                A
              </th>
              <th
                onClick={() => handleSort("diff")}
                aria-sort={getAriaSort("diff")}
                className="py-3 px-3 cursor-pointer hover:text-white text-right"
              >
                +/-
              </th>
              <th
                onClick={() => handleSort("adr")}
                aria-sort={getAriaSort("adr")}
                className="py-3 px-3 cursor-pointer hover:text-white text-right"
              >
                ADR
              </th>
              <th
                onClick={() => handleSort("hs_pct")}
                aria-sort={getAriaSort("hs_pct")}
                className="py-3 px-3 cursor-pointer hover:text-white text-right"
              >
                HS %
              </th>
              <th
                onClick={() => handleSort("kast_pct")}
                aria-sort={getAriaSort("kast_pct")}
                className="py-3 px-3 cursor-pointer hover:text-white text-right"
              >
                KAST %
              </th>
              <th
                onClick={() => handleSort("first_kills")}
                aria-sort={getAriaSort("first_kills")}
                className="py-3 px-3 cursor-pointer hover:text-white text-right"
              >
                Entry
              </th>
              <th
                onClick={() => handleSort("trade_kills")}
                aria-sort={getAriaSort("trade_kills")}
                className="py-3 px-3 cursor-pointer hover:text-white text-right"
              >
                Trades
              </th>
              <th
                onClick={() => handleSort("utility_damage")}
                aria-sort={getAriaSort("utility_damage")}
                className="py-3 px-4 cursor-pointer hover:text-white text-right"
              >
                Util Dmg
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border font-mono">
            {sortedStats.map((p) => {
              const diff = p.kills - p.deaths;
              const isSelected = p.steamid === selectedSteamid;
              const isTeamA = p.team === "A";

              return (
                <tr
                  key={p.steamid}
                  onClick={() => onSelectPlayer && onSelectPlayer(p.steamid)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-rust/10 text-white font-medium border-l-2 border-rust"
                      : "hover:bg-obsidian-card/60 text-slate-300"
                  }`}
                >
                  <td className="py-2.5 px-4 font-sans flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isTeamA ? "bg-cs2-ct" : "bg-cs2-t"
                      }`}
                    />
                    <span className="font-semibold text-slate-100 font-sans">
                      {p.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-obsidian-card border border-obsidian-border text-slate-400">
                      Team {p.team}
                    </span>
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
