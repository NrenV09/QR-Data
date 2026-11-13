import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { createBrushedMetalTextures } from './proceduralPbr';

const ROLLER_COUNT = 16;

export const RoboticAssemblyStage: React.FC = () => {
  const metal = useMemo(() => createBrushedMetalTextures(4, 2), []);
  const rollersRef = useRef<THREE.InstancedMesh>(null);
  const turretRef = useRef<THREE.Group>(null);
  const lowerArmRef = useRef<THREE.Group>(null);
  const forearmRef = useRef<THREE.Group>(null);
  const wristRef = useRef<THREE.Group>(null);
  const waferARef = useRef<THREE.Group>(null);
  const waferBRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    if (rollersRef.current) {
      for (let i = 0; i < ROLLER_COUNT; i++) {
        const zOffset = -17.5 - i * 0.92;
        dummy.position.set(0, 0.78, zOffset);
        dummy.rotation.set(0, 0, Math.PI / 2);
        dummy.updateMatrix();
        rollersRef.current.setMatrixAt(i, dummy.matrix);
      }
      rollersRef.current.instanceMatrix.needsUpdate = true;
      rollersRef.current.computeBoundingSphere();
    }

    return () => {
      metal.map.dispose();
      metal.roughnessMap.dispose();
      metal.bumpMap.dispose();
    };
  }, [metal]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (turretRef.current) {
      turretRef.current.rotation.y = Math.sin(t * 0.65) * 0.55 - 0.35;
    }
    if (lowerArmRef.current) {
      lowerArmRef.current.rotation.z = -0.25 + Math.sin(t * 0.9) * 0.18;
    }
    if (forearmRef.current) {
      forearmRef.current.rotation.z = 0.78 + Math.cos(t * 0.9) * 0.22;
    }
    if (wristRef.current) {
      wristRef.current.rotation.x = Math.sin(t * 1.8) * 0.25;
      wristRef.current.rotation.z = -0.45 + Math.sin(t * 0.9) * 0.12;
    }

    if (waferARef.current) {
      const zA = -17.5 - ((t * 1.45) % 14.2);
      waferARef.current.position.set(0, 0.88, zA);
    }
    if (waferBRef.current) {
      const zB = -17.5 - (((t * 1.45) + 7.1) % 14.2);
      waferBRef.current.position.set(0, 0.88, zB);
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, -0.1, -24]} receiveShadow>
        <boxGeometry args={[15, 0.2, 18]} />
        <meshStandardMaterial
          map={metal.map}
          roughnessMap={metal.roughnessMap}
          bumpMap={metal.bumpMap}
          bumpScale={0.015}
          roughness={0.68}
          metalness={0.42}
        />
      </mesh>

      {[-17, -21, -25, -29, -32].map((zPos, i) => (
        <group key={i} position={[0, 0, zPos]}>
          <mesh position={[-6.4, 3.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.45, 6.8, 0.55]} />
            <meshStandardMaterial color="#181c26" roughness={0.52} metalness={0.78} />
          </mesh>
          <mesh position={[6.4, 3.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.45, 6.8, 0.55]} />
            <meshStandardMaterial color="#181c26" roughness={0.52} metalness={0.78} />
          </mesh>
          <mesh position={[0, 6.65, 0]} castShadow>
            <boxGeometry args={[13.2, 0.36, 0.42]} />
            <meshStandardMaterial color="#151922" roughness={0.48} metalness={0.82} />
          </mesh>
          <mesh position={[0, 6.42, 0]}>
            <boxGeometry args={[4.2, 0.05, 0.14]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#06b6d4"
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      <group>
        <mesh position={[-0.78, 0.42, -24.2]} castShadow receiveShadow>
          <boxGeometry args={[0.14, 0.84, 15.0]} />
          <meshStandardMaterial color="#1e2433" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0.78, 0.42, -24.2]} castShadow receiveShadow>
          <boxGeometry args={[0.14, 0.84, 15.0]} />
          <meshStandardMaterial color="#1e2433" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[-0.86, 0.72, -24.2]}>
          <boxGeometry args={[0.02, 0.06, 14.8]} />
          <meshStandardMaterial
            color="#f59e0b"
            emissive="#f59e0b"
            emissiveIntensity={1.25}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0.86, 0.72, -24.2]}>
          <boxGeometry args={[0.02, 0.06, 14.8]} />
          <meshStandardMaterial
            color="#f59e0b"
            emissive="#f59e0b"
            emissiveIntensity={1.25}
            toneMapped={false}
          />
        </mesh>

        <instancedMesh
          ref={rollersRef}
          args={[undefined, undefined, ROLLER_COUNT]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.06, 0.06, 1.38, 16]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.22} metalness={0.92} />
        </instancedMesh>

        <group ref={waferARef} position={[0, 0.88, -20]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.05, 0.08, 1.05]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.72, 0.015, 0.72]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#22d3ee"
              emissiveIntensity={1.35}
              toneMapped={false}
            />
          </mesh>
        </group>

        <group ref={waferBRef} position={[0, 0.88, -27]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.05, 0.08, 1.05]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.72, 0.015, 0.72]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#818cf8"
              emissiveIntensity={1.35}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>

      <group position={[-2.45, 0, -23.6]}>
        <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.92, 1.05, 0.24, 24]} />
          <meshStandardMaterial color="#141820" roughness={0.62} metalness={0.78} />
        </mesh>
        <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.62, 0.74, 0.42, 24]} />
          <meshStandardMaterial color="#1c222e" roughness={0.45} metalness={0.82} />
        </mesh>

        <group ref={turretRef} position={[0, 0.65, 0]}>
          <mesh position={[0, 0.28, 0]} castShadow>
            <cylinderGeometry args={[0.56, 0.6, 0.56, 20]} />
            <meshStandardMaterial color="#ea580c" roughness={0.28} metalness={0.65} />
          </mesh>
          <mesh position={[0.42, 0.44, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.24, 0.24, 0.54, 16]} />
            <meshStandardMaterial color="#0f172a" roughness={0.42} metalness={0.88} />
          </mesh>

          <group ref={lowerArmRef} position={[0, 0.55, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.32, 0.32, 0.85, 20]} />
              <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.9} />
            </mesh>
            <mesh position={[0, 1.15, 0]} castShadow>
              <boxGeometry args={[0.46, 2.2, 0.38]} />
              <meshStandardMaterial color="#f97316" roughness={0.26} metalness={0.58} />
            </mesh>
            <mesh position={[-0.32, 1.05, 0]} rotation={[0, 0, -0.08]} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 1.85, 12]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.14} metalness={0.96} />
            </mesh>

            <group ref={forearmRef} position={[0, 2.25, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.26, 0.26, 0.72, 20]} />
                <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.88} />
              </mesh>
              <mesh position={[0, 0, 0.37]}>
                <torusGeometry args={[0.2, 0.022, 10, 32]} />
                <meshStandardMaterial
                  color="#ffffff"
                  emissive="#06b6d4"
                  emissiveIntensity={1.8}
                  toneMapped={false}
                />
              </mesh>
              <mesh position={[1.05, 0.18, 0]} rotation={[0, 0, -1.42]} castShadow>
                <boxGeometry args={[0.32, 2.15, 0.28]} />
                <meshStandardMaterial color="#f97316" roughness={0.28} metalness={0.62} />
              </mesh>

              <group ref={wristRef} position={[2.08, 0.34, 0]}>
                <mesh castShadow>
                  <sphereGeometry args={[0.22, 16, 16]} />
                  <meshStandardMaterial color="#0f172a" roughness={0.24} metalness={0.9} />
                </mesh>
                <mesh position={[0.24, -0.22, 0]} rotation={[0, 0, 0.45]} castShadow>
                  <cylinderGeometry args={[0.14, 0.18, 0.42, 16]} />
                  <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.92} />
                </mesh>
                <mesh position={[0.34, -0.4, 0]} rotation={[Math.PI / 2, 0, 0.45]}>
                  <torusGeometry args={[0.13, 0.022, 10, 24]} />
                  <meshStandardMaterial
                    color="#ffffff"
                    emissive="#22d3ee"
                    emissiveIntensity={2.3}
                    toneMapped={false}
                  />
                </mesh>
                <mesh position={[0.56, -0.96, 0]} rotation={[0, 0, 0.45]}>
                  <coneGeometry args={[0.52, 1.25, 24, 1, true]} />
                  <meshBasicMaterial
                    color="#06b6d4"
                    transparent
                    opacity={0.14}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
