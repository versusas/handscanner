import type { LM, HandSide } from "./retarget";

export interface LiveHand {
  /** 21 landmark, normalized image coords (raw MediaPipe output) */
  landmarks: LM[];
  handedness: HandSide;
  /** performance.now() of the detection */
  timestamp: number;
}

/**
 * Mutable per-frame bucket shared between the detection loop (writer)
 * and the Three.js render loop (reader). Bypasses React intentionally.
 */
export const liveFrame: {
  hands: Partial<Record<HandSide, LiveHand>>;
} = {
  hands: {},
};

/** ms after which a hand sample is considered stale */
export const HAND_STALE_MS = 450;

export function isHandFresh(side: HandSide, now: number): boolean {
  const h = liveFrame.hands[side];
  return !!h && now - h.timestamp < HAND_STALE_MS;
}
