import React from 'react';
import { Activity, Download } from 'lucide-react';
import { MaterialYouConfig } from '../utils/materialYouTheme';
import { ThemeSwitcher } from './ThemeSwitcher';

export type HeaderWorkspaceMode = 'GENERATOR' | 'SCANNER' | 'DUAL' | 'ARQ';

interface HeaderProps {
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

export const Header: React.FC<HeaderProps> = ({
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

  return (
    <header
      style={{
        backgroundColor: 'color-mix(in srgb, var(--m3-surface) 80%, transparent)',
        borderColor: 'var(--m3-outline-variant)',
      }}
      className="sticky top-0 z-30 backdrop-blur-xl flex items-center justify-between gap-4 px-4 sm:px-6 h-15 border-b shrink-0 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.04)]"
    >
      {/* Zone 1: Brand Emblem, Wordmark & Live Air-Gap Status Indicator */}
      <div className="flex items-center gap-3.5 shrink-0">
        <a
          href="#top"
          className="flex items-center gap-2.5 text-base font-bold tracking-tight whitespace-nowrap shrink-0 group"
        >
          <span
            aria-hidden="true"
            className="w-7 h-7 rounded-xl bg-[var(--m3-primary)]/15 border border-[var(--m3-primary)]/40 flex items-center justify-center shadow-[0_0_16px_-2px_var(--m3-primary)] group-hover:scale-105 transition-transform"
          >
            <span className="w-2.5 h-2.5 rounded-xs bg-[var(--m3-primary)]" />
          </span>
          <span>OptiLink</span>
        </a>

        <span
          aria-hidden="true"
          className="hidden lg:inline-block h-4 w-[1px] bg-[var(--m3-outline-variant)]"
        />

        <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono m3-text-muted tabular-nums">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          <span>{isOnline ? 'Air-Gap Ready · 60Hz' : '100% Offline Cache'}</span>
        </div>
      </div>

      {/* Zone 2: Clean Segmented Mode Navigation */}
      <nav
        aria-label="Primary Transceiver Mode"
        className="flex items-center gap-5 sm:gap-7 h-full text-xs sm:text-sm font-medium overflow-x-auto no-scrollbar"
      >
        {navItems.map((item) => {
          const isActive = workspaceMode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectWorkspaceMode(item.id)}
              className={`relative h-full flex items-center whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isActive
                  ? 'text-[var(--m3-on-surface)] font-semibold'
                  : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
              }`}
            >
              <span>{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[var(--m3-primary)] rounded-full shadow-[0_0_12px_var(--m3-primary)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Inline Theme Switcher, Contextual Logs Drawer Trigger & Primary Export CTA */}
      <div className="flex items-center gap-2.5 shrink-0">
        <ThemeSwitcher
          config={materialConfig}
          onChangeConfig={onChangeMaterialConfig}
          onOpenFullModal={onOpenMaterialModal}
          onNotify={onNotify}
        />

        <button
          type="button"
          onClick={onOpenActivityDrawer}
          title="Open Live Packet Inspector & Frame Exchange Drawer"
          className="min-h-[34px] px-3 py-1 rounded-full text-xs font-mono m3-surface-low hover:bg-[var(--m3-surface-container-high)] flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer tabular-nums"
        >
          <Activity className="w-3.5 h-3.5 text-[var(--m3-primary)]" />
          <span className="hidden xl:inline font-sans font-medium">Inspector</span>
          <span className="text-[11px] m3-text-muted">{frameLogCount}</span>
        </button>

        <button
          type="button"
          onClick={onOpenStandaloneModal}
          className="min-h-[36px] px-4 py-1.5 text-xs font-semibold m3-btn-filled rounded-full cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Single-File</span>
        </button>
      </div>
    </header>
  );
};
