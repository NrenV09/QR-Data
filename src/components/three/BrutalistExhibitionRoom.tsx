import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  CurvedShaderMonolith,
  CustomShaderMode,
  MONOLITH_SPECS,
} from './CustomShaderCards';
import { createBrutalistConcreteTextures } from './proceduralPbr';

interface BrutalistExhibitionRoomProps {
  shaderMode: CustomShaderMode;
  customGlbModel: THREE.Group | null;
}

const COLUMN_POSITIONS: Array<[number, number, number]> = [
  [-5.6, 0, 2.5],
  [5.6, 0, 2.5],
  [-5.6, 0, -2.5],
  [5.6, 0, -2.5],
  [-5.6, 0, -7.5],
  [5.6, 0, -7.5],
  [-5.6, 0, -12.5],
  [5.6, 0, -12.5],
];

export const BrutalistExhibitionRoom: React.FC<BrutalistExhibitionRoomProps> = ({
  shaderMode,
  customGlbModel,
}) => {
  const concrete = useMemo(() => createBrutalistConcreteTextures(6, 8), []);
  const wallConcrete = useMemo(() => createBrutalistConcreteTextures(4, 2), []);
  const columnsRef = useRef<THREE.InstancedMesh>(null);
  const columnCapsRef = useRef<THREE.InstancedMesh>(null);
  const prismCoreRef = useRef<THREE.Group>(null);
  const outerRingRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const dummy = new THREE.Object3D();

    if (columnsRef.current) {
      COLUMN_POSITIONS.forEach(([x, _y, z], i) => {
        dummy.position.set(x, 3.6, z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        columnsRef.current!.setMatrixAt(i, dummy.matrix);
      });
      columnsRef.current.instanceMatrix.needsUpdate = true;
      columnsRef.current.computeBoundingSphere();
    }

    if (columnCapsRef.current) {
      COLUMN_POSITIONS.forEach(([x, _y, z], i) => {
        dummy.position.set(x, 0.18, z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        columnCapsRef.current!.setMatrixAt(i, dummy.matrix);
      });
      columnCapsRef.current.instanceMatrix.needsUpdate = true;
      columnCapsRef.current.computeBoundingSphere();
    }

    return () => {
      concrete.map.dispose();
      concrete.roughnessMap.dispose();
      concrete.bumpMap.dispose();
      wallConcrete.map.dispose();
      wallConcrete.roughnessMap.dispose();
      wallConcrete.bumpMap.dispose();
    };
  }, [concrete, wallConcrete]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (prismCoreRef.current) {
      prismCoreRef.current.rotation.y = t * 0.42;
      prismCoreRef.current.position.y = 1.95 + Math.sin(t * 1.4) * 0.08;
    }
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z = -t * 0.55;
      outerRingRef.current.rotation.x = Math.sin(t * 0.5) * 0.25;
    }
  });

  const monolithPlacements: Array<{
    pos: [number, number, number];
    rot: [number, number, number];
  }> = [
    { pos: [-4.15, 2.25, -2.2], rot: [0, 0.48, 0] },
    { pos: [4.15, 2.25, -2.2], rot: [0, -0.48, 0] },
    { pos: [-3.75, 2.3, -8.4], rot: [0, 0.34, 0] },
    { pos: [3.75, 2.3, -8.4], rot: [0, -0.34, 0] },
  ];

  return (
    <group position={[0, 0, 0]}>
      {/* Ground Architectural Concrete Slab (Z: +6 to -15) */}
      <mesh position={[0, -0.1, -4.5]} receiveShadow>
        <boxGeometry args={[15, 0.2, 21]} />
        <meshStandardMaterial
          map={concrete.map}
          roughnessMap={concrete.roughnessMap}
          bumpMap={concrete.bumpMap}
          bumpScale={0.02}
          roughness={0.78}
          metalness={0.08}
        />
      </mesh>

      {/* Glossy Obsidian Gallery Runway Strip (horizontal on floor XZ plane) */}
      <mesh
        position={[0, 0.015, -4.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[2.8, 20.5]} />
        <meshPhysicalMaterial
          color="#0a0c12"
          roughness={0.22}
          metalness={0.25}
          clearcoat={0.75}
          clearcoatRoughness={0.18}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* Recessed Linear Runway Light Strips (HDR Emissive for Bloom) */}
      <mesh position={[-1.45, 0.022, -4.5]}>
        <boxGeometry args={[0.04, 0.015, 19.5]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#818cf8"
          emissiveIntensity={1.9}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[1.45, 0.022, -4.5]}>
        <boxGeometry args={[0.04, 0.015, 19.5]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#22d3ee"
          emissiveIntensity={1.9}
          toneMapped={false}
        />
      </mesh>

      {/* Coffered Brutalist Ceiling Slab + Skylight Light Ribbons */}
      <mesh position={[0, 7.2, -4.5]} receiveShadow>
        <boxGeometry args={[15, 0.45, 21]} />
        <meshStandardMaterial
          map={wallConcrete.map}
          roughnessMap={wallConcrete.roughnessMap}
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>

      {[-1.5, -5.5, -9.5].map((zPos, i) => (
        <mesh key={i} position={[0, 6.95, zPos]}>
          <boxGeometry args={[5.4, 0.06, 0.28]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#e0e7ff"
            emissiveIntensity={1.65}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Brutalist Side Monolith Walls */}
      <mesh position={[-7.2, 3.6, -4.5]} receiveShadow>
        <boxGeometry args={[0.6, 7.2, 21]} />
        <meshStandardMaterial
          map={wallConcrete.map}
          roughnessMap={wallConcrete.roughnessMap}
          bumpMap={wallConcrete.bumpMap}
          bumpScale={0.025}
          roughness={0.85}
        />
      </mesh>
      <mesh position={[7.2, 3.6, -4.5]} receiveShadow>
        <boxGeometry args={[0.6, 7.2, 21]} />
        <meshStandardMaterial
          map={wallConcrete.map}
          roughnessMap={wallConcrete.roughnessMap}
          bumpMap={wallConcrete.bumpMap}
          bumpScale={0.025}
          roughness={0.85}
        />
      </mesh>

      {/* Instanced Fluted Columns & Plinth Collars */}
      <instancedMesh
        ref={columnsRef}
        args={[undefined, undefined, COLUMN_POSITIONS.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.72, 7.2, 0.72]} />
        <meshStandardMaterial
          map={concrete.map}
          roughnessMap={concrete.roughnessMap}
          roughness={0.82}
          metalness={0.08}
        />
      </instancedMesh>

      <instancedMesh
        ref={columnCapsRef}
        args={[undefined, undefined, COLUMN_POSITIONS.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.96, 0.36, 0.96]} />
        <meshStandardMaterial color="#141720" roughness={0.5} metalness={0.45} />
      </instancedMesh>

      {/* Center Stepped Exhibition Pedestal (Z = -5.4) */}
      <group position={[0, 0, -5.4]}>
        <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.55, 1.72, 0.28, 32]} />
          <meshStandardMaterial color="#161922" roughness={0.62} metalness={0.32} />
        </mesh>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.18, 1.28, 0.28, 32]} />
          <meshStandardMaterial color="#11141d" roughness={0.38} metalness={0.72} />
        </mesh>
        <mesh position={[0, 0.57, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.16, 0.02, 12, 48]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#6366f1"
            emissiveIntensity={2.0}
            toneMapped={false}
          />
        </mesh>

        {/* Either render user's local .glb asset on pedestal OR the multi-part Optical Prism Core */}
        {customGlbModel ? (
          <group position={[0, 0.56, 0]}>
            <primitive object={customGlbModel} />
          </group>
        ) : (
          <group ref={prismCoreRef} position={[0, 1.95, 0]}>
            <mesh castShadow>
              <octahedronGeometry args={[0.62, 0]} />
              <meshPhysicalMaterial
                color="#818cf8"
                roughness={0.08}
                metalness={0.18}
                clearcoat={1}
                clearcoatRoughness={0.06}
                ior={1.6}
              />
            </mesh>
            <mesh rotation={[Math.PI / 4, Math.PI / 4, 0]}>
              <octahedronGeometry args={[0.42, 0]} />
              <meshStandardMaterial
                color="#e0f2fe"
                emissive="#22d3ee"
                emissiveIntensity={2.1}
                toneMapped={false}
              />
            </mesh>
            <mesh ref={outerRingRef}>
              <torusGeometry args={[0.98, 0.032, 16, 64]} />
              <meshStandardMaterial
                color="#cbd5e1"
                roughness={0.22}
                metalness={0.92}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.84, 0.018, 12, 48]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive="#6366f1"
                emissiveIntensity={1.6}
                toneMapped={false}
              />
            </mesh>
          </group>
        )}
      </group>

      {/* 4 Curved Project Cards using THREE-CustomShaderMaterial */}
      {MONOLITH_SPECS.map((spec, idx) => (
        <CurvedShaderMonolith
          key={spec.code}
          spec={spec}
          position={monolithPlacements[idx].pos}
          rotation={monolithPlacements[idx].rot}
          shaderMode={shaderMode}
          phaseOffset={idx * 1.4}
        />
      ))}
    </group>
  );
};
