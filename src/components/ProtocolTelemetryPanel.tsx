import React, { useRef, useState } from 'react';
import {
  Download,
  FileText,
  FileUp,
  Lock,
  Palette,
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
  onOpenMaterialSettings,
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

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
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
    <div className="flex flex-col gap-5">
      {/* 1. Role Selector, File Drop Zone & Framing Parameters */}
      <div className="m3-surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">
              01. Device Role & Optical File Drop Zone
            </h2>
            <p className="text-xs m3-text-muted mt-0.5">
              Drop any file below to frame into high-density optical QR packets.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenMaterialSettings}
              className="min-h-[42px] px-3 py-1.5 text-xs font-semibold m3-btn-tonal flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Material You Style</span>
            </button>

            <button
              type="button"
              onClick={onToggleWakeLock}
              aria-pressed={wakeLockActive}
              className={`min-h-[42px] px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                wakeLockActive ? 'm3-btn-tonal' : 'm3-btn-outlined'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {wakeLockActive
                  ? 'Wake Lock: Active'
                  : wakeLockSupported
                  ? 'Wake Lock'
                  : 'Keep Awake'}
              </span>
            </button>
          </div>
        </div>

        {/* Interactive Role Segmented Control */}
        <div
          role="group"
          aria-label="Select Device Role"
          className="grid grid-cols-2 gap-2 p-1.5 m3-surface-low"
        >
          <button
            type="button"
            onClick={() => onSelectRole('SENDER')}
            aria-pressed={isSender}
            className={`min-h-[44px] px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              isSender ? 'm3-btn-filled shadow-sm' : 'm3-text-muted'
            }`}
          >
            Sender (Transmit File)
          </button>
          <button
            type="button"
            onClick={() => onSelectRole('RECEIVER')}
            aria-pressed={!isSender}
            className={`min-h-[44px] px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              !isSender ? 'm3-btn-filled shadow-sm' : 'm3-text-muted'
            }`}
          >
            Receiver (Scan & Assemble)
          </button>
        </div>

        {/* Interactive Drag-and-Drop File Zone for Optical QR Transmission */}
        <div
          data-testid="file-drop-zone"
          role="button"
          tabIndex={0}
          aria-label="Drop file here or click to select file for QR transfer"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          style={{
            borderColor: isDraggingOver
              ? 'var(--m3-primary)'
              : 'var(--m3-outline)',
            borderRadius: 'var(--m3-radius-md)',
          }}
          className={`border-2 border-dashed p-5 flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer transition-all ${
            isDraggingOver ? 'm3-btn-tonal scale-[1.01]' : 'm3-surface-low'
          }`}
        >
          <div className="flex items-center gap-3.5 text-center sm:text-left">
            <div className="w-12 h-12 flex items-center justify-center m3-btn-tonal shrink-0">
              <FileUp className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold">
                {isDraggingOver
                  ? 'Release to Frame File into Optical QR Packets'
                  : 'Drag & Drop Any File Here, or Click to Browse'}
              </div>
              <div className="text-xs m3-text-muted mt-0.5">
                {activeFile ? (
                  <span className="font-mono">
                    Active: {activeFile.name} · {activeFile.size} B ·{' '}
                    {activeFile.totalChunks} QR frames · Hash{' '}
                    {activeFile.fileHash.slice(0, 10)}
                  </span>
                ) : (
                  <span>
                    Supports binary, documents, images, JSON, or archives — 100% offline browser framing
                  </span>
                )}
              </div>
            </div>
          </div>

          <span className="min-h-[40px] px-4 py-2 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 whitespace-nowrap shrink-0">
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

        {/* Framing & Scan Cadence Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs m3-text-muted">
              QR Payload Chunk Size (Bytes)
            </span>
            <div className="grid grid-cols-3 gap-1.5 p-1 m3-surface-low">
              {[250, 350, 500].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onChangeChunkSize(size)}
                  className={`min-h-[38px] px-2 py-1 text-xs font-mono whitespace-nowrap shrink-0 cursor-pointer ${
                    chunkSize === size ? 'm3-btn-tonal font-semibold' : 'm3-text-muted'
                  }`}
                >
                  {size} B
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs m3-text-muted">
              Camera Scan Throttling Interval
            </span>
            <div className="grid grid-cols-3 gap-1.5 p-1 m3-surface-low">
              {[50, 75, 100].map((ms) => (
                <button
                  key={ms}
                  type="button"
                  onClick={() => onChangeScanInterval(ms)}
                  className={`min-h-[38px] px-2 py-1 text-xs font-mono whitespace-nowrap shrink-0 cursor-pointer ${
                    scanIntervalMs === ms
                      ? 'm3-btn-tonal font-semibold'
                      : 'm3-text-muted'
                  }`}
                >
                  {ms} ms
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Deterministic Sample Payloads & Reset */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t"
          style={{ borderColor: 'var(--m3-outline-variant)' }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs m3-text-muted mr-1">
              Sample Payloads:
            </span>
            <button
              type="button"
              onClick={() => onLoadPresetFile('TELEMETRY')}
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>calibration-telemetry.json (1.4 KB)</span>
            </button>
            <button
              type="button"
              onClick={() => onLoadPresetFile('SPEC')}
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>optical-arq-protocol.txt (2.4 KB)</span>
            </button>
            <button
              type="button"
              onClick={() => onLoadPresetFile('SVG')}
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>reticle-diagram.svg (950 B)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onResetSession}
            className="min-h-[38px] px-3 py-1.5 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Session</span>
          </button>
        </div>
      </div>

      {/* 2. Live ARQ Status, Progress Bar & Precision Telemetry Grid */}
      <div className="m3-surface-card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">
            02. Stop-and-Wait Optical ARQ Telemetry
          </h2>
          <span className="text-xs font-mono m3-text-muted">
            {isSender
              ? `PHASE: ${senderState.phase}`
              : `PHASE: ${receiverState.phase}`}
          </span>
        </div>

        {/* Status Indicator Banner */}
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-3 m3-surface-high text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        >
          <span>{statusMessage}</span>
          <span className="font-semibold whitespace-nowrap shrink-0">
            {statusLabelPrefix}
          </span>
        </div>

        {/* Expressive Material 3 Progress Track */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-mono m3-text-muted">
            <span>
              OPTICAL TRANSFER PROGRESS ({transferredBytes} / {totalBytes} B)
            </span>
            <span className="font-semibold tabular-nums">
              {metrics.progressPercent.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-3.5 m3-surface-low overflow-hidden p-0.5">
            <div
              className="h-full transition-all duration-150 rounded-full"
              style={{
                width: `${metrics.progressPercent}%`,
                backgroundColor: 'var(--m3-primary)',
              }}
            />
          </div>
        </div>

        {/* 4-Card Precision Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="m3-surface-low p-3">
            <div className="text-xs m3-text-muted">Chunks Verified</div>
            <div
              data-testid="metric-chunks"
              className="mt-1 text-xl font-mono font-semibold tabular-nums"
            >
              {completedChunks} / {totalChunks}
            </div>
          </div>

          <div className="m3-surface-low p-3">
            <div className="text-xs m3-text-muted">Transfer Speed</div>
            <div
              data-testid="metric-speed"
              className="mt-1 text-xl font-mono font-semibold tabular-nums"
            >
              {metrics.speedKBps.toFixed(2)}
              <span className="text-xs m3-text-muted ml-1">KB/s</span>
            </div>
          </div>

          <div className="m3-surface-low p-3">
            <div className="text-xs m3-text-muted">CRC Resends</div>
            <div
              data-testid="metric-errors"
              className="mt-1 text-xl font-mono font-semibold tabular-nums"
            >
              {errorCount}
            </div>
          </div>

          <div className="m3-surface-low p-3">
            <div className="text-xs m3-text-muted">Elapsed / ETA</div>
            <div className="mt-1 text-xl font-mono font-semibold tabular-nums">
              {metrics.elapsedSeconds.toFixed(1)}s
              <span className="text-xs m3-text-muted ml-1">
                ({metrics.etaSeconds}s)
              </span>
            </div>
          </div>
        </div>

        {/* Optical Peer Loopback Simulator */}
        <div
          className="pt-3 border-t flex flex-col gap-2.5"
          style={{ borderColor: 'var(--m3-outline-variant)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              Face-to-Face Optical Transceiver Loopback (Single-Screen Verification)
            </span>
            <span className="text-[11px] font-mono m3-text-muted">
              INIT → ACK:0 → DATA → FIN
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleLoopback}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {loopbackRunning
                  ? 'Pause Optical Loopback'
                  : 'Auto-Stream Optical Transfer'}
              </span>
            </button>

            <button
              type="button"
              onClick={onStepLoopback}
              className="min-h-[44px] px-3.5 py-2 text-xs font-medium m3-btn-tonal flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <StepForward className="w-3.5 h-3.5" />
              <span>Step Next Frame</span>
            </button>

            <button
              type="button"
              onClick={onInjectCrcError}
              className="min-h-[44px] px-3.5 py-2 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Inject Bad CRC Frame</span>
            </button>

            {receiverState.assembledBytes && (
              <button
                type="button"
                onClick={onDownloadReceivedFile}
                className="min-h-[44px] px-3.5 py-2 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  Download Received ({receiverState.metadata?.name})
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Active Frame JSON Packet Inspector & Frame Exchange Log */}
      <div
        id="packet-log-section"
        className="m3-surface-card p-5 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">
            03. Optical Frame JSON Payload & ARQ Exchange Log
          </h2>
          <span className="text-xs font-mono m3-text-muted">
            {activePacket ? `ACTIVE: ${activePacket.type}` : 'IDLE'}
          </span>
        </div>

        <pre
          data-testid="active-packet-json"
          className="m3-surface-low p-3 text-xs font-mono overflow-x-auto max-h-36"
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

        {/* Scrollable Recent Optical Frame Exchange History */}
        <div
          className="m3-surface-low divide-y max-h-44 overflow-y-auto"
          style={{ borderColor: 'var(--m3-outline-variant)' }}
        >
          {frameLogs.length === 0 ? (
            <div className="p-3 text-xs font-mono m3-text-muted">
              No optical frames exchanged yet. Drop a file, start camera, or click &ldquo;Step Next Frame&rdquo;.
            </div>
          ) : (
            frameLogs.map((entry) => (
              <div
                key={entry.id}
                className="px-3 py-2 text-xs font-mono flex items-center justify-between gap-3"
                style={{ borderColor: 'var(--m3-outline-variant)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="m3-text-muted shrink-0">
                    {entry.timestamp}
                  </span>
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
