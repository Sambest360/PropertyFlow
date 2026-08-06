import type { BuildingGrading } from '../data/infrastructure'

export type BuildingGradingInput = {
  hasBorehole: boolean
  amenities: string[]
  propertyType?: string
}

const PREMIUM_AMENITY = /pool|gym|concierge|24.?hour security|security patrol|elevator|air conditioning|fibre|backup power|generator|solar|inverter|ups/i

function hasLoadSheddingBackup(amenities: string[]): boolean {
  return amenities.some((a) => /generator|solar|inverter|ups|backup power/i.test(a))
}

function hasBoreholeSignal(hasBorehole: boolean, amenities: string[]): boolean {
  return hasBorehole || amenities.some((a) => /borehole/i.test(a))
}

function premiumAmenityCount(amenities: string[]): number {
  return amenities.filter((a) => PREMIUM_AMENITY.test(a)).length
}

/** Derives P–C building grade from sustainability inputs and amenity mix. */
export function resolveBuildingGrading(input: BuildingGradingInput): BuildingGrading {
  const { amenities, propertyType } = input
  const borehole = hasBoreholeSignal(input.hasBorehole, amenities)
  const loadFree = hasLoadSheddingBackup(amenities)
  const premiumCount = premiumAmenityCount(amenities)

  if (propertyType === 'Vacant Land') return 'C'

  if (borehole && loadFree && premiumCount >= 2) return 'P'
  if (borehole && loadFree) return 'P'
  if (borehole && premiumCount >= 1) return 'A'
  if (loadFree && premiumCount >= 2) return 'A'
  if (borehole || loadFree || premiumCount >= 2) return 'B'

  return 'C'
}

/** Maps green-power amenities to an approximate solar kW for marketplace badges. */
export function inferSolarCapacityKw(amenities: string[]): number {
  if (amenities.some((a) => /solar panels|full solar|solar system/i.test(a))) return 10
  if (amenities.some((a) => /^solar$/i.test(a.trim()) || /solar power/i.test(a))) return 5
  if (amenities.some((a) => /generator|inverter|ups|backup power/i.test(a))) return 3
  return 0
}

export function gradingLabel(grade: BuildingGrading): string {
  if (!grade) return 'Not graded yet'
  if (grade === 'P') return 'P — Premium'
  return grade
}
