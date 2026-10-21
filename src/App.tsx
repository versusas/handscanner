import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useApp } from "./store";
import { useHandTracking } from "./hooks/useHandTracking";
import { Scene } from "./components/three/Scene";
import { CameraPanel } from "./components/CameraPanel";
import { Hud } from "./components/Hud";
import { ErrorOverlay, Intro, LoadingOverlay } from "./components/Intro";

export default function App() {
  const phase = useApp((s) => s.phase);
  const setPhase = useApp((s) => s.setPhase);

  useHandTracking();

  // Esc stops capture
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useApp.getState().phase === "running") {
        setPhase("intro");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPhase]);

  return (
    <div className="noise vignette relative h-full w-full overflow-hidden bg-[#050608] text-[#e7f2f5]">
      <Scene />
      <Hud />
      <CameraPanel />

      <AnimatePresence>
        {phase === "intro" && <Intro key="intro" />}
        {phase === "starting" && <LoadingOverlay key="loading" />}
        {phase === "error" && <ErrorOverlay key="error" />}
      </AnimatePresence>
    </div>
  );
}
