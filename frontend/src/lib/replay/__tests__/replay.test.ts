import { describe, it, expect, vi } from "vitest";
import { decodeRound, decodeTrack } from "../decode";
import { shortestYawArc, sampleTrackAt } from "../interpolate";
import { drawForeground, RenderState } from "../draw";
import { ReplayFile } from "../../types";

describe("Yaw Wrap & Shortest Arc Interpolation", () => {
  it("interpolates across the 119 -> 0 wrap correctly (+1 step)", () => {
    const arc = shortestYawArc(119, 0);
    expect(arc).toBe(1);
  });

  it("interpolates across the 0 -> 119 wrap correctly (-1 step)", () => {
    const arc = shortestYawArc(0, 119);
    expect(arc).toBe(-1);
  });

  it("calculates normal non-wrapping arcs accurately", () => {
    expect(shortestYawArc(30, 45)).toBe(15);
    expect(shortestYawArc(45, 30)).toBe(-15);
    expect(shortestYawArc(10, 70)).toBe(60);
    expect(shortestYawArc(10, 71)).toBe(-59); // > 60 steps chooses opposite direction
  });
});

describe("Replay Decoder Round-Trip & Expansion", () => {
  const mockReplay: ReplayFile = {
    v: 1,
    match_id: "test-match",
    map: "de_mirage",
    tick_rate: 64,
    frame_step: 8,
    q: { pos: 2, yaw: 3 },
    weapons: ["knife", "ak47", "usp_silencer"],
    players: [
      { sid: "76561198000000001", name: "Player1", team: "A" },
      { sid: "76561198000000002", name: "Player2", team: "B" },
    ],
    rounds: [
      {
        n: 1,
        t0: 1000,
        nf: 10,
        fe: 2,
        side_a: "CT",
        winner: "CT",
        reason: "bomb_defused",
        score: [0, 0],
        p: [
          {
            n: 4,
            x: [100, 5, -2, 10], // prefix sum: 100, 105, 103, 113
            y: [200, -3, 4, 1],  // prefix sum: 200, 197, 201, 202
            yaw: [118, 1, 1, -1], // prefix sum: 118, 119, 0, 119 (wrapped mod 120)
            hp: [[0, 100], [2, 50]],
            w: [[0, 1]],
            l: [[0, 0]],
            fl: [[1, 2]], // blinded frames 1, 2
          },
          null,
        ],
        nades: [],
        kills: [[3, 0, 1, -1, 1, 1]],
        shots: [
          [0, 5, 2], // prefix sum: 0, 5, 7
          [0, 0, 0],
        ],
      },
    ],
  };

  it("decodes track deltas into prefix-summed typed arrays", () => {
    const decoded = decodeRound(mockReplay, 0);
    expect(decoded.tracks[0]).not.toBeNull();

    const t0 = decoded.tracks[0]!;
    expect(Array.from(t0.x)).toEqual([100, 105, 103, 113]);
    expect(Array.from(t0.y)).toEqual([200, 197, 201, 202]);
    expect(Array.from(t0.yaw)).toEqual([118, 119, 0, 119]);
  });

  it("expands hp, active weapon, and blinded change lists across all nf frames", () => {
    const decoded = decodeRound(mockReplay, 0);
    const t0 = decoded.tracks[0]!;

    expect(t0.hp.length).toBe(10);
    expect(t0.hp[0]).toBe(100);
    expect(t0.hp[1]).toBe(100);
    expect(t0.hp[2]).toBe(50);
    expect(t0.hp[9]).toBe(50);

    expect(t0.w[0]).toBe(1);
    expect(t0.w[9]).toBe(1);

    expect(t0.blinded[0]).toBe(0);
    expect(t0.blinded[1]).toBe(1);
    expect(t0.blinded[2]).toBe(1);
    expect(t0.blinded[3]).toBe(0);
  });

  it("prefix-sums shots delta frames", () => {
    const decoded = decodeRound(mockReplay, 0);
    expect(Array.from(decoded.shots.frames)).toEqual([0, 5, 7]);
    expect(decoded.shots.pidx).toEqual([0, 0, 0]);
  });

  it("samples track position and smoothly interpolates across frames", () => {
    const decoded = decodeRound(mockReplay, 0);
    const t0 = decoded.tracks[0]!;

    // Sample at frame 0.5 (halfway between frame 0 and 1)
    // x[0]=100, x[1]=105 -> lerp = 102.5 -> world = 102.5 * 2 = 205
    // y[0]=200, y[1]=197 -> lerp = 198.5 -> world = 198.5 * 2 = 397
    // yaw[0]=118, yaw[1]=119 -> lerp = 118.5 steps -> 118.5 * 3 * PI / 180
    const sample = sampleTrackAt(t0, 0.5, mockReplay.q, mockReplay.map);
    expect(sample).not.toBeNull();
    expect(sample!.alive).toBe(true);
    expect(sample!.hp).toBe(100);
    expect(sample!.yawRad).toBeCloseTo((118.5 * 3 * Math.PI) / 180, 4);

    // Player dead after track.n frames (n=4)
    const deadSample = sampleTrackAt(t0, 4.5, mockReplay.q, mockReplay.map);
    expect(deadSample).toBeNull();
  });

  it("drawForeground executes correctly across binary-searched shot frames", () => {
    const decoded = decodeRound(mockReplay, 0);
    const mockCtx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      rect: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      setLineDash: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textAlign: "",
      textBaseline: "",
    } as unknown as CanvasRenderingContext2D;

    const baseState: RenderState = {
      replay: mockReplay,
      round: decoded,
      playhead: 5.2,
      canvasSize: 512,
      activeLayer: 0,
      selectedPidx: null,
      zoom: 1,
      panX: 0,
      panY: 0,
    };

    // Test before shot, during shot decay window, and after
    for (const playhead of [0, 4.9, 5.0, 5.5, 6.5, 7.2, 10]) {
      expect(() => {
        drawForeground(mockCtx, { ...baseState, playhead });
      }).not.toThrow();
    }
  });

  it("calculates continuous flashRatio degree of blindness", () => {
    const trackWithFlash = {
      n: 20,
      x: [0],
      y: [0],
      yaw: [0],
      hp: [[0, 100]],
      w: [[0, 1]],
      fl: [[5, 10]], // Flashed at frame 5 for 10 frames (frames 5..15)
    };
    const decoded = decodeTrack(trackWithFlash as any, 20);
    expect(decoded.fl).toEqual([[5, 10]]);

    // Before flash (frame 3)
    const sBefore = sampleTrackAt(decoded, 3, mockReplay.q, "de_dust2");
    expect(sBefore?.flashRatio).toBe(0);
    expect(sBefore?.blinded).toBe(false);

    // Exact moment of flash (frame 5) -> 100% blind
    const sStart = sampleTrackAt(decoded, 5, mockReplay.q, "de_dust2");
    expect(sStart?.flashRatio).toBe(1.0);
    expect(sStart?.blinded).toBe(true);

    // Halfway through flash (frame 10) -> 50% blind
    const sMid = sampleTrackAt(decoded, 10, mockReplay.q, "de_dust2");
    expect(sMid?.flashRatio).toBeCloseTo(0.5);
    expect(sMid?.blinded).toBe(true);

    // Almost recovered (frame 14) -> 10% blind
    const sEnd = sampleTrackAt(decoded, 14, mockReplay.q, "de_dust2");
    expect(sEnd?.flashRatio).toBeCloseTo(0.1);
    expect(sEnd?.blinded).toBe(true);

    // Fully recovered (frame 16) -> 0% blind
    const sClear = sampleTrackAt(decoded, 16, mockReplay.q, "de_dust2");
    expect(sClear?.flashRatio).toBe(0);
  });

  it("calculates continuous damageRatio and recent damage amount on bullet hits", () => {
    const trackWithDamage = {
      n: 20,
      x: [0],
      y: [0],
      yaw: [0],
      hp: [
        [0, 100],
        [5, 73],
      ], // Hit at frame 5, took 27 damage
      w: [[0, 1]],
    };
    const decoded = decodeTrack(trackWithDamage as any, 20);

    // Before hit (frame 4)
    const sBefore = sampleTrackAt(decoded, 4, mockReplay.q, "de_dust2");
    expect(sBefore?.damageRatio).toBe(0);
    expect(sBefore?.recentDamageAmount).toBe(0);

    // Moment of hit (frame 5) -> 100% damage flash
    const sHit = sampleTrackAt(decoded, 5, mockReplay.q, "de_dust2");
    expect(sHit?.damageRatio).toBe(1.0);
    expect(sHit?.recentDamageAmount).toBe(27);

    // Decaying flash (frame 6.25, halfway through 2.5 frame window) -> 50%
    const sDecay = sampleTrackAt(decoded, 6.25, mockReplay.q, "de_dust2");
    expect(sDecay?.damageRatio).toBeCloseTo(0.5);
    expect(sDecay?.recentDamageAmount).toBe(27);

    // Decayed back to normal (frame 8) -> 0%
    const sNormal = sampleTrackAt(decoded, 8, mockReplay.q, "de_dust2");
    expect(sNormal?.damageRatio).toBe(0);
  });
});
