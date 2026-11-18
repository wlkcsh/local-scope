import { ReplayFile, Side } from "../types";
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
  const inv = 1 / zoom;

  ctx.save();
  // Apply camera zoom and pan centered on canvas
  ctx.translate(canvasSize / 2 + panX, canvasSize / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-canvasSize / 2, -canvasSize / 2);

  // Helper to convert 1024-radar px, py to canvas pixels
  const toCanvasX = (px: number) => px * scaleFactor;
  const toCanvasY = (py: number) => py * scaleFactor;
  const toCanvasRadius = (worldUnits: number) => (worldUnits / mapScale) * scaleFactor;

  // Cache player sample states for this frame to avoid re-sampling
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

  // ==========================================
  // Layer 2: Smokes
  // Grey circle (rgba(180, 190, 200, alpha)), radius 144 world units, alpha = 0.75 fading over last 8 frames
  // ==========================================
  for (const nade of round.nades) {
    if (nade.t !== "smoke" || !nade.det) continue;
    const detStart = nade.det[0];
    const detEnd = nade.det[3];
    if (playhead >= detStart && playhead <= detEnd) {
      const sample = sampleNadeAt(nade, playhead, q, mapName);
      if (sample && sample.detPx != null && sample.detPy != null) {
        ctx.save();
        const nadeLayer = 0; // default layer
        if (nadeLayer !== activeLayer) {
          ctx.globalAlpha = 0.25;
        }

        const cx = toCanvasX(sample.detPx);
        const cy = toCanvasY(sample.detPy);
        const r = toCanvasRadius(144);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 190, 200, ${sample.alpha * 0.75})`;
        ctx.fill();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(220, 230, 240, ${sample.alpha * 0.9})`;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ==========================================
  // Layer 3: Molotovs
  // Orange circle (rgba(255, 110, 20, alpha)), radius 120 world units, alpha = 0.45 with subtle sine flicker
  // ==========================================
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
        const r = toCanvasRadius(120);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 110, 20, ${sample.alpha})`;
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(255, 160, 40, ${sample.alpha * 1.2})`;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ==========================================
  // Layer 4: Flash and HE
  // Expanding shockwave and blast core over 8 frames (~1s), white for flash, red-orange for HE
  // ==========================================
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
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const alpha = Math.max(0, 1 - progress);
        const cx = toCanvasX(sample.detPx);
        const cy = toCanvasY(sample.detPy);

        if (nade.t === "flash") {
          // Flashbang: expanding blinding shockwave + bright core
          const maxRadius = toCanvasRadius(120);
          const r = 6 + easeOut * (maxRadius - 6);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(1, 2.5 * (1 - easeOut * 0.5));
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
          ctx.stroke();

          // Inner flash bloom
          if (progress < 0.35) {
            const bloomAlpha = (1 - progress / 0.35) * 0.7;
            ctx.beginPath();
            ctx.arc(cx, cy, 14 * (1 - progress / 0.35), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${bloomAlpha})`;
            ctx.fill();
          }
        } else {
          // HE Grenade: fiery blast ring + shockwave + blast core
          const maxRadius = toCanvasRadius(90);
          const r = 8 + easeOut * (maxRadius - 8);

          // Outer shockwave
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(1, 3 * (1 - easeOut * 0.5));
          ctx.strokeStyle = `rgba(255, 75, 25, ${alpha * 0.95})`;
          ctx.stroke();

          // Blast core fill
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 120, 30, ${alpha * 0.35})`;
          ctx.fill();

          // Shrapnel particles
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const pDist = r * 0.85;
            const px = cx + Math.cos(angle) * pDist;
            const py = cy + Math.sin(angle) * pDist;
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 200, 80, ${alpha * 0.9})`;
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }
  }

  // ==========================================
  // Layer 5: Nade trails
  // Polyline of flight path with small dot in flight, persisting and fading over 8 frames after detonation
  // ==========================================
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

        ctx.beginPath();
        const firstPt = sample.trail[0];
        ctx.moveTo(toCanvasX(firstPt.px), toCanvasY(firstPt.py));
        for (let i = 1; i < sample.trail.length; i++) {
          ctx.lineTo(toCanvasX(sample.trail[i].px), toCanvasY(sample.trail[i].py));
        }

        const colorMap: Record<string, string> = {
          smoke: `rgba(200, 210, 225, ${0.75 * trailFade})`,
          flash: `rgba(100, 220, 255, ${0.75 * trailFade})`,
          he: `rgba(255, 80, 80, ${0.75 * trailFade})`,
          molotov: `rgba(255, 140, 30, ${0.75 * trailFade})`,
          decoy: `rgba(150, 150, 150, ${0.75 * trailFade})`,
        };

        ctx.strokeStyle = colorMap[nade.t] || `rgba(255, 255, 255, ${0.75 * trailFade})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Small dot at projectile head only while in flight
        if (playhead <= detStart) {
          const headX = toCanvasX(sample.px);
          const headY = toCanvasY(sample.py);
          ctx.beginPath();
          ctx.arc(headX, headY, 3, 0, Math.PI * 2);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // ==========================================
  // Layer 6: Bomb
  // Yellow/red marker at bomb.plant once playhead >= plant[0], pulsing until defuse or explode
  // ==========================================
  if (round.bomb && round.bomb.plant) {
    const plant = round.bomb.plant; // [frame, x, y, pidx]
    const plantFrame = plant[0];
    const defuseFrame = round.bomb.defuse ? round.bomb.defuse[0] : Infinity;
    const explodeFrame = round.bomb.explode != null ? round.bomb.explode : Infinity;

    if (playhead >= plantFrame) {
      const bWorldX = plant[1] * q.pos;
      const bWorldY = plant[2] * q.pos;
      const bProj = project(mapName, bWorldX, bWorldY, 0);
      const bx = toCanvasX(bProj.px);
      const by = toCanvasY(bProj.py);

      ctx.save();
      if (bProj.layer !== activeLayer) {
        ctx.globalAlpha = 0.25;
      }

      if (playhead >= explodeFrame) {
        // Exploded state: orange burst ring
        ctx.beginPath();
        ctx.arc(bx, by, 16 * inv, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 * inv;
        ctx.stroke();
      } else if (playhead >= defuseFrame) {
        // Defused state: green marker
        ctx.beginPath();
        ctx.arc(bx, by, 8 * inv, 0, Math.PI * 2);
        ctx.fillStyle = "#22c55e";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 * inv;
        ctx.stroke();
      } else {
        // Active ticking bomb: pulsing red/yellow
        const pulse = 1 + 0.25 * Math.sin(playhead * 1.5);
        ctx.beginPath();
        ctx.arc(bx, by, 7 * pulse * inv, 0, Math.PI * 2);
        ctx.fillStyle = "#eab308";
        ctx.fill();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2.5 * inv;
        ctx.stroke();

        // Inner core
        ctx.beginPath();
        ctx.arc(bx, by, 3 * inv, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ==========================================
  // Layer 7: Shot tracers (Decaying beam + muzzle spark over 5 frames / ~625ms)
  // ==========================================
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
        if (shooterState.layer !== activeLayer) {
          ctx.globalAlpha = 0.25;
        }
        const elapsed = playhead - sf;
        const decayProgress = Math.max(0, Math.min(1, elapsed / TRACER_DECAY_FRAMES));
        const alpha = Math.max(0, 1 - decayProgress);
        const sx = toCanvasX(shooterState.px);
        const sy = toCanvasY(shooterState.py);
        const tracerLen = toCanvasRadius(540);

        // Canvas Y is downwards, so negate sin(yaw)
        const ex = sx + tracerLen * Math.cos(shooterState.yawRad);
        const ey = sy - tracerLen * Math.sin(shooterState.yawRad);

        // Glowing tracer beam
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = `rgba(255, 235, 120, ${alpha * 0.9})`;
        ctx.lineWidth = Math.max(1 * inv, 2 * (1 - decayProgress * 0.5) * inv);
        ctx.stroke();

        // Muzzle spark at shooter
        if (decayProgress < 0.45) {
          const sparkAlpha = (1 - decayProgress / 0.45) * 0.95;
          ctx.beginPath();
          ctx.arc(sx, sy, 3.5 * (1 - decayProgress) * inv, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 245, 180, ${sparkAlpha})`;
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // ==========================================
  // Layer 8: Kill tracers & Death markers
  // - Laser line from killer to victim over 6 frames (~750ms)
  // - Death shockwave ring over first 8 frames
  // - Persistent crisp ✕ with dark backing at victim's death position
  // ==========================================
  const curPlayhead = Math.floor(playhead);
  for (const kill of round.kills) {
    const [killFrame, killerPidx, victimPidx] = kill;

    // Draw active kill laser line (killer to victim)
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
          ctx.lineWidth = Math.max(1 * inv, 2.5 * decay * inv);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Draw death shockwave and persistent death marker ✕ (strictly when kill has occurred)
    if (killFrame <= curPlayhead && victimPidx >= 0 && round.tracks[victimPidx]) {
      const deathTrack = round.tracks[victimPidx]!;
      const deathFrame = Math.min(killFrame, deathTrack.n - 1);
      const victimState = sampleTrackAt(deathTrack, deathFrame, q, mapName);
      if (victimState) {
        ctx.save();
        if (victimState.layer !== activeLayer) {
          ctx.globalAlpha = 0.25;
        }

        const vx = toCanvasX(victimState.px);
        const vy = toCanvasY(victimState.py);

        // Expanding death ripple over first 8 frames
        if (playhead <= killFrame + 8) {
          const ripProg = (playhead - killFrame) / 8;
          const ripEase = 1 - Math.pow(1 - ripProg, 2);
          const ripR = (6 + ripEase * 18) * inv;
          const ripAlpha = (1 - ripProg) * 0.85;

          ctx.beginPath();
          ctx.arc(vx, vy, ripR, 0, Math.PI * 2);
          ctx.lineWidth = 1.75 * inv;
          ctx.strokeStyle = `rgba(239, 68, 68, ${ripAlpha})`;
          ctx.stroke();
        }

        // Dark circular backing for high-contrast visibility against all radar textures
        ctx.beginPath();
        ctx.arc(vx, vy, 6.5 * inv, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(11, 14, 20, 0.75)";
        ctx.fill();

        // Crisp ✕ marker (scale-invariant with zoom)
        const dSize = 4.5 * inv;
        ctx.strokeStyle = "rgba(239, 68, 68, 0.95)";
        ctx.lineWidth = 1.75 * inv;
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

  // ==========================================
  // Layer 9: Players
  // - Dot radius 7.5 px: #f59e0b (T orange), #3b82f6 (CT blue) with crisp border
  // - Scale-invariant HUD: elements remain crisp and legible at any zoom level
  // - 90° view-cone wedge oriented along yawRad
  // - HP bar 20x3 px centered above dot
  // - Player name + weapon label when pidx === selectedPidx or zoom >= 1.25
  // ==========================================
  for (let pidx = 0; pidx < sampledPlayers.length; pidx++) {
    const pState = sampledPlayers[pidx];
    if (!pState || !pState.alive) continue;

    const side = getPlayerSide(pidx);
    const isCT = side === "CT";
    const teamColor = isCT ? "#38bdf8" : "#fbbf24";
    const teamFill = isCT ? "rgba(56, 189, 248, 0.22)" : "rgba(251, 191, 36, 0.22)";

    const px = toCanvasX(pState.px);
    const py = toCanvasY(pState.py);

    ctx.save();
    if (pState.layer !== activeLayer) {
      ctx.globalAlpha = 0.25;
    }

    // 1. View cone wedge (90° total, length 28 px)
    const canvasYaw = -pState.yawRad;
    const coneLen = 28 * inv;
    const halfAngle = Math.PI / 4; // 45° each side

    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, coneLen, canvasYaw - halfAngle, canvasYaw + halfAngle);
    ctx.closePath();
    ctx.fillStyle = teamFill;
    ctx.fill();

    // 2. Player Dot (radius 7.5 px)
    ctx.beginPath();
    ctx.arc(px, py, 7.5 * inv, 0, Math.PI * 2);
    ctx.fillStyle = teamColor;
    ctx.fill();

    // Solid outline or selection outline
    if (pidx === selectedPidx) {
      ctx.lineWidth = 2.5 * inv;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Outer focus ring
      ctx.beginPath();
      ctx.arc(px, py, 11 * inv, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 * inv;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.stroke();
    } else {
      ctx.lineWidth = 1.5 * inv;
      ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
      ctx.stroke();
    }

    // 3. Blinded white ring overlay
    if (pState.blinded) {
      ctx.beginPath();
      ctx.arc(px, py, 10 * inv, 0, Math.PI * 2);
      ctx.lineWidth = 2.5 * inv;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }

    // 4. HP Bar (20x3 px centered 14 px above dot)
    const hpWidth = 20 * inv;
    const hpHeight = 3 * inv;
    const hpX = px - hpWidth / 2;
    const hpY = py - 14 * inv;

    // HP background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(hpX - 1 * inv, hpY - 1 * inv, hpWidth + 2 * inv, hpHeight + 2 * inv);

    // HP fill color
    const hpRatio = Math.max(0, Math.min(1, pState.hp / 100));
    ctx.fillStyle =
      pState.hp > 50 ? "#22c55e" : pState.hp > 20 ? "#eab308" : "#ef4444";
    ctx.fillRect(hpX, hpY, hpWidth * hpRatio, hpHeight);

    // 5. Name + Weapon Label (rendered exclusively for selected player to prevent zoom clutter)
    if (pidx === selectedPidx) {
      const playerDef = replay.players[pidx];
      const playerName = playerDef ? playerDef.name : `P${pidx}`;
      const weaponName = replay.weapons[pState.weaponIdx] || "";

      ctx.font = `bold ${Math.max(9, Math.round(11 * inv))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      // Text stroke for readability
      ctx.lineWidth = 3 * inv;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
      ctx.strokeText(playerName, px, hpY - 2 * inv);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(playerName, px, hpY - 2 * inv);

      if (weaponName) {
        ctx.font = `${Math.max(8, Math.round(9 * inv))}px monospace`;
        ctx.strokeText(weaponName, px, py + 18 * inv);
        ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
        ctx.fillText(weaponName, px, py + 18 * inv);
      }
    }

    ctx.restore();
  }

  ctx.restore();
}
