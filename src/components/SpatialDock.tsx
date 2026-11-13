import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Droplets,
  Layers,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { SpatialChamberFocus } from './three/CameraSplineRig';
import { CustomShaderMode } from './three/CustomShaderCards';

interface SpatialDockProps {
  chamberFocus: SpatialChamberFocus;
  onSelectChamberFocus: (focus: SpatialChamberFocus) => void;
  shaderMode: CustomShaderMode;
  onSelectShaderMode: (mode: CustomShaderMode) => void;
  fluidEnabled: boolean;
  onToggleFluid: () => void;
  rainbowFluid: boolean;
  onToggleRainbowFluid: () => void;
  customGlbName: string | null;
  onUploadGlbFile: (file: File) => void;
  onResetGlbFile: () => void;
}

export const SpatialDock: React.FC<SpatialDockProps> = ({
  chamberFocus,
  onSelectChamberFocus,
  shaderMode,
  onSelectShaderMode,
  fluidEnabled,
  onToggleFluid,
  rainbowFluid,
  onToggleRainbowFluid,
  customGlbName,
  onUploadGlbFile,
  onResetGlbFile,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chambers: Array<{ id: SpatialChamberFocus; label: string }> = [
    { id: 'AUTO', label: 'Spline' },
    { id: 'BRUTALIST', label: '01 Brutalist' },
    { id: 'ROBOTIC', label: '02 Robotic' },
    { id: 'CYBERPUNK', label: '03 Alley' },
  ];

  const shaders: Array<{ id: CustomShaderMode; label: string }> = [
    { id: 'ascii', label: 'ASCII' },
    { id: 'hologram', label: 'Holo' },
    { id: 'wire', label: 'Wire' },
  ];

  return (
    <aside
      aria-label="3D Stage Cinema Controls"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 max-w-[min(960px,96vw)] flex flex-col items-center pointer-events-auto"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="mb-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#090b12]/95 border border-white/15 text-[10px] font-mono text-zinc-300 hover:text-white cursor-pointer shadow-lg transition-colors"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3 h-3 text-cyan-400" />
            Show 3D Stage HUD
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
            Hide 3D Controls
          </>
        )}
      </button>

      {!collapsed && (
        <div className="w-full rounded-2xl bg-[#090b12]/92 border border-white/15 px-2.5 py-1.5 shadow-[0_18px_50px_-10px_rgba(0,0,0,0.85)] flex flex-wrap items-center justify-center gap-1.5">
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/10">
            {chambers.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChamberFocus(ch.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  chamberFocus === ch.id
                    ? 'bg-indigo-500 text-white font-semibold'
                    : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block h-5 w-px bg-white/10" />

          <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/10">
            <Layers className="w-3.5 h-3.5 text-zinc-400 ml-1.5 mr-0.5 hidden md:block" />
            {shaders.map((sh) => (
              <button
                key={sh.id}
                type="button"
                onClick={() => onSelectShaderMode(sh.id)}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  shaderMode === sh.id
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {sh.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block h-5 w-px bg-white/10" />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleFluid}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-mono border cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                fluidEnabled
                  ? 'bg-indigo-500/20 border-indigo-400/45 text-indigo-200'
                  : 'bg-white/[0.04] border-white/10 text-zinc-400'
              }`}
            >
              <Droplets className="w-3.5 h-3.5" />
              Fluid Swirl
            </button>

            <button
              type="button"
              onClick={onToggleRainbowFluid}
              title="Toggle iridescent rainbow fluid palette"
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-mono border cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                rainbowFluid
                  ? 'bg-rose-500/20 border-rose-400/45 text-rose-200'
                  : 'bg-white/[0.04] border-white/10 text-zinc-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Iridescent
            </button>
          </div>

          <div className="hidden sm:block h-5 w-px bg-white/10" />

          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb,.gltf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onUploadGlbFile(file);
                }
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-mono bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-zinc-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-300" />
              {customGlbName ? 'Swap .GLB' : 'Load .GLB'}
            </button>

            {customGlbName && (
              <button
                type="button"
                onClick={onResetGlbFile}
                title="Restore procedural Optical Prism Core"
                className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 text-zinc-300 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
