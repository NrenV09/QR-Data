import React, { useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  RotateCcw,
  ShieldAlert,
  StepForward,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { FrameLogEntry } from './ProtocolTelemetryPanel';
import { OpticalPacket, serializePacket } from '../utils/opticalProtocol';
import { PreparedAirgapTransfer } from '../utils/airgapStreamProtocol';

interface ActivityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  frameLogs: FrameLogEntry[];
  onClearLogs: () => void;
  activePacket: OpticalPacket | null;
  preparedTransfer: PreparedAirgapTransfer;
  onStepLoopback: () => void;
  onInjectCrcError: () => void;
  onResetSession: () => void;
}

export const ActivityDrawer: React.FC<ActivityDrawerProps> = ({
  isOpen,
  onClose,
  frameLogs,
  onClearLogs,
  activePacket,
  preparedTransfer,
  onStepLoopback,
  onInjectCrcError,
  onResetSession,
}) => {
  const [copiedJson, setCopiedJson] = useState(false);

  if (!isOpen) return null;

  const formattedJson = activePacket
    ? JSON.stringify(activePacket, null, 2)
    : serializePacket({
        type: 'INIT',
        name: preparedTransfer.name,
        size: preparedTransfer.originalSize,
        mime: 'application/octet-stream',
        total: preparedTransfer.totalChunks,
        hash: '000000000000000000000000',
      });

  const handleCopyJson = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(formattedJson).catch(() => {});
    }
    setCopiedJson(true);
    window.setTimeout(() => setCopiedJson(false), 1600);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Optical Packet Inspector and Activity Drawer"
      className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-xs transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg h-full bg-[var(--m3-surface-container)] border-l border-[var(--m3-outline-variant)] shadow-2xl flex flex-col justify-between overflow-hidden">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-[var(--m3-outline-variant)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--m3-primary)]/15 border border-[var(--m3-primary)]/30 flex items-center justify-center text-[var(--m3-primary)]">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                Optical Packet &amp; Telemetry Inspector
              </h2>
              <p className="text-[11px] m3-text-muted">
                Live ARQ frame exchange log, Gzip manifest &amp; fault injection
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Inspector Drawer"
            className="p-1.5 rounded-full m3-surface-low hover:bg-[var(--m3-surface-container-high)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--m3-outline-variant)]">
          {/* Section 1: Active Gzip Stream Metadata */}
          <div className="p-6 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">Gzip Stream Manifest (Frame 0)</span>
              <span className="font-mono text-[11px] text-[var(--m3-primary)] tabular-nums">
                {preparedTransfer.metadataJson.length} B JSON
              </span>
            </div>
            <pre className="p-3.5 rounded-xl bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-[11px] font-mono overflow-x-auto">
              {preparedTransfer.metadataJson}
            </pre>
          </div>

          {/* Section 2: Active ARQ Frame JSON */}
          <div className="p-6 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">
                Active ARQ Packet ({activePacket ? activePacket.type : 'INIT'})
              </span>
              <button
                type="button"
                onClick={handleCopyJson}
                className="text-xs font-mono m3-text-muted hover:text-[var(--m3-on-surface)] flex items-center gap-1 cursor-pointer"
              >
                {copiedJson ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied JSON</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-[11px] font-mono overflow-x-auto max-h-44">
              {formattedJson}
            </pre>

            {/* Quick Protocol Diagnostic Actions */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onStepLoopback}
                className="min-h-[32px] px-3 py-1 rounded-full text-xs font-medium m3-btn-tonal flex items-center gap-1.5 cursor-pointer"
              >
                <StepForward className="w-3.5 h-3.5" />
                <span>Step ARQ Frame</span>
              </button>
              <button
                type="button"
                onClick={onInjectCrcError}
                className="min-h-[32px] px-3 py-1 rounded-full text-xs font-medium border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface-container-high)] flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Inject Bad CRC</span>
              </button>
              <button
                type="button"
                onClick={onResetSession}
                className="min-h-[32px] px-3 py-1 rounded-full text-xs font-medium border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface-container-high)] flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset ARQ</span>
              </button>
            </div>
          </div>

          {/* Section 3: Frame Exchange Log */}
          <div className="p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-semibold">
                <Activity className="w-3.5 h-3.5 text-[var(--m3-primary)]" />
                <span>Frame Exchange Log ({frameLogs.length})</span>
              </div>
              {frameLogs.length > 0 && (
                <button
                  type="button"
                  onClick={onClearLogs}
                  className="text-xs font-mono m3-text-muted hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="rounded-xl border border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)] divide-y divide-[var(--m3-outline-variant)] max-h-72 overflow-y-auto">
              {frameLogs.length === 0 ? (
                <div className="p-6 text-center text-xs m3-text-muted">
                  No optical frames logged yet. Upload a file or step the ARQ loopback to inspect packets.
                </div>
              ) : (
                frameLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="px-4 py-2.5 text-[11px] font-mono flex items-center justify-between gap-2 tabular-nums"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="m3-text-muted shrink-0">
                        {entry.timestamp}
                      </span>
                      <span className="font-semibold text-[var(--m3-primary)] shrink-0">
                        {entry.direction} [{entry.packetType}]
                      </span>
                      <span className="truncate">{entry.summary}</span>
                    </div>
                    <span
                      className={`font-semibold shrink-0 ${
                        entry.status === 'WARN'
                          ? 'text-amber-400'
                          : entry.status === 'COMPLETE'
                          ? 'text-emerald-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="px-6 py-3.5 border-t border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)] flex items-center justify-between text-xs">
          <span className="font-mono text-[11px] m3-text-muted">
            100% Client-Side Optical Protocol
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] px-4 py-1 text-xs font-semibold m3-btn-filled rounded-full cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
