/**
 * Letkaya-branded Google Maps styles.
 * Soft canvas, muted POI/landscape, primary-tinted water — no purple glow.
 * Typed loosely so this module loads without requiring @types/google.maps at build time.
 */
export const PROPERTYFLOW_GOOGLE_MAP_STYLES: Array<{
  featureType?: string
  elementType?: string
  stylers: Array<Record<string, string | number | boolean>>
}> = [
  { elementType: 'geometry', stylers: [{ color: '#f0f4fb' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#0f2744' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f0f4fb' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#c5d6eb' }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#e4ecf6' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#dce8f4' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5a6f88' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#d5e3f2' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#dceaf8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#b8cfe6' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#a8c8e8' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#0B63C8' }],
  },
]
