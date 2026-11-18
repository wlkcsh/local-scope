import type { PlayerMatchStatRow } from "./types";

export type ScoreboardSortField =
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

export type ScoreboardViewMode = "teams" | "combined";

export const DEFAULT_SCOREBOARD_VIEW_MODE: ScoreboardViewMode = "teams";

export interface ScoreboardTeamGroup {
  team: "A" | "B";
  label: string;
  score?: number;
  players: PlayerMatchStatRow[];
}

export interface TeamGroupOptions {
  teamAName?: string;
  teamBName?: string;
  scoreA?: number;
  scoreB?: number;
}

function getSortValue(
  player: PlayerMatchStatRow,
  field: ScoreboardSortField
): number | string {
  switch (field) {
    case "name":
      return player.name.toLowerCase();
    case "kills":
      return player.kills;
    case "deaths":
      return player.deaths;
    case "assists":
      return player.assists;
    case "diff":
      return player.kills - player.deaths;
    case "adr":
      return player.adr;
    case "hs_pct":
      return player.hs_pct;
    case "kast_pct":
      return player.kast_pct;
    case "first_kills":
      return player.first_kills;
    case "trade_kills":
      return player.trade_kills;
    case "utility_damage":
      return player.utility_damage;
  }
}

export function sortPlayerStats(
  playerStats: readonly PlayerMatchStatRow[],
  sortField: ScoreboardSortField,
  sortAsc: boolean
): PlayerMatchStatRow[] {
  return [...playerStats].sort((a, b) => {
    const aVal = getSortValue(a, sortField);
    const bVal = getSortValue(b, sortField);

    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;

    // Deterministic tie-breakers: higher ADR, then alphabetical name
    if (a.adr !== b.adr) return b.adr - a.adr;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

export function groupPlayerStatsByTeam(
  playerStats: readonly PlayerMatchStatRow[],
  sortField: ScoreboardSortField,
  sortAsc: boolean,
  options: TeamGroupOptions = {}
): ScoreboardTeamGroup[] {
  const teamAPlayers = playerStats.filter((p) => p.team === "A");
  const teamBPlayers = playerStats.filter((p) => p.team === "B");

  const labelA = options.teamAName?.trim() || "Team A";
  const labelB = options.teamBName?.trim() || "Team B";

  const groups: ScoreboardTeamGroup[] = [];

  if (teamAPlayers.length > 0) {
    groups.push({
      team: "A",
      label: labelA,
      score: options.scoreA,
      players: sortPlayerStats(teamAPlayers, sortField, sortAsc),
    });
  }

  if (teamBPlayers.length > 0) {
    groups.push({
      team: "B",
      label: labelB,
      score: options.scoreB,
      players: sortPlayerStats(teamBPlayers, sortField, sortAsc),
    });
  }

  return groups;
}
