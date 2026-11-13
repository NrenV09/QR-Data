import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export type SpatialChamberFocus = 'AUTO' | 'BRUTALIST' | 'ROBOTIC' | 'CYBERPUNK';

interface CameraSplineRigProps {
  scrollProgressRef: React.MutableRefObject<number>;
  chamberFocus: SpatialChamberFocus;
  pointerNdcRef: React.MutableRefObject<{ x: number; y: number }>;
}

const _camTarget = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _smoothedLook = new THREE.Vector3(0, 2.0, -6);

const CHAMBER_T_TARGETS: Record<Exclude<SpatialChamberFocus, 'AUTO'>, number> = {
  BRUTALIST: 0.14,
  ROBOTIC: 0.52,
  CYBERPUNK: 0.9,
};

export const CameraSplineRig: React.FC<CameraSplineRigProps> = ({
  scrollProgressRef,
  chamberFocus,
  pointerNdcRef,
}) => {
  const { camera } = useThree();
  const smoothedTRef = useRef(0);
  const smoothedRollRef = useRef(0);

  const positionCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(1.15, 2.35, 3.6),
        new THREE.Vector3(-0.35, 2.2, -1.6),
        new THREE.Vector3(0.45, 2.15, -9.8),
        new THREE.Vector3(1.65, 2.75, -18.5),
        new THREE.Vector3(-0.85, 2.05, -28.0),
        new THREE.Vector3(0.35, 1.85, -37.5),
        new THREE.Vector3(0.0, 2.25, -48.5),
      ]),
    []
  );

  const lookAtCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.0, 1.85, -5.4),
        new THREE.Vector3(0.0, 2.0, -7.2),
        new THREE.Vector3(-0.6, 1.75, -19.5),
        new THREE.Vector3(-1.1, 1.65, -24.0),
        new THREE.Vector3(0.0, 1.85, -38.0),
        new THREE.Vector3(0.0, 2.15, -52.0),
        new THREE.Vector3(0.0, 2.45, -56.5),
      ]),
    []
  );

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.05);

    const desiredT =
      chamberFocus === 'AUTO'
        ? THREE.MathUtils.clamp(scrollProgressRef.current, 0, 1)
        : CHAMBER_T_TARGETS[chamberFocus];

    smoothedTRef.current = THREE.MathUtils.damp(
      smoothedTRef.current,
      desiredT,
      4.5,
      dt
    );

    const t = THREE.MathUtils.clamp(smoothedTRef.current, 0, 1);

    positionCurve.getPointAt(t, _camTarget);
    lookAtCurve.getPointAt(t, _lookTarget);

    const px = pointerNdcRef.current.x * 0.42;
    const py = pointerNdcRef.current.y * 0.24;
    _camTarget.x += px;
    _camTarget.y += py;

    camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTarget.x, 6, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTarget.y, 6, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTarget.z, 6, dt);

    _smoothedLook.x = THREE.MathUtils.damp(_smoothedLook.x, _lookTarget.x + px * 0.25, 6, dt);
    _smoothedLook.y = THREE.MathUtils.damp(_smoothedLook.y, _lookTarget.y + py * 0.15, 6, dt);
    _smoothedLook.z = THREE.MathUtils.damp(_smoothedLook.z, _lookTarget.z, 6, dt);

    camera.lookAt(_smoothedLook);

    const targetRoll =
      Math.sin(t * Math.PI * 2.0) * 0.055 + pointerNdcRef.current.x * -0.025;
    smoothedRollRef.current = THREE.MathUtils.damp(
      smoothedRollRef.current,
      targetRoll,
      5,
      dt
    );
    camera.rotation.z += smoothedRollRef.current;
  });

  return null;
};
