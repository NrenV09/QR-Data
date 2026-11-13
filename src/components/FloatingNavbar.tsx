import React from 'react';
import { motion } from 'motion/react';
import { Activity, Download } from 'lucide-react';
import { MaterialYouConfig } from '../utils/materialYouTheme';
import { ThemeSwitcher } from './ThemeSwitcher';

export type HeaderWorkspaceMode = 'GENERATOR' | 'SCANNER' | 'DUAL' | 'ARQ';

interface FloatingNavbarProps {
  workspaceMode: HeaderWorkspaceMode;
  onSelectWorkspaceMode: (mode: HeaderWorkspaceMode) => void;
  materialConfig: MaterialYouConfig;
  onChangeMaterialConfig: (next: MaterialYouConfig) => void;
  onOpenMaterialModal: () => void;
  onOpenStandaloneModal: () => void;
  onOpenActivityDrawer: () => void;
  frameLogCount: number;
  isOnline: boolean;
  onNotify?: (title: string, description?: string) => void;
}

export const FloatingNavbar: React.FC<FloatingNavbarProps> = ({
  workspaceMode,
  onSelectWorkspaceMode,
  materialConfig,
  onChangeMaterialConfig,
  onOpenMaterialModal,
  onOpenStandaloneModal,
  onOpenActivityDrawer,
  frameLogCount,
  isOnline,
  onNotify,
}) => {
  const navItems: Array<{ id: HeaderWorkspaceMode; label: string }> = [
    { id: 'GENERATOR', label: 'Generator' },
    { id: 'SCANNER', label: 'Scanner' },
    { id: 'DUAL', label: 'Dual Testbed' },
    { id: 'ARQ', label: 'Optical ARQ' },
  ];

  const handleNavClick = (mode: HeaderWorkspaceMode) => {
    onSelectWorkspaceMode(mode);
    const ws = document.getElementById('transceiver-workspace');
    if (ws) {
      ws.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="sticky top-3 z-40 px-3 sm:px-6 pointer-events-none">
      <header
        style={{
          backgroundColor:
            materialConfig.mode === 'light'
              ? 'rgba(255, 255, 255, 0.82)'
              : 'rgba(10, 11, 16, 0.76)',
        }}
        className="pointer-events-auto max-w-[1340px] mx-auto rounded-full backdrop-blur-xl border border-[var(--m3-outline-variant)] px-3 sm:px-4 h-14 flex items-center justify-between gap-2 sm:gap-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_20px_50px_-14px_rgba(0,0,0,0.75)]"
      >
        {/* Zone 1: Clean Brand Emblem & Wordmark */}
        <div className="flex items-center gap-3 shrink-0 pl-1">
          <a
            href="#top"
            data-cursor-label="Top"
            className="flex items-center gap-2.5 text-sm sm:text-base font-bold tracking-tight whitespace-nowrap shrink-0 group"
          >
            <span
              aria-hidden="true"
              className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-cyan-400/30 border border-white/20 flex items-center justify-center shadow-[0_0_18px_-2px_rgba(99,102,241,0.65)] group-hover:scale-105 transition-transform"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
            </span>
            <span>OptiLink</span>
          </a>

          <span
            aria-hidden="true"
            className="hidden xl:inline-block h-4 w-[1px] bg-[var(--m3-outline-variant)]"
          />

          <span className="hidden xl:inline-flex items-center gap-1.5 text-[11px] font-mono m3-text-muted whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{isOnline ? '60Hz Optical Ready' : 'Offline SW Active'}</span>
          </span>
        </div>

        {/* Zone 2: Desktop Pill-Shaped Mode Tabs with Framer Motion layoutId Indicator */}
        <nav
          aria-label="Primary Transceiver Mode"
          className="hidden md:flex items-center gap-1 p-1 rounded-full bg-[var(--m3-surface-container-low)]/90 border border-[var(--m3-outline-variant)]"
        >
          {navItems.map((item) => {
            const isActive = workspaceMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                data-cursor-label={item.label}
                className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  isActive
                    ? 'text-[var(--m3-on-surface)] font-semibold'
                    : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="floating-nav-active-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className="absolute inset-0 rounded-full bg-[var(--m3-surface-container-high)] border border-white/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_0_18px_-4px_rgba(99,102,241,0.45)]"
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Theme Switcher, Packet Inspector & Magnetic Single-File Export */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block">
            <ThemeSwitcher
              config={materialConfig}
              onChangeConfig={onChangeMaterialConfig}
              onOpenFullModal={onOpenMaterialModal}
              onNotify={onNotify}
            />
          </div>

          <button
            type="button"
            onClick={onOpenActivityDrawer}
            data-magnetic
            data-cursor-label="Inspect"
            title="Open Live Packet Inspector & Frame Exchange Drawer"
            className="min-h-[34px] px-3 py-1 rounded-full text-xs font-mono m3-surface-low hover:bg-[var(--m3-surface-container-high)] flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer tabular-nums shrink-0"
          >
            <Activity className="w-3.5 h-3.5 text-[var(--m3-primary)]" />
            <span className="hidden lg:inline font-sans font-medium">Inspector</span>
            <span className="text-[11px] m3-text-muted">{frameLogCount}</span>
          </button>

          <button
            type="button"
            onClick={onOpenStandaloneModal}
            data-magnetic
            data-cursor-label="Export"
            className="min-h-[36px] px-3.5 sm:px-4 py-1.5 text-xs font-semibold m3-btn-filled rounded-full cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Export Single-File</span>
            <span className="md:hidden">Export</span>
          </button>
        </div>
      </header>

      {/* Mobile Pill Bar (< md): All 4 modes visible at once with zero clipping */}
      <nav
        aria-label="Mobile Transceiver Mode"
        style={{
          backgroundColor:
            materialConfig.mode === 'light'
              ? 'rgba(255, 255, 255, 0.86)'
              : 'rgba(10, 11, 16, 0.82)',
        }}
        className="md:hidden pointer-events-auto mt-2 mx-auto max-w-fit rounded-full backdrop-blur-xl border border-[var(--m3-outline-variant)] p-1 flex items-center gap-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]"
      >
        {navItems.map((item) => {
          const isActive = workspaceMode === item.id;
          const shortLabel =
            item.id === 'DUAL'
              ? 'Dual'
              : item.id === 'ARQ'
              ? 'ARQ'
              : item.label;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`relative px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isActive
                  ? 'text-[var(--m3-on-surface)] font-semibold'
                  : 'm3-text-muted'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="floating-nav-mobile-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 rounded-full bg-[var(--m3-surface-container-high)] border border-white/15"
                />
              )}
              <span className="relative z-10">{shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
