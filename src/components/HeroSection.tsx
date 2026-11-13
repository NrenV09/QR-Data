import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { ArrowDownRight, QrCode, ScanLine, ShieldCheck, Zap } from 'lucide-react';
import { PreparedAirgapTransfer } from '../utils/airgapStreamProtocol';
import { HeaderWorkspaceMode } from './FloatingNavbar';

interface HeroSectionProps {
  preparedTransfer: PreparedAirgapTransfer;
  workspaceMode: HeaderWorkspaceMode;
  onSelectWorkspaceMode: (mode: HeaderWorkspaceMode) => void;
  isLightMode?: boolean;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const QR_PREVIEW_GRID = [
  1, 1, 1, 0, 1, 1, 1,
  1, 0, 1, 1, 1, 0, 1,
  1, 1, 1, 0, 1, 1, 1,
  0, 1, 0, 1, 0, 1, 0,
  1, 1, 1, 1, 0, 1, 1,
  1, 0, 1, 0, 1, 0, 0,
  1, 1, 1, 0, 1, 1, 1,
];

export const HeroSection: React.FC<HeroSectionProps> = ({
  preparedTransfer,
  workspaceMode,
  onSelectWorkspaceMode,
  isLightMode = false,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const rotateX = useSpring(useTransform(rawY, [-0.5, 0.5], [11, -11]), {
    stiffness: 220,
    damping: 26,
  });
  const rotateY = useSpring(useTransform(rawX, [-0.5, 0.5], [-12, 12]), {
    stiffness: 220,
    damping: 26,
  });

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    rawX.set((e.clientX - rect.left) / rect.width - 0.5);
    rawY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleCardPointerLeave = () => {
    rawX.set(0);
    rawY.set(0);
    setHoveredCell(null);
  };

  const scrollToWorkspace = (targetMode?: HeaderWorkspaceMode) => {
    if (targetMode) {
      onSelectWorkspaceMode(targetMode);
    }
    const el = document.getElementById('transceiver-workspace');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section
      aria-label="OptiLink Optical Air-Gap Overview"
      className="relative pt-8 pb-8 sm:pt-12 sm:pb-12"
    >
      <div className="max-w-[1340px] mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
        <div className="lg:col-span-7 flex flex-col items-start">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
            className="inline-flex items-center gap-2.5 text-xs font-mono m3-text-muted mb-4"
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.85)]" />
            <span className="tracking-wide uppercase text-[11px]">
              Optical Air-Gap Protocol · Offline Browser Runtime
            </span>
          </motion.div>

          <h1 className="text-[clamp(2.35rem,4.5vw,4.15rem)] font-extrabold tracking-[-0.03em] leading-[1.03] text-balance">
            <span className="block overflow-hidden">
              <motion.span
                initial={{ y: '105%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{ duration: 0.72, delay: 0.06, ease: EASE_OUT_EXPO }}
                className="block"
              >
                Air-Gapped File Transfer.
              </motion.span>
            </span>
            <span className="block overflow-hidden mt-1">
              <motion.span
                initial={{ y: '105%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{ duration: 0.78, delay: 0.16, ease: EASE_OUT_EXPO }}
                className={`block ${
                  isLightMode
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 bg-clip-text text-transparent'
                    : 'text-shimmer'
                }`}
              >
                Transmitted in Pure Light.
              </motion.span>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.28, ease: EASE_OUT_EXPO }}
            className="mt-5 text-sm sm:text-base m3-text-muted max-w-[56ch] leading-relaxed"
          >
            Move files between isolated devices using high-density Gzip QR streams, a 60Hz hardware{' '}
            <code className="text-[var(--m3-on-surface)] font-medium">BarcodeDetector</code> ROI scanner,
            and Stop-and-Wait ARQ verification—zero Wi-Fi, zero Bluetooth, zero external servers.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.36, ease: EASE_OUT_EXPO }}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              onClick={() => scrollToWorkspace()}
              data-magnetic
              data-cursor-label="Launch"
              className="min-h-[44px] px-6 py-2.5 text-sm font-semibold m3-btn-filled rounded-full flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Launch Transceiver</span>
              <ArrowDownRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() =>
                scrollToWorkspace(
                  workspaceMode === 'SCANNER' ? 'GENERATOR' : 'SCANNER'
                )
              }
              data-magnetic
              data-cursor-label={workspaceMode === 'SCANNER' ? 'Emit' : 'Scan'}
              className="min-h-[44px] px-5 py-2.5 text-sm font-medium m3-btn-outlined rounded-full flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              {workspaceMode === 'SCANNER' ? (
                <>
                  <QrCode className="w-4 h-4 text-[var(--m3-primary)]" />
                  <span>Open QR Generator</span>
                </>
              ) : (
                <>
                  <ScanLine className="w-4 h-4 text-cyan-400" />
                  <span>Open 60Hz Scanner</span>
                </>
              )}
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.44, ease: EASE_OUT_EXPO }}
            className="mt-7 pt-5 border-t border-[var(--m3-outline-variant)] w-full max-w-[540px] grid grid-cols-3 gap-4 text-xs font-mono tabular-nums"
          >
            <div>
              <div className="text-[11px] font-sans m3-text-muted">Capture Loop</div>
              <div className="text-sm font-semibold mt-0.5 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>60 Hz ROI</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-sans m3-text-muted">Compression</div>
              <div className="text-sm font-semibold mt-0.5 text-indigo-300">
                Gzip Level 9
              </div>
            </div>
            <div>
              <div className="text-[11px] font-sans m3-text-muted">Air-Gap State</div>
              <div className="text-sm font-semibold mt-0.5 flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Offline Ready</span>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.2, ease: EASE_OUT_EXPO }}
          className="lg:col-span-5 flex justify-center lg:justify-end"
          style={{ perspective: 1100 }}
        >
          <motion.div
            ref={cardRef}
            onPointerMove={handleCardPointerMove}
            onPointerLeave={handleCardPointerLeave}
            style={{
              rotateX,
              rotateY,
              transformStyle: 'preserve-3d',
              borderRadius: 'var(--m3-radius-lg)',
            }}
            data-cursor-label="Tilt 3D"
            className="relative w-full max-w-[440px] p-6 border border-white/[0.1] bg-[linear-gradient(155deg,rgba(22,24,36,0.88)_0%,rgba(9,10,15,0.92)_100%)] backdrop-blur-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_36px_80px_-20px_rgba(0,0,0,0.85),0_0_60px_-24px_rgba(99,102,241,0.45)]"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-8 -top-10 h-28 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.32),rgba(56,189,248,0.12)_50%,transparent_75%)] blur-2xl"
            />

            <div className="relative flex items-center justify-between text-[11px] font-mono text-zinc-400 pb-4 border-b border-white/[0.08] tabular-nums">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span className="text-zinc-200 font-semibold">OPTICAL PRISM CORE</span>
              </div>
              <span className="text-indigo-300">ECC-L · 360px ROI</span>
            </div>

            <div
              style={{ transform: 'translateZ(24px)' }}
              className="relative my-5 p-5 rounded-2xl bg-[#050507]/90 border border-white/[0.08] flex items-center justify-center overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
            >
              <span className="absolute top-3 left-3 w-3.5 h-3.5 border-t-2 border-l-2 border-indigo-400/80 rounded-tl" />
              <span className="absolute top-3 right-3 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400/80 rounded-tr" />
              <span className="absolute bottom-3 left-3 w-3.5 h-3.5 border-b-2 border-l-2 border-violet-400/80 rounded-bl" />
              <span className="absolute bottom-3 right-3 w-3.5 h-3.5 border-b-2 border-r-2 border-indigo-400/80 rounded-br" />

              <div className="grid grid-cols-7 gap-2 relative z-10">
                {QR_PREVIEW_GRID.map((active, idx) => {
                  const isNearHover =
                    hoveredCell !== null && Math.abs(hoveredCell - idx) <= 1;
                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-label={`Optical cell ${idx}`}
                      onMouseEnter={() => setHoveredCell(idx)}
                      onClick={() => scrollToWorkspace('GENERATOR')}
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-[5px] transition-all duration-150 cursor-pointer ${
                        active
                          ? isNearHover
                            ? 'bg-cyan-300 scale-110 shadow-[0_0_14px_rgba(56,189,248,0.85)]'
                            : 'bg-gradient-to-br from-white via-indigo-100 to-indigo-200 shadow-[0_0_8px_rgba(129,140,248,0.3)]'
                          : isNearHover
                          ? 'bg-indigo-500/35 border border-indigo-400/50'
                          : 'bg-white/[0.04] border border-white/[0.04]'
                      }`}
                    />
                  );
                })}
              </div>

              <motion.div
                aria-hidden="true"
                animate={{ y: [-72, 72, -72] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                className="pointer-events-none absolute inset-x-6 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent shadow-[0_0_12px_rgba(34,211,238,0.7)]"
              />
            </div>

            <div className="relative grid grid-cols-2 gap-3 text-xs font-mono tabular-nums pt-1">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07]">
                <div className="text-[10px] font-sans text-zinc-400">Staged Payload</div>
                <div className="text-xs font-semibold text-zinc-100 truncate mt-0.5">
                  {preparedTransfer.name}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07]">
                <div className="text-[10px] font-sans text-zinc-400">Compressed Stream</div>
                <div className="text-xs font-semibold text-cyan-300 mt-0.5">
                  {preparedTransfer.compressedSize.toLocaleString()} B ·{' '}
                  {preparedTransfer.totalChunks} Frames
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};
