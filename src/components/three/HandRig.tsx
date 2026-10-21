import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { buildHandCache, solveHand, relaxToRest } from "../../lib/retarget";
import type { HandCache, HandSide } from "../../lib/retarget";
import { liveFrame, isHandFresh } from "../../lib/liveFrame";

const MODEL_URL = "/models/right_hand.glb";
useGLTF.preload(MODEL_URL);

/** resting display slots when a hand is not tracked */
const SLOT_X: Record<HandSide, number> = { Right: 0.85, Left: -0.85 };
const SLOT_Y = 1.42 - 0.55; // rest wrist sits a bit below the tracked height

export function HandRig() {
  const { scene } = useGLTF(MODEL_URL);
  const rightHand = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const leftHand = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  return (
    <>
      <HandInstance object={rightHand} side="Right" />
      <HandInstance object={leftHand} side="Left" />
    </>
  );
}

function HandInstance({ object, side }: { object: THREE.Object3D; side: HandSide }) {
  const group = useRef<THREE.Group>(null);
  const cacheRef = useRef<HandCache | null>(null);

  // normalize the ~0.2-unit model to ~1.5 scene units
  const scale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const characteristic = Math.max(size.x, size.y, size.z) || 1;
    return 1.5 / characteristic;
  }, [object]);

  useLayoutEffect(() => {
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // skinned bounds are stale once animated
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.envMapIntensity = 0.65;
          mat.metalness = 0.05;
          mat.roughness = 0.55;
          mat.needsUpdate = true;
        }
      }
    });
  }, [object]);

  useFrame((_state, dt) => {
    if (!group.current) return;
    if (!cacheRef.current) {
      // world matrices are valid by now (group scale/position included)
      cacheRef.current = buildHandCache(object);
    }
    const cache = cacheRef.current;
    const now = performance.now();
    const dtMs = dt * 1000;

    if (isHandFresh(side, now)) {
      const hand = liveFrame.hands[side]!;
      solveHand(cache, hand.landmarks, hand.handedness, now, dtMs);
    } else {
      relaxToRest(cache, dtMs);
    }
  });

  return (
    <group ref={group} position={[SLOT_X[side], SLOT_Y, 0]} scale={scale}>
      <primitive object={object} />
    </group>
  );
}
