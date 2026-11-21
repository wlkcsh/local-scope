/**
 * Data contracts and schema interfaces mirroring SPEC §2.1 and §2.2 verbatim.
 */

export type Side = "T" | "CT";

export type Delta = number[]; // [abs0, d1, d2, ...]  value[i] = value[i-1] + d[i]
export type Changes = [number, number][]; // [frame, value] change list, value holds until next entry

export interface ReplayFile {
  v: 1;
  match_id: string;
  map: string;
  tick_rate: 64;
  frame_step: 8; // ticks per frame → 8 Hz; tick = round.t0 + frame*8
  q: { pos: number; yaw: number }; // stored_pos = round(world/2); stored_yaw = round(deg/3) mod 120
  weapons: string[]; // dictionary; widx indexes this
  players: { sid: string; name: string; team: "A" | "B" }[]; // pidx = array index (0..9)
  rounds: Round[];
}

export interface Round {
  n: number; // 1-based
  t0: number; // demo tick of frame 0 (= freeze_end_tick - 128)
  nf: number; // frame count (ends round_end_tick + 192)
  fe: number; // frame index of freeze end (normally 16)
  side_a: Side; // side of team A this round
  winner: Side;
  reason: string; // round_end reason
  score: [number, number]; // [A, B] before this round
  p: (Track | null)[]; // by pidx; null if not present
  bomb?: {
    plant?: [number, number, number, number]; // [frame, x, y, pidx] (quantised)
    defuse?: [number, number]; // [frame, pidx]
    explode?: number; // frame
  };
  nades: Nade[];
  kills: Kill[];
  shots: [Delta, number[]]; // [frames (delta-encoded), pidx per shot]
}

export interface Track {
  n: number; // frames alive: arrays cover frames 0..n-1 (ends at death)
  x: Delta;
  y: Delta; // quantised world coords
  yaw: Delta; // deltas wrapped to [-60, 59]
  hp: Changes; // 0..100
  w: Changes; // widx of active weapon
  l?: Changes; // layer 0|1, only on multi-level maps
  fl?: [number, number][]; // [frame, blind_frames]
}

export interface Nade {
  t: "smoke" | "flash" | "he" | "molotov" | "decoy";
  p: number; // thrower pidx
  f0: number; // first frame of flight
  x: Delta;
  y: Delta; // one point per frame from f0
  det?: [number, number, number, number]; // [frame, x, y, end_frame] (end = expire; flash/he: frame+2)
}

// [frame, killer pidx | -1, victim pidx, assister pidx | -1, widx, flags]
// flags: 1 headshot, 2 wallbang, 4 through-smoke, 8 noscope, 16 attacker-blind, 32 flash-assist
export type Kill = [number, number, number, number, number, number];

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  steamid?: string | null;
  is_admin: boolean;
}

// Database Row Types per SPEC §2.1
export interface MatchRow {
  id: string; // "1-<uuid>" or "up-<sha1[:16]>"
  source: "faceit" | "upload";
  faceit_url?: string | null;
  demo_url?: string | null;
  map: string;
  played_at?: string | null;
  duration_s: number;
  tick_rate: number;
  rounds_total: number;
  team_a_name: string;
  team_b_name: string;
  score_a: number;
  score_b: number;
  team_a_first_side: Side;
  my_steamid?: string | null;
  my_team?: "A" | "B" | null;
  result?: "W" | "L" | "D" | null;
  replay_path: string;
  replay_bytes: number;
  parser_version: string;
  is_public?: boolean;
  is_owner?: boolean;
  created_at: string;
}

export interface PlayerMatchStatRow {
  match_id: string;
  steamid: string;
  name: string;
  team: "A" | "B";
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hs_pct: number;
  kast_pct: number;
  first_kills: number;
  first_deaths: number;
  trade_kills: number;
  traded_deaths: number;
  k3: number;
  k4: number;
  k5: number;
  clutches_played: number;
  clutches_won: number;
  utility_damage: number;
  enemies_flashed: number;
  flash_assists: number;
  team_flashes: number;
  shots_fired: number;
  ttd_ms_median?: number | null;
  ttd_samples: number;
  counter_strafe_pct?: number | null;
  counter_strafe_samples: number;
  first_bullet_acc_pct?: number | null;
  first_bullet_acc_samples?: number;
}

export interface HighlightRow {
  id: number;
  match_id: string;
  steamid: string;
  round: number;
  type: "3k" | "4k" | "ace" | "clutch" | "spray_transfer" | "wallbang" | "smoke_kill" | "noscope" | "blind_kill";
  start_tick: number;
  end_tick: number;
  kill_ticks: number[];
  weapon?: string | null;
  score: number;
  meta: Record<string, any>;
}

export interface MistakeRow {
  id: number;
  match_id: string;
  steamid: string;
  round: number;
  type:
    | "unspent_utility"
    | "team_flash"
    | "untraded_early_death"
    | "died_holding_utility"
    | "self_flash_death";
  tick: number;
  x: number;
  y: number;
  z: number;
  layer: number; // 0 upper/default, 1 lower
  severity: 1 | 2 | 3;
  meta: Record<string, any>;
}

export interface IngestJobRow {
  id: string;
  match_id?: string | null;
  status: "queued" | "downloading" | "parsing" | "done" | "error";
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RoundSummaryRow {
  round_num: number;
  winner_team: "A" | "B";
  winner_side: "CT" | "T";
  reason: string;
  score_a: number;
  score_b: number;
}

export interface MatchDetailResponse {
  match: MatchRow;
  player_stats: PlayerMatchStatRow[];
  highlights: HighlightRow[];
  mistakes: MistakeRow[];
  rounds?: RoundSummaryRow[];
}

export interface MapCalibration {
  pos_x: number;
  pos_y: number;
  scale: number;
  lower_z_max?: number | null;
  upper_radar: string;
  lower_radar?: string | null;
}

export interface BombsiteZone {
  site: "A" | "B";
  x: number;
  y: number;
  w: number;
  h: number;
  labelX: number;
  labelY: number;
}

export const MAP_BOMBSITES: Record<string, BombsiteZone[]> = {
  de_dust2: [
    { site: "A", x: 770, y: 120, w: 95, h: 80, labelX: 785, labelY: 135 },
    { site: "B", x: 160, y: 110, w: 90, h: 90, labelX: 175, labelY: 125 },
  ],
  de_mirage: [
    { site: "A", x: 570, y: 730, w: 90, h: 90, labelX: 585, labelY: 745 },
    { site: "B", x: 170, y: 110, w: 85, h: 85, labelX: 185, labelY: 125 },
  ],
  de_inferno: [
    { site: "A", x: 620, y: 340, w: 85, h: 85, labelX: 635, labelY: 355 },
    { site: "B", x: 340, y: 140, w: 85, h: 85, labelX: 355, labelY: 155 },
  ],
  de_anubis: [
    { site: "A", x: 780, y: 260, w: 90, h: 85, labelX: 795, labelY: 275 },
    { site: "B", x: 310, y: 500, w: 85, h: 85, labelX: 325, labelY: 515 },
  ],
  de_ancient: [
    { site: "A", x: 650, y: 350, w: 85, h: 85, labelX: 665, labelY: 365 },
    { site: "B", x: 330, y: 290, w: 85, h: 85, labelX: 345, labelY: 305 },
  ],
  de_nuke: [
    { site: "A", x: 540, y: 450, w: 80, h: 80, labelX: 555, labelY: 465 },
    { site: "B", x: 540, y: 450, w: 80, h: 80, labelX: 555, labelY: 465 },
  ],
};

