import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  FileUp,
  FlipHorizontal,
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
  onTriggerDownload,
  activeViewTab,
}) => {
  const viewTab: AirgapViewTab = activeViewTab ?? 'GENERATOR';

  // Generator (Data Sender Mode) State
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [senderUserMessage, setSenderUserMessage] = useState<string>(
    'Ready to broadcast optical QR stream'
  );
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(-1); // -1 = metadata frame
  const [currentQrText, setCurrentQrText] = useState<string>(
    preparedTransfer.metadataJson
  );
  const [frameDelayMs, setFrameDelayMs] = useState<number>(80);
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
  // CRITICAL: Putting a file in the generator MUST NEVER populate scannerState or open any decoded chunks popup!
  useEffect(() => {
    setIsTransferring(false);
    setSimulationBridgeActive(false);
    setCurrentChunkIndex(-1);
    setCurrentQrText(preparedTransfer.metadataJson);
    setSenderUserMessage(
      `Loaded ${preparedTransfer.name} (${preparedTransfer.totalChunks} chunks)`
    );
  }, [preparedTransfer]);

  // Render high-contrast QR code on Generator canvas
  useEffect(() => {
    const canvas = generatorCanvasRef.current;
    if (!canvas) return;
    const textToEncode = currentQrText || preparedTransfer.metadataJson;

    QRCode.toCanvas(
      canvas,
      textToEncode,
      {
        width: 248,
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
  }, [currentQrText, preparedTransfer.metadataJson, qrQuietZoneBoost, viewTab]);

  // Feed QR frame into Scanner ONLY when scanned via camera or explicit Dual Testbed simulation
  const handleDecodedQrFrame = useCallback(
    (decodedText: string, source: 'CAMERA' | 'SIMULATION_BRIDGE' = 'CAMERA') => {
      setScannerState((prev) => {
        const next = stepAirgapScanner(prev, decodedText);
        const isCameraScan = source === 'CAMERA';
        const isReceiverRole = viewTab !== 'GENERATOR';

        // Auto-download ONLY on physical receiver camera scans (never on Generator!)
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

  // Jump Generator directly to a specific frame (-1 = metadata, 0..N-1 = chunk)
  const handleSelectGeneratorFrame = (frameIndex: number) => {
    setIsTransferring(false);
    if (frameIndex < 0) {
      setCurrentChunkIndex(-1);
      setCurrentQrText(preparedTransfer.metadataJson);
      setSenderUserMessage('Pinned Frame 0 (File Metadata JSON)');
    } else {
      const clamped = Math.min(
        preparedTransfer.totalChunks - 1,
        Math.max(0, frameIndex)
      );
      setCurrentChunkIndex(clamped);
      setCurrentQrText(preparedTransfer.encodedChunks[clamped]);
      setSenderUserMessage(
        `Pinned Chunk #${clamped.toString().padStart(2, '0')} (${clamped + 1} of ${
          preparedTransfer.totalChunks
        })`
      );
    }
  };

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
        if (cancelled) break;
        setCurrentChunkIndex(-1);
        setCurrentQrText(preparedTransfer.metadataJson);
        setSenderUserMessage('Broadcasting Frame 0 (Metadata)...');
        if (simulationBridgeActive && viewTab === 'DUAL') {
          handleDecodedQrFrame(preparedTransfer.metadataJson, 'SIMULATION_BRIDGE');
        }
        await wait(450);

        for (let i = 0; i < preparedTransfer.totalChunks; i++) {
          if (cancelled) break;
          const encodedData = preparedTransfer.encodedChunks[i];
          setCurrentChunkIndex(i);
          setCurrentQrText(encodedData);
          setSenderUserMessage(
            `Streaming Chunk #${i.toString().padStart(2, '0')} (${i + 1}/${
              preparedTransfer.totalChunks
            })`
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
          `Stream pass finished (${preparedTransfer.totalChunks} chunks)`
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
      userMessage: 'Scanning optical QR stream...',
    }));

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API unavailable in this browser context.');
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
      userMessage: 'Receiver paused',
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
    }, 35);

    return () => window.clearInterval(interval);
  }, [cameraActive, scannerState.isReceiving, handleDecodedQrFrame]);

  // Dual-Testbed diagnostic helpers (ONLY in Dual Testbed mode)
  const handleSimulatePartialScan = () => {
    let next = createInitialAirgapScannerState();
    next = stepAirgapScanner(next, preparedTransfer.metadataJson);
    // Decode even-indexed chunks and leave odd-indexed chunks undecoded so user can inspect both lists
    for (let i = 0; i < preparedTransfer.totalChunks; i++) {
      if (i % 2 === 0) {
        next = stepAirgapScanner(next, preparedTransfer.encodedChunks[i]);
      }
    }
    setScannerState(next);
  };

  const handleSimulateFullScan = () => {
    let next = createInitialAirgapScannerState();
    next = stepAirgapScanner(next, preparedTransfer.metadataJson);
    for (let i = 0; i < preparedTransfer.totalChunks; i++) {
      next = stepAirgapScanner(next, preparedTransfer.encodedChunks[i]);
    }
    setScannerState(next);
  };

  // Drag & Drop handler
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  // Reusable Generator QR Stage
  const renderGeneratorQrStage = () => (
    <div className="m3-surface-card p-3 flex flex-col gap-2.5 border border-[var(--m3-outline-variant)]">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--m3-outline-variant)] pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider">
            Optical QR Emitter
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
              isTransferring
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                : 'bg-[var(--m3-surface-container-high)] text-slate-300'
            }`}
          >
            {isTransferring ? '● STREAMING' : 'STANDBY'}
          </span>
        </div>
        <span className="text-[11px] font-mono font-bold text-[var(--m3-primary)]">
          {currentChunkIndex === -1
            ? 'FRAME 0 (META)'
            : `CHUNK #${currentChunkIndex.toString().padStart(2, '0')} (${
                currentChunkIndex + 1
              }/${preparedTransfer.totalChunks})`}
        </span>
      </div>

      {/* High-Contrast QR Canvas Pad */}
      <div className="flex flex-col items-center justify-center p-2.5 rounded bg-white text-slate-900 border border-slate-300">
        <canvas
          ref={generatorCanvasRef}
          id="qrcode"
          style={{ transform: flipQr ? 'scaleX(-1)' : 'none' }}
          className="max-w-full h-auto block"
        />
        <div className="mt-1.5 w-full flex items-center justify-between px-2 pt-1.5 border-t border-slate-200 text-[10px] font-mono text-slate-600">
          <span className="truncate max-w-[200px]">{preparedTransfer.name}</span>
          <span>
            {currentChunkIndex === -1
              ? `${preparedTransfer.metadataJson.length} B JSON`
              : `${currentQrText.length} B Frame`}
          </span>
        </div>
      </div>

      {/* Frame Scrubber Bar */}
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          title="Previous Frame"
          onClick={() =>
            handleSelectGeneratorFrame(Math.max(-1, currentChunkIndex - 1))
          }
          className="p-1 rounded m3-surface-low border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface)] cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <input
          type="range"
          aria-label="Scrub Optical QR Frame"
          min={-1}
          max={Math.max(0, preparedTransfer.totalChunks - 1)}
          value={currentChunkIndex}
          onChange={(e) => handleSelectGeneratorFrame(Number(e.target.value))}
          className="flex-1 accent-[var(--m3-primary)] cursor-pointer h-1.5"
        />
        <button
          type="button"
          title="Next Frame"
          onClick={() =>
            handleSelectGeneratorFrame(
              Math.min(preparedTransfer.totalChunks - 1, currentChunkIndex + 1)
            )
          }
          className="p-1 rounded m3-surface-low border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface)] cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Primary Transport & Speed Controls */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {!isTransferring ? (
            <button
              type="button"
              onClick={() => setIsTransferring(true)}
              className="min-h-[32px] px-3 py-1 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 cursor-pointer rounded"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Start Transfer</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsTransferring(false);
                setSenderUserMessage('Transmission paused');
              }}
              className="min-h-[32px] px-3 py-1 text-xs font-semibold m3-btn-tonal flex items-center gap-1.5 cursor-pointer rounded"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop Transfer</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setLoopStream((l) => !l)}
            className={`min-h-[32px] px-2 py-1 text-[11px] font-mono rounded border cursor-pointer flex items-center gap-1 ${
              loopStream
                ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] border-[var(--m3-primary)] font-bold'
                : 'm3-surface-low text-slate-400 border-[var(--m3-outline-variant)]'
            }`}
          >
            <Repeat className="w-3 h-3" />
            <span>Loop: {loopStream ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setFlipQr((f) => !f)}
            className={`min-h-[32px] px-2 py-1 text-[11px] font-mono rounded border cursor-pointer flex items-center gap-1 ${
              flipQr
                ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] border-[var(--m3-primary)]'
                : 'm3-surface-low text-slate-400 border-[var(--m3-outline-variant)]'
            }`}
          >
            <FlipHorizontal className="w-3 h-3" />
            <span>Flip</span>
          </button>
        </div>

        <div className="inline-flex rounded p-0.5 bg-[var(--m3-surface-container-high)] text-[10px] font-mono">
          {[50, 80, 120, 180].map((delay) => (
            <button
              key={delay}
              type="button"
              onClick={() => setFrameDelayMs(delay)}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
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

      {/* Status Line */}
      <div className="px-2.5 py-1.5 rounded bg-[var(--m3-surface-container-low)] text-[11px] font-mono flex items-center justify-between border border-[var(--m3-outline-variant)]">
        <span className="truncate text-slate-300">{senderUserMessage}</span>
        <span className="text-[10px] text-slate-400 shrink-0 ml-2">
          {Math.round(1000 / frameDelayMs)} fps
        </span>
      </div>
    </div>
  );

  // Reusable Generator File Configuration & Outgoing Frame Queue
  const renderGeneratorPayloadConfig = () => (
    <div className="m3-surface-card p-3 flex flex-col gap-3 border border-[var(--m3-outline-variant)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--m3-outline-variant)] pb-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider">
            Source Payload &amp; Outgoing Frame Manifest
          </h2>
          <p className="text-[11px] font-mono m3-text-muted">
            Select a file to compress with Pako Gzip (Level 9) for optical transmission
          </p>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-mono">
          <span className="text-slate-400 mr-1">Chunk Size:</span>
          {[250, 350, 500].map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => onChangeChunkSize(sz)}
              className={`px-2 py-0.5 rounded font-mono cursor-pointer border ${
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

      {/* Compact Drag-and-Drop Zone */}
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
        className={`border border-dashed p-2.5 rounded flex items-center justify-between gap-3 cursor-pointer transition-colors ${
          isDraggingOver
            ? 'border-[var(--m3-primary)] bg-[var(--m3-surface-container-high)]'
            : 'border-[var(--m3-outline)] m3-surface-low hover:border-[var(--m3-primary)]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded bg-[var(--m3-primary)] text-[var(--m3-on-primary)] flex items-center justify-center shrink-0">
            <FileUp className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">
              {preparedTransfer.name}
            </div>
            <div className="text-[10px] font-mono m3-text-muted truncate">
              Drop any file here or click to browse local filesystem (100% offline)
            </div>
          </div>
        </div>

        <span className="min-h-[28px] px-2.5 py-1 text-[11px] font-semibold m3-btn-filled rounded shrink-0 flex items-center">
          Browse File
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

      {/* 4-Cell Dense Compression Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="m3-surface-low px-2.5 py-1.5 rounded border border-[var(--m3-outline-variant)]">
          <div className="text-[10px] text-slate-400">RAW BYTES</div>
          <div className="font-bold text-sm">{preparedTransfer.originalSize} B</div>
        </div>
        <div className="m3-surface-low px-2.5 py-1.5 rounded border border-[var(--m3-outline-variant)]">
          <div className="text-[10px] text-slate-400">GZIP (LVL 9)</div>
          <div className="font-bold text-sm text-[var(--m3-primary)]">
            {preparedTransfer.compressedSize} B
          </div>
        </div>
        <div className="m3-surface-low px-2.5 py-1.5 rounded border border-[var(--m3-outline-variant)]">
          <div className="text-[10px] text-slate-400">COMPRESSION</div>
          <div className="font-bold text-sm text-emerald-400">
            {preparedTransfer.compressionRatioPct > 0
              ? `-${preparedTransfer.compressionRatioPct}%`
              : '0%'}
          </div>
        </div>
        <div className="m3-surface-low px-2.5 py-1.5 rounded border border-[var(--m3-outline-variant)]">
          <div className="text-[10px] text-slate-400">QR FRAMES</div>
          <div className="font-bold text-sm">
            {preparedTransfer.totalChunks} + 1 Meta
          </div>
        </div>
      </div>

      {/* Quick Deterministic Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-slate-400">Load Test Payload:</span>
          <button
            type="button"
            onClick={() => onLoadPresetFile('TELEMETRY')}
            className="px-2 py-0.5 rounded text-[10px] m3-surface-low border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface)] cursor-pointer"
          >
            calibration-telemetry.json
          </button>
          <button
            type="button"
            onClick={() => onLoadPresetFile('SPEC')}
            className="px-2 py-0.5 rounded text-[10px] m3-surface-low border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface)] cursor-pointer"
          >
            optical-arq-protocol.txt
          </button>
          <button
            type="button"
            onClick={() => onLoadPresetFile('SVG')}
            className="px-2 py-0.5 rounded text-[10px] m3-surface-low border border-[var(--m3-outline-variant)] hover:bg-[var(--m3-surface)] cursor-pointer"
          >
            reticle-diagram.svg
          </button>
        </div>
      </div>

      {/* Outgoing Transmitter Frame Selector (Click any row to project that frame) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono m3-text-muted">
          <span>
            OUTGOING TRANSMITTER FRAMES (CLICK ANY ROW TO PIN &amp; BROADCAST SINGLE CHUNK)
          </span>
          <span>{preparedTransfer.totalChunks + 1} frames ready</span>
        </div>

        <div className="max-h-48 overflow-y-auto rounded border border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)]">
          <table className="w-full text-left border-collapse text-[11px] font-mono">
            <thead>
              <tr className="border-b border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-high)] text-slate-400 text-[10px]">
                <th className="py-1 px-2.5 w-24">Frame</th>
                <th className="py-1 px-2.5 w-24">Type</th>
                <th className="py-1 px-2.5 w-24">QR Chars</th>
                <th className="py-1 px-2.5">Encoded Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--m3-outline-variant)]">
              <tr
                onClick={() => handleSelectGeneratorFrame(-1)}
                className={`cursor-pointer transition-colors ${
                  currentChunkIndex === -1
                    ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] font-bold'
                    : 'hover:bg-[var(--m3-surface)]'
                }`}
              >
                <td className="py-1 px-2.5">Frame 0</td>
                <td className="py-1 px-2.5">METADATA</td>
                <td className="py-1 px-2.5">{preparedTransfer.metadataJson.length} B</td>
                <td className="py-1 px-2.5 truncate max-w-[220px] text-[10px] opacity-85">
                  {preparedTransfer.metadataJson}
                </td>
              </tr>
              {preparedTransfer.encodedChunks.map((encoded, idx) => (
                <tr
                  key={idx}
                  onClick={() => handleSelectGeneratorFrame(idx)}
                  className={`cursor-pointer transition-colors ${
                    currentChunkIndex === idx
                      ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] font-bold'
                      : 'hover:bg-[var(--m3-surface)]'
                  }`}
                >
                  <td className="py-1 px-2.5">
                    Chunk #{idx.toString().padStart(2, '0')}
                  </td>
                  <td className="py-1 px-2.5">GZIP DATA</td>
                  <td className="py-1 px-2.5">{encoded.length} B</td>
                  <td className="py-1 px-2.5 truncate max-w-[220px] text-[10px] opacity-80">
                    {encoded.slice(0, 42)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Reusable Scanner Camera Viewfinder Stage
  const renderScannerCameraStage = () => (
    <div className="m3-surface-card p-3 flex flex-col gap-2.5 border border-[var(--m3-outline-variant)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--m3-outline-variant)] pb-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider">
            Optical Camera Receiver
          </h2>
          <p className="text-[10px] font-mono m3-text-muted">
            Point camera at Sender QR stream to capture chunks
          </p>
        </div>
        <span
          data-testid="scanner-progress-text"
          className="text-xs font-mono font-bold text-[var(--m3-primary)] whitespace-nowrap shrink-0"
        >
          {scannerState.receivedCount} / {scannerState.fileMetadata?.chunks || 0} Chunks
        </span>
      </div>

      {/* Receiver Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {!cameraActive ? (
            <button
              type="button"
              onClick={() => startReceiverCamera(facingMode)}
              className="min-h-[32px] px-3 py-1 text-xs font-semibold m3-btn-filled flex items-center gap-1.5 cursor-pointer rounded"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Start Receiver</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopReceiver}
              className="min-h-[32px] px-3 py-1 text-xs font-semibold m3-btn-tonal flex items-center gap-1.5 cursor-pointer rounded"
            >
              <CameraOff className="w-3.5 h-3.5" />
              <span>Stop Receiver</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleFacingMode}
            className="min-h-[32px] px-2.5 py-1 text-[11px] font-mono m3-surface-low border border-[var(--m3-outline-variant)] rounded cursor-pointer flex items-center gap-1"
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
          className="min-h-[32px] px-2.5 py-1 text-[11px] font-mono m3-surface-low border border-[var(--m3-outline-variant)] rounded cursor-pointer flex items-center gap-1 text-slate-300 hover:text-white"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Clear Receiver</span>
        </button>
      </div>

      {/* Camera Viewfinder Box */}
      <div className="w-full h-56 bg-[#03060f] border border-slate-800 rounded overflow-hidden relative flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-2.5 py-1 text-[10px] font-mono text-slate-400 bg-slate-950/90 border-b border-slate-800">
          <span>SENSOR ({facingMode.toUpperCase()})</span>
          <span className={cameraActive ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
            {cameraActive ? '● SCANNING (28 FPS)' : 'STANDBY'}
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

          {/* Target Reticle */}
          <div className="absolute w-36 h-36 border-2 border-dashed border-cyan-400/80 rounded pointer-events-none flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping opacity-60" />
          </div>

          {!cameraActive && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center p-4 text-center">
              <p className="text-xs font-semibold text-slate-200">
                Optical Viewfinder Ready
              </p>
              <p className="text-[11px] font-mono text-slate-400 mt-1 max-w-xs">
                Click &ldquo;Start Receiver&rdquo; to open your camera and scan QR chunks from the transmitting device.
              </p>
            </div>
          )}
        </div>

        {cameraError && (
          <div className="shrink-0 bg-amber-950/90 border-t border-amber-500/40 px-2.5 py-1 text-[10px] font-mono text-amber-200">
            {cameraError}
          </div>
        )}
      </div>

      {/* Receiver Status Bar */}
      <div
        role="status"
        className="px-2.5 py-1.5 rounded bg-[var(--m3-surface-container-low)] text-[11px] font-mono flex items-center justify-between border border-[var(--m3-outline-variant)]"
      >
        <span className="truncate">{scannerState.userMessage}</span>
        <span className="font-bold whitespace-nowrap shrink-0 ml-2">
          {scannerState.isComplete
            ? '✔ COMPLETE'
            : scannerState.isReceiving
            ? '● RECEIVING'
            : 'IDLE'}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Dual Testbed Loopback Bar (ONLY visible in Dual Testbed mode) */}
      {viewTab === 'DUAL' && (
        <div className="m3-surface-card px-3 py-2 flex flex-wrap items-center justify-between gap-2 border border-[var(--m3-outline-variant)] text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--m3-primary)]">
              SPLIT TESTBENCH:
            </span>
            <span className="text-slate-300 text-[11px]">
              Generator &amp; Scanner are strictly isolated by default. Use loopback actions to test chunk decoding on one screen:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleSimulatePartialScan}
              className="min-h-[28px] px-2.5 py-1 rounded text-[11px] font-mono bg-amber-950/60 text-amber-300 border border-amber-700/60 hover:bg-amber-900/60 cursor-pointer"
            >
              Simulate Partial Scan (Decoded + Undecoded)
            </button>
            <button
              type="button"
              onClick={handleSimulateFullScan}
              className="min-h-[28px] px-2.5 py-1 rounded text-[11px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900/60 cursor-pointer"
            >
              Simulate Full Scan
            </button>
            <button
              type="button"
              onClick={() => setSimulationBridgeActive((s) => !s)}
              className={`min-h-[28px] px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                simulationBridgeActive
                  ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)] border-[var(--m3-primary)] font-bold'
                  : 'm3-surface-low text-slate-400 border-[var(--m3-outline-variant)] hover:text-white'
              }`}
            >
              Live Stream Bridge: {simulationBridgeActive ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}

      {/* MODE 1: GENERATOR (SEND FILE) — Dense 2-Column Horizontal Workbench */}
      {viewTab === 'GENERATOR' && (
        <div
          aria-label="Data Sender Mode (QR Generator)"
          className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start"
        >
          <div className="lg:col-span-5">{renderGeneratorQrStage()}</div>
          <div className="lg:col-span-7">{renderGeneratorPayloadConfig()}</div>
        </div>
      )}

      {/* MODE 2: SCANNER (RECEIVE FILE) — Dense 2-Column Horizontal Workbench */}
      {viewTab === 'SCANNER' && (
        <div
          aria-label="Data Receiver Mode (QR Scanner)"
          className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start"
        >
          <div className="lg:col-span-5">{renderScannerCameraStage()}</div>
          <div className="lg:col-span-7">
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
          </div>
        </div>
      )}

      {/* MODE 3: DUAL TESTBED — Side-by-Side Generator (Left) + Scanner & Chunks Inspector (Right) */}
      {viewTab === 'DUAL' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
          <div className="lg:col-span-5 flex flex-col gap-3">
            {renderGeneratorQrStage()}
            {renderGeneratorPayloadConfig()}
          </div>
          <div className="lg:col-span-7 flex flex-col gap-3">
            {renderScannerCameraStage()}
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
          </div>
        </div>
      )}
    </div>
  );
};
