import React from 'react';
import { Cpu, FileArchive, Layers, ShieldCheck, Lock } from 'lucide-react';
import { PreparedAirgapTransfer } from '../utils/airgapStreamProtocol';
import { HeaderWorkspaceMode } from './Header';

interface TelemetrySummaryStripProps {
  workspaceMode: HeaderWorkspaceMode;
  preparedTransfer: PreparedAirgapTransfer;
  chunkSize: number;
  wakeLockActive: boolean;
  onToggleWakeLock: () => void;
  arqCompletedChunks: number;
  arqTotalChunks: number;
  arqSpeedKBps: number;
}

export const TelemetrySummaryStrip: React.FC<TelemetrySummaryStripProps> = ({
  workspaceMode,
  preparedTransfer,
  chunkSize,
  wakeLockActive,
  onToggleWakeLock,
  arqCompletedChunks,
  arqTotalChunks,
  arqSpeedKBps,
}) => {
  return (
    <section
      aria-label="Real-Time Optical Telemetry Summary"
      className="m3-surface-card overflow-hidden grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[var(--m3-outline-variant)]"
    >
      {/* Metric 1: Active Payload & Gzip Compression */}
      <div className="px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] m3-text-muted font-medium">
            <FileArchive className="w-3.5 h-3.5 text-[var(--m3-primary)] shrink-0" />
            <span>Active Source Payload</span>
          </div>
          <div className="text-sm font-semibold tracking-tight truncate mt-0.5">
            {preparedTransfer.name}
          </div>
          <div className="text-[11px] font-mono m3-text-muted tabular-nums mt-0.5">
            {preparedTransfer.originalSize.toLocaleString()} B →{' '}
            <span className="text-[var(--m3-primary)] font-semibold">
              {preparedTransfer.compressedSize.toLocaleString()} B
            </span>{' '}
            ({preparedTransfer.compressionRatioPct > 0 ? `-${preparedTransfer.compressionRatioPct}%` : '0%'} Gzip)
          </div>
        </div>
      </div>

      {/* Metric 2: Optical Frame Density */}
      <div className="px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] m3-text-muted font-medium">
            <Layers className="w-3.5 h-3.5 text-[var(--m3-primary)] shrink-0" />
            <span>Optical Frame Schedule</span>
          </div>
          <div className="text-sm font-mono font-semibold tracking-tight tabular-nums mt-0.5">
            {preparedTransfer.totalChunks} Chunks{' '}
            <span className="text-xs font-normal m3-text-muted">+ 1 Meta</span>
          </div>
          <div className="text-[11px] font-mono m3-text-muted tabular-nums mt-0.5">
            {chunkSize} B/frame · ECC-L High-Contrast
          </div>
        </div>
      </div>

      {/* Metric 3: 60Hz Capture Engine & ARQ Link Status */}
      <div className="px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] m3-text-muted font-medium">
            <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              {workspaceMode === 'ARQ'
                ? 'Stop-and-Wait ARQ Link'
                : '60Hz Optical Decoder'}
            </span>
          </div>
          <div className="text-sm font-mono font-semibold tracking-tight tabular-nums mt-0.5">
            {workspaceMode === 'ARQ'
              ? `${arqCompletedChunks} / ${arqTotalChunks} Verified`
              : '360×360 Center ROI'}
          </div>
          <div className="text-[11px] font-mono m3-text-muted tabular-nums mt-0.5">
            {workspaceMode === 'ARQ'
              ? `${arqSpeedKBps.toFixed(2)} KB/s · CRC32 Guard`
              : 'BarcodeDetector + O(1) Dedupe'}
          </div>
        </div>
      </div>

      {/* Metric 4: Air-Gapped Security & Screen Wake Lock */}
      <div className="px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] m3-text-muted font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Air-Gap Isolation</span>
          </div>
          <div className="text-sm font-semibold tracking-tight mt-0.5">
            Zero Network Signaling
          </div>
          <div className="text-[11px] font-mono m3-text-muted mt-0.5">
            Sender never auto-downloads
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleWakeLock}
          aria-pressed={wakeLockActive}
          title="Keep screen awake during long optical transfers"
          className={`min-h-[30px] px-2.5 py-1 rounded-full text-[11px] font-mono flex items-center gap-1 border transition-all active:scale-95 cursor-pointer shrink-0 ${
            wakeLockActive
              ? 'm3-btn-tonal'
              : 'border-[var(--m3-outline-variant)] m3-text-muted hover:text-[var(--m3-on-surface)]'
          }`}
        >
          <Lock className="w-3 h-3" />
          <span>{wakeLockActive ? 'Awake' : 'Wake'}</span>
        </button>
      </div>
    </section>
  );
};
