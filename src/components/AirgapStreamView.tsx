import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Download,
  FileArchive,
  FileText,
  FileUp,
  FlipHorizontal,
  Palette,
  Play,
  Repeat,
  RotateCcw,
  Square,
  SwitchCamera,
} from 'lucide-react';
import {
  AirgapScannerState,
  PreparedAirgapTransfer,
  createInitialAirgapScannerState,
  stepAirgapScanner,
} from '../utils/airgapStreamProtocol';

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
}) => {
  const [viewTab, setViewTab] = useState<AirgapViewTab>('DUAL');

  // Generator (Data Sender Mode) State
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [senderUserMessage, setSenderUserMessage] = useState<string>(
    'Choose or drop a file to get started'
  );
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(-1); // -1 = metadata frame
  const [currentQrText, setCurrentQrText] = useState<string>(
    preparedTransfer.metadataJson
  );
  const [frameDelayMs, setFrameDelayMs] = useState<number>(60);
  const [loopStream, setLoopStream] = useState<boolean>(true);
  const [flipQr, setFlipQr] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Scanner (Data Receiver Mode) State
  const [scannerState, setScannerState] = useState<AirgapScannerState>(() =>
    createInitialAirgapScannerState()
  );
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment'
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [opticalLoopbackCoupled, setOpticalLoopbackCoupled] =
    useState<boolean>(false);

  const generatorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const downloadedRef = useRef<boolean>(false);

  // Sync generator QR code whenever preparedTransfer changes
  useEffect(() => {
    setIsTransferring(false);
    setCurrentChunkIndex(-1);
    setCurrentQrText(preparedTransfer.metadataJson);
    setSenderUserMessage(
      `Ready: ${preparedTransfer.name} (${preparedTransfer.totalChunks} Gzip chunks)`
    );
    downloadedRef.current = false;
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
        width: 300,
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

  // Feed QR frame into Scanner when coupled or scanned via camera
  // CRITICAL: The Generator device transmitting the file must NEVER auto-download into its downloads folder.
  // Automatic file download only triggers when frames are received via the physical camera on a receiver device.
  const handleDecodedQrFrame = useCallback(
    (decodedText: string, source: 'CAMERA' | 'COUPLED_BRIDGE' = 'CAMERA') => {
      setScannerState((prev) => {
        const next = stepAirgapScanner(prev, decodedText);
        const isCameraScan = source === 'CAMERA';
        const isReceiver = viewTab !== 'GENERATOR';

        if (
          isCameraScan &&
          isReceiver &&
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

  // Animated Generator Loop (matches mohanram's `start_transfer` flow:
  // 1. Emits JSON.stringify({ name, chunks }) with "Starting data transfer in few seconds ..."
  // 2. Loops through i = 0..total_chunks-1 emitting `encode_data(i, chunk)` with `Transferring Chunk i/total_chunks ...`)
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
        setSenderUserMessage('Starting data transfer in few seconds ...');
        if (opticalLoopbackCoupled) {
          handleDecodedQrFrame(preparedTransfer.metadataJson, 'COUPLED_BRIDGE');
        }
        await wait(650);

        // Phase 2: Stream each Gzip-compressed chunk `0 .. totalChunks - 1`
        for (let i = 0; i < preparedTransfer.totalChunks; i++) {
          if (cancelled) break;
          const encodedData = preparedTransfer.encodedChunks[i];
          setCurrentChunkIndex(i);
          setCurrentQrText(encodedData);
          setSenderUserMessage(
            `Transferring Chunk ${i + 1}/${preparedTransfer.totalChunks} ...`
          );
          if (opticalLoopbackCoupled) {
            handleDecodedQrFrame(encodedData, 'COUPLED_BRIDGE');
          }
          await wait(frameDelayMs);
        }
      } while (loopStream && !cancelled);

      if (!cancelled) {
        setIsTransferring(false);
        setSenderUserMessage(
          `Finished streaming ${preparedTransfer.totalChunks} chunks to Receiver.`
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
    opticalLoopbackCoupled,
    handleDecodedQrFrame,
  ]);

  const handleStartTransfer = () => {
    downloadedRef.current = false;
    if (opticalLoopbackCoupled) {
      setScannerState({
        ...createInitialAirgapScannerState(),
        isReceiving: true,
        userMessage: 'Waiting for Generator metadata QR frame...',
      });
    }
    setIsTransferring(true);
  };

  const handleStopTransfer = () => {
    setIsTransferring(false);
    setCurrentChunkIndex(-1);
    setCurrentQrText('Choose file to get started');
    setSenderUserMessage('Choose file to get started');
  };

  // Camera Scanner Controls (`scanner.html` flow)
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
    setScannerState({
      ...createInitialAirgapScannerState(),
      isReceiving: true,
      userMessage: 'Scanning for QR stream (Metadata + Chunks)...',
    });

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Camera API unavailable in this context. Coupled Optical Stream Receiver remains active.'
      );
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
      const msg =
        err instanceof Error ? err.message : 'Requested camera device not found';
      setCameraError(
        `Camera notice: ${msg}. Receiver is ready to capture from Coupled Generator Stream.`
      );
      setCameraActive(false);
    }
  };

  const handleStopReceiver = () => {
    stopCamera();
    setScannerState(createInitialAirgapScannerState());
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

  // Continuous 25ms Camera QR Scanning Loop (BarcodeDetector + jsQR fallback)
  useEffect(() => {
    if (!cameraActive || !scannerState.isReceiving) return;

    type BarcodeDetectorLike = {
      detect: (
        source: HTMLCanvasElement
      ) => Promise<Array<{ rawValue?: string }>>;
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
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

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

  const targetTotalChunks =
    scannerState.fileMetadata?.chunks || preparedTransfer.totalChunks;
  const progressPct =
    targetTotalChunks > 0
      ? Math.min(
          100,
          Math.round((scannerState.receivedCount / targetTotalChunks) * 100)
        )
      : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Top Bar for Generator / Scanner View Mode & Material You Style */}
      <div className="m3-surface-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Airgapped Transfer View Selector"
          className="w-full sm:w-auto grid grid-cols-3 gap-1.5 p-1.5 m3-surface-low"
        >
          <button
            type="button"
            onClick={() => setViewTab('GENERATOR')}
            aria-pressed={viewTab === 'GENERATOR'}
            className={`min-h-[40px] px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold flex items-center justify-center cursor-pointer whitespace-nowrap truncate ${
              viewTab === 'GENERATOR' ? 'm3-btn-filled' : 'm3-text-muted'
            }`}
          >
            Generator
          </button>
          <button
            type="button"
            onClick={() => setViewTab('SCANNER')}
            aria-pressed={viewTab === 'SCANNER'}
            className={`min-h-[40px] px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold flex items-center justify-center cursor-pointer whitespace-nowrap truncate ${
              viewTab === 'SCANNER' ? 'm3-btn-filled' : 'm3-text-muted'
            }`}
          >
            Scanner
          </button>
          <button
            type="button"
            onClick={() => setViewTab('DUAL')}
            aria-pressed={viewTab === 'DUAL'}
            className={`min-h-[40px] px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold flex items-center justify-center cursor-pointer whitespace-nowrap truncate ${
              viewTab === 'DUAL' ? 'm3-btn-filled' : 'm3-text-muted'
            }`}
          >
            Dual View
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpticalLoopbackCoupled((c) => !c)}
            aria-pressed={opticalLoopbackCoupled}
            className={`min-h-[40px] px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
              opticalLoopbackCoupled ? 'm3-btn-tonal' : 'm3-btn-outlined'
            }`}
          >
            {opticalLoopbackCoupled
              ? 'Optical Bridge: Linked'
              : 'Optical Bridge: Camera Only'}
          </button>

          <button
            type="button"
            onClick={onOpenMaterialSettings}
            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold m3-btn-tonal flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Material You Style</span>
          </button>
        </div>
      </div>

      {/* Main Responsive Grid: Generator (Sender) & Scanner (Receiver) */}
      <div
        className={`grid grid-cols-1 ${
          viewTab === 'DUAL' ? 'lg:grid-cols-12' : ''
        } gap-6 items-start`}
      >
        {/* ================= DATA SENDER MODE (/generator) ================= */}
        {(viewTab === 'GENERATOR' || viewTab === 'DUAL') && (
          <section
            aria-label="Data Sender Mode (QR Generator)"
            className={`${
              viewTab === 'DUAL' ? 'lg:col-span-6' : 'max-w-3xl mx-auto w-full'
            } m3-surface-card p-5 flex flex-col gap-4`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">
                  Data Sender Mode (Generator)
                </h2>
                <p className="text-xs m3-text-muted mt-0.5">
                  Compresses file with Pako Gzip (Level 9) and streams animated QR chunks
                </p>
              </div>
              <span className="text-xs font-mono m3-text-muted whitespace-nowrap shrink-0">
                {isTransferring ? 'STREAMING' : 'READY'}
              </span>
            </div>

            {/* Interactive File Drop Zone */}
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
              style={{
                borderColor: isDraggingOver
                  ? 'var(--m3-primary)'
                  : 'var(--m3-outline)',
                borderRadius: 'var(--m3-radius-md)',
              }}
              className={`border-2 border-dashed p-4 flex flex-col sm:flex-row items-center justify-between gap-3 cursor-pointer transition-all ${
                isDraggingOver ? 'm3-btn-tonal scale-[1.01]' : 'm3-surface-low'
              }`}
            >
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="w-11 h-11 flex items-center justify-center m3-btn-tonal shrink-0">
                  <FileUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">
                    {isDraggingOver
                      ? 'Release to Compress & Generate QR Stream'
                      : 'Drag & Drop Any File Here, or Click to Choose File'}
                  </div>
                  <div className="text-xs font-mono m3-text-muted mt-0.5">
                    {preparedTransfer.name} · Raw {preparedTransfer.originalSize} B → Gzip{' '}
                    {preparedTransfer.compressedSize} B (
                    {preparedTransfer.compressionRatioPct > 0
                      ? `-${preparedTransfer.compressionRatioPct}% saved`
                      : 'compressed'}
                    ) · {preparedTransfer.totalChunks} chunks
                  </div>
                </div>
              </div>

              <span className="min-h-[40px] px-3.5 py-2 text-xs font-semibold m3-btn-filled flex items-center whitespace-nowrap shrink-0">
                Choose File
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

            {/* Sample Payload Quick-Loaders */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs m3-text-muted">Sample Files:</span>
              <button
                type="button"
                onClick={() => onLoadPresetFile('TELEMETRY')}
                className="min-h-[36px] px-2.5 py-1 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span>calibration-telemetry.json</span>
              </button>
              <button
                type="button"
                onClick={() => onLoadPresetFile('SPEC')}
                className="min-h-[36px] px-2.5 py-1 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>optical-arq-protocol.txt</span>
              </button>
              <button
                type="button"
                onClick={() => onLoadPresetFile('SVG')}
                className="min-h-[36px] px-2.5 py-1 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>reticle-diagram.svg</span>
              </button>
            </div>

            {/* Start Transfer / Stop Transfer Primary Controls + Stream Speed */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {!isTransferring ? (
                  <button
                    type="button"
                    onClick={handleStartTransfer}
                    className="min-h-[44px] px-5 py-2.5 text-xs font-semibold m3-btn-filled flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-4 h-4" />
                    <span>Start Transfer</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopTransfer}
                    className="min-h-[44px] px-5 py-2.5 text-xs font-semibold m3-btn-tonal flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Square className="w-4 h-4" />
                    <span>Stop Transfer</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLoopStream((l) => !l)}
                  aria-pressed={loopStream}
                  className={`min-h-[44px] px-3 py-2 text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    loopStream ? 'm3-btn-tonal' : 'm3-btn-outlined'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>{loopStream ? 'Loop: ON' : 'Single Pass'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFlipQr((f) => !f)}
                  aria-pressed={flipQr}
                  className={`min-h-[44px] px-3 py-2 text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    flipQr ? 'm3-btn-tonal' : 'm3-btn-outlined'
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Flip QR</span>
                </button>
              </div>

              {/* Frame Interval & Chunk Size */}
              <div className="flex items-center gap-1.5">
                {[50, 100, 180].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => setFrameDelayMs(ms)}
                    className={`min-h-[38px] px-2.5 py-1 text-xs font-mono cursor-pointer whitespace-nowrap ${
                      frameDelayMs === ms ? 'm3-btn-tonal font-semibold' : 'm3-btn-outlined'
                    }`}
                  >
                    {ms}ms
                  </button>
                ))}
              </div>
            </div>

            {/* Live Generator Status Banner (`{{user_message}}` from generator.html) */}
            <div
              role="status"
              aria-live="polite"
              data-testid="generator-status"
              className="px-4 py-2.5 m3-surface-high text-xs font-mono flex items-center justify-between gap-2"
            >
              <span className="truncate">{senderUserMessage}</span>
              <span className="font-semibold whitespace-nowrap shrink-0">
                {currentChunkIndex === -1
                  ? 'METADATA FRAME'
                  : `CHUNK ${currentChunkIndex + 1} / ${preparedTransfer.totalChunks}`}
              </span>
            </div>

            {/* High-Contrast QR Code Stage */}
            <div
              style={{ borderRadius: 'var(--m3-radius-lg)' }}
              className="bg-white text-slate-950 p-5 flex flex-col items-center justify-center border-2 border-slate-300 shadow-sm"
            >
              <div
                className={`transition-transform duration-150 ${
                  flipQr ? '-scale-x-100' : ''
                }`}
              >
                <canvas
                  ref={generatorCanvasRef}
                  data-testid="airgap-generator-qr"
                  aria-label="Airgapped Generator QR Code"
                  className="w-[240px] h-[240px] sm:w-[296px] sm:h-[296px] block"
                />
              </div>

              <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-600 mt-3 pt-2 border-t border-slate-200">
                <span className="truncate max-w-[200px] sm:max-w-[240px]">
                  {currentQrText}
                </span>
                <span className="whitespace-nowrap shrink-0">
                  GZIP CHUNK: {chunkSize} B
                </span>
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
            } m3-surface-card p-5 flex flex-col gap-4`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">
                  Data Receiver Mode (Scanner)
                </h2>
                <p className="text-xs m3-text-muted mt-0.5">
                  Scans animated QR frames, collects indexed chunks & inflates with Pako Gzip
                </p>
              </div>
              <span
                data-testid="scanner-progress-text"
                className="text-sm font-mono font-bold whitespace-nowrap shrink-0"
              >
                Progress: {scannerState.receivedCount} /{' '}
                {scannerState.fileMetadata?.chunks || 0}
              </span>
            </div>

            {/* Start Receiver / Stop Receiver Controls (matches scanner.html) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={() => startReceiverCamera(facingMode)}
                    className="min-h-[44px] px-5 py-2.5 text-xs font-semibold m3-btn-filled flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Start Receiver</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopReceiver}
                    className="min-h-[44px] px-5 py-2.5 text-xs font-semibold m3-btn-tonal flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <CameraOff className="w-4 h-4" />
                    <span>Stop Receiver</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                  <span>
                    {facingMode === 'environment'
                      ? 'Camera: Rear (Environment)'
                      : 'Camera: Front (Selfie)'}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  downloadedRef.current = false;
                  setScannerState(createInitialAirgapScannerState());
                }}
                className="min-h-[44px] px-3 py-2 text-xs font-medium m3-btn-outlined flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Buffer</span>
              </button>
            </div>

            {/* Receiver Status Message (`{{user_message}}` from scanner.html) */}
            <div
              role="status"
              aria-live="polite"
              data-testid="scanner-status"
              className="px-4 py-2.5 m3-surface-high text-xs font-mono flex items-center justify-between gap-2"
            >
              <span className="truncate">{scannerState.userMessage}</span>
              <span className="font-semibold whitespace-nowrap shrink-0">
                {scannerState.isComplete
                  ? '✔ INFLATED & VERIFIED'
                  : scannerState.isReceiving
                  ? '● RECEIVING'
                  : 'STANDBY'}
              </span>
            </div>

            {/* Progress Bar & Chunk Reception Matrix */}
            <div className="m3-surface-low p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span>
                  DECODED CHUNKS ({scannerState.receivedCount} /{' '}
                  {targetTotalChunks})
                </span>
                <span className="font-semibold">{progressPct}%</span>
              </div>

              <div className="w-full h-3 m3-surface-card overflow-hidden p-0.5">
                <div
                  className="h-full transition-all duration-150 rounded-full"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: 'var(--m3-primary)',
                  }}
                />
              </div>

              {/* Visual Chunk Matrix Grid (0 .. targetTotalChunks - 1) */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Array.from({ length: Math.min(64, targetTotalChunks) }).map(
                  (_, idx) => {
                    const captured = Boolean(scannerState.decodedChunks[idx]);
                    return (
                      <div
                        key={idx}
                        title={`Chunk #${idx}: ${
                          captured ? 'Decoded' : 'Pending'
                        }`}
                        style={{
                          backgroundColor: captured
                            ? 'var(--m3-primary)'
                            : 'var(--m3-surface-container-high)',
                          color: captured
                            ? 'var(--m3-on-primary)'
                            : 'var(--m3-on-surface-variant)',
                        }}
                        className="w-7 h-7 rounded-md text-[10px] font-mono font-semibold flex items-center justify-center transition-colors"
                      >
                        {idx}
                      </div>
                    );
                  }
                )}
              </div>

              {scannerState.isComplete &&
                scannerState.reconstructedBytes &&
                scannerState.fileMetadata && (
                  <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-700/40">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Inflated {scannerState.fileMetadata.name} (
                        {scannerState.reconstructedBytes.byteLength} B)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onTriggerDownload(
                          scannerState.reconstructedBytes!,
                          scannerState.fileMetadata!.name
                        )
                      }
                      className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {downloadedRef.current
                          ? 'Download Again'
                          : 'Save / Download File'}
                      </span>
                    </button>
                  </div>
                )}
            </div>

            {/* Camera Viewfinder (`<video id="videoElement" muted autoplay playsinline>`) */}
            <div
              style={{ borderRadius: 'var(--m3-radius-lg)' }}
              className="w-full h-64 bg-[#050811] border border-slate-800 overflow-hidden relative flex flex-col"
            >
              <div className="shrink-0 flex items-center justify-between px-3 py-2 text-[11px] font-mono text-slate-300 bg-slate-950/90 border-b border-slate-800/80">
                <span>
                  SCANNER CAMERA ({facingMode.toUpperCase()})
                </span>
                <span className="text-cyan-300">
                  {cameraActive
                    ? 'LIVE OPTICAL SCAN'
                    : opticalLoopbackCoupled
                    ? 'COUPLED STREAM LINK'
                    : 'CAMERA STANDBY'}
                </span>
              </div>

              <div className="relative flex-1 flex items-center justify-center overflow-hidden p-3">
                <video
                  ref={videoRef}
                  id="videoElement"
                  muted
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover ${
                    cameraActive ? 'block' : 'hidden'
                  }`}
                />

                {!cameraActive && (
                  <div className="text-center px-4 max-w-xs z-10">
                    <p className="text-xs font-semibold text-slate-200">
                      {scannerState.isComplete
                        ? `Data Transfer Complete (${scannerState.fileMetadata?.name})`
                        : isTransferring && opticalLoopbackCoupled
                        ? `Receiving Coupled Optical Stream (${scannerState.receivedCount}/${targetTotalChunks})...`
                        : 'Point Camera at Sender QR Screen'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      Click &ldquo;Start Receiver&rdquo; to scan via hardware camera, or click &ldquo;Start Transfer&rdquo; on the left to watch live Gzip QR streaming and inflation.
                    </p>
                  </div>
                )}

                {/* Target Alignment Reticle */}
                <div className="pointer-events-none absolute w-40 h-40 rounded-xl border-2 border-dashed border-cyan-400/75 bg-cyan-500/5">
                  <div className="w-full h-0.5 bg-cyan-400/60 animate-scanline" />
                </div>
              </div>

              {cameraError && (
                <div
                  role="status"
                  className="shrink-0 bg-amber-950/90 border-t border-amber-500/40 px-3 py-1.5 text-[11px] font-mono text-amber-200"
                >
                  {cameraError}
                </div>
              )}
            </div>

            <canvas ref={scanCanvasRef} className="hidden" />
          </section>
        )}
      </div>
    </div>
  );
};
