import React from 'react';
import { motion } from 'motion/react';
import { Cpu, FileArchive, Layers, Lock, QrCode, Radio, ScanLine, ShieldCheck } from 'lucide-react';

const MARQUEE_SPECS = [
  { icon: ScanLine, label: '60Hz Hardware BarcodeDetector', accent: 'text-cyan-400' },
  { icon: FileArchive, label: 'Pako Gzip Level 9 Deflate', accent: 'text-indigo-400' },
  { icon: Cpu, label: '360×360 Center ROI Crop', accent: 'text-violet-400' },
  { icon: Radio, label: 'Stop-and-Wait Optical ARQ', accent: 'text-amber-400' },
  { icon: ShieldCheck, label: 'CRC32 Frame Integrity Guard', accent: 'text-emerald-400' },
  { icon: Lock, label: '100% Offline Single-File HTML', accent: 'text-cyan-300' },
  { icon: Layers, label: 'O(1) Set Chunk Deduplication', accent: 'text-indigo-300' },
  { icon: QrCode, label: 'ECC-L High-Contrast Modules', accent: 'text-violet-300' },
];

export const OpticalMarquee: React.FC = () => {
  return (
    <section
      aria-label="Optical Transfer Capabilities"
      className="relative py-4 border-y border-[var(--m3-outline-variant)] bg-[color-mix(in_srgb,var(--m3-surface-container-low)_65%,transparent)] backdrop-blur-md overflow-hidden"
    >
      <div className="max-w-[1440px] mx-auto marquee-fade-mask overflow-hidden">
        <motion.div
          className="flex items-center gap-8 w-max will-change-transform"
          animate={{ x: ['0%', '-50%'] }}
          transition={{
            duration: 28,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {[...MARQUEE_SPECS, ...MARQUEE_SPECS].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={`${item.label}-${idx}`}
                className="flex items-center gap-2.5 text-xs font-mono m3-text-muted whitespace-nowrap shrink-0 select-none"
              >
                <Icon className={`w-3.5 h-3.5 ${item.accent}`} />
                <span className="text-[var(--m3-on-surface)] font-medium">
                  {item.label}
                </span>
                <span aria-hidden="true" className="ml-5 text-white/15">
                  /
                </span>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};
