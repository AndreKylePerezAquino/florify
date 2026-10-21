import React from 'react';

interface SensorGaugeProps {
  type: 'temperature' | 'humidity';
  value?: number;
  threshold?: number;
  unit: string;
  min?: number;
  max?: number;
  isWarning?: boolean;
}

export const SensorGauge: React.FC<SensorGaugeProps> = ({
  type,
  value,
  threshold,
  unit,
  min = type === 'temperature' ? 0 : 0,
  max = type === 'temperature' ? 50 : 100,
  isWarning = false,
}) => {
  const percentage = value !== undefined
    ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
    : 0;

  const thresholdPercent = threshold !== undefined
    ? Math.min(100, Math.max(0, ((threshold - min) / (max - min)) * 100))
    : undefined;

  return (
    <div className="w-full mt-3">
      {/* Animated Meter Track */}
      <div className="relative w-full h-2.5 bg-[#FFF0F4] rounded-full overflow-hidden border border-[#FDC3D1]/70">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isWarning
              ? 'bg-gradient-to-r from-amber-400 via-rose-500 to-rose-600 animate-pulse'
              : type === 'temperature'
              ? 'bg-gradient-to-r from-[#FDA8BF] via-[#FB8CAC] to-[#FF5C89]'
              : 'bg-gradient-to-r from-sky-400 via-teal-400 to-[#FB8CAC]'
          }`}
          style={{ width: `${percentage}%` }}
        />
        {thresholdPercent !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-1 -ml-0.5 bg-rose-600 z-10 opacity-80"
            style={{ left: `${thresholdPercent}%` }}
            title={`Threshold Trigger: ${threshold}${unit}`}
          />
        )}
      </div>

      <div className="flex justify-between items-center text-[10px] text-[#826674] mt-1 font-mono">
        <span>{min}{unit}</span>
        {threshold !== undefined && (
          <span className="text-rose-600 font-semibold">ON &ge; {threshold}{unit}</span>
        )}
        <span>{max}{unit}</span>
      </div>
    </div>
  );
};
