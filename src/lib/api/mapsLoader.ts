/**
 * Google Maps JS loader helpers.
 *
 * The Vite SPA has no Maps backend — when `VITE_GOOGLE_MAPS_API_KEY` is set,
 * the browser loads Maps JS (+ optional libraries) directly from Google.
 * When absent, callers should fall back to Leaflet / address-only UI.
 */

export const GOOGLE_MAPS_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) || ''

export function hasGoogleMapsKey(): boolean {
  return Boolean(GOOGLE_MAPS_API_KEY && String(GOOGLE_MAPS_API_KEY).trim())
}

/** Libraries requested by property map flows (Geocoder is core Maps JS). */
export const GOOGLE_MAPS_LIBRARIES = ['places'] as const

export type GoogleMapsLibrary = (typeof GOOGLE_MAPS_LIBRARIES)[number]

export function mapsLoaderConfig() {
  return {
    id: 'propertyflow-google-maps',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: [...GOOGLE_MAPS_LIBRARIES] as ('places')[],
  }
}

/** Default map centre — Port Elizabeth (Gqeberha), Eastern Cape. */
export const SA_MAP_CENTER = { lat: -33.96, lng: 25.6 } as const
export const SA_MAP_DEFAULT_ZOOM = 12

/** Carto Positron-style soft canvas tiles (used when Google key is absent). */
export const LEAFLET_BASEMAP_URL =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
export const LEAFLET_BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
