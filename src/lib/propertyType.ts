/** Portfolio / wizard property type labels ↔ durable units.property_type storage. */

const LABEL_BY_SLUG: Record<string, string> = {
  house: 'House',
  apartment: 'Apartment',
  townhouse: 'Townhouse',
  commercial: 'Commercial',
  office: 'Office',
  vacant_land: 'Vacant Land',
  farm: 'Farm',
  student: 'Student Accommodation',
  student_accommodation: 'Student Accommodation',
  industrial: 'Industrial',
  other: 'Apartment',
}

/** Encode UI label for units.property_type (snake_case slug). */
export function propertyTypeToDb(label: string | null | undefined): string | null {
  const trimmed = label?.trim()
  if (!trimmed) return null
  const slug = trimmed.toLowerCase().replace(/\s+/g, '_')
  if (LABEL_BY_SLUG[slug]) return slug
  return slug
}

function labelFromSlug(slug: string): string {
  if (LABEL_BY_SLUG[slug]) return LABEL_BY_SLUG[slug]
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Legacy bootstrap heuristic when property_type was never persisted. */
export function derivePropertyTypeFromBedrooms(bedrooms: number): string {
  if (bedrooms === 0) return 'Office'
  return bedrooms >= 3 ? 'House' : 'Apartment'
}

/** Resolve card / portfolio type from stored slug or bedroom fallback. */
export function resolvePropertyType(input: {
  stored?: string | null
  bedrooms?: number | null
}): string {
  const stored = input.stored?.trim()
  if (stored) return labelFromSlug(stored.toLowerCase())
  return derivePropertyTypeFromBedrooms(input.bedrooms ?? 0)
}
