import React, { useState } from 'react';
import { FlowerCanvas, FlowerPaletteId, BackgroundThemeId } from '../../components/garden/FlowerCanvas';
import {
  Flower,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Sparkles,
  Info,
  ThermometerSnowflake,
  ShieldCheck,
} from 'lucide-react';

interface InteractiveGardenPageProps {
  navigate: (path: string) => void;
}

export const InteractiveGardenPage: React.FC<InteractiveGardenPageProps> = ({ navigate }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePalette, setActivePalette] = useState<FlowerPaletteId>('original');
  const [activeBg, setActiveBg] = useState<BackgroundThemeId>('midnight');
  const [showInfoModal, setShowInfoModal] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="p-1.5 rounded-lg border border-[#FDC3D1] bg-white hover:bg-[#FFF7F9] text-[#C72C5E] cursor-pointer shadow-xs"
            title="Return to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[#2E1826] flex items-center gap-2">
                <Flower className="h-5 w-5 text-[#FF5C89]" />
                Interactive Floral Bloom Canvas
              </h1>
              <span className="text-[10px] font-bold text-[#C72C5E] bg-[#FFF7F9] border border-[#FDC3D1] px-2 py-0.5 rounded-full uppercase tracking-wider">
                Procedural WebGL
              </span>
            </div>
            <p className="text-xs text-[#826674]">
              Simulating fresh flower growth with custom procedural shaders and cumulative feedback render targets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInfoModal(true)}
            className="px-3 py-1.5 bg-white border border-[#FDC3D1] hover:bg-[#FFF7F9] text-[#C72C5E] text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Info className="h-4 w-4" />
            Shader Details
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="px-3 py-1.5 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-xl shadow-xs transition-all active:scale-98 flex items-center gap-1.5 cursor-pointer"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-4 w-4" />
                Exit Fullscreen
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4" />
                Fullscreen Garden
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Interactive Garden Container */}
      <div className="bg-white rounded-2xl border border-[#FDC3D1] shadow-sm overflow-hidden p-1 sm:p-2">
        <div className="rounded-xl overflow-hidden border border-[#FDC3D1]/60 h-[560px] sm:h-[620px] relative">
          <FlowerCanvas
            fullscreen={isFullscreen}
            initialPalette={activePalette}
            initialBackground={activeBg}
            showControls={true}
          />
        </div>
      </div>

      {/* Narrative & Botanical Science Notes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-white rounded-xl border border-[#FDC3D1] p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-[#C72C5E] font-bold">
            <Sparkles className="h-4 w-4" />
            <span>Retaining Original Colors</span>
          </div>
          <p className="text-[#826674] leading-relaxed">
            The shader retains 100% of the mathematical color formulas from your CodePen: simplex noise stem dynamics, golden core highlights, and procedural petals with radial growth.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#FDC3D1] p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-[#C72C5E] font-bold">
            <ThermometerSnowflake className="h-4 w-4" />
            <span>Florify Botanical Palette</span>
          </div>
          <p className="text-[#826674] leading-relaxed">
            Switch anytime to the <strong>Florify Rose</strong> palette to mirror the fresh cut roses and peonies monitored by our ESP32 shuttle sensors.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#FDC3D1] p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-[#C72C5E] font-bold">
            <ShieldCheck className="h-4 w-4" />
            <span>Ping-Pong Accumulation</span>
          </div>
          <p className="text-[#826674] leading-relaxed">
            Dual WebGL render targets retain previously bloomed flowers frame-by-frame, letting you craft an entire lush meadow with repeated clicks or taps.
          </p>
        </div>
      </div>

      {/* Information Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-[#FDC3D1] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#FDC3D1]">
              <div className="flex items-center gap-2">
                <Flower className="h-5 w-5 text-[#FF5C89]" />
                <h3 className="text-base font-bold text-[#2E1826]">
                  Procedural Shader Anatomy
                </h3>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-[#826674] hover:text-[#C72C5E] text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#826674] leading-relaxed">
              <p>
                <strong>Simplex Noise Stems:</strong> Each stem is dynamically perturbed using 2D simplex noise (`snoise`) modulated by `u_stop_randomizer` so no two stems curve identically.
              </p>
              <p>
                <strong>Radial Petal Growth:</strong> Petal profiles use trigonometric sectoral shapes `pow(abs(sin(a * _pet_n)), 0.4)` scaled by smoothstep time functions.
              </p>
              <p>
                <strong>Color Retain Guarantee:</strong>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><strong>Original:</strong> `vec3(.6 + .5*r1, .1, .9 - .5*r1)` (Vivid violet & magenta)</li>
                  <li><strong>Florify:</strong> `#FF5C89` (Blossom Pink) and `#C72C5E` (Deep Rose)</li>
                  <li><strong>Meadow:</strong> Amber gold and sunflower yellow</li>
                </ul>
              </p>
              <p>
                <strong>Clean Screen:</strong> Flushes the active WebGL texture via `u_clean` uniform in a single frame without memory leaks.
              </p>
            </div>

            <div className="pt-3 border-t border-[#FDC3D1] flex justify-end">
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 bg-[#FF5C89] text-white text-xs font-semibold rounded-lg hover:bg-[#C72C5E]"
              >
                Return to Canvas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
