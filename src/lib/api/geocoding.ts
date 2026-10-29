/**
 * Client-side geocoding via Google Maps Geocoding API.
 *
 * Requires `VITE_GOOGLE_MAPS_API_KEY` with Geocoding API enabled.
 * When the key is missing, returns a mock result from a small SA city table
 * so create/edit flows still produce lat/lng for the Leaflet fallback map.
 */

import { GOOGLE_MAPS_API_KEY, hasGoogleMapsKey } from './mapsLoader'

export type GeocodeResult = {
  lat: number
  lng: number
  placeId: string | null
  formattedAddress: string
  geocodedAt: string
  source: 'google' | 'mock' | 'osm'
  /** Address parts pulled from the result (empty when unknown). */
  parts?: AddressParts
}

export type AddressParts = { address: string; suburb: string; city: string; province: string }

type Component = { long_name: string; types: string[] }

/** Street, suburb, city and province from Google address components. */
export function partsFromComponents(components: readonly Component[], fallbackAddress = ''): AddressParts {
  const get = (...types: string[]) => {
    for (const t of types) {
      const hit = components.find((c) => c.types.includes(t))?.long_name
      if (hit) return hit
    }
    return ''
  }
  const street = [get('street_number'), get('route')].filter(Boolean).join(' ')
  return {
    address: street || get('premise', 'point_of_interest') || fallbackAddress,
    suburb: get('sublocality_level_1', 'sublocality', 'neighborhood'),
    city: get('locality', 'administrative_area_level_2'),
    province: get('administrative_area_level_1'),
  }
}

/**
 * Address at a map point (dropped / dragged pin). Google when a key is set,
 * otherwise OpenStreetMap; null when nothing is found.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<(AddressParts & { formattedAddress: string; placeId: string | null }) | null> {
  const g = typeof window !== 'undefined' ? window.google : undefined
  if (hasGoogleMapsKey() && g?.maps?.Geocoder) {
    try {
      const { results } = await new g.maps.Geocoder().geocode({ location: { lat, lng } })
      const top = results?.find((r) => r.types.includes('street_address') || r.types.includes('premise')) ?? results?.[0]
      if (top) {
        return {
          ...partsFromComponents(top.address_components as Component[], top.formatted_address ?? ''),
          formattedAddress: top.formatted_address ?? '',
          placeId: top.place_id ?? null,
        }
      }
    } catch {
      /* fall through */
    }
  }
  if (hasGoogleMapsKey()) {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
      url.searchParams.set('latlng', `${lat},${lng}`)
      url.searchParams.set('key', GOOGLE_MAPS_API_KEY)
      const res = await fetch(url.toString())
      if (res.ok) {
        const data = (await res.json()) as { status: string; results?: Array<{ place_id?: string; formatted_address?: string; address_components?: Component[] }> }
        const top = data.results?.[0]
        if (data.status === 'OK' && top) {
          return {
            ...partsFromComponents(top.address_components ?? [], top.formatted_address ?? ''),
            formattedAddress: top.formatted_address ?? '',
            placeId: top.place_id ?? null,
          }
        }
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('addressdetails', '1')
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = (await res.json()) as { display_name?: string; address?: Record<string, string> }
    const a = data.address ?? {}
    return {
      address: [a.house_number, a.road].filter(Boolean).join(' '),
      suburb: a.suburb || a.neighbourhood || a.quarter || '',
      city: a.city || a.town || a.village || a.municipality || '',
      province: a.state || '',
      formattedAddress: data.display_name ?? '',
      placeId: null,
    }
  } catch {
    return null
  }
}

const SA_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  // Port Elizabeth (Gqeberha) — primary demo geography
  'port elizabeth': { lat: -33.9608, lng: 25.6022 },
  gqeberha: { lat: -33.9608, lng: 25.6022 },
  summerstrand: { lat: -33.9923, lng: 25.6676 },
  humewood: { lat: -33.978, lng: 25.6449 },
  walmer: { lat: -33.9845, lng: 25.5868 },
  greenacres: { lat: -33.9386, lng: 25.5535 },
  'newton park': { lat: -33.9427, lng: 25.5593 },
  lorraine: { lat: -33.9348, lng: 25.5037 },
  fairview: { lat: -33.9159, lng: 25.4887 },
  sherwood: { lat: -33.9225, lng: 25.5342 },
  'algoa park': { lat: -33.9176, lng: 25.5664 },
  bethelsdorp: { lat: -33.8629, lng: 25.4985 },
  'mill park': { lat: -33.96, lng: 25.6 },
  'richmond hill': { lat: -33.962, lng: 25.608 },
  central: { lat: -33.9608, lng: 25.6022 },
  'bluewater bay': { lat: -33.87, lng: 25.63 },
  'mount pleasant': { lat: -33.968, lng: 25.55 },
  schoenmakerskop: { lat: -34.027, lng: 25.56 },
  framesby: { lat: -33.972, lng: 25.545 },
  charlo: { lat: -33.978, lng: 25.538 },
  // Legacy SA keys still resolve if typed
  johannesburg: { lat: -26.2041, lng: 28.0473 },
  sandton: { lat: -26.1076, lng: 28.0567 },
  'cape town': { lat: -33.9249, lng: 18.4241 },
  pretoria: { lat: -25.7479, lng: 28.2293 },
  durban: { lat: -29.8587, lng: 31.0218 },
}

function mockGeocode(parts: {
  address?: string
  suburb?: string
  city?: string
}): GeocodeResult {
  const hay = [parts.suburb, parts.city, parts.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  let hit = SA_CITY_COORDS['port elizabeth']
  for (const [key, coords] of Object.entries(SA_CITY_COORDS)) {
    if (hay.includes(key)) {
      hit = coords
      break
    }
  }
  // Slight jitter so co-located listings don't stack exactly
  const jitter = (seed: string) => {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    return ((h % 1000) / 1000 - 0.5) * 0.01
  }
  const seed = hay || 'default'
  const formatted = [parts.address, parts.suburb, parts.city, 'South Africa']
    .filter(Boolean)
    .join(', ')
  return {
    lat: hit.lat + jitter(seed),
    lng: hit.lng + jitter(seed + 'lng'),
    placeId: null,
    formattedAddress: formatted || 'South Africa',
    geocodedAt: new Date().toISOString(),
    source: 'mock',
  }
}

export type GeocodeAddressInput = {
  address: string
  suburb?: string
  city?: string
  /** ISO country — defaults to ZA */
  country?: string
}

/**
 * Geocode a property address. Prefer Google when key + Maps JS Geocoder available;
 * otherwise mock from suburb/city.
 */
export async function geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeResult> {
  const query = [input.address, input.suburb, input.city, input.country ?? 'South Africa']
    .filter(Boolean)
    .join(', ')

  if (!hasGoogleMapsKey()) {
    return mockGeocode(input)
  }

  // Prefer in-browser Geocoder when Maps JS already loaded
  const g = typeof window !== 'undefined' ? window.google : undefined
  if (g?.maps?.Geocoder) {
    const geocoder = new g.maps.Geocoder()
    try {
      const { results } = await geocoder.geocode({
        address: query,
        componentRestrictions: { country: input.country ?? 'ZA' },
      })
      const top = results?.[0]
      if (top?.geometry?.location) {
        return {
          lat: top.geometry.location.lat(),
          lng: top.geometry.location.lng(),
          placeId: top.place_id ?? null,
          formattedAddress: top.formatted_address ?? query,
          geocodedAt: new Date().toISOString(),
          source: 'google',
          parts: partsFromComponents(top.address_components as Component[]),
        }
      }
    } catch {
      /* fall through to HTTP or mock */
    }
  }

  // REST Geocoding API (works before Maps JS script loads)
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('address', query)
    url.searchParams.set('components', `country:${(input.country ?? 'ZA').toUpperCase()}`)
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY)
    const res = await fetch(url.toString())
    if (res.ok) {
      const data = (await res.json()) as {
        status: string
        results?: Array<{
          place_id?: string
          formatted_address?: string
          geometry?: { location?: { lat: number; lng: number } }
          address_components?: Component[]
        }>
      }
      const top = data.results?.[0]
      if (data.status === 'OK' && top?.geometry?.location) {
        return {
          lat: top.geometry.location.lat,
          lng: top.geometry.location.lng,
          placeId: top.place_id ?? null,
          formattedAddress: top.formatted_address ?? query,
          geocodedAt: new Date().toISOString(),
          source: 'google',
          parts: partsFromComponents(top.address_components ?? []),
        }
      }
    }
  } catch {
    /* mock fallback */
  }

  return mockGeocode(input)
}
