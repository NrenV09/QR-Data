import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  FileArchive,
  FileText,
  FileUp,
  FlipHorizontal,
  Play,
  Repeat,
  RotateCcw,
  Square,
  SwitchCamera,
  Zap,
} from 'lucide-react';
import {
  AirgapScannerState,
  PreparedAirgapTransfer,
  createInitialAirgapScannerState,
  stepAirgapScanner,
} from '../utils/airgapStreamProtocol';
import { ChunksInspector } from './ChunksInspector';

export type AirgapViewTab = 'GENERATOR' | 'SCANNER' | 'DUAL';

interface AirgapStreamViewProps {
  preparedTransfer: PreparedAirgapTransfer;
  onFileUpload: (file: File) => void;
  onLoadPresetFile: (presetKey: 'TELEMETRY' | 'SPEC' | 'SVG') => void;
  chunkSize: number;
  onChangeChunkSize: (size: number) => void;
  qrQuietZoneBoost: boolean;
  onOpenMaterialSettings: () => void;
  onTriggerDownload: (bytes: Uint8Array, filename: string) => void;
  activeViewTab?: AirgapViewTab;
  onTabChange?: (tab: AirgapViewTab) => void;
}

export const AirgapStreamView: React.FC<AirgapStreamViewProps> = ({
  preparedTransfer,
  onFileUpload,
  onLoadPresetFile,
  chunkSize,
  onChangeChunkSize,
  qrQuietZoneBoost,
  onOpenMaterialSettings,
  onTriggerDownload,
  activeViewTab,
  onTabChange,
}) => {
  // Default to GENERATOR (Transmitter) so generator does not show scanner by default
  const [internalViewTab, setInternalViewTab] = useState<AirgapViewTab>('GENERATOR');
  const viewTab = activeViewTab ?? internalViewTab;
  const setViewTab = onTabChange ?? setInternalViewTab;

  // Generator (Data Sender Mode) State
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [senderUserMessage, setSenderUserMessage] = useState<string>(
    'Choose or drop a file to transmit'
  );
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(-1); // -1 = metadata frame
  const [currentQrText, setCurrentQrText] = useState<string>(
    preparedTransfer.metadataJson
  );
  const [frameDelayMs, setFrameDelayMs] = useState<number>(60);
  const [loopStream, setLoopStream] = useState<boolean>(true);
  const [flipQr, setFlipQr] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Scanner (Data Receiver Mode) State - STRICTLY INDEPENDENT FROM GENERATOR
  const [scannerState, setScannerState] = useState<AirgapScannerState>(() =>
    createInitialAirgapScannerState()
  );
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [simulationBridgeActive, setSimulationBridgeActive] = useState<boolean>(false);

  const generatorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const downloadedRef = useRef<boolean>(false);

  // Sync generator QR code whenever preparedTransfer changes
  // CRITICAL: NEVER modify or touch scannerState here! Generator file changes must not leak to Scanner!
  useEffect(() => {
    setIsTransferring(false);
    setCurrentChunkIndex(-1);
    setCurrentQrText(preparedTransfer.metadataJson);
    setSenderUserMessage(
      `Ready: ${preparedTransfer.name} (${preparedTransfer.totalChunks} chunks)`
    );
  }, [preparedTransfer]);

  // Render high-contrast QR code on Generator canvas
  useEffect(() => {
    const canvas = generatorCanvasRef.current;
    if (!canvas) return;
    const textToEncode = currentQrText || 'Choose file to get started';

    QRCode.toCanvas(
      canvas,
      textToEncode,
      {
        width: 280,
        margin: qrQuietZoneBoost ? 4 : 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      },
      (err) => {
        if (err) {
          console.error('QR render error:', err);
        }
      }
    );
  }, [currentQrText, qrQuietZoneBoost]);

  // Feed QR frame into Scanner when scanned via camera or explicit simulation bridge
  // CRITICAL: Generator transmitting files must NEVER auto-download into its downloads folder!
  const handleDecodedQrFrame = useCallback(
    (decodedText: string, source: 'CAMERA' | 'SIMULATION_BRIDGE' = 'CAMERA') => {
      setScannerState((prev) => {
        const next = stepAirgapScanner(prev, decodedText);
        const isCameraScan = source === 'CAMERA';
        const isReceiverRole = viewTab !== 'GENERATOR';

        // Auto-download only on physical receiver camera scans
        if (
          isCameraScan &&
          isReceiverRole &&
          next.isComplete &&
          next.reconstructedBytes &&
          next.fileMetadata &&
          !downloadedRef.current
        ) {
          downloadedRef.current = true;
          onTriggerDownload(next.reconstructedBytes, next.fileMetadata.name);
        }
        return next;
      });
    },
    [onTriggerDownload, viewTab]
  );

  // Animated Generator Transmission Loop
  useEffect(() => {
    if (!isTransferring) return;

    let cancelled = false;
    let timeoutId: number | null = null;

    const runGeneratorSequence = async () => {
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          timeoutId = window.setTimeout(resolve, ms);
        });

      do {
        // Phase 1: Emit file_metadata JSON `{ name: file.name, chunks: total_chunks }`
        if (cancelled) break;
        setCurrentChunkIndex(-1);
        setCurrentQrText(preparedTransfer.metadataJson);
        setSenderUserMessage('Starting transmission: broadcasting metadata...');
        if (simulationBridgeActive && viewTab === 'DUAL') {
          handleDecodedQrFrame(preparedTransfer.metadataJson, 'SIMULATION_BRIDGE');
        }
        await wait(600);

        // Phase 2: Stream each Gzip-compressed chunk `0 .. totalChunks - 1`
        for (let i = 0; i < preparedTransfer.totalChunks; i++) {
          if (cancelled) break;
          const encodedData = preparedTransfer.encodedChunks[i];
          setCurrentChunkIndex(i);
          setCurrentQrText(encodedData);
          setSenderUserMessage(
            `Streaming Chunk #${i + 1} of ${preparedTransfer.totalChunks}...`
          );
          if (simulationBridgeActive && viewTab === 'DUAL') {
            handleDecodedQrFrame(encodedData, 'SIMULATION_BRIDGE');
          }
          await wait(frameDelayMs);
        }
      } while (loopStream && !cancelled);

      if (!cancelled) {
        setIsTransferring(false);
        setSenderUserMessage(
          `Transmission cycle complete (${preparedTransfer.totalChunks} chunks).`
        );
      }
    };

    runGeneratorSequence();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [
    isTransferring,
    preparedTransfer,
    frameDelayMs,
    loopStream,
    simulationBridgeActive,
    viewTab,
    handleDecodedQrFrame,
  ]);

  const handleStartTransfer = () => {
    setIsTransferring(true);
  };

  const handleStopTransfer = () => {
    setIsTransferring(false);
    setCurrentChunkIndex(-1);
    setCurrentQrText(preparedTransfer.metadataJson);
    setSenderUserMessage('Transmission stopped');
  };

  // Camera Scanner Controls
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startReceiverCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    downloadedRef.current = false;
    setScannerState((prev) => ({
      ...prev,
      isReceiving: true,
      userMessage: 'Scanning for optical QR stream...',
    }));

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API unavailable in this environment.');
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Camera device not accessible';
      setCameraError(`Camera Notice: ${msg}`);
      setCameraActive(false);
    }
  };

  const handleStopReceiver = () => {
    stopCamera();
    setScannerState((prev) => ({
      ...prev,
      isReceiving: false,
      userMessage: 'Scanner paused',
    }));
  };

  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (cameraActive) {
      startReceiverCamera(nextMode);
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Continuous Camera QR Scanning Loop
  useEffect(() => {
    if (!cameraActive || !scannerState.isReceiving) return;

    type BarcodeDetectorLike = {
      detect: (source: HTMLCanvasElement) => Promise<Array<{ rawValue?: string }>>;
    };
    let nativeDetector: BarcodeDetectorLike | null = null;
    const win = window as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
    };
    if (typeof win.BarcodeDetector === 'function') {
      try {
        nativeDetector = new win.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        nativeDetector = null;
      }
    }

    const interval = window.setInterval(async () => {
      const video = videoRef.current;
      const canvas = scanCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const width = video.videoWidth || 480;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);

      if (nativeDetector) {
        try {
          const codes = await nativeDetector.detect(canvas);
          if (codes.length > 0 && codes[0].rawValue) {
            handleDecodedQrFrame(codes[0].rawValue, 'CAMERA');
            return;
          }
        } catch {
          // Fallback to jsQR
        }
      }

      const imageData = ctx.getImageData(0, 0, width, height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (code && code.data) {
        handleDecodedQrFrame(code.data, 'CAMERA');
      }
    }, 30);

    return () => window.clearInterval(interval);
  }, [cameraActive, scannerState.isReceiving, handleDecodedQrFrame]);

  // Drag & Drop handlers
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Simulation Bridge notice only displayed in Dual Testbed */}
      {viewTab === 'DUAL' && (
        <div className="m3-surface-card px-3 py-2 flex flex-wrap items-center justify-between gap-2 border border-[var(--m3-outline-variant)] text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--m3-on-surface)]">Dual Testbed:</span>
            <span className="text-slate-400">Isolated Generator &amp; Scanner modules on one screen</span>
          </div>
          <button
            type="button"
            onClick={() => setSimulationBridgeActive((s) => !s)}
            className={`min-h-[30px] px-3 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
              simulationBridgeActive
                ? 'bg-amber-950/70 text-amber-300 border-amber-600/80 font-bold'
                : 'm3-surface-low text-slate-400 border-[var(--m3-outline-variant)] hover:text-white'
            }`}
          >
            Simulation Bridge: {simulationBridgeActive ? 'Coupled (Active)' : 'Uncoupled (Camera Only)'}
          </button>
        </div>
      )}

      {/* Main Responsive Grid: Generator / Scanner / Dual */}
      <div
        className={`grid grid-cols-1 ${
          viewTab === 'DUAL' ? 'lg:grid-cols-12' : ''
        } gap-4 items-start`}
      >
        {/* ================= DATA SENDER MODE (/generator) ================= */}
        {(viewTab === 'GENERATOR' || viewTab === 'DUAL') && (
          <section
            aria-label="Data Sender Mode (QR Generator)"
            className={`${
              viewTab === 'DUAL' ? 'lg:col-span-6' : 'max-w-3xl mx-auto w-full'
            } m3-surface-card p-4 flex flex-col gap-3.5 border border-[var(--m3-outline-variant)]`}
          >
            {/* Header info */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--m3-outline-variant)] pb-2.5">
              <div>
                <h2 className="text-sm font-bold tracking-tight">Data Sender (Generator)</h2>
                <p className="text-[11px] font-mono m3-text-muted">
                  Gzip Level-9 compression · Continuous animated QR chunk stream
                </p>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  isTransferring
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 animate-pulse'
                    : 'bg-[var(--m3-surface-container-high)] text-slate-300'
                }`}
              >
                {isTransferring ? 'Broadcasting' : 'Standby'}
              </span>
            </div>

            {/* Compact File Drop Zone */}
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
              className={`border-2 border-dashed p-3 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                isDraggingOver
                  ? 'border-[var(--m3-primary)] bg-[var(--m3-surface-container-high)]'
                  : 'border-[var(--m3-outline-variant)] m3-surface-low hover:border-slate-500'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-md bg-[var(--m3-primary)] text-[var(--m3-on-primary)] flex items-center justify-center shrink-0">
                  <FileUp className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {preparedTransfer.name}
                  </div>
                  <div className="text-[10px] font-mono m3-text-muted truncate">
                    Raw: {preparedTransfer.originalSize} B → Gzip:{' '}
                    {preparedTransfer.compressedSize} B (
                    {preparedTransfer.compressionRatioPct > 0
                      ? `-${preparedTransfer.compressionRatioPct}%`
                      : '0%'}{' '}
                    ratio) · {preparedTransfer.totalChunks} chunks @ {chunkSize} B
                  </div>
                </div>
              </div>

              <span className="min-h-[32px] px-3 py-1 text-[11px] font-semibold m3-btn-filled rounded-md shrink-0 flex items-center">
                Select File
              </span>
              <input
                ref={fileInputRef}
                id="file_input"
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    onFileUpload(f);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
            </div>

            {/* Quick Presets & Compression Configuration */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400">Samples:</span>
                <button
                  type="button"
                  onClick={() => onLoadPresetFile('TELEMETRY')}
                  className="px-2 py-0.5 rounded text-[10px] m3-surface-low border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface)] cursor-pointer"
                >
                  telemetry.json
                </button>
                <button
                  type="button"
                  onClick={() => onLoadPresetFile('SPEC')}
                  className="px-2 py-0.5 rounded text-[10px] m3-surface-low border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface)] cursor-pointer"
                >
                  protocol.txt
                </button>
                <button
                  type="button"
                  onClick={() => onLoadPresetFile('SVG')}
                  className="px-2 py-0.5 rounded text-[10px] m3-surface-low border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface)] cursor-pointer"
                >
                  reticle.svg
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">Chunk Size:</span>
                {[250, 350, 500].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onChangeChunkSize(sz)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer border ${
                      chunkSize === sz
                        ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)] border-[var(--m3-primary)] font-bold'
                        : 'm3-surface-low border-[var(--m3-outline-variant)] text-slate-400'
                    }`}
                  >
                    {sz}B
                  </button>
                ))}
              </div>
            </div>

            {/* Transmission Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                {!isTransferring ? (
                  <button
                    type="button"
                    onClick={handleStartTransfer}
                    className="min-h-[38px] px-4 py-1.5 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 cursor-pointer rounded-md"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Transfer</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopTransfer}
                    className="min-h-[38px] px-4 py-1.5 text-xs font-semibold m3-btn-tonal flex items-center gap-1.5 cursor-pointer rounded-md"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Transfer</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLoopStream((l) => !l)}
                  className={`min-h-[38px] px-2.5 py-1.5 text-xs font-mono rounded-md border cursor-pointer flex items-center gap-1 ${
                    loopStream
                      ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] border-[var(--m3-primary)] font-bold'
                      : 'm3-surface-low text-slate-400 border-[var(--m3-outline-variant)]'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>Loop: {loopStream ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFlipQr((f) => !f)}
                  className={`min-h-[38px] px-2.5 py-1.5 text-xs font-mono rounded-md border cursor-pointer flex items-center gap-1 ${
                    flipQr
                      ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] border-[var(--m3-primary)]'
                      : 'm3-surface-low text-slate-400 border-[var(--m3-outline-variant)]'
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Flip QR</span>
                </button>
              </div>

              {/* Speed selector */}
              <div className="inline-flex rounded-md p-0.5 bg-[var(--m3-surface-container-high)] text-[10px] font-mono">
                {[50, 80, 120, 180].map((delay) => (
                  <button
                    key={delay}
                    type="button"
                    onClick={() => setFrameDelayMs(delay)}
                    className={`px-2 py-1 rounded cursor-pointer ${
                      frameDelayMs === delay
                        ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)] font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {delay}ms
                  </button>
                ))}
              </div>
            </div>

            {/* Transmission Status Banner */}
            <div className="px-3 py-2 rounded-md bg-[var(--m3-surface-container-low)] text-[11px] font-mono flex items-center justify-between border border-[var(--m3-outline-variant)]">
              <span className="truncate">{senderUserMessage}</span>
              <span className="font-bold text-[var(--m3-primary)] whitespace-nowrap shrink-0">
                {currentChunkIndex === -1
                  ? 'FRAME 0 (METADATA)'
                  : `CHUNK #${currentChunkIndex + 1} / ${preparedTransfer.totalChunks}`}
              </span>
            </div>

            {/* High-Contrast QR Code Transmission Canvas */}
            <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-white text-slate-900 border border-slate-300">
              <canvas
                ref={generatorCanvasRef}
                id="qrcode"
                style={{ transform: flipQr ? 'scaleX(-1)' : 'none' }}
                className="max-w-full h-auto"
              />
              <div className="mt-2 text-[10px] font-mono text-slate-600 truncate max-w-sm text-center">
                {currentChunkIndex === -1
                  ? preparedTransfer.metadataJson
                  : `Frame #${currentChunkIndex}: ${currentQrText.slice(0, 36)}...`}
              </div>
            </div>
          </section>
        )}

        {/* ================= DATA RECEIVER MODE (/scanner) ================= */}
        {(viewTab === 'SCANNER' || viewTab === 'DUAL') && (
          <section
            aria-label="Data Receiver Mode (QR Scanner)"
            className={`${
              viewTab === 'DUAL' ? 'lg:col-span-6' : 'max-w-3xl mx-auto w-full'
            } m3-surface-card p-4 flex flex-col gap-3.5 border border-[var(--m3-outline-variant)]`}
          >
            {/* Header info */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--m3-outline-variant)] pb-2.5">
              <div>
                <h2 className="text-sm font-bold tracking-tight">Data Receiver (Scanner)</h2>
                <p className="text-[11px] font-mono m3-text-muted">
                  Scans optical QR frames, verifies chunk checksums &amp; inflates via Pako
                </p>
              </div>
              <span
                data-testid="scanner-progress-text"
                className="text-xs font-mono font-bold text-[var(--m3-primary)] whitespace-nowrap shrink-0"
              >
                Progress: {scannerState.receivedCount} /{' '}
                {scannerState.fileMetadata?.chunks || 0}
              </span>
            </div>

            {/* Receiver Camera Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={() => startReceiverCamera(facingMode)}
                    className="min-h-[38px] px-4 py-1.5 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 cursor-pointer rounded-md"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Start Receiver</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopReceiver}
                    className="min-h-[38px] px-4 py-1.5 text-xs font-semibold m3-btn-tonal flex items-center gap-1.5 cursor-pointer rounded-md"
                  >
                    <CameraOff className="w-3.5 h-3.5" />
                    <span>Stop Receiver</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-mono m3-surface-low border border-[var(--m3-outline-variant)] rounded-md cursor-pointer flex items-center gap-1.5"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                  <span>{facingMode === 'environment' ? 'Rear Cam' : 'Front Cam'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  downloadedRef.current = false;
                  setScannerState(createInitialAirgapScannerState());
                }}
                className="min-h-[38px] px-3 py-1.5 text-xs font-mono m3-surface-low border border-[var(--m3-outline-variant)] rounded-md cursor-pointer flex items-center gap-1 text-slate-400 hover:text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Buffer</span>
              </button>
            </div>

            {/* Receiver Status Bar */}
            <div
              role="status"
              className="px-3 py-2 rounded-md bg-[var(--m3-surface-container-low)] text-[11px] font-mono flex items-center justify-between border border-[var(--m3-outline-variant)]"
            >
              <span className="truncate">{scannerState.userMessage}</span>
              <span className="font-bold whitespace-nowrap shrink-0">
                {scannerState.isComplete
                  ? '✔ INFLATED'
                  : scannerState.isReceiving
                  ? '● RECEIVING'
                  : 'STANDBY'}
              </span>
            </div>

            {/* Camera Viewfinder */}
            <div className="w-full h-48 bg-[#03060f] border border-slate-800 rounded-lg overflow-hidden relative flex flex-col">
              <div className="shrink-0 flex items-center justify-between px-2.5 py-1 text-[10px] font-mono text-slate-400 bg-slate-950/80 border-b border-slate-850">
                <span>VIEWFINDER ({facingMode.toUpperCase()})</span>
                <span className={cameraActive ? 'text-emerald-400' : 'text-slate-500'}>
                  {cameraActive ? '● CAMERA SCANNING' : 'CAMERA OFF'}
                </span>
              </div>

              <div className="relative flex-1 flex items-center justify-center p-2 overflow-hidden">
                <video
                  ref={videoRef}
                  id="videoElement"
                  muted
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <canvas ref={scanCanvasRef} className="hidden" />

                {/* Reticle alignment box */}
                <div className="absolute w-36 h-36 border-2 border-dashed border-cyan-400/80 rounded-lg pointer-events-none flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping opacity-60" />
                </div>

                {!cameraActive && (
                  <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center p-4 text-center">
                    <p className="text-xs font-semibold text-slate-200">Point Camera at Transmitting Screen</p>
                    <p className="text-[11px] font-mono text-slate-400 mt-1 max-w-xs">
                      Click “Start Receiver” to activate camera and scan the optical QR stream.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* COMPLETE CHUNKS INSPECTOR (LIST OF ALL DECODED & UNDECODED CHUNKS) */}
            <ChunksInspector
              fileMetadata={scannerState.fileMetadata}
              decodedChunks={scannerState.decodedChunks}
              receivedCount={scannerState.receivedCount}
              isComplete={scannerState.isComplete}
              reconstructedBytes={scannerState.reconstructedBytes}
              onTriggerDownload={() => {
                if (scannerState.reconstructedBytes && scannerState.fileMetadata) {
                  onTriggerDownload(
                    scannerState.reconstructedBytes,
                    scannerState.fileMetadata.name
                  );
                }
              }}
            />
          </section>
        )}
      </div>
    </div>
  );
};
