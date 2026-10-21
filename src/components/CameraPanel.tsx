import { useEffect, useRef } from "react";
import { FlipHorizontal2, Power, SwitchCamera } from "lucide-react";
import { useApp } from "../store";
import { liveFrame, HAND_STALE_MS } from "../lib/liveFrame";
import type { HandSide } from "../lib/retarget";

const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const SIDE_COLOR: Record<HandSide, string> = { Right: "#22d3ee", Left: "#c084fc" };
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

export function CameraPanel() {
  const mirror = useApp((s) => s.mirror);
  const devices = useApp((s) => s.devices);
  const deviceId = useApp((s) => s.deviceId);
  const fps = useApp((s) => s.fps);
  const toggleMirror = useApp((s) => s.toggleMirror);
  const setDeviceId = useApp((s) => s.setDeviceId);
  const setPhase = useApp((s) => s.setPhase);
  const setVideoEl = useApp((s) => s.setVideoEl);
  const hands = useApp((s) => s.hands);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;

  // publish the video element for the tracking hook
  useEffect(() => {
    setVideoEl(videoRef.current);
    return () => setVideoEl(null);
  }, [setVideoEl]);

  // skeleton overlay loop
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const now = performance.now();
      const mirrorX = mirrorRef.current;
      const px = (x: number) => (mirrorX ? 1 - x : x) * w;
      const py = (y: number) => y * h;

      (Object.keys(liveFrame.hands) as HandSide[]).forEach((side) => {
        const hand = liveFrame.hands[side];
        if (!hand || now - hand.timestamp > HAND_STALE_MS) return;
        const lm = hand.landmarks;
        const color = SIDE_COLOR[side];

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.92;
        ctx.lineWidth = Math.max(2, w / 320);
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        for (const [a, b] of CONNECTIONS) {
          ctx.moveTo(px(lm[a].x), py(lm[a].y));
          ctx.lineTo(px(lm[b].x), py(lm[b].y));
        }
        ctx.stroke();

        ctx.shadowBlur = 6;
        for (let i = 0; i < 21; i++) {
          const tip = FINGERTIPS.has(i);
          ctx.beginPath();
          ctx.fillStyle = tip ? "#ffffff" : color;
          ctx.arc(px(lm[i].x), py(lm[i].y), tip ? w / 140 : w / 220, 0, Math.PI * 2);
          ctx.fill();
        }

        // wrist tag
        const gesture = useApp.getState().hands[side].gesture;
        ctx.shadowBlur = 0;
        ctx.font = `600 ${Math.max(12, w / 52)}px "JetBrains Mono", monospace`;
        const label = `${side === "Right" ? "ПРАВАЯ" : "ЛЕВАЯ"} · ${gesture.label.toUpperCase()}`;
        const tx = Math.min(Math.max(px(lm[0].x) + 14, 8), w - ctx.measureText(label).width - 8);
        const ty = Math.min(Math.max(py(lm[0].y) - 14, 22), h - 10);
        ctx.fillStyle = "rgba(5,8,10,0.72)";
        const tw = ctx.measureText(label).width;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(tx - 8, ty - 16, tw + 16, 24, 6);
        } else {
          ctx.rect(tx - 8, ty - 16, tw + 16, 24);
        }
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillText(label, tx, ty + 2);
        ctx.restore();
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const anyHand = hands.Left.present || hands.Right.present;

  return (
    <div className="glass pointer-events-auto fixed bottom-4 left-4 z-30 w-[300px] overflow-hidden rounded-2xl md:bottom-6 md:left-6 md:w-[340px]">
      {/* header */}
      <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full rounded-full ${anyHand ? "bg-cyan-400 ping-slow" : ""}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${anyHand ? "bg-cyan-400" : "bg-amber-400"}`} />
          </span>
          <span className="font-mono text-[10px] tracking-[0.22em] text-cyan-100/80">КАМЕРА · ЖИВОЙ ЗАХВАТ</span>
        </div>
        <span className="font-mono text-[10px] tracking-widest text-cyan-300/70">{fps > 0 ? `${fps} FPS` : "--"}</span>
      </div>

      {/* video + overlay */}
      <div className="relative aspect-video w-full bg-black/70">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: mirror ? "scaleX(-1)" : "none" }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
        {!anyHand && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="glass rounded-full px-3.5 py-1.5 font-mono text-[10px] tracking-[0.18em] text-cyan-100/70">
              ПОКАЖИТЕ РУКУ В КАДР
            </span>
          </div>
        )}
        {/* corner brackets */}
        <div className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 border-l-2 border-t-2 border-cyan-300/50" />
        <div className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 border-r-2 border-t-2 border-cyan-300/50" />
        <div className="pointer-events-none absolute bottom-2 left-2 h-3.5 w-3.5 border-b-2 border-l-2 border-cyan-300/50" />
        <div className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 border-b-2 border-r-2 border-cyan-300/50" />
      </div>

      {/* controls */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="relative min-w-0 flex-1">
          <select
            value={deviceId ?? ""}
            onChange={(e) => {
              setDeviceId(e.target.value || undefined);
              setPhase("starting");
            }}
            className="dark-select w-full cursor-pointer appearance-none truncate rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 pr-7 font-mono text-[10px] tracking-wide text-cyan-50/85 outline-none transition-colors hover:border-cyan-300/30 focus:border-cyan-300/50"
            title="Источник видео"
          >
            <option value="">Камера по умолчанию</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Камера ${i + 1}`}
              </option>
            ))}
          </select>
          <SwitchCamera className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-300/60" />
        </div>
        <button
          onClick={toggleMirror}
          className={`rounded-lg border p-1.5 transition-colors ${
            mirror
              ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-300"
              : "border-white/10 bg-white/5 text-cyan-50/60 hover:border-cyan-300/25"
          }`}
          title="Зеркальное отображение"
        >
          <FlipHorizontal2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setPhase("intro")}
          className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-cyan-50/60 transition-colors hover:border-red-400/40 hover:text-red-300"
          title="Остановить захват"
        >
          <Power className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
