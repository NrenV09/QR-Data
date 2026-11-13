import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  createBrutalistConcreteTextures,
  createNeonSignTexture,
  createWetAsphaltTextures,
} from './proceduralPbr';

const RIB_COUNT = 12;

export const CyberpunkAlleyCorridor: React.FC = () => {
  const asphalt = useMemo(() => createWetAsphaltTextures(4, 9), []);
  const wallTex = useMemo(() => createBrutalistConcreteTextures(6, 3), []);
  const signLeftTex = useMemo(
    () => createNeonSignTexture('ARQ-09', 'OPTIC RELAY', '#ff1f4c'),
    []
  );
  const signRightTex = useMemo(
    () => createNeonSignTexture('60HZ', 'AIRGAP NODE', '#22d3ee'),
    []
  );

  const leftRibsRef = useRef<THREE.InstancedMesh>(null);
  const rightRibsRef = useRef<THREE.InstancedMesh>(null);
  const portalInnerRef = useRef<THREE.Mesh>(null);
  const portalOuterRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    if (leftRibsRef.current && rightRibsRef.current) {
      for (let i = 0; i < RIB_COUNT; i++) {
        const z = -34.2 - i * 2.0;
        dummy.position.set(-4.35, 3.3, z);
        dummy.updateMatrix();
        leftRibsRef.current.setMatrixAt(i, dummy.matrix);

        dummy.position.set(4.35, 3.3, z);
        dummy.updateMatrix();
        rightRibsRef.current.setMatrixAt(i, dummy.matrix);
      }
      leftRibsRef.current.instanceMatrix.needsUpdate = true;
      leftRibsRef.current.computeBoundingSphere();
      rightRibsRef.current.instanceMatrix.needsUpdate = true;
      rightRibsRef.current.computeBoundingSphere();
    }

    return () => {
      asphalt.map.dispose();
      asphalt.roughnessMap.dispose();
      asphalt.bumpMap.dispose();
      wallTex.map.dispose();
      wallTex.roughnessMap.dispose();
      wallTex.bumpMap.dispose();
      signLeftTex.dispose();
      signRightTex.dispose();
    };
  }, [asphalt, wallTex, signLeftTex, signRightTex]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (portalInnerRef.current) {
      portalInnerRef.current.rotation.z = t * 0.65;
    }
    if (portalOuterRef.current) {
      portalOuterRef.current.rotation.z = -t * 0.35;
    }
  });

  const alleySegments = [-36, -40, -44, -48, -52];

  return (
    <group position={[0, 0, 0]}>
      {/* Wet Asphalt Reflective Alley Surface (Z: -33 to -59) */}
      <mesh position={[0, -0.1, -46]} receiveShadow>
        <boxGeometry args={[11, 0.2, 26]} />
        <meshPhysicalMaterial
          map={asphalt.map}
          roughnessMap={asphalt.roughnessMap}
          bumpMap={asphalt.bumpMap}
          bumpScale={0.025}
          roughness={0.55}
          metalness={0.32}
          clearcoat={0.9}
          clearcoatRoughness={0.14}
        />
      </mesh>

      {/* Modular Industrial Alley Side Walls */}
      <mesh position={[-4.8, 3.4, -46]} receiveShadow>
        <boxGeometry args={[0.8, 6.8, 26]} />
        <meshStandardMaterial
          map={wallTex.map}
          roughnessMap={wallTex.roughnessMap}
          bumpMap={wallTex.bumpMap}
          bumpScale={0.03}
          roughness={0.82}
          metalness={0.18}
        />
      </mesh>
      <mesh position={[4.8, 3.4, -46]} receiveShadow>
        <boxGeometry args={[0.8, 6.8, 26]} />
        <meshStandardMaterial
          map={wallTex.map}
          roughnessMap={wallTex.roughnessMap}
          bumpMap={wallTex.bumpMap}
          bumpScale={0.03}
          roughness={0.82}
          metalness={0.18}
        />
      </mesh>

      {/* Alley Side Concrete Curbs & Cable Channels */}
      <mesh position={[-3.95, 0.16, -46]} castShadow receiveShadow>
        <boxGeometry args={[0.85, 0.32, 25.5]} />
        <meshStandardMaterial color="#131620" roughness={0.75} metalness={0.25} />
      </mesh>
      <mesh position={[3.95, 0.16, -46]} castShadow receiveShadow>
        <boxGeometry args={[0.85, 0.32, 25.5]} />
        <meshStandardMaterial color="#131620" roughness={0.75} metalness={0.25} />
      </mesh>

      {/* Instanced Structural Steel Alley Ribs */}
      <instancedMesh
        ref={leftRibsRef}
        args={[undefined, undefined, RIB_COUNT]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.32, 6.6, 0.38]} />
        <meshStandardMaterial color="#171b26" roughness={0.45} metalness={0.8} />
      </instancedMesh>
      <instancedMesh
        ref={rightRibsRef}
        args={[undefined, undefined, RIB_COUNT]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.32, 6.6, 0.38]} />
        <meshStandardMaterial color="#171b26" roughness={0.45} metalness={0.8} />
      </instancedMesh>

      {alleySegments.map((zPos, idx) => {
        const isCrimson = idx % 2 === 0;
        const glowColor = isCrimson ? '#ff1f4c' : '#22d3ee';
        return (
          <group key={zPos} position={[0, 0, zPos]}>
            <mesh position={[0, 6.1, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.14, 0.14, 9.0, 12]} />
              <meshStandardMaterial color="#1f2937" roughness={0.38} metalness={0.86} />
            </mesh>

            <mesh position={[0, 5.88, 0]}>
              <boxGeometry args={[3.4, 0.08, 0.12]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive={glowColor}
                emissiveIntensity={2.45}
                toneMapped={false}
              />
            </mesh>

            <mesh position={[-4.22, 2.5, 0]}>
              <boxGeometry args={[0.07, 2.4, 0.09]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive="#ff1f4c"
                emissiveIntensity={2.35}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[4.22, 2.5, 0]}>
              <boxGeometry args={[0.07, 2.4, 0.09]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive={idx % 2 === 0 ? '#22d3ee' : '#ff1f4c'}
                emissiveIntensity={2.15}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}

      {/* Hanging Glowing Holographic Signage Blades */}
      <mesh position={[-3.45, 3.25, -39.2]} rotation={[0, 0.22, 0]}>
        <boxGeometry args={[0.08, 2.4, 1.2]} />
        <meshStandardMaterial
          map={signLeftTex}
          emissive="#ff1f4c"
          emissiveMap={signLeftTex}
          emissiveIntensity={1.65}
          roughness={0.25}
          metalness={0.5}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[3.45, 3.35, -45.2]} rotation={[0, -0.22, 0]}>
        <boxGeometry args={[0.08, 2.4, 1.2]} />
        <meshStandardMaterial
          map={signRightTex}
          emissive="#22d3ee"
          emissiveMap={signRightTex}
          emissiveIntensity={1.55}
          roughness={0.25}
          metalness={0.5}
          toneMapped={false}
        />
      </mesh>

      {/* Alley End Optical Iris Portal (Z = -56.5) */}
      <group position={[0, 2.5, -56.5]}>
        <mesh ref={portalOuterRef}>
          <torusGeometry args={[2.15, 0.12, 16, 48]} />
          <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.9} />
        </mesh>
        <mesh ref={portalInnerRef}>
          <torusGeometry args={[1.65, 0.05, 12, 6]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ff1f4c"
            emissiveIntensity={2.6}
            toneMapped={false}
          />
        </mesh>
        <mesh>
          <torusGeometry args={[1.15, 0.035, 12, 48]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#22d3ee"
            emissiveIntensity={2.2}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
};
