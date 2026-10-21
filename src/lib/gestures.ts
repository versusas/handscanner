import type { LM } from "./retarget";

export type GestureId = "open" | "fist" | "point" | "peace" | "pinch" | "thumbsup" | "unknown";

export interface Gesture {
  id: GestureId;
  label: string;
}

const NONE: Gesture = { id: "unknown", label: "—" };

function dist(a: LM, b: LM): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z - b.z) * 1.4; // z is noisier — weight less
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** finger "extended" = tip notably farther from wrist than the PIP joint */
function extended(lm: LM[], base: number): boolean {
  return dist(lm[base + 3], lm[0]) > dist(lm[base + 1], lm[0]) * 1.12;
}

function thumbOut(lm: LM[]): boolean {
  return dist(lm[4], lm[17]) > dist(lm[2], lm[17]) * 1.08;
}

export function classifyGesture(lm: LM[]): Gesture {
  if (!lm || lm.length < 21) return NONE;

  const palm = dist(lm[0], lm[9]) || 1e-6;

  // pinch has priority — thumb & index tips touching, index fairly extended
  if (dist(lm[4], lm[8]) < palm * 0.32 && dist(lm[8], lm[0]) > dist(lm[6], lm[0]) * 0.92) {
    return { id: "pinch", label: "Щипок" };
  }

  const idx = extended(lm, 5);
  const mid = extended(lm, 9);
  const ring = extended(lm, 13);
  const pinky = extended(lm, 17);
  const thumb = thumbOut(lm);
  const count = [idx, mid, ring, pinky].filter(Boolean).length;

  if (thumb && count === 0 && lm[4].y < lm[2].y - palm * 0.12) {
    return { id: "thumbsup", label: "Класс" };
  }
  if (count === 0) return { id: "fist", label: "Кулак" };
  if (count === 4 && thumb) return { id: "open", label: "Ладонь" };
  if (idx && mid && !ring && !pinky) return { id: "peace", label: "Победа" };
  if (idx && !mid && !ring && !pinky) return { id: "point", label: "Указание" };
  if (count === 4) return { id: "open", label: "Ладонь" };
  return NONE;
}
