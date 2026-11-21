import { ReplayFile, Round, Track, Nade, Kill, Changes } from "../types";

export interface DecodedTrack {
  n: number; // frames alive: arrays cover 0..n-1
  x: Int16Array;
  y: Int16Array;
  yaw: Int16Array; // 0..119
  hp: Uint8Array; // 0..100 for all frames 0..nf-1
  w: Uint8Array; // active weapon index for all frames 0..nf-1
  l: Uint8Array; // layer 0|1 for all frames 0..nf-1
  blinded: Uint8Array; // 1 if blinded, 0 otherwise for all frames 0..nf-1
  fl?: [number, number][]; // [startFrame, durationFrames] for continuous degree of blindness
}

export interface DecodedNade {
  t: "smoke" | "flash" | "he" | "molotov" | "decoy";
  p: number; // thrower pidx
  f0: number; // first frame of flight
  x: Int16Array;
  y: Int16Array;
  det?: [number, number, number, number]; // [frame, x, y, end_frame]
}

export interface DecodedRound {
  n: number; // round number (1-based)
  t0: number; // demo tick of frame 0
  nf: number; // frame count
  fe: number; // frame index of freeze end
  side_a: "T" | "CT";
  winner: "T" | "CT";
  reason: string;
  score: [number, number];
  tracks: (DecodedTrack | null)[];
  bomb?: {
    plant?: [number, number, number, number];
    defuse?: [number, number];
    explode?: number;
  };
  nades: DecodedNade[];
  kills: Kill[];
  shots: { frames: Int32Array; pidx: number[] };
}

// Module-level cache: keyed by `${match_id}:${roundIdx}`
const DECODE_CACHE = new Map<string, DecodedRound>();

function expandChanges(changes: Changes | undefined, nf: number, defaultVal = 0): Uint8Array {
  const arr = new Uint8Array(nf);
  if (!changes || changes.length === 0) {
    arr.fill(defaultVal);
    return arr;
  }
  let cIdx = 0;
  let currVal = defaultVal;
  for (let f = 0; f < nf; f++) {
    while (cIdx < changes.length && changes[cIdx][0] <= f) {
      currVal = changes[cIdx][1];
      cIdx++;
    }
    arr[f] = currVal;
  }
  return arr;
}

function expandBlinded(fl: [number, number][] | undefined, nf: number): Uint8Array {
  const arr = new Uint8Array(nf);
  if (!fl || fl.length === 0) return arr;

  for (const [startFrame, blindFrames] of fl) {
    const end = Math.min(nf, startFrame + blindFrames);
    for (let f = Math.max(0, startFrame); f < end; f++) {
      arr[f] = 1;
    }
  }
  return arr;
}

export function decodeTrack(track: Track, nf: number): DecodedTrack {
  const n = track.n;
  const x = new Int16Array(n);
  const y = new Int16Array(n);
  const yaw = new Int16Array(n);

  if (n > 0) {
    // Prefix sum x
    let accX = track.x[0] || 0;
    x[0] = accX;
    for (let i = 1; i < n; i++) {
      accX += track.x[i] || 0;
      x[i] = accX;
    }

    // Prefix sum y
    let accY = track.y[0] || 0;
    y[0] = accY;
    for (let i = 1; i < n; i++) {
      accY += track.y[i] || 0;
      y[i] = accY;
    }

    // Prefix sum yaw modulo 120: ((acc % 120) + 120) % 120
    let accYaw = ((track.yaw[0] || 0) % 120 + 120) % 120;
    yaw[0] = accYaw;
    for (let i = 1; i < n; i++) {
      accYaw = ((accYaw + (track.yaw[i] || 0)) % 120 + 120) % 120;
      yaw[i] = accYaw;
    }
  }

  const hp = expandChanges(track.hp, nf, 100);
  const w = expandChanges(track.w, nf, 0);
  const l = expandChanges(track.l, nf, 0);
  const blinded = expandBlinded(track.fl, nf);

  return { n, x, y, yaw, hp, w, l, blinded, fl: track.fl };
}

export function decodeNade(nade: Nade): DecodedNade {
  const len = nade.x.length;
  const x = new Int16Array(len);
  const y = new Int16Array(len);

  if (len > 0) {
    let accX = nade.x[0] || 0;
    x[0] = accX;
    for (let i = 1; i < len; i++) {
      accX += nade.x[i] || 0;
      x[i] = accX;
    }

    let accY = nade.y[0] || 0;
    y[0] = accY;
    for (let i = 1; i < len; i++) {
      accY += nade.y[i] || 0;
      y[i] = accY;
    }
  }

  return {
    t: nade.t,
    p: nade.p,
    f0: nade.f0,
    x,
    y,
    det: nade.det,
  };
}

export function decodeRound(replay: ReplayFile, roundIdx: number): DecodedRound {
  const cacheKey = `${replay.match_id}:${roundIdx}`;
  const cached = DECODE_CACHE.get(cacheKey);
  if (cached) return cached;

  const round = replay.rounds[roundIdx];
  if (!round) {
    throw new Error(`Round index ${roundIdx} out of bounds in replay ${replay.match_id}`);
  }

  const tracks: (DecodedTrack | null)[] = round.p.map((t) =>
    t ? decodeTrack(t, round.nf) : null
  );

  const nades: DecodedNade[] = round.nades.map((nade) => decodeNade(nade));

  // Prefix sum shots[0]
  const shotCount = round.shots && round.shots[0] ? round.shots[0].length : 0;
  const shotsFrames = new Int32Array(shotCount);
  if (shotCount > 0) {
    let accShot = round.shots[0][0] || 0;
    shotsFrames[0] = accShot;
    for (let i = 1; i < shotCount; i++) {
      accShot += round.shots[0][i] || 0;
      shotsFrames[i] = accShot;
    }
  }

  const decoded: DecodedRound = {
    n: round.n,
    t0: round.t0,
    nf: round.nf,
    fe: round.fe,
    side_a: round.side_a,
    winner: round.winner,
    reason: round.reason,
    score: round.score,
    tracks,
    bomb: round.bomb,
    nades,
    kills: round.kills || [],
    shots: {
      frames: shotsFrames,
      pidx: round.shots && round.shots[1] ? round.shots[1] : [],
    },
  };

  DECODE_CACHE.set(cacheKey, decoded);
  return decoded;
}

export function clearDecodeCache(): void {
  DECODE_CACHE.clear();
}
