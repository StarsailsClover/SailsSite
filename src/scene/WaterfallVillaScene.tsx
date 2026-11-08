import {
  Component,
  memo,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas } from "@react-three/fiber";
import {
  AdaptiveDpr,
  ContactShadows,
  Environment,
  Float,
  Lightformer,
} from "@react-three/drei";
import * as THREE from "three";
import CameraRig from "@/scene/CameraRig";
import VillaModel from "@/scene/VillaModel";
import { MistParticles, RainLines, Waterfall, WaterPlane } from "@/scene/WaterAndMist";
import { CelestialBody, Fireflies, Stars } from "@/scene/AtmosphereFX";
import SceneFallback from "@/scene/SceneFallback";
import type { Atmosphere } from "@/hooks/useGuangzhouWeather";
import {
  getSceneProfile,
  type SceneProfile,
} from "@/scene/renderProfile";

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <SceneFallback />;
    return this.props.children;
  }
}

function stormLevel(code: number) {
  if ([65, 80, 81, 82, 95].includes(code)) return 1;
  if ([51, 53, 55, 61, 63].includes(code)) return 0.55;
  if ([45, 48].includes(code)) return 0.35;
  return 0.12;
}

function Cliff({
  night,
  profile,
}: {
  night: boolean;
  profile: SceneProfile;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const count =
    profile.quality === "high" ? 15 : profile.quality === "balanced" ? 10 : 7;
  const rocks = useMemo(() => {
    const list: {
      pos: [number, number, number];
      scale: [number, number, number];
      rotation: [number, number, number];
      moss: boolean;
      tone: number;
    }[] = [];
    let seed = 37;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let index = 0; index < count; index += 1) {
      const layer = Math.floor(index / 4);
      list.push({
        pos: [
          (index % 4) * 0.67 - 0.5 + (random() - 0.5) * 0.3,
          -0.6 + layer * 1.13 + random() * 0.25,
          -layer * 0.28 - 0.2 + random() * 0.35,
        ],
        scale: [
          1.0 + random() * 0.75,
          1.55 + random() * 0.75,
          0.82 + random() * 0.55,
        ],
        rotation: [
          (random() - 0.5) * 0.3,
          (random() - 0.5) * 0.5,
          (random() - 0.5) * 0.24,
        ],
        moss: random() > 0.55,
        tone: index % 3,
      });
    }
    return list;
  }, [count]);

  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({
        color: night ? "#090d0b" : "#151b17",
        roughness: 0.97,
        flatShading: true,
      }),
      new THREE.MeshStandardMaterial({
        color: night ? "#0b1110" : "#1b231d",
        roughness: 0.95,
        flatShading: true,
      }),
      new THREE.MeshStandardMaterial({
        color: night ? "#101613" : "#242a21",
        roughness: 0.93,
        flatShading: true,
      }),
    ],
    [night],
  );
  const mossMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: night ? "#1e2a20" : "#32422d",
        roughness: 0.98,
        flatShading: true,
      }),
    [night],
  );

  useEffect(() => {
    if (!profile.shadows || !groupRef.current) return;
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [profile.shadows, rocks]);

  useEffect(
    () => () => {
      materials.forEach((material) => material.dispose());
      mossMaterial.dispose();
    },
    [materials, mossMaterial],
  );

  return (
    <group ref={groupRef} position={[-3.0, -1.08, -2.8]} rotation={[0, 0.16, 0]}>
      {rocks.map((rock, index) => (
        <group
          key={index}
          position={rock.pos}
          rotation={rock.rotation}
          scale={rock.scale}
        >
          <mesh>
            <dodecahedronGeometry
              args={[1, profile.quality === "high" ? 1 : 0]}
            />
            <primitive object={materials[rock.tone]} attach="material" />
          </mesh>
          {rock.moss && (
            <mesh position={[0.1, 0.55, 0.48]} scale={[0.72, 0.24, 0.55]}>
              <icosahedronGeometry args={[0.55, 1]} />
              <primitive object={mossMaterial} attach="material" />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

const SceneObjects = memo(function SceneObjects({
  musicActive,
  atmos,
  profile,
}: {
  musicActive: boolean;
  atmos: Atmosphere;
  profile: SceneProfile;
}) {
  const storm = stormLevel(atmos.code);
  const night = atmos.isNight;
  const cloud = (atmos.cloudCover ?? 45) / 100;
  const humidity = (atmos.humidity ?? 78) / 100;
  const temperature = atmos.temperature ?? 24;
  const goldenHour = atmos.phase === "dawn" || atmos.phase === "dusk";

  const hour = atmos.hour ?? (night ? 22 : 13);
  const arcT = night
    ? THREE.MathUtils.clamp(((hour - 19 + 24) % 24) / 11, 0, 1)
    : THREE.MathUtils.clamp((hour - 6) / 13, 0, 1);
  const arcAngle = Math.PI * (1 - arcT);
  const lightPosition: [number, number, number] = [
    Math.cos(arcAngle) * 8,
    2 + Math.sin(arcAngle) * 6,
    -4,
  ];
  const directDim = 1 - cloud * 0.52;

  const fogColor = useMemo(
    () =>
      new THREE.Color(
        night ? "#091318" : goldenHour ? "#8e7e78" : "#829aa2",
      ),
    [goldenHour, night],
  );
  const backgroundColor = useMemo(
    () =>
      new THREE.Color(
        night ? "#03070a" : goldenHour ? "#100e0d" : "#081113",
      ),
    [goldenHour, night],
  );
  const ambientColor = useMemo(() => {
    const coldness = THREE.MathUtils.clamp((24 - temperature) / 20, -1, 1);
    const base = new THREE.Color(night ? "#547283" : "#b5cbd2");
    return base.lerp(
      new THREE.Color(coldness > 0 ? "#7891bd" : "#b99d82"),
      Math.abs(coldness) * 0.5,
    );
  }, [night, temperature]);

  const fogDensity =
    (night ? 0.047 : 0.058) * (0.88 + humidity * 0.26) + storm * 0.009;
  const sunColor = night ? "#adc3dd" : goldenHour ? "#ffb27a" : "#fff0d7";
  const sunIntensity =
    (night ? 0.74 : goldenHour ? 1.36 : 1.62) * directDim;
  const shadowSize = profile.quality === "high" ? 2048 : 1024;

  return (
    <>
      <color attach="background" args={[backgroundColor.getStyle()]} />
      <fogExp2 attach="fog" args={[fogColor.getStyle(), fogDensity]} />

      <ambientLight
        intensity={(night ? 0.23 : 0.32) + cloud * 0.1}
        color={ambientColor}
      />
      <hemisphereLight
        args={[
          night ? "#446171" : goldenHour ? "#d7bdab" : "#c8dfe6",
          "#080c08",
          (night ? 0.42 : 0.6) * (0.72 + cloud * 0.35),
        ]}
      />
      <directionalLight
        position={lightPosition}
        intensity={sunIntensity}
        color={sunColor}
        castShadow={profile.shadows}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={8}
        shadow-camera-bottom={-7}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
        shadow-bias={-0.00025}
      />
      <directionalLight
        position={[5.5, 3.5, -4]}
        intensity={(night ? 0.52 : 0.78) * (0.62 + cloud * 0.45)}
        color={night ? "#7596b1" : "#dbe8ed"}
      />
      {profile.quality === "high" && (
        <>
          <spotLight
            position={[0.8, 2.2, 3.4]}
            angle={0.55}
            penumbra={0.85}
            intensity={26}
            distance={14}
            color="#d7a566"
            castShadow
            shadow-mapSize-width={512}
            shadow-mapSize-height={512}
          />
          <Environment resolution={128} frames={1}>
            <Lightformer
              form="rect"
              intensity={2.3}
              color="#b7d6de"
              position={[0, 5, -8]}
              scale={[12, 4, 1]}
            />
            <Lightformer
              form="rect"
              intensity={1.2}
              color="#f0b36d"
              position={[5, 1, 3]}
              scale={[3, 4, 1]}
            />
            <Lightformer
              form="ring"
              intensity={1.4}
              color="#6f8c91"
              position={[-5, 3, 1]}
              scale={4}
            />
          </Environment>
        </>
      )}

      <CelestialBody atmos={atmos} profile={profile} />
      <Stars atmos={atmos} profile={profile} />

      <Cliff night={night} profile={profile} />
      <Waterfall storm={storm} profile={profile} />
      <WaterPlane
        active={musicActive}
        storm={storm}
        night={night}
        duskTinted={goldenHour && !night}
        profile={profile}
      />
      {profile.reducedMotion || profile.isMobile ? (
        <VillaModel active={musicActive || night} quality={profile.quality} />
      ) : (
        <Float speed={0.52} rotationIntensity={0.008} floatIntensity={0.025}>
          <VillaModel active={musicActive || night} quality={profile.quality} />
        </Float>
      )}
      <MistParticles
        storm={storm}
        night={night}
        windDirection={atmos.windDirection}
        windSpeed={atmos.windSpeed}
        profile={profile}
      />
      <RainLines
        storm={storm}
        windDirection={atmos.windDirection}
        windSpeed={atmos.windSpeed}
        profile={profile}
      />
      <Fireflies atmos={atmos} profile={profile} />

      {profile.quality === "high" && (
        <ContactShadows
          position={[0, -1.09, -0.4]}
          opacity={0.48}
          scale={13}
          blur={2.8}
          far={4.8}
          resolution={512}
          frames={1}
        />
      )}
    </>
  );
});

let webglSupported: boolean | null = null;

function canUseWebGL() {
  if (webglSupported !== null) return webglSupported;
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false });
    webglSupported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupported = false;
  }
  return webglSupported;
}

export default function WaterfallVillaScene({
  scrollProgress,
  musicActive,
  weather,
}: {
  scrollProgress: number;
  musicActive: boolean;
  weather: Atmosphere;
}) {
  const [profile] = useState(getSceneProfile);
  const [contextLost, setContextLost] = useState(false);

  if (typeof window !== "undefined" && !canUseWebGL()) return <SceneFallback />;

  return (
    <div className="scene-canvas-wrap" data-scene-quality={profile.quality}>
      {contextLost && <SceneFallback />}
      <SceneErrorBoundary>
        <Canvas
          camera={{ position: [0.4, 3.1, 9.4], fov: 58 }}
          shadows={profile.shadows}
          gl={{
            alpha: true,
            antialias: profile.antialias,
            powerPreference:
              profile.quality === "mobile" ? "low-power" : "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: profile.quality === "high" ? 1.02 : 0.94,
          }}
          dpr={profile.dpr}
          performance={{ min: profile.quality === "mobile" ? 0.48 : 0.62 }}
          frameloop="always"
          onCreated={({ gl }) => {
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            gl.setClearColor(0x04070a, 1);
            gl.domElement.addEventListener("webglcontextlost", (event) => {
              event.preventDefault();
              setContextLost(true);
            });
            gl.domElement.addEventListener("webglcontextrestored", () => {
              setContextLost(false);
            });
          }}
        >
          <AdaptiveDpr pixelated={profile.quality === "mobile"} />
          <Suspense fallback={null}>
            <SceneObjects
              musicActive={musicActive}
              atmos={weather}
              profile={profile}
            />
            <CameraRig progress={scrollProgress} profile={profile} />
          </Suspense>
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
