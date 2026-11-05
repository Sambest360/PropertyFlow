/**
 * The area a listing is in, as a shaded circle: no pin, no street. The
 * centre is already rounded to ~1 km (toPublicListing), and the circle is
 * wide enough that the house can't be read off the map.
 */
import { Circle, MapContainer, TileLayer, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { LEAFLET_BASEMAP_ATTRIBUTION, LEAFLET_BASEMAP_URL } from '../lib/api/mapsLoader'

export const APPROXIMATE_AREA_RADIUS_M = 900

export function ApproximateAreaMap({ lat, lng, label, className }: { lat: number; lng: number; label: string; className?: string }) {
  return (
    <div className={`relative h-full min-h-[240px] overflow-hidden rounded-2xl ${className ?? ''}`} aria-label={`Map of the ${label} area`} role="img">
      <MapContainer
        center={[lat, lng]}
        zoom={14}
        minZoom={10}
        maxZoom={15}
        scrollWheelZoom={false}
        zoomControl={false}
        className="h-full w-full"
        style={{ height: '100%', width: '100%', minHeight: 240 }}
      >
        <TileLayer attribution={LEAFLET_BASEMAP_ATTRIBUTION} url={LEAFLET_BASEMAP_URL} />
        <ZoomControl position="bottomright" />
        <Circle center={[lat, lng]} radius={APPROXIMATE_AREA_RADIUS_M} pathOptions={{ color: '#2d5fc4', weight: 2, fillColor: '#2d5fc4', fillOpacity: 0.18 }} />
      </MapContainer>
    </div>
  )
}
