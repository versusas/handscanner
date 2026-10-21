import { motion } from "framer-motion";
import { Box, Cable, Camera, Hand, Loader2, Play, Scan, ShieldCheck, Smartphone, TriangleAlert, Webcam } from "lucide-react";
import { useApp } from "../store";

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 28, filter: "blur(10px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { delay: 0.08 * i, duration: 0.7, ease },
  }),
};

function PipelineStep({ icon: Icon, label, i }: { icon: typeof Camera; label: string; i: number }) {
  return (
    <motion.div variants={fadeUp} custom={i} className="flex items-center gap-2">
      <div className="glass flex h-9 w-9 items-center justify-center rounded-lg">
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <span className="font-mono text-[9px] tracking-[0.22em] text-cyan-100/50">{label}</span>
    </motion.div>
  );
}

function Connector() {
  return (
    <svg width="46" height="2" className="shrink-0 text-cyan-300/40">
      <line x1="0" y1="1" x2="46" y2="1" stroke="currentColor" strokeWidth="1.5" className="pipe-dash" />
    </svg>
  );
}

export function Intro() {
  const setPhase = useApp((s) => s.setPhase);

  return (
    <motion.div
      className="fixed inset-0 z-40 overflow-y-auto bg-[#050608]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: "blur(6px)" }}
      transition={{ duration: 0.55, ease }}
    >
      {/* glow + grid backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-30%] h-[70vh] w-[90vw] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.35) 1px, transparent 1px)",
            backgroundSize: "52px 52px",
            maskImage: "radial-gradient(70% 60% at 50% 42%, black, transparent)",
            WebkitMaskImage: "radial-gradient(70% 60% at 50% 42%, black, transparent)",
          }}
        />
      </div>

      <motion.div
        initial="hidden"
        animate="show"
        className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center px-6 py-14 text-center"
      >
        <motion.div variants={fadeUp} custom={0} className="glass mb-7 flex items-center gap-2.5 rounded-full px-4 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="ping-slow absolute h-full w-full rounded-full bg-cyan-400" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-cyan-400" />
          </span>
          <span className="font-mono text-[9px] tracking-[0.3em] text-cyan-100/70">
            MOTION CAPTURE · БЕЗ КОСТЮМА · БЕЗ СЕРВЕРА
          </span>
        </motion.div>

        <motion.h1 variants={fadeUp} custom={1} className="text-[13vw] font-bold leading-[0.95] tracking-tight md:text-8xl">
          <span className="hero-outline">ВАША РУКА —</span>
          <br />
          <span className="hero-gradient">КОНТРОЛЛЕР</span>
        </motion.h1>

        <motion.p variants={fadeUp} custom={2} className="mt-6 max-w-xl text-balance text-sm leading-relaxed text-cyan-50/60 md:text-base">
          Покажите жест камере — реалистичная 3D-модель повторит каждое движение кисти в реальном времени.
          Нейросеть находит 21 точку руки, а ретаргетинг переносит их на скелет модели.
        </motion.p>

        {/* pipeline */}
        <motion.div variants={fadeUp} custom={3} className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
          <PipelineStep icon={Camera} label="КАМЕРА" i={3} />
          <Connector />
          <PipelineStep icon={Scan} label="НЕЙРОСЕТЬ · 21 ТОЧКА" i={3} />
          <Connector />
          <PipelineStep icon={Hand} label="РЕТАРГЕТИНГ" i={3} />
          <Connector />
          <PipelineStep icon={Box} label="3D-МОДЕЛЬ" i={3} />
        </motion.div>

        <motion.button
          variants={fadeUp}
          custom={4}
          onClick={() => setPhase("starting")}
          className="group relative mt-10 flex items-center gap-3 overflow-hidden rounded-2xl bg-cyan-400 px-8 py-4 font-mono text-sm font-bold tracking-[0.18em] text-[#03242b] transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98]"
        >
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <Play className="h-4 w-4 fill-current" />
          ВКЛЮЧИТЬ КАМЕРУ
        </motion.button>

        {/* connection cards */}
        <div className="mt-12 grid w-full grid-cols-1 gap-3 text-left md:grid-cols-3">
          {[
            {
              icon: Cable,
              title: "Телефон как камера",
              text: "Android 14+: подключите по USB и выберите «Веб-камера». Либо DroidCam / iVCam — устройство появится в списке камер.",
            },
            {
              icon: Webcam,
              title: "Веб-камера ПК",
              text: "Встроенная или USB — работает сразу после разрешения доступа. Источник можно переключить на панели камеры.",
            },
            {
              icon: Smartphone,
              title: "Прямо на телефоне",
              text: "Откройте этот сайт в мобильном браузере по HTTPS — трекинг запустится на камере телефона без проводов.",
            },
          ].map((c, i) => (
            <motion.div key={c.title} variants={fadeUp} custom={5 + i} className="glass rounded-2xl p-5 transition-colors hover:border-cyan-300/25">
              <c.icon className="mb-3 h-5 w-5 text-cyan-300" />
              <div className="mb-1.5 text-sm font-semibold text-white">{c.title}</div>
              <div className="text-[11.5px] leading-relaxed text-cyan-50/55">{c.text}</div>
            </motion.div>
          ))}
        </div>

        <motion.div variants={fadeUp} custom={8} className="mt-9 flex items-center gap-2 text-cyan-50/40">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-300/60" />
          <span className="font-mono text-[9px] tracking-[0.16em]">
            ВИДЕО НИКУДА НЕ ОТПРАВЛЯЕТСЯ — РАСПОЗНАВАНИЕ ИДЁТ ПРЯМО НА УСТРОЙСТВЕ
          </span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function LoadingOverlay() {
  const loadingStep = useApp((s) => s.loadingStep);
  const setPhase = useApp((s) => s.setPhase);
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#050608]/80 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="glass glass-bright flex w-[320px] flex-col items-center rounded-3xl px-8 py-9 text-center">
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-lg" />
          <Loader2 className="relative h-10 w-10 animate-spin text-cyan-300" />
        </div>
        <div className="mb-1.5 font-mono text-sm font-bold tracking-[0.2em] text-white">ПОДГОТОВКА</div>
        <div className="mb-6 text-xs leading-relaxed text-cyan-50/60">{loadingStep || "Инициализация…"}</div>
        <button
          onClick={() => setPhase("intro")}
          className="rounded-lg border border-white/10 px-4 py-2 font-mono text-[10px] tracking-[0.18em] text-cyan-50/60 transition-colors hover:border-cyan-300/30 hover:text-cyan-100"
        >
          ОТМЕНА
        </button>
      </div>
    </motion.div>
  );
}

export function ErrorOverlay() {
  const error = useApp((s) => s.error);
  const retry = useApp((s) => s.retry);
  const setPhase = useApp((s) => s.setPhase);
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#050608]/85 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="glass flex w-[340px] flex-col items-center rounded-3xl px-8 py-9 text-center">
        <TriangleAlert className="mb-4 h-10 w-10 text-amber-400" />
        <div className="mb-1.5 font-mono text-sm font-bold tracking-[0.2em] text-white">НЕ УДАЛОСЬ ЗАПУСТИТЬ</div>
        <div className="mb-6 text-xs leading-relaxed text-cyan-50/60">{error}</div>
        <div className="flex gap-2.5">
          <button
            onClick={retry}
            className="rounded-lg bg-cyan-400 px-4 py-2 font-mono text-[10px] font-bold tracking-[0.18em] text-[#03242b] transition-transform hover:scale-[1.03]"
          >
            ПОВТОРИТЬ
          </button>
          <button
            onClick={() => setPhase("intro")}
            className="rounded-lg border border-white/10 px-4 py-2 font-mono text-[10px] tracking-[0.18em] text-cyan-50/60 transition-colors hover:border-cyan-300/30 hover:text-cyan-100"
          >
            НАЗАД
          </button>
        </div>
      </div>
    </motion.div>
  );
}
