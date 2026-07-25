import type { LucideIcon } from 'lucide-react'
import {
  AirVent,
  Building2,
  Car,
  Dog,
  Droplets,
  Fence,
  FileCheck,
  Flame,
  Flower2,
  Home,
  KeyRound,
  Landmark,
  Leaf,
  WashingMachine,
  Mountain,
  ParkingCircle,
  PersonStanding,
  Shield,
  ShieldCheck,
  Sofa,
  Sparkles,
  Sun,
  Trees,
  UtensilsCrossed,
  Waves,
  Wifi,
  Wind,
  Zap,
} from 'lucide-react'
import type { PropertyAsset } from '../types/domain'

export type FeatureListingScope = 'all' | 'sale' | 'rent'
export type FeatureCategoryId =
  | 'furnishing'
  | 'connectivity'
  | 'security'
  | 'outdoor'
  | 'building'
  | 'utilities'
  | 'lifestyle'
  | 'sale'
  | 'lease'

export type PropertyFeatureDef = {
  id: string
  label: string
  /** Where this feature is relevant */
  scope: FeatureListingScope
  category: FeatureCategoryId
  /** Mutual exclusion group — only one can be selected */
  exclusiveGroup?: 'furnishing'
  icon: LucideIcon
}

export const FEATURE_CATEGORIES: Array<{ id: FeatureCategoryId; label: string }> = [
  { id: 'furnishing', label: 'Furnishing' },
  { id: 'lease', label: 'Lease terms' },
  { id: 'sale', label: 'Sale details' },
  { id: 'connectivity', label: 'Connectivity' },
  { id: 'security', label: 'Security' },
  { id: 'utilities', label: 'Power & water' },
  { id: 'outdoor', label: 'Outdoor & views' },
  { id: 'building', label: 'Building & parking' },
  { id: 'lifestyle', label: 'Lifestyle' },
]

/**
 * Canonical SA property features. Labels are the stored amenity strings.
 * Keep BrowseFilters / seed data aligned with these labels.
 */
export const PROPERTY_FEATURES: PropertyFeatureDef[] = [
  // Rent — furnishing (exclusive)
  {
    id: 'furnished',
    label: 'Furnished',
    scope: 'rent',
    category: 'furnishing',
    exclusiveGroup: 'furnishing',
    icon: Sofa,
  },
  {
    id: 'semi-furnished',
    label: 'Semi-furnished',
    scope: 'rent',
    category: 'furnishing',
    exclusiveGroup: 'furnishing',
    icon: Home,
  },
  {
    id: 'unfurnished',
    label: 'Unfurnished',
    scope: 'rent',
    category: 'furnishing',
    exclusiveGroup: 'furnishing',
    icon: Sparkles,
  },

  // Rent — lease
  { id: 'bills-included', label: 'Bills included', scope: 'rent', category: 'lease', icon: FileCheck },
  { id: 'wifi-included', label: 'WiFi included', scope: 'rent', category: 'lease', icon: Wifi },
  { id: 'month-to-month', label: 'Month-to-month', scope: 'rent', category: 'lease', icon: KeyRound },
  { id: 'pets-negotiable', label: 'Pets negotiable', scope: 'rent', category: 'lease', icon: Dog },

  // Sale-specific
  { id: 'vacant-possession', label: 'Vacant possession', scope: 'sale', category: 'sale', icon: KeyRound },
  { id: 'sectional-title', label: 'Sectional title', scope: 'sale', category: 'sale', icon: Building2 },
  { id: 'freehold', label: 'Freehold', scope: 'sale', category: 'sale', icon: Landmark },
  { id: 'bondable', label: 'Bondable', scope: 'sale', category: 'sale', icon: FileCheck },
  { id: 'investment', label: 'Investment ready', scope: 'sale', category: 'sale', icon: Sparkles },

  // Shared — connectivity
  { id: 'fibre', label: 'Fibre', scope: 'all', category: 'connectivity', icon: Wifi },
  { id: 'wifi', label: 'WiFi', scope: 'all', category: 'connectivity', icon: Wifi },

  // Shared — security
  { id: 'security-estate', label: 'Security Estate', scope: 'all', category: 'security', icon: ShieldCheck },
  { id: '24h-security', label: '24h Security', scope: 'all', category: 'security', icon: Shield },
  { id: 'alarm', label: 'Alarm system', scope: 'all', category: 'security', icon: Shield },
  { id: 'electric-fence', label: 'Electric fence', scope: 'all', category: 'security', icon: Fence },

  // Shared — utilities
  { id: 'generator', label: 'Generator', scope: 'all', category: 'utilities', icon: Zap },
  { id: 'solar', label: 'Solar', scope: 'all', category: 'utilities', icon: Sun },
  { id: 'inverter', label: 'Inverter / UPS', scope: 'all', category: 'utilities', icon: Zap },
  { id: 'borehole', label: 'Borehole', scope: 'all', category: 'utilities', icon: Droplets },
  {
    id: 'prepaid-electricity',
    label: 'Prepaid electricity',
    scope: 'all',
    category: 'utilities',
    icon: Zap,
  },

  // Shared — outdoor
  { id: 'pool', label: 'Pool', scope: 'all', category: 'outdoor', icon: Waves },
  { id: 'garden', label: 'Garden', scope: 'all', category: 'outdoor', icon: Trees },
  { id: 'balcony', label: 'Balcony', scope: 'all', category: 'outdoor', icon: Flower2 },
  { id: 'braai', label: 'Braai area', scope: 'all', category: 'outdoor', icon: Flame },
  { id: 'sea-view', label: 'Sea View', scope: 'all', category: 'outdoor', icon: Mountain },
  { id: 'mountain-view', label: 'Mountain view', scope: 'all', category: 'outdoor', icon: Mountain },

  // Shared — building
  { id: 'parking-bay', label: 'Parking Bay', scope: 'all', category: 'building', icon: ParkingCircle },
  { id: 'parking', label: 'Parking', scope: 'all', category: 'building', icon: Car },
  { id: 'garage', label: 'Garage', scope: 'all', category: 'building', icon: Car },
  { id: 'lift', label: 'Lift access', scope: 'all', category: 'building', icon: Building2 },
  {
    id: 'wheelchair',
    label: 'Wheelchair access',
    scope: 'all',
    category: 'building',
    icon: PersonStanding,
  },

  // Shared — lifestyle
  { id: 'gym', label: 'Gym', scope: 'all', category: 'lifestyle', icon: Wind },
  { id: 'pet-friendly', label: 'Pet Friendly', scope: 'all', category: 'lifestyle', icon: Dog },
  { id: 'clubhouse', label: 'Clubhouse', scope: 'all', category: 'lifestyle', icon: Home },
  { id: 'concierge', label: 'Concierge', scope: 'all', category: 'lifestyle', icon: Sparkles },
  { id: 'laundry', label: 'Laundry', scope: 'all', category: 'lifestyle', icon: WashingMachine },
  { id: 'air-con', label: 'Air conditioning', scope: 'all', category: 'lifestyle', icon: AirVent },
  { id: 'bic', label: 'Built-in cupboards', scope: 'all', category: 'lifestyle', icon: Home },
  { id: 'kitchen', label: 'Fitted kitchen', scope: 'all', category: 'lifestyle', icon: UtensilsCrossed },
  { id: 'boardroom', label: 'Boardroom', scope: 'all', category: 'lifestyle', icon: Building2 },
  { id: 'staff-quarters', label: 'Staff quarters', scope: 'all', category: 'lifestyle', icon: Home },
  { id: 'irrigation', label: 'Irrigation', scope: 'all', category: 'outdoor', icon: Leaf },
]

export type ListingMode = PropertyAsset['listingMode']

export function featureAppliesToMode(feature: PropertyFeatureDef, mode: ListingMode): boolean {
  if (feature.scope === 'all') return true
  if (feature.scope === 'sale') return mode === 'sale' || mode === 'both'
  if (feature.scope === 'rent') return mode === 'rent' || mode === 'both'
  return true
}

export function featuresForMode(mode: ListingMode): PropertyFeatureDef[] {
  return PROPERTY_FEATURES.filter((f) => featureAppliesToMode(f, mode))
}

export function featureByLabel(label: string): PropertyFeatureDef | undefined {
  const needle = label.trim().toLowerCase()
  return PROPERTY_FEATURES.find((f) => f.label.toLowerCase() === needle)
}

/** Options list for browse filters (unique labels, prefer shared + popular). */
export const AMENITY_FILTER_OPTIONS: string[] = [
  'Pool',
  'Garden',
  'Fibre',
  'Pet Friendly',
  'Security Estate',
  '24h Security',
  'Gym',
  'Parking Bay',
  'Furnished',
  'Unfurnished',
  'Semi-furnished',
  'Balcony',
  'Sea View',
  'Generator',
  'Solar',
  'Borehole',
  'WiFi',
  'Laundry',
  'Air conditioning',
]

export function togglePropertyFeature(
  selected: string[],
  label: string,
  mode: ListingMode,
): string[] {
  const catalog = featuresForMode(mode)
  const def = catalog.find((f) => f.label === label) ?? featureByLabel(label)

  if (selected.includes(label)) {
    return selected.filter((x) => x !== label)
  }

  let next = [...selected, label]
  if (def?.exclusiveGroup) {
    const rivals = PROPERTY_FEATURES.filter(
      (f) => f.exclusiveGroup === def.exclusiveGroup && f.label !== label,
    ).map((f) => f.label)
    next = next.filter((x) => !rivals.includes(x))
  }
  return next
}

/** Drop features that no longer apply when listing mode changes. */
export function pruneAmenitiesForMode(amenities: string[], mode: ListingMode): string[] {
  const allowed = new Set(featuresForMode(mode).map((f) => f.label))
  return amenities.filter((a) => {
    const def = featureByLabel(a)
    if (!def) return true
    return allowed.has(def.label)
  })
}

export function groupFeaturesForDisplay(amenities: string[]): Array<{
  category: FeatureCategoryId | 'other'
  categoryLabel: string
  items: Array<{ label: string; icon: LucideIcon }>
}> {
  const byCat = new Map<string, Array<{ label: string; icon: LucideIcon }>>()

  for (const label of amenities) {
    const def = featureByLabel(label)
    const cat = def?.category ?? 'other'
    const list = byCat.get(cat) ?? []
    list.push({ label: def?.label ?? label, icon: def?.icon ?? Sparkles })
    byCat.set(cat, list)
  }

  const order: Array<FeatureCategoryId | 'other'> = [
    'furnishing',
    'lease',
    'sale',
    'connectivity',
    'security',
    'utilities',
    'outdoor',
    'building',
    'lifestyle',
    'other',
  ]

  return order
    .filter((id) => (byCat.get(id)?.length ?? 0) > 0)
    .map((id) => ({
      category: id,
      categoryLabel:
        id === 'other' ? 'Other' : (FEATURE_CATEGORIES.find((c) => c.id === id)?.label ?? id),
      items: byCat.get(id)!,
    }))
}
