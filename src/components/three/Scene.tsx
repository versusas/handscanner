import { Suspense, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HandRig } from "./HandRig";

/** Code-generated studio environment (no network HDR fetches). */
function EnvSetup() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Slight parallax drift following the pointer. */
function CameraRig() {
  useFrame((state, dt) => {
    const cam = state.camera;
    cam.position.x = THREE.MathUtils.damp(cam.position.x, state.pointer.x * 0.35, 2.4, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, 1.62 + state.pointer.y * 0.16, 2.4, dt);
    cam.lookAt(0, 1.38, 0);
  });
  return null;
}

export function Scene() {
  return (
    <div className="absolute inset-0">
      <Canvas
        shadows
        dpr={[1, 1.8]}
        camera={{ position: [0, 1.62, 3.55], fov: 36, near: 0.1, far: 40 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <color attach="background" args={["#050608"]} />
        <fog attach="fog" args={["#050608", 7.5, 17]} />
        <CameraRig />
        <EnvSetup />

        {/* lighting: cool key + cyan rim + warm fill */}
        <ambientLight intensity={0.22} />
        <directionalLight
          position={[3.2, 5.2, 4]}
          intensity={1.5}
          color="#eaf6ff"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-4}
          shadow-camera-right={4}
          shadow-camera-top={4}
          shadow-camera-bottom={-4}
          shadow-bias={-0.0004}
        />
        <spotLight position={[-4.5, 3.2, -2.5]} intensity={28} color="#22d3ee" angle={0.7} penumbra={1} distance={18} />
        <pointLight position={[2.5, 1.2, 2.8]} intensity={4} color="#ffd9b8" distance={10} />

        <Suspense fallback={null}>
          <HandRig />
        </Suspense>

        {/* floor */}
        <mesh position={[0, -0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#070a0d" roughness={0.95} metalness={0} />
        </mesh>
        <Grid
          position={[0, 0, 0]}
          args={[40, 40]}
          cellSize={0.42}
          cellThickness={0.6}
          cellColor="#0d1c23"
          sectionSize={2.1}
          sectionThickness={1.1}
          sectionColor="#143545"
          fadeDistance={15}
          fadeStrength={2.6}
          infiniteGrid
        />
        <ContactShadows position={[0, 0.004, 0]} scale={9} far={3.2} blur={2.6} opacity={0.55} color="#000000" />

        <Sparkles count={70} scale={[8, 3.6, 5]} position={[0, 1.9, -0.6]} size={1.6} speed={0.22} opacity={0.4} color="#67e8f9" />
      </Canvas>
    </div>
  );
}
