import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LM {
  x: number;
  y: number;
  z: number;
}
export type HandSide = "Left" | "Right";
type Finger = "thumb" | "index" | "middle" | "ring" | "pinky";

/* ------------------------------------------------------------------ */
/*  Calibration                                                        */
/* ------------------------------------------------------------------ */

export const CALIB = {
  /** world-units multiplier for the normalized landmark space */
  scale: 8.5,
  /** world-space offset of the wrist when the hand is centered in frame */
  xOffset: 0,
  yOffset: 1.42,
  /** depth influence (MediaPipe z, relative to wrist) */
  zScale: 0.9,
  zClamp: 1.15,
  /** exp smoothing rates, 1/s */
  rotRate: 20,
  posRate: 26,
  /** relax-back-to-bind speed when tracking is lost */
  restRate: 7,
  /** snap instantly if the hand was gone longer than this */
  snapAfterMs: 700,
};

/* ------------------------------------------------------------------ */
/*  Rig description — BabylonJS realistic right hand                   */
/* ------------------------------------------------------------------ */

export interface RigMap {
  wrist: string;
  chains: Record<Finger, string[]>;
}

export const BABYLON_RIG_R: RigMap = {
  wrist: "wrist_R",
  chains: {
    thumb: ["thumb_metacarpal_R", "thumb_proxPhalanx_R", "thumb_distPhalanx_R", "thumb_tip_R"],
    index: ["index_metacarpal_R", "index_proxPhalanx_R", "index_intPhalanx_R", "index_distPhalanx_R", "index_tip_R"],
    middle: ["middle_metacarpal_R", "middle_proxPhalanx_R", "middle_intPhalanx_R", "middle_distPhalanx_R", "middle_tip_R"],
    ring: ["ring_metacarpal_R", "ring_proxPhalanx_R", "ring_intPhalanx_R", "ring_distPhalanx_R", "ring_tip_R"],
    pinky: ["little_metacarpal_R", "little_proxPhalanx_R", "little_intPhalanx_R", "little_distPhalanx_R", "little_tip_R"],
  },
};

const FINGER_BASE: Record<Finger, number> = { thumb: 1, index: 5, middle: 9, ring: 13, pinky: 17 };

/** Map each bone edge (root→tip order) to a landmark segment it should follow. */
function anatomicalEdges(finger: Finger, jointCount: number): Array<[number, number]> {
  const b = FINGER_BASE[finger];
  const full: Array<[number, number]> =
    finger === "thumb"
      ? [
          [1, 2], // metacarpal  → cmc..mcp segment
          [2, 3], // proximal    → mcp..ip
          [3, 4], // distal      → ip..tip
        ]
      : [
          [0, b], // metacarpal  → wrist..mcp
          [b, b + 1], // proximal  → mcp..pip
          [b + 1, b + 2], // inter  → pip..dip
          [b + 2, b + 3], // distal → dip..tip
        ];
  return full.slice(0, Math.max(0, jointCount - 1));
}

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

interface JointC {
  bone: THREE.Object3D;
  restWorldPos: THREE.Vector3;
  restWorldQuat: THREE.Quaternion;
  restLocalPos: THREE.Vector3;
  restLocalQuat: THREE.Quaternion;
  parentInvMatrix: THREE.Matrix4;
  parentQuatInv: THREE.Quaternion;
}

interface EdgeC {
  joint: JointC;
  restDirWorld: THREE.Vector3;
  /** offset to the next joint in the chain, expressed in this joint's rest frame */
  childOffsetLocal: THREE.Vector3;
  lmA: number;
  lmB: number;
  isRoot: boolean;
  reuseParentDelta: boolean;
  /** for chain roots: offset from wrist in wrist rest frame */
  rootOffsetFromWrist: THREE.Vector3;
  curDelta: THREE.Quaternion;
  curQuatWorld: THREE.Quaternion;
  curPosWorld: THREE.Vector3;
}

export interface HandCache {
  wrist: JointC;
  restBasisQuatInv: THREE.Quaternion;
  curWristDelta: THREE.Quaternion;
  curWristQuatWorld: THREE.Quaternion;
  curWristPosWorld: THREE.Vector3;
  chains: EdgeC[][];
  allJoints: JointC[];
  allEdges: EdgeC[];
  targets: THREE.Vector3[];
  hasSolved: boolean;
  lastSolveMs: number;
  missing: string[];
  // scratch
  _v1: THREE.Vector3;
  _v2: THREE.Vector3;
  _v3: THREE.Vector3;
  _q1: THREE.Quaternion;
  _m1: THREE.Matrix4;
}

const _wp = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const ZERO = new THREE.Vector3();

function findJoint(root: THREE.Object3D, name: string, missing: string[]): JointC | null {
  const bone = root.getObjectByName(name);
  if (!bone) {
    missing.push(name);
    return null;
  }
  bone.getWorldPosition(_wp);
  bone.getWorldQuaternion(_wq);
  const parentQuat = new THREE.Quaternion();
  const parentInv = new THREE.Matrix4();
  if (bone.parent) {
    bone.parent.getWorldQuaternion(parentQuat);
    parentInv.copy(bone.parent.matrixWorld).invert();
  }
  return {
    bone,
    restWorldPos: _wp.clone(),
    restWorldQuat: _wq.clone(),
    restLocalPos: bone.position.clone(),
    restLocalQuat: bone.quaternion.clone(),
    parentInvMatrix: parentInv,
    parentQuatInv: parentQuat.invert(),
  };
}

/** Orthonormal palm basis from wrist + four knuckle positions. */
function palmBasisQuat(p0: THREE.Vector3, p5: THREE.Vector3, p9: THREE.Vector3, p13: THREE.Vector3, p17: THREE.Vector3, out: THREE.Quaternion, m: THREE.Matrix4): void {
  const across = new THREE.Vector3().subVectors(p5, p17).normalize(); // index side − pinky side
  const mid = new THREE.Vector3().add(p5).add(p9).add(p13).add(p17).multiplyScalar(0.25);
  const along = new THREE.Vector3().subVectors(mid, p0);
  along.addScaledVector(across, -along.dot(across)).normalize(); // orthogonalized "toward fingers"
  const normal = new THREE.Vector3().crossVectors(across, along).normalize();
  m.makeBasis(across, along, normal);
  out.setFromRotationMatrix(m);
}

export function buildHandCache(rootObj: THREE.Object3D, rig: RigMap = BABYLON_RIG_R): HandCache {
  rootObj.updateWorldMatrix(true, true);
  const missing: string[] = [];

  const wrist = findJoint(rootObj, rig.wrist, missing);
  if (!wrist) throw new Error(`Rig is missing wrist bone "${rig.wrist}"`);

  const knuckles = (["index", "middle", "ring", "pinky"] as Finger[]).map((f) => {
    // knuckle ≈ second joint of the chain (prox phalanx sits at the MCP)
    const name = rig.chains[f][1] ?? rig.chains[f][0];
    return findJoint(rootObj, name, missing);
  });
  if (knuckles.some((k) => !k)) throw new Error("Rig is missing knuckle bones: " + missing.join(","));

  const restBasis = new THREE.Quaternion();
  const m1 = new THREE.Matrix4();
  palmBasisQuat(
    wrist.restWorldPos,
    knuckles[0]!.restWorldPos,
    knuckles[1]!.restWorldPos,
    knuckles[2]!.restWorldPos,
    knuckles[3]!.restWorldPos,
    restBasis,
    m1
  );

  const chains: EdgeC[][] = [];
  const allJoints: JointC[] = [wrist];
  const allEdges: EdgeC[] = [];

  (Object.keys(rig.chains) as Finger[]).forEach((finger) => {
    const names = rig.chains[finger];
    const joints: JointC[] = [];
    for (const n of names) {
      const j = findJoint(rootObj, n, missing);
      if (j) {
        joints.push(j);
        allJoints.push(j);
      }
    }
    if (joints.length < 2) return;

    const edges = anatomicalEdges(finger, joints.length);
    const wristInv = wrist.restWorldQuat.clone().invert();
    const chain: EdgeC[] = joints.map((joint, i) => {
      const next = joints[i + 1] ?? null;
      const isLast = !next;
      const [lmA, lmB] = isLast ? edges[edges.length - 1] : edges[i];
      const jointInv = joint.restWorldQuat.clone().invert();
      const childOffsetLocal = next
        ? next.restWorldPos.clone().sub(joint.restWorldPos).applyQuaternion(jointInv)
        : new THREE.Vector3();
      const restDirWorld = next
        ? next.restWorldPos.clone().sub(joint.restWorldPos).normalize()
        : joints[i].restWorldPos.clone().sub(joints[i - 1].restWorldPos).normalize();
      return {
        joint,
        restDirWorld,
        childOffsetLocal,
        lmA,
        lmB,
        isRoot: i === 0,
        reuseParentDelta: isLast,
        rootOffsetFromWrist: joint.restWorldPos.clone().sub(wrist.restWorldPos).applyQuaternion(wristInv),
        curDelta: new THREE.Quaternion(),
        curQuatWorld: joint.restWorldQuat.clone(),
        curPosWorld: joint.restWorldPos.clone(),
      } satisfies EdgeC;
    });
    chains.push(chain);
    allEdges.push(...chain);
  });

  return {
    wrist,
    restBasisQuatInv: restBasis.clone().invert(),
    curWristDelta: new THREE.Quaternion(),
    curWristQuatWorld: wrist.restWorldQuat.clone(),
    curWristPosWorld: wrist.restWorldPos.clone(),
    chains,
    allJoints,
    allEdges,
    targets: Array.from({ length: 21 }, () => new THREE.Vector3()),
    hasSolved: false,
    lastSolveMs: 0,
    missing,
    _v1: new THREE.Vector3(),
    _v2: new THREE.Vector3(),
    _v3: new THREE.Vector3(),
    _q1: new THREE.Quaternion(),
    _m1: new THREE.Matrix4(),
  };
}

/* ------------------------------------------------------------------ */
/*  Solver                                                             */
/* ------------------------------------------------------------------ */

/**
 * Converts landmarks → world targets and drives every bone of the rig.
 *
 * Mapping notes:
 *  - x is mirrored for a selfie-mirror UX; y flipped (image-down → world-up);
 *    z kept — the composed transform is a proper rotation, so a right hand
 *    keeps right-hand chirality and matches the rig.
 *  - "Left" hands are pre-mirrored (x → 1−x): a mirrored left hand is
 *    geometrically a right hand, so the same rig solves it perfectly.
 */
export function solveHand(cache: HandCache, landmarks: LM[], handedness: HandSide, nowMs: number, dtMs: number): void {
  const T = cache.targets;
  const S = CALIB.scale;
  const mirrorX = handedness === "Left";

  for (let i = 0; i < 21; i++) {
    const lm = landmarks[i];
    const x = mirrorX ? 1 - lm.x : lm.x;
    const z = THREE.MathUtils.clamp(lm.z * CALIB.zScale * S, -CALIB.zClamp, CALIB.zClamp);
    T[i].set(CALIB.xOffset + (0.5 - x) * S, CALIB.yOffset + (0.5 - lm.y) * S, z);
  }

  const snap = !cache.hasSolved || nowMs - cache.lastSolveMs > CALIB.snapAfterMs;
  const dt = Math.min(Math.max(dtMs, 1), 100) / 1000;
  const aR = snap ? 1 : 1 - Math.exp(-dt * CALIB.rotRate);
  const aP = snap ? 1 : 1 - Math.exp(-dt * CALIB.posRate);

  /* --- wrist orientation from palm basis --- */
  palmBasisQuat(T[0], T[5], T[9], T[13], T[17], cache._q1, cache._m1);
  cache._q1.multiply(cache.restBasisQuatInv); // world-space delta from rest basis
  const targetWristQuat = cache._q1.multiply(cache.wrist.restWorldQuat);

  cache.curWristQuatWorld.slerp(targetWristQuat, aR);
  cache.curWristPosWorld.lerp(T[0], aP);
  cache.curWristDelta.copy(cache.curWristQuatWorld).multiply(cache._q1.copy(cache.wrist.restWorldQuat).invert());

  writeLocal(cache.wrist, cache.curWristPosWorld, cache.curWristQuatWorld);

  /* --- finger chains --- */
  for (const chain of cache.chains) {
    for (let i = 0; i < chain.length; i++) {
      const edge = chain[i];
      const prev = i > 0 ? chain[i - 1] : null;

      // position: chain roots ride on the wrist, others follow FK
      const anchor = cache._v1;
      if (edge.isRoot) {
        anchor.copy(edge.rootOffsetFromWrist).applyQuaternion(cache.curWristQuatWorld).add(cache.curWristPosWorld);
      } else if (prev) {
        anchor.copy(prev.childOffsetLocal).applyQuaternion(prev.curQuatWorld).add(prev.curPosWorld);
      }

      // orientation
      let targetWorldQuat: THREE.Quaternion;
      if (edge.reuseParentDelta && prev) {
        targetWorldQuat = cache._q1.copy(prev.curDelta).multiply(edge.joint.restWorldQuat);
      } else {
        const dir = cache._v2.subVectors(T[edge.lmB], T[edge.lmA]);
        if (dir.lengthSq() < 1e-8) {
          targetWorldQuat = cache._q1.copy(edge.curQuatWorld);
        } else {
          dir.normalize();
          const delta = cache._q1.setFromUnitVectors(edge.restDirWorld, dir);
          targetWorldQuat = delta.multiply(edge.joint.restWorldQuat);
        }
      }

      edge.curQuatWorld.slerp(targetWorldQuat, aR);
      edge.curPosWorld.lerp(anchor, aP);
      edge.curDelta.copy(edge.curQuatWorld).multiply(cache._q1.copy(edge.joint.restWorldQuat).invert());

      writeLocal(edge.joint, edge.curPosWorld, edge.curQuatWorld);
    }
  }

  cache.hasSolved = true;
  cache.lastSolveMs = nowMs;
}

function writeLocal(joint: JointC, worldPos: THREE.Vector3, worldQuat: THREE.Quaternion): void {
  joint.bone.position.copy(worldPos).applyMatrix4(joint.parentInvMatrix);
  joint.bone.quaternion.copy(joint.parentQuatInv).multiply(worldQuat);
  joint.bone.updateMatrix();
}

/** Ease every driven joint back to the bind pose (used when tracking is lost). */
export function relaxToRest(cache: HandCache, dtMs: number): void {
  const dt = Math.min(Math.max(dtMs, 1), 100) / 1000;
  const a = 1 - Math.exp(-dt * CALIB.restRate);
  for (const j of cache.allJoints) {
    j.bone.position.lerp(j.restLocalPos, a);
    j.bone.quaternion.slerp(j.restLocalQuat, a);
    j.bone.updateMatrix();
  }
  // keep smoothed state in sync so the next solve starts from the rest pose
  if (a > 0.5) {
    cache.curWristQuatWorld.copy(cache.wrist.restWorldQuat);
    cache.curWristPosWorld.copy(cache.wrist.restWorldPos);
    for (const e of cache.allEdges) {
      e.curQuatWorld.copy(e.joint.restWorldQuat);
      e.curPosWorld.copy(e.joint.restWorldPos);
    }
  }
  cache.hasSolved = false;
}

export { ZERO };
