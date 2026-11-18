import { useReplayStore } from "../store";

export interface ClockRef {
  current: number; // float frame index
}

export class ReplayClock {
  public playheadRef: ClockRef = { current: 0 };
  private rafId: number | null = null;
  private lastTime: number = 0;
  private lastUiUpdateTime: number = 0;
  public isRunning: boolean = false;
  private onRenderCallback: ((playhead: number) => void) | null = null;
  private listeners: Set<(playhead: number) => void> = new Set();
  private maxFrames: number = 1000;
  private stopAtFrame: number | null = null;
  private unsubscribeStore: (() => void) | null = null;

  constructor(onRender?: (playhead: number) => void) {
    if (onRender) this.onRenderCallback = onRender;
    this.bindStore();
  }

  public subscribe(cb: (playhead: number) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public bindStore(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    // Automatically manage loop when store playing state changes
    this.unsubscribeStore = useReplayStore.subscribe((state) => {
      if (state.playing && !this.isRunning) {
        this.start();
      } else if (!state.playing && this.isRunning) {
        this.stop();
      }
    });
  }

  public setOnRender(cb: (playhead: number) => void): void {
    this.onRenderCallback = cb;
  }

  public setMaxFrames(nf: number): void {
    this.maxFrames = Math.max(1, nf);
  }

  public setStopAtFrame(frame: number | null): void {
    this.stopAtFrame = frame;
  }

  private notifyRender(playhead: number): void {
    if (this.onRenderCallback) {
      this.onRenderCallback(playhead);
    }
    for (const listener of this.listeners) {
      listener(playhead);
    }
  }

  public seek(frame: number): void {
    this.playheadRef.current = Math.max(0, Math.min(frame, this.maxFrames - 1));
    useReplayStore.getState().setUiFrame(Math.floor(this.playheadRef.current));
    this.notifyRender(this.playheadRef.current);
  }

  public start(): void {
    if (!this.unsubscribeStore) {
      this.bindStore();
    }
    // If at end of round, restart from frame 0
    if (this.playheadRef.current >= this.maxFrames - 1) {
      this.seek(0);
    }
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.lastUiUpdateTime = this.lastTime;
    if (!useReplayStore.getState().playing) {
      useReplayStore.getState().setPlaying(true);
    }
    this.loop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (useReplayStore.getState().playing) {
      useReplayStore.getState().setPlaying(false);
    }
  }

  public toggle(): void {
    if (this.isRunning || useReplayStore.getState().playing) {
      this.stop();
    } else {
      this.start();
    }
  }

  private loop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const dtSeconds = Math.min((now - this.lastTime) / 1000, 0.1); // Clamp dt to prevent massive jumps
    this.lastTime = now;

    const state = useReplayStore.getState();

    if (state.playing) {
      // 8 Hz base frame rate: tick_rate (64) / frame_step (8) = 8 frames/second
      const frameRate = 8;
      this.playheadRef.current += dtSeconds * frameRate * state.speed;

      // Handle stopAtFrame (for highlights)
      const stopTarget = this.stopAtFrame ?? state.stopAtFrame;
      if (stopTarget !== null && this.playheadRef.current >= stopTarget) {
        this.playheadRef.current = stopTarget;
        this.stop();
        return;
      }

      // Clamp at end of round
      if (this.playheadRef.current >= this.maxFrames - 1) {
        this.playheadRef.current = this.maxFrames - 1;
        this.stop();
        return;
      }

      // Guarded UI store update: only when integer frame actually changes, throttled
      const currentIntFrame = Math.floor(this.playheadRef.current);
      if (currentIntFrame !== state.uiFrame && now - this.lastUiUpdateTime >= 100) {
        state.setUiFrame(currentIntFrame);
        this.lastUiUpdateTime = now;
      }

      // High-frequency canvas & scrubber render callback (60+ FPS outside React)
      this.notifyRender(this.playheadRef.current);

      this.rafId = requestAnimationFrame(this.loop);
    } else {
      // Paused: render final frame and suspend rAF loop to eliminate idle CPU drain
      this.notifyRender(this.playheadRef.current);
      this.isRunning = false;
      this.rafId = null;
    }
  };

  public dispose(): void {
    this.stop();
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }
}
