import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GoogleMap, InfoWindowF, MarkerF } from '@react-google-maps/api'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  ZoomControl,
} from 'react-leaflet'
import L from 'leaflet'
import { ArrowRight, MapPin, X } from 'lucide-react'
import type { PropertyAsset } from '../types/domain'
import { canonicalListingId } from '../lib/listingIds'
import {
  hasGoogleMapsKey,
  LEAFLET_BASEMAP_ATTRIBUTION,
  LEAFLET_BASEMAP_URL,
  SA_MAP_CENTER,
  SA_MAP_DEFAULT_ZOOM,
} from '../lib/api/mapsLoader'
import { useGoogleMaps } from '../context/GoogleMapsProvider'
import { PROPERTYFLOW_GOOGLE_MAP_STYLES } from '../lib/api/googleMapStyles'
import { hasMappedCoordinates } from '../lib/mapCoords'
import { staticMapImageUrl } from '../lib/api/documents'
import 'leaflet/dist/leaflet.css'
import { PropertyLoader } from './loading/PropertyLoader'
import type { UnitCardPayload } from '../lib/api/unitsApi'
import {
  formatMapPinLabel,
  resolveCardForProperty,
  resolveMapPreviewFields,
} from './propertyMapPreview'

function priceIcon(label: string, active: boolean) {
  return L.divIcon({
    className: 'pf-map-marker',
    html: `<span class="pf-price-pill${active ? ' is-active' : ''}">${label}</span>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  })
}

function FitToMarkers({ positions }: { positions: [number, number][] }) {
  const map = useMap()

  useEffect(() => {
    map.invalidateSize()
    if (!positions.length) {
      map.setView([SA_MAP_CENTER.lat, SA_MAP_CENTER.lng], SA_MAP_DEFAULT_ZOOM)
      return
    }
    if (positions.length === 1) {
      map.setView(positions[0], 13)
      return
    }
    map.fitBounds(L.latLngBounds(positions), { padding: [48, 48], maxZoom: 12 })
  }, [map, positions])

  return null
}

function MapClickClearActive({ onClear }: { onClear: () => void }) {
  useMapEvents({
    click: () => onClear(),
  })
  return null
}

function MapResize() {
  const map = useMap()
  useEffect(() => {
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    const t = window.setTimeout(onResize, 80)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(t)
    }
  }, [map])
  return null
}

function MapListingPreview({
  property,
  mode,
  detailBase,
  card,
  onClose,
}: {
  property: PropertyAsset
  mode: string
  detailBase: string
  card?: UnitCardPayload
  onClose?: () => void
}) {
  const { title, priceLabel, image, beds, baths, parking, area, suburb, city } =
    resolveMapPreviewFields(property, mode, card)

  const badge =
    property.listingMode === 'both'
      ? 'Sale or rent'
      : property.listingMode === 'sale'
        ? 'For sale'
        : 'To rent'

  const listingId = canonicalListingId(card?.property_id ?? property.id)
  const statItems = [
    beds > 0 ? { key: 'beds', label: `${beds} bed` } : null,
    baths > 0 ? { key: 'baths', label: `${baths} bath` } : null,
    parking > 0 ? { key: 'parking', label: `${parking} park` } : null,
    area > 0 ? { key: 'area', label: `${area.toLocaleString('en-ZA')} m²` } : null,
  ].filter(Boolean) as { key: string; label: string }[]

  return (
    <article className="pf-map-card relative w-[min(100vw-1.5rem,340px)] overflow-hidden rounded-xl bg-white">
      {onClose && (
        <button
          type="button"
          aria-label="Close preview"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }}
          className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/95 text-ink shadow-sm transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-primary-100">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-primary-100" aria-hidden />
        )}
        <span className="absolute bottom-0 left-0 right-0 bg-ink/70 px-2 py-1 text-center text-[10px] font-semibold leading-tight text-white">
          {badge}
        </span>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-semibold leading-snug text-ink">{title}</h3>
        <p className="mt-1 text-xs text-ink-500">
          {suburb}, {city}
        </p>
        <p className="mt-1.5 text-sm font-bold tabular text-ink">{priceLabel}</p>
        {statItems.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-ink-500">
            {statItems.map((item) => (
              <li key={item.key}>{item.label}</li>
            ))}
          </ul>
        ) : null}
        <Link
          to={`${detailBase}/${listingId}`}
          className="pf-map-cta mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary no-underline hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          View listing
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </article>
  )
}

function LeafletPropertyMap({
  withCoords,
  mode,
  detailBase,
  cardsByPropertyId,
  className,
}: {
  withCoords: PropertyAsset[]
  mode: string
  detailBase: string
  cardsByPropertyId?: Record<string, UnitCardPayload>
  className?: string
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const positions = useMemo(
    () => withCoords.map((p) => [p.lat, p.lng] as [number, number]),
    [withCoords],
  )
  const positionsKey = positions.map((p) => p.join(',')).join('|')

  return (
    <div className={`relative h-full min-h-[280px] overflow-hidden rounded-xl ${className ?? ''}`}>
      <MapContainer
        center={[SA_MAP_CENTER.lat, SA_MAP_CENTER.lng]}
        zoom={SA_MAP_DEFAULT_ZOOM}
        className="pf-leaflet-map h-full w-full rounded-xl"
        style={{ height: '100%', width: '100%', minHeight: 280 }}
        scrollWheelZoom
        zoomControl={false}
      >
        <TileLayer attribution={LEAFLET_BASEMAP_ATTRIBUTION} url={LEAFLET_BASEMAP_URL} />
        <ZoomControl position="bottomright" />
        <MapResize />
        <MapClickClearActive onClear={() => setActiveId(null)} />
        <FitToMarkers key={positionsKey} positions={positions} />

        {withCoords.map((p) => {
          const card = resolveCardForProperty(p, cardsByPropertyId)
          const label = formatMapPinLabel(p, mode, card)
          return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={priceIcon(label, activeId === p.id)}
            zIndexOffset={activeId === p.id ? 1000 : 0}
            eventHandlers={{
              click: () => setActiveId(p.id),
              popupclose: () => setActiveId((id) => (id === p.id ? null : id)),
            }}
          >
            <Popup
              className="pf-map-popup"
              closeButton={false}
              maxWidth={340}
              minWidth={280}
              offset={[0, -8]}
              autoPanPadding={[48, 80]}
              keepInView
            >
              <MapListingPreview
                property={p}
                mode={mode}
                detailBase={detailBase}
                card={card}
                onClose={() => setActiveId(null)}
              />
            </Popup>
          </Marker>
          )
        })}
      </MapContainer>

      {withCoords.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-white/80 px-4 text-center">
          <p className="text-sm font-medium text-ink-600">No mapped listings for these filters</p>
        </div>
      )}
    </div>
  )
}

function GooglePropertyMap({
  withCoords,
  mode,
  detailBase,
  cardsByPropertyId,
  className,
}: {
  withCoords: PropertyAsset[]
  mode: string
  detailBase: string
  cardsByPropertyId?: Record<string, UnitCardPayload>
  className?: string
}) {
  const { enabled, isLoaded, loadError } = useGoogleMaps()
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = withCoords.find((p) => p.id === activeId) ?? null

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      if (!withCoords.length) {
        map.setCenter(SA_MAP_CENTER)
        map.setZoom(SA_MAP_DEFAULT_ZOOM)
        return
      }
      if (withCoords.length === 1) {
        map.setCenter({ lat: withCoords[0].lat, lng: withCoords[0].lng })
        map.setZoom(13)
        return
      }
      const bounds = new google.maps.LatLngBounds()
      for (const p of withCoords) bounds.extend({ lat: p.lat, lng: p.lng })
      map.fitBounds(bounds, 48)
    },
    [withCoords],
  )

  if (!enabled || loadError) {
    return (
      <LeafletPropertyMap
        withCoords={withCoords}
        mode={mode}
        detailBase={detailBase}
        cardsByPropertyId={cardsByPropertyId}
        className={className}
      />
    )
  }

  if (!isLoaded) {
    return (
      <div
        className={`flex min-h-[280px] items-center justify-center rounded-xl bg-primary-50 ${className ?? ''}`}
      >
        <PropertyLoader size="sm" label="Loading map…" inline />
      </div>
    )
  }

  return (
    <div className={`relative h-full min-h-[280px] overflow-hidden rounded-xl ${className ?? ''}`}>
      <GoogleMap
        mapContainerClassName="h-full w-full rounded-xl"
        mapContainerStyle={{ height: '100%', width: '100%', minHeight: 280 }}
        onLoad={onLoad}
        onClick={() => setActiveId(null)}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          styles: PROPERTYFLOW_GOOGLE_MAP_STYLES,
          backgroundColor: '#f0f4fb',
          gestureHandling: 'greedy',
        }}
      >
        {withCoords.map((p) => {
          const card = resolveCardForProperty(p, cardsByPropertyId)
          return (
          <MarkerF
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            title={p.title}
            label={{
              text: formatMapPinLabel(p, mode, card),
              className: 'pf-gmap-price-label',
              fontSize: '11px',
              fontWeight: '600',
            }}
            onClick={(e) => {
              e.domEvent.stopPropagation()
              setActiveId(p.id)
            }}
          />
          )
        })}
        {active && (
          <InfoWindowF
            position={{ lat: active.lat, lng: active.lng }}
            onCloseClick={() => setActiveId(null)}
            options={{
              pixelOffset: new google.maps.Size(0, -36),
              maxWidth: 340,
              headerDisabled: true,
            }}
          >
            <div className="pf-gmap-info">
              <MapListingPreview
                property={active}
                mode={mode}
                detailBase={detailBase}
                card={resolveCardForProperty(active, cardsByPropertyId)}
                onClose={() => setActiveId(null)}
              />
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>

      {withCoords.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-white/80 px-4 text-center">
          <p className="text-sm font-medium text-ink-600">No mapped listings for these filters</p>
        </div>
      )}
    </div>
  )
}

/** Address-only / static-map fallback when interactive maps are unavailable. */
export function PropertyMapPlaceholder({
  property,
  className,
}: {
  property: PropertyAsset
  className?: string
}) {
  const staticUrl = hasMappedCoordinates(property)
    ? staticMapImageUrl({ lat: property.lat, lng: property.lng })
    : null
  return (
    <div
      className={`overflow-hidden rounded-xl border border-primary-100 bg-primary-50 ${className ?? ''}`}
    >
      {staticUrl ? (
        <img
          src={staticUrl}
          alt={`Map of ${property.title}`}
          className="h-full min-h-[200px] w-full object-cover"
        />
      ) : (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <MapPin className="h-6 w-6 text-primary" aria-hidden />
          <p className="text-sm font-semibold text-ink">
            {property.formattedAddress ?? property.address}
          </p>
          <p className="text-xs text-ink-500">
            {property.suburb}, {property.city}
            {Number.isFinite(property.lat) && Number.isFinite(property.lng)
              ? ` · ${property.lat.toFixed(4)}, ${property.lng.toFixed(4)}`
              : ''}
          </p>
          <p className="mt-1 text-[11px] text-ink-400">
            Set VITE_GOOGLE_MAPS_API_KEY for interactive / static Google Maps
          </p>
        </div>
      )}
    </div>
  )
}

export function PropertyMap({
  properties,
  mode = 'all',
  className,
  detailBase = '/listing',
  cardsByPropertyId,
}: {
  properties: PropertyAsset[]
  mode?: string
  className?: string
  /** Path prefix for marker CTA — workspace uses `/workspace/properties` */
  detailBase?: string
  /** Browse unit cards keyed by property id — aligns popup with grid cards */
  cardsByPropertyId?: Record<string, UnitCardPayload>
}) {
  const withCoords = useMemo(
    () => properties.filter((p) => hasMappedCoordinates(p)),
    [properties],
  )

  if (hasGoogleMapsKey()) {
    return (
      <GooglePropertyMap
        withCoords={withCoords}
        mode={mode}
        detailBase={detailBase}
        cardsByPropertyId={cardsByPropertyId}
        className={className}
      />
    )
  }

  return (
    <LeafletPropertyMap
      withCoords={withCoords}
      mode={mode}
      detailBase={detailBase}
      cardsByPropertyId={cardsByPropertyId}
      className={className}
    />
  )
}
