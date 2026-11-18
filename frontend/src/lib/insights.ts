import { HighlightRow, MistakeRow, PlayerMatchStatRow } from "./types";

export interface PlayerRatingBreakdown {
  rating: number;
  impact: number;
  kpr: number;
  dpr: number;
  apr: number;
}

export interface MvpSpotlight {
  player: PlayerMatchStatRow;
  breakdown: PlayerRatingBreakdown;
  highlightsSummary: string[];
}

export interface TacticalHonor {
  id: "mechanics" | "entry" | "utility" | "impact";
  title: string;
  explanation: string;
  player: PlayerMatchStatRow;
  primaryValue: string;
  primaryUnit?: string;
  detailText: string;
  accentClass: string;
}

export interface KeyMomentItem {
  id: number;
  category: "clutch" | "multikill" | "unique";
  badge: string;
  badgeTone: "amber" | "emerald" | "rose" | "sky" | "purple" | "rust";
  playerName: string;
  steamid: string;
  team: "A" | "B";
  round: number;
  startTick: number;
  weaponLabel: string;
  subtitle?: string;
}

export interface TeamMacroMetric {
  id: string;
  label: string;
  valueA: number;
  valueB: number;
  displayA: string;
  displayB: string;
  note?: string;
  lowerIsBetter?: boolean;
}

export interface FocusedPlayerSummary {
  player: PlayerMatchStatRow;
  rating: number;
  ratingRank: number;
  totalPlayers: number;
  mistakeCount: number;
}

export interface MatchInsightsData {
  mvp: MvpSpotlight | null;
  honors: TacticalHonor[];
  keyMoments: {
    clutches: KeyMomentItem[];
    multiKills: KeyMomentItem[];
    uniqueKills: KeyMomentItem[];
    totalCount: number;
  };
  teamMacro: TeamMacroMetric[];
  focusedSummary: FocusedPlayerSummary | null;
}

const WEAPON_DISPLAY_NAMES: Record<string, string> = {
  ak47: "AK-47",
  m4a1_silencer: "M4A1-S",
  m4a1: "M4A4",
  m4a4: "M4A4",
  awp: "AWP",
  deagle: "Deagle",
  usp_silencer: "USP-S",
  glock: "Glock-18",
  galilar: "Galil AR",
  famas: "FAMAS",
  ssg08: "Scout",
  mp9: "MP9",
  mac10: "MAC-10",
  p250: "P250",
  fiveseven: "Five-SeveN",
  tec9: "Tec-9",
  cz75a: "CZ75-Auto",
  aug: "AUG",
  sg556: "SG 553",
  xm1014: "XM1014",
  mag7: "MAG-7",
  mp7: "MP7",
  mp5sd: "MP5-SD",
  ump45: "UMP-45",
  p90: "P90",
  hegrenade: "HE Grenade",
  inferno: "Molotov",
  molotov: "Molotov",
  incgrenade: "Incendiary",
};

export function formatWeaponLabel(weapon?: string | null): string {
  if (!weapon) return "Weapon";
  const key = weapon.toLowerCase().replace(/^weapon_/, "").trim();
  if (WEAPON_DISPLAY_NAMES[key]) return WEAPON_DISPLAY_NAMES[key];
  return key.replace(/_/g, " ").toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Standard HLTV 2.0 Rating regression using actual match rounds_total:
 * Impact = 2.13*KPR + 0.42*APR - 0.41
 * Rating = 0.0073*KAST + 0.3591*KPR - 0.5329*DPR + 0.2372*Impact + 0.0032*ADR + 0.1587
 */
export function computePlayerRating(
  p: PlayerMatchStatRow,
  roundsTotal: number
): PlayerRatingBreakdown {
  const rounds = Math.max(1, roundsTotal);
  const kpr = p.kills / rounds;
  const dpr = p.deaths / rounds;
  const apr = p.assists / rounds;
  const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
  const rawRating =
    0.0073 * p.kast_pct +
    0.3591 * kpr -
    0.5329 * dpr +
    0.2372 * impact +
    0.0032 * p.adr +
    0.1587;

  return {
    rating: Math.max(0.2, Number(rawRating.toFixed(2))),
    impact: Number(impact.toFixed(2)),
    kpr: Number(kpr.toFixed(2)),
    dpr: Number(dpr.toFixed(2)),
    apr: Number(apr.toFixed(2)),
  };
}

function buildMultiKillTags(p: PlayerMatchStatRow): string[] {
  const tags: string[] = [];
  if (p.clutches_won > 0) tags.push(pluralize(p.clutches_won, "Clutch Won", "Clutches Won"));
  if (p.k5 > 0) tags.push(p.k5 === 1 ? "1 Ace" : `${p.k5} Aces`);
  if (p.k4 > 0) tags.push(`${p.k4}× 4K`);
  if (p.k3 > 0) tags.push(`${p.k3}× 3K`);
  if (tags.length === 0 && p.first_kills > 0) {
    tags.push(pluralize(p.first_kills, "Opening Kill"));
  }
  return tags.slice(0, 3);
}

function selectMechanicsHonor(playerStats: PlayerMatchStatRow[]): TacticalHonor {
  const withTtd = playerStats.filter((p) => p.ttd_ms_median != null && p.ttd_samples >= 5);
  if (withTtd.length > 0) {
    const fastest = [...withTtd].sort(
      (a, b) => (a.ttd_ms_median ?? 9999) - (b.ttd_ms_median ?? 9999)
    )[0];
    const parts: string[] = [];
    if (fastest.counter_strafe_pct != null && fastest.counter_strafe_samples >= 20) {
      parts.push(`${fastest.counter_strafe_pct.toFixed(0)}% Counter-Strafe`);
    }
    if (fastest.first_bullet_acc_pct != null && (fastest.first_bullet_acc_samples ?? 0) >= 15) {
      parts.push(`${fastest.first_bullet_acc_pct.toFixed(0)}% 1st-Shot`);
    }
    if (parts.length === 0) {
      parts.push(`${fastest.hs_pct.toFixed(0)}% Headshots`);
    }
    return {
      id: "mechanics",
      title: "Fastest Trigger",
      explanation: "Fastest median Time-to-Damage once enemy enters sight",
      player: fastest,
      primaryValue: `${Math.round(fastest.ttd_ms_median!)}`,
      primaryUnit: "ms",
      detailText: parts.join(" · "),
      accentClass: "text-sky-400",
    };
  }

  const withCs = playerStats.filter(
    (p) => p.counter_strafe_pct != null && p.counter_strafe_samples >= 20
  );
  if (withCs.length > 0) {
    const cleanest = [...withCs].sort(
      (a, b) => (b.counter_strafe_pct ?? 0) - (a.counter_strafe_pct ?? 0)
    )[0];
    return {
      id: "mechanics",
      title: "Cleanest Movement",
      explanation: "Highest counter-strafing accuracy before shooting",
      player: cleanest,
      primaryValue: `${cleanest.counter_strafe_pct!.toFixed(0)}%`,
      detailText: `${cleanest.hs_pct.toFixed(0)}% Headshots`,
      accentClass: "text-sky-400",
    };
  }

  const hsLeader = [...playerStats].sort((a, b) => b.hs_pct - a.hs_pct || b.kills - a.kills)[0];
  return {
    id: "mechanics",
    title: "Headshot Machine",
    explanation: "Highest headshot percentage across kills",
    player: hsLeader,
    primaryValue: `${hsLeader.hs_pct.toFixed(0)}%`,
    detailText: `${hsLeader.kills} Kills · ${hsLeader.adr.toFixed(0)} ADR`,
    accentClass: "text-sky-400",
  };
}

function selectEntryHonor(playerStats: PlayerMatchStatRow[]): TacticalHonor {
  const ranked = [...playerStats].sort((a, b) => {
    const netA = a.first_kills - a.first_deaths;
    const netB = b.first_kills - b.first_deaths;
    if (netB !== netA) return netB - netA;
    const totalA = a.first_kills + a.first_deaths;
    const totalB = b.first_kills + b.first_deaths;
    const wrA = totalA > 0 ? a.first_kills / totalA : 0;
    const wrB = totalB > 0 ? b.first_kills / totalB : 0;
    if (wrB !== wrA) return wrB - wrA;
    return b.first_kills - a.first_kills;
  });

  const best = ranked[0];
  const net = best.first_kills - best.first_deaths;
  const total = best.first_kills + best.first_deaths;
  const winPct = total > 0 ? Math.round((best.first_kills / total) * 100) : 0;

  return {
    id: "entry",
    title: "Opening Duelist",
    explanation: "Best net first-kill differential in opening duels",
    player: best,
    primaryValue: net > 0 ? `+${net}` : `${net}`,
    detailText:
      total > 0
        ? `${best.first_kills}W–${best.first_deaths}L · ${winPct}% win rate`
        : "No opening duels",
    accentClass: "text-amber-400",
  };
}

function selectUtilityHonor(playerStats: PlayerMatchStatRow[]): TacticalHonor {
  const score = (p: PlayerMatchStatRow) =>
    p.utility_damage + p.flash_assists * 35 + p.enemies_flashed * 8 - p.team_flashes * 20;

  const best = [...playerStats].sort(
    (a, b) => score(b) - score(a) || b.utility_damage - a.utility_damage
  )[0];

  const detailParts: string[] = [];
  if (best.enemies_flashed > 0) detailParts.push(`${best.enemies_flashed} blinded`);
  if (best.flash_assists > 0) detailParts.push(pluralize(best.flash_assists, "flash assist"));
  if (detailParts.length === 0) detailParts.push("Grenade impact");

  return {
    id: "utility",
    title: "Utility Master",
    explanation: "Highest grenade damage & flashbang support impact",
    player: best,
    primaryValue: `${best.utility_damage}`,
    primaryUnit: "HP",
    detailText: detailParts.join(" · "),
    accentClass: "text-emerald-400",
  };
}

function selectImpactHonor(playerStats: PlayerMatchStatRow[]): TacticalHonor {
  const score = (p: PlayerMatchStatRow) =>
    p.clutches_won * 4 + p.k5 * 5 + p.k4 * 3.5 + p.k3 * 2 + p.trade_kills * 0.75;

  const best = [...playerStats].sort((a, b) => score(b) - score(a) || b.kast_pct - a.kast_pct)[0];
  const bigRounds = best.clutches_won + best.k3 + best.k4 + best.k5;
  const parts: string[] = [];
  if (best.clutches_won > 0) parts.push(pluralize(best.clutches_won, "Clutch"));
  if (best.k5 > 0) parts.push(pluralize(best.k5, "Ace"));
  if (best.k4 > 0) parts.push(`${best.k4}× 4K`);
  if (best.k3 > 0) parts.push(`${best.k3}× 3K`);
  if (best.trade_kills > 0) parts.push(pluralize(best.trade_kills, "Trade"));

  return {
    id: "impact",
    title: "Clutch & Impact",
    explanation: "Most clutches won, multi-kill rounds, and trade kills",
    player: best,
    primaryValue: bigRounds > 0 ? `${bigRounds}` : `${best.kast_pct.toFixed(0)}%`,
    primaryUnit: bigRounds > 0 ? (bigRounds === 1 ? "play" : "plays") : "KAST",
    detailText: parts.length > 0 ? parts.slice(0, 3).join(" · ") : `${best.kast_pct.toFixed(0)}% KAST`,
    accentClass: "text-rose-400",
  };
}

const UNIQUE_KILL_META: Record<
  string,
  { label: string; tone: KeyMomentItem["badgeTone"] }
> = {
  noscope: { label: "No-Scope", tone: "purple" },
  wallbang: { label: "Wallbang", tone: "rust" },
  smoke_kill: { label: "Thru Smoke", tone: "sky" },
  blind_kill: { label: "Full-Blind", tone: "amber" },
  spray_transfer: { label: "Spray Transfer", tone: "rose" },
};

export function computeMatchInsights(
  playerStats: PlayerMatchStatRow[],
  highlights: HighlightRow[],
  mistakes: MistakeRow[],
  roundsTotal: number,
  focusedSteamid?: string | null
): MatchInsightsData {
  if (!playerStats || playerStats.length === 0) {
    return {
      mvp: null,
      honors: [],
      keyMoments: { clutches: [], multiKills: [], uniqueKills: [], totalCount: 0 },
      teamMacro: [],
      focusedSummary: null,
    };
  }

  const playerMap = new Map<string, PlayerMatchStatRow>();
  for (const p of playerStats) {
    playerMap.set(p.steamid, p);
  }

  // 1. Rank all players by true HLTV 2.0 Rating
  const rated = playerStats
    .map((player) => ({
      player,
      breakdown: computePlayerRating(player, roundsTotal),
    }))
    .sort((a, b) => b.breakdown.rating - a.breakdown.rating || b.player.adr - a.player.adr);

  const top = rated[0];
  const mvp: MvpSpotlight = {
    player: top.player,
    breakdown: top.breakdown,
    highlightsSummary: buildMultiKillTags(top.player),
  };

  // 2. Select 4 non-redundant tactical honors
  const honors: TacticalHonor[] = [
    selectMechanicsHonor(playerStats),
    selectEntryHonor(playerStats),
    selectUtilityHonor(playerStats),
    selectImpactHonor(playerStats),
  ];

  // 3. Group Key Moments: Clutches, Aces & Multi-Kills, Unique Kills
  const clutches: KeyMomentItem[] = [];
  const multiKills: KeyMomentItem[] = [];
  const uniqueKills: KeyMomentItem[] = [];

  const mkOrder: Record<string, number> = { ace: 3, "4k": 2, "3k": 1 };

  for (const hl of highlights) {
    const p = playerMap.get(hl.steamid);
    const playerName = p?.name || hl.steamid.slice(-6);
    const team: "A" | "B" = p?.team || "A";
    const weaponLabel = formatWeaponLabel(hl.weapon);

    if (hl.type === "clutch") {
      const vs = Number(hl.meta?.vs) || 1;
      clutches.push({
        id: hl.id,
        category: "clutch",
        badge: `1v${vs}`,
        badgeTone: vs >= 3 ? "amber" : "emerald",
        playerName,
        steamid: hl.steamid,
        team,
        round: hl.round,
        startTick: hl.start_tick,
        weaponLabel,
        subtitle: `1v${vs} Clutch`,
      });
    } else if (hl.type === "ace" || hl.type === "4k" || hl.type === "3k") {
      multiKills.push({
        id: hl.id,
        category: "multikill",
        badge: hl.type === "ace" ? "ACE" : hl.type.toUpperCase(),
        badgeTone: hl.type === "ace" ? "amber" : hl.type === "4k" ? "rose" : "rust",
        playerName,
        steamid: hl.steamid,
        team,
        round: hl.round,
        startTick: hl.start_tick,
        weaponLabel,
      });
    } else if (UNIQUE_KILL_META[hl.type]) {
      const metaInfo = UNIQUE_KILL_META[hl.type];
      const spanMs = typeof hl.meta?.span_ms === "number" ? `${(hl.meta.span_ms / 1000).toFixed(1)}s` : undefined;
      uniqueKills.push({
        id: hl.id,
        category: "unique",
        badge: metaInfo.label,
        badgeTone: metaInfo.tone,
        playerName,
        steamid: hl.steamid,
        team,
        round: hl.round,
        startTick: hl.start_tick,
        weaponLabel,
        subtitle: spanMs,
      });
    }
  }

  clutches.sort((a, b) => {
    const vsA = parseInt(a.badge.replace("1v", ""), 10) || 1;
    const vsB = parseInt(b.badge.replace("1v", ""), 10) || 1;
    return vsB - vsA || a.round - b.round;
  });

  multiKills.sort((a, b) => {
    const rankA = mkOrder[a.badge.toLowerCase()] || 0;
    const rankB = mkOrder[b.badge.toLowerCase()] || 0;
    return rankB - rankA || a.round - b.round;
  });

  uniqueKills.sort((a, b) => a.round - b.round);

  // 4. Team A vs Team B Macro Comparison
  const teamA = playerStats.filter((p) => p.team === "A");
  const teamB = playerStats.filter((p) => p.team === "B");
  const sum = (arr: PlayerMatchStatRow[], fn: (p: PlayerMatchStatRow) => number) =>
    arr.reduce((acc, p) => acc + fn(p), 0);

  const mistakesA = mistakes.filter((m) => playerMap.get(m.steamid)?.team === "A");
  const mistakesB = mistakes.filter((m) => playerMap.get(m.steamid)?.team === "B");
  const unspentA = mistakesA
    .filter((m) => m.type === "unspent_utility")
    .reduce((acc, m) => acc + (Number(m.meta?.value) || 0), 0);
  const unspentB = mistakesB
    .filter((m) => m.type === "unspent_utility")
    .reduce((acc, m) => acc + (Number(m.meta?.value) || 0), 0);

  const fkA = sum(teamA, (p) => p.first_kills);
  const fkB = sum(teamB, (p) => p.first_kills);
  const utilA = sum(teamA, (p) => p.utility_damage);
  const utilB = sum(teamB, (p) => p.utility_damage);
  const tradesA = sum(teamA, (p) => p.trade_kills);
  const tradesB = sum(teamB, (p) => p.trade_kills);
  const bigA = sum(teamA, (p) => p.clutches_won + p.k3 + p.k4 + p.k5);
  const bigB = sum(teamB, (p) => p.clutches_won + p.k3 + p.k4 + p.k5);

  const teamMacro: TeamMacroMetric[] = [
    {
      id: "opening_duels",
      label: "Opening Duels",
      valueA: fkA,
      valueB: fkB,
      displayA: `${fkA}`,
      displayB: `${fkB}`,
      note: "First kills won",
    },
    {
      id: "utility_damage",
      label: "Grenade Damage",
      valueA: utilA,
      valueB: utilB,
      displayA: `${utilA} HP`,
      displayB: `${utilB} HP`,
      note: "HE + Molotov total",
    },
    {
      id: "trades",
      label: "Trades Executed",
      valueA: tradesA,
      valueB: tradesB,
      displayA: `${tradesA}`,
      displayB: `${tradesB}`,
      note: "Teammates avenged",
    },
    {
      id: "big_plays",
      label: "Clutches & Multis",
      valueA: bigA,
      valueB: bigB,
      displayA: `${bigA}`,
      displayB: `${bigB}`,
      note: "Clutches + 3K/4K/Ace",
    },
    {
      id: "mistakes",
      label: "Mistakes Logged",
      valueA: mistakesA.length,
      valueB: mistakesB.length,
      displayA: `${mistakesA.length}`,
      displayB: `${mistakesB.length}`,
      note:
        unspentA + unspentB > 0
          ? `$${unspentA} vs $${unspentB} unspent`
          : "Lower is cleaner",
      lowerIsBetter: true,
    },
  ];

  // 5. Focused player lobby summary
  let focusedSummary: FocusedPlayerSummary | null = null;
  if (focusedSteamid) {
    const idx = rated.findIndex((r) => r.player.steamid === focusedSteamid);
    if (idx >= 0) {
      focusedSummary = {
        player: rated[idx].player,
        rating: rated[idx].breakdown.rating,
        ratingRank: idx + 1,
        totalPlayers: rated.length,
        mistakeCount: mistakes.filter((m) => m.steamid === focusedSteamid).length,
      };
    }
  }

  return {
    mvp,
    honors,
    keyMoments: {
      clutches,
      multiKills,
      uniqueKills,
      totalCount: clutches.length + multiKills.length + uniqueKills.length,
    },
    teamMacro,
    focusedSummary,
  };
}
