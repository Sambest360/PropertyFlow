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
  shared_accommodation: 'Shared Accommodation',
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

/** Words in a listing's title or description that name its type, most specific first. */
const TYPE_WORDS: Array<[RegExp, string]> = [
  [/\bstudent\b/i, 'Student Accommodation'],
  [/\b(room|rooms|shared|commune|digs)\b/i, 'Shared Accommodation'],
  [/\btown ?house\b|\bcluster\b|\bsimplex\b|\bduplex\b/i, 'Townhouse'],
  [/\b(apartment|flat|penthouse|bachelor|studio)\b/i, 'Apartment'],
  [/\b(office|offices|suite)\b/i, 'Office'],
  [/\b(warehouse|factory|industrial|workshop)\b/i, 'Industrial'],
  [/\b(shop|retail|commercial|showroom)\b/i, 'Commercial'],
  [/\b(farm|smallholding|plot with)\b/i, 'Farm'],
  [/\b(vacant land|stand|erf|plot)\b/i, 'Vacant Land'],
  [/\b(house|home|cottage|bungalow|villa)\b/i, 'House'],
]

/** The type a listing's own words name, or null when they name none. */
export function propertyTypeFromText(...texts: Array<string | null | undefined>): string | null {
  for (const text of texts) {
    if (!text) continue
    for (const [re, label] of TYPE_WORDS) if (re.test(text)) return label
  }
  return null
}

/**
 * Card / portfolio type: the stored type; without one, the type the title
 * (then the description) names; only then a bedroom guess.
 */
export function resolvePropertyType(input: {
  stored?: string | null
  bedrooms?: number | null
  title?: string | null
  description?: string | null
}): string {
  const stored = input.stored?.trim()
  if (stored) return labelFromSlug(stored.toLowerCase())
  return propertyTypeFromText(input.title, input.description) ?? derivePropertyTypeFromBedrooms(input.bedrooms ?? 0)
}
