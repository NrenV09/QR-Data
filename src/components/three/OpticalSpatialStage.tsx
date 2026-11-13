import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
} from '@react-three/postprocessing';
import { Fluid } from '@whatisjery/react-fluid-distortion';
import { BrutalistExhibitionRoom } from './BrutalistExhibitionRoom';
import { RoboticAssemblyStage } from './RoboticAssemblyStage';
import { CyberpunkAlleyCorridor } from './CyberpunkAlleyCorridor';
import { CustomShaderMode } from './CustomShaderCards';
import { CameraSplineRig, SpatialChamberFocus } from './CameraSplineRig';
import { detectSoftwareWebGL } from './proceduralPbr';

interface OpticalSpatialStageProps {
  scrollProgressRef: React.MutableRefObject<number>;
  chamberFocus: SpatialChamberFocus;
  shaderMode: CustomShaderMode;
  fluidEnabled: boolean;
  rainbowFluid: boolean;
  customGlbModel: THREE.Group | null;
  isLightMode?: boolean;
}

class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const PARTICLE_COUNT = 140;

const OpticalDustField: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo(() => {
    const arr: Array<{
      x: number;
      y: number;
      z: number;
      speed: number;
      scale: number;
      phase: number;
    }> = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr.push({
        x: Math.sin(i * 73.13) * 0.5 * 11,
        y: 0.4 + ((i * 19.7) % 5.6),
        z: 3 - (i / PARTICLE_COUNT) * 58,
        speed: 0.35 + ((i * 7.3) % 0.8),
        scale: 0.022 + ((i * 3.1) % 0.032),
        phase: i * 0.7,
      });
    }
    return arr;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (meshRef.current) {
      particles.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
      meshRef.current.computeBoundingSphere();
      meshRef.current.frustumCulled = false;
    }
  }, [particles, dummy]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      dummy.position.set(
        p.x + Math.sin(t * p.speed + p.phase) * 0.25,
        p.y + Math.cos(t * p.speed * 0.8 + p.phase) * 0.22,
        p.z
      );
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color="#ffffff"
        emissive="#818cf8"
        emissiveIntensity={1.6}
        toneMapped={false}
      />
    </instancedMesh>
  );
};

const _cursorWorld = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();

const CursorOpticalBeacon: React.FC<{
  pointerNdcRef: React.MutableRefObject<{ x: number; y: number }>;
}> = ({ pointerNdcRef }) => {
  const { camera } = useThree();
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((_state, delta) => {
    if (!lightRef.current) return;
    const dt = Math.min(delta, 0.05);
    camera.getWorldDirection(_camDir);
    _camRight.crossVectors(_camDir, camera.up).normalize();
    _camUp.crossVectors(_camRight, _camDir).normalize();

    _cursorWorld
      .copy(camera.position)
      .addScaledVector(_camDir, 4.4)
      .addScaledVector(_camRight, pointerNdcRef.current.x * 3.1)
      .addScaledVector(_camUp, pointerNdcRef.current.y * 1.9);

    lightRef.current.position.x = THREE.MathUtils.damp(
      lightRef.current.position.x,
      _cursorWorld.x,
      12,
      dt
    );
    lightRef.current.position.y = THREE.MathUtils.damp(
      lightRef.current.position.y,
      _cursorWorld.y,
      12,
      dt
    );
    lightRef.current.position.z = THREE.MathUtils.damp(
      lightRef.current.position.z,
      _cursorWorld.z,
      12,
      dt
    );
  });

  return (
    <pointLight
      ref={lightRef}
      color="#22d3ee"
      intensity={5.5}
      distance={9}
      decay={2}
    />
  );
};

export const OpticalSpatialStage: React.FC<OpticalSpatialStageProps> = ({
  scrollProgressRef,
  chamberFocus,
  shaderMode,
  fluidEnabled,
  rainbowFluid,
  customGlbModel,
  isLightMode = false,
}) => {
  const pointerNdcRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);
  const [eventTarget, setEventTarget] = useState<HTMLElement | undefined>(
    undefined
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setEventTarget(document.body);
    }

    const onPointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      const ny = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
      pointerNdcRef.current.x = nx;
      pointerNdcRef.current.y = ny;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-0 pointer-events-none transition-opacity duration-500 ${
        isLightMode ? 'opacity-25' : 'opacity-100'
      }`}
    >
      <CanvasErrorBoundary>
        <Canvas
          shadows={!isSoftwareGl}
          dpr={isSoftwareGl ? 1 : [1, 2]}
          camera={{ position: [1.15, 2.35, 3.6], fov: 46, near: 0.1, far: 110 }}
          eventSource={eventTarget}
          eventPrefix="client"
          gl={{
            antialias: !isSoftwareGl,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
        >
          <color attach="background" args={['#050507']} />
          <fogExp2 attach="fog" args={['#050507', 0.036]} />

          {/* Procedural Offline Studio Environment (zero external HDR URLs) */}
          <Environment resolution={256} frames={1}>
            <group rotation={[-Math.PI / 3, 0, 1]}>
              <Lightformer
                form="rect"
                intensity={2.4}
                color="#e0e7ff"
                scale={[10, 4, 1]}
                position={[0, 6, -4]}
              />
              <Lightformer
                form="rect"
                intensity={2.0}
                color="#22d3ee"
                scale={[8, 2, 1]}
                position={[-6, 2, -2]}
                rotation={[0, Math.PI / 2, 0]}
              />
              <Lightformer
                form="rect"
                intensity={1.8}
                color="#ff1f4c"
                scale={[8, 2, 1]}
                position={[6, 2, -10]}
                rotation={[0, -Math.PI / 2, 0]}
              />
            </group>
          </Environment>

          <hemisphereLight args={['#a5b4fc', '#0b0c12', 0.55]} />
          <directionalLight
            position={[6, 12, 6]}
            intensity={1.45}
            color="#f8fafc"
            castShadow={!isSoftwareGl}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-near={1}
            shadow-camera-far={45}
            shadow-camera-left={-12}
            shadow-camera-right={12}
            shadow-camera-top={12}
            shadow-camera-bottom={-12}
            shadow-bias={-0.0005}
          />

          <pointLight position={[0, 4.2, -5.4]} color="#818cf8" intensity={14} distance={18} decay={2} />
          <pointLight position={[-1.5, 4.0, -23.5]} color="#06b6d4" intensity={16} distance={18} decay={2} />
          <pointLight position={[1.2, 3.6, -24.0]} color="#f97316" intensity={10} distance={15} decay={2} />
          <pointLight position={[0, 3.8, -39.5]} color="#ff1f4c" intensity={20} distance={20} decay={2} />
          <pointLight position={[0, 3.4, -49.5]} color="#22d3ee" intensity={18} distance={20} decay={2} />

          <CursorOpticalBeacon pointerNdcRef={pointerNdcRef} />
          <CameraSplineRig
            scrollProgressRef={scrollProgressRef}
            chamberFocus={chamberFocus}
            pointerNdcRef={pointerNdcRef}
          />

          <BrutalistExhibitionRoom
            shaderMode={shaderMode}
            customGlbModel={customGlbModel}
          />
          <RoboticAssemblyStage />
          <CyberpunkAlleyCorridor />
          <OpticalDustField />

          {/* Post-Processing Stack on GPU: Navier-Stokes Fluid + Bloom + ChromaticAberration + Noise */}
          {!isSoftwareGl && (
            <EffectComposer multisampling={0}>
              <Fluid
                blend={fluidEnabled ? 4.8 : 0}
                intensity={fluidEnabled ? 1.85 : 0}
                distortion={fluidEnabled ? 0.44 : 0}
                force={1.25}
                radius={0.28}
                curl={2.2}
                swirl={5}
                pressure={0.82}
                densityDissipation={0.96}
                velocityDissipation={0.99}
                fluidColor="#4f46e5"
                backgroundColor="#050507"
                showBackground={false}
                rainbow={rainbowFluid}
              />
              <Bloom
                mipmapBlur
                luminanceThreshold={0.88}
                luminanceSmoothing={0.24}
                intensity={1.15}
              />
              <ChromaticAberration
                offset={[0.00065, 0.00065]}
                radialModulation
                modulationOffset={0.42}
              />
              <Noise opacity={0.032} />
            </EffectComposer>
          )}
        </Canvas>
      </CanvasErrorBoundary>
    </div>
  );
};
