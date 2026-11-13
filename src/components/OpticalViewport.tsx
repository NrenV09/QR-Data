import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  FlipHorizontal,
  FlipHorizontal2,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';
import { OpticalPacket, serializePacket } from '../utils/opticalProtocol';

interface OpticalViewportProps {
  activePacket: OpticalPacket | null;
  onQrScanned: (raw: string) => void;
  flipQr: boolean;
  onToggleFlipQr: () => void;
  mirrorCamera: boolean;
  onToggleMirrorCamera: () => void;
  scanIntervalMs: number;
  ledState: 'IDLE' | 'WAITING' | 'ACK_PULSE' | 'RESEND_WARN' | 'COMPLETE';
  role: 'SENDER' | 'RECEIVER';
  peerSimPacket: OpticalPacket | null;
  qrQuietZoneBoost?: boolean;
}

export const OpticalViewport: React.FC<OpticalViewportProps> = ({
  activePacket,
  onQrScanned,
  flipQr,
  onToggleFlipQr,
  mirrorCamera,
  onToggleMirrorCamera,
  scanIntervalMs,
  ledState,
  role,
  peerSimPacket,
  qrQuietZoneBoost = false,
}) => {
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const peerQrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenScanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pipMode, setPipMode] = useState<'SPLIT' | 'PIP'>('SPLIT');
  const [scanFps, setScanFps] = useState<number>(0);
  const [lastDetectedBox, setLastDetectedBox] = useState<boolean>(false);
  const [qrByteLength, setQrByteLength] = useState<number>(0);

  const streamRef = useRef<MediaStream | null>(null);
  const onQrScannedRef = useRef(onQrScanned);
  onQrScannedRef.current = onQrScanned;

  // Render high-contrast local QR code in dominant upper viewport
  useEffect(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;

    if (!activePacket) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 280;
        canvas.height = 280;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 2;
        ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
        ctx.fillStyle = '#334155';
        ctx.font = '600 13px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          role === 'SENDER' ? 'DROP FILE TO EMIT QR' : 'RECEIVER STANDBY',
          canvas.width / 2,
          canvas.height / 2 - 8
        );
        ctx.font = '400 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#64748B';
        ctx.fillText(
          role === 'SENDER'
            ? 'Drop or pick a file to emit INIT'
            : 'Scan Sender INIT QR to emit ACK:0',
          canvas.width / 2,
          canvas.height / 2 + 14
        );
      }
      setQrByteLength(0);
      return;
    }

    const serialized = serializePacket(activePacket);
    setQrByteLength(serialized.length);

    QRCode.toCanvas(
      canvas,
      serialized,
      {
        width: 280,
        margin: qrQuietZoneBoost ? 4 : 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'L',
      },
      (err) => {
        if (err) {
          console.error('QR generation failed:', err);
        }
      }
    );
  }, [activePacket, role, qrQuietZoneBoost]);

  // Render simulated opposite device QR inside camera alignment reticle when camera is off or in loopback
  useEffect(() => {
    const canvas = peerQrCanvasRef.current;
    if (!canvas || !peerSimPacket) return;
    const serialized = serializePacket(peerSimPacket);
    QRCode.toCanvas(
      canvas,
      serialized,
      {
        width: 148,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'L',
      },
      () => {}
    );
  }, [peerSimPacket]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setScanFps(0);
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Camera API unavailable in this browser context. Optical Loopback Sensor remains active.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
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
      const message =
        err instanceof Error ? err.message : 'Permission denied or no front camera found';
      setCameraError(
        `Selfie camera unavailable (${message}). Use Optical Loopback or grant camera permission.`
      );
      setCameraActive(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // High-FPS QR scanning loop over fixed 360x360 center-cropped <canvas> with BarcodeDetector + jsQR fallback
  useEffect(() => {
    if (!cameraActive) return;

    let scansInWindow = 0;
    let windowStart = performance.now();
    let frameCounter = 0;
    let isDecoding = false;

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

    const SCAN_SIZE = 360;
    const canvas = hiddenScanCanvasRef.current;
    if (canvas && (canvas.width !== SCAN_SIZE || canvas.height !== SCAN_SIZE)) {
      canvas.width = SCAN_SIZE;
      canvas.height = SCAN_SIZE;
    }
    const ctx = canvas?.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    });

    const timer = window.setInterval(async () => {
      if (isDecoding) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      isDecoding = true;
      frameCounter++;
      scansInWindow++;
      const now = performance.now();
      if (now - windowStart >= 1000) {
        setScanFps(Math.round((scansInWindow * 1000) / (now - windowStart)));
        scansInWindow = 0;
        windowStart = now;
      }

      try {
        // 1. Try Native BarcodeDetector directly on <video> first if supported
        if (nativeDetector) {
          try {
            const results = await nativeDetector.detect(video);
            if (results && results.length > 0 && results[0].rawValue) {
              setLastDetectedBox(true);
              onQrScannedRef.current(results[0].rawValue);
              return;
            }
          } catch {
            // Fallback to jsQR
          }
        }

        // 2. Fast 360x360 center-cropped jsQR
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
            setLastDetectedBox(true);
            onQrScannedRef.current(code.data);
          } else {
            setLastDetectedBox(false);
          }
        }
      } finally {
        isDecoding = false;
      }
    }, Math.max(20, Math.min(scanIntervalMs, 40)));

    return () => window.clearInterval(timer);
  }, [cameraActive, scanIntervalMs]);

  const frameBorderTone =
    ledState === 'ACK_PULSE'
      ? 'border-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.25)]'
      : ledState === 'RESEND_WARN'
      ? 'border-rose-500 shadow-[0_0_24px_rgba(244,63,94,0.25)]'
      : ledState === 'COMPLETE'
      ? 'border-cyan-500 shadow-[0_0_28px_rgba(6,182,212,0.28)]'
      : 'border-slate-300';

  return (
    <div className="m3-surface-card overflow-hidden flex flex-col divide-y divide-[var(--m3-outline-variant)]">
      {/* Viewport Mode & Optical Hardware Mirror Toolbar */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cameraActive ? stopCamera : startCamera}
            className={`min-h-[34px] px-3.5 py-1 text-xs font-semibold rounded-full flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              cameraActive ? 'm3-btn-tonal' : 'm3-btn-filled'
            }`}
          >
            {cameraActive ? (
              <>
                <CameraOff className="w-3.5 h-3.5 shrink-0" />
                <span>Stop Camera</span>
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span>Selfie Camera</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleFlipQr}
            aria-pressed={flipQr}
            className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-full flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border ${
              flipQr
                ? 'm3-btn-tonal border-transparent'
                : 'border-[var(--m3-outline-variant)] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Flip QR</span>
          </button>

          <button
            type="button"
            onClick={onToggleMirrorCamera}
            aria-pressed={mirrorCamera}
            className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-full flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border ${
              mirrorCamera
                ? 'm3-btn-tonal border-transparent'
                : 'border-[var(--m3-outline-variant)] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5 shrink-0" />
            <span>Mirror Camera</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPipMode((m) => (m === 'SPLIT' ? 'PIP' : 'SPLIT'))}
          className="min-h-[34px] px-3 py-1 text-xs font-medium rounded-full border border-[var(--m3-outline-variant)] text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {pipMode === 'SPLIT' ? (
            <>
              <Minimize2 className="w-3.5 h-3.5 shrink-0" />
              <span>PiP Mode</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5 shrink-0" />
              <span>Split Mode</span>
            </>
          )}
        </button>
      </div>

      {/* Optical Alignment Container (Split-Screen or Picture-in-Picture) */}
      <div className="relative p-4 flex flex-col gap-3 bg-[var(--m3-surface-container-low)]/40">
        {/* UPPER / DOMINANT HALF: High-Contrast Local QR Emitter (Always Pure White Pad for Optical Camera Scan) */}
        <div
          style={{ borderRadius: 'var(--m3-radius-lg)' }}
          className={`relative bg-white text-slate-950 p-4 sm:p-5 flex flex-col items-center justify-center border-2 transition-all ${frameBorderTone}`}
        >
          <div className="w-full flex items-center justify-between gap-2 text-[11px] sm:text-xs font-mono text-slate-600 mb-2.5">
            <span className="truncate">
              EMITTER · {role} ·{' '}
              {activePacket ? `[${activePacket.type}]` : 'STANDBY'}
            </span>
            <span className="whitespace-nowrap shrink-0">
              {qrByteLength > 0 ? `${qrByteLength} B` : '0 B'} ·{' '}
              {flipQr ? 'FLIPPED' : 'NORMAL'}
            </span>
          </div>

          <div
            className={`${
              qrQuietZoneBoost ? 'p-4 sm:p-5' : 'p-2 sm:p-3'
            } bg-white rounded-xl transition-transform duration-150 ${
              flipQr ? '-scale-x-100' : ''
            }`}
          >
            <canvas
              ref={qrCanvasRef}
              data-testid="optical-qr-canvas"
              aria-label="Dynamic Optical ARQ QR Code Emitter"
              className="w-[240px] h-[240px] sm:w-[276px] sm:h-[276px] block"
            />
          </div>

          <div className="w-full flex items-center justify-between gap-2 text-[11px] sm:text-xs font-mono text-slate-600 mt-2.5 pt-2 border-t border-slate-200">
            <span className="truncate">
              {activePacket?.type === 'DATA'
                ? `CHUNK #${activePacket.i + 1}/${activePacket.total} · CRC ${activePacket.crc}`
                : activePacket?.type === 'INIT'
                ? `FILE: ${activePacket.name} (${activePacket.total} CHUNKS)`
                : activePacket?.type === 'ACK'
                ? `ACK #${activePacket.ack} · STATUS: ${activePacket.status}`
                : activePacket?.type === 'FIN'
                ? 'FIN · TRANSFER COMPLETE'
                : 'READY FOR OPTICAL LINK'}
            </span>
            <span className="font-semibold text-slate-900 whitespace-nowrap shrink-0">
              {ledState === 'ACK_PULSE'
                ? '▲ ACK LOCKED'
                : ledState === 'RESEND_WARN'
                ? '✖ CRC RESEND'
                : ledState === 'COMPLETE'
                ? '✔ VERIFIED'
                : '● EMITTING'}
            </span>
          </div>
        </div>

        {/* LOWER / CORNER PREVIEW: Live Selfie Camera Feed with Target Alignment Reticle */}
        <div
          style={{ borderRadius: 'var(--m3-radius-lg)' }}
          className={
            pipMode === 'PIP'
              ? 'sm:absolute sm:bottom-4 sm:right-4 sm:w-64 sm:h-64 w-full h-64 bg-[#050811] border-2 border-cyan-500/60 overflow-hidden shadow-2xl z-20 flex flex-col'
              : 'w-full h-64 bg-[#050811] border border-slate-800 overflow-hidden relative flex flex-col'
          }
        >
          {/* Camera Header Bar (Non-overlapping top strip) */}
          <div className="shrink-0 flex items-center justify-between px-3 py-2 text-[11px] font-mono text-slate-300 bg-slate-950/90 border-b border-slate-800/80">
            <span className="truncate">
              SENSOR · {cameraActive ? 'LIVE SELFIE (720P)' : 'OPTICAL ALIGNMENT RETICLE'}
            </span>
            <span className="whitespace-nowrap shrink-0 ml-2 text-cyan-300">
              {cameraActive
                ? `${scanFps} FPS · ${scanIntervalMs}ms`
                : peerSimPacket
                ? `PEER [${peerSimPacket.type}]`
                : 'ALIGN TARGET'}
            </span>
          </div>

          {/* Live Video Element & Centered Reticle Stage */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden p-3">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-cover ${
                cameraActive ? 'block' : 'hidden'
              } ${mirrorCamera ? '-scale-x-100' : ''}`}
            />

            {/* Fallback / Optical Peer Loopback Preview when physical camera is off */}
            {!cameraActive && (
              <div className="flex flex-col items-center justify-center text-center px-4 z-10">
                {peerSimPacket ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="p-1.5 bg-white rounded-lg shadow-md">
                      <canvas
                        ref={peerQrCanvasRef}
                        className="w-[104px] h-[104px] block"
                      />
                    </div>
                    <span className="text-[10px] font-mono text-cyan-300 mt-0.5">
                      Peer QR Locked ({peerSimPacket.type})
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 max-w-[240px]">
                    <RefreshCw className="w-4 h-4 text-cyan-400/80 mb-0.5" />
                    <p className="text-xs font-medium text-slate-200">
                      Face-to-Face Alignment Reticle
                    </p>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Center opposite phone’s QR code inside this target box.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Target Alignment Reticle Box */}
            <div
              className={`pointer-events-none absolute w-40 h-40 rounded-xl border-2 border-dashed transition-colors ${
                lastDetectedBox || peerSimPacket
                  ? 'border-emerald-400 bg-emerald-500/5'
                  : 'border-cyan-400/75 bg-cyan-500/5'
              }`}
            >
              <div className="w-full h-0.5 bg-cyan-400/60 animate-scanline" />
              <div className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-300" />
              <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-300" />
              <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-300" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-300" />
            </div>
          </div>

          {/* Camera Error / Diagnostics Strip */}
          {cameraError && (
            <div
              role="status"
              className="shrink-0 bg-amber-950/90 border-t border-amber-500/40 px-3 py-1.5 text-[11px] font-mono text-amber-200"
            >
              {cameraError}
            </div>
          )}
        </div>
      </div>

      {/* Hidden Canvas for Offscreen QR Decoding */}
      <canvas ref={hiddenScanCanvasRef} className="hidden" />
    </div>
  );
};
