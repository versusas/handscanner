/**
 * Headless verification of the retarget solver against the real GLB rig.
 * Strips textures (Node has no DOM image decode), builds the hand cache,
 * solves synthetic landmark configurations and checks world-space geometry.
 */
import * as fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildHandCache, solveHand, relaxToRest, CALIB } from "../src/lib/retarget";
import type { LM } from "../src/lib/retarget";
import { classifyGesture } from "../src/lib/gestures";

/* ---------- GLB without textures ---------- */
function loadGlbStripped(path: string): Promise<THREE.Group> {
  const buf = fs.readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  (json.materials ?? []).forEach((m: Record<string, unknown>) => {
    const pbr = m.pbrMetallicRoughness as Record<string, unknown> | undefined;
    if (pbr) {
      delete pbr.baseColorTexture;
      delete pbr.metallicRoughnessTexture;
    }
    delete m.normalTexture;
    delete m.emissiveTexture;
    delete m.occlusionTexture;
  });
  const rest = buf.subarray(20 + jsonLen); // BIN chunk (with its own header)
  let jsonStr = JSON.stringify(json);
  while (Buffer.byteLength(jsonStr) % 4 !== 0) jsonStr += " ";
  const jsonBuf = Buffer.from(jsonStr, "utf8");
  const total = 12 + 8 + jsonBuf.length + rest.length;
  const out = Buffer.alloc(total);
  buf.copy(out, 0, 0, 12);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.write("JSON", 16, "ascii");
  jsonBuf.copy(out, 20);
  rest.copy(out, 20 + jsonBuf.length);
  const arrayBuffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.length);

  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      arrayBuffer,
      "",
      (gltf) => resolve(gltf.scene),
      (err) => reject(err)
    );
  });
}

/* ---------- synthetic landmarks ---------- */
function openHand(side: "Right" | "Left"): LM[] {
  // RIGHT hand, palm toward camera: fingers up in image (-y), thumb toward +x
  const pts: Array<[number, number, number]> = [
    [0.5, 0.62, 0], // 0 wrist
    [0.535, 0.565, -0.01], // 1 thumb cmc
    [0.56, 0.515, -0.02], // 2 thumb mcp
    [0.578, 0.475, -0.03], // 3 thumb ip
    [0.592, 0.44, -0.035], // 4 thumb tip
    [0.465, 0.45, 0], // 5 index mcp
    [0.458, 0.385, -0.01], // 6
    [0.453, 0.335, -0.015], // 7
    [0.45, 0.295, -0.02], // 8 index tip
    [0.5, 0.435, 0], // 9 middle mcp
    [0.5, 0.36, -0.01], // 10
    [0.5, 0.305, -0.015], // 11
    [0.5, 0.262, -0.02], // 12 middle tip
    [0.535, 0.445, 0], // 13 ring mcp
    [0.542, 0.375, -0.01], // 14
    [0.547, 0.322, -0.015], // 15
    [0.55, 0.282, -0.02], // 16 ring tip
    [0.565, 0.465, 0], // 17 pinky mcp
    [0.575, 0.408, -0.01], // 18
    [0.582, 0.362, -0.015], // 19
    [0.587, 0.325, -0.02], // 20 pinky tip
  ];
  if (side === "Left") {
    return pts.map(([x, y, z]) => ({ x: 1 - x, y, z }));
  }
  return pts.map(([x, y, z]) => ({ x, y, z }));
}

/* ---------- checks ---------- */
const EPS_DOT = 0.965;
let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`);
}

function worldPos(o: THREE.Object3D) {
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(new THREE.Vector3());
}

async function main() {
  const scene = new THREE.Scene();
  const model = await loadGlbStripped("public/models/right_hand.glb");
  const wrap = new THREE.Group();
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const k = 1.5 / Math.max(size.x, size.y, size.z);
  wrap.scale.setScalar(k);
  wrap.position.set(0.85, 0.87, 0);
  wrap.add(model);
  scene.add(wrap);
  scene.updateMatrixWorld(true);
  console.log("rig loaded: scale k =", k.toFixed(2));

  const cache = buildHandCache(model);
  console.log("cache missing bones:", cache.missing.length ? cache.missing : "none");

  const S = CALIB.scale;
  const toTarget = (lm: LM) =>
    new THREE.Vector3(CALIB.xOffset + (0.5 - lm.x) * S, CALIB.yOffset + (0.5 - lm.y) * S, lm.z * CALIB.zScale * S);

  for (const side of ["Right", "Left"] as const) {
    const lms = openHand(side);
    solveHand(cache, lms, side, 1000, 16);
    // a few more frames to exercise the smoothing path
    solveHand(cache, lms, side, 1016, 16);
    solveHand(cache, lms, side, 1032, 16);

    const wristW = worldPos(cache.wrist.bone);
    const wristTarget = toTarget(lms[0]);
    check(`${side}: wrist position`, wristW.distanceTo(wristTarget) < 0.03, `err ${wristW.distanceTo(wristTarget).toFixed(4)}`);

    // palm normal from solved joint positions vs target landmarks
    const get = (n: string) => worldPos(cache.wrist.bone.parent!.getObjectByName(n)!);
    void get;
    const scene2 = cache.wrist.bone;
    void scene2;
    const byName = (n: string) => worldPos(cache.allJoints.find((j) => j.bone.name === n)!.bone);
    const palmN = (p0: THREE.Vector3, p5: THREE.Vector3, p17: THREE.Vector3) =>
      new THREE.Vector3().subVectors(p5, p17).cross(new THREE.Vector3().subVectors(p5.clone().lerp(p17, 0.5), p0)).normalize();
    const nModel = palmN(byName("wrist_R"), byName("index_proxPhalanx_R"), byName("little_proxPhalanx_R"));
    // the solver pre-mirrors "Left" hands back into right-hand configuration,
    // so compare against the same un-mirrored target space it solves in
    const unflip = (lm: LM) => (side === "Left" ? { ...lm, x: 1 - lm.x } : lm);
    const nLm = palmN(toTarget(unflip(lms[0])), toTarget(unflip(lms[5])), toTarget(unflip(lms[17])));
    check(`${side}: palm normal`, nModel.dot(nLm) > 0.94, `dot ${nModel.dot(nLm).toFixed(3)}`);

    // edge direction conformity
    const edges: Array<[string, string, number, number]> = [
      ["index_proxPhalanx_R", "index_intPhalanx_R", 5, 6],
      ["index_intPhalanx_R", "index_distPhalanx_R", 6, 7],
      ["index_distPhalanx_R", "index_tip_R", 7, 8],
      ["middle_proxPhalanx_R", "middle_intPhalanx_R", 9, 10],
      ["little_proxPhalanx_R", "little_intPhalanx_R", 17, 18],
      ["thumb_proxPhalanx_R", "thumb_distPhalanx_R", 2, 3],
      ["thumb_distPhalanx_R", "thumb_tip_R", 3, 4],
    ];
    for (const [a, b, ia, ib] of edges) {
      const pa = byName(a);
      const pb = byName(b);
      const dirModel = pb.clone().sub(pa).normalize();
      const flip = side === "Left";
      const la = toTarget({ ...lms[ia], x: flip ? 1 - lms[ia].x : lms[ia].x });
      const lb = toTarget({ ...lms[ib], x: flip ? 1 - lms[ib].x : lms[ib].x });
      const dirLm = lb.clone().sub(la).normalize();
      check(`${side}: ${a}→… dir`, dirModel.dot(dirLm) > EPS_DOT, `dot ${dirModel.dot(dirLm).toFixed(3)}`);
    }

    // FK integrity: bone lengths preserved
    const lenRest = (a: string, b: string) => {
      const ja = cache.allJoints.find((j) => j.bone.name === a)!;
      const jb = cache.allJoints.find((j) => j.bone.name === b)!;
      return ja.restWorldPos.distanceTo(jb.restWorldPos);
    };
    const dNow = byName("middle_proxPhalanx_R").distanceTo(byName("middle_intPhalanx_R"));
    const dRest = lenRest("middle_proxPhalanx_R", "middle_intPhalanx_R");
    check(`${side}: bone length preserved`, Math.abs(dNow - dRest) / dRest < 0.01, `${dNow.toFixed(4)} vs ${dRest.toFixed(4)}`);
  }

  // relax back to bind pose
  const byName2 = (n: string) => worldPos(cache.allJoints.find((j) => j.bone.name === n)!.bone);
  for (let i = 0; i < 40; i++) relaxToRest(cache, 33);
  const rest = cache.allJoints.find((j) => j.bone.name === "index_tip_R")!.restWorldPos;
  const now = byName2("index_tip_R");
  check("relax: returns to bind", rest.distanceTo(now) < 0.02, `err ${rest.distanceTo(now).toFixed(4)}`);

  /* ---------- gesture classifier ---------- */
  const g1 = classifyGesture(openHand("Right"));
  check("gesture: open hand", g1.id === "open", g1.id);

  // realistic fist: fingertips curl down into the palm (below knuckles, near wrist)
  const fist = openHand("Right");
  for (const base of [5, 9, 13, 17]) {
    const mcp = fist[base];
    fist[base + 1] = { x: mcp.x, y: mcp.y + 0.035, z: -0.02 }; // pip bends forward
    fist[base + 2] = { x: mcp.x + 0.004, y: 0.6, z: -0.04 }; // dip near palm
    fist[base + 3] = { x: mcp.x + 0.008, y: 0.625, z: -0.05 }; // tip at wrist level
  }
  fist[2] = { x: 0.5, y: 0.575, z: -0.02 };
  fist[3] = { x: 0.475, y: 0.555, z: -0.03 };
  fist[4] = { x: 0.47, y: 0.53, z: -0.04 }; // thumb rests across the index middle phalanx
  const g2 = classifyGesture(fist);
  check("gesture: fist", g2.id === "fist", g2.id);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
