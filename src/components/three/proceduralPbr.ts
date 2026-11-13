import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ProceduralTextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/**
 * Detects software WebGL rasterizers (SwiftShader, llvmpipe, softpipe) from
 * the GPU renderer string so heavy multi-pass post-processing can be scaled
 * back safely without altering scene contents, geometry, or layout.
 */
export function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 4
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function pseudoNoise(x: number, y: number, seed = 13.37): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Cast-concrete brutalist panels with tie-rod holes, formwork seams,
 * and baked ambient occlusion edge darkening.
 */
export function createBrutalistConcreteTextures(
  repeatX = 4,
  repeatY = 4
): ProceduralTextureSet {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = roughCanvas.height = bumpCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;

  cCtx.fillStyle = '#1d2028';
  cCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#d4d4d4';
  rCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = pseudoNoise(x * 0.15, y * 0.15, 3.1);
      const tone = Math.floor(24 + n * 22);
      cCtx.fillStyle = `rgb(${tone}, ${tone + 2}, ${tone + 7})`;
      cCtx.fillRect(x, y, 2, 2);

      const rVal = Math.floor(175 + n * 65);
      rCtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
      rCtx.fillRect(x, y, 2, 2);

      const bVal = Math.floor(110 + n * 38);
      bCtx.fillStyle = `rgb(${bVal}, ${bVal}, ${bVal})`;
      bCtx.fillRect(x, y, 2, 2);
    }
  }

  const gradTop = cCtx.createLinearGradient(0, 0, 0, 26);
  gradTop.addColorStop(0, 'rgba(4,5,8,0.65)');
  gradTop.addColorStop(1, 'rgba(4,5,8,0)');
  cCtx.fillStyle = gradTop;
  cCtx.fillRect(0, 0, size, 26);

  cCtx.strokeStyle = 'rgba(7, 9, 13, 0.85)';
  cCtx.lineWidth = 3;
  cCtx.strokeRect(1.5, 1.5, size - 3, size - 3);
  cCtx.beginPath();
  cCtx.moveTo(0, size / 2);
  cCtx.lineTo(size, size / 2);
  cCtx.stroke();

  bCtx.strokeStyle = '#303030';
  bCtx.lineWidth = 3;
  bCtx.strokeRect(1.5, 1.5, size - 3, size - 3);

  const tiePoints = [
    [44, 44],
    [size - 44, 44],
    [44, size - 44],
    [size - 44, size - 44],
  ];
  for (const [tx, ty] of tiePoints) {
    cCtx.fillStyle = '#0c0e13';
    cCtx.beginPath();
    cCtx.arc(tx, ty, 5.5, 0, Math.PI * 2);
    cCtx.fill();

    cCtx.strokeStyle = 'rgba(130, 145, 175, 0.14)';
    cCtx.lineWidth = 1.2;
    cCtx.beginPath();
    cCtx.arc(tx, ty, 7, 0, Math.PI * 2);
    cCtx.stroke();

    bCtx.fillStyle = '#202020';
    bCtx.beginPath();
    bCtx.arc(tx, ty, 5.5, 0, Math.PI * 2);
    bCtx.fill();
  }

  return {
    map: configureTexture(colorCanvas, true, repeatX, repeatY),
    roughnessMap: configureTexture(roughCanvas, false, repeatX, repeatY),
    bumpMap: configureTexture(bumpCanvas, false, repeatX, repeatY),
  };
}

/**
 * Cyberpunk wet asphalt textures featuring seamless domain-warped puddles
 * in the roughness map to catch neon crimson and cyan street reflections.
 */
export function createWetAsphaltTextures(
  repeatX = 4,
  repeatY = 10
): ProceduralTextureSet {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = roughCanvas.height = bumpCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;

  cCtx.fillStyle = '#090b10';
  cCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#b8b8b8';
  rCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const tau = Math.PI * 2;
  for (let y = 0; y < size; y += 2) {
    const v = y / size;
    for (let x = 0; x < size; x += 2) {
      const u = x / size;
      const fine = pseudoNoise(x * 0.45, y * 0.45, 7.2);

      // Seamless domain-warped puddle field (all frequencies are integer multiples of TAU)
      const wx =
        u +
        0.095 * Math.sin(tau * 2 * v + 1.3) +
        0.045 * Math.cos(tau * 3 * u - tau * v);
      const wy =
        v +
        0.095 * Math.cos(tau * 2 * u + 0.7) +
        0.045 * Math.sin(tau * 3 * v + tau * u);

      const puddleField =
        Math.sin(tau * (wx + wy) + 0.8) * 0.4 +
        Math.cos(tau * (wx * 2 - wy) + 2.1) * 0.32 +
        Math.sin(tau * (wx + wy * 3) + 1.4) * 0.22 +
        Math.cos(tau * (wx * 3 + wy * 2) - 0.9) * 0.16 +
        (pseudoNoise(Math.floor(x / 6), Math.floor(y / 6), 9.4) - 0.5) * 0.18;

      const tPuddle = Math.max(0, Math.min(1, (puddleField - 0.14) / 0.24));
      const wetFactor = tPuddle * tPuddle * (3 - 2 * tPuddle);

      const cBase = Math.round(
        (16 + fine * 16) * (1 - wetFactor) + (7 + fine * 5) * wetFactor
      );
      cCtx.fillStyle = `rgb(${cBase}, ${cBase + 2}, ${cBase + 6})`;
      cCtx.fillRect(x, y, 2, 2);

      const rVal = Math.round(
        (170 + fine * 58) * (1 - wetFactor) + (16 + fine * 14) * wetFactor
      );
      rCtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
      rCtx.fillRect(x, y, 2, 2);

      const bVal = Math.round(
        (108 + fine * 48) * (1 - wetFactor) + 128 * wetFactor
      );
      bCtx.fillStyle = `rgb(${bVal}, ${bVal}, ${bVal})`;
      bCtx.fillRect(x, y, 2, 2);
    }
  }

  cCtx.fillStyle = 'rgba(255, 38, 78, 0.26)';
  cCtx.fillRect(size * 0.488, 0, size * 0.024, size);

  return {
    map: configureTexture(colorCanvas, true, repeatX, repeatY),
    roughnessMap: configureTexture(roughCanvas, false, repeatX, repeatY),
    bumpMap: configureTexture(bumpCanvas, false, repeatX, repeatY),
  };
}

/**
 * Brushed dark anodized steel & robotic chassis metal texture.
 */
export function createBrushedMetalTextures(
  repeatX = 2,
  repeatY = 2
): ProceduralTextureSet {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = roughCanvas.height = bumpCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;

  cCtx.fillStyle = '#1b1f29';
  cCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#686868';
  rCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y++) {
    const streak = pseudoNoise(1.0, y * 0.65, 22.1);
    const v = Math.floor(24 + streak * 16);
    cCtx.fillStyle = `rgb(${v}, ${v + 3}, ${v + 9})`;
    cCtx.fillRect(0, y, size, 1);

    const rV = Math.floor(72 + streak * 50);
    rCtx.fillStyle = `rgb(${rV}, ${rV}, ${rV})`;
    rCtx.fillRect(0, y, size, 1);

    const bV = Math.floor(118 + streak * 20);
    bCtx.fillStyle = `rgb(${bV}, ${bV}, ${bV})`;
    bCtx.fillRect(0, y, size, 1);
  }

  return {
    map: configureTexture(colorCanvas, true, repeatX, repeatY),
    roughnessMap: configureTexture(roughCanvas, false, repeatX, repeatY),
    bumpMap: configureTexture(bumpCanvas, false, repeatX, repeatY),
  };
}

export interface MonolithCardSpec {
  code: string;
  title: string;
  subtitle: string;
  metric: string;
  accentHex: string;
}

/**
 * Generates crisp technical canvas artwork for the curved CustomShaderMaterial
 * exhibition monolith cards.
 */
export function createMonolithCardTexture(
  spec: MonolithCardSpec
): THREE.CanvasTexture {
  const w = 512;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#090b12');
  grad.addColorStop(0.6, '#101422');
  grad.addColorStop(1, '#07090f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 32; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 32; y < h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const rad = ctx.createRadialGradient(w * 0.5, h * 0.44, 18, w * 0.5, h * 0.44, 210);
  rad.addColorStop(0, spec.accentHex + '66');
  rad.addColorStop(0.55, spec.accentHex + '18');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, w - 40, h - 40);

  ctx.fillStyle = spec.accentHex;
  ctx.font = 'bold 20px monospace';
  ctx.fillText(spec.code, 42, 66);

  ctx.fillStyle = 'rgba(244,244,245,0.65)';
  ctx.font = '15px monospace';
  ctx.fillText('OPTILINK // ARCH-SPEC', w - 230, 65);

  const cx = w / 2;
  const cy = h * 0.44;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(cx - 92, cy - 92, 184, 184);

  const cell = 22;
  const startX = cx - 77;
  const startY = cy - 77;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const bit = pseudoNoise(r + 1, c + 1, spec.code.charCodeAt(0));
      if (bit > 0.45 || (r < 2 && c < 2) || (r > 4 && c < 2) || (r < 2 && c > 4)) {
        ctx.fillStyle = r === 3 && c === 3 ? spec.accentHex : '#f8fafc';
        ctx.fillRect(startX + c * cell, startY + r * cell, cell - 4, cell - 4);
      }
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(spec.title, 42, h - 140);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '20px sans-serif';
  ctx.fillText(spec.subtitle, 42, h - 104);

  ctx.fillStyle = spec.accentHex;
  ctx.font = 'bold 24px monospace';
  ctx.fillText(spec.metric, 42, h - 54);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Glowing vertical cyberpunk signage texture.
 */
export function createNeonSignTexture(
  primaryText: string,
  subText: string,
  primaryColor: string
): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#08090e';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  ctx.fillStyle = primaryColor;
  ctx.font = 'bold 38px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(primaryText, w / 2, 110);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(subText, w / 2, 175);

  for (let i = 0; i < 12; i++) {
    const barW = 28 + ((i * 37) % 130);
    ctx.fillStyle = i % 3 === 0 ? primaryColor : 'rgba(255,255,255,0.78)';
    ctx.fillRect((w - barW) / 2, 230 + i * 18, barW, 8);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Loads a user-selected local `.glb` / `.gltf` file strictly in-memory via
 * ArrayBuffer (100% offline, zero external network requests), normalizes its
 * scale to fit an exhibition plinth, and aligns its bottom-center cleanly to y = 0.
 */
export async function parseLocalGlbFile(file: File): Promise<THREE.Group> {
  const arrayBuffer = await file.arrayBuffer();
  const loader = new GLTFLoader();

  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      '',
      (result) => resolve(result),
      (error) => reject(error)
    );
  });

  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const targetScale = 1.65 / maxDim;

  model.scale.setScalar(targetScale);
  model.position.set(
    -center.x * targetScale,
    -box.min.y * targetScale,
    -center.z * targetScale
  );

  model.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}
