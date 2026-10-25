/**
 * Guest-facing location: suburb and city only, with coordinates rounded to
 * ~1 km so the map shows the area, not the house. Street address, unit
 * number, formatted address and Google place id are never shown publicly —
 * staff pages keep using the full property.
 */
import type { PropertyAsset } from '../types/domain'

/** 2 decimal places ≈ 1.1 km north–south. */
const PUBLIC_COORD_DECIMALS = 2

export function roundPublicCoord(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0
  const f = 10 ** PUBLIC_COORD_DECIMALS
  return Math.round(value * f) / f
}

/** "Sea Point, Cape Town" — the only location text a guest sees. */
export function publicAreaLabel(p: Pick<PropertyAsset, 'suburb' | 'city'>): string {
  return [p.suburb, p.city].map((s) => s?.trim()).filter(Boolean).join(', ') || 'Location on request'
}

/** Copy of a listing safe to hand to guest UI (cards, maps, location panels). */
export function toPublicListing<T extends PropertyAsset>(p: T): T {
  return {
    ...p,
    address: publicAreaLabel(p),
    formattedAddress: null,
    placeId: null,
    lat: roundPublicCoord(p.lat),
    lng: roundPublicCoord(p.lng),
  }
}
