import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneQuality } from "@/scene/renderProfile";

type Materials = {
  concrete: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  stoneDark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  railGlass: THREE.MeshPhysicalMaterial;
  water: THREE.MeshPhysicalMaterial;
  warm: THREE.MeshStandardMaterial;
  moss: THREE.MeshStandardMaterial;
};

function useVillaMaterials(quality: SceneQuality) {
  const materials = useMemo<Materials>(() => {
    const high = quality === "high";
    return {
      concrete: new THREE.MeshStandardMaterial({
        color: high ? "#b9bcb1" : "#858a81",
        roughness: high ? 0.68 : 0.82,
        metalness: 0.03,
      }),
      stone: new THREE.MeshStandardMaterial({
        color: high ? "#55584f" : "#454942",
        roughness: 0.92,
        flatShading: true,
      }),
      stoneDark: new THREE.MeshStandardMaterial({
        color: "#30352f",
        roughness: 0.96,
        flatShading: true,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: "#111612",
        roughness: high ? 0.25 : 0.42,
        metalness: high ? 0.82 : 0.55,
      }),
      wood: new THREE.MeshStandardMaterial({
        color: high ? "#7e6040" : "#5f4e39",
        roughness: 0.56,
        metalness: 0.04,
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: quality === "mobile" ? "#6f8990" : "#b9d8df",
        roughness: high ? 0.035 : 0.18,
        metalness: 0,
        transmission: high ? 0.82 : quality === "balanced" ? 0.4 : 0,
        thickness: high ? 0.48 : 0.15,
        transparent: true,
        opacity: high ? 0.28 : quality === "balanced" ? 0.4 : 0.58,
        envMapIntensity: high ? 1.35 : 0.55,
        ior: 1.36,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      railGlass: new THREE.MeshPhysicalMaterial({
        color: "#a8c5c9",
        roughness: 0.08,
        transparent: true,
        opacity: high ? 0.26 : 0.34,
        transmission: high ? 0.35 : 0,
        thickness: 0.08,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      water: new THREE.MeshPhysicalMaterial({
        color: "#17383b",
        roughness: high ? 0.08 : 0.2,
        metalness: high ? 0.22 : 0.08,
        transmission: high ? 0.18 : 0,
        transparent: true,
        opacity: 0.82,
        clearcoat: high ? 1 : 0.4,
        clearcoatRoughness: 0.08,
        envMapIntensity: high ? 1.15 : 0.35,
      }),
      warm: new THREE.MeshStandardMaterial({
        color: "#efc987",
        emissive: "#e6aa58",
        emissiveIntensity: high ? 2.25 : 1.35,
        toneMapped: false,
        roughness: 0.55,
      }),
      moss: new THREE.MeshStandardMaterial({
        color: "#405540",
        roughness: 0.96,
        flatShading: true,
      }),
    };
  }, [quality]);

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );
  return materials;
}

function ShadowGroup({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!enabled || !groupRef.current) return;
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [enabled]);
  return <group ref={groupRef}>{children}</group>;
}

function BoxPart({
  position,
  size,
  material,
  rotation,
}: {
  position: [number, number, number];
  size: [number, number, number];
  material: THREE.Material;
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function Mullions({
  count,
  width,
  height,
  position,
  material,
  rotation,
}: {
  count: number;
  width: number;
  height: number;
  position: [number, number, number];
  material: THREE.Material;
  rotation?: [number, number, number];
}) {
  const step = count > 1 ? width / (count - 1) : width;
  return (
    <group position={position} rotation={rotation}>
      {Array.from({ length: count }).map((_, index) => (
        <BoxPart
          key={index}
          position={[-width / 2 + index * step, 0, 0]}
          size={[0.018, height, 0.026]}
          material={material}
        />
      ))}
      <BoxPart
        position={[0, height / 2, 0]}
        size={[width, 0.022, 0.028]}
        material={material}
      />
      <BoxPart
        position={[0, -height / 2, 0]}
        size={[width, 0.022, 0.028]}
        material={material}
      />
    </group>
  );
}

function StoneCourses({
  quality,
  materials,
}: {
  quality: SceneQuality;
  materials: Materials;
}) {
  const count = quality === "high" ? 15 : quality === "balanced" ? 9 : 0;
  if (!count) return null;
  return (
    <group position={[-1.62, 0.5, -0.18]}>
      {Array.from({ length: count }).map((_, index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        return (
          <BoxPart
            key={index}
            position={[
              column * 0.25 + (row % 2) * 0.08,
              row * 0.24,
              0.98 + (index % 2) * 0.015,
            ]}
            size={[0.23, 0.21, 0.045]}
            rotation={[0, 0, (index % 3 - 1) * 0.012]}
            material={index % 4 === 0 ? materials.stoneDark : materials.stone}
          />
        );
      })}
    </group>
  );
}

function GlassRailing({
  quality,
  materials,
}: {
  quality: SceneQuality;
  materials: Materials;
}) {
  const posts = quality === "mobile" ? 4 : 8;
  return (
    <group position={[0.25, 1.02, 1.27]}>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[3.15, 0.54, 0.018]} />
        <primitive object={materials.railGlass} attach="material" />
      </mesh>
      {Array.from({ length: posts }).map((_, index) => (
        <BoxPart
          key={index}
          position={[-1.5 + (index / Math.max(1, posts - 1)) * 3, 0.31, 0]}
          size={[0.022, 0.58, 0.025]}
          material={materials.metal}
        />
      ))}
      <BoxPart position={[0, 0.6, 0]} size={[3.16, 0.024, 0.035]} material={materials.metal} />
    </group>
  );
}

function InteriorFurniture({
  quality,
  materials,
}: {
  quality: SceneQuality;
  materials: Materials;
}) {
  if (quality === "mobile") return null;
  return (
    <group position={[0.34, 0.18, -0.04]}>
      <BoxPart position={[-0.52, 0.16, -0.1]} size={[0.7, 0.18, 0.35]} material={materials.wood} />
      <BoxPart position={[-0.52, 0.34, -0.21]} size={[0.7, 0.22, 0.1]} material={materials.wood} />
      <BoxPart position={[0.48, 0.24, 0.04]} size={[0.78, 0.08, 0.28]} material={materials.wood} />
      <BoxPart position={[0.48, 0.1, 0.04]} size={[0.04, 0.28, 0.22]} material={materials.metal} />
      <mesh position={[-0.12, 0.22, -0.02]}>
        <cylinderGeometry args={[0.12, 0.16, 0.3, 10]} />
        <primitive object={materials.stoneDark} attach="material" />
      </mesh>
    </group>
  );
}

function Tree({
  position,
  quality,
  materials,
}: {
  position: [number, number, number];
  quality: SceneQuality;
  materials: Materials;
}) {
  const detail = quality === "high" ? 2 : 1;
  return (
    <group position={position}>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.035, 0.055, 0.7, 7]} />
        <primitive object={materials.wood} attach="material" />
      </mesh>
      {Array.from({ length: detail + 1 }).map((_, index) => (
        <mesh
          key={index}
          position={[index === 0 ? 0 : index % 2 ? 0.16 : -0.12, 0.77 + index * 0.13, index % 2 ? -0.06 : 0.05]}
        >
          <icosahedronGeometry args={[0.29 - index * 0.035, 1]} />
          <primitive object={index === 2 ? materials.stone : materials.moss} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

export default function VillaModel({
  active,
  quality,
}: {
  active: boolean;
  quality: SceneQuality;
}) {
  const materials = useVillaMaterials(quality);
  const warmMaterial = materials.warm;
  const interiorLight = useRef<THREE.PointLight>(null);
  const upperLight = useRef<THREE.PointLight>(null);
  const high = quality === "high";
  const balanced = quality === "balanced";

  useFrame(({ clock }) => {
    const flicker =
      0.94 +
      Math.sin(clock.elapsedTime * 1.7) * 0.035 +
      Math.sin(clock.elapsedTime * 4.1) * 0.018;
    warmMaterial.emissiveIntensity = (active ? 2.45 : 1.85) * flicker;
    if (interiorLight.current) {
      interiorLight.current.intensity = (active ? 4.2 : 2.8) * flicker;
    }
    if (upperLight.current) {
      upperLight.current.intensity = (active ? 2.5 : 1.7) * flicker;
    }
  });

  return (
    <group position={[1.9, -0.45, -1.1]} rotation={[0, -0.32, 0]}>
      <ShadowGroup enabled={high}>
        <BoxPart position={[0.08, -0.18, 0.06]} size={[4.75, 0.24, 2.72]} material={materials.stoneDark} />
        <BoxPart position={[0.15, -0.02, 0.08]} size={[4.2, 0.13, 2.35]} material={materials.concrete} />

        <BoxPart position={[-1.68, 0.5, -0.2]} size={[0.78, 2.0, 2.16]} material={materials.stone} />
        <StoneCourses quality={quality} materials={materials} />
        <BoxPart position={[-1.24, 0.48, 0.86]} size={[0.055, 1.02, 1.7]} material={materials.stoneDark} />

        <BoxPart position={[0.34, 0.07, 0.14]} size={[3.48, 0.15, 1.94]} material={materials.concrete} />
        <mesh position={[0.38, 0.53, 0.08]}>
          <boxGeometry args={[2.86, 0.92, 1.62]} />
          <primitive object={materials.glass} attach="material" />
        </mesh>
        <Mullions
          count={quality === "high" ? 11 : quality === "balanced" ? 8 : 5}
          width={2.86}
          height={0.92}
          position={[0.38, 0.53, 0.9]}
          material={materials.metal}
        />
        {quality !== "mobile" && (
          <Mullions
            count={quality === "high" ? 7 : 5}
            width={1.55}
            height={0.92}
            position={[1.82, 0.53, 0.08]}
            rotation={[0, Math.PI / 2, 0]}
            material={materials.metal}
          />
        )}

        <BoxPart position={[0.46, 0.53, -0.58]} size={[1.5, 0.63, 0.035]} material={materials.warm} />
        <InteriorFurniture quality={quality} materials={materials} />

        <BoxPart position={[0.05, 1.1, 0.03]} size={[3.38, 0.14, 1.92]} material={materials.concrete} />
        <mesh position={[-0.18, 1.48, -0.01]}>
          <boxGeometry args={[2.34, 0.66, 1.4]} />
          <primitive object={materials.glass} attach="material" />
        </mesh>
        <Mullions
          count={quality === "high" ? 9 : quality === "mobile" ? 4 : 6}
          width={2.34}
          height={0.66}
          position={[-0.18, 1.48, 0.71]}
          material={materials.metal}
        />
        <BoxPart position={[-0.04, 1.48, -0.49]} size={[1.16, 0.42, 0.034]} material={materials.warm} />

        <BoxPart position={[0.08, 1.86, 0.02]} size={[2.68, 0.12, 1.62]} material={materials.metal} />
        <BoxPart position={[0.08, 1.78, 0.78]} size={[2.72, 0.18, 0.06]} material={materials.metal} />

        <BoxPart position={[0.26, 1.03, 0.9]} size={[3.28, 0.075, 0.62]} material={materials.wood} />
        <GlassRailing quality={quality} materials={materials} />

        {[1.45, 0.75, 0].map((x, index) => (
          <BoxPart
            key={x}
            position={[x, -0.16 - index * 0.1, 1.22 + index * 0.13]}
            size={[0.68, 0.12, 0.42]}
            material={materials.concrete}
          />
        ))}

        <group position={[2.32, -0.16, 0.2]}>
          <BoxPart position={[0, 0, 0]} size={[1.06, 0.12, 1.72]} material={materials.stoneDark} />
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.9, 1.55]} />
            <primitive object={materials.water} attach="material" />
          </mesh>
          <BoxPart position={[-0.5, 0.2, 0]} size={[0.04, 0.24, 1.72]} material={materials.stone} />
        </group>

        {(high || balanced) && (
          <>
            <Tree position={[-1.98, -0.03, 1.02]} quality={quality} materials={materials} />
            <Tree position={[2.7, -0.07, 1.2]} quality="mobile" materials={materials} />
          </>
        )}

        {quality !== "mobile" &&
          [-0.8, 0.18, 1.06].map((x) => (
            <mesh key={x} position={[x, 1.04, 0.83]}>
              <sphereGeometry args={[0.035, 10, 8]} />
              <primitive object={materials.warm} attach="material" />
            </mesh>
          ))}
      </ShadowGroup>

      <pointLight
        ref={interiorLight}
        position={[0.46, 0.55, 0.12]}
        color="#f0b86e"
        intensity={2.8}
        distance={5.6}
        decay={2}
        castShadow={false}
      />
      <pointLight
        ref={upperLight}
        position={[-0.1, 1.48, 0.18]}
        color="#efbf7e"
        intensity={1.7}
        distance={4.2}
        decay={2}
      />
    </group>
  );
}
