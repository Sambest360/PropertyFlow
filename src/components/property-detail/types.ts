export const PROPERTY_DETAIL_TABS = [
  'overview',
  'map',
  'floorplan',
  'inventory',
  'applicants',
  'viewings',
  'maintenance',
  'payments',
  'documents',
  'messages',
  'history',
] as const

export type PropertyDetailTab = (typeof PROPERTY_DETAIL_TABS)[number]

export function isPropertyDetailTab(v: string | null): v is PropertyDetailTab {
  return !!v && (PROPERTY_DETAIL_TABS as readonly string[]).includes(v)
}

export function canEditPropertyListing(status: string) {
  return status !== 'Sold' && status !== 'Archived'
}

export const ICON_STROKE = 1.6
