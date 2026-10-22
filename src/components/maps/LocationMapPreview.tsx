import { useCallback, useEffect, useMemo } from 'react'
import { GoogleMap, MarkerF } from '@react-google-maps/api'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useGoogleMaps } from '../../context/GoogleMapsProvider'
import {
  LEAFLET_BASEMAP_ATTRIBUTION,
  LEAFLET_BASEMAP_URL,
  SA_MAP_CENTER,
  SA_MAP_DEFAULT_ZOOM,
} from '../../lib/api/mapsLoader'
import { PROPERTYFLOW_GOOGLE_MAP_STYLES } from '../../lib/api/googleMapStyles'
import { PropertyLoader } from '../loading/PropertyLoader'
import 'leaflet/dist/leaflet.css'

function hasCoords(lat?: number | null, lng?: number | null): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
}

function LeafletRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], 15)
    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => window.clearTimeout(t)
  }, [map, lat, lng])
  return null
}

const defaultPin = L.divIcon({
  className: 'pf-map-marker',
  html: '<span class="pf-price-pill is-active">●</span>',
  iconSize: [1, 1],
  iconAnchor: [0, 0],
})

type Props = {
  lat?: number | null
  lng?: number | null
  className?: string
}

/**
 * Small map for create/edit location steps — Google when configured and healthy,
 * otherwise Carto/Leaflet (no Google error modal).
 */
export function LocationMapPreview({ lat, lng, className }: Props) {
  const { enabled, isLoaded, loadError } = useGoogleMaps()
  const positioned = hasCoords(lat, lng)
  const center = useMemo(
    () => (positioned ? { lat: lat!, lng: lng! } : SA_MAP_CENTER),
    [positioned, lat, lng],
  )

  const onGoogleLoad = useCallback(
    (map: google.maps.Map) => {
      map.setCenter(center)
      map.setZoom(positioned ? 15 : SA_MAP_DEFAULT_ZOOM)
    },
    [center, positioned],
  )

  const useGoogle = enabled && isLoaded && !loadError

  if (enabled && !loadError && !isLoaded) {
    return (
      <div
        className={`flex min-h-[220px] items-center justify-center rounded-xl border border-primary-100 bg-primary-50 ${className ?? ''}`}
      >
        <PropertyLoader size="sm" label="Loading map…" inline />
      </div>
    )
  }

  if (useGoogle) {
    return (
      <div
        className={`min-h-[220px] overflow-hidden rounded-xl border border-primary-100 ${className ?? ''}`}
      >
        <GoogleMap
          mapContainerClassName="h-[220px] w-full"
          mapContainerStyle={{ height: 220, width: '100%' }}
          onLoad={onGoogleLoad}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            clickableIcons: false,
            styles: PROPERTYFLOW_GOOGLE_MAP_STYLES,
            gestureHandling: 'cooperative',
          }}
        >
          {positioned ? <MarkerF position={{ lat: lat!, lng: lng! }} /> : null}
        </GoogleMap>
        {!positioned ? (
          <p className="border-t border-primary-100 bg-white px-3 py-2 text-xs text-ink-500">
            Pick an address from suggestions or complete suburb and city — we will place the pin when
            coordinates are known.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={`min-h-[220px] overflow-hidden rounded-xl border border-primary-100 ${className ?? ''}`}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={positioned ? 15 : SA_MAP_DEFAULT_ZOOM}
        className="h-[220px] w-full"
        zoomControl
        scrollWheelZoom={false}
      >
        <TileLayer url={LEAFLET_BASEMAP_URL} attribution={LEAFLET_BASEMAP_ATTRIBUTION} />
        {positioned ? (
          <>
            <LeafletRecenter lat={lat!} lng={lng!} />
            <Marker position={[lat!, lng!]} icon={defaultPin} />
          </>
        ) : null}
      </MapContainer>
      <p className="border-t border-primary-100 bg-white px-3 py-2 text-xs text-ink-500">
        {enabled && loadError
          ? 'Google Maps could not load (check VITE_GOOGLE_MAPS_API_KEY and referrer restrictions). Showing OpenStreetMap instead.'
          : !enabled
            ? 'Add VITE_GOOGLE_MAPS_API_KEY in .env.local for Google Maps and Places autocomplete.'
            : 'Pin updates when an address is geocoded.'}
      </p>
    </div>
  )
}
