import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

let landmarkerPromise: Promise<HandLandmarker> | null = null;

/** Lazily creates the HandLandmarker (GPU delegate, CPU fallback). Files are local: public/mediapipe. */
export function getLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const make = (delegate: "GPU" | "CPU") =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.45,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        return await make("GPU");
      } catch {
        return await make("CPU");
      }
    })();
  }
  return landmarkerPromise;
}

export async function startStream(video: HTMLVideoElement, deviceId?: string): Promise<MediaStream> {
  stopStream(video);
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => undefined);
  // wait until metadata arrives so videoWidth/Height are valid
  if (video.readyState < 1) {
    await new Promise<void>((res) => video.addEventListener("loadedmetadata", () => res(), { once: true }));
  }
  return stream;
}

export function stopStream(video: HTMLVideoElement | null): void {
  const stream = (video?.srcObject as MediaStream | null) ?? null;
  stream?.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}

export function cameraSupportError(): string | null {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "Браузер не поддерживает доступ к камере. Откройте сайт по HTTPS или на localhost в современном браузере.";
  }
  return null;
}

export function describeGetUserMediaError(err: unknown): string {
  const name = (err as DOMException)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Доступ к камере запрещён. Разрешите камеру в адресной строке браузера и попробуйте снова.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Камера не найдена. Подключите веб-камеру или телефон (DroidCam / iVCam / USB-режим) и повторите.";
    case "NotReadableError":
    case "AbortError":
      return "Камера занята другим приложением. Закройте его и попробуйте снова.";
    default:
      return "Не удалось запустить камеру: " + ((err as Error)?.message || "неизвестная ошибка");
  }
}
