import React from 'react';
import { Moon, Sun, SlidersHorizontal } from 'lucide-react';
import {
  MATERIAL_SEED_PRESETS,
  MaterialSeedId,
  MaterialYouConfig,
} from '../utils/materialYouTheme';

interface ThemeSwitcherProps {
  config: MaterialYouConfig;
  onChangeConfig: (next: MaterialYouConfig) => void;
  onOpenFullModal: () => void;
  onNotify?: (title: string, description?: string) => void;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  config,
  onChangeConfig,
  onOpenFullModal,
  onNotify,
}) => {
  const isLight = config.mode === 'light';

  const handleToggleDarkLight = () => {
    const nextMode = isLight ? 'dark' : 'light';
    onChangeConfig({
      ...config,
      mode: nextMode,
    });
    onNotify?.(
      `Surface Mode: ${nextMode === 'light' ? 'Studio Daylight' : 'Obsidian Dark'}`,
      'Dynamic tonal tokens updated'
    );
  };

  const handleSelectSeed = (seedId: MaterialSeedId, name: string) => {
    onChangeConfig({
      ...config,
      seedId,
    });
    onNotify?.(`Accent Theme: ${name}`, 'Applied Material You seed palette');
  };

  return (
    <div className="flex items-center gap-1.5 p-1 rounded-full bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      {/* Dark / Light Mode Toggle */}
      <button
        type="button"
        onClick={handleToggleDarkLight}
        title={isLight ? 'Switch to Obsidian Dark mode' : 'Switch to Daylight mode'}
        aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] hover:text-[var(--m3-primary)] transition-all duration-150 active:scale-95 cursor-pointer"
      >
        {isLight ? (
          <Sun className="w-3.5 h-3.5 text-amber-500" />
        ) : (
          <Moon className="w-3.5 h-3.5 text-[var(--m3-primary)]" />
        )}
      </button>

      {/* 4 Quick Accent Swatches */}
      <div className="hidden md:flex items-center gap-1 px-1">
        {MATERIAL_SEED_PRESETS.slice(0, 4).map((preset) => {
          const active = config.seedId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectSeed(preset.id, preset.name)}
              title={`Theme Accent: ${preset.name}`}
              aria-label={`Select ${preset.name} accent`}
              aria-pressed={active}
              className={`w-4 h-4 rounded-full transition-all duration-150 cursor-pointer flex items-center justify-center ${
                active
                  ? 'ring-2 ring-[var(--m3-on-surface)] scale-110'
                  : 'opacity-70 hover:opacity-100 hover:scale-105'
              }`}
              style={{ backgroundColor: preset.hex }}
            />
          );
        })}
      </div>

      {/* Full Material You Settings Trigger */}
      <button
        type="button"
        onClick={onOpenFullModal}
        title="Customize Material You Shape, Contrast & Seed"
        className="px-2.5 h-7 rounded-full text-[11px] font-medium m3-text-muted hover:text-[var(--m3-on-surface)] hover:bg-[var(--m3-surface-container-high)] flex items-center gap-1 transition-colors cursor-pointer"
      >
        <SlidersHorizontal className="w-3 h-3" />
        <span className="hidden sm:inline">Theme</span>
      </button>
    </div>
  );
};
