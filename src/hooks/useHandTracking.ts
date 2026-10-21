import { useEffect } from "react";
import { useApp } from "../store";
import { liveFrame } from "../lib/liveFrame";
import { classifyGesture } from "../lib/gestures";
import {
  cameraSupportError,
  describeGetUserMediaError,
  getLandmarker,
  listCameras,
  startStream,
  stopStream,
} from "../lib/vision";
import type { HandSide } from "../lib/retarget";

const NO_GESTURE = { id: "unknown" as const, label: "—" };

/**
 * Owns the whole pipeline once phase === "starting":
 * camera → HandLandmarker → rAF detection loop → liveFrame + throttled UI state.
 */
export function useHandTracking(): void {
  const phase = useApp((s) => s.phase);
  const videoEl = useApp((s) => s.videoEl);
  const deviceId = useApp((s) => s.deviceId);
  const retryNonce = useApp((s) => s.retryNonce);

  useEffect(() => {
    if (phase !== "starting" || !videoEl) return;

    let cancelled = false;
    let raf = 0;
    let lastVideoTime = -1;
    let lastDetectTs = 0;
    let fpsEma = 0;
    let lastUiPush = 0;

    const store = useApp.getState();

    const loop = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      if (videoEl.readyState < 2 || videoEl.currentTime === lastVideoTime) return;
      lastVideoTime = videoEl.currentTime;

      const now = performance.now();
      let result;
      try {
        result = landmarker.detectForVideo(videoEl, now);
      } catch {
        return; // timestamp hiccup — skip frame
      }
      const dt = now - lastDetectTs;
      lastDetectTs = now;
      if (dt > 0 && dt < 1000) {
        const inst = 1000 / dt;
        fpsEma = fpsEma ? fpsEma * 0.9 + inst * 0.1 : inst;
      }

      const hands: typeof liveFrame.hands = {};
      const count = result.landmarks?.length ?? 0;
      for (let i = 0; i < count; i++) {
        const side = (result.handedness?.[i]?.[0]?.categoryName ?? "Right") as HandSide;
        const lms = result.landmarks[i].map((p) => ({ x: p.x, y: p.y, z: p.z }));
        hands[side] = { landmarks: lms, handedness: side, timestamp: now };
      }
      liveFrame.hands = hands;

      // throttled UI updates (presence + gestures + fps)
      if (now - lastUiPush > 120) {
        lastUiPush = now;
        useApp.getState().setHands({
          Left: {
            present: !!hands.Left,
            gesture: hands.Left ? classifyGesture(hands.Left.landmarks) : NO_GESTURE,
          },
          Right: {
            present: !!hands.Right,
            gesture: hands.Right ? classifyGesture(hands.Right.landmarks) : NO_GESTURE,
          },
        });
        useApp.getState().setFps(Math.round(fpsEma));
      }
    };

    let landmarker: Awaited<ReturnType<typeof getLandmarker>>;

    (async () => {
      const supportError = cameraSupportError();
      if (supportError) {
        store.setError(supportError);
        return;
      }
      try {
        store.setLoading("Запрашиваем доступ к камере…");
        await startStream(videoEl, deviceId);
        if (cancelled) return;

        store.setLoading("Загружаем ИИ-модель трекинга…");
        landmarker = await getLandmarker();
        if (cancelled) return;

        const cams = await listCameras().catch(() => []);
        useApp.getState().setDevices(cams);

        useApp.getState().setPhase("running");
        lastVideoTime = -1;
        raf = requestAnimationFrame(loop);
      } catch (err) {
        if (!cancelled) store.setError(describeGetUserMediaError(err));
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopStream(videoEl);
      liveFrame.hands = {};
    };
  }, [phase, videoEl, deviceId, retryNonce]);
}
