import React from 'react';
import { ArrowDownRight, Box, Cpu, Sparkles } from 'lucide-react';
import { SpatialChamberFocus } from './three/CameraSplineRig';
import { CustomShaderMode } from './three/CustomShaderCards';

interface SpatialCorridorSectionProps {
  chamberFocus: SpatialChamberFocus;
  onSelectChamberFocus: (focus: SpatialChamberFocus) => void;
  shaderMode: CustomShaderMode;
  onSelectShaderMode: (mode: CustomShaderMode) => void;
  customGlbName: string | null;
}

const CHAMBERS: Array<{
  id: Exclude<SpatialChamberFocus, 'AUTO'>;
  code: string;
  title: string;
  tech: string;
  description: string;
  accentClass: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'BRUTALIST',
    code: 'CHAMBER 01 // 0.00–0.35 SPLINE',
    title: 'Brutalist Exhibition Hall',
    tech: 'CustomShaderMaterial · Curved Planes · Glowing ASCII Edges',
    description:
      'Cast-concrete architectural columns with baked tie-rod AO framing four curved PBR exhibition monoliths illuminated by an ASCII edge-bloom shader.',
    accentClass: 'text-indigo-300 border-indigo-400/35 bg-indigo-500/10',
    icon: <Box className="w-4 h-4 text-indigo-300" />,
  },
  {
    id: 'ROBOTIC',
    code: 'CHAMBER 02 // 0.35–0.70 SPLINE',
    title: 'Robotic Calibration Assembly',
    tech: '5-Axis Kinematic Arm · Instanced Rollers · Laser Emitter',
    description:
      'An articulated industrial calibration arm sweeps an optical laser reticle across moving conveyor wafers while the camera glides beneath overhead steel gantries.',
    accentClass: 'text-cyan-300 border-cyan-400/35 bg-cyan-500/10',
    icon: <Cpu className="w-4 h-4 text-cyan-300" />,
  },
  {
    id: 'CYBERPUNK',
    code: 'CHAMBER 03 // 0.70–1.00 SPLINE',
    title: 'Cyberpunk Wet-Asphalt Alley',
    tech: 'Procedural Puddle Roughness · Crimson Bloom · Iris Portal',
    description:
      'Modular conduit walls and high-gloss tarmac puddles reflect crimson alley light tubes and holographic optical relay blades before locking onto the terminal iris.',
    accentClass: 'text-rose-300 border-rose-400/35 bg-rose-500/10',
    icon: <Sparkles className="w-4 h-4 text-rose-300" />,
  },
];

export const SpatialCorridorSection: React.FC<SpatialCorridorSectionProps> = ({
  chamberFocus,
  onSelectChamberFocus,
  shaderMode,
  onSelectShaderMode,
  customGlbName,
}) => {
  return (
    <section
      id="spatial-exhibition"
      aria-label="3D Architectural Fly-Through Chambers"
      className="relative max-w-[1340px] w-full mx-auto px-4 sm:px-6 pt-4 pb-24 sm:pb-28"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-cyan-400">
            WebGL Navier-Stokes Fluid · Three.js Spatial Stage
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] mt-1">
            Scroll-Scrubbed 3D Optical Corridor
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {customGlbName && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-300">
              Custom GLB: {customGlbName}
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full bg-[#090b12]/90 border border-white/10 text-zinc-300">
            Shader: {shaderMode.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Open-viewport vertical corridor so the fixed 3D WebGL stage shines through */}
      <div className="flex flex-col gap-32 sm:gap-44 py-4 pb-8">
        {CHAMBERS.map((chamber, index) => {
          const isFocused = chamberFocus === chamber.id;
          const alignRight = index === 1;
          return (
            <div
              key={chamber.id}
              className={`min-h-[38vh] flex items-center ${
                alignRight ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-md w-full rounded-[22px] p-5 border transition-colors duration-200 bg-[#07090f]/86 ${
                  isFocused
                    ? 'border-indigo-400/60 shadow-[0_20px_50px_-15px_rgba(99,102,241,0.35)]'
                    : 'border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-400 tabular-nums">
                    {chamber.code}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border ${chamber.accentClass}`}
                  >
                    {chamber.icon}
                    {chamber.id}
                  </span>
                </div>

                <h3 className="text-lg font-bold tracking-[-0.02em] text-zinc-50">
                  {chamber.title}
                </h3>

                <div className="text-[11px] font-mono text-indigo-300/90 mt-1">
                  {chamber.tech}
                </div>

                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mt-2.5">
                  {chamber.description}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-magnetic
                    data-cursor-label="Inspect 3D"
                    onClick={() =>
                      onSelectChamberFocus(isFocused ? 'AUTO' : chamber.id)
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-transform active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 border ${
                      isFocused
                        ? 'bg-indigo-500 text-white border-indigo-400'
                        : 'bg-white/[0.06] text-zinc-100 border-white/15 hover:bg-white/[0.12]'
                    }`}
                  >
                    {isFocused ? 'Release Camera to Scroll' : 'Lock Chamber View'}
                  </button>

                  {chamber.id === 'BRUTALIST' && (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectShaderMode(
                          shaderMode === 'ascii'
                            ? 'hologram'
                            : shaderMode === 'hologram'
                            ? 'wire'
                            : 'ascii'
                        )
                      }
                      className="px-3 py-1.5 rounded-full text-xs font-mono bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-zinc-300 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Cycle Shader ({shaderMode})
                    </button>
                  )}

                  <a
                    href="#transceiver-workspace"
                    className="ml-auto inline-flex items-center gap-1 text-xs font-mono text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
                  >
                    Transceiver
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
