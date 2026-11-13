import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileUp,
  Lock,
  Play,
  RotateCcw,
  ShieldAlert,
  StepForward,
} from 'lucide-react';
import {
  DeviceRole,
  OpticalPacket,
  PreparedTransferFile,
  ReceiverSessionState,
  SenderSessionState,
  calculateTransferMetrics,
  serializePacket,
} from '../utils/opticalProtocol';
import { ChunksInspector } from './ChunksInspector';

export interface FrameLogEntry {
  id: number;
  timestamp: string;
  direction: 'EMIT' | 'SCAN';
  packetType: string;
  summary: string;
  status: 'OK' | 'WARN' | 'COMPLETE';
}

interface ProtocolTelemetryPanelProps {
  role: DeviceRole;
  onSelectRole: (role: DeviceRole) => void;
  senderState: SenderSessionState;
  receiverState: ReceiverSessionState;
  chunkSize: number;
  onChangeChunkSize: (bytes: number) => void;
  scanIntervalMs: number;
  onChangeScanInterval: (ms: number) => void;
  onFileUpload: (file: File) => void;
  onLoadPresetFile: (presetKey: 'TELEMETRY' | 'SPEC' | 'SVG') => void;
  onResetSession: () => void;
  loopbackRunning: boolean;
  onToggleLoopback: () => void;
  onStepLoopback: () => void;
  onInjectCrcError: () => void;
  wakeLockActive: boolean;
  wakeLockSupported: boolean;
  onToggleWakeLock: () => void;
  frameLogs: FrameLogEntry[];
  onDownloadReceivedFile: () => void;
  onOpenMaterialSettings: () => void;
}

export const ProtocolTelemetryPanel: React.FC<ProtocolTelemetryPanelProps> = ({
  role,
  onSelectRole,
  senderState,
  receiverState,
  chunkSize,
  onChangeChunkSize,
  scanIntervalMs,
  onChangeScanInterval,
  onFileUpload,
  onLoadPresetFile,
  onResetSession,
  loopbackRunning,
  onToggleLoopback,
  onStepLoopback,
  onInjectCrcError,
  wakeLockActive,
  wakeLockSupported,
  onToggleWakeLock,
  frameLogs,
  onDownloadReceivedFile,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isSender = role === 'SENDER';
  const activePacket: OpticalPacket | null = isSender
    ? senderState.activePacket
    : receiverState.activePacket;

  const totalChunks = isSender
    ? senderState.file?.totalChunks ?? 0
    : receiverState.metadata?.total ?? 0;

  const completedChunks = isSender
    ? senderState.ackedChunks
    : receiverState.receivedChunks.size;

  const totalBytes = isSender
    ? senderState.file?.size ?? 0
    : receiverState.metadata?.size ?? 0;

  const transferredBytes = isSender
    ? senderState.bytesTransferred
    : receiverState.bytesReceived;

  const startTimeMs = isSender
    ? senderState.startTimeMs
    : receiverState.startTimeMs;

  const completedTimeMs = isSender
    ? senderState.completedTimeMs
    : receiverState.completedTimeMs;

  const errorCount = isSender
    ? senderState.resendCount
    : receiverState.crcErrorCount;

  const statusMessage = isSender
    ? senderState.statusMessage
    : receiverState.statusMessage;

  const ledState = isSender ? senderState.ledState : receiverState.ledState;

  const metrics = calculateTransferMetrics(
    transferredBytes,
    totalBytes,
    startTimeMs,
    completedTimeMs
  );

  const activeFile: PreparedTransferFile | null = senderState.file;

  // Convert receiverState.receivedChunks Map<number, Uint8Array> into Record<number, Uint8Array> for ChunksInspector
  const receiverDecodedMap = useMemo(() => {
    const rec: Record<number, Uint8Array> = {};
    receiverState.receivedChunks.forEach((bytes, idx) => {
      rec[idx] = bytes;
    });
    return rec;
  }, [receiverState.receivedChunks]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      onSelectRole('SENDER');
      onFileUpload(droppedFile);
    }
  };

  const statusLabelPrefix =
    ledState === 'ACK_PULSE'
      ? '▲ ACK LOCKED'
      : ledState === 'RESEND_WARN'
      ? '✖ CRC RESEND'
      : ledState === 'COMPLETE'
      ? '✔ COMPLETE'
      : '● WAITING';

  return (
    <div className="flex flex-col gap-3">
      {/* Role & Configuration Panel */}
      <div className="m3-surface-card overflow-hidden flex flex-col divide-y divide-[var(--m3-outline-variant)]">
        <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Stop-and-Wait Optical ARQ
            </h2>
            <p className="text-[11px] m3-text-muted">
              Bidirectional face-to-face handshake (INIT → ACK:0 → DATA → FIN)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleWakeLock}
              aria-pressed={wakeLockActive}
              className={`min-h-[32px] px-3 py-1 text-xs font-medium flex items-center gap-1.5 rounded-full cursor-pointer border ${
                wakeLockActive
                  ? 'm3-btn-tonal'
                  : 'border-[var(--m3-outline-variant)] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {wakeLockActive
                  ? 'Wake Lock On'
                  : wakeLockSupported
                  ? 'Wake Lock'
                  : 'Keep Awake'}
              </span>
            </button>

            <button
              type="button"
              onClick={onResetSession}
              className="min-h-[32px] px-3 py-1 text-xs font-medium border border-[var(--m3-outline-variant)] text-zinc-400 hover:text-zinc-200 rounded-full flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Role Selector */}
        <div className="p-4 flex flex-col gap-3">
          <div
            role="group"
            aria-label="Select Device Role"
            className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] rounded-full"
          >
            <button
              type="button"
              onClick={() => onSelectRole('SENDER')}
              aria-pressed={isSender}
              className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-full cursor-pointer transition-colors ${
                isSender ? 'm3-btn-filled shadow-xs' : 'm3-text-muted hover:text-white'
              }`}
            >
              Sender (Transmit File)
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('RECEIVER')}
              aria-pressed={!isSender}
              className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-full cursor-pointer transition-colors ${
                !isSender ? 'm3-btn-filled shadow-xs' : 'm3-text-muted hover:text-white'
              }`}
            >
              Receiver (Scan &amp; Assemble)
            </button>
          </div>

          {/* Sender File Selection (Strictly only displayed when role === 'SENDER') */}
          {isSender && (
            <>
              <div
                data-testid="file-drop-zone"
                role="button"
                tabIndex={0}
                aria-label="Drop file here or click to select file for QR transfer"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(false);
                }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                style={{ borderRadius: 'var(--m3-radius-md)' }}
                className={`border border-dashed px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-all ${
                  isDraggingOver
                    ? 'border-[var(--m3-primary)] m3-btn-tonal'
                    : 'border-[var(--m3-outline)] bg-[var(--m3-surface-container-low)]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[var(--m3-surface-container-high)] text-[var(--m3-primary)] flex items-center justify-center shrink-0">
                    <FileUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {activeFile ? activeFile.name : 'Select file to transmit'}
                    </div>
                    <div className="text-[11px] font-mono m3-text-muted truncate tabular-nums">
                      {activeFile
                        ? `${activeFile.size} B · ${activeFile.totalChunks} QR frames · CRC ${activeFile.fileHash.slice(
                            0,
                            8
                          )}`
                        : 'Drop any file or click to browse'}
                    </div>
                  </div>
                </div>

                <span className="min-h-[30px] px-3 py-1 text-xs font-semibold m3-btn-tonal rounded-full shrink-0 flex items-center">
                  Choose File
                </span>

                <input
                  ref={fileInputRef}
                  type="file"
                  aria-label="Choose File Input"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[11px] m3-text-muted">Samples:</span>
                  <button
                    type="button"
                    onClick={() => onLoadPresetFile('TELEMETRY')}
                    className="text-[11px] font-mono text-zinc-400 hover:text-[var(--m3-primary)] cursor-pointer"
                  >
                    telemetry.json
                  </button>
                  <span className="text-zinc-700">·</span>
                  <button
                    type="button"
                    onClick={() => onLoadPresetFile('SPEC')}
                    className="text-[11px] font-mono text-zinc-400 hover:text-[var(--m3-primary)] cursor-pointer"
                  >
                    protocol.txt
                  </button>
                  <span className="text-zinc-700">·</span>
                  <button
                    type="button"
                    onClick={() => onLoadPresetFile('SVG')}
                    className="text-[11px] font-mono text-zinc-400 hover:text-[var(--m3-primary)] cursor-pointer"
                  >
                    reticle.svg
                  </button>
                </div>

                <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                  <span className="font-sans m3-text-muted">Chunk:</span>
                  {[250, 350, 500].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onChangeChunkSize(size)}
                      className={`px-2 py-0.5 rounded-full cursor-pointer ${
                        chunkSize === size
                          ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-primary)] font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {size}B
                    </button>
                  ))}
                  <span className="font-sans m3-text-muted ml-1">Scan:</span>
                  {[50, 75, 100].map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      onClick={() => onChangeScanInterval(ms)}
                      className={`px-2 py-0.5 rounded-full cursor-pointer ${
                        scanIntervalMs === ms
                          ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-primary)] font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {ms}ms
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Hairline 4-Column ARQ Telemetry Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)]/40 font-mono tabular-nums">
          <div className="px-4 py-3">
            <div className="text-[11px] font-sans m3-text-muted">Verified</div>
            <div
              data-testid="metric-chunks"
              className="text-sm font-semibold mt-0.5"
            >
              {completedChunks} / {totalChunks}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] font-sans m3-text-muted">Throughput</div>
            <div
              data-testid="metric-speed"
              className="text-sm font-semibold mt-0.5 text-[var(--m3-primary)]"
            >
              {metrics.speedKBps.toFixed(2)} KB/s
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] font-sans m3-text-muted">CRC Resends</div>
            <div
              data-testid="metric-errors"
              className="text-sm font-semibold mt-0.5"
            >
              {errorCount}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] font-sans m3-text-muted">Elapsed</div>
            <div className="text-sm font-semibold mt-0.5">
              {metrics.elapsedSeconds.toFixed(1)}s
            </div>
          </div>
        </div>

        {/* Status & Loopback Test Actions */}
        <div className="px-5 py-3.5 flex flex-col gap-3">
          <div
            role="status"
            aria-live="polite"
            className="text-[11px] font-mono flex items-center justify-between gap-2"
          >
            <span className="truncate m3-text-muted">{statusMessage}</span>
            <span className="font-semibold text-[var(--m3-primary)] whitespace-nowrap shrink-0">
              {statusLabelPrefix}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleLoopback}
              className="min-h-[34px] px-3.5 py-1 text-xs font-semibold m3-btn-filled rounded-full flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {loopbackRunning ? 'Pause Loopback' : 'Auto-Stream Loopback'}
              </span>
            </button>

            <button
              type="button"
              onClick={onStepLoopback}
              className="min-h-[34px] px-3 py-1 text-xs font-medium m3-btn-tonal rounded-full flex items-center gap-1.5 cursor-pointer"
            >
              <StepForward className="w-3.5 h-3.5" />
              <span>Step Frame</span>
            </button>

            <button
              type="button"
              onClick={onInjectCrcError}
              className="min-h-[34px] px-3 py-1 text-xs font-medium border border-[var(--m3-outline-variant)] text-zinc-300 rounded-full flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Inject Bad CRC</span>
            </button>

            {!isSender && receiverState.assembledBytes && (
              <button
                type="button"
                onClick={onDownloadReceivedFile}
                className="min-h-[34px] px-3.5 py-1 text-xs font-semibold m3-btn-filled rounded-full flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save ({receiverState.metadata?.name})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Receiver Decoded & Undecoded Chunks Inspector (Shown when role === 'RECEIVER') */}
      {!isSender && (
        <ChunksInspector
          fileMetadata={
            receiverState.metadata
              ? {
                  name: receiverState.metadata.name,
                  chunks: receiverState.metadata.total,
                }
              : null
          }
          decodedChunks={receiverDecodedMap}
          receivedCount={receiverState.receivedChunks.size}
          isComplete={receiverState.phase === 'COMPLETE'}
          reconstructedBytes={receiverState.assembledBytes}
          onTriggerDownload={onDownloadReceivedFile}
        />
      )}

      {/* Active Packet JSON & Exchange Log */}
      <div className="m3-surface-card overflow-hidden flex flex-col divide-y divide-[var(--m3-outline-variant)]">
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold">
            Frame JSON &amp; Exchange Log
          </span>
          <span className="text-[11px] font-mono m3-text-muted">
            {activePacket ? `Active: ${activePacket.type}` : 'Idle'}
          </span>
        </div>

        <pre
          data-testid="active-packet-json"
          className="bg-[var(--m3-surface-container-low)]/50 px-5 py-3 text-[11px] font-mono overflow-x-auto max-h-28"
        >
          {activePacket
            ? JSON.stringify(activePacket, null, 2)
            : serializePacket({
                type: 'INIT',
                name: 'awaiting-file.bin',
                size: 0,
                mime: 'application/octet-stream',
                total: 1,
                hash: '000000000000000000000000',
              })}
        </pre>

        <div className="divide-y divide-[var(--m3-outline-variant)] max-h-36 overflow-y-auto">
          {frameLogs.length === 0 ? (
            <div className="px-5 py-3 text-[11px] font-mono m3-text-muted">
              No frames exchanged yet.
            </div>
          ) : (
            frameLogs.map((entry) => (
              <div
                key={entry.id}
                className="px-5 py-2 text-[11px] font-mono flex items-center justify-between gap-2 tabular-nums"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="m3-text-muted shrink-0">{entry.timestamp}</span>
                  <span className="font-semibold shrink-0">
                    {entry.direction} [{entry.packetType}]
                  </span>
                  <span className="truncate">{entry.summary}</span>
                </div>
                <span className="font-semibold shrink-0">{entry.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
