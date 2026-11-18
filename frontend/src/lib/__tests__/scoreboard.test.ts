import { describe, it, expect } from "vitest";
import type { PlayerMatchStatRow } from "../types";
import {
  DEFAULT_SCOREBOARD_VIEW_MODE,
  sortPlayerStats,
  groupPlayerStatsByTeam,
} from "../scoreboard";

function makePlayer(
  overrides: Partial<PlayerMatchStatRow> & {
    steamid: string;
    name: string;
    team: "A" | "B";
  }
): PlayerMatchStatRow {
  return {
    match_id: "m-1",
    kills: 15,
    deaths: 15,
    assists: 4,
    adr: 75.0,
    hs_pct: 45,
    kast_pct: 70.0,
    first_kills: 2,
    first_deaths: 2,
    trade_kills: 3,
    traded_deaths: 3,
    k3: 0,
    k4: 0,
    k5: 0,
    clutches_played: 0,
    clutches_won: 0,
    utility_damage: 50,
    enemies_flashed: 4,
    flash_assists: 1,
    team_flashes: 0,
    shots_fired: 300,
    ttd_samples: 0,
    counter_strafe_samples: 0,
    ...overrides,
  };
}

const samplePlayers: PlayerMatchStatRow[] = [
  makePlayer({ steamid: "b1", name: "Rystik24", team: "B", kills: 30, deaths: 20, adr: 121.4, utility_damage: 51 }),
  makePlayer({ steamid: "a1", name: "Ly1ssss", team: "A", kills: 33, deaths: 21, adr: 120.4, utility_damage: 43 }),
  makePlayer({ steamid: "b2", name: "SaVIT777", team: "B", kills: 23, deaths: 18, adr: 97.9, utility_damage: 119 }),
  makePlayer({ steamid: "a2", name: "aimwho", team: "A", kills: 16, deaths: 21, adr: 79.3, utility_damage: 143 }),
  makePlayer({ steamid: "a3", name: "Kaiddzu", team: "A", kills: 15, deaths: 22, adr: 78.2, utility_damage: 255 }),
  makePlayer({ steamid: "b3", name: "brodyaga007", team: "B", kills: 12, deaths: 20, adr: 46.7, utility_damage: 130 }),
];

describe("scoreboard sorting and team grouping", () => {
  it("defaults to team-separated view mode", () => {
    expect(DEFAULT_SCOREBOARD_VIEW_MODE).toBe("teams");
  });

  it("sorts combined players across teams without mutating the input array", () => {
    const snapshot = [...samplePlayers];
    const sorted = sortPlayerStats(samplePlayers, "adr", false);

    expect(samplePlayers).toEqual(snapshot);
    expect(sorted.map((p) => p.name)).toEqual([
      "Rystik24",
      "Ly1ssss",
      "SaVIT777",
      "aimwho",
      "Kaiddzu",
      "brodyaga007",
    ]);
  });

  it("sorts combined players by kills, diff, name, and ascending/descending order", () => {
    expect(sortPlayerStats(samplePlayers, "kills", false).map((p) => p.name)).toEqual([
      "Ly1ssss",
      "Rystik24",
      "SaVIT777",
      "aimwho",
      "Kaiddzu",
      "brodyaga007",
    ]);

    expect(sortPlayerStats(samplePlayers, "diff", false).map((p) => p.name)).toEqual([
      "Ly1ssss", // +12
      "Rystik24", // +10
      "SaVIT777", // +5
      "aimwho", // -5
      "Kaiddzu", // -7
      "brodyaga007", // -8
    ]);

    expect(sortPlayerStats(samplePlayers, "name", true).map((p) => p.name)).toEqual([
      "aimwho",
      "brodyaga007",
      "Kaiddzu",
      "Ly1ssss",
      "Rystik24",
      "SaVIT777",
    ]);

    expect(sortPlayerStats(samplePlayers, "utility_damage", false).map((p) => p.name)).toEqual([
      "Kaiddzu",
      "aimwho",
      "brodyaga007",
      "SaVIT777",
      "Rystik24",
      "Ly1ssss",
    ]);
  });

  it("groups players into Team A and Team B and sorts within each team independently", () => {
    const groups = groupPlayerStatsByTeam(samplePlayers, "adr", false, {
      teamAName: "Team Alpha",
      teamBName: "Team Bravo",
      scoreA: 13,
      scoreB: 10,
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].team).toBe("A");
    expect(groups[0].label).toBe("Team Alpha");
    expect(groups[0].score).toBe(13);
    expect(groups[0].players.map((p) => p.name)).toEqual(["Ly1ssss", "aimwho", "Kaiddzu"]);

    expect(groups[1].team).toBe("B");
    expect(groups[1].label).toBe("Team Bravo");
    expect(groups[1].score).toBe(10);
    expect(groups[1].players.map((p) => p.name)).toEqual(["Rystik24", "SaVIT777", "brodyaga007"]);
  });

  it("applies ascending sort within each team without crossing team boundaries", () => {
    const groups = groupPlayerStatsByTeam(samplePlayers, "utility_damage", true);

    expect(groups[0].label).toBe("Team A");
    expect(groups[0].players.map((p) => p.name)).toEqual(["Ly1ssss", "aimwho", "Kaiddzu"]);
    expect(groups[1].label).toBe("Team B");
    expect(groups[1].players.map((p) => p.name)).toEqual(["Rystik24", "SaVIT777", "brodyaga007"]);
  });

  it("omits empty team groups and falls back to default team labels for blank names", () => {
    const onlyTeamB = samplePlayers.filter((p) => p.team === "B");
    const groups = groupPlayerStatsByTeam(onlyTeamB, "adr", false, {
      teamAName: "   ",
      teamBName: "",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].team).toBe("B");
    expect(groups[0].label).toBe("Team B");
    expect(groups[0].players).toHaveLength(3);
  });

  it("returns an empty array when given no players", () => {
    expect(groupPlayerStatsByTeam([], "adr", false)).toEqual([]);
  });
});
