import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Navigation,
  MapPin,
  Clock,
  Compass,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Gauge,
  CheckCircle2
} from 'lucide-react';

interface Waypoint {
  id: string;
  name: string;
  code: string;
  x: number; // percentage in SVG coordinates (0 - 1000)
  y: number; // percentage in SVG coordinates (0 - 600)
  distanceKm: number;
  estMinutes: number;
  description: string;
  passengersWaiting: number;
}

const WAYPOINTS: Waypoint[] = [
  {
    id: 'wp-1',
    name: 'Main Fleet Depot',
    code: 'A',
    x: 120,
    y: 470,
    distanceKm: 0.0,
    estMinutes: 0,
    description: 'Dispatch staging yard & maintenance facility',
    passengersWaiting: 0,
  },
  {
    id: 'wp-2',
    name: 'Passenger Terminal A',
    code: 'B',
    x: 290,
    y: 310,
    distanceKm: 1.8,
    estMinutes: 4,
    description: 'Main express terminal - Gate 3 pickup',
    passengersWaiting: 14,
  },
  {
    id: 'wp-3',
    name: 'University Medical Hub',
    code: 'C',
    x: 480,
    y: 200,
    distanceKm: 3.5,
    estMinutes: 9,
    description: 'East wing entrance & clinic concourse',
    passengersWaiting: 8,
  },
  {
    id: 'wp-4',
    name: 'Science Park Gateway',
    code: 'D',
    x: 740,
    y: 260,
    distanceKm: 5.6,
    estMinutes: 14,
    description: 'Innovation center shuttle loop',
    passengersWaiting: 19,
  },
  {
    id: 'wp-5',
    name: 'South Transfer Station',
    code: 'E',
    x: 880,
    y: 440,
    distanceKm: 7.2,
    estMinutes: 18,
    description: 'Rapid transit interchange & terminus',
    passengersWaiting: 6,
  },
];

// Intermediate street corners forming realistic road grid segments
const ROUTE_PATH_POINTS: { x: number; y: number }[] = [
  { x: 120, y: 470 }, // Depot (A)
  { x: 120, y: 390 }, // Street turn north
  { x: 210, y: 390 }, // Avenue 4
  { x: 210, y: 310 }, // Cross street
  { x: 290, y: 310 }, // Terminal A (B)
  { x: 370, y: 310 }, // Boulevard east
  { x: 370, y: 200 }, // River bridge north
  { x: 480, y: 200 }, // Medical Hub (C)
  { x: 610, y: 200 }, // Tech expressway
  { x: 610, y: 260 }, // Loop entrance
  { x: 740, y: 260 }, // Science Gateway (D)
  { x: 800, y: 260 }, // East connector
  { x: 800, y: 440 }, // Transit artery south
  { x: 880, y: 440 }, // South Transfer (E)
];

// Helper to compute cumulative distance along polyline points
const computePathLengths = (points: { x: number; y: number }[]) => {
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
    lengths.push(total);
  }
  return { lengths, total };
};

const { lengths: PATH_LENGTHS, total: TOTAL_PATH_LENGTH } = computePathLengths(ROUTE_PATH_POINTS);

// Interpolate point along route given progress [0..1]
const getPointAtProgress = (progress: number) => {
  const clamped = Math.max(0, Math.min(1, progress));
  const targetDist = clamped * TOTAL_PATH_LENGTH;

  for (let i = 1; i < PATH_LENGTHS.length; i++) {
    if (PATH_LENGTHS[i] >= targetDist) {
      const segStartDist = PATH_LENGTHS[i - 1];
      const segLength = PATH_LENGTHS[i] - segStartDist;
      const t = segLength === 0 ? 0 : (targetDist - segStartDist) / segLength;
      const p1 = ROUTE_PATH_POINTS[i - 1];
      const p2 = ROUTE_PATH_POINTS[i];
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;
      // Calculate angle in degrees
      const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
      return { x, y, angle };
    }
  }

  const last = ROUTE_PATH_POINTS[ROUTE_PATH_POINTS.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
};

interface MockShuttleMapProps {
  shuttleName?: string;
  licensePlate?: string;
}

export const MockShuttleMap: React.FC<MockShuttleMapProps> = ({
  shuttleName = 'Shuttle #04',
  licensePlate = 'ESP32-FLT-882'
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0.08); // initial slight offset past start
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [showTraffic, setShowTraffic] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Animation frame loop for smooth driving simulation
  useEffect(() => {
    if (!isPlaying) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // Base: entire 7.2km route takes ~72 seconds in 1x simulation speed
      const baseRate = 0.014;
      const step = baseRate * speedMultiplier * dt;

      setProgress((prev) => {
        const next = prev + step;
        if (next >= 1.0) {
          setIsPlaying(false);
          return 1.0;
        }
        return next;
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, speedMultiplier]);

  const vehicleState = getPointAtProgress(progress);

  // Find next waypoint ahead
  const totalKm = 7.2;
  const currentKm = Number((progress * totalKm).toFixed(1));
  const remainingKm = Math.max(0, Number((totalKm - currentKm).toFixed(1)));
  const nextWaypoint = WAYPOINTS.find((wp) => wp.distanceKm > currentKm) || WAYPOINTS[WAYPOINTS.length - 1];
  const etaMinutes = Math.max(1, Math.round((1 - progress) * 18));
  const simulatedSpeed = isPlaying ? Math.round(34 + Math.sin(progress * 25) * 8) : 0;

  // Handle Reset
  const handleReset = () => {
    setIsPlaying(false);
    setProgress(0.0);
    setSelectedWaypoint(null);
  };

  // SVG route path string
  const pathD = ROUTE_PATH_POINTS.reduce((acc, p, idx) => {
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
  }, '');

  return (
    <div
      ref={containerRef}
      className={`bg-white rounded-2xl border border-[#FDC3D1] shadow-xs overflow-hidden transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-50 shadow-2xl flex flex-col' : 'relative'
      }`}
    >
      {/* Top Google Maps Style Header Bar */}
      <div className="bg-[#FFF7F9] border-b border-[#FDC3D1] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Mock Google Search / Route Badge */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-[#FDC3D1] shadow-2xs">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className="text-left">
              <span className="text-[11px] font-bold text-[#2E1826] block">
                {shuttleName} • Campus Line Express
              </span>
              <span className="text-[10px] text-[#826674] block font-mono">
                {licensePlate} • Next: {nextWaypoint.name}
              </span>
            </div>
          </div>

          {/* Route Distance & ETA Pill */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs bg-white px-2.5 py-1 rounded-lg border border-[#FCE7ED] text-[#C72C5E] font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>ETA {etaMinutes} min ({remainingKm} km left)</span>
          </div>
        </div>

        {/* Top Right Map Controls */}
        <div className="flex items-center gap-2">
          {/* Map Layer Switcher */}
          <div className="inline-flex rounded-lg border border-[#FDC3D1] bg-white p-0.5 text-[11px] font-semibold text-[#826674]">
            <button
              onClick={() => setMapType('roadmap')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                mapType === 'roadmap'
                  ? 'bg-[#C72C5E] text-white shadow-2xs'
                  : 'hover:text-[#2E1826]'
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setMapType('satellite')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                mapType === 'satellite'
                  ? 'bg-[#C72C5E] text-white shadow-2xs'
                  : 'hover:text-[#2E1826]'
              }`}
            >
              Satellite
            </button>
          </div>

          {/* Traffic Toggle */}
          <button
            onClick={() => setShowTraffic(!showTraffic)}
            title="Toggle Live Traffic Layer"
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
              showTraffic
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-[#FDC3D1] bg-white text-[#826674] hover:text-[#2E1826]'
            }`}
          >
            <Layers className="w-3 h-3 text-emerald-600" />
            <span className="hidden md:inline">Traffic</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg border border-[#FDC3D1] bg-white hover:bg-[#FFF7F9] text-[#826674] hover:text-[#2E1826] transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Map'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Interactive Map Viewport */}
      <div className={`relative w-full overflow-hidden select-none ${isFullscreen ? 'flex-1 min-h-[420px]' : 'h-[360px] sm:h-[410px]'}`}>
        {/* Canvas / SVG Map Background */}
        <div
          className="w-full h-full relative transition-transform duration-200"
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: `${(vehicleState.x / 1000) * 100}% ${(vehicleState.y / 600) * 100}%`
          }}
        >
          <svg
            viewBox="0 0 1000 600"
            className="w-full h-full object-cover"
            preserveAspectRatio="xMidYMid slice"
          >
            {/* Defs for gradients, patterns, and filters */}
            <defs>
              <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1A73E8" />
                <stop offset="50%" stopColor="#4285F4" />
                <stop offset="100%" stopColor="#0B57D0" />
              </linearGradient>

              {/* Water Gradient */}
              <linearGradient id="waterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={mapType === 'satellite' ? '#14314A' : '#C4E3FD'} />
                <stop offset="100%" stopColor={mapType === 'satellite' ? '#0F2438' : '#A8D4FD'} />
              </linearGradient>

              {/* Satellite Terrain Gradient */}
              <radialGradient id="satGrad" cx="50%" cy="50%" r="70%">
                <stop offset="0%" stopColor="#1E2E24" />
                <stop offset="50%" stopColor="#18241D" />
                <stop offset="100%" stopColor="#101713" />
              </radialGradient>

              {/* Filter for Drop Shadows */}
              <filter id="mapShadow" x="-10%" y="-10%" width="130%" height="130%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* Base Background (Land) */}
            <rect
              x="0"
              y="0"
              width="1000"
              height="600"
              fill={mapType === 'satellite' ? 'url(#satGrad)' : '#F4F3F0'}
            />

            {/* Urban Parks & Greenery Areas */}
            <path
              d="M 50 40 Q 180 20 280 80 T 420 120 L 390 220 L 160 210 Z"
              fill={mapType === 'satellite' ? '#1D3B2B' : '#CEEAD6'}
              opacity="0.8"
            />
            <path
              d="M 640 60 Q 780 40 880 100 T 940 260 L 820 220 L 680 180 Z"
              fill={mapType === 'satellite' ? '#1D3B2B' : '#CEEAD6'}
              opacity="0.75"
            />
            <path
              d="M 680 340 C 720 310, 840 330, 920 390 L 890 520 L 730 500 Z"
              fill={mapType === 'satellite' ? '#1A3325' : '#D5EEDB'}
              opacity="0.7"
            />

            {/* Natural River / Bay Waterway */}
            <path
              d="M 440 0 C 420 120, 360 210, 390 320 C 420 420, 520 480, 560 600 L 490 600 C 450 490, 350 410, 320 310 C 290 200, 360 110, 370 0 Z"
              fill="url(#waterGrad)"
            />

            {/* Minor Street Grid Lines */}
            <g stroke={mapType === 'satellite' ? '#3B4842' : '#FFFFFF'} strokeWidth="5" fill="none">
              {/* Horizontal Streets */}
              <line x1="0" y1="100" x2="1000" y2="100" />
              <line x1="0" y1="180" x2="1000" y2="180" />
              <line x1="0" y1="260" x2="1000" y2="260" />
              <line x1="0" y1="340" x2="1000" y2="340" />
              <line x1="0" y1="420" x2="1000" y2="420" />
              <line x1="0" y1="500" x2="1000" y2="500" />

              {/* Vertical Streets */}
              <line x1="120" y1="0" x2="120" y2="600" />
              <line x1="210" y1="0" x2="210" y2="600" />
              <line x1="290" y1="0" x2="290" y2="600" />
              <line x1="530" y1="0" x2="530" y2="600" />
              <line x1="610" y1="0" x2="610" y2="600" />
              <line x1="740" y1="0" x2="740" y2="600" />
              <line x1="880" y1="0" x2="880" y2="600" />
            </g>

            {/* Major Arteries / Avenues */}
            <g stroke={mapType === 'satellite' ? '#5E6D66' : '#FFE89E'} strokeWidth="9" fill="none">
              <line x1="0" y1="310" x2="1000" y2="310" />
              <line x1="0" y1="470" x2="1000" y2="470" />
              <line x1="370" y1="0" x2="370" y2="600" />
              <line x1="800" y1="0" x2="800" y2="600" />
            </g>

            {/* Live Traffic Overlay (Green for fast, Orange for moderate) */}
            {showTraffic && (
              <g strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.85">
                <line x1="20" y1="310" x2="350" y2="310" stroke="#0F9D58" />
                <line x1="390" y1="310" x2="780" y2="310" stroke="#F4B400" />
                <line x1="820" y1="310" x2="980" y2="310" stroke="#0F9D58" />
                <line x1="800" y1="40" x2="800" y2="300" stroke="#0F9D58" />
                <line x1="800" y1="320" x2="800" y2="580" stroke="#0F9D58" />
                <line x1="370" y1="20" x2="370" y2="290" stroke="#0F9D58" />
                <line x1="370" y1="330" x2="370" y2="580" stroke="#0F9D58" />
              </g>
            )}

            {/* River Bridge Structures */}
            <rect x="355" y="195" width="30" height="10" fill="#B0BEC5" rx="2" />
            <rect x="355" y="305" width="30" height="10" fill="#B0BEC5" rx="2" />
            <rect x="420" y="465" width="40" height="10" fill="#B0BEC5" rx="2" />

            {/* Building Block Silhouettes */}
            <g fill={mapType === 'satellite' ? '#222F28' : '#E8E6E1'} opacity="0.8">
              <rect x="140" y="275" width="55" height="25" rx="2" />
              <rect x="230" y="275" width="45" height="25" rx="2" />
              <rect x="230" y="325" width="45" height="40" rx="2" />
              <rect x="140" y="410" width="55" height="45" rx="2" />
              <rect x="550" y="120" width="45" height="45" rx="2" />
              <rect x="630" y="120" width="80" height="45" rx="2" />
              <rect x="630" y="280" width="60" height="45" rx="2" />
              <rect x="760" y="280" width="70" height="45" rx="2" />
              <rect x="820" y="460" width="45" height="30" rx="2" />
            </g>

            {/* Route Outer Border (Google Maps Route Outline) */}
            <path
              d={pathD}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.95"
            />

            {/* Route Primary Polyline (Google Maps Blue) */}
            <path
              d={pathD}
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Traveled Route Segment (Subdued color for completed road) */}
            <path
              d={pathD}
              fill="none"
              stroke="#43A047"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${progress * TOTAL_PATH_LENGTH} ${TOTAL_PATH_LENGTH}`}
            />

            {/* Waypoints / Stop Pins */}
            {WAYPOINTS.map((wp) => {
              const isSelected = selectedWaypoint?.id === wp.id;
              const isPassed = currentKm >= wp.distanceKm;

              return (
                <g
                  key={wp.id}
                  transform={`translate(${wp.x}, ${wp.y})`}
                  className="cursor-pointer group"
                  onClick={() => setSelectedWaypoint(wp)}
                >
                  {/* Waypoint Ripple Ring on Active or Selected */}
                  {isSelected && (
                    <circle
                      r="22"
                      fill="#EA4335"
                      opacity="0.25"
                      className="animate-ping"
                    />
                  )}

                  {/* Google Maps Style Drop Pin */}
                  <g transform="translate(0, -22)" filter="url(#mapShadow)">
                    <path
                      d="M 0 -10 C -10 -10, -10 6, 0 16 C 10 6, 10 -10, 0 -10 Z"
                      fill={isPassed ? '#0F9D58' : '#EA4335'}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <circle cx="0" cy="-2" r="5" fill="#FFFFFF" />
                    <text
                      x="0"
                      y="1"
                      textAnchor="middle"
                      fontSize="7"
                      fontWeight="bold"
                      fill={isPassed ? '#0F9D58' : '#EA4335'}
                    >
                      {wp.code}
                    </text>
                  </g>

                  {/* Stop Label Banner */}
                  <g transform="translate(0, 10)">
                    <rect
                      x="-55"
                      y="0"
                      width="110"
                      height="18"
                      rx="9"
                      fill="#FFFFFF"
                      stroke="#E5E7EB"
                      strokeWidth="1"
                      filter="url(#mapShadow)"
                    />
                    <text
                      x="0"
                      y="12"
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#1F2937"
                    >
                      {wp.name.length > 17 ? `${wp.name.slice(0, 15)}...` : wp.name}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Live Moving Vehicle / Shuttle Marker */}
            <g
              transform={`translate(${vehicleState.x}, ${vehicleState.y})`}
              filter="url(#mapShadow)"
            >
              {/* Radar pulse aura */}
              <circle
                r="18"
                fill="#1A73E8"
                opacity="0.3"
                className="animate-pulse"
              />

              {/* Directional Heading Cone */}
              <path
                d="M 0 0 L -12 -28 L 12 -28 Z"
                fill="#1A73E8"
                opacity="0.25"
                transform={`rotate(${vehicleState.angle + 90})`}
              />

              {/* Shuttle Disc */}
              <circle
                r="13"
                fill="#1A73E8"
                stroke="#FFFFFF"
                strokeWidth="2.5"
              />

              {/* Vehicle Direction Icon */}
              <g transform={`rotate(${vehicleState.angle + 90})`}>
                <polygon
                  points="0,-6 5,5 0,3 -5,5"
                  fill="#FFFFFF"
                />
              </g>

              {/* Floating Driver Marker Tag */}
              <g transform="translate(0, -22)">
                <rect
                  x="-35"
                  y="-12"
                  width="70"
                  height="16"
                  rx="4"
                  fill="#1E293B"
                  opacity="0.9"
                />
                <text
                  x="0"
                  y="-1"
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="bold"
                  fill="#FFFFFF"
                >
                  {simulatedSpeed > 0 ? `${simulatedSpeed} km/h` : 'Stopped'}
                </text>
              </g>
            </g>
          </svg>
        </div>

        {/* Selected Waypoint Info Floating Card */}
        {selectedWaypoint && (
          <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-lg border border-[#FDC3D1] max-w-xs z-20 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#EA4335] text-white text-[10px] font-bold">
                  {selectedWaypoint.code}
                </span>
                <h4 className="text-xs font-bold text-[#2E1826]">
                  {selectedWaypoint.name}
                </h4>
              </div>
              <button
                onClick={() => setSelectedWaypoint(null)}
                className="text-[#826674] hover:text-[#2E1826] text-xs font-bold px-1"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-[#826674] mt-1 leading-relaxed">
              {selectedWaypoint.description}
            </p>
            <div className="mt-2.5 pt-2 border-t border-[#FCE7ED] flex items-center justify-between text-[11px] font-medium text-[#2E1826]">
              <span className="flex items-center gap-1 text-[#C72C5E]">
                <MapPin className="w-3 h-3" />
                {selectedWaypoint.distanceKm} km from Depot
              </span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-semibold">
                {selectedWaypoint.passengersWaiting} waiting
              </span>
            </div>
          </div>
        )}

        {/* Google Maps Bottom-Left Watermark */}
        <div className="absolute bottom-3 left-4 select-none pointer-events-none flex items-center gap-1 bg-white/70 backdrop-blur-2xs px-2 py-0.5 rounded shadow-2xs">
          <span className="font-bold text-xs tracking-tighter" style={{ fontFamily: 'Roboto, Arial, sans-serif' }}>
            <span style={{ color: '#4285F4' }}>G</span>
            <span style={{ color: '#EA4335' }}>o</span>
            <span style={{ color: '#FBBC05' }}>o</span>
            <span style={{ color: '#4285F4' }}>g</span>
            <span style={{ color: '#34A853' }}>l</span>
            <span style={{ color: '#EA4335' }}>e</span>
          </span>
          <span className="text-[9px] text-gray-500 font-medium ml-1">Mock Map</span>
        </div>

        {/* Google Maps Bottom-Right Controls (+, -, Recenter) */}
        <div className="absolute bottom-3 right-4 flex flex-col gap-1.5 z-10">
          <button
            onClick={() => {
              // Recenter view on vehicle
              setZoomLevel(1);
            }}
            className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            title="Recenter on Shuttle"
          >
            <Compass className="w-4 h-4 text-[#C72C5E]" />
          </button>

          <div className="flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.6, z + 0.15))}
              className="w-8 h-8 flex items-center justify-center text-gray-700 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.85, z - 0.15))}
              className="w-8 h-8 flex items-center justify-center text-gray-700 hover:bg-gray-50 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Simulation Controls Bar (Play, Pause, Reset, Scrubber) */}
      <div className="bg-[#FFF7F9] border-t border-[#FDC3D1] p-3.5 sm:px-5 space-y-3">
        {/* Top Control Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Action Buttons: Play/Pause, Reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-colors cursor-pointer ${
                isPlaying
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-[#C72C5E] hover:bg-[#A9224E]'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause Route</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{progress >= 0.99 ? 'Replay Route' : 'Drive Route'}</span>
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-[#FDC3D1] hover:bg-white/80 text-[#2E1826] shadow-2xs transition-colors cursor-pointer"
              title="Reset shuttle position to Depot"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#826674]" />
              <span>Reset</span>
            </button>

            {/* Speed Toggle (1x, 2x, 4x) */}
            <div className="inline-flex rounded-xl border border-[#FDC3D1] bg-white p-0.5 text-xs font-bold">
              {[1, 2, 4].map((mult) => (
                <button
                  key={mult}
                  onClick={() => setSpeedMultiplier(mult)}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    speedMultiplier === mult
                      ? 'bg-[#C72C5E] text-white shadow-2xs'
                      : 'text-[#826674] hover:text-[#2E1826]'
                  }`}
                >
                  {mult}x
                </button>
              ))}
            </div>
          </div>

          {/* Real-time Telemetry Mini-Badges */}
          <div className="flex items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 bg-white border border-[#FDC3D1] px-2.5 py-1.5 rounded-xl font-medium text-[#2E1826]">
              <Gauge className="w-3.5 h-3.5 text-[#C72C5E]" />
              <span>{simulatedSpeed} km/h</span>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-[#FDC3D1] px-2.5 py-1.5 rounded-xl font-medium text-[#2E1826]">
              <Navigation className="w-3.5 h-3.5 text-emerald-600" />
              <span>{currentKm} / {totalKm} km</span>
            </div>
          </div>
        </div>

        {/* Route Scrubber & Stop Sequence */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#826674]">
            <span className="flex items-center gap-1">
              <span>Origin:</span>
              <strong className="text-[#2E1826]">Depot (Stop A)</strong>
            </span>
            <span>
              Route Progress: <strong>{Math.round(progress * 100)}%</strong>
            </span>
            <span className="flex items-center gap-1">
              <span>Terminus:</span>
              <strong className="text-[#2E1826]">South Transfer (Stop E)</strong>
            </span>
          </div>

          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max="1"
              step="0.002"
              value={progress}
              onChange={(e) => {
                setProgress(parseFloat(e.target.value));
              }}
              className="w-full h-2 bg-[#FCE7ED] rounded-lg appearance-none cursor-pointer accent-[#C72C5E]"
            />
          </div>

          {/* Quick Waypoint Jump Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
            {WAYPOINTS.map((wp) => {
              const isCurrentOrPassed = currentKm >= wp.distanceKm;
              return (
                <button
                  key={wp.id}
                  onClick={() => {
                    setProgress(wp.distanceKm / totalKm);
                    setSelectedWaypoint(wp);
                  }}
                  className={`text-left px-2 py-1 rounded-lg border text-[10px] transition-colors cursor-pointer ${
                    isCurrentOrPassed
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 font-semibold'
                      : 'border-[#FDC3D1] bg-white text-[#826674] hover:bg-[#FFF7F9]'
                  }`}
                >
                  <div className="flex items-center gap-1 truncate">
                    {isCurrentOrPassed ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="w-3 h-3 rounded-full bg-gray-200 text-gray-700 text-[8px] flex items-center justify-center shrink-0 font-bold">
                        {wp.code}
                      </span>
                    )}
                    <span className="truncate">{wp.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
