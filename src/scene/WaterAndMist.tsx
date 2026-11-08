import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneProfile } from "@/scene/renderProfile";

function windVector(windDirection: number | null, windSpeed: number | null) {
  const radians = ((windDirection ?? 220) * Math.PI) / 180;
  const strength = THREE.MathUtils.clamp((windSpeed ?? 8) / 24, 0.25, 1.6);
  return {
    x: -Math.sin(radians),
    z: -Math.cos(radians),
    strength,
  };
}

export function RainLines({
  storm = 0,
  windDirection = null,
  windSpeed = null,
  profile,
}: {
  storm?: number;
  windDirection?: number | null;
  windSpeed?: number | null;
  profile: SceneProfile;
}) {
  const group = useRef<THREE.Group>(null);
  const frame = useRef(0);
  const wind = useMemo(
    () => windVector(windDirection, windSpeed),
    [windDirection, windSpeed],
  );
  const drops = useMemo(
    () =>
      Array.from({ length: profile.rainCount }, (_, index) => ({
        x: -5.4 + (index % 23) * 0.48,
        y: Math.random() * 6 - 2,
        z: -2 + (index % 7) * 0.44,
      })),
    [profile.rainCount],
  );

  useFrame((_, delta) => {
    if (!group.current || profile.reducedMotion) return;
    frame.current += 1;
    if (profile.isMobile && frame.current % 2) return;
    group.current.children.forEach((child) => {
      child.position.y -= delta * (6 + storm * 4 + wind.strength * 2.5);
      if (child.position.y < -2) child.position.y = 4;
    });
  });

  if (storm < 0.5) return null;
  const tiltZ = THREE.MathUtils.clamp(-wind.x * wind.strength * 0.16, -0.22, 0.22);
  const tiltX = THREE.MathUtils.clamp(wind.z * wind.strength * 0.1, -0.16, 0.16);

  return (
    <group
      ref={group}
      position={[0, 1.4, -1.2]}
      rotation={[0.12 + tiltX, 0, -0.06 + tiltZ]}
    >
      {drops.map((drop, index) => (
        <mesh key={index} position={[drop.x, drop.y, drop.z]}>
          <boxGeometry args={[0.008, profile.isMobile ? 0.42 : 0.64, 0.008]} />
          <meshStandardMaterial
            color="#cfe6f2"
            transparent
            opacity={0.18 + storm * 0.22}
            emissive="#9bbed0"
            emissiveIntensity={0.14}
          />
        </mesh>
      ))}
    </group>
  );
}

function Splash({
  storm,
  topY,
  profile,
}: {
  storm: number;
  topY: number;
  profile: SceneProfile;
}) {
  const points = useRef<THREE.Points>(null);
  const count = Math.max(16, Math.round(58 * profile.particleScale));
  const data = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 2;
      positions[index * 3 + 1] = topY + Math.random() * 0.6;
      positions[index * 3 + 2] = 0.3 + (Math.random() - 0.5) * 0.8;
      velocities[index] = 0.4 + Math.random() * 1.1;
      seeds[index] = Math.random();
    }
    return { positions, velocities, seeds };
  }, [count, topY]);

  useFrame(({ clock }) => {
    if (!points.current || profile.reducedMotion) return;
    const positions = points.current.geometry.attributes.position.array as Float32Array;
    for (let index = 0; index < count; index += 1) {
      const progress =
        (clock.elapsedTime * data.velocities[index] * (0.6 + storm * 0.6) +
          data.seeds[index] * 6) %
        2;
      positions[index * 3 + 1] = topY + progress * (0.8 + storm * 0.5);
    }
    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={data.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#eef6f3"
        size={0.045 + storm * 0.02}
        transparent
        opacity={0.46 + storm * 0.2}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

export function Waterfall({
  storm = 0,
  profile,
}: {
  storm?: number;
  profile: SceneProfile;
}) {
  const sheets = useRef<THREE.Group>(null);
  const veil = useRef<THREE.Mesh>(null);
  const layers = useMemo(
    () =>
      [
        { width: 0.94, speed: 1, opacity: 0.74, z: 0, color: "#eef6f3" },
        { width: 0.68, speed: 1.48, opacity: 0.54, z: 0.08, color: "#dff0f2" },
        { width: 0.46, speed: 2.18, opacity: 0.38, z: 0.16, color: "#ffffff" },
      ].slice(0, profile.waterfallLayers),
    [profile.waterfallLayers],
  );
  const uv = useRef<THREE.Vector2[]>(
    Array.from({ length: profile.waterfallLayers }, () => new THREE.Vector2()),
  );

  useFrame(({ clock }, delta) => {
    if (profile.reducedMotion) return;
    if (sheets.current) {
      sheets.current.children.forEach((child, index) => {
        const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (!material.map) return;
        uv.current[index].y += delta * layers[index].speed * (1 + storm * 0.6);
        material.map.offset.copy(uv.current[index]);
      });
    }
    if (veil.current) {
      const material = veil.current.material as THREE.MeshStandardMaterial;
      material.opacity =
        0.15 + Math.sin(clock.elapsedTime * 6) * 0.026 + storm * 0.16;
    }
  });

  const streakTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = profile.quality === "high" ? 96 : 48;
    canvas.height = profile.quality === "high" ? 384 : 192;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D unavailable");
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < 42; index += 1) {
      const x = Math.random() * canvas.width;
      context.strokeStyle = `rgba(255,255,255,${0.12 + Math.random() * 0.46})`;
      context.lineWidth = 0.5 + Math.random() * 1.4;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + (Math.random() - 0.5) * 7, canvas.height);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, profile.quality === "mobile" ? 1.35 : 2);
    return texture;
  }, [profile.quality]);

  const clonedTextures = useMemo(
    () =>
      layers.map(() => {
        const texture = streakTexture.clone();
        texture.needsUpdate = true;
        return texture;
      }),
    [layers, streakTexture],
  );

  const topY = 3.2;
  const fallHeight = 4.3;

  return (
    <group position={[-4.0, 0, -2.6]}>
      <group ref={sheets} position={[0, topY - fallHeight / 2, 0]}>
        {layers.map((layer, index) => (
          <mesh key={index} position={[0, 0, layer.z]}>
            <planeGeometry args={[layer.width, fallHeight]} />
            <meshStandardMaterial
              color={layer.color}
              map={clonedTextures[index]}
              transparent
              opacity={layer.opacity}
              roughness={0.16}
              metalness={profile.quality === "high" ? 0.08 : 0}
              emissive="#9bbed0"
              emissiveIntensity={0.12 + storm * 0.12}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>

      <mesh position={[0, topY + 0.1, 0.1]}>
        <boxGeometry args={[1.2, 0.12, 0.4]} />
        <meshStandardMaterial color="#292b24" roughness={0.96} />
      </mesh>
      <mesh position={[-0.6, topY + 0.2, -0.2]}>
        <boxGeometry args={[0.8, 0.4, 0.8]} />
        <meshStandardMaterial color="#1c201a" roughness={0.96} flatShading />
      </mesh>
      <mesh position={[0.7, topY + 0.15, -0.15]}>
        <boxGeometry args={[0.6, 0.35, 0.7]} />
        <meshStandardMaterial color="#23261f" roughness={0.96} flatShading />
      </mesh>

      <mesh ref={veil} position={[0.15, topY - fallHeight + 0.75, 0.18]}>
        <planeGeometry
          args={[1.6, 2.2, profile.isMobile ? 1 : 8, profile.isMobile ? 1 : 12]}
        />
        <meshStandardMaterial
          color="#e6f4f1"
          transparent
          opacity={profile.isMobile ? 0.16 : 0.2}
          depthWrite={false}
        />
      </mesh>

      <mesh
        position={[0, topY - fallHeight + 0.06, 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[1.8 + storm * 0.3, profile.isMobile ? 24 : 48]} />
        <meshStandardMaterial
          color="#cfe4e1"
          transparent
          opacity={0.3 + storm * 0.08}
          roughness={0.3}
        />
      </mesh>

      <Splash storm={storm} topY={topY - fallHeight} profile={profile} />
    </group>
  );
}

export function WaterPlane({
  active,
  storm = 0,
  night = false,
  duskTinted = false,
  profile,
}: {
  active: boolean;
  storm?: number;
  night?: boolean;
  duskTinted?: boolean;
  profile: SceneProfile;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const frame = useRef(0);
  const geometry = useMemo(
    () =>
      new THREE.PlaneGeometry(
        15,
        11,
        profile.waterSegments,
        Math.max(12, Math.round(profile.waterSegments * 0.8)),
      ),
    [profile.waterSegments],
  );
  const base = useMemo(
    () => Float32Array.from(geometry.attributes.position.array),
    [geometry],
  );
  const emissive = useMemo(
    () =>
      new THREE.Color(
        duskTinted ? "#33283a" : night ? "#12333a" : "#16343a",
      ),
    [duskTinted, night],
  );

  useFrame(({ clock }) => {
    if (!ref.current || profile.reducedMotion) return;
    frame.current += 1;
    if (profile.isMobile && frame.current % 3) return;
    const time = clock.elapsedTime;
    const positions = geometry.attributes.position.array as Float32Array;
    for (let index = 0; index < positions.length; index += 3) {
      const x = base[index];
      const y = base[index + 1];
      positions[index + 2] =
        Math.sin(x * 0.6 + time * (1.1 + storm)) *
          (0.05 + storm * 0.04) +
        Math.cos(y * 0.8 + time * 0.7) * (0.04 + storm * 0.03);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -1.12, 0]}
    >
      <meshPhysicalMaterial
        color={night ? "#050d0f" : "#071417"}
        roughness={profile.quality === "high" ? 0.12 : 0.2}
        metalness={profile.quality === "high" ? 0.3 : 0.26}
        transmission={profile.quality === "high" ? 0.04 : 0}
        clearcoat={profile.quality === "high" ? 1 : 0.2}
        clearcoatRoughness={0.12}
        transparent
        opacity={profile.isMobile ? 0.9 : 0.9}
        emissive={emissive}
        emissiveIntensity={active ? 0.15 : 0.055}
        envMapIntensity={profile.quality === "high" ? 0.72 : 0.3}
      />
    </mesh>
  );
}

export function MistParticles({
  storm = 0,
  night = false,
  windDirection = null,
  windSpeed = null,
  profile,
}: {
  storm?: number;
  night?: boolean;
  windDirection?: number | null;
  windSpeed?: number | null;
  profile: SceneProfile;
}) {
  const points = useRef<THREE.Points>(null);
  const wind = useMemo(
    () => windVector(windDirection, windSpeed),
    [windDirection, windSpeed],
  );
  const count = Math.max(36, Math.round(180 * profile.particleScale));
  const positions = useMemo(() => {
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      values[index * 3] = -6 + Math.random() * 12;
      values[index * 3 + 1] = -1 + Math.random() * 4.4;
      values[index * 3 + 2] = -4.6 + Math.random() * 7;
    }
    return values;
  }, [count]);

  useFrame(({ clock }, delta) => {
    if (!points.current || profile.reducedMotion) return;
    const time = clock.elapsedTime;
    points.current.rotation.y = Math.sin(time * 0.06) * (0.1 + storm * 0.05);
    points.current.rotation.z = THREE.MathUtils.clamp(
      -wind.x * wind.strength * 0.05,
      -0.08,
      0.08,
    );
    points.current.rotation.x = THREE.MathUtils.clamp(
      wind.z * wind.strength * 0.04,
      -0.06,
      0.06,
    );
    points.current.position.x += wind.x * wind.strength * delta * 0.18;
    points.current.position.z += wind.z * wind.strength * delta * 0.12;
    if (Math.abs(points.current.position.x) > 2.2) points.current.position.x *= 0.92;
    if (Math.abs(points.current.position.z) > 1.6) points.current.position.z *= 0.92;
    points.current.position.y =
      Math.sin(time * (0.1 + wind.strength * 0.05)) * 0.06;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={night ? "#8fb0c2" : "#c7d9dc"}
        size={profile.isMobile ? 0.065 : 0.05 + storm * 0.018}
        transparent
        opacity={0.3 + storm * 0.12}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
