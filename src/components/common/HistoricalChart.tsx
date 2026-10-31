import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { DeviceReading, DeviceConfig } from '../../types';

interface HistoricalChartProps {
  readings: DeviceReading[];
  config?: DeviceConfig;
}

export const HistoricalChart: React.FC<HistoricalChartProps> = ({ readings, config }) => {
  const [metric, setMetric] = useState<'both' | 'temp' | 'hum'>('both');
  const [timeRangeHours, setTimeRangeHours] = useState<number>(12);

  // Format data for chart
  const formattedData = readings.map((r) => {
    const d = new Date(r.receivedAt);
    const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    return {
      time: timeStr,
      fullTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temperature: r.temperatureC,
      humidity: r.humidityRH,
      fanState: r.fanState,
    };
  });

  return (
    <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <h4 className="text-sm font-bold text-[#2E1826]">Telemetry History & Fan Corroboration</h4>
        </div>

        {formattedData.length > 0 && (
          <div className="flex items-center gap-2">
            {/* Metric Selector */}
            <div className="flex items-center gap-1 bg-[#FFF7F9] p-1 rounded-lg border border-[#FDC3D1] text-xs">
              <button
                onClick={() => setMetric('both')}
                className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                  metric === 'both' ? 'bg-[#FF5C89] text-white shadow-xs' : 'text-[#826674] hover:text-[#C72C5E]'
                }`}
              >
                Both
              </button>
              <button
                onClick={() => setMetric('temp')}
                className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                  metric === 'temp' ? 'bg-[#FF5C89] text-white shadow-xs' : 'text-[#826674] hover:text-[#C72C5E]'
                }`}
              >
                Temp (°C)
              </button>
              <button
                onClick={() => setMetric('hum')}
                className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                  metric === 'hum' ? 'bg-[#FF5C89] text-white shadow-xs' : 'text-[#826674] hover:text-[#C72C5E]'
                }`}
              >
                Humidity (%)
              </button>
            </div>
          </div>
        )}
      </div>

      {formattedData.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-center p-6 bg-[#FFF7F9]/30 rounded-lg border border-dashed border-[#FDC3D1] space-y-1.5">
          <p className="text-xs font-semibold text-[#2E1826]">No Historical Telemetry Recorded</p>
          <p className="text-[11px] text-[#826674] max-w-sm">
            Once this ESP32 connects to Wi-Fi and begins sampling the onboard DHT11 sensor, time-series temperature and humidity curves will populate here automatically.
          </p>
        </div>
      ) : (
        <>
          <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#FDC3D1" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#826674"
              fontSize={11}
              tickLine={false}
              tickMargin={8}
              fontFamily="var(--font-mono)"
            />
            <YAxis
              yAxisId="left"
              stroke="#826674"
              fontSize={11}
              domain={[15, 55]}
              tickLine={false}
              fontFamily="var(--font-mono)"
            />
            {metric === 'both' && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#826674"
                fontSize={11}
                domain={[20, 100]}
                tickLine={false}
                fontFamily="var(--font-mono)"
              />
            )}
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white border border-[#FDC3D1] rounded-lg shadow-md p-3 text-xs">
                      <p className="font-mono text-[#826674] mb-1.5">{data.fullTime}</p>
                      <div className="space-y-1 font-mono tabular-nums">
                        <div className="flex items-center justify-between gap-4 text-[#C72C5E]">
                          <span>Temperature:</span>
                          <span className="font-bold">{data.temperature}°C</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-[#FB8CAC]">
                          <span>Humidity:</span>
                          <span className="font-bold">{data.humidity}% RH</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-[#2E1826] pt-1 border-t border-[#FDC3D1]">
                          <span>Fan Relay:</span>
                          <span
                            className={`font-bold ${
                              data.fanState === 'ON' ? 'text-emerald-600' : 'text-slate-500'
                            }`}
                          >
                            {data.fanState}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Threshold reference lines if config available */}
            {config?.temperatureEnabled && (metric === 'both' || metric === 'temp') && (
              <ReferenceLine
                yAxisId="left"
                y={config.temperatureOnC}
                stroke="#EF4444"
                strokeDasharray="4 4"
                label={{
                  value: `Fan ON (${config.temperatureOnC}°C)`,
                  fill: '#EF4444',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
            )}

            {(metric === 'both' || metric === 'temp') && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="temperature"
                name="Temperature"
                stroke="#C72C5E"
                strokeWidth={2.5}
                dot={{ r: 2, fill: '#C72C5E' }}
                activeDot={{ r: 5, fill: '#FF5C89' }}
              />
            )}

            {(metric === 'both' || metric === 'hum') && (
              <Line
                yAxisId={metric === 'both' ? 'right' : 'left'}
                type="monotone"
                dataKey="humidity"
                name="Humidity"
                stroke="#FB8CAC"
                strokeWidth={2}
                dot={{ r: 2, fill: '#FB8CAC' }}
                activeDot={{ r: 5, fill: '#FF5C89' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-[#826674]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#C72C5E]" />
          Temperature (°C)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FB8CAC]" />
          Relative Humidity (% RH)
        </span>
        {config?.temperatureEnabled && (
          <span className="flex items-center gap-1.5 text-rose-600">
            <span className="h-0.5 w-3 bg-rose-500 inline-block" />
            Configured ON Threshold
          </span>
        )}
      </div>
      </>
      )}
    </div>
  );
};
