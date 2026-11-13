import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import CustomShaderMaterial from 'three-custom-shader-material';
import { createMonolithCardTexture, MonolithCardSpec } from './proceduralPbr';

export type CustomShaderMode = 'ascii' | 'hologram' | 'wire';

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uCurvature;
  uniform float uHover;
  varying vec2 vCustomUv;

  void main() {
    vCustomUv = uv;
    vec3 pos = position;

    // Parabolic exhibition card curvature along horizontal axis
    float dx = (uv.x - 0.5) * 2.0;
    pos.z -= dx * dx * uCurvature;

    // Subtle organic wave ripple driven by pointer hover & time
    float ripple = sin(uv.y * 7.0 + uTime * 2.4) * cos(uv.x * 5.0 - uTime * 1.6);
    pos.z += ripple * (0.015 + uHover * 0.045);

    csm_Position = pos;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uMode; // 0.0 = ascii, 1.0 = hologram, 2.0 = wire
  uniform vec3 uAccent;
  varying vec2 vCustomUv;

  float asciiGlyph(vec2 cellUv, float luma) {
    vec2 p = abs(cellUv - 0.5);
    float ring = max(p.x, p.y);
    float crossMask = min(p.x, p.y);
    float diag = abs(p.x - p.y);

    if (luma > 0.72) {
      return step(ring, 0.36) * (1.0 - step(ring, 0.14));
    } else if (luma > 0.45) {
      return step(crossMask, 0.12) * step(ring, 0.38);
    } else if (luma > 0.22) {
      return step(diag, 0.1) * step(ring, 0.32);
    }
    return step(length(p), 0.12);
  }

  void main() {
    vec4 baseTex = csm_DiffuseColor;
    float luma = dot(baseTex.rgb, vec3(0.299, 0.587, 0.114));

    // Glowing crisp white border reticle
    vec2 borderDist = min(vCustomUv, 1.0 - vCustomUv);
    float edgeDist = min(borderDist.x, borderDist.y);
    float whiteEdge = 1.0 - smoothstep(0.0, 0.018, edgeDist);

    // Sweeping vertical optical calibration beam
    float scanPos = fract(uTime * 0.28);
    float scanLine = exp(-abs(vCustomUv.y - scanPos) * 42.0);

    vec3 outColor = baseTex.rgb;
    vec3 outEmissive = vec3(0.0);

    if (uMode < 0.5) {
      // ASCII / Halftone Quantized Shader Mode with glowing white ASCII edges
      vec2 gridCount = vec2(42.0, 52.0);
      vec2 cellUv = fract(vCustomUv * gridCount);
      float glyph = asciiGlyph(cellUv, clamp(luma * 1.45, 0.0, 1.0));

      float asciiMask = smoothstep(0.25, 0.9, luma);
      vec3 glyphColor = mix(uAccent * 0.85, vec3(1.0), asciiMask);

      outColor = mix(baseTex.rgb * 0.65, glyphColor, glyph * 0.55);
      // High-HDR white ASCII highlights for Bloom pass
      outEmissive =
        vec3(1.45) * whiteEdge * (0.65 + 0.35 * uHover) +
        glyphColor * glyph * (0.28 + scanLine * 0.85 + uHover * 0.35) +
        uAccent * scanLine * 0.65;
    } else if (uMode < 1.5) {
      // Holographic phase-interference mode
      float stripes = sin(vCustomUv.y * 140.0 + uTime * 5.0) * 0.5 + 0.5;
      vec3 holoTint = mix(uAccent, vec3(0.0, 0.9, 1.0), stripes);
      outColor = mix(baseTex.rgb, holoTint, 0.25);
      outEmissive =
        holoTint * (0.35 + scanLine * 0.95 + stripes * 0.18) +
        vec3(1.35) * whiteEdge;
    } else {
      // Precision Wireframe Lattice Mode
      vec2 grid = abs(fract(vCustomUv * vec2(18.0, 22.0) - 0.5) - 0.5) / fwidth(vCustomUv * vec2(18.0, 22.0));
      float line = 1.0 - min(min(grid.x, grid.y), 1.0);
      outColor = mix(baseTex.rgb * 0.35, uAccent, line * 0.75);
      outEmissive = uAccent * line * 0.95 + vec3(1.4) * whiteEdge;
    }

    csm_DiffuseColor = vec4(outColor, 1.0);
    csm_Emissive = outEmissive;
  }
`;

export const MONOLITH_SPECS: MonolithCardSpec[] = [
  {
    code: 'NODE 01',
    title: 'Gzip L9 Stream',
    subtitle: 'Air-gapped deflate packetizer',
    metric: '-78% PAYLOAD',
    accentHex: '#6366F1',
  },
  {
    code: 'NODE 02',
    title: '60Hz ROI Optics',
    subtitle: 'Hardware BarcodeDetector',
    metric: '1.8 MS / FRAME',
    accentHex: '#06B6D4',
  },
  {
    code: 'NODE 03',
    title: 'Stop-Wait ARQ',
    subtitle: 'CRC32 verified ACK/NACK',
    metric: 'ZERO BIT LOSS',
    accentHex: '#10B981',
  },
  {
    code: 'NODE 04',
    title: 'Single-File HTML',
    subtitle: 'Offline self-contained bundle',
    metric: '0 KB NETWORK',
    accentHex: '#F43F5E',
  },
];

interface CurvedShaderMonolithProps {
  spec: MonolithCardSpec;
  position: [number, number, number];
  rotation: [number, number, number];
  shaderMode: CustomShaderMode;
  phaseOffset?: number;
}

export const CurvedShaderMonolith: React.FC<CurvedShaderMonolithProps> = ({
  spec,
  position,
  rotation,
  shaderMode,
  phaseOffset = 0,
}) => {
  const matRef = useRef<THREE.Material & { uniforms?: Record<string, THREE.IUniform> }>(null);
  const groupRef = useRef<THREE.Group>(null);
  const hoverTargetRef = useRef(0);

  const texture = useMemo(() => createMonolithCardTexture(spec), [spec]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCurvature: { value: 0.32 },
      uHover: { value: 0 },
      uMode: { value: 0 },
      uAccent: { value: new THREE.Color(spec.accentHex) },
    }),
    [spec.accentHex]
  );

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();

    if (matRef.current?.uniforms) {
      matRef.current.uniforms.uTime.value = t + phaseOffset;
      matRef.current.uniforms.uHover.value = THREE.MathUtils.damp(
        matRef.current.uniforms.uHover.value,
        hoverTargetRef.current,
        8,
        dt
      );
      matRef.current.uniforms.uMode.value =
        shaderMode === 'ascii' ? 0 : shaderMode === 'hologram' ? 1 : 2;
    }

    if (groupRef.current) {
      groupRef.current.position.y =
        position[1] + Math.sin(t * 1.15 + phaseOffset) * 0.06;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      onPointerOver={(e) => {
        e.stopPropagation();
        hoverTargetRef.current = 1;
      }}
      onPointerOut={() => {
        hoverTargetRef.current = 0;
      }}
    >
      <mesh castShadow receiveShadow>
        <planeGeometry args={[1.95, 2.55, 48, 48]} />
        <CustomShaderMaterial
          ref={matRef as never}
          baseMaterial={THREE.MeshStandardMaterial}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          uniforms={uniforms}
          map={texture}
          roughness={0.28}
          metalness={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh position={[0, -1.42, -0.14]} castShadow>
        <boxGeometry args={[1.65, 0.14, 0.24]} />
        <meshStandardMaterial color="#11131a" roughness={0.35} metalness={0.85} />
      </mesh>
    </group>
  );
};
