import { create } from "zustand";
import type { Gesture } from "./lib/gestures";
import type { HandSide } from "./lib/retarget";

export type Phase = "intro" | "starting" | "running" | "error";

export interface HandUi {
  present: boolean;
  gesture: Gesture;
}

interface AppState {
  phase: Phase;
  loadingStep: string;
  error: string | null;
  mirror: boolean;
  devices: MediaDeviceInfo[];
  deviceId: string | undefined;
  fps: number;
  hands: Record<HandSide, HandUi>;
  videoEl: HTMLVideoElement | null;
  retryNonce: number;

  setPhase: (p: Phase) => void;
  setLoading: (step: string) => void;
  setError: (e: string | null) => void;
  toggleMirror: () => void;
  setDevices: (d: MediaDeviceInfo[]) => void;
  setDeviceId: (id: string | undefined) => void;
  setFps: (fps: number) => void;
  setHands: (h: Record<HandSide, HandUi>) => void;
  setVideoEl: (el: HTMLVideoElement | null) => void;
  retry: () => void;
}

const NO_GESTURE: Gesture = { id: "unknown", label: "—" };

export const useApp = create<AppState>((set) => ({
  phase: "intro",
  loadingStep: "",
  error: null,
  mirror: true,
  devices: [],
  deviceId: undefined,
  fps: 0,
  hands: {
    Left: { present: false, gesture: NO_GESTURE },
    Right: { present: false, gesture: NO_GESTURE },
  },
  videoEl: null,
  retryNonce: 0,

  setPhase: (phase) => set({ phase }),
  setLoading: (loadingStep) => set({ loadingStep }),
  setError: (error) => set({ error, phase: error ? "error" : "intro" }),
  toggleMirror: () => set((s) => ({ mirror: !s.mirror })),
  setDevices: (devices) => set({ devices }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setFps: (fps) => set({ fps }),
  setHands: (hands) => set({ hands }),
  setVideoEl: (videoEl) => set({ videoEl }),
  retry: () => set((s) => ({ retryNonce: s.retryNonce + 1, error: null, phase: "starting" })),
}));
