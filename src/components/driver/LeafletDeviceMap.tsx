import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LocateFixed,
  Navigation,
  Thermometer,
  Droplets,
  Radio,
  MapPin
} from 'lucide-react';
import { Device } from '../../types';

interface LeafletDeviceMapProps {
  device?: Device;
}

// Fallback coordinate: Metropolitan transit terminal (Manila / Central Hub)
const DEFAULT_FALLBACK_COORDS: [number, number] = [14.5995, 120.9842];

export const LeafletDeviceMap: React.FC<LeafletDeviceMapProps> = ({ device }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);

  const [coords, setCoords] = useState<[number, number]>(DEFAULT_FALLBACK_COORDS);
  const [locationSource, setLocationSource] = useState<'GPS' | 'FALLBACK'>('FALLBACK');
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Initialize and watch device / browser GPS location
  useEffect(() => {
    let watchId: number | null = null;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCoords: [number, number] = [
            position.coords.latitude,
            position.coords.longitude,
          ];
          setCoords(newCoords);
          setLocationSource('GPS');
          setAccuracyMeters(Math.round(position.coords.accuracy));
          setGpsError(null);
        },
        (err) => {
          console.warn('Geolocation unavailable, using vehicle fallback:', err.message);
          setGpsError(err.message);
          setLocationSource('FALLBACK');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );

      // Continuous position watch
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const newCoords: [number, number] = [
            position.coords.latitude,
            position.coords.longitude,
          ];
          setCoords(newCoords);
          setLocationSource('GPS');
          setAccuracyMeters(Math.round(position.coords.accuracy));
        },
        () => {
          // Keep current coords on transient watch error
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    } else {
      setGpsError('Browser geolocation not supported');
      setLocationSource('FALLBACK');
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Destroy any existing map instance before creating a new one
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Initialize Leaflet map
    const map = L.map(mapContainerRef.current, {
      center: coords,
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: true,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
    });

    // CartoDB Positron clean light tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Custom pulsing beacon vehicle marker icon
    const customIcon = L.divIcon({
      className: 'leaflet-custom-vehicle-marker',
      html: `
        <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 34px; height: 34px; border-radius: 9999px; background: rgba(199, 44, 94, 0.25); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 22px; height: 22px; border-radius: 9999px; background: #C72C5E; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -2px rgba(0, 0, 0, 0.1); display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
          </div>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18],
    });

    // Create marker
    const marker = L.marker(coords, { icon: customIcon }).addTo(map);

    // Bind clean popup
    const shuttleTitle = device?.displayName || 'Assigned Shuttle';
    const deviceId = device?.deviceId || 'ESP32 Device';
    const tempText = device?.latestTemperatureC !== undefined ? `${device.latestTemperatureC.toFixed(1)}°C` : 'N/A';
    const humText = device?.latestHumidityRH !== undefined ? `${device.latestHumidityRH.toFixed(0)}% RH` : 'N/A';

    marker.bindPopup(`
      <div style="font-family: inherit; font-size: 12px; line-height: 1.4; color: #2E1826; min-width: 170px;">
        <div style="font-weight: 700; font-size: 13px; color: #C72C5E; margin-bottom: 2px;">
          ${shuttleTitle}
        </div>
        <div style="font-size: 10px; color: #826674; font-family: monospace; margin-bottom: 6px;">
          ID: ${deviceId}
        </div>
        <div style="border-top: 1px solid #FDC3D1; padding-top: 6px; display: flex; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 4px; font-weight: 600;">
            🌡️ ${tempText}
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-weight: 600;">
            💧 ${humText}
          </div>
        </div>
      </div>
    `);

    // Add accuracy circle if available
    let accuracyCircle: L.Circle | null = null;
    if (accuracyMeters && accuracyMeters > 0) {
      accuracyCircle = L.circle(coords, {
        radius: Math.min(accuracyMeters, 200),
        color: '#C72C5E',
        weight: 1,
        fillColor: '#FF5C89',
        fillOpacity: 0.12,
      }).addTo(map);
    }

    mapInstanceRef.current = map;
    markerRef.current = marker;
    accuracyCircleRef.current = accuracyCircle;

    // Invalidate size once after mounting to ensure clean leaflet canvas layout on mobile
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
    };
  }, []); // Run once on mount

  // Update marker and circle position when coords change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (markerRef.current) {
      markerRef.current.setLatLng(coords);
    }

    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setLatLng(coords);
      if (accuracyMeters) {
        accuracyCircleRef.current.setRadius(Math.min(accuracyMeters, 200));
      }
    }
  }, [coords, accuracyMeters]);

  // Center map on device location
  const handleCenterOnDevice = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(coords, 16, { duration: 1.2 });
      if (markerRef.current) {
        markerRef.current.openPopup();
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#FDC3D1] shadow-xs overflow-hidden">
      {/* Map Header Status Bar */}
      <div className="bg-[#FFF7F9] border-b border-[#FDC3D1] px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-xl border border-[#FDC3D1] shadow-2xs">
            <span
              className={`flex h-2.5 w-2.5 rounded-full ${
                locationSource === 'GPS'
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-blue-500'
              }`}
            />
            <div className="text-left truncate">
              <span className="text-xs font-bold text-[#2E1826] block truncate">
                {device?.displayName || 'Assigned Shuttle'}
              </span>
              <span className="text-[10px] text-[#826674] block font-mono">
                {coords[0].toFixed(4)}°, {coords[1].toFixed(4)}° •{' '}
                {locationSource === 'GPS' ? 'Live GPS' : 'Station Coordinates'}
              </span>
            </div>
          </div>

          {/* Location status badge */}
          <div className="hidden xs:flex items-center gap-1.5 text-xs bg-white px-2.5 py-1 rounded-lg border border-[#FCE7ED] text-[#C72C5E] font-medium">
            {locationSource === 'GPS' ? (
              <>
                <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span className="text-emerald-700 font-semibold text-[11px]">
                  GPS Synced {accuracyMeters ? `(±${accuracyMeters}m)` : ''}
                </span>
              </>
            ) : (
              <>
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-blue-700 font-semibold text-[11px]">
                  Assigned Terminal
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action button: Center on Device */}
        <button
          onClick={handleCenterOnDevice}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-[#FDC3D1] hover:bg-[#FFF7F9] text-[#2E1826] hover:text-[#C72C5E] shadow-2xs transition-colors cursor-pointer"
          title="Center map on device location"
        >
          <LocateFixed className="w-3.5 h-3.5 text-[#C72C5E]" />
          <span>Center Device</span>
        </button>
      </div>

      {/* Embedded Leaflet Map Container */}
      <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] min-h-[260px] max-h-[460px] bg-[#F4F3F0]">
        <div
          ref={mapContainerRef}
          className="w-full h-full z-0 cursor-grab active:cursor-grabbing"
          style={{ minHeight: '260px' }}
        />

        {/* Floating Quick Telemetry Pill (Overlaid on bottom left of map) */}
        {device && (
          <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-xs px-2.5 py-1.5 rounded-xl border border-[#FDC3D1] shadow-sm flex items-center gap-3 text-xs font-semibold text-[#2E1826]">
            <div className="flex items-center gap-1 text-[#C72C5E]">
              <Thermometer className="w-3.5 h-3.5 text-[#C72C5E]" />
              <span>{device.latestTemperatureC !== undefined ? `${device.latestTemperatureC.toFixed(1)}°C` : '--'}</span>
            </div>
            <div className="h-3 w-[1px] bg-[#FDC3D1]" />
            <div className="flex items-center gap-1 text-sky-600">
              <Droplets className="w-3.5 h-3.5 text-sky-500" />
              <span>{device.latestHumidityRH !== undefined ? `${device.latestHumidityRH.toFixed(0)}%` : '--'}</span>
            </div>
          </div>
        )}

        {/* Floating Quick Recenter Button (Overlaid on bottom right above Leaflet attribution) */}
        <button
          onClick={handleCenterOnDevice}
          className="absolute bottom-8 right-3 z-[400] w-9 h-9 rounded-xl bg-white border border-gray-200 shadow-md flex items-center justify-center text-[#2E1826] hover:bg-[#FFF7F9] hover:text-[#C72C5E] cursor-pointer transition-colors"
          title="Recenter on Device"
        >
          <LocateFixed className="w-4 h-4 text-[#C72C5E]" />
        </button>
      </div>

      {/* Simplified Footer Guide */}
      <div className="bg-[#FFF7F9] border-t border-[#FDC3D1] px-4 py-2 flex items-center justify-between text-[11px] text-[#826674]">
        <span className="flex items-center gap-1">
          <Navigation className="w-3 h-3 text-[#C72C5E]" />
          <span>Drag to pan • Pinch or scroll to zoom</span>
        </span>
        <span className="font-mono text-[10px]">
          {gpsError ? 'Fallback coordinates active' : 'Live device location active'}
        </span>
      </div>
    </div>
  );
};
