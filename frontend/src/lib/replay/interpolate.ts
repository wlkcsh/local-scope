import { DecodedTrack, DecodedNade } from "./decode";
import { project } from "./project";

/**
 * Computes shortest arc between two yaw steps in 120-step space (mod 120).
 * Range is [-60, 60].
 */
export function shortestYawArc(y0: number, y1: number): number {
  let d = (y1 - y0) % 120;
  if (d > 60) d -= 120;
  if (d < -60) d += 120;
  return d;
}

export interface SampledPlayerState {
  px: number;
  py: number;
  yawRad: number;
  hp: number;
  weaponIdx: number;
  layer: number;
  blinded: boolean;
  alive: boolean;
}

/**
 * Catmull-Rom cubic spline interpolation for C1-continuous smooth movement
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Samples and interpolates a player's track at a continuous playhead frame.
 * Returns null if the player is dead or the track is empty.
 */
export function sampleTrackAt(
  track: DecodedTrack,
  playhead: number,
  q: { pos: number; yaw: number },
  mapName: string
): SampledPlayerState | null {
  if (track.n === 0 || playhead >= track.n) {
    return null; // Dead or inactive
  }

  const i = Math.max(0, Math.min(Math.floor(playhead), track.n - 1));
  const iPrev = Math.max(0, i - 1);
  const iNext = Math.min(i + 1, track.n - 1);
  const iNextNext = Math.min(i + 2, track.n - 1);
  const a = Math.max(0, Math.min(1, playhead - i));

  // Catmull-Rom spline interpolation eliminates robotic straight-line kinks
  const wx = catmullRom(track.x[iPrev], track.x[i], track.x[iNext], track.x[iNextNext], a) * q.pos;
  const wy = catmullRom(track.y[iPrev], track.y[i], track.y[iNext], track.y[iNextNext], a) * q.pos;

  const proj = project(mapName, wx, wy, 0);

  // Smoothstep interpolation for yaw eliminates rotational twitching
  const arc = shortestYawArc(track.yaw[i], track.yaw[iNext]);
  const smoothA = a * a * (3 - 2 * a);
  const yStep = ((track.yaw[i] + arc * smoothA) % 120 + 120) % 120;
  const yawRad = (yStep * 3 * Math.PI) / 180;

  return {
    px: proj.px,
    py: proj.py,
    yawRad,
    hp: track.hp[i] ?? 100,
    weaponIdx: track.w[i] ?? 0,
    layer: track.l[i] ?? 0,
    blinded: (track.blinded[i] ?? 0) === 1,
    alive: true,
  };
}

export interface SampledNadeState {
  type: "smoke" | "flash" | "he" | "molotov" | "decoy";
  inFlight: boolean;
  activeDetonation: boolean;
  px: number;
  py: number;
  detPx?: number;
  detPy?: number;
  alpha: number;
  progress: number; // 0..1 detonation progress or flight progress
  trail: { px: number; py: number }[];
}

/**
 * Samples a grenade's active state (in-flight trajectory and detonation) at a playhead frame.
 */
export function sampleNadeAt(
  nade: DecodedNade,
  playhead: number,
  q: { pos: number; yaw: number },
  mapName: string
): SampledNadeState | null {
  if (playhead < nade.f0) return null;

  const detStart = nade.det ? nade.det[0] : Infinity;
  const detEnd = nade.det ? nade.det[3] : Infinity;

  if (playhead > detEnd) return null; // Expired

  const inFlight = playhead >= nade.f0 && playhead <= detStart;
  const activeDetonation = nade.det != null && playhead >= detStart && playhead <= detEnd;

  let currentPx = 0;
  let currentPy = 0;
  let trail: { px: number; py: number }[] = [];

  const flightLen = nade.x.length;
  if (flightLen > 0) {
    const localF = Math.max(0, Math.min(playhead - nade.f0, flightLen - 1));
    const i = Math.floor(localF);
    const iNext = Math.min(i + 1, flightLen - 1);
    const a = localF - i;

    const wx = (nade.x[i] + (nade.x[iNext] - nade.x[i]) * a) * q.pos;
    const wy = (nade.y[i] + (nade.y[iNext] - nade.y[i]) * a) * q.pos;
    const proj = project(mapName, wx, wy, 0);
    currentPx = proj.px;
    currentPy = proj.py;

    // Build last 8 points of trail
    const startPoint = Math.max(0, i - 7);
    for (let p = startPoint; p <= i; p++) {
      const pWorldX = nade.x[p] * q.pos;
      const pWorldY = nade.y[p] * q.pos;
      const ptProj = project(mapName, pWorldX, pWorldY, 0);
      trail.push({ px: ptProj.px, py: ptProj.py });
    }
    trail.push({ px: currentPx, py: currentPy });
  }

  let detPx: number | undefined;
  let detPy: number | undefined;
  let alpha = 1;
  let progress = 0;

  if (activeDetonation && nade.det) {
    const detWorldX = nade.det[1] * q.pos;
    const detWorldY = nade.det[2] * q.pos;
    const detProj = project(mapName, detWorldX, detWorldY, 0);
    detPx = detProj.px;
    detPy = detProj.py;

    const totalFrames = detEnd - detStart;
    const framesElapsed = playhead - detStart;
    progress = totalFrames > 0 ? framesElapsed / totalFrames : 1;

    if (nade.t === "smoke") {
      // Smoke alpha fades over last 8 frames
      const remainingFrames = detEnd - playhead;
      if (remainingFrames <= 8) {
        alpha = Math.max(0, remainingFrames / 8);
      } else {
        alpha = 0.75;
      }
    } else if (nade.t === "molotov") {
      // Subtle sine flicker
      alpha = 0.45 + Math.sin(playhead * 0.8) * 0.08;
    } else if (nade.t === "flash" || nade.t === "he") {
      alpha = Math.max(0, 1 - progress);
    }
  }

  return {
    type: nade.t,
    inFlight,
    activeDetonation,
    px: currentPx,
    py: currentPy,
    detPx,
    detPy,
    alpha,
    progress,
    trail,
  };
}
