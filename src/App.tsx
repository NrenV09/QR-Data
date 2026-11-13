/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OpticalViewport } from './components/OpticalViewport';
import {
  FrameLogEntry,
  ProtocolTelemetryPanel,
} from './components/ProtocolTelemetryPanel';
import { StandaloneModal } from './components/StandaloneModal';
import { MaterialYouSettingsModal } from './components/MaterialYouSettingsModal';
import { AirgapStreamView } from './components/AirgapStreamView';
import { Header, HeaderWorkspaceMode } from './components/Header';
import { TelemetrySummaryStrip } from './components/TelemetrySummaryStrip';
import { ActivityDrawer } from './components/ActivityDrawer';
import { ToastContainer, ToastMessage, ToastTone } from './components/ToastContainer';
import {
  DeviceRole,
  OpticalPacket,
  ReceiverSessionState,
  SenderSessionState,
  calculateTransferMetrics,
  createInitialReceiverState,
  parseOpticalPacket,
  prepareFileForOpticalTransfer,
  serializePacket,
  startSenderSession,
  stepReceiverState,
  stepSenderState,
} from './utils/opticalProtocol';
import { prepareAirgappedGeneratorPayload } from './utils/airgapStreamProtocol';
import {
  DEFAULT_MATERIAL_CONFIG,
  MaterialYouConfig,
  resolveMaterialYouTokens,
} from './utils/materialYouTheme';
import { usePWAOfflineEngine } from './utils/usePWA';

const THEME_STORAGE_KEY = 'optilink_m3_theme_v4';

export type AppWorkspaceMode = HeaderWorkspaceMode;

function loadStoredThemeConfig(): MaterialYouConfig {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_MATERIAL_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_MATERIAL_CONFIG,
      ...parsed,
    };
  } catch {
    return DEFAULT_MATERIAL_CONFIG;
  }
}

function createPresetPayload(presetKey: 'TELEMETRY' | 'SPEC' | 'SVG'): {
  name: string;
  mime: string;
  bytes: Uint8Array;
} {
  const encoder = new TextEncoder();

  if (presetKey === 'TELEMETRY') {
    const telemetryObj = {
      instrument: 'OptiLink-ARQ-720',
      protocol: 'Airgapped-QR-Gzip-Transfer',
      wavelengthNm: 532,
      calibrationMatrix: Array.from({ length: 16 }, (_, idx) => ({
        channel: idx,
        gainDb: +(1.25 + idx * 0.18).toFixed(3),
        snrRatio: +(28.4 - idx * 0.35).toFixed(2),
        crcVerified: true,
      })),
      notes:
        'Deterministic optical handshake telemetry payload for airgapped QR code transfer verification.',
    };
    return {
      name: 'calibration-telemetry.json',
      mime: 'application/json',
      bytes: encoder.encode(JSON.stringify(telemetryObj, null, 2)),
    };
  }

  if (presetKey === 'SVG') {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <rect width="240" height="240" rx="24" fill="#07090E"/>
  <rect x="28" y="28" width="184" height="184" rx="16" fill="none" stroke="#06B6D4" stroke-width="3" stroke-dasharray="10 6"/>
  <circle cx="120" cy="120" r="46" fill="none" stroke="#10B981" stroke-width="3"/>
  <path d="M120 56V184M56 120H184" stroke="#94A3B8" stroke-width="1.5"/>
  <text x="120" y="226" text-anchor="middle" fill="#F8FAFC" font-family="monospace" font-size="11">OPTICAL-ARQ-RETICLE</text>
</svg>`;
    return {
      name: 'reticle-diagram.svg',
      mime: 'image/svg+xml',
      bytes: encoder.encode(svgContent),
    };
  }

  const specLines = [
    'OPTILINK AIRGAPPED QR CODE TRANSFER SPECIFICATION',
    '=================================================',
    '1. Pako Gzip Stream Mode (/generator & /scanner): Compresses files with Gzip Level 9 and streams indexed QR chunks.',
    '2. Stop-and-Wait ARQ Mode: Bidirectional face-to-face optical handshake using INIT, DATA, ACK, and FIN frames.',
    '3. 100% Offline PWA: Works completely offline once loaded in the browser via Service Worker precaching.',
  ];
  const repeatedSpec = Array.from({ length: 5 }, (_, i) =>
    `[SECTION ${i + 1}]\n${specLines.join('\n')}`
  ).join('\n\n');

  return {
    name: 'optical-arq-protocol.txt',
    mime: 'text/plain',
    bytes: encoder.encode(repeatedSpec),
  };
}

export default function App() {
  const [workspaceMode, setWorkspaceMode] =
    useState<AppWorkspaceMode>('GENERATOR');
  const [role, setRole] = useState<DeviceRole>('SENDER');
  const [chunkSize, setChunkSize] = useState<number>(250);
  const [scanIntervalMs, setScanIntervalMs] = useState<number>(75);
  const [flipQr, setFlipQr] = useState<boolean>(false);
  const [mirrorCamera, setMirrorCamera] = useState<boolean>(true);
  const [standaloneModalOpen, setStandaloneModalOpen] =
    useState<boolean>(false);
  const [materialModalOpen, setMaterialModalOpen] = useState<boolean>(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [materialConfig, setMaterialConfig] = useState<MaterialYouConfig>(() =>
    loadStoredThemeConfig()
  );

  const {
    isOnline,
    swReady,
    isInstallable,
    isInstalled,
    isIOS,
    installApp,
  } = usePWAOfflineEngine();

  const pushToast = useCallback(
    (title: string, description?: string, tone: ToastTone = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const timestamp = new Date().toTimeString().split(' ')[0];
      setToasts((prev) => [
        ...prev.slice(-2),
        { id, title, description, tone, timestamp },
      ]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Apply Material You Android 16 dynamic color and shape tokens to root document
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(materialConfig));
    } catch {
      // Ignore storage quota errors
    }

    const tokens = resolveMaterialYouTokens(materialConfig);
    const root = document.documentElement;
    root.classList.toggle('dark', materialConfig.mode !== 'light');

    root.style.setProperty('--m3-primary', tokens.primary);
    root.style.setProperty('--m3-on-primary', tokens.onPrimary);
    root.style.setProperty('--m3-primary-container', tokens.primaryContainer);
    root.style.setProperty(
      '--m3-on-primary-container',
      tokens.onPrimaryContainer
    );
    root.style.setProperty(
      '--m3-secondary-container',
      tokens.secondaryContainer
    );
    root.style.setProperty(
      '--m3-on-secondary-container',
      tokens.onSecondaryContainer
    );
    root.style.setProperty('--m3-surface', tokens.surface);
    root.style.setProperty(
      '--m3-surface-container-low',
      tokens.surfaceContainerLow
    );
    root.style.setProperty('--m3-surface-container', tokens.surfaceContainer);
    root.style.setProperty(
      '--m3-surface-container-high',
      tokens.surfaceContainerHigh
    );
    root.style.setProperty('--m3-on-surface', tokens.onSurface);
    root.style.setProperty('--m3-on-surface-variant', tokens.onSurfaceVariant);
    root.style.setProperty('--m3-outline', tokens.outline);
    root.style.setProperty('--m3-outline-variant', tokens.outlineVariant);
    root.style.setProperty('--m3-radius-lg', tokens.radiusLg);
    root.style.setProperty('--m3-radius-md', tokens.radiusMd);
    root.style.setProperty('--m3-radius-sm', tokens.radiusSm);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', tokens.surface);
    }
  }, [materialConfig]);

  const [rawFileSource, setRawFileSource] = useState<{
    name: string;
    mime: string;
    bytes: Uint8Array;
  }>(() => createPresetPayload('TELEMETRY'));

  // Prepare Pako Gzip payload for Airgapped Generator / Scanner Mode
  const preparedAirgapTransfer = useMemo(
    () =>
      prepareAirgappedGeneratorPayload(
        rawFileSource.name,
        rawFileSource.bytes,
        chunkSize
      ),
    [rawFileSource, chunkSize]
  );

  const [senderState, setSenderState] = useState<SenderSessionState>(() => {
    const initialPreset = createPresetPayload('TELEMETRY');
    const prepared = prepareFileForOpticalTransfer(
      initialPreset.name,
      initialPreset.mime,
      initialPreset.bytes,
      250
    );
    return startSenderSession(prepared);
  });

  const [receiverState, setReceiverState] = useState<ReceiverSessionState>(() =>
    createInitialReceiverState()
  );

  const [loopbackRunning, setLoopbackRunning] = useState<boolean>(false);
  const [frameLogs, setFrameLogs] = useState<FrameLogEntry[]>([]);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  const logIdRef = useRef<number>(1);
  const wakeLockSentinelRef = useRef<{ release: () => Promise<void> } | null>(
    null
  );
  const autoDownloadedRef = useRef<boolean>(false);

  const wakeLockSupported =
    typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const appendFrameLog = useCallback(
    (
      direction: 'EMIT' | 'SCAN',
      packetType: string,
      summary: string,
      status: 'OK' | 'WARN' | 'COMPLETE' = 'OK'
    ) => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      setFrameLogs((prev) => [
        {
          id: logIdRef.current++,
          timestamp: timeStr,
          direction,
          packetType,
          summary,
          status,
        },
        ...prev.slice(0, 29),
      ]);
    },
    []
  );

  // Trigger file download helper
  const triggerBlobDownload = useCallback(
    (bytes: Uint8Array, filename: string, mime: string = 'application/octet-stream') => {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], {
        type: mime || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'optical-transfer.bin';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      pushToast(
        `Saved ${filename}`,
        `${bytes.byteLength.toLocaleString()} B verified & reconstructed`,
        'success'
      );
    },
    [pushToast]
  );

  // Automatically trigger file download ONLY when this device is explicitly the RECEIVER
  // The SENDER (Generator) transmitting the file must NEVER auto-download its own file
  useEffect(() => {
    if (
      role === 'RECEIVER' &&
      receiverState.phase === 'COMPLETE' &&
      receiverState.assembledBytes &&
      receiverState.metadata &&
      !autoDownloadedRef.current
    ) {
      autoDownloadedRef.current = true;
      triggerBlobDownload(
        receiverState.assembledBytes,
        receiverState.metadata.name,
        receiverState.metadata.mime
      );
    }
  }, [
    role,
    receiverState.phase,
    receiverState.assembledBytes,
    receiverState.metadata,
    triggerBlobDownload,
  ]);

  const handleCameraQrScanned = useCallback(
    (rawQr: string) => {
      const parsed = parseOpticalPacket(rawQr);
      if (!parsed) return;

      if (role === 'SENDER') {
        setSenderState((prev) => {
          if (prev.lastScannedRaw === rawQr) return prev;
          const next = stepSenderState(prev, rawQr);
          if (next !== prev) {
            appendFrameLog(
              'SCAN',
              parsed.type,
              next.statusMessage,
              next.ledState === 'RESEND_WARN'
                ? 'WARN'
                : next.ledState === 'COMPLETE'
                ? 'COMPLETE'
                : 'OK'
            );
          }
          return next;
        });
      } else {
        setReceiverState((prev) => {
          if (prev.lastScannedRaw === rawQr) return prev;
          const next = stepReceiverState(prev, rawQr);
          if (next !== prev) {
            appendFrameLog(
              'SCAN',
              parsed.type,
              next.statusMessage,
              next.ledState === 'RESEND_WARN'
                ? 'WARN'
                : next.ledState === 'COMPLETE'
                ? 'COMPLETE'
                : 'OK'
            );
          }
          return next;
        });
      }
    },
    [role, appendFrameLog]
  );

  const handleStepLoopback = useCallback(() => {
    if (
      senderState.phase === 'HANDSHAKE_INIT' &&
      senderState.activePacket?.type === 'INIT'
    ) {
      if (receiverState.phase === 'WAITING_INIT') {
        const initRaw = serializePacket(senderState.activePacket);
        const nextRecv = stepReceiverState(receiverState, initRaw);
        setReceiverState(nextRecv);
        appendFrameLog(
          'SCAN',
          'INIT',
          `Receiver scanned INIT (${senderState.activePacket.name}) → Emitting ACK: 0`,
          'OK'
        );
        return;
      }

      if (receiverState.activePacket?.type === 'ACK') {
        const ackRaw = serializePacket(receiverState.activePacket);
        const nextSender = stepSenderState(senderState, ackRaw);
        setSenderState(nextSender);
        appendFrameLog(
          'SCAN',
          'ACK',
          `Sender scanned Handshake ACK: 0 → Emitting DATA chunk #0`,
          'OK'
        );
        return;
      }
    }

    if (
      senderState.phase === 'TRANSMITTING' &&
      senderState.activePacket?.type === 'DATA'
    ) {
      const currentIdx = senderState.currentChunkIndex;

      if (receiverState.expectedChunkIndex === currentIdx) {
        const dataRaw = serializePacket(senderState.activePacket);
        const nextRecv = stepReceiverState(receiverState, dataRaw);
        setReceiverState(nextRecv);
        appendFrameLog(
          'SCAN',
          'DATA',
          nextRecv.statusMessage,
          nextRecv.phase === 'COMPLETE' ? 'COMPLETE' : 'OK'
        );
        return;
      }

      if (receiverState.activePacket) {
        const respRaw = serializePacket(receiverState.activePacket);
        const nextSender = stepSenderState(senderState, respRaw);
        setSenderState(nextSender);
        appendFrameLog(
          'SCAN',
          receiverState.activePacket.type,
          nextSender.statusMessage,
          nextSender.phase === 'COMPLETE' ? 'COMPLETE' : 'OK'
        );
        if (nextSender.phase === 'COMPLETE') {
          setLoopbackRunning(false);
        }
        return;
      }
    }

    if (
      senderState.phase === 'AWAITING_FIN' &&
      receiverState.activePacket?.type === 'FIN'
    ) {
      const finRaw = serializePacket(receiverState.activePacket);
      const nextSender = stepSenderState(senderState, finRaw);
      setSenderState(nextSender);
      setLoopbackRunning(false);
      appendFrameLog('SCAN', 'FIN', nextSender.statusMessage, 'COMPLETE');
    }
  }, [senderState, receiverState, appendFrameLog]);

  const handleInjectCrcError = useCallback(() => {
    if (!senderState.file) return;

    let currentRecv = receiverState;
    let currentSend = senderState;

    if (currentRecv.phase === 'WAITING_INIT') {
      const initRaw = serializePacket(senderState.file.initPacket);
      currentRecv = stepReceiverState(currentRecv, initRaw);
      const ackRaw = serializePacket(currentRecv.activePacket!);
      currentSend = stepSenderState(currentSend, ackRaw);
    }

    const chunkIdx = currentSend.currentChunkIndex;
    const validChunk =
      senderState.file.chunks[chunkIdx] ?? senderState.file.chunks[0];
    const corruptedPacket: OpticalPacket = {
      ...validChunk,
      crc: 'BAD0CRC1',
    };

    const nextRecv = stepReceiverState(
      currentRecv,
      serializePacket(corruptedPacket)
    );
    setReceiverState(nextRecv);

    if (nextRecv.activePacket) {
      const nextSend = stepSenderState(
        currentSend,
        serializePacket(nextRecv.activePacket)
      );
      setSenderState(nextSend);
    }

    appendFrameLog(
      'SCAN',
      'ACK:RESEND',
      `CRC mismatch on chunk #${chunkIdx} (expected ${validChunk.crc}, got BAD0CRC1) → Receiver emitted RESEND NACK`,
      'WARN'
    );
    pushToast(
      `Injected CRC Fault on Chunk #${chunkIdx}`,
      'Receiver emitted RESEND NACK frame',
      'warning'
    );
  }, [senderState, receiverState, appendFrameLog, pushToast]);

  useEffect(() => {
    if (!loopbackRunning) return;
    if (senderState.phase === 'COMPLETE') {
      setLoopbackRunning(false);
      return;
    }

    const timer = window.setInterval(() => {
      handleStepLoopback();
    }, 320);

    return () => window.clearInterval(timer);
  }, [loopbackRunning, senderState.phase, handleStepLoopback]);

  const startNewTransferSession = useCallback(
    (
      source: { name: string; mime: string; bytes: Uint8Array },
      newChunkSize: number
    ) => {
      autoDownloadedRef.current = false;
      setLoopbackRunning(false);
      const prepared = prepareFileForOpticalTransfer(
        source.name,
        source.mime,
        source.bytes,
        newChunkSize
      );
      setSenderState(startSenderSession(prepared));
      setReceiverState(createInitialReceiverState());
      appendFrameLog(
        'EMIT',
        'INIT',
        `Prepared "${source.name}" (${source.bytes.byteLength} B across ${prepared.totalChunks} QR frames @ ${newChunkSize} B/chunk)`,
        'OK'
      );
    },
    [appendFrameLog]
  );

  const handleLoadPresetFile = (presetKey: 'TELEMETRY' | 'SPEC' | 'SVG') => {
    const preset = createPresetPayload(presetKey);
    setRawFileSource(preset);
    startNewTransferSession(preset, chunkSize);
    pushToast(
      `Loaded ${preset.name}`,
      `${preset.bytes.byteLength.toLocaleString()} B compressed with Pako Gzip`,
      'info'
    );
  };

  const handleFileUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const source = {
      name: file.name,
      mime: file.type || 'application/octet-stream',
      bytes,
    };
    setRawFileSource(source);
    startNewTransferSession(source, chunkSize);
    pushToast(
      `Staged ${file.name}`,
      `${bytes.byteLength.toLocaleString()} B ready for optical QR broadcast`,
      'success'
    );
  };

  const handleChangeChunkSize = (newSize: number) => {
    setChunkSize(newSize);
    startNewTransferSession(rawFileSource, newSize);
    pushToast(
      `Frame Density: ${newSize} B/chunk`,
      'Re-indexed outgoing optical frame schedule',
      'info'
    );
  };

  const handleResetSession = () => {
    startNewTransferSession(rawFileSource, chunkSize);
    pushToast('Session Reset', 'Cleared ARQ counters and re-armed Frame 0', 'info');
  };

  const handleToggleWakeLock = async () => {
    if (wakeLockActive) {
      if (wakeLockSentinelRef.current) {
        await wakeLockSentinelRef.current.release().catch(() => {});
        wakeLockSentinelRef.current = null;
      }
      setWakeLockActive(false);
      pushToast('Screen Wake Lock Released', 'Standard display sleep restored', 'info');
      return;
    }

    if (wakeLockSupported) {
      try {
        const nav = navigator as unknown as {
          wakeLock: {
            request: (
              type: 'screen'
            ) => Promise<{ release: () => Promise<void> }>;
          };
        };
        wakeLockSentinelRef.current = await nav.wakeLock.request('screen');
        setWakeLockActive(true);
      } catch {
        setWakeLockActive(true);
      }
    } else {
      setWakeLockActive(true);
    }
    pushToast('Screen Wake Lock Active', 'Display will stay bright during QR transfer', 'success');
  };

  const activePacket =
    role === 'SENDER' ? senderState.activePacket : receiverState.activePacket;
  const peerSimPacket =
    role === 'SENDER' ? receiverState.activePacket : senderState.activePacket;
  const activeLedState =
    role === 'SENDER' ? senderState.ledState : receiverState.ledState;

  const isSender = role === 'SENDER';
  const arqTotalChunks = isSender
    ? senderState.file?.totalChunks ?? 0
    : receiverState.metadata?.total ?? 0;
  const arqCompletedChunks = isSender
    ? senderState.ackedChunks
    : receiverState.receivedChunks.size;
  const arqTotalBytes = isSender
    ? senderState.file?.size ?? 0
    : receiverState.metadata?.size ?? 0;
  const arqTransferredBytes = isSender
    ? senderState.bytesTransferred
    : receiverState.bytesReceived;
  const arqMetrics = calculateTransferMetrics(
    arqTransferredBytes,
    arqTotalBytes,
    isSender ? senderState.startTimeMs : receiverState.startTimeMs,
    isSender ? senderState.completedTimeMs : receiverState.completedTimeMs
  );

  return (
    <div id="top" className="min-h-screen flex flex-col">
      {/* Modular Sticky Frosted-Glass Command Header */}
      <Header
        workspaceMode={workspaceMode}
        onSelectWorkspaceMode={(mode) => setWorkspaceMode(mode)}
        materialConfig={materialConfig}
        onChangeMaterialConfig={setMaterialConfig}
        onOpenMaterialModal={() => setMaterialModalOpen(true)}
        onOpenStandaloneModal={() => setStandaloneModalOpen(true)}
        onOpenActivityDrawer={() => setActivityDrawerOpen(true)}
        frameLogCount={frameLogs.length}
        isOnline={isOnline}
        onNotify={(title, desc) => pushToast(title, desc, 'info')}
      />

      {/* Main Responsive Workspace */}
      <main
        id="transceiver-workspace"
        className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4"
      >
        {/* Real-Time KPI & Optical Telemetry Summary Strip */}
        <TelemetrySummaryStrip
          workspaceMode={workspaceMode}
          preparedTransfer={preparedAirgapTransfer}
          chunkSize={chunkSize}
          wakeLockActive={wakeLockActive}
          onToggleWakeLock={handleToggleWakeLock}
          arqCompletedChunks={arqCompletedChunks}
          arqTotalChunks={arqTotalChunks}
          arqSpeedKBps={arqMetrics.speedKBps}
        />

        {workspaceMode !== 'ARQ' ? (
          <AirgapStreamView
            preparedTransfer={preparedAirgapTransfer}
            onFileUpload={handleFileUpload}
            onLoadPresetFile={handleLoadPresetFile}
            chunkSize={chunkSize}
            onChangeChunkSize={handleChangeChunkSize}
            qrQuietZoneBoost={materialConfig.qrQuietZoneBoost}
            onOpenMaterialSettings={() => setMaterialModalOpen(true)}
            onTriggerDownload={(bytes, filename) =>
              triggerBlobDownload(bytes, filename, rawFileSource.mime)
            }
            activeViewTab={workspaceMode}
            onTabChange={(tab) => setWorkspaceMode(tab)}
            onNotify={pushToast}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <section
              aria-label="Optical QR Emitter and Selfie Alignment Viewport"
              className="lg:col-span-5 flex flex-col gap-4"
            >
              <OpticalViewport
                activePacket={activePacket}
                onQrScanned={handleCameraQrScanned}
                flipQr={flipQr}
                onToggleFlipQr={() => setFlipQr((f) => !f)}
                mirrorCamera={mirrorCamera}
                onToggleMirrorCamera={() => setMirrorCamera((m) => !m)}
                scanIntervalMs={scanIntervalMs}
                ledState={activeLedState}
                role={role}
                peerSimPacket={peerSimPacket}
                qrQuietZoneBoost={materialConfig.qrQuietZoneBoost}
              />
            </section>

            <section
              aria-label="Protocol Controls and Live Telemetry"
              className="lg:col-span-7"
            >
              <ProtocolTelemetryPanel
                role={role}
                onSelectRole={(newRole) => setRole(newRole)}
                senderState={senderState}
                receiverState={receiverState}
                chunkSize={chunkSize}
                onChangeChunkSize={handleChangeChunkSize}
                scanIntervalMs={scanIntervalMs}
                onChangeScanInterval={(ms) => setScanIntervalMs(ms)}
                onFileUpload={handleFileUpload}
                onLoadPresetFile={handleLoadPresetFile}
                onResetSession={handleResetSession}
                loopbackRunning={loopbackRunning}
                onToggleLoopback={() => setLoopbackRunning((r) => !r)}
                onStepLoopback={handleStepLoopback}
                onInjectCrcError={handleInjectCrcError}
                wakeLockActive={wakeLockActive}
                wakeLockSupported={wakeLockSupported}
                onToggleWakeLock={handleToggleWakeLock}
                frameLogs={frameLogs}
                onDownloadReceivedFile={() => {
                  if (receiverState.assembledBytes && receiverState.metadata) {
                    triggerBlobDownload(
                      receiverState.assembledBytes,
                      receiverState.metadata.name,
                      receiverState.metadata.mime
                    );
                  }
                }}
                onOpenMaterialSettings={() => setMaterialModalOpen(true)}
              />
            </section>
          </div>
        )}
      </main>

      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-40 m3-btn-tonal px-4 py-2.5 text-xs font-medium shadow-lg"
        >
          Offline Mode Active — Running 100% from local Service Worker cache.
        </div>
      )}

      {/* Contextual Slide-Over Packet & Telemetry Inspector Drawer */}
      <ActivityDrawer
        isOpen={activityDrawerOpen}
        onClose={() => setActivityDrawerOpen(false)}
        frameLogs={frameLogs}
        onClearLogs={() => {
          setFrameLogs([]);
          pushToast('Cleared Exchange Log', 'Frame history reset', 'info');
        }}
        activePacket={activePacket}
        preparedTransfer={preparedAirgapTransfer}
        onStepLoopback={() => {
          handleStepLoopback();
          pushToast('Stepped ARQ Frame', 'Advanced optical handshake state', 'info');
        }}
        onInjectCrcError={handleInjectCrcError}
        onResetSession={handleResetSession}
      />

      {/* Material You Theme & Shape Customization Modal */}
      <MaterialYouSettingsModal
        isOpen={materialModalOpen}
        onClose={() => setMaterialModalOpen(false)}
        config={materialConfig}
        onChangeConfig={setMaterialConfig}
        isOnline={isOnline}
        swReady={swReady}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isIOS={isIOS}
        onInstallPWA={installApp}
      />

      {/* Standalone Single-File HTML Export Modal */}
      <StandaloneModal
        isOpen={standaloneModalOpen}
        onClose={() => setStandaloneModalOpen(false)}
      />

      {/* Bottom-Right Floating Toast Notification System */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
