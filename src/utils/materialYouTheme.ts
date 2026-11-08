/**
 * Android 16 Material You (Material 3 Expressive) Dynamic Color & Shape Engine
 * Computes contrast-verified tonal surface tokens from preset or custom hex seeds.
 */

export type MaterialSeedId =
  | 'cobalt'
  | 'lemongrass'
  | 'lavender'
  | 'coral'
  | 'amber'
  | 'custom';

export type MaterialThemeMode = 'dark' | 'light' | 'amoled';
export type MaterialContrastLevel = 'standard' | 'medium' | 'high';
export type MaterialShapeScale = 'expressive' | 'standard' | 'compact';

export interface MaterialYouConfig {
  seedId: MaterialSeedId;
  customHex: string;
  mode: MaterialThemeMode;
  contrast: MaterialContrastLevel;
  shapeScale: MaterialShapeScale;
  qrQuietZoneBoost: boolean;
  hapticVisualFeedback: boolean;
}

export interface MaterialYouTokens {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  surface: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  radiusLg: string;
  radiusMd: string;
  radiusSm: string;
  seedHex: string;
}

export interface SeedPresetInfo {
  id: MaterialSeedId;
  name: string;
  subtitle: string;
  hex: string;
  swatchLight: string;
  swatchDark: string;
}

export const MATERIAL_SEED_PRESETS: SeedPresetInfo[] = [
  {
    id: 'cobalt',
    name: 'Pixel Ocean',
    subtitle: 'Android 16 Cobalt',
    hex: '#4285F4',
    swatchLight: '#A8C7FA',
    swatchDark: '#0B57D0',
  },
  {
    id: 'lemongrass',
    name: 'Lemongrass',
    subtitle: 'Pixel Mint & Sage',
    hex: '#2E9E5B',
    swatchLight: '#6DD58C',
    swatchDark: '#0F5223',
  },
  {
    id: 'lavender',
    name: 'Expressive Iris',
    subtitle: 'Material 3 Violet',
    hex: '#7C5CE6',
    swatchLight: '#D0BCFF',
    swatchDark: '#4F378B',
  },
  {
    id: 'coral',
    name: 'Terracotta',
    subtitle: 'Warm Coral Clay',
    hex: '#E05A47',
    swatchLight: '#FFB4A8',
    swatchDark: '#93000A',
  },
  {
    id: 'amber',
    name: 'Solar Gold',
    subtitle: 'Warm Amber',
    hex: '#E59C24',
    swatchLight: '#FFDF9E',
    swatchDark: '#5B4300',
  },
];

export const DEFAULT_MATERIAL_CONFIG: MaterialYouConfig = {
  seedId: 'cobalt',
  customHex: '#4285F4',
  mode: 'dark',
  contrast: 'standard',
  shapeScale: 'expressive',
  qrQuietZoneBoost: false,
  hapticVisualFeedback: true,
};

/**
 * Parses a #RRGGBB hex string into { r, g, b } in [0..255]
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length !== 6) {
    return { r: 66, g: 133, b: 244 };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Converts RGB [0..255] to HSL { h: [0..360], s: [0..100], l: [0..100] }
 */
export function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslString(h: number, s: number, l: number): string {
  const clampedS = Math.max(0, Math.min(100, Math.round(s)));
  const clampedL = Math.max(0, Math.min(100, Math.round(l)));
  return `hsl(${ ((h % 360) + 360) % 360 } ${clampedS}% ${clampedL}%)`;
}

/**
 * Resolves a complete set of Material 3 Expressive CSS tokens from the user's configuration
 */
export function resolveMaterialYouTokens(
  config: MaterialYouConfig
): MaterialYouTokens {
  const preset = MATERIAL_SEED_PRESETS.find((p) => p.id === config.seedId);
  const seedHex =
    config.seedId === 'custom'
      ? config.customHex || '#4285F4'
      : preset?.hex || '#4285F4';

  const { r, g, b } = hexToRgb(seedHex);
  const { h, s } = rgbToHsl(r, g, b);
  const activeSat = Math.max(48, s);

  const radiusMap: Record<
    MaterialShapeScale,
    { lg: string; md: string; sm: string }
  > = {
    expressive: { lg: '28px', md: '18px', sm: '12px' },
    standard: { lg: '20px', md: '12px', sm: '8px' },
    compact: { lg: '12px', md: '8px', sm: '6px' },
  };
  const radii = radiusMap[config.shapeScale] || radiusMap.expressive;

  const contrastDelta =
    config.contrast === 'high' ? 8 : config.contrast === 'medium' ? 4 : 0;

  if (config.mode === 'light') {
    return {
      primary: hslString(h, activeSat, Math.max(24, 38 - contrastDelta)),
      onPrimary: '#FFFFFF',
      primaryContainer: hslString(h, Math.min(90, activeSat + 10), 90),
      onPrimaryContainer: hslString(h, activeSat, 14),
      secondaryContainer: hslString(h, 32, 92),
      onSecondaryContainer: hslString(h, 40, 18),
      surface: hslString(h, 20, 98),
      surfaceContainerLow: hslString(h, 22, 95),
      surfaceContainer: hslString(h, 24, 92 - Math.floor(contrastDelta / 2)),
      surfaceContainerHigh: hslString(h, 24, 88 - contrastDelta),
      onSurface: hslString(h, 28, 10),
      onSurfaceVariant: hslString(h, 16, Math.max(22, 36 - contrastDelta)),
      outline: hslString(h, 16, Math.max(45, 68 - contrastDelta * 2)),
      outlineVariant: hslString(h, 18, Math.max(65, 82 - contrastDelta)),
      radiusLg: radii.lg,
      radiusMd: radii.md,
      radiusSm: radii.sm,
      seedHex,
    };
  }

  if (config.mode === 'amoled') {
    return {
      primary: hslString(h, Math.min(95, activeSat + 12), Math.min(86, 76 + contrastDelta)),
      onPrimary: hslString(h, activeSat, 10),
      primaryContainer: hslString(h, activeSat, 22 + contrastDelta),
      onPrimaryContainer: hslString(h, 90, 92),
      secondaryContainer: hslString(h, 28, 16 + contrastDelta),
      onSecondaryContainer: hslString(h, 60, 90),
      surface: '#000000',
      surfaceContainerLow: hslString(h, 18, 5),
      surfaceContainer: hslString(h, 18, 8 + Math.floor(contrastDelta / 2)),
      surfaceContainerHigh: hslString(h, 20, 13 + contrastDelta),
      onSurface: '#F8FAFC',
      onSurfaceVariant: hslString(h, 18, Math.min(90, 74 + contrastDelta)),
      outline: hslString(h, 18, Math.min(65, 32 + contrastDelta * 2)),
      outlineVariant: hslString(h, 16, Math.min(48, 20 + contrastDelta)),
      radiusLg: radii.lg,
      radiusMd: radii.md,
      radiusSm: radii.sm,
      seedHex,
    };
  }

  // Default Android 16 Dark Tonal Surface
  return {
    primary: hslString(h, Math.min(92, activeSat + 10), Math.min(86, 76 + contrastDelta)),
    onPrimary: hslString(h, activeSat, 12),
    primaryContainer: hslString(h, activeSat, 24 + contrastDelta),
    onPrimaryContainer: hslString(h, 88, 92),
    secondaryContainer: hslString(h, 26, 20 + contrastDelta),
    onSecondaryContainer: hslString(h, 55, 90),
    surface: hslString(h, 22, 7),
    surfaceContainerLow: hslString(h, 20, 10),
    surfaceContainer: hslString(h, 20, 13 + Math.floor(contrastDelta / 2)),
    surfaceContainerHigh: hslString(h, 22, 18 + contrastDelta),
    onSurface: hslString(h, 20, 95),
    onSurfaceVariant: hslString(h, 16, Math.min(88, 72 + contrastDelta)),
    outline: hslString(h, 16, Math.min(60, 34 + contrastDelta * 2)),
    outlineVariant: hslString(h, 16, Math.min(45, 22 + contrastDelta)),
    radiusLg: radii.lg,
    radiusMd: radii.md,
    radiusSm: radii.sm,
    seedHex,
  };
}
