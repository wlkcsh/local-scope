import { ReplayFile, Side, MAP_BOMBSITES } from "../types";
import { DecodedRound } from "./decode";
import { sampleTrackAt, sampleNadeAt, SampledPlayerState } from "./interpolate";
import { MAP_CALIBRATION, project } from "./project";

export interface RenderState {
  replay: ReplayFile;
  round: DecodedRound;
  playhead: number;
  canvasSize: number;
  activeLayer: number;
  selectedPidx: number | null;
  zoom: number;
  panX: number;
  panY: number;
}

// ==========================================
// Pre-computed Unit Shapes (Zero runtime allocation)
// ==========================================
const PIN_RADIUS = 11;
const PIN_TIP = PIN_RADIUS * 1.6;
const TANGENT_ANGLE = Math.acos(PIN_RADIUS / PIN_TIP); // ~51.3° exact continuous tangent

const TEARDROP_PATH: Path2D | null = typeof Path2D !== "undefined" ? (() => {
  const p = new Path2D();
  p.moveTo(PIN_TIP, 0);
  p.lineTo(
    PIN_RADIUS * Math.cos(TANGENT_ANGLE),
    PIN_RADIUS * Math.sin(TANGENT_ANGLE)
  );
  p.arc(0, 0, PIN_RADIUS, TANGENT_ANGLE, Math.PI * 2 - TANGENT_ANGLE, false);
  p.closePath();
  return p;
})() : null;

const MUZZLE_PATH: Path2D | null = typeof Path2D !== "undefined" ? (() => {
  const p = new Path2D();
  p.moveTo(PIN_TIP + 1, 0);
  p.lineTo(PIN_TIP + 14, -4);
  p.lineTo(PIN_TIP + 11, 0);
  p.lineTo(PIN_TIP + 14, 4);
  p.closePath();
  return p;
})() : null;

// Centered in [-5, 5] space for 8px in-flight utility badges
const GRENADE_GLYPHS: Record<string, Path2D> | null = typeof Path2D !== "undefined" ? {
  smoke: new Path2D("M-2.2,-3.2 H2.2 V4 H-2.2 Z M-1.1,-4.8 H1.1 V-3.2 H-1.1 Z"),
  flash: new Path2D(
    "M0,-5 L1.1,-1.5 L3.5,-3.5 L1.5,-1.1 L5,0 L1.5,1.1 L3.5,3.5 L1.1,1.5 L0,5 L-1.1,1.5 L-3.5,3.5 L-1.5,1.1 L-5,0 L-1.5,-1.1 L-3.5,-3.5 L-1.1,-1.5 Z"
  ),
  he: new Path2D(
    "M-2.5,-1.4 C-2.5,-3.1 2.5,-3.1 2.5,-1.4 C3.1,0.9 2.3,4.2 0,4.5 C-2.3,4.2 -3.1,0.9 -2.5,-1.4 Z M-1,-4.8 H1.5 V-3.1 H-1 Z"
  ),
  molotov: new Path2D(
    "M0,-5 C2.4,-2.2 3.9,0.2 3.4,2.4 C3,4.1 1.6,4.8 0,4.8 C-1.8,4.8 -3.3,3.8 -3.5,2 C-3.7,0.4 -2.5,-1.2 -1.5,-2.2 C-1.7,-0.8 -1.1,0 -0.5,-0.2 C-0.9,-1.8 -0.5,-3.5 0,-5 Z"
  ),
  decoy: new Path2D("M-3.5,0 A3.5,3.5 0 1,0 3.5,0 A3.5,3.5 0 1,0 -3.5,0"),
} : null;

function renderTeardrop(ctx: CanvasRenderingContext2D): void {
  if (TEARDROP_PATH) {
    ctx.fill(TEARDROP_PATH);
    ctx.stroke(TEARDROP_PATH);
  } else {
    ctx.beginPath();
    ctx.moveTo(PIN_TIP, 0);
    ctx.lineTo(
      PIN_RADIUS * Math.cos(TANGENT_ANGLE),
      PIN_RADIUS * Math.sin(TANGENT_ANGLE)
    );
    ctx.arc(0, 0, PIN_RADIUS, TANGENT_ANGLE, Math.PI * 2 - TANGENT_ANGLE, false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function renderMuzzle(ctx: CanvasRenderingContext2D): void {
  if (MUZZLE_PATH) {
    ctx.fill(MUZZLE_PATH);
  } else {
    ctx.beginPath();
    ctx.moveTo(PIN_TIP + 1, 0);
    ctx.lineTo(PIN_TIP + 14, -4);
    ctx.lineTo(PIN_TIP + 11, 0);
    ctx.lineTo(PIN_TIP + 14, 4);
    ctx.closePath();
    ctx.fill();
  }
}

const GLYPH_COLORS: Record<string, string> = {
  smoke: "#E2E8F0",
  flash: "#FEF9C3",
  he: "#F87171",
  molotov: "#FB923C",
  decoy: "#C084FC",
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function lowerBound(arr: Int32Array | number[], target: number): number {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (arr[mid] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function drawForeground(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const {
    replay,
    round,
    playhead,
    canvasSize,
    activeLayer,
    selectedPidx,
    zoom,
    panX,
    panY,
  } = state;

  const mapName = replay.map;
  const calibration = MAP_CALIBRATION[mapName] || MAP_CALIBRATION["de_mirage"];
  const mapScale = calibration.scale;
  const scaleFactor = canvasSize / 1024;
  const q = replay.q;

  // Convert 1024 radar coordinate to camera world space
  const toCanvasX = (px: number) => px * scaleFactor;
  const toCanvasY = (py: number) => py * scaleFactor;
  const toCanvasRadius = (worldUnits: number) => (worldUnits / mapScale) * scaleFactor;

  // Convert 1024 radar coordinate to screen space (scale-invariant fixed pixels)
  const toScreenX = (px: number) =>
    (px * scaleFactor - canvasSize / 2) * zoom + canvasSize / 2 + panX;
  const toScreenY = (py: number) =>
    (py * scaleFactor - canvasSize / 2) * zoom + canvasSize / 2 + panY;

  // Sample player states for this frame
  const sampledPlayers: (SampledPlayerState | null)[] = round.tracks.map((track) =>
    track ? sampleTrackAt(track, playhead, q, mapName) : null
  );

  // Helper: determine player team side ("CT" or "T")
  const getPlayerSide = (pidx: number): Side => {
    const playerDef = replay.players[pidx];
    if (!playerDef) return "CT";
    const teamLetter = playerDef.team; // "A" or "B"
    if (teamLetter === "A") {
      return round.side_a;
    } else {
      return round.side_a === "CT" ? "T" : "CT";
    }
  };

  // Map players to team slots (1..5 per team, broadcast standard)
  const ctIndices: number[] = [];
  const tIndices: number[] = [];
  replay.players.forEach((p, idx) => {
    const side = getPlayerSide(idx);
    if (side === "CT") ctIndices.push(idx);
    else tIndices.push(idx);
  });

  const playerSlotMap = new Map<number, number>();
  ctIndices.forEach((pidx, slotIdx) => playerSlotMap.set(pidx, slotIdx + 1));
  tIndices.forEach((pidx, slotIdx) => playerSlotMap.set(pidx, slotIdx + 1));

  // Determine C4 bomb carrier before plant
  let c4CarrierPidx: number | null = null;
  const isBombPlanted = round.bomb?.plant && playhead >= round.bomb.plant[0];
  if (!isBombPlanted) {
    if (round.bomb?.plant) {
      c4CarrierPidx = round.bomb.plant[3];
    }
    for (const pidx of tIndices) {
      const pState = sampledPlayers[pidx];
      if (pState && pState.alive) {
        const wName = (replay.weapons[pState.weaponIdx] || "").toLowerCase();
        if (wName.includes("c4")) {
          c4CarrierPidx = pidx;
          break;
        }
      }
    }
  }

  // Check recent shots to trigger shooting muzzle flash (within last 3 frames / ~375ms)
  const shootingPlayers = new Set<number>();
  if (round.shots && round.shots.frames && round.shots.frames.length > 0) {
    const shotFrames = round.shots.frames;
    const shotPidxs = round.shots.pidx;
    const startIndex = lowerBound(shotFrames, playhead - 3);
    for (let s = startIndex; s < shotFrames.length; s++) {
      if (shotFrames[s] > playhead) break;
      shootingPlayers.add(shotPidxs[s]);
    }
  }

  // =========================================================================
  // PASS 1: WORLD-SPACE PASS (Transforms with Camera Zoom & Pan)
  // Map overlays, smokes, fire zones, bomb, trails
  // =========================================================================
  ctx.save();
  ctx.translate(canvasSize / 2 + panX, canvasSize / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-canvasSize / 2, -canvasSize / 2);

  // 1. Bombsite Plant Zones & Broadcast [A] / [B] Badges
  const siteZones = MAP_BOMBSITES[mapName];
  if (siteZones && siteZones.length > 0) {
    ctx.save();
    for (const zone of siteZones) {
      const zx = toCanvasX(zone.x);
      const zy = toCanvasY(zone.y);
      const zw = zone.w * scaleFactor;
      const zh = zone.h * scaleFactor;

      // Dashed boundary around plant area
      ctx.strokeStyle = zone.site === "A" ? "rgba(249, 115, 22, 0.75)" : "rgba(239, 68, 68, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      if (typeof ctx.strokeRect === "function") {
        ctx.strokeRect(zx, zy, zw, zh);
      } else {
        ctx.beginPath();
        ctx.moveTo(zx, zy);
        ctx.lineTo(zx + zw, zy);
        ctx.lineTo(zx + zw, zy + zh);
        ctx.lineTo(zx, zy + zh);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.fillStyle = zone.site === "A" ? "rgba(249, 115, 22, 0.08)" : "rgba(239, 68, 68, 0.08)";
      ctx.fillRect(zx, zy, zw, zh);
      ctx.setLineDash([]);

      // Broadcast Site Badge [A] or [B]
      const badgeSize = 18 * scaleFactor;
      const lx = toCanvasX(zone.labelX);
      const ly = toCanvasY(zone.labelY);
      ctx.fillStyle = zone.site === "A" ? "#ea580c" : "#dc2626";
      ctx.fillRect(lx, ly, badgeSize, badgeSize);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      if (typeof ctx.strokeRect === "function") {
        ctx.strokeRect(lx, ly, badgeSize, badgeSize);
      } else {
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + badgeSize, ly);
        ctx.lineTo(lx + badgeSize, ly + badgeSize);
        ctx.lineTo(lx, ly + badgeSize);
        ctx.closePath();
        ctx.stroke();
      }

      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(9, Math.round(11 * scaleFactor))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(zone.site, lx + badgeSize / 2, ly + badgeSize / 2);
    }
    ctx.restore();
  }

  // 2. Smokes (Volumetric bloom + countdown timer arc)
  for (const nade of round.nades) {
    if (nade.t !== "smoke" || !nade.det) continue;
    const detStart = nade.det[0];
    const detEnd = nade.det[3];
    if (playhead >= detStart && playhead <= detEnd) {
      const sample = sampleNadeAt(nade, playhead, q, mapName);
      if (sample && sample.detPx != null && sample.detPy != null) {
        ctx.save();
        if (activeLayer !== 0) ctx.globalAlpha = 0.25;

        const cx = toCanvasX(sample.detPx);
        const cy = toCanvasY(sample.detPy);
        const totalDuration = detEnd - detStart;
        const elapsed = playhead - detStart;
        const bloom = easeOutCubic(elapsed / 8); // bloom over ~1s
        const r = toCanvasRadius(144) * (0.3 + 0.7 * bloom);
        const remainingRatio = Math.max(0, 1 - elapsed / totalDuration);

        // Core fill
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 195, 210, ${sample.alpha * 0.76})`;
        ctx.fill();

        // Soft team/smoke contour
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(220, 230, 245, ${sample.alpha * 0.9})`;
        ctx.stroke();

        // Perimeter countdown timer arc
        if (elapsed > 4) {
          ctx.strokeStyle = elapsed > totalDuration - 28 ? "#f59e0b" : "rgba(255, 255, 255, 0.75)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remainingRatio);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // 3. Molotovs (Organic overlapping flame lobes with subtle flicker)
  for (const nade of round.nades) {
    if (nade.t !== "molotov" || !nade.det) continue;
    const detStart = nade.det[0];
    const detEnd = nade.det[3];
    if (playhead >= detStart && playhead <= detEnd) {
      const sample = sampleNadeAt(nade, playhead, q, mapName);
      if (sample && sample.detPx != null && sample.detPy != null) {
        ctx.save();
        const cx = toCanvasX(sample.detPx);
        const cy = toCanvasY(sample.detPy);
        const elapsed = playhead - detStart;
        const bloom = easeOutCubic(elapsed / 4);
        const r = toCanvasRadius(120) * bloom;
        const flicker = 0.85 + 0.15 * Math.sin(playhead * 1.8 + nade.p);

        ctx.globalAlpha = sample.alpha * flicker;
        ctx.fillStyle = "rgba(234, 88, 12, 0.28)";
        ctx.strokeStyle = "rgba(251, 146, 60, 0.85)";
        ctx.lineWidth = 1.5;

        // 4 overlapping flame lobes for organic fire spread
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2 + nade.p * 0.5;
          const ox = cx + Math.cos(angle) * r * 0.28;
          const oy = cy + Math.sin(angle) * r * 0.28;
          ctx.beginPath();
          ctx.arc(ox, oy, r * 0.65, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // 4. Flash and HE Detonation Shockwaves
  const EXPLODE_FRAMES = 8;
  for (const nade of round.nades) {
    if (nade.t !== "flash" && nade.t !== "he") continue;
    if (!nade.det) continue;
    const detStart = nade.det[0];
    const detEnd = detStart + EXPLODE_FRAMES;
    if (playhead >= detStart && playhead <= detEnd) {
      const sample = sampleNadeAt(nade, playhead, q, mapName);
      if (sample && sample.detPx != null && sample.detPy != null) {
        ctx.save();
        const progress = Math.max(0, Math.min(1, (playhead - detStart) / EXPLODE_FRAMES));
        const easeOut = easeOutCubic(progress);
        const alpha = Math.max(0, 1 - progress);
        const cx = toCanvasX(sample.detPx);
        const cy = toCanvasY(sample.detPy);

        if (nade.t === "flash") {
          const maxRadius = toCanvasRadius(130);
          const r = 6 + easeOut * (maxRadius - 6);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(1, 2.5 * (1 - easeOut * 0.5));
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
          ctx.stroke();

          if (progress < 0.35) {
            const bloomAlpha = (1 - progress / 0.35) * 0.75;
            ctx.beginPath();
            ctx.arc(cx, cy, 14 * (1 - progress / 0.35), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(254, 249, 195, ${bloomAlpha})`;
            ctx.fill();
          }
        } else {
          const maxRadius = toCanvasRadius(100);
          const r = 8 + easeOut * (maxRadius - 8);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(1, 3 * (1 - easeOut * 0.5));
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.95})`;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(251, 146, 60, ${alpha * 0.35})`;
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // 5. Grenade Flight Trails (Tapered tail + solid/dashed line style)
  const TRAIL_FADE_FRAMES = 8;
  for (const nade of round.nades) {
    const detStart = nade.det ? nade.det[0] : Infinity;
    if (playhead >= nade.f0 && playhead <= detStart + TRAIL_FADE_FRAMES) {
      const sample = sampleNadeAt(nade, playhead, q, mapName);
      if (sample && sample.trail.length > 1) {
        ctx.save();
        let trailFade = 1.0;
        if (playhead > detStart) {
          trailFade = Math.max(0, 1 - (playhead - detStart) / TRAIL_FADE_FRAMES);
        }

        const colorMap: Record<string, string> = {
          smoke: `rgba(203, 213, 225, ${0.75 * trailFade})`,
          flash: `rgba(254, 249, 195, ${0.75 * trailFade})`,
          he: `rgba(248, 113, 113, ${0.75 * trailFade})`,
          molotov: `rgba(251, 146, 60, ${0.75 * trailFade})`,
          decoy: `rgba(192, 132, 252, ${0.75 * trailFade})`,
        };

        ctx.beginPath();
        const firstPt = sample.trail[0];
        ctx.moveTo(toCanvasX(firstPt.px), toCanvasY(firstPt.py));
        for (let i = 1; i < sample.trail.length; i++) {
          ctx.lineTo(toCanvasX(sample.trail[i].px), toCanvasY(sample.trail[i].py));
        }

        ctx.strokeStyle = colorMap[nade.t] || `rgba(255, 255, 255, ${0.75 * trailFade})`;
        ctx.lineWidth = 1.5;
        // Dashed lines for flashes and decoys to distinguish pop-flashes from executes
        if (nade.t === "flash" || nade.t === "decoy") {
          ctx.setLineDash([3, 3]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  // 6. Bomb (Planted or Dropped on Floor)
  if (round.bomb && round.bomb.plant) {
    const plant = round.bomb.plant; // [frame, x, y, pidx]
    const plantFrame = plant[0];
    const defuseFrame = round.bomb.defuse ? round.bomb.defuse[0] : Infinity;
    const explodeFrame = round.bomb.explode != null ? round.bomb.explode : Infinity;

    const bWorldX = plant[1] * q.pos;
    const bWorldY = plant[2] * q.pos;
    const bProj = project(mapName, bWorldX, bWorldY, 0);
    const bx = toCanvasX(bProj.px);
    const by = toCanvasY(bProj.py);

    ctx.save();
    if (bProj.layer !== activeLayer) ctx.globalAlpha = 0.25;

    if (playhead >= plantFrame) {
      if (playhead >= explodeFrame) {
        // Exploded state: fiery blast ring
        ctx.beginPath();
        ctx.arc(bx, by, 18, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (playhead >= defuseFrame) {
        // Defused state: green marker
        ctx.beginPath();
        ctx.arc(bx, by, 9, 0, Math.PI * 2);
        ctx.fillStyle = "#22c55e";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Active ticking planted bomb
        const pulse = 1 + 0.28 * Math.sin(playhead * 1.5);
        ctx.beginPath();
        ctx.arc(bx, by, 8 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = "#eab308";
        ctx.fill();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 7. Shot Tracers (World Space)
  const TRACER_DECAY_FRAMES = 5;
  if (round.shots && round.shots.frames && round.shots.frames.length > 0) {
    const shotFrames = round.shots.frames;
    const shotPidxs = round.shots.pidx;
    const startIndex = lowerBound(shotFrames, playhead - TRACER_DECAY_FRAMES);
    for (let s = startIndex; s < shotFrames.length; s++) {
      const sf = shotFrames[s];
      if (sf > playhead) break;
      const pidx = shotPidxs[s];
      const shooterState = sampledPlayers[pidx];
      if (shooterState) {
        ctx.save();
        if (shooterState.layer !== activeLayer) ctx.globalAlpha = 0.25;
        const elapsed = playhead - sf;
        const decayProgress = Math.max(0, Math.min(1, elapsed / TRACER_DECAY_FRAMES));
        const alpha = Math.max(0, 1 - decayProgress);
        const sx = toCanvasX(shooterState.px);
        const sy = toCanvasY(shooterState.py);
        const tracerLen = toCanvasRadius(540);

        const ex = sx + tracerLen * Math.cos(shooterState.yawRad);
        const ey = sy - tracerLen * Math.sin(shooterState.yawRad);

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = `rgba(255, 235, 120, ${alpha * 0.9})`;
        ctx.lineWidth = Math.max(1, 2 * (1 - decayProgress * 0.5));
        ctx.stroke();

        if (decayProgress < 0.45) {
          const sparkAlpha = (1 - decayProgress / 0.45) * 0.95;
          ctx.beginPath();
          ctx.arc(sx, sy, 3.5 * (1 - decayProgress), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 245, 180, ${sparkAlpha})`;
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // 8. Kill Laser Lines (World Space)
  for (const kill of round.kills) {
    const [killFrame, killerPidx, victimPidx] = kill;
    if (killFrame <= playhead && playhead <= killFrame + 6) {
      if (killerPidx >= 0 && round.tracks[killerPidx] && round.tracks[victimPidx]) {
        const killerState = sampleTrackAt(round.tracks[killerPidx]!, killFrame, q, mapName);
        const victimState = sampleTrackAt(round.tracks[victimPidx]!, killFrame, q, mapName);
        if (killerState && victimState) {
          ctx.save();
          const decay = Math.max(0, 1 - (playhead - killFrame) / 6);
          ctx.beginPath();
          ctx.moveTo(toCanvasX(killerState.px), toCanvasY(killerState.py));
          ctx.lineTo(toCanvasX(victimState.px), toCanvasY(victimState.py));
          ctx.strokeStyle = `rgba(239, 68, 68, ${decay * 0.95})`;
          ctx.lineWidth = Math.max(1, 2.5 * decay);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  ctx.restore(); // End World-Space Pass

  // =========================================================================
  // PASS 2: SCREEN-SPACE PASS (Scale-Invariant Fixed CSS Pixel HUD)
  // Player teardrops, unrotated numbers, flash timer rings, grenade badges
  // =========================================================================

  // 1. Dead Player Markers (✕ with dark circular backing)
  const curPlayhead = Math.floor(playhead);
  for (const kill of round.kills) {
    const [killFrame, , victimPidx] = kill;
    if (killFrame <= curPlayhead && victimPidx >= 0 && round.tracks[victimPidx]) {
      const deathTrack = round.tracks[victimPidx]!;
      const deathFrame = Math.min(killFrame, deathTrack.n - 1);
      const victimState = sampleTrackAt(deathTrack, deathFrame, q, mapName);
      if (victimState) {
        const vx = toScreenX(victimState.px);
        const vy = toScreenY(victimState.py);

        ctx.save();
        if (victimState.layer !== activeLayer) ctx.globalAlpha = 0.25;

        // Expanding death ripple over first 8 frames
        if (playhead <= killFrame + 8) {
          const ripProg = (playhead - killFrame) / 8;
          const ripEase = 1 - Math.pow(1 - ripProg, 2);
          const ripR = 6 + ripEase * 18;
          ctx.beginPath();
          ctx.arc(vx, vy, ripR, 0, Math.PI * 2);
          ctx.lineWidth = 1.75;
          ctx.strokeStyle = `rgba(239, 68, 68, ${(1 - ripProg) * 0.85})`;
          ctx.stroke();
        }

        // Dark backing
        ctx.beginPath();
        ctx.arc(vx, vy, 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(11, 14, 20, 0.75)";
        ctx.fill();

        // Crisp ✕
        const dSize = 4.5;
        ctx.strokeStyle = "rgba(239, 68, 68, 0.95)";
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.moveTo(vx - dSize, vy - dSize);
        ctx.lineTo(vx + dSize, vy + dSize);
        ctx.moveTo(vx + dSize, vy - dSize);
        ctx.lineTo(vx - dSize, vy + dSize);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // 2. Living Player Directional Pins & Status Overlays
  for (let pidx = 0; pidx < sampledPlayers.length; pidx++) {
    const pState = sampledPlayers[pidx];
    if (!pState || !pState.alive) continue;

    const side = getPlayerSide(pidx);
    const isCT = side === "CT";
    const teamColor = isCT ? "#38BDF8" : "#F59E0B";
    const slot = playerSlotMap.get(pidx) || (pidx + 1);
    const isSelected = pidx === selectedPidx;
    const isShooting = shootingPlayers.has(pidx);
    const hasC4 = pidx === c4CarrierPidx;

    const sx = Math.round(toScreenX(pState.px));
    const sy = Math.round(toScreenY(pState.py));

    ctx.save();
    if (pState.layer !== activeLayer) ctx.globalAlpha = 0.25;

    // A. Selected / Focused: 55° FOV cone + concentric white halo ring
    if (isSelected) {
      ctx.save();
      ctx.translate(sx, sy);
      if (typeof ctx.rotate === "function") ctx.rotate(-pState.yawRad);
      ctx.fillStyle = isCT ? "rgba(56, 189, 248, 0.18)" : "rgba(245, 158, 11, 0.18)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 64, -0.48, 0.48); // ~55° FOV
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Concentric selection halo
      const pulse = 1 + 0.12 * Math.sin(playhead * 1.5);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(sx, sy, (PIN_RADIUS + 4) * pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, PIN_RADIUS + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // B. Rotated Teardrop Body + Muzzle Flash
    ctx.save();
    ctx.translate(sx, sy);
    if (typeof ctx.rotate === "function") ctx.rotate(-pState.yawRad);

    if (isShooting) {
      ctx.fillStyle = "#FEF08A";
      renderMuzzle(ctx);
    }

    ctx.fillStyle = teamColor;
    ctx.strokeStyle = "#090D12";
    ctx.lineWidth = 1.75;
    ctx.lineJoin = "round";
    renderTeardrop(ctx);
    ctx.restore();

    // C. Low-HP damage deficit arc (only drawn if hp < 100)
    if (pState.hp < 100) {
      const start = -Math.PI / 2;
      ctx.strokeStyle = "rgba(9, 13, 18, 0.65)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(
        sx,
        sy,
        PIN_RADIUS - 2,
        start + Math.PI * 2 * (pState.hp / 100),
        start + Math.PI * 2
      );
      ctx.stroke();
    }

    // D. Flashed State: Depleting radial timer ring + top-right starburst
    if (pState.flashRatio > 0.02) {
      // Depleting white countdown timer ring
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(
        sx,
        sy,
        PIN_RADIUS + 3.5,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * pState.flashRatio
      );
      ctx.stroke();

      // Top-right shoulder starburst spark
      ctx.fillStyle = "#FEF9C3";
      ctx.beginPath();
      ctx.arc(sx + PIN_RADIUS * 0.78, sy - PIN_RADIUS * 0.78, 3, 0, Math.PI * 2);
      ctx.fill();

      // Whiteout wash over pin proportional to blind degree
      if (pState.flashRatio > 0.25) {
        ctx.fillStyle = `rgba(255, 255, 255, ${pState.flashRatio * 0.65})`;
        ctx.beginPath();
        ctx.arc(sx, sy, PIN_RADIUS - 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // E. C4 Carrier Badge (bottom-right shoulder, blinking red LED)
    if (hasC4) {
      const bx = sx + PIN_RADIUS * 0.78;
      const by = sy + PIN_RADIUS * 0.78;
      ctx.fillStyle = "#EF4444";
      ctx.strokeStyle = "#090D12";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(bx, by, 4.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (Math.floor(playhead * 3) % 2 === 0) {
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // F. Centered Unrotated Player Number (Bold 1..5 in dark #090D12)
    ctx.fillStyle = "#090D12";
    ctx.font = "800 11px Inter, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(slot), sx, sy + 0.5);

    // G. Name + Weapon Label (for selected player)
    if (isSelected) {
      const playerDef = replay.players[pidx];
      const playerName = playerDef ? playerDef.name : `P${slot}`;
      const weaponName = replay.weapons[pState.weaponIdx] || "";

      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
      ctx.strokeText(playerName, sx, sy - 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(playerName, sx, sy - 16);

      if (weaponName) {
        ctx.font = "9px monospace";
        ctx.strokeText(weaponName, sx, sy + 22);
        ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
        ctx.fillText(weaponName, sx, sy + 22);
      }
    }

    ctx.restore();
  }

  // 3. In-Flight Grenade Badges with Vector Glyph & Thrower Slot Chip
  for (const nade of round.nades) {
    const detStart = nade.det ? nade.det[0] : Infinity;
    if (playhead >= nade.f0 && playhead <= detStart) {
      const sample = sampleNadeAt(nade, playhead, q, mapName);
      if (sample && sample.inFlight) {
        const gx = Math.round(toScreenX(sample.px));
        const gy = Math.round(toScreenY(sample.py));
        const throwerSide = getPlayerSide(nade.p);
        const throwerColor = throwerSide === "CT" ? "#38BDF8" : "#F59E0B";
        const throwerSlot = playerSlotMap.get(nade.p) || (nade.p + 1);

        ctx.save();
        ctx.translate(gx, gy);

        // Circular badge shell with thrower team border
        ctx.fillStyle = "#0F172A";
        ctx.strokeStyle = throwerColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Utility vector glyph
        const glyph = GRENADE_GLYPHS ? GRENADE_GLYPHS[nade.t] : null;
        if (glyph) {
          if (nade.t === "decoy") {
            ctx.strokeStyle = GLYPH_COLORS.decoy;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([2, 1.5]);
            ctx.stroke(glyph);
            ctx.setLineDash([]);
          } else {
            ctx.fillStyle = GLYPH_COLORS[nade.t] || "#FFFFFF";
            ctx.fill(glyph);
          }
        } else {
          // Fallback glyph for environments without Path2D
          ctx.fillStyle = GLYPH_COLORS[nade.t] || "#FFFFFF";
          ctx.beginPath();
          ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Micro thrower slot chip (+6.5, +6.5)
        ctx.fillStyle = throwerColor;
        ctx.strokeStyle = "#090D12";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(6.5, 6.5, 4.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#090D12";
        ctx.font = "800 7.5px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(throwerSlot), 6.5, 7);

        ctx.restore();
      }
    }
  }
}
