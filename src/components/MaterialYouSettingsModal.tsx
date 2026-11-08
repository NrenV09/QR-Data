import React, { useRef, useState } from 'react';
import {
  Check,
  Download,
  Image as ImageIcon,
  Palette,
  RotateCcw,
  Sliders,
  Smartphone,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  DEFAULT_MATERIAL_CONFIG,
  MATERIAL_SEED_PRESETS,
  MaterialContrastLevel,
  MaterialShapeScale,
  MaterialThemeMode,
  MaterialYouConfig,
} from '../utils/materialYouTheme';

interface MaterialYouSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: MaterialYouConfig;
  onChangeConfig: (next: MaterialYouConfig) => void;
  isOnline: boolean;
  swReady: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onInstallPWA: () => void;
}

export const MaterialYouSettingsModal: React.FC<
  MaterialYouSettingsModalProps
> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  isOnline,
  swReady,
  isInstallable,
  isInstalled,
  isIOS,
  onInstallPWA,
}) => {
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [extractedSourceLabel, setExtractedSourceLabel] = useState<string>('');
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Extract dominant color seed from an uploaded image using an offscreen canvas
  const handleWallpaperExtract = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Prefer chromatic pixels over near-black or near-white
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const weight = max - min > 24 ? 3 : 1;
          rSum += r * weight;
          gSum += g * weight;
          bSum += b * weight;
          count += weight;
        }
        const rAvg = Math.round(rSum / Math.max(1, count));
        const gAvg = Math.round(gSum / Math.max(1, count));
        const bAvg = Math.round(bSum / Math.max(1, count));
        const hex =
          '#' +
          [rAvg, gAvg, bAvg]
            .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();

        setExtractedSourceLabel(file.name);
        onChangeConfig({
          ...config,
          seedId: 'custom',
          customHex: hex,
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="m3-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="m3-surface-card max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Android 16 Material You Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--m3-outline-variant)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center m3-btn-tonal">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 id="m3-settings-title" className="text-base font-bold">
                Android 16 Material You Customization
              </h2>
              <p className="text-xs m3-text-muted">
                Dynamic Monet color seeds, surface contrast, expressive shapes & offline PWA state
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Material You Settings"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center m3-btn-outlined cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Settings Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* 1. Dynamic Color Seed Swatches (Wallpaper & Style) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                01. Dynamic Color Seed (Monet Tonal Palette)
              </h3>
              <span className="text-xs font-mono m3-text-muted">
                SEED: {config.seedId.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MATERIAL_SEED_PRESETS.map((preset) => {
                const selected = config.seedId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        seedId: preset.id,
                      })
                    }
                    aria-pressed={selected}
                    className={`min-h-[68px] p-3 flex items-center gap-3 text-left transition-all cursor-pointer ${
                      selected ? 'm3-btn-tonal' : 'm3-surface-low'
                    }`}
                  >
                    {/* Android 16 Quadrant Tonal Circle */}
                    <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 border border-black/20 grid grid-cols-2 grid-rows-2">
                      <span style={{ backgroundColor: preset.swatchLight }} />
                      <span style={{ backgroundColor: preset.hex }} />
                      <span
                        className="col-span-2"
                        style={{ backgroundColor: preset.swatchDark }}
                      />
                      {selected && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                          <Check className="w-4 h-4" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {preset.name}
                      </div>
                      <div className="text-[11px] m3-text-muted truncate">
                        {preset.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Custom Hex / Wallpaper Color Extractor Tile */}
              <div
                className={`min-h-[68px] p-3 flex items-center justify-between gap-2 ${
                  config.seedId === 'custom' ? 'm3-btn-tonal' : 'm3-surface-low'
                }`}
              >
                <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                  <input
                    type="color"
                    aria-label="Custom Material You Seed Color"
                    value={config.customHex}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        seedId: 'custom',
                        customHex: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-9 h-9 rounded-full cursor-pointer border-0 bg-transparent shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      Custom Seed
                    </div>
                    <div className="text-[11px] font-mono m3-text-muted truncate">
                      {extractedSourceLabel || config.customHex}
                    </div>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={() => wallpaperInputRef.current?.click()}
                  title="Extract color seed from wallpaper image"
                  aria-label="Extract color seed from image"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center m3-btn-outlined cursor-pointer shrink-0"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                <input
                  ref={wallpaperInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleWallpaperExtract}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* 2. Surface Theme Mode & Contrast Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">
                02. Surface Luminance Mode
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'dark', label: 'Dark M3', icon: Moon },
                    { id: 'light', label: 'Light M3', icon: Sun },
                    { id: 'amoled', label: 'AMOLED', icon: Smartphone },
                  ] as Array<{
                    id: MaterialThemeMode;
                    label: string;
                    icon: React.FC<{ className?: string }>;
                  }>
                ).map((item) => {
                  const Icon = item.icon;
                  const active = config.mode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        onChangeConfig({ ...config, mode: item.id })
                      }
                      aria-pressed={active}
                      className={`min-h-[44px] px-2.5 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        active ? 'm3-btn-filled' : 'm3-btn-outlined'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">
                03. Android 16 Surface Contrast
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'standard', label: 'Standard' },
                    { id: 'medium', label: 'Medium' },
                    { id: 'high', label: 'High' },
                  ] as Array<{ id: MaterialContrastLevel; label: string }>
                ).map((c) => {
                  const active = config.contrast === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        onChangeConfig({ ...config, contrast: c.id })
                      }
                      aria-pressed={active}
                      className={`min-h-[44px] px-2.5 py-2 text-xs font-semibold flex items-center justify-center cursor-pointer whitespace-nowrap ${
                        active ? 'm3-btn-filled' : 'm3-btn-outlined'
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Expressive Corner Geometry & Optical QR Boost */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">
                04. Material 3 Corner Geometry
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'expressive', label: 'Expressive (28px)' },
                    { id: 'standard', label: 'Standard (20px)' },
                    { id: 'compact', label: 'Compact (12px)' },
                  ] as Array<{ id: MaterialShapeScale; label: string }>
                ).map((shape) => {
                  const active = config.shapeScale === shape.id;
                  return (
                    <button
                      key={shape.id}
                      type="button"
                      onClick={() =>
                        onChangeConfig({ ...config, shapeScale: shape.id })
                      }
                      aria-pressed={active}
                      className={`min-h-[44px] px-2 py-2 text-xs font-semibold flex items-center justify-center cursor-pointer whitespace-nowrap ${
                        active ? 'm3-btn-filled' : 'm3-btn-outlined'
                      }`}
                    >
                      {shape.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">
                05. Optical Emitter Quiet-Zone Boost
              </span>
              <button
                type="button"
                onClick={() =>
                  onChangeConfig({
                    ...config,
                    qrQuietZoneBoost: !config.qrQuietZoneBoost,
                  })
                }
                aria-pressed={config.qrQuietZoneBoost}
                className={`min-h-[44px] px-4 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                  config.qrQuietZoneBoost ? 'm3-btn-tonal' : 'm3-btn-outlined'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Sliders className="w-4 h-4" />
                  <span>Expanded White QR Quiet Zone</span>
                </span>
                <span className="font-mono">
                  {config.qrQuietZoneBoost ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          {/* 4. Offline PWA & Service Worker Readiness Panel */}
          <div className="m3-surface-low p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 flex items-center justify-center m3-btn-tonal shrink-0">
                {isOnline ? (
                  <Wifi className="w-5 h-5" />
                ) : (
                  <WifiOff className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="text-xs font-semibold">
                  100% Offline Progressive Web App (Service Worker Active)
                </div>
                <div className="text-xs m3-text-muted mt-0.5">
                  <span>{isOnline ? 'Network: Online' : 'Network: Offline Mode'}</span>
                  <span aria-hidden="true"> · </span>
                  <span>
                    {swReady
                      ? 'All QR & ARQ assets cached for offline use'
                      : 'Precaching offline assets in browser storage'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isInstalled && isInstallable && (
                <button
                  type="button"
                  onClick={onInstallPWA}
                  className="min-h-[42px] px-4 py-2 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Install Offline App</span>
                </button>
              )}
              {!isInstalled && isIOS && (
                <button
                  type="button"
                  onClick={() => setShowIOSGuide((v) => !v)}
                  className="min-h-[42px] px-3 py-2 text-xs font-semibold m3-btn-outlined cursor-pointer whitespace-nowrap"
                >
                  Install on iOS
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangeConfig(DEFAULT_MATERIAL_CONFIG)}
                className="min-h-[42px] px-3.5 py-2 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Theme</span>
              </button>
            </div>
          </div>

          {showIOSGuide && (
            <div className="m3-surface-high p-3 text-xs">
              To install on iPhone or iPad for offline use: tap the{' '}
              <strong>Share</strong> button in Safari and select{' '}
              <strong>Add to Home Screen</strong>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
