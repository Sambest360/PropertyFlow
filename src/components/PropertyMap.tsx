import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from '@react-google-maps/api'
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import { ArrowRight, Bath, BedDouble, Car, Heart, MapPin, X } from 'lucide-react'
import type { PropertyAsset } from '../types/domain'
import { formatZAR } from '../data/seed'
import {
  hasGoogleMapsKey,
  LEAFLET_BASEMAP_ATTRIBUTION,
  LEAFLET_BASEMAP_URL,
  mapsLoaderConfig,
  SA_MAP_CENTER,
  SA_MAP_DEFAULT_ZOOM,
} from '../lib/api/mapsLoader'
import { PROPERTYFLOW_GOOGLE_MAP_STYLES } from '../lib/api/googleMapStyles'
import { hasMappedCoordinates } from '../lib/mapCoords'
import { staticMapImageUrl } from '../lib/api/documents'
import 'leaflet/dist/leaflet.css'

function shortPrice(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000
    return `R${m >= 10 ? m.toFixed(1) : m.toFixed(2).replace(/0$/, '').replace(/\.$/, '')}m`
  }
  if (amount >= 1_000) return `R${Math.round(amount / 1_000)}k`
  return formatZAR(amount)
}

function pinLabel(p: PropertyAsset, mode: string): string {
  if (mode === 'rent' && p.rent != null) return `${shortPrice(p.rent)}/mo`
  if (mode === 'buy' && p.price != null) return shortPrice(p.price)
  if (p.price != null) return shortPrice(p.price)
  if (p.rent != null) return `${shortPrice(p.rent)}/mo`
  return 'View'
}

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
  onClose,
}: {
  property: PropertyAsset
  mode: string
  detailBase: string
  onClose?: () => void
}) {
  const [saved, setSaved] = useState(false)

  const priceLabel =
    mode === 'rent' && property.rent != null
      ? `${formatZAR(property.rent)} / month`
      : property.price != null
        ? formatZAR(property.price)
        : property.rent != null
          ? `${formatZAR(property.rent)} / month`
          : '—'

  const badge =
    property.listingMode === 'both'
      ? 'Sale or rent'
      : property.listingMode === 'sale'
        ? 'For sale'
        : 'To rent'

  return (
    <article className="pf-map-card w-[260px] overflow-hidden rounded-2xl bg-white sm:w-[280px]">
      <div className="relative aspect-[16/10] overflow-hidden bg-primary-100">
        <img src={property.images[0]} alt="" className="h-full w-full object-cover" />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm">
          {badge}
        </span>
        <button
          type="button"
          aria-label={saved ? 'Remove from saved' : 'Save listing'}
          aria-pressed={saved}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setSaved((s) => !s)
          }}
          className="absolute bottom-2.5 right-2.5 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/95 text-ink shadow-sm transition-colors duration-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Heart className={`h-4 w-4 ${saved ? 'fill-accent text-accent' : ''}`} aria-hidden />
        </button>
        {onClose && (
          <button
            type="button"
            aria-label="Close preview"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }}
            className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-ink shadow-sm transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="line-clamp-1 text-[15px] font-semibold leading-snug text-ink">
          {property.title}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="line-clamp-1">
            {property.formattedAddress ?? `${property.suburb}, ${property.city}`}
          </span>
        </p>

        <p className="mt-2.5 text-base font-bold tabular text-ink">{priceLabel}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-primary-100 pt-2.5 text-xs text-ink-500">
          {property.beds > 0 && (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" aria-hidden />
              <span className="tabular">{property.beds} bed</span>
            </span>
          )}
          {property.baths > 0 && (
            <span className="inline-flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" aria-hidden />
              <span className="tabular">{property.baths} bath</span>
            </span>
          )}
          {property.parking > 0 && (
            <span className="inline-flex items-center gap-1">
              <Car className="h-3.5 w-3.5" aria-hidden />
              <span className="tabular">{property.parking}</span>
            </span>
          )}
          <span className="ml-auto tabular">{property.area.toLocaleString('en-ZA')} m²</span>
        </div>

        <Link
          to={`${detailBase}/${property.id}`}
          className="pf-map-cta mt-3.5 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold transition-colors duration-200 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          View listing
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  )
}

function LeafletPropertyMap({
  withCoords,
  mode,
  detailBase,
  className,
}: {
  withCoords: PropertyAsset[]
  mode: string
  detailBase: string
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
        <FitToMarkers key={positionsKey} positions={positions} />

        {withCoords.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={priceIcon(pinLabel(p, mode), activeId === p.id)}
            zIndexOffset={activeId === p.id ? 1000 : 0}
            eventHandlers={{
              click: () => setActiveId(p.id),
              popupclose: () => setActiveId((id) => (id === p.id ? null : id)),
            }}
          >
            <Popup
              className="pf-map-popup"
              closeButton={false}
              maxWidth={300}
              minWidth={260}
              offset={[0, -8]}
              autoPanPadding={[24, 24]}
            >
              <MapListingPreview
                property={p}
                mode={mode}
                detailBase={detailBase}
                onClose={() => setActiveId(null)}
              />
            </Popup>
          </Marker>
        ))}
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
  className,
}: {
  withCoords: PropertyAsset[]
  mode: string
  detailBase: string
  className?: string
}) {
  const { isLoaded, loadError } = useJsApiLoader(mapsLoaderConfig())
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

  if (loadError) {
    return (
      <LeafletPropertyMap
        withCoords={withCoords}
        mode={mode}
        detailBase={detailBase}
        className={className}
      />
    )
  }

  if (!isLoaded) {
    return (
      <div
        className={`flex min-h-[280px] items-center justify-center rounded-xl bg-primary-50 text-sm text-ink-500 ${className ?? ''}`}
      >
        Loading map…
      </div>
    )
  }

  return (
    <div className={`relative h-full min-h-[280px] overflow-hidden rounded-xl ${className ?? ''}`}>
      <GoogleMap
        mapContainerClassName="h-full w-full rounded-xl"
        mapContainerStyle={{ height: '100%', width: '100%', minHeight: 280 }}
        onLoad={onLoad}
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
        {withCoords.map((p) => (
          <MarkerF
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            title={p.title}
            label={{
              text: pinLabel(p, mode),
              className: 'pf-gmap-price-label',
              fontSize: '11px',
              fontWeight: '600',
            }}
            onClick={() => setActiveId(p.id)}
          />
        ))}
        {active && (
          <InfoWindowF
            position={{ lat: active.lat, lng: active.lng }}
            onCloseClick={() => setActiveId(null)}
            options={{ pixelOffset: new google.maps.Size(0, -36) }}
          >
            <MapListingPreview
              property={active}
              mode={mode}
              detailBase={detailBase}
              onClose={() => setActiveId(null)}
            />
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
}: {
  properties: PropertyAsset[]
  mode?: string
  className?: string
  /** Path prefix for marker CTA — workspace uses `/workspace/properties` */
  detailBase?: string
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
        className={className}
      />
    )
  }

  return (
    <LeafletPropertyMap
      withCoords={withCoords}
      mode={mode}
      detailBase={detailBase}
      className={className}
    />
  )
}
