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
      primary: hslString(h, activeSat, Math.max(20, 34 - contrastDelta)),
      onPrimary: '#FFFFFF',
      primaryContainer: hslString(h, Math.min(75, activeSat), 92),
      onPrimaryContainer: hslString(h, activeSat, 14),
      secondaryContainer: hslString(h, 14, 93),
      onSecondaryContainer: hslString(h, 24, 16),
      surface: hslString(h, 6, 97),
      surfaceContainerLow: '#FFFFFF',
      surfaceContainer: '#FFFFFF',
      surfaceContainerHigh: hslString(h, 6, 93 - contrastDelta),
      onSurface: hslString(h, 12, 9),
      onSurfaceVariant: hslString(h, 8, Math.max(24, 42 - contrastDelta)),
      outline: hslString(h, 8, Math.max(45, 74 - contrastDelta * 2)),
      outlineVariant: hslString(h, 8, Math.max(68, 88 - contrastDelta)),
      radiusLg: radii.lg,
      radiusMd: radii.md,
      radiusSm: radii.sm,
      seedHex,
    };
  }

  if (config.mode === 'amoled') {
    return {
      primary: hslString(h, Math.min(92, activeSat + 8), Math.min(86, 74 + contrastDelta)),
      onPrimary: hslString(h, activeSat, 10),
      primaryContainer: hslString(h, Math.min(60, activeSat), 18 + contrastDelta),
      onPrimaryContainer: hslString(h, 85, 92),
      secondaryContainer: hslString(h, 12, 14 + contrastDelta),
      onSecondaryContainer: hslString(h, 40, 90),
      surface: '#000000',
      surfaceContainerLow: hslString(h, 4, 4),
      surfaceContainer: hslString(h, 5, 7 + Math.floor(contrastDelta / 2)),
      surfaceContainerHigh: hslString(h, 5, 11 + contrastDelta),
      onSurface: '#F8FAFC',
      onSurfaceVariant: hslString(h, 6, Math.min(88, 66 + contrastDelta)),
      outline: hslString(h, 6, Math.min(55, 26 + contrastDelta * 2)),
      outlineVariant: hslString(h, 5, Math.min(40, 15 + contrastDelta)),
      radiusLg: radii.lg,
      radiusMd: radii.md,
      radiusSm: radii.sm,
      seedHex,
    };
  }

  // Default Architectural Obsidian Dark Surface (<6% neutral tint saturation)
  return {
    primary: hslString(h, Math.min(90, activeSat + 6), Math.min(86, 74 + contrastDelta)),
    onPrimary: hslString(h, activeSat, 10),
    primaryContainer: hslString(h, Math.min(58, activeSat), 20 + contrastDelta),
    onPrimaryContainer: hslString(h, 85, 93),
    secondaryContainer: hslString(h, 10, 16 + contrastDelta),
    onSecondaryContainer: hslString(h, 35, 90),
    surface: hslString(h, 5, 5),
    surfaceContainerLow: hslString(h, 5, 8),
    surfaceContainer: hslString(h, 5, 9 + Math.floor(contrastDelta / 2)),
    surfaceContainerHigh: hslString(h, 6, 13 + contrastDelta),
    onSurface: hslString(h, 8, 96),
    onSurfaceVariant: hslString(h, 6, Math.min(85, 64 + contrastDelta)),
    outline: hslString(h, 6, Math.min(52, 26 + contrastDelta * 2)),
    outlineVariant: hslString(h, 5, Math.min(38, 16 + contrastDelta)),
    radiusLg: radii.lg,
    radiusMd: radii.md,
    radiusSm: radii.sm,
    seedHex,
  };
}
