import { AnimatePresence, motion } from "framer-motion";
import { Activity, Grab, Hand, Pin, Pointer, Scan, Scissors, ThumbsUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "../store";
import type { GestureId } from "../lib/gestures";
import type { HandSide } from "../lib/retarget";
import { useEffect, useState } from "react";

const GESTURE_ICON: Record<GestureId, LucideIcon> = {
  open: Hand,
  fist: Grab,
  peace: Scissors,
  point: Pointer,
  thumbsup: ThumbsUp,
  pinch: Pin,
  unknown: Activity,
};

const SIDE_LABEL: Record<HandSide, string> = { Right: "ПРАВАЯ", Left: "ЛЕВАЯ" };
const SIDE_ACCENT: Record<HandSide, string> = { Right: "text-cyan-300 border-cyan-300/30", Left: "text-purple-300 border-purple-300/30" };

export function Hud() {
  const hands = useApp((s) => s.hands);
  const fps = useApp((s) => s.fps);
  const phase = useApp((s) => s.phase);

  const anyHand = hands.Left.present || hands.Right.present;
  const primary: HandSide | null = hands.Right.present ? "Right" : hands.Left.present ? "Left" : null;
  const primaryGesture = primary ? hands[primary].gesture : null;
  const PrimaryIcon = primaryGesture ? GESTURE_ICON[primaryGesture.id] : Activity;

  const [showHint, setShowHint] = useState(true);
  useEffect(() => {
    if (anyHand) {
      const t = setTimeout(() => setShowHint(false), 4000);
      return () => clearTimeout(t);
    }
    setShowHint(true);
  }, [anyHand]);

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {/* top bar */}
      <header className="absolute inset-x-0 top-0 flex items-start justify-between p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="glass glass-bright flex h-10 w-10 items-center justify-center rounded-xl">
            <Scan className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <div className="font-mono text-sm font-bold tracking-[0.28em] text-white">
              MANUS<span className="text-cyan-300">·</span>TRACK
            </div>
            <div className="font-mono text-[9px] tracking-[0.2em] text-cyan-100/40">
              ЗАХВАТ ДВИЖЕНИЯ КИСТИ · 21 ТОЧКА · ЛОКАЛЬНО
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(Object.keys(hands) as HandSide[]).map(
            (side) =>
              hands[side].present && (
                <motion.div
                  key={side}
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`glass flex items-center gap-2 rounded-xl border px-3 py-2 ${SIDE_ACCENT[side]}`}
                >
                  {(() => {
                    const Icon = GESTURE_ICON[hands[side].gesture.id];
                    return <Icon className="h-3.5 w-3.5" />;
                  })()}
                  <span className="font-mono text-[10px] tracking-[0.18em]">
                    {SIDE_LABEL[side]} · {hands[side].gesture.label.toUpperCase()}
                  </span>
                </motion.div>
              )
          )}
          <div className="glass flex items-center gap-2 rounded-xl px-3 py-2">
            <span className="relative flex h-1.5 w-1.5">
              {anyHand && <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-cyan-400" />}
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${anyHand ? "bg-cyan-400" : "bg-amber-400"}`} />
            </span>
            <span className="font-mono text-[10px] tracking-[0.18em] text-cyan-50/75">
              {phase !== "running" ? "ОЖИДАНИЕ" : anyHand ? "ТРЕКИНГ АКТИВЕН" : "ПОИСК РУКИ"}
            </span>
            {fps > 0 && <span className="font-mono text-[10px] tracking-widest text-cyan-300/60">· {fps} FPS</span>}
          </div>
        </div>
      </header>

      {/* big gesture stage */}
      <AnimatePresence mode="wait">
        {primaryGesture && primaryGesture.id !== "unknown" && (
          <motion.div
            key={primaryGesture.id}
            initial={{ opacity: 0, y: 26, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -18, filter: "blur(8px)" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 md:bottom-10"
          >
            <div className="glass glass-bright flex h-12 w-12 items-center justify-center rounded-2xl">
              <PrimaryIcon className="h-6 w-6 text-cyan-300" />
            </div>
            <div className="hero-gradient whitespace-nowrap text-4xl font-bold tracking-tight md:text-5xl">
              {primaryGesture.label}
            </div>
            <div className="font-mono text-[9px] tracking-[0.3em] text-cyan-100/35">
              РАСПОЗНАН ЖЕСТ · {primary ? SIDE_LABEL[primary] : ""} РУКА
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* hints */}
      <AnimatePresence>
        {phase === "running" && showHint && (
          <motion.aside
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className="glass absolute bottom-4 right-4 w-[240px] rounded-2xl p-4 md:bottom-6 md:right-6"
          >
            <div className="mb-2 font-mono text-[9px] tracking-[0.28em] text-cyan-300/70">КАК ПОЛУЧИТЬ ТОЧНЫЙ ТРЕКИНГ</div>
            <ul className="space-y-1.5 text-[11px] leading-snug text-cyan-50/70">
              <li>— кисть целиком в кадре, 30–60 см от камеры</li>
              <li>— добавьте света, избегайте контрового</li>
              <li>— вращайте ладонь — модель повторит</li>
            </ul>
            <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-2.5">
              <span className="kbd">ESC</span>
              <span className="font-mono text-[9px] tracking-[0.14em] text-cyan-50/40">— остановить захват</span>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
