import { describe, it, expect } from "vitest";
import {
  computePlayerRating,
  computeMatchInsights,
  formatWeaponLabel,
  pluralize,
} from "../insights";
import { HighlightRow, MistakeRow, PlayerMatchStatRow } from "../types";

function makePlayer(overrides: Partial<PlayerMatchStatRow>): PlayerMatchStatRow {
  return {
    match_id: "m1",
    steamid: "76561198000000001",
    name: "Player1",
    team: "A",
    kills: 16,
    deaths: 16,
    assists: 4,
    adr: 75,
    hs_pct: 45,
    kast_pct: 70,
    first_kills: 2,
    first_deaths: 2,
    trade_kills: 2,
    traded_deaths: 2,
    k3: 0,
    k4: 0,
    k5: 0,
    clutches_played: 0,
    clutches_won: 0,
    utility_damage: 40,
    enemies_flashed: 4,
    flash_assists: 0,
    team_flashes: 0,
    shots_fired: 300,
    ttd_ms_median: 380,
    ttd_samples: 12,
    counter_strafe_pct: 78,
    counter_strafe_samples: 40,
    first_bullet_acc_pct: 52,
    first_bullet_acc_samples: 30,
    ...overrides,
  };
}

describe("Match Insights & HLTV 2.0 Analytics Engine", () => {
  it("computes accurate KPR using real roundsTotal and realistic HLTV 2.0 rating", () => {
    const avg = makePlayer({ kills: 16, deaths: 16, assists: 4, adr: 75, kast_pct: 70 });
    const avgBreakdown = computePlayerRating(avg, 23);
    expect(avgBreakdown.kpr).toBe(0.7);
    expect(avgBreakdown.rating).toBeGreaterThan(0.95);
    expect(avgBreakdown.rating).toBeLessThan(1.15);

    const carry = makePlayer({ kills: 33, deaths: 18, assists: 5, adr: 118, kast_pct: 86 });
    const carryBreakdown = computePlayerRating(carry, 23);
    expect(carryBreakdown.kpr).toBe(1.43);
    expect(carryBreakdown.rating).toBeGreaterThan(1.7);
  });

  it("ranks Entry Specialist by net FK-FD differential rather than raw first kills", () => {
    const feeder = makePlayer({
      steamid: "feeder",
      name: "Feeder",
      first_kills: 5,
      first_deaths: 8,
    });
    const sharpEntry = makePlayer({
      steamid: "entry",
      name: "SharpEntry",
      first_kills: 4,
      first_deaths: 1,
    });

    const res = computeMatchInsights([feeder, sharpEntry], [], [], 23);
    const entryHonor = res.honors.find((h) => h.id === "entry");
    expect(entryHonor?.player.steamid).toBe("entry");
    expect(entryHonor?.primaryValue).toBe("+3");
    expect(entryHonor?.detailText).toContain("4W–1L");
    expect(entryHonor?.detailText).toContain("80%");
  });

  it("picks lowest TTD for Fastest Trigger and falls back cleanly when TTD samples < 5", () => {
    const fast = makePlayer({
      steamid: "fast",
      name: "FastAim",
      ttd_ms_median: 245,
      ttd_samples: 9,
      counter_strafe_pct: 89,
      counter_strafe_samples: 35,
    });
    const lowSamples = makePlayer({
      steamid: "fluke",
      name: "Fluke",
      ttd_ms_median: 120,
      ttd_samples: 2, // should be ignored (< 5)
    });

    const res1 = computeMatchInsights([fast, lowSamples], [], [], 23);
    const mech1 = res1.honors.find((h) => h.id === "mechanics");
    expect(mech1?.player.steamid).toBe("fast");
    expect(mech1?.primaryValue).toBe("245");
    expect(mech1?.primaryUnit).toBe("ms");

    // Fallback when no player has >= 5 TTD samples
    const noTtd1 = makePlayer({
      steamid: "cs_king",
      name: "StrafeKing",
      ttd_ms_median: null,
      ttd_samples: 0,
      counter_strafe_pct: 92,
      counter_strafe_samples: 30,
    });
    const noTtd2 = makePlayer({
      steamid: "other",
      name: "Other",
      ttd_ms_median: null,
      ttd_samples: 0,
      counter_strafe_pct: 60,
      counter_strafe_samples: 30,
    });
    const res2 = computeMatchInsights([noTtd1, noTtd2], [], [], 23);
    const mech2 = res2.honors.find((h) => h.id === "mechanics");
    expect(mech2?.player.steamid).toBe("cs_king");
    expect(mech2?.title).toBe("Cleanest Movement");
  });

  it("groups clutches, aces/multi-kills, and unique kills into user-friendly buckets", () => {
    const pA = makePlayer({ steamid: "pA", name: "Ly1ssss", team: "A", clutches_won: 1, k5: 1 });
    const pB = makePlayer({ steamid: "pB", name: "Rystik24", team: "B" });

    const highlights: HighlightRow[] = [
      {
        id: 1,
        match_id: "m1",
        steamid: "pA",
        round: 14,
        type: "clutch",
        start_tick: 50000,
        end_tick: 52000,
        kill_ticks: [50200, 51500],
        weapon: "ak47",
        score: 8,
        meta: { vs: 3 },
      },
      {
        id: 2,
        match_id: "m1",
        steamid: "pA",
        round: 21,
        type: "ace",
        start_tick: 90000,
        end_tick: 93000,
        kill_ticks: [90200, 90800, 91200, 91900, 92400],
        weapon: "awp",
        score: 12,
        meta: {},
      },
      {
        id: 3,
        match_id: "m1",
        steamid: "pB",
        round: 7,
        type: "noscope",
        start_tick: 24000,
        end_tick: 24400,
        kill_ticks: [24200],
        weapon: "awp",
        score: 5,
        meta: {},
      },
      {
        id: 4,
        match_id: "m1",
        steamid: "pB",
        round: 11,
        type: "smoke_kill",
        start_tick: 38000,
        end_tick: 38400,
        kill_ticks: [38200],
        weapon: "m4a1_silencer",
        score: 4,
        meta: {},
      },
    ];

    const mistakes: MistakeRow[] = [
      {
        id: 10,
        match_id: "m1",
        steamid: "pA",
        round: 4,
        type: "unspent_utility",
        tick: 12000,
        x: 0,
        y: 0,
        z: 0,
        layer: 0,
        severity: 2,
        meta: { value: 700, items: ["smoke", "flash"] },
      },
    ];

    const res = computeMatchInsights([pA, pB], highlights, mistakes, 23, "pA");

    expect(res.keyMoments.clutches).toHaveLength(1);
    expect(res.keyMoments.clutches[0].badge).toBe("1v3");
    expect(res.keyMoments.clutches[0].weaponLabel).toBe("AK-47");

    expect(res.keyMoments.multiKills).toHaveLength(1);
    expect(res.keyMoments.multiKills[0].badge).toBe("ACE");

    expect(res.keyMoments.uniqueKills).toHaveLength(2);
    expect(res.keyMoments.uniqueKills[0].badge).toBe("No-Scope");
    expect(res.keyMoments.uniqueKills[1].badge).toBe("Thru Smoke");
    expect(res.keyMoments.uniqueKills[1].weaponLabel).toBe("M4A1-S");

    expect(res.focusedSummary?.player.name).toBe("Ly1ssss");
    expect(res.focusedSummary?.mistakeCount).toBe(1);

    const mistakeMacro = res.teamMacro.find((m) => m.id === "mistakes");
    expect(mistakeMacro?.valueA).toBe(1);
    expect(mistakeMacro?.valueB).toBe(0);
    expect(mistakeMacro?.note).toContain("$700");
  });

  it("formats weapon labels and singular/plural strings cleanly", () => {
    expect(formatWeaponLabel("weapon_m4a1_silencer")).toBe("M4A1-S");
    expect(formatWeaponLabel("ak47")).toBe("AK-47");
    expect(pluralize(1, "Clutch Won", "Clutches Won")).toBe("1 Clutch Won");
    expect(pluralize(3, "Clutch Won", "Clutches Won")).toBe("3 Clutches Won");
  });
});
