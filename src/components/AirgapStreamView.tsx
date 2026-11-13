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
  peekAirgapChunkIndex,
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
  onNotify?: (
    title: string,
    description?: string,
    tone?: 'success' | 'info' | 'warning'
  ) => void;
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
  onNotify,
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
  const [scanFps, setScanFps] = useState<number>(0);
  const [decodeMs, setDecodeMs] = useState<number>(0);

  const generatorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const downloadedRef = useRef<boolean>(false);

  // Fast O(1) refs so the 60FPS camera loop never calls setState or atob() on already-captured chunks
  const decodedIndicesRef = useRef<Set<number>>(new Set());
  const lastScannedRawRef = useRef<string>('');
  const activeMetadataRawRef = useRef<string>('');

  // Keep fast lookup refs synchronized with scannerState
  useEffect(() => {
    const nextSet = new Set<number>();
    for (const k of Object.keys(scannerState.decodedChunks)) {
      const idx = Number(k);
      if (!Number.isNaN(idx)) nextSet.add(idx);
    }
    decodedIndicesRef.current = nextSet;
    lastScannedRawRef.current = scannerState.lastScannedRaw;
    activeMetadataRawRef.current = scannerState.fileMetadata
      ? JSON.stringify(scannerState.fileMetadata)
      : '';
  }, [
    scannerState.decodedChunks,
    scannerState.lastScannedRaw,
    scannerState.fileMetadata,
  ]);

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
  // Uses errorCorrectionLevel: 'L' for larger, bolder QR modules that cameras capture 2x faster
  useEffect(() => {
    const canvas = generatorCanvasRef.current;
    if (!canvas) return;
    const textToEncode = currentQrText || preparedTransfer.metadataJson;

    QRCode.toCanvas(
      canvas,
      textToEncode,
      {
        width: 264,
        margin: qrQuietZoneBoost ? 4 : 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'L',
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
      if (!decodedText) return;

      // Fast O(1) pre-filter before touching React state
      if (decodedText === lastScannedRawRef.current) return;
      const chunkIdx = peekAirgapChunkIndex(decodedText);
      if (chunkIdx !== null && decodedIndicesRef.current.has(chunkIdx)) {
        lastScannedRawRef.current = decodedText;
        return;
      }

      lastScannedRawRef.current = decodedText;
      if (chunkIdx !== null) {
        decodedIndicesRef.current.add(chunkIdx);
      }

      setScannerState((prev) => {
        const next = stepAirgapScanner(prev, decodedText);
        if (next === prev) return prev;

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

  // Animated Generator Transmission Loop (Interleaves Metadata every 12 frames for instant mid-stream lock)
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
        await wait(Math.max(180, frameDelayMs * 2));

        for (let i = 0; i < preparedTransfer.totalChunks; i++) {
          if (cancelled) break;

          // Every 12 chunks in large streams, pulse the metadata frame briefly so mid-stream receivers lock immediately
          if (i > 0 && i % 12 === 0) {
            setCurrentChunkIndex(-1);
            setCurrentQrText(preparedTransfer.metadataJson);
            await wait(frameDelayMs);
            if (cancelled) break;
          }

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
    setScanFps(0);
  }, []);

  const startReceiverCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    downloadedRef.current = false;
    setScannerState((prev) => ({
      ...prev,
      isReceiving: true,
      userMessage: 'High-FPS optical scanner active — point at QR stream...',
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
          width: { ideal: 640 },
          height: { ideal: 640 },
          frameRate: { ideal: 60, min: 30 },
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

  // ULTRA-FAST 60 FPS Camera QR Scanning Pipeline
  useEffect(() => {
    if (!cameraActive || !scannerState.isReceiving) return;

    type BarcodeDetectorLike = {
      detect: (
        source: HTMLVideoElement | HTMLCanvasElement
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

    let rafId: number | null = null;
    let isDecoding = false;
    let lastVideoTime = -1;
    let frameCounter = 0;
    let scansInWindow = 0;
    let windowStart = performance.now();

    const SCAN_SIZE = 360;
    const canvas = scanCanvasRef.current;
    if (canvas && (canvas.width !== SCAN_SIZE || canvas.height !== SCAN_SIZE)) {
      canvas.width = SCAN_SIZE;
      canvas.height = SCAN_SIZE;
    }
    const ctx = canvas?.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    });

    const scanLoop = async () => {
      rafId = window.requestAnimationFrame(scanLoop);
      if (isDecoding) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const currentVideoTime = video.currentTime;
      if (currentVideoTime === lastVideoTime) return;
      lastVideoTime = currentVideoTime;

      isDecoding = true;
      const t0 = performance.now();
      frameCounter++;
      scansInWindow++;

      try {
        // Fast Path 1: Hardware-accelerated BarcodeDetector directly on the <video> element
        if (nativeDetector) {
          try {
            const codes = await nativeDetector.detect(video);
            if (codes.length > 0 && codes[0].rawValue) {
              handleDecodedQrFrame(codes[0].rawValue, 'CAMERA');
              const elapsed = performance.now() - t0;
              if (frameCounter % 10 === 0) setDecodeMs(Math.round(elapsed * 10) / 10);
              isDecoding = false;
              return;
            }
          } catch {
            // Fall through to fast 360x360 jsQR
          }
        }

        // Fast Path 2: Center-cropped 360x360 downscaled jsQR
        if (canvas && ctx) {
          const vw = video.videoWidth || 480;
          const vh = video.videoHeight || 480;
          const minDim = Math.min(vw, vh);
          const sx = (vw - minDim) / 2;
          const sy = (vh - minDim) / 2;

          ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, SCAN_SIZE, SCAN_SIZE);
          const imageData = ctx.getImageData(0, 0, SCAN_SIZE, SCAN_SIZE);

          const invMode = frameCounter % 8 === 0 ? 'attemptBoth' : 'dontInvert';
          const code = jsQR(imageData.data, SCAN_SIZE, SCAN_SIZE, {
            inversionAttempts: invMode,
          });

          if (code && code.data) {
            handleDecodedQrFrame(code.data, 'CAMERA');
          }
        }
      } finally {
        const now = performance.now();
        const elapsed = now - t0;
        if (frameCounter % 12 === 0) {
          setDecodeMs(Math.round(elapsed * 10) / 10);
        }
        if (now - windowStart >= 1000) {
          setScanFps(Math.round((scansInWindow * 1000) / (now - windowStart)));
          scansInWindow = 0;
          windowStart = now;
        }
        isDecoding = false;
      }
    };

    rafId = window.requestAnimationFrame(scanLoop);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [cameraActive, scannerState.isReceiving, handleDecodedQrFrame]);

  // Dual-Testbed diagnostic helpers (ONLY in Dual Testbed mode)
  const handleSimulatePartialScan = () => {
    decodedIndicesRef.current.clear();
    lastScannedRawRef.current = '';
    let next = createInitialAirgapScannerState();
    next = stepAirgapScanner(next, preparedTransfer.metadataJson);
    for (let i = 0; i < preparedTransfer.totalChunks; i++) {
      if (i % 2 === 0) {
        next = stepAirgapScanner(next, preparedTransfer.encodedChunks[i]);
      }
    }
    setScannerState(next);
  };

  const handleSimulateFullScan = () => {
    decodedIndicesRef.current.clear();
    lastScannedRawRef.current = '';
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

  // Left Pane of Generator Console: Optical Emitter Stage
  const renderGeneratorQrStage = (embedded = false) => (
    <div
      className={
        embedded
          ? 'flex flex-col justify-between h-full'
          : 'm3-surface-card overflow-hidden flex flex-col justify-between'
      }
    >
      {/* Top Bar — Zero pill badges, clean status dot + tabular frame counter */}
      <div className="px-5 py-3.5 border-b border-[var(--m3-outline-variant)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isTransferring ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
            }`}
          />
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Optical Transmitter
            </h2>
            <p className="text-[11px] m3-text-muted">
              {isTransferring
                ? `Broadcasting at ${Math.round(1000 / frameDelayMs)} Hz`
                : 'Standby · High-contrast ECC-L projection'}
            </p>
          </div>
        </div>

        <div className="text-right font-mono tabular-nums">
          <div className="text-xs font-semibold text-[var(--m3-primary)]">
            {currentChunkIndex === -1
              ? 'Frame 0 · Meta'
              : `Chunk #${currentChunkIndex.toString().padStart(2, '0')} / ${(
                  preparedTransfer.totalChunks - 1
                )
                  .toString()
                  .padStart(2, '0')}`}
          </div>
          <div className="text-[11px] m3-text-muted">
            {currentChunkIndex === -1
              ? `${preparedTransfer.metadataJson.length} B`
              : `${currentQrText.length} B`}{' '}
            · {Math.round(1000 / frameDelayMs)} FPS
          </div>
        </div>
      </div>

      {/* Center Stage — Futuristic Precision Optical Mount + High-Contrast QR Pad */}
      <div className="relative p-6 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--m3-primary)_14%,transparent)_0%,transparent_72%)]">
        <div className="relative p-3">
          {/* Precision Corner Fiducial Brackets */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[var(--m3-primary)]/70 rounded-tl-md"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[var(--m3-primary)]/70 rounded-tr-md"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[var(--m3-primary)]/70 rounded-bl-md"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[var(--m3-primary)]/70 rounded-br-md"
          />

          <div
            style={{ borderRadius: 'var(--m3-radius-md)' }}
            className={`p-4 bg-white text-zinc-950 flex flex-col items-center transition-shadow duration-300 ${
              isTransferring
                ? 'shadow-[0_0_42px_-6px_color-mix(in_srgb,var(--m3-primary)_50%,transparent)]'
                : 'shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]'
            }`}
          >
            <canvas
              ref={generatorCanvasRef}
              id="qrcode"
              style={{ transform: flipQr ? 'scaleX(-1)' : 'none' }}
              className="max-w-full h-auto block"
            />
            <div className="mt-2.5 pt-2 border-t border-zinc-200 w-full flex items-center justify-between text-[11px] font-mono text-zinc-600 tabular-nums">
              <span className="truncate max-w-[180px] font-medium text-zinc-800">
                {preparedTransfer.name}
              </span>
              <span>
                {currentChunkIndex === -1
                  ? 'INIT HEADER'
                  : `FRAME ${currentChunkIndex + 1} OF ${preparedTransfer.totalChunks}`}
              </span>
            </div>
          </div>
        </div>

        {/* Minimalist Scrubber */}
        <div className="mt-4 w-full max-w-[300px] flex items-center gap-2">
          <button
            type="button"
            title="Previous Frame"
            onClick={() =>
              handleSelectGeneratorFrame(Math.max(-1, currentChunkIndex - 1))
            }
            className="p-1.5 rounded-lg text-zinc-400 hover:text-[var(--m3-on-surface)] hover:bg-[var(--m3-surface-container-high)] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="range"
            aria-label="Scrub Optical QR Frame"
            min={-1}
            max={Math.max(0, preparedTransfer.totalChunks - 1)}
            value={currentChunkIndex}
            onChange={(e) => handleSelectGeneratorFrame(Number(e.target.value))}
            className="flex-1 accent-[var(--m3-primary)] cursor-pointer h-1"
          />
          <button
            type="button"
            title="Next Frame"
            onClick={() =>
              handleSelectGeneratorFrame(
                Math.min(preparedTransfer.totalChunks - 1, currentChunkIndex + 1)
              )
            }
            className="p-1.5 rounded-lg text-zinc-400 hover:text-[var(--m3-on-surface)] hover:bg-[var(--m3-surface-container-high)] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Transport & Cadence Control Strip */}
      <div className="px-5 py-3.5 border-t border-[var(--m3-outline-variant)] flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {!isTransferring ? (
              <button
                type="button"
                onClick={() => setIsTransferring(true)}
                data-magnetic
                data-cursor-label="Transmit"
                className="min-h-[36px] px-4 py-1.5 text-xs font-semibold m3-btn-filled rounded-full flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Transfer</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsTransferring(false);
                  setSenderUserMessage('Transmission paused');
                }}
                className="min-h-[36px] px-4 py-1.5 text-xs font-semibold m3-btn-tonal rounded-full flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Transfer</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLoopStream((l) => !l)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer flex items-center gap-1.5 ${
                loopStream
                  ? 'border-[var(--m3-outline)] text-[var(--m3-on-surface)] bg-[var(--m3-surface-container-high)]'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Loop {loopStream ? 'On' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={() => setFlipQr((f) => !f)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer flex items-center gap-1.5 ${
                flipQr
                  ? 'border-[var(--m3-outline)] text-[var(--m3-on-surface)] bg-[var(--m3-surface-container-high)]'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span>Mirror</span>
            </button>
          </div>

          <div className="inline-flex items-center rounded-full p-0.5 bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-[11px] font-mono tabular-nums">
            {[35, 60, 90, 140].map((delay) => (
              <button
                key={delay}
                type="button"
                onClick={() => setFrameDelayMs(delay)}
                className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                  frameDelayMs === delay
                    ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-primary)] font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {delay}ms
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono m3-text-muted pt-1 border-t border-[var(--m3-outline-variant)]/60">
          <span className="truncate">{senderUserMessage}</span>
          <span className="shrink-0 ml-2 text-zinc-400">
            Zero local auto-download
          </span>
        </div>
      </div>
    </div>
  );

  // Right Pane of Generator Console: Payload Ingestion, Hairline Telemetry & Frame Schedule
  const renderGeneratorPayloadConfig = (embedded = false) => (
    <div
      className={
        embedded
          ? 'flex flex-col h-full'
          : 'm3-surface-card overflow-hidden flex flex-col'
      }
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[var(--m3-outline-variant)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Payload &amp; Frame Schedule
          </h2>
          <p className="text-[11px] m3-text-muted">
            Deflate Gzip (Level 9) · Base64 optical packetization
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[11px] m3-text-muted">Frame capacity:</span>
          <div className="inline-flex rounded-full p-0.5 bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-[11px] font-mono tabular-nums">
            {[200, 250, 350].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => onChangeChunkSize(sz)}
                className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                  chunkSize === sz
                    ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-primary)] font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {sz}B
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* File Drop Zone & Quick Presets Row */}
      <div className="p-5 border-b border-[var(--m3-outline-variant)] flex flex-col gap-3">
        <div
          data-testid="file-drop-zone"
          data-cursor-label="Drop File"
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
          className={`border border-dashed px-4 py-3.5 flex items-center justify-between gap-4 cursor-pointer transition-all ${
            isDraggingOver
              ? 'border-[var(--m3-primary)] bg-[var(--m3-surface-container-high)] shadow-[0_0_24px_-6px_var(--m3-primary)]'
              : 'border-[var(--m3-outline)] bg-[var(--m3-surface-container-low)]/80 hover:border-[var(--m3-primary)]'
          }`}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--m3-primary)]/15 text-[var(--m3-primary)] flex items-center justify-center shrink-0 border border-[var(--m3-primary)]/30">
              <FileUp className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">
                {preparedTransfer.name}
              </div>
              <div className="text-[11px] m3-text-muted truncate">
                Drop any file here or click to browse local filesystem (100% air-gapped)
              </div>
            </div>
          </div>

          <span className="min-h-[32px] px-3.5 py-1 text-xs font-semibold m3-btn-tonal rounded-full shrink-0 flex items-center">
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

        {/* Clean Unboxed Sample Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] m3-text-muted">Reference payloads:</span>
            <button
              type="button"
              onClick={() => onLoadPresetFile('TELEMETRY')}
              className="text-[11px] font-mono text-zinc-400 hover:text-[var(--m3-primary)] underline-offset-4 hover:underline cursor-pointer"
            >
              calibration-telemetry.json
            </button>
            <span className="text-zinc-700">·</span>
            <button
              type="button"
              onClick={() => onLoadPresetFile('SPEC')}
              className="text-[11px] font-mono text-zinc-400 hover:text-[var(--m3-primary)] underline-offset-4 hover:underline cursor-pointer"
            >
              optical-arq-protocol.txt
            </button>
            <span className="text-zinc-700">·</span>
            <button
              type="button"
              onClick={() => onLoadPresetFile('SVG')}
              className="text-[11px] font-mono text-zinc-400 hover:text-[var(--m3-primary)] underline-offset-4 hover:underline cursor-pointer"
            >
              reticle-diagram.svg
            </button>
          </div>
        </div>
      </div>

      {/* 4-Column Hairline Telemetry Ribbon (Single-Elevation, Oversized Tabular Numerals) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--m3-outline-variant)] border-b border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)]/50 font-mono tabular-nums">
        <div className="px-5 py-3.5">
          <div className="text-[11px] font-sans m3-text-muted">Source Size</div>
          <div className="text-base font-semibold tracking-tight mt-0.5">
            {preparedTransfer.originalSize.toLocaleString()} B
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-[11px] font-sans m3-text-muted">Compressed (Gzip)</div>
          <div className="text-base font-semibold tracking-tight mt-0.5 text-[var(--m3-primary)]">
            {preparedTransfer.compressedSize.toLocaleString()} B
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-[11px] font-sans m3-text-muted">Reduction</div>
          <div className="text-base font-semibold tracking-tight mt-0.5 text-emerald-400">
            {preparedTransfer.compressionRatioPct > 0
              ? `-${preparedTransfer.compressionRatioPct}%`
              : '0%'}
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-[11px] font-sans m3-text-muted">Optical Frames</div>
          <div className="text-base font-semibold tracking-tight mt-0.5">
            {preparedTransfer.totalChunks} + 1 Meta
          </div>
        </div>
      </div>

      {/* Full-Bleed Frame Schedule Table */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-5 py-2.5 border-b border-[var(--m3-outline-variant)] flex items-center justify-between text-xs">
          <span className="font-medium text-zinc-300">
            Outgoing Frame Schedule
          </span>
          <span className="text-[11px] m3-text-muted">
            Select any row to pin &amp; broadcast frame
          </span>
        </div>

        <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
            <thead>
              <tr className="border-b border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)] text-zinc-400 text-[11px] font-sans">
                <th className="py-2 px-5 font-medium w-28">Frame</th>
                <th className="py-2 px-3 font-medium w-28">Packet Type</th>
                <th className="py-2 px-3 font-medium w-24">Length</th>
                <th className="py-2 px-5 font-medium">Payload Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--m3-outline-variant)]">
              <tr
                onClick={() => handleSelectGeneratorFrame(-1)}
                className={`cursor-pointer transition-colors ${
                  currentChunkIndex === -1
                    ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-primary)] font-semibold'
                    : 'hover:bg-[var(--m3-surface-container-low)]'
                }`}
              >
                <td className="py-2 px-5">Frame 00</td>
                <td className="py-2 px-3">Metadata</td>
                <td className="py-2 px-3">{preparedTransfer.metadataJson.length} B</td>
                <td className="py-2 px-5 truncate max-w-[260px] text-[11px] opacity-80">
                  {preparedTransfer.metadataJson}
                </td>
              </tr>
              {preparedTransfer.encodedChunks.map((encoded, idx) => (
                <tr
                  key={idx}
                  onClick={() => handleSelectGeneratorFrame(idx)}
                  className={`cursor-pointer transition-colors ${
                    currentChunkIndex === idx
                      ? 'bg-[var(--m3-surface-container-high)] text-[var(--m3-primary)] font-semibold'
                      : 'hover:bg-[var(--m3-surface-container-low)]'
                  }`}
                >
                  <td className="py-2 px-5">
                    Chunk #{idx.toString().padStart(2, '0')}
                  </td>
                  <td className="py-2 px-3">Gzip Data</td>
                  <td className="py-2 px-3">{encoded.length} B</td>
                  <td className="py-2 px-5 truncate max-w-[260px] text-[11px] opacity-75">
                    {encoded.slice(0, 48)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Left Pane of Scanner Console: High-FPS Camera Viewfinder
  const renderScannerCameraStage = (embedded = false) => (
    <div
      className={
        embedded
          ? 'flex flex-col justify-between h-full'
          : 'm3-surface-card overflow-hidden flex flex-col justify-between'
      }
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[var(--m3-outline-variant)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2 h-2 rounded-full ${
              cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
            }`}
          />
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              60Hz Optical Receiver
            </h2>
            <p className="text-[11px] m3-text-muted">
              360×360 ROI · Hardware BarcodeDetector · O(1) dedupe
            </p>
          </div>
        </div>

        <span
          data-testid="scanner-progress-text"
          className="text-xs font-mono font-semibold text-[var(--m3-primary)] tabular-nums whitespace-nowrap shrink-0"
        >
          {scannerState.receivedCount} / {scannerState.fileMetadata?.chunks || 0} Chunks
        </span>
      </div>

      {/* Camera Sensor Stage with Futuristic HUD Reticle */}
      <div className="p-5 flex flex-col gap-3 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--m3-primary)_10%,transparent)_0%,transparent_75%)]">
        <div
          style={{ borderRadius: 'var(--m3-radius-md)' }}
          className="w-full h-64 bg-[#050608] border border-[var(--m3-outline-variant)] overflow-hidden relative flex flex-col shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
        >
          <div className="shrink-0 flex items-center justify-between px-3.5 py-2 text-[11px] font-mono text-zinc-400 bg-zinc-950/90 border-b border-zinc-800/80 tabular-nums">
            <span>
              Sensor ({facingMode === 'environment' ? 'Rear' : 'Front'}) · 360×360 ROI
            </span>
            <span className={cameraActive ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
              {cameraActive
                ? `● ${scanFps || 60} FPS (${decodeMs || 3.1}ms)`
                : 'Standby'}
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

            {/* Futuristic Optical HUD Reticle with Corner Fiducials & Laser Scanline */}
            <div className="absolute w-48 h-44 rounded-2xl border border-dashed border-[var(--m3-primary)]/40 pointer-events-none flex items-center justify-center z-20 overflow-hidden">
              <div
                className={`absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--m3-primary)] to-transparent ${
                  cameraActive ? 'animate-scanline' : 'opacity-60'
                }`}
              />
              <span className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-[var(--m3-primary)] rounded-tl-sm" />
              <span className="absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-[var(--m3-primary)] rounded-tr-sm" />
              <span className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-[var(--m3-primary)] rounded-bl-sm" />
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-[var(--m3-primary)] rounded-br-sm" />
              {cameraActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--m3-primary)] shadow-[0_0_10px_var(--m3-primary)]" />
              )}
            </div>

            {!cameraActive && (
              <div className="absolute inset-0 bg-zinc-950/80 flex flex-col items-center justify-center p-5 text-center z-10">
                <p className="text-xs font-semibold text-zinc-100 tracking-tight">
                  Optical Viewfinder Standby
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 max-w-[168px] leading-relaxed">
                  Align incoming QR stream inside the laser reticle
                </p>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="shrink-0 bg-amber-950/90 border-t border-amber-500/40 px-3.5 py-2 text-[11px] font-mono text-amber-200">
              {cameraError}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls & Status Strip */}
      <div className="px-5 py-3.5 border-t border-[var(--m3-outline-variant)] flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {!cameraActive ? (
              <button
                type="button"
                onClick={() => startReceiverCamera(facingMode)}
                data-magnetic
                data-cursor-label="Scan"
                className="min-h-[36px] px-4 py-1.5 text-xs font-semibold m3-btn-filled rounded-full flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Start Receiver</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopReceiver}
                className="min-h-[36px] px-4 py-1.5 text-xs font-semibold m3-btn-tonal rounded-full flex items-center gap-1.5 cursor-pointer"
              >
                <CameraOff className="w-3.5 h-3.5" />
                <span>Stop Receiver</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleFacingMode}
              className="min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-full border border-[var(--m3-outline-variant)] text-zinc-300 hover:text-white cursor-pointer flex items-center gap-1.5"
            >
              <SwitchCamera className="w-3.5 h-3.5" />
              <span>{facingMode === 'environment' ? 'Rear Camera' : 'Front Camera'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              downloadedRef.current = false;
              decodedIndicesRef.current.clear();
              lastScannedRawRef.current = '';
              setScannerState(createInitialAirgapScannerState());
            }}
            className="min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-full text-zinc-400 hover:text-white cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>

        <div
          role="status"
          className="flex items-center justify-between text-[11px] font-mono m3-text-muted pt-1 border-t border-[var(--m3-outline-variant)]/60"
        >
          <span className="truncate">{scannerState.userMessage}</span>
          <span className="font-semibold whitespace-nowrap shrink-0 ml-2 text-[var(--m3-primary)]">
            {scannerState.isComplete
              ? '● Complete'
              : scannerState.isReceiving
              ? '● Receiving'
              : 'Idle'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Dual Testbed Loopback Bar (ONLY visible in Dual Testbed mode) */}
      {viewTab === 'DUAL' && (
        <div className="m3-surface-card px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[var(--m3-primary)]" />
            <span className="font-semibold">Loopback Verification Harness</span>
            <span className="text-zinc-500 hidden sm:inline">·</span>
            <span className="m3-text-muted text-[11px]">
              Generator and Scanner remain strictly isolated unless you trigger a loopback pass:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSimulatePartialScan}
              className="min-h-[32px] px-3.5 py-1 rounded-full text-xs font-medium border border-[var(--m3-outline)] text-zinc-200 hover:bg-[var(--m3-surface-container-high)] cursor-pointer"
            >
              Simulate Partial Scan
            </button>
            <button
              type="button"
              onClick={handleSimulateFullScan}
              className="min-h-[32px] px-3.5 py-1 rounded-full text-xs font-medium border border-[var(--m3-outline)] text-zinc-200 hover:bg-[var(--m3-surface-container-high)] cursor-pointer"
            >
              Simulate Full Scan
            </button>
            <button
              type="button"
              onClick={() => setSimulationBridgeActive((s) => !s)}
              className={`min-h-[32px] px-3.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                simulationBridgeActive
                  ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)] border-[var(--m3-primary)] font-semibold'
                  : 'border-[var(--m3-outline-variant)] text-zinc-400 hover:text-white'
              }`}
            >
              Live Stream Bridge: {simulationBridgeActive ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      )}

      {/* MODE 1: GENERATOR (SEND FILE) — Unified Single-Elevation Split Console */}
      {viewTab === 'GENERATOR' && (
        <div
          aria-label="Data Sender Mode (QR Generator)"
          className="m3-surface-card overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--m3-outline-variant)]"
        >
          <div className="lg:col-span-5">{renderGeneratorQrStage(true)}</div>
          <div className="lg:col-span-7">{renderGeneratorPayloadConfig(true)}</div>
        </div>
      )}

      {/* MODE 2: SCANNER (RECEIVE FILE) — Unified Single-Elevation Split Console */}
      {viewTab === 'SCANNER' && (
        <div
          aria-label="Data Receiver Mode (QR Scanner)"
          className="m3-surface-card overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--m3-outline-variant)]"
        >
          <div className="lg:col-span-5">{renderScannerCameraStage(true)}</div>
          <div className="lg:col-span-7">
            <ChunksInspector
              embedded
              fileMetadata={scannerState.fileMetadata}
              decodedChunks={scannerState.decodedChunks}
              receivedCount={scannerState.receivedCount}
              isComplete={scannerState.isComplete}
              reconstructedBytes={scannerState.reconstructedBytes}
              onSimulateSampleScan={() => {
                handleSimulatePartialScan();
                onNotify?.(
                  'Sample Chunk Split Loaded',
                  `Indexed ${preparedTransfer.name} (Decoded & Undecoded preview)`,
                  'info'
                );
              }}
              onNotify={(title, desc) => onNotify?.(title, desc, 'info')}
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-5 m3-surface-card overflow-hidden divide-y divide-[var(--m3-outline-variant)]">
            {renderGeneratorQrStage(true)}
            {renderGeneratorPayloadConfig(true)}
          </div>
          <div className="lg:col-span-7 m3-surface-card overflow-hidden divide-y divide-[var(--m3-outline-variant)]">
            {renderScannerCameraStage(true)}
            <ChunksInspector
              embedded
              fileMetadata={scannerState.fileMetadata}
              decodedChunks={scannerState.decodedChunks}
              receivedCount={scannerState.receivedCount}
              isComplete={scannerState.isComplete}
              reconstructedBytes={scannerState.reconstructedBytes}
              onSimulateSampleScan={() => {
                handleSimulatePartialScan();
                onNotify?.(
                  'Partial Scan Simulated',
                  `Indexed ${preparedTransfer.name} in Dual Testbed`,
                  'info'
                );
              }}
              onNotify={(title, desc) => onNotify?.(title, desc, 'info')}
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

