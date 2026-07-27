/** Port Elizabeth suburb centres — single source of truth for bulk seed + geocoding. */

export type PeArea = {
    suburb: string
    lat: number
    lng: number
  }
  
  export const PE_AREAS: readonly PeArea[] = [
    { suburb: 'Summerstrand', lat: -33.9923, lng: 25.6676 },
    { suburb: 'Humewood', lat: -33.978, lng: 25.6449 },
    { suburb: 'Walmer', lat: -33.9845, lng: 25.5868 },
    { suburb: 'Greenacres', lat: -33.9386, lng: 25.5535 },
    { suburb: 'Newton Park', lat: -33.9427, lng: 25.5593 },
    { suburb: 'Lorraine', lat: -33.9348, lng: 25.5037 },
    { suburb: 'Fairview', lat: -33.9159, lng: 25.4887 },
    { suburb: 'Sherwood', lat: -33.9225, lng: 25.5342 },
    { suburb: 'Algoa Park', lat: -33.9176, lng: 25.5664 },
    { suburb: 'Bethelsdorp', lat: -33.8629, lng: 25.4985 },
  ] as const
  
  export function peAreaBySuburb(suburb: string): PeArea | undefined {
    const key = suburb.trim().toLowerCase()
    return PE_AREAS.find((a) => a.suburb.toLowerCase() === key)
  }
  