import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';
import t from '../../i18n/ar';
import 'leaflet/dist/leaflet.css';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const SHOP_MARKER = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DEFAULT_CENTER = [36.7538, 3.0588];

function MapInteraction({ position, interactive, onChange }) {
  const map = useMap();

  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), 15));
  }, [map, position]);

  useMapEvents({
    click(event) {
      if (interactive) onChange([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

export default function ShopLocationMap({
  position,
  onChange,
  interactive = true,
  className = '',
}) {
  const [locationError, setLocationError] = useState('');
  const center = position || DEFAULT_CENTER;
  const mapKey = useMemo(() => (position ? 'selected-location' : 'default-location'), [position]);

  const locateCurrentPosition = () => {
    if (!navigator.geolocation) {
      setLocationError(t.owner.locationUnavailable);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationError('');
        onChange([coords.latitude, coords.longitude]);
      },
      () => setLocationError(t.owner.locationPermissionError),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className={`relative ${className}`}>
      {interactive && (
        <button
          type="button"
          className="btn-outline btn-sm absolute top-3 right-3 z-[1000] bg-ink-900/90 shadow-card"
          onClick={locateCurrentPosition}
        >
          <LocateFixed size={15} />
          {t.owner.useCurrentLocation}
        </button>
      )}
      <MapContainer
        key={mapKey}
        center={center}
        zoom={position ? 15 : 6}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        className="h-72 w-full rounded-2xl z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapInteraction position={position} interactive={interactive} onChange={onChange} />
        {position && (
          <Marker
            position={position}
            icon={SHOP_MARKER}
            draggable={interactive}
            eventHandlers={{
              dragend(event) {
                if (!interactive) return;
                const marker = event.target;
                const { lat, lng } = marker.getLatLng();
                onChange([lat, lng]);
              },
            }}
          />
        )}
      </MapContainer>
      {locationError && <p className="text-xs text-red-400 mt-2 font-semibold">{locationError}</p>}
    </div>
  );
}
