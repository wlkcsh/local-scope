import { create } from "zustand";
import { ReplayFile } from "./types";

export interface ReplayStore {
  replay: ReplayFile | null;
  roundIdx: number;
  playing: boolean;
  speed: 0.5 | 1 | 2 | 4;
  layer: 0 | 1;
  autoLayer: boolean;
  selectedPidx: number | null;
  stopAtTick: number | null;
  stopAtFrame: number | null;
  uiFrame: number;

  // Actions
  setReplay: (replay: ReplayFile | null) => void;
  setRoundIdx: (idx: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setSpeed: (speed: 0.5 | 1 | 2 | 4) => void;
  setLayer: (layer: 0 | 1) => void;
  setAutoLayer: (auto: boolean) => void;
  setSelectedPidx: (pidx: number | null) => void;
  setStopAtTick: (tick: number | null) => void;
  setStopAtFrame: (frame: number | null) => void;
  setUiFrame: (frame: number) => void;
  reset: () => void;
}

export const useReplayStore = create<ReplayStore>((set) => ({
  replay: null,
  roundIdx: 0,
  playing: false,
  speed: 1,
  layer: 0,
  autoLayer: true,
  selectedPidx: null,
  stopAtTick: null,
  stopAtFrame: null,
  uiFrame: 0,

  setReplay: (replay) => set((s) => ({ replay, roundIdx: s.roundIdx })),
  setRoundIdx: (roundIdx) => set({ roundIdx }),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((state) => ({ playing: !state.playing })),
  setSpeed: (speed) => set({ speed }),
  setLayer: (layer) => set({ layer, autoLayer: false }),
  setAutoLayer: (autoLayer) => set({ autoLayer }),
  setSelectedPidx: (selectedPidx) => set({ selectedPidx }),
  setStopAtTick: (stopAtTick) => set({ stopAtTick }),
  setStopAtFrame: (stopAtFrame) => set({ stopAtFrame }),
  setUiFrame: (uiFrame) =>
    set((s) => (s.uiFrame === uiFrame ? s : { ...s, uiFrame })),
  reset: () =>
    set({
      replay: null,
      roundIdx: 0,
      playing: false,
      speed: 1,
      layer: 0,
      autoLayer: true,
      selectedPidx: null,
      stopAtTick: null,
      stopAtFrame: null,
      uiFrame: 0,
    }),
}));
