import React, { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import {
  ArrowRight,
  Cpu,
  Download,
  FileArchive,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import { SpotlightCard } from './SpotlightCard';
import { PreparedAirgapTransfer } from '../utils/airgapStreamProtocol';
import { HeaderWorkspaceMode } from './FloatingNavbar';

interface BentoFeatureGridProps {
  preparedTransfer: PreparedAirgapTransfer;
  onSelectWorkspaceMode: (mode: HeaderWorkspaceMode) => void;
  onLoadPresetFile: (presetKey: 'TELEMETRY' | 'SPEC' | 'SVG') => void;
  onOpenStandaloneModal: () => void;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const BentoFeatureGrid: React.FC<BentoFeatureGridProps> = ({
  preparedTransfer,
  onSelectWorkspaceMode,
  onLoadPresetFile,
  onOpenStandaloneModal,
}) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const parallaxOffset = useTransform(scrollYProgress, [0, 1], [18, -18]);

  const [decoderPath, setDecoderPath] = useState<'NATIVE' | 'JSQR'>('NATIVE');
  const [arqStepIndex, setArqStepIndex] = useState<number>(2);

  const arqSteps = [
    { code: 'INIT', desc: 'Metadata + Total Chunks' },
    { code: 'ACK:0', desc: 'Receiver Locked Header' },
    { code: 'DATA', desc: '60Hz Chunk Stream' },
    { code: 'CRC32', desc: 'Hardware Integrity Check' },
    { code: 'FIN', desc: 'Gzip Inflate & Verify' },
  ];

  const jumpToWorkspace = (mode: HeaderWorkspaceMode) => {
    onSelectWorkspaceMode(mode);
    const el = document.getElementById('transceiver-workspace');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const compressedWidthPct =
    preparedTransfer.originalSize > 0
      ? Math.max(
          14,
          Math.min(
            100,
            Math.round(
              (preparedTransfer.compressedSize / preparedTransfer.originalSize) *
                100
            )
          )
        )
      : 45;

  return (
    <section
      ref={sectionRef}
      aria-label="Optical Architecture Capabilities"
      className="py-10 sm:py-14"
    >
      <div className="max-w-[1340px] mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.65, ease: EASE_OUT_EXPO }}
          className="flex flex-wrap items-end justify-between gap-4 mb-6"
        >
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-indigo-400">
              Engine Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.025em] mt-1">
              Built for Zero-Signal Speed &amp; Verification
            </h2>
          </div>
          <p className="text-xs sm:text-sm m3-text-muted max-w-[44ch]">
            Every visual instrument below controls or mirrors live browser optical
            pipeline telemetry.
          </p>
        </motion.div>

        <motion.div
          style={{ y: parallaxOffset }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-4"
        >
          <SpotlightCard
            className="lg:col-span-7 p-6 flex flex-col justify-between gap-5"
            spotlightColor="rgba(56, 189, 248, 0.14)"
            borderGlowColor="rgba(56, 189, 248, 0.55)"
            cursorLabel="60Hz ROI"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>01 · Dual-Path 60Hz Decoder</span>
                </div>
                <h3 className="text-lg font-bold tracking-tight mt-1">
                  Center-Cropped ROI + O(1) Frame Deduplication
                </h3>
                <p className="text-xs m3-text-muted mt-1 max-w-[52ch]">
                  Skips redundant video timestamps and ignores already-decoded chunks
                  before touching React state or decompression buffers.
                </p>
              </div>

              <div className="inline-flex p-1 rounded-full bg-[var(--m3-surface-container-low)] border border-[var(--m3-outline-variant)] text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setDecoderPath('NATIVE')}
                  className={`px-3 py-1 rounded-full cursor-pointer transition-colors ${
                    decoderPath === 'NATIVE'
                      ? 'bg-cyan-500/20 text-cyan-200 font-semibold'
                      : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
                  }`}
                >
                  BarcodeDetector
                </button>
                <button
                  type="button"
                  onClick={() => setDecoderPath('JSQR')}
                  className={`px-3 py-1 rounded-full cursor-pointer transition-colors ${
                    decoderPath === 'JSQR'
                      ? 'bg-indigo-500/20 text-indigo-200 font-semibold'
                      : 'm3-text-muted hover:text-[var(--m3-on-surface)]'
                  }`}
                >
                  360×360 jsQR
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-[#050507]/85 border border-white/[0.07]">
              <div className="sm:col-span-5 relative h-28 rounded-xl bg-white/[0.02] border border-dashed border-cyan-400/35 flex items-center justify-center overflow-hidden">
                <span className="absolute top-2 left-2 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-400" />
                <span className="absolute top-2 right-2 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-400" />
                <span className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-400" />
                <span className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-400" />
                <motion.div
                  animate={{ y: [-38, 38, -38] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-x-3 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                />
                <div className="text-[11px] font-mono text-center">
                  <div className="text-cyan-300 font-semibold">
                    {decoderPath === 'NATIVE' ? 'GPU Native Path' : 'Canvas ROI 360px'}
                  </div>
                  <div className="text-zinc-500 text-[10px] mt-0.5">
                    {decoderPath === 'NATIVE' ? '~1.8 ms / frame' : '~3.4 ms / frame'}
                  </div>
                </div>
              </div>

              <div className="sm:col-span-7 flex flex-col gap-2 text-xs font-mono tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="m3-text-muted">Sampling Cadence</span>
                  <span className="text-emerald-400 font-semibold">60 FPS rAF Lock</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="m3-text-muted">QR Error Correction</span>
                  <span>ECC Level L (Large Modules)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="m3-text-muted">Duplicate Frame Cost</span>
                  <span className="text-cyan-300">O(1) Set.has() Skip</span>
                </div>
                <button
                  type="button"
                  onClick={() => jumpToWorkspace('SCANNER')}
                  data-magnetic
                  data-cursor-label="Scan"
                  className="mt-1 self-start text-[11px] font-sans font-semibold text-cyan-300 hover:text-cyan-200 flex items-center gap-1 cursor-pointer"
                >
                  <span>Open 60Hz Scanner Console</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </SpotlightCard>

          <SpotlightCard
            className="lg:col-span-5 p-6 flex flex-col justify-between gap-5"
            spotlightColor="rgba(129, 140, 248, 0.16)"
            borderGlowColor="rgba(129, 140, 248, 0.6)"
            cursorLabel="Gzip L9"
          >
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-indigo-300">
                <FileArchive className="w-3.5 h-3.5" />
                <span>02 · Pako Deflate Stream</span>
              </div>
              <h3 className="text-lg font-bold tracking-tight mt-1">
                Shrink Payloads Before Optical Broadcast
              </h3>
              <p className="text-xs m3-text-muted mt-1">
                Test live Gzip Level 9 byte reduction across reference payloads:
              </p>
            </div>

            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-[#050507]/85 border border-white/[0.07] font-mono tabular-nums text-xs">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="m3-text-muted">Raw Source</span>
                  <span>{preparedTransfer.originalSize.toLocaleString()} B</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full w-full bg-zinc-500/70 rounded-full" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-indigo-300">Gzip Level 9</span>
                  <span className="text-emerald-400 font-semibold">
                    {preparedTransfer.compressedSize.toLocaleString()} B (-
                    {preparedTransfer.compressionRatioPct}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${compressedWidthPct}%` }}
                    transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-cyan-400"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {(
                  [
                    ['TELEMETRY', 'JSON'],
                    ['SPEC', 'TXT Spec'],
                    ['SVG', 'Vector SVG'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onLoadPresetFile(key)}
                    className="px-2.5 py-1 rounded-full text-[11px] bg-white/[0.05] hover:bg-indigo-500/20 border border-white/[0.08] hover:border-indigo-400/40 cursor-pointer transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </SpotlightCard>

          <SpotlightCard
            className="lg:col-span-5 p-6 flex flex-col justify-between gap-5"
            spotlightColor="rgba(245, 158, 11, 0.14)"
            borderGlowColor="rgba(245, 158, 11, 0.5)"
            cursorLabel="ARQ Loop"
          >
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-amber-300">
                <Radio className="w-3.5 h-3.5" />
                <span>03 · Bidirectional Optical ARQ</span>
              </div>
              <h3 className="text-lg font-bold tracking-tight mt-1">
                Verified Frame-by-Frame Handshake
              </h3>
              <p className="text-xs m3-text-muted mt-1">
                Click any protocol stage to inspect how front-camera ACK/NACK frames
                guarantee zero dropped chunks.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#050507]/85 border border-white/[0.07] flex flex-col gap-3">
              <div className="flex items-center justify-between gap-1">
                {arqSteps.map((step, idx) => {
                  const active = arqStepIndex === idx;
                  return (
                    <button
                      key={step.code}
                      type="button"
                      onClick={() => setArqStepIndex(idx)}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-semibold cursor-pointer transition-all ${
                        active
                          ? 'bg-amber-400/20 text-amber-200 border border-amber-400/50 shadow-[0_0_16px_-4px_rgba(245,158,11,0.6)]'
                          : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:text-zinc-200'
                      }`}
                    >
                      {step.code}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.06]">
                <span className="font-mono text-zinc-300">
                  {arqSteps[arqStepIndex].desc}
                </span>
                <button
                  type="button"
                  onClick={() => jumpToWorkspace('ARQ')}
                  className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
                >
                  <span>Try ARQ Mode</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </SpotlightCard>

          <SpotlightCard
            className="lg:col-span-7 p-6 flex flex-col justify-between gap-5"
            spotlightColor="rgba(16, 185, 129, 0.14)"
            borderGlowColor="rgba(16, 185, 129, 0.55)"
            cursorLabel="Air-Gap"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>04 · Strict Sender Isolation &amp; Single-File HTML</span>
                </div>
                <h3 className="text-lg font-bold tracking-tight mt-1">
                  Zero Network Requests · Works from <code className="text-emerald-300">file://</code>
                </h3>
                <p className="text-xs m3-text-muted mt-1 max-w-[54ch]">
                  Files loaded in the Generator never leak into local Downloads or trigger
                  receiver popups on the same device. Export the entire transceiver as one
                  offline HTML bundle.
                </p>
              </div>

              <button
                type="button"
                onClick={onOpenStandaloneModal}
                data-magnetic
                data-cursor-label="Export"
                className="min-h-[36px] px-4 py-1.5 rounded-full text-xs font-semibold m3-btn-tonal flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Inspect Offline Bundle</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs tabular-nums">
              <div className="p-3.5 rounded-xl bg-[#050507]/85 border border-white/[0.07]">
                <div className="text-[10px] font-sans m3-text-muted">Generator Role</div>
                <div className="text-emerald-400 font-semibold mt-1">
                  Emit Only · Isolated
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#050507]/85 border border-white/[0.07]">
                <div className="text-[10px] font-sans m3-text-muted">Receiver Role</div>
                <div className="text-cyan-300 font-semibold mt-1">
                  Decoded + Undecoded Ledger
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#050507]/85 border border-white/[0.07]">
                <div className="text-[10px] font-sans m3-text-muted">External CDN Calls</div>
                <div className="text-indigo-300 font-semibold mt-1">
                  0 Scripts · 100% Inline
                </div>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      </div>
    </section>
  );
};
