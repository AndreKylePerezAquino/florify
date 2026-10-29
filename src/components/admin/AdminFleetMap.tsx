import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Radio,
  Thermometer,
  Droplets,
  Fan,
  Wind,
  User,
  ExternalLink,
  Layers,
  Filter,
  Navigation,
} from 'lucide-react';
import { Device, UserProfile } from '../../types';
import { isDeviceConnected, isDriverGpsConnected, getDriverGpsStatus } from '../../lib/deviceStatus';

interface AdminFleetMapProps {
  devices: Device[];
  allUsers: UserProfile[];
  navigate: (path: string) => void;
}

// Fallback transit hubs in Metro Transit Network (centered around central hub)
const TRANSIT_STATIONS: { name: string; coords: [number, number] }[] = [
  { name: 'Central Terminal', coords: [14.5995, 120.9842] },
  { name: 'Taft Station', coords: [14.5800, 120.9880] },
  { name: 'Santa Cruz Hub', coords: [14.6080, 120.9850] },
  { name: 'Malate Bay Depot', coords: [14.5680, 120.9910] },
  { name: 'España Boulevard', coords: [14.6095, 120.9985] },
  { name: 'Paco Station', coords: [14.5825, 120.9995] },
  { name: 'Pandacan Facility', coords: [14.5920, 121.0060] },
  { name: 'Santa Mesa Junction', coords: [14.6015, 121.0120] },
  { name: 'Intramuros Gate', coords: [14.5945, 120.9740] },
  { name: 'Binondo Plaza', coords: [14.5998, 120.9755] },
  { name: 'North Port Gateway', coords: [14.6180, 120.9720] },
  { name: 'Makati North Station', coords: [14.5750, 121.0100] },
];

/**
 * Deterministically resolves coordinates for any shuttle vehicle.
 * Prioritizes live GPS reported from the driver's mobile device,
 * then explicit device coordinates, transit hub assignment, or geographic jitter.
 */
function getVehicleCoordinates(
  device: Device,
  driver: UserProfile | undefined,
  index: number
): { coords: [number, number]; isLiveGps: boolean; locationLabel: string } {
  // 1. Live GPS directly from assigned driver mobile device (verified connected within 30s)
  const isGpsActive = isDriverGpsConnected(driver);
  if (
    isGpsActive &&
    driver?.currentLocation &&
    typeof driver.currentLocation.latitude === 'number' &&
    typeof driver.currentLocation.longitude === 'number' &&
    !isNaN(driver.currentLocation.latitude) &&
    !isNaN(driver.currentLocation.longitude) &&
    Math.abs(driver.currentLocation.latitude) <= 90 &&
    Math.abs(driver.currentLocation.longitude) <= 180
  ) {
    return {
      coords: [driver.currentLocation.latitude, driver.currentLocation.longitude],
      isLiveGps: true,
      locationLabel: driver.displayName || 'Driver',
    };
  }

  // 2. Explicit coordinates on device
  if (device.locationLabel) {
    const parts = device.locationLabel.split(',').map((s) => parseFloat(s.trim()));
    if (
      parts.length === 2 &&
      !isNaN(parts[0]) &&
      !isNaN(parts[1]) &&
      Math.abs(parts[0]) <= 90 &&
      Math.abs(parts[1]) <= 180
    ) {
      return { coords: [parts[0], parts[1]], isLiveGps: false, locationLabel: device.locationLabel };
    }
  }

  // 3. Fallback transit hubs
  if (index < TRANSIT_STATIONS.length) {
    return {
      coords: TRANSIT_STATIONS[index].coords,
      isLiveGps: false,
      locationLabel: TRANSIT_STATIONS[index].name,
    };
  }

  // 4. Fallback hash-offset to prevent overlapping markers
  let hash = 0;
  for (let i = 0; i < device.deviceId.length; i++) {
    hash = (hash << 5) - hash + device.deviceId.charCodeAt(i);
    hash |= 0;
  }
  const latOffset = (((Math.abs(hash) % 1000) / 1000) - 0.5) * 0.06;
  const lngOffset = (((Math.abs(hash * 31) % 1000) / 1000) - 0.5) * 0.06;
  return {
    coords: [14.5995 + latOffset, 120.9842 + lngOffset],
    isLiveGps: false,
    locationLabel: device.locationLabel || `Sector ${Math.abs(hash % 8) + 1}`,
  };
}

export const AdminFleetMap: React.FC<AdminFleetMapProps> = ({
  devices,
  allUsers,
  navigate,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());

  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'ALL' | 'ONLINE' | 'ALERT'>('ALL');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const hasFittedRef = useRef<boolean>(false);

  // Reset initial fit when filter mode changes
  useEffect(() => {
    hasFittedRef.current = false;
  }, [filterMode]);

  // 5-second auto-refresh heartbeat to re-evaluate real-time GPS connection freshness
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Pre-calculate driver lookup dictionary
  const userMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    allUsers.forEach((user) => map.set(user.uid, user));
    return map;
  }, [allUsers]);

  // Online & Alert counts
  const onlineCount = useMemo(
    () => devices.filter((d) => isDeviceConnected(d)).length,
    [devices]
  );

  const alertCount = useMemo(
    () =>
      devices.filter(
        (d) =>
          d.status === 'SENSOR_ERROR' ||
          (d.latestTemperatureC !== undefined && d.latestTemperatureC >= 32)
      ).length,
    [devices]
  );

  // Filtered devices list
  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const isOnline = isDeviceConnected(device);
      const isAlert =
        device.status === 'SENSOR_ERROR' ||
        (device.latestTemperatureC !== undefined && device.latestTemperatureC >= 32);

      if (filterMode === 'ONLINE') return isOnline;
      if (filterMode === 'ALERT') return isAlert;
      return true;
    });
  }, [devices, filterMode]);

  // Initialize Leaflet map instance once
  useEffect(() => {
    if (!mapContainerRef.current || !isExpanded) return;

    if (!mapInstanceRef.current) {
      const initialCenter: [number, number] = [14.5995, 120.9842];
      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      // CartoDB Voyager tiles matching driver dashboard map
      L.tileLayer(
        'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_4sgr_1_09973f1bac54cf99384e35ac',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 19,
        }
      ).addTo(map);

      mapInstanceRef.current = map;
    }

    // Attach event delegation for navigation button inside popups
    const container = mapContainerRef.current;
    const handlePopupClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.admin-map-details-btn');
      if (target) {
        const targetDeviceId = target.getAttribute('data-device-id');
        if (targetDeviceId) {
          navigate(`/admin/devices/${targetDeviceId}`);
        }
      }
    };
    container?.addEventListener('click', handlePopupClick);

    // Invalidate size to handle collapsible container expansion
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 150);

    return () => {
      container?.removeEventListener('click', handlePopupClick);
    };
  }, [isExpanded, navigate]);

  // Update markers whenever devices, filterMode, or userMap changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isExpanded) return;

    // Clear existing markers from map
    markersMapRef.current.forEach((marker) => marker.remove());
    markersMapRef.current.clear();

    const boundsPoints: [number, number][] = [];

    devices.forEach((device, index) => {
      const isOnline = isDeviceConnected(device);
      const isAlert =
        device.status === 'SENSOR_ERROR' ||
        (device.latestTemperatureC !== undefined && device.latestTemperatureC >= 32);

      // Check if matches active filter
      if (filterMode === 'ONLINE' && !isOnline) return;
      if (filterMode === 'ALERT' && !isAlert) return;

      const driver = device.assignedDriverUid ? userMap.get(device.assignedDriverUid) : undefined;
      const { coords, isLiveGps } = getVehicleCoordinates(device, driver, index);
      boundsPoints.push(coords);

      const driverDisplayName = driver?.displayName || 'Unassigned Driver';
      const driverInitial = (driver?.displayName || 'D').charAt(0).toUpperCase();

      // Theme colors for marker pin
      const pinColor = !isOnline
        ? '#64748B' // slate-500 for offline
        : isAlert
        ? '#E11D48' // rose-600 for critical alert
        : '#059669'; // emerald-600 for normal active

      const pulseBg = !isOnline
        ? 'transparent'
        : isAlert
        ? 'rgba(225, 29, 72, 0.25)'
        : 'rgba(5, 150, 105, 0.22)';

      // Custom marker icon with integrated driver badge
      const customIcon = L.divIcon({
        className: 'admin-leaflet-marker',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%); cursor: pointer;">
            <!-- Shuttle & Driver Integrated Top Pill -->
            <div style="background: #2E1826; color: #FFFFFF; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9999px; box-shadow: 0 2px 5px rgba(0,0,0,0.25); white-space: nowrap; margin-bottom: 2px; border: 1px solid ${pinColor}; display: flex; align-items: center; gap: 4.5px;">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 9999px; background: ${isOnline ? '#10B981' : '#94A3B8'}; ${isOnline ? 'box-shadow: 0 0 6px #10B981;' : ''}"></span>
              <span>${device.displayName || device.deviceId}</span>
              <span style="opacity: 0.35;">•</span>
              <span style="color: #FFFFFF; font-weight: 600;">${driverDisplayName}</span>
            </div>

            <!-- Pin Body with Integrated Driver Badge -->
            <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
              ${
                isOnline
                  ? `<div style="position: absolute; width: 32px; height: 32px; border-radius: 9999px; background: ${pulseBg}; animation: ping 2.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
                  : ''
              }
              <div style="position: relative; width: 25px; height: 25px; border-radius: 9999px; background: ${pinColor}; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.25); display: flex; align-items: center; justify-content: center; color: white;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                  <circle cx="7" cy="17" r="2"/>
                  <circle cx="17" cy="17" r="2"/>
                </svg>
              </div>

              <!-- Overlapping Integrated Driver Badge -->
              <div style="position: absolute; bottom: -2px; right: -2px; width: 16px; height: 16px; border-radius: 9999px; background: ${isOnline ? '#059669' : '#64748B'}; border: 1.5px solid #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 800; color: #FFFFFF;" title="${driverDisplayName}">
                ${driverInitial}
              </div>
            </div>
          </div>
        `,
        iconSize: [0, 0],
        popupAnchor: [0, -38],
      });

      const marker = L.marker(coords, { icon: customIcon }).addTo(map);

      // Popup containing ONLY the driver display name
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; font-weight: 700; color: #2E1826; text-align: center; padding: 4px 8px; white-space: nowrap;">
          ${driverDisplayName}
        </div>
      `);

      // Clicking marker zooms in to driver location at zoom level 16
      marker.on('click', () => {
        focusDeviceOnMap(device.deviceId);
      });

      markersMapRef.current.set(device.deviceId, marker);
    });

    // Auto-fit bounds only on initial load or filter change if not already fitted and no specific device selected
    if (boundsPoints.length > 0 && !selectedDeviceId && !hasFittedRef.current) {
      try {
        const bounds = L.latLngBounds(boundsPoints);
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
        hasFittedRef.current = true;
      } catch (e) {
        console.warn('Map fitBounds error:', e);
      }
    }
  }, [devices, filterMode, userMap, isExpanded, selectedDeviceId, nowTick]);

  // Handle clicking a vehicle chip to center and open popup
  const focusDeviceOnMap = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    const map = mapInstanceRef.current;
    const marker = markersMapRef.current.get(deviceId);

    if (map && marker) {
      const latLng = marker.getLatLng();
      map.flyTo(latLng, 16, { animate: true, duration: 0.8 });
      marker.openPopup();
    }
  };

  // Fit all fleet devices button
  const handleFitFleet = () => {
    setSelectedDeviceId(null);
    const map = mapInstanceRef.current;
    if (!map) return;

    const points: [number, number][] = [];
    markersMapRef.current.forEach((marker) => {
      const latLng = marker.getLatLng();
      points.push([latLng.lat, latLng.lng]);
    });

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [45, 45], maxZoom: 15 });
      hasFittedRef.current = true;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#FDC3D1] shadow-xs overflow-hidden transition-all duration-200">
      {/* Panel Header */}
      <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#FDC3D1]/70 bg-gradient-to-r from-pink-50/40 via-white to-pink-50/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#C72C5E]/10 flex items-center justify-center text-[#C72C5E]">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-[#2E1826]">
                Fleet & Climate Map
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100/80 text-emerald-800 border border-emerald-300/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                {onlineCount}/{devices.length} Online
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex items-center gap-2">
          {/* Quick Filter Buttons */}
          <div className="hidden sm:flex items-center bg-[#2E1826]/5 rounded-lg p-0.5 text-xs font-semibold">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterMode === 'ALL'
                  ? 'bg-white text-[#2E1826] shadow-xs'
                  : 'text-[#826674] hover:text-[#2E1826]'
              }`}
            >
              All ({devices.length})
            </button>
            <button
              onClick={() => setFilterMode('ONLINE')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterMode === 'ONLINE'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-[#826674] hover:text-[#2E1826]'
              }`}
            >
              Online ({onlineCount})
            </button>
            {alertCount > 0 && (
              <button
                onClick={() => setFilterMode('ALERT')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterMode === 'ALERT'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-rose-600 hover:text-rose-700'
                }`}
              >
                Alerts ({alertCount})
              </button>
            )}
          </div>

          {/* Fit Fleet View */}
          {isExpanded && (
            <button
              type="button"
              onClick={handleFitFleet}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#FDC3D1] bg-white hover:bg-pink-50 text-[#C72C5E] text-xs font-semibold shadow-2xs transition-colors"
              title="Fit map to show all fleet vehicles"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fit Fleet</span>
            </button>
          )}

          {/* Expand/Collapse Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg border border-[#FDC3D1] bg-white hover:bg-pink-50 text-[#826674] hover:text-[#2E1826] transition-colors"
            title={isExpanded ? 'Collapse Map' : 'Expand Map'}
            aria-label={isExpanded ? 'Collapse Map' : 'Expand Map'}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="relative">
          {/* Map Container */}
          <div
            ref={mapContainerRef}
            className="w-full h-[360px] sm:h-[440px] z-10 bg-slate-100"
          />

          {/* Bottom Vehicle Quick-Fly Selector Strip */}
          <div className="p-2 sm:p-3 bg-white/95 backdrop-blur-xs border-t border-[#FDC3D1]/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-bold text-[#826674] uppercase tracking-wider pl-1 shrink-0 flex items-center gap-1">
              <Navigation className="h-3 w-3 text-[#C72C5E]" />
              Vehicles:
            </span>

            {filteredDevices.length === 0 ? (
              <span className="text-xs text-[#826674] italic">
                No vehicles match current filter.
              </span>
            ) : (
              filteredDevices.map((device, index) => {
                const isOnline = isDeviceConnected(device);
                const isSelected = selectedDeviceId === device.deviceId;
                const driver = device.assignedDriverUid ? userMap.get(device.assignedDriverUid) : undefined;
                const safeKey = device.deviceId ? `${device.deviceId}-${index}` : `map-shuttle-btn-${index}`;

                return (
                  <button
                    key={safeKey}
                    onClick={() => focusDeviceOnMap(device.deviceId || '')}
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border shrink-0 transition-all ${
                      isSelected
                        ? 'bg-[#C72C5E] text-white border-[#C72C5E] shadow-xs'
                        : 'bg-white hover:bg-pink-50/70 text-[#2E1826] border-[#FDC3D1]'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isOnline
                          ? 'bg-emerald-500 ring-2 ring-emerald-200'
                          : 'bg-slate-400'
                      }`}
                      title={
                        isOnline
                          ? (driver ? `Vehicle Online • ${driver.displayName || 'Driver'}` : 'Vehicle Online (No Driver)')
                          : 'Vehicle Offline'
                      }
                    />
                    <span className="font-semibold">
                      {device.displayName || device.deviceId}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : isOnline
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-[#FFF7F9] text-[#826674] border border-[#FDC3D1]/50'
                      }`}
                    >
                      {driver?.displayName || 'Unassigned'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
