"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useReplayStore } from "@/lib/store";
import { ReplayFile } from "@/lib/types";
import { DecodedRound } from "@/lib/replay/decode";
import { ReplayClock } from "@/lib/replay/clock";
import { drawForeground, RenderState } from "@/lib/replay/draw";
import { getRadarImageUrl } from "@/lib/replay/project";
import { sampleTrackAt } from "@/lib/replay/interpolate";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface RadarCanvasProps {
  replay: ReplayFile;
  decodedRound: DecodedRound;
  clock: ReplayClock;
}

export function RadarCanvas({ replay, decodedRound, clock }: RadarCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);

  const [cssSize, setCssSize] = useState<number>(600);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeLayer = useReplayStore((s) => s.layer);
  const selectedPidx = useReplayStore((s) => s.selectedPidx);
  const autoLayer = useReplayStore((s) => s.autoLayer);
  const setLayer = useReplayStore((s) => s.setLayer);
  const setSelectedPidx = useReplayStore((s) => s.setSelectedPidx);

  // Background radar image cache
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  // Drag interaction state
  const isDraggingRef = useRef(false);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Keep references to zoom and pan for high-frequency rAF loop callbacks
  const zoomRef = useRef<number>(1);
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;

  // 1. Dynamic ResizeObserver: keep canvas as maximum possible square inside parent container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const squareSize = Math.max(280, Math.floor(Math.min(width, height) - 8));
          setCssSize(squareSize);
        }
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // 2. Synchronous Background Canvas Drawing
  const drawBackground = useCallback(() => {
    const bgCanvas = bgCanvasRef.current;
    if (!bgCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    if (bgCanvas.width !== cssSize * dpr || bgCanvas.height !== cssSize * dpr) {
      bgCanvas.width = cssSize * dpr;
      bgCanvas.height = cssSize * dpr;
    }

    const ctx = bgCanvas.getContext("2d");
    if (!ctx) return;

    // 1. Wipe physical buffer in raw device pixel space
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    ctx.restore();

    ctx.save();
    ctx.scale(dpr, dpr);

    // Apply camera transform centered on canvas
    ctx.translate(cssSize / 2 + pan.x, cssSize / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-cssSize / 2, -cssSize / 2);

    try {
      const img = bgImageRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, cssSize, cssSize);
      }
    } finally {
      ctx.restore();
    }
  }, [cssSize, pan.x, pan.y, zoom]);

  // Load / cache background radar image
  useEffect(() => {
    const radarUrl = getRadarImageUrl(replay.map, activeLayer);
    const img = new Image();
    img.src = radarUrl;
    img.onload = () => {
      bgImageRef.current = img;
      drawBackground();
    };
    if (img.complete && img.naturalWidth > 0) {
      bgImageRef.current = img;
      drawBackground();
    }
  }, [replay.map, activeLayer, drawBackground]);

  // Redraw background immediately when geometry, zoom, or pan updates
  useEffect(() => {
    drawBackground();
  }, [drawBackground]);

  // 3. Synchronous Foreground Canvas Drawing (60fps rAF + immediate draw on zoom/pan/state change)
  const drawForegroundFrame = useCallback(
    (playhead?: number) => {
      const fgCanvas = fgCanvasRef.current;
      if (!fgCanvas) return;

      const dpr = window.devicePixelRatio || 1;
      if (fgCanvas.width !== cssSize * dpr || fgCanvas.height !== cssSize * dpr) {
        fgCanvas.width = cssSize * dpr;
        fgCanvas.height = cssSize * dpr;
      }

      const ctx = fgCanvas.getContext("2d");
      if (!ctx) return;

      // 1. Wipe physical buffer in raw device pixel space
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
      ctx.restore();

      ctx.save();
      ctx.scale(dpr, dpr);

      const currentPlayhead = playhead != null ? playhead : clock.playheadRef.current;

      // Auto-layer switching if focused player changes level
      if (autoLayer && selectedPidx !== null && decodedRound.tracks[selectedPidx]) {
        const pSample = sampleTrackAt(
          decodedRound.tracks[selectedPidx]!,
          currentPlayhead,
          replay.q,
          replay.map
        );
        if (pSample && pSample.layer !== activeLayer) {
          setLayer(pSample.layer as 0 | 1);
        }
      }

      const renderState: RenderState = {
        replay,
        round: decodedRound,
        playhead: currentPlayhead,
        canvasSize: cssSize,
        activeLayer,
        selectedPidx,
        zoom,
        panX: pan.x,
        panY: pan.y,
      };

      try {
        drawForeground(ctx, renderState);
      } finally {
        ctx.restore();
      }
    },
    [
      cssSize,
      pan.x,
      pan.y,
      zoom,
      replay,
      decodedRound,
      activeLayer,
      selectedPidx,
      autoLayer,
      clock,
      setLayer,
    ]
  );

  // Register rAF render callback with ReplayClock & render immediately
  useEffect(() => {
    clock.setOnRender((playhead: number) => {
      drawForegroundFrame(playhead);
    });

    // Ensure immediate frame draw (e.g. when paused and zoom/pan/round changes)
    drawForegroundFrame();

    return () => {
      clock.setOnRender(() => {});
    };
  }, [clock, drawForegroundFrame]);

  // 4. Pointer interactions: Click to select player, Drag to pan when zoomed
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    isDraggingRef.current = true;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    dragStartRef.current = { x: clientX - pan.x, y: clientY - pan.y };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    if (zoomRef.current <= 1) return; // Only pan when zoomed

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const newX = clientX - dragStartRef.current.x;
    const newY = clientY - dragStartRef.current.y;

    // Clamp pan bounds based on zoom
    const maxPan = (cssSize * (zoomRef.current - 1)) / 2;
    const clampedX = Math.max(-maxPan, Math.min(maxPan, newX));
    const clampedY = Math.max(-maxPan, Math.min(maxPan, newY));

    setPan({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;

    // Check if the user dragged significantly (ignore clicks during pan)
    const dragDistance = Math.hypot(
      e.clientX - pointerDownPosRef.current.x,
      e.clientY - pointerDownPosRef.current.y
    );
    if (dragDistance > 5) return;

    // Hit-testing against players on click
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const playhead = clock.playheadRef.current;
    const scaleFactor = cssSize / 1024;

    let clickedPidx: number | null = null;
    let minDistance = 16; // 16 px hit tolerance

    for (let pidx = 0; pidx < decodedRound.tracks.length; pidx++) {
      const track = decodedRound.tracks[pidx];
      if (!track) continue;

      const sample = sampleTrackAt(track, playhead, replay.q, replay.map);
      if (!sample || !sample.alive) continue;

      // Transform radar pos to canvas pos
      const pxCanvas = sample.px * scaleFactor;
      const pyCanvas = sample.py * scaleFactor;

      // Apply zoom & pan transform to hit point
      const screenX =
        (pxCanvas - cssSize / 2) * zoomRef.current + cssSize / 2 + panRef.current.x;
      const screenY =
        (pyCanvas - cssSize / 2) * zoomRef.current + cssSize / 2 + panRef.current.y;

      const dist = Math.hypot(screenX - clickX, screenY - clickY);
      if (dist < minDistance) {
        minDistance = dist;
        clickedPidx = pidx;
      }
    }

    if (clickedPidx !== null) {
      setSelectedPidx(clickedPidx === selectedPidx ? null : clickedPidx);
    }
  };

  // 5. Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.25 : -0.25;
    const newZoom = Math.round(Math.max(1, Math.min(4, zoomRef.current + zoomDelta)) * 10) / 10;
    if (newZoom === 1) {
      setPan({ x: 0, y: 0 });
    } else {
      // Re-clamp pan for new zoom level
      const maxPan = (cssSize * (newZoom - 1)) / 2;
      setPan((p) => ({
        x: Math.max(-maxPan, Math.min(maxPan, p.x)),
        y: Math.max(-maxPan, Math.min(maxPan, p.y)),
      }));
    }
    setZoom(newZoom);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoom((z) => {
      const nz = Math.min(4, Math.round((z + 0.5) * 10) / 10);
      const maxPan = (cssSize * (nz - 1)) / 2;
      setPan((p) => ({
        x: Math.max(-maxPan, Math.min(maxPan, p.x)),
        y: Math.max(-maxPan, Math.min(maxPan, p.y)),
      }));
      return nz;
    });
  };

  const handleZoomOut = () => {
    setZoom((z) => {
      const nz = Math.max(1, Math.round((z - 0.5) * 10) / 10);
      if (nz === 1) {
        setPan({ x: 0, y: 0 });
      } else {
        const maxPan = (cssSize * (nz - 1)) / 2;
        setPan((p) => ({
          x: Math.max(-maxPan, Math.min(maxPan, p.x)),
          y: Math.max(-maxPan, Math.min(maxPan, p.y)),
        }));
      }
      return nz;
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center select-none overflow-hidden"
    >
      {/* Centered Square Canvas Stage */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        style={{ width: `${cssSize}px`, height: `${cssSize}px` }}
        className={`relative rounded-xl overflow-hidden border border-obsidian-border bg-[#0b0e14] shadow-2xl ${
          zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
        }`}
      >
        {/* Layer 1: Background Canvas (Static Radar Map) */}
        <canvas
          ref={bgCanvasRef}
          style={{ width: `${cssSize}px`, height: `${cssSize}px` }}
          className="absolute inset-0 pointer-events-none"
        />

        {/* Layers 2..9: Foreground Canvas (Dynamic 60fps elements) */}
        <canvas
          ref={fgCanvasRef}
          style={{ width: `${cssSize}px`, height: `${cssSize}px` }}
          className="absolute inset-0 pointer-events-none"
        />

        {/* Floating Canvas Controls (Zoom & Reset) */}
        <div className="radar-overlay-dark absolute bottom-3 right-3 flex items-center gap-0.5 p-1 rounded-lg bg-[#12161e]/90 border border-white/15 backdrop-blur-md shadow-xl z-20">
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 rounded text-slate-200 hover:text-white hover:bg-white/10 active:bg-white/20 transition-all flex items-center justify-center"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1.5 rounded text-slate-200 hover:text-white hover:bg-white/10 active:bg-white/20 transition-all flex items-center justify-center"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {zoom > 1 && (
            <button
              onClick={resetView}
              title="Reset Zoom"
              className="p-1.5 rounded text-slate-200 hover:text-white hover:bg-white/10 active:bg-white/20 transition-all font-mono text-[11px] flex items-center gap-1 px-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{zoom.toFixed(1)}x</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
