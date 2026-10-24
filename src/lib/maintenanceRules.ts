/**
 * Maintenance responsibility rules (migration 029): who fixes what.
 *
 * The seed below is the platform default per property type, mirrored row for
 * row by database/postgres/migrations/029_maintenance_rule_sets.sql (a test
 * pins the two together). The server resolves a ticket's category against the
 * unit's rule set, then the agency default for the property type, then the
 * platform template, then this seed. Shared by the server (validation,
 * routing) and the tenant form (offline fallback for the picker).
 *
 * Every template is a default only: check it against the lease and, for
 * sectional title, the body corporate conduct rules.
 */

export const RESPONSIBLE_PARTIES = ['LANDLORD', 'TENANT', 'BODY_CORPORATE', 'SHARED'] as const
export type ResponsibleParty = (typeof RESPONSIBLE_PARTIES)[number]

export const RULE_PROPERTY_TYPES = ['house', 'apartment', 'townhouse', 'room'] as const
export type RulePropertyType = (typeof RULE_PROPERTY_TYPES)[number]

export const RULE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY'] as const
export type RulePriority = (typeof RULE_PRIORITIES)[number]

/** Room groups for the tenant picker, in display order. */
export const RULE_ROOM_GROUPS = [
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'living', label: 'Living areas & bedrooms' },
  { key: 'electrical', label: 'Electrics' },
  { key: 'plumbing', label: 'Plumbing' },
  { key: 'exterior', label: 'Roof, walls & structure' },
  { key: 'outside', label: 'Garden & outside' },
  { key: 'common', label: 'Complex & common property' },
  { key: 'general', label: 'Something else' },
] as const
export type RuleRoomGroup = (typeof RULE_ROOM_GROUPS)[number]['key']

export const SEED_TEMPLATE_LABEL = 'Default, check against lease and conduct rules'

/** Always loggable, on every unit, whatever the rule set says. */
export const EMERGENCY_CATEGORY = 'EMERGENCY'
export const OTHER_CATEGORY = 'OTHER'
export const ALWAYS_ON_CATEGORIES: ReadonlySet<string> = new Set([EMERGENCY_CATEGORY, OTHER_CATEGORY])

export type RuleItem = {
  categoryKey: string
  label: string
  roomGroup: RuleRoomGroup
  responsibleParty: ResponsibleParty
  guidanceText: string
  clauseRef: string | null
  tenantCanLog: boolean
  defaultPriority: RulePriority
  /** Category used for vendor_category_routes (PLUMBING, ELECTRICAL…). */
  vendorCategoryKey: string | null
  isSafety: boolean
}

type SeedItem = RuleItem & { propertyTypes: readonly RulePropertyType[] }

const ALL: readonly RulePropertyType[] = RULE_PROPERTY_TYPES
const FREEHOLD: readonly RulePropertyType[] = ['house', 'room']
const SECTIONAL: readonly RulePropertyType[] = ['apartment', 'townhouse']

const item = (
  propertyTypes: readonly RulePropertyType[],
  v: Omit<RuleItem, 'clauseRef' | 'tenantCanLog' | 'isSafety' | 'vendorCategoryKey'> &
    Partial<Pick<RuleItem, 'clauseRef' | 'tenantCanLog' | 'isSafety' | 'vendorCategoryKey'>>,
): SeedItem => ({
  clauseRef: null,
  tenantCanLog: true,
  isSafety: false,
  vendorCategoryKey: null,
  ...v,
  propertyTypes,
})

const LANDLORD_FIXES = 'Your landlord fixes this. The agency will arrange a contractor.'
const TENANT_FIXES =
  'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.'
const COMMON_PROPERTY =
  'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.'

export const SEED_RULE_ITEMS: readonly SeedItem[] = [
  // Landlord: structure, roof, geyser, plumbing, electrics.
  item(FREEHOLD, {
    categoryKey: 'ROOF_LEAK',
    label: 'Roof leak',
    roomGroup: 'exterior',
    responsibleParty: 'LANDLORD',
    guidanceText: LANDLORD_FIXES,
    defaultPriority: 'HIGH',
    vendorCategoryKey: 'STRUCTURAL',
    isSafety: false,
  }),
  item(ALL, {
    categoryKey: 'GEYSER_BURST',
    label: 'Geyser burst or leaking',
    roomGroup: 'bathroom',
    responsibleParty: 'LANDLORD',
    guidanceText: `${LANDLORD_FIXES} Switch the geyser off at the board and close the water inlet if you can.`,
    defaultPriority: 'URGENT',
    vendorCategoryKey: 'PLUMBING',
    isSafety: true,
  }),
  item(ALL, {
    categoryKey: 'ELECTRICAL_FAULT',
    label: 'Electrical fault (plugs, wiring, DB board tripping)',
    roomGroup: 'electrical',
    responsibleParty: 'LANDLORD',
    guidanceText: `${LANDLORD_FIXES} Do not touch exposed wiring.`,
    defaultPriority: 'HIGH',
    vendorCategoryKey: 'ELECTRICAL',
    isSafety: true,
  }),
  item(ALL, {
    categoryKey: 'STRUCTURAL_CRACKS',
    label: 'Structural cracks in walls or ceilings',
    roomGroup: 'exterior',
    responsibleParty: 'LANDLORD',
    guidanceText: LANDLORD_FIXES,
    defaultPriority: 'MEDIUM',
    vendorCategoryKey: 'STRUCTURAL',
  }),
  item(ALL, {
    categoryKey: 'PLUMBING_PIPES',
    label: 'Leaking or burst pipes, taps, toilet cistern',
    roomGroup: 'plumbing',
    responsibleParty: 'LANDLORD',
    guidanceText: LANDLORD_FIXES,
    defaultPriority: 'HIGH',
    vendorCategoryKey: 'PLUMBING',
  }),
  item(ALL, {
    categoryKey: 'APPLIANCE_FAILURE',
    label: 'Stove, oven or other appliance supplied with the home',
    roomGroup: 'kitchen',
    responsibleParty: 'LANDLORD',
    guidanceText: LANDLORD_FIXES,
    defaultPriority: 'MEDIUM',
    vendorCategoryKey: 'APPLIANCE_FAILURE',
  }),
  // Tenant: damage beyond wear and tear, small lease-assigned items.
  item(ALL, {
    categoryKey: 'BROKEN_WINDOW_TENANT',
    label: 'Window broken by me or a visitor',
    roomGroup: 'living',
    responsibleParty: 'TENANT',
    guidanceText: TENANT_FIXES,
    defaultPriority: 'MEDIUM',
  }),
  item(ALL, {
    categoryKey: 'DRAIN_BLOCKED_MISUSE',
    label: 'Drain or toilet blocked (wipes, fat, hair)',
    roomGroup: 'bathroom',
    responsibleParty: 'TENANT',
    guidanceText: TENANT_FIXES,
    defaultPriority: 'MEDIUM',
    vendorCategoryKey: 'PLUMBING',
  }),
  item(ALL, {
    categoryKey: 'LIGHT_BULBS',
    label: 'Light bulbs',
    roomGroup: 'living',
    responsibleParty: 'TENANT',
    guidanceText: TENANT_FIXES,
    defaultPriority: 'LOW',
  }),
  item(['house', 'townhouse'], {
    categoryKey: 'GARDEN',
    label: 'Garden upkeep',
    roomGroup: 'outside',
    responsibleParty: 'TENANT',
    guidanceText: TENANT_FIXES,
    defaultPriority: 'LOW',
  }),
  // Body corporate: sectional title common property (STSMA).
  item(['apartment'], {
    categoryKey: 'LIFT',
    label: 'Lift broken',
    roomGroup: 'common',
    responsibleParty: 'BODY_CORPORATE',
    guidanceText: COMMON_PROPERTY,
    defaultPriority: 'HIGH',
  }),
  item(SECTIONAL, {
    categoryKey: 'COMMON_PASSAGE_LIGHTS',
    label: 'Passage or stairwell lights',
    roomGroup: 'common',
    responsibleParty: 'BODY_CORPORATE',
    guidanceText: COMMON_PROPERTY,
    defaultPriority: 'MEDIUM',
  }),
  item(SECTIONAL, {
    categoryKey: 'PERIMETER_WALL',
    label: 'Perimeter wall or electric fence',
    roomGroup: 'common',
    responsibleParty: 'BODY_CORPORATE',
    guidanceText: COMMON_PROPERTY,
    defaultPriority: 'HIGH',
    isSafety: true,
  }),
  item(SECTIONAL, {
    categoryKey: 'POOL',
    label: 'Complex pool',
    roomGroup: 'common',
    responsibleParty: 'BODY_CORPORATE',
    guidanceText: COMMON_PROPERTY,
    defaultPriority: 'LOW',
  }),
  item(SECTIONAL, {
    categoryKey: 'COMPLEX_GATE_MOTOR',
    label: 'Complex gate or gate motor',
    roomGroup: 'common',
    responsibleParty: 'BODY_CORPORATE',
    guidanceText: COMMON_PROPERTY,
    defaultPriority: 'HIGH',
    isSafety: true,
  }),
  item(SECTIONAL, {
    categoryKey: 'SECTIONAL_TITLE_ROOF',
    label: 'Roof leak (complex roof)',
    roomGroup: 'common',
    responsibleParty: 'BODY_CORPORATE',
    guidanceText: COMMON_PROPERTY,
    defaultPriority: 'HIGH',
  }),
]

/** The seed rule items for one property type (room = student accommodation too). */
export function seedRuleItems(propertyType: RulePropertyType): RuleItem[] {
  return SEED_RULE_ITEMS.filter((i) => i.propertyTypes.includes(propertyType)).map(
    ({ propertyTypes: _omit, ...rest }) => rest,
  )
}

/**
 * units.property_type slug -> rule template type. student / student_accommodation
 * map to room; anything else unknown (or NULL) uses the house template, the
 * freehold default where the landlord carries the most.
 */
export function rulePropertyType(slug: string | null | undefined): RulePropertyType {
  const s = String(slug ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  if (s === 'apartment' || s === 'flat') return 'apartment'
  if (s === 'townhouse') return 'townhouse'
  if (s === 'room' || s === 'student' || s === 'student_accommodation') return 'room'
  return 'house'
}

/**
 * Older clients sent a handful of broad keys; they still log, against the
 * closest rule (GENERAL becomes OTHER).
 */
export const LEGACY_CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  GENERAL: OTHER_CATEGORY,
  PLUMBING: 'PLUMBING_PIPES',
  ELECTRICAL: 'ELECTRICAL_FAULT',
  STRUCTURAL: 'STRUCTURAL_CRACKS',
  APPLIANCE: 'APPLIANCE_FAILURE',
  APPLIANCE_FAULT: 'APPLIANCE_FAILURE',
}

/** Upper-cased, aliased category key; null / blank is OTHER. */
export function normalizeCategoryKey(raw: unknown): string {
  const k = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  if (!k) return OTHER_CATEGORY
  return LEGACY_CATEGORY_ALIASES[k] ?? k
}

/**
 * Hazards that make any ticket a safety ticket (never blocked, flagged for
 * the agent). Matched on the tenant's own words for EMERGENCY / OTHER.
 */
export const SAFETY_HAZARDS: ReadonlyArray<{ key: string; pattern: RegExp }> = [
  { key: 'gas', pattern: /\bgas\b|lpg|smell of gas/i },
  { key: 'electrical', pattern: /electric|sparks?|shock|exposed wir|burning smell|db board|short circuit/i },
  { key: 'flooding', pattern: /flood|burst|water everywhere|geyser/i },
  { key: 'security', pattern: /security|break[- ]?in|burglar|gate (won'?t|not)|lock(ed)? out|broken lock|alarm/i },
  { key: 'sewage', pattern: /sewage|sewer|septic/i },
  { key: 'structural', pattern: /structural|collaps|ceiling (fell|falling)|wall crack|subsiden/i },
]

export function safetyHazardsIn(text: string): string[] {
  return SAFETY_HAZARDS.filter((h) => h.pattern.test(text)).map((h) => h.key)
}

const PRIORITY_RANK: Readonly<Record<string, number>> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3, EMERGENCY: 4 }

/** The more severe of two priorities (API form). Unknown values rank lowest. */
export function maxPriority(a: string | null | undefined, b: string | null | undefined): RulePriority {
  const A = String(a ?? '').toUpperCase()
  const B = String(b ?? '').toUpperCase()
  const ra = PRIORITY_RANK[A] ?? -1
  const rb = PRIORITY_RANK[B] ?? -1
  const hit = ra >= rb ? A : B
  return (PRIORITY_RANK[hit] != null ? hit : 'MEDIUM') as RulePriority
}

/** Tenant-facing heading for the guidance card. */
export function guidanceHeading(party: ResponsibleParty | null, clauseRef?: string | null): string {
  switch (party) {
    case 'LANDLORD':
      return 'Your landlord fixes this'
    case 'TENANT':
      return clauseRef ? `Your responsibility under clause ${clauseRef}` : 'Your responsibility under the lease'
    case 'BODY_CORPORATE':
      return 'Common property'
    case 'SHARED':
      return 'Shared responsibility'
    default:
      return 'Your agency will check who fixes this'
  }
}

export const RESPONSIBLE_PARTY_LABEL: Readonly<Record<ResponsibleParty, string>> = {
  LANDLORD: 'Landlord',
  TENANT: 'Tenant',
  BODY_CORPORATE: 'Body corporate',
  SHARED: 'Shared',
}

export function isResponsibleParty(v: unknown): v is ResponsibleParty {
  return typeof v === 'string' && (RESPONSIBLE_PARTIES as readonly string[]).includes(v)
}

/** Category shown to a tenant in the picker (GET /api/units/:id/maintenance-categories). */
export type TenantCategoryOption = {
  categoryKey: string
  label: string
  roomGroup: RuleRoomGroup
  responsibleParty: ResponsibleParty | null
  guidanceText: string
  clauseRef: string | null
  defaultPriority: RulePriority
  /** TENANT-responsible: the tenant must acknowledge they may be charged. */
  needsCostNotice: boolean
  ruleItemId: string | null
}

export const ALWAYS_ON_OPTIONS: readonly TenantCategoryOption[] = [
  {
    categoryKey: EMERGENCY_CATEGORY,
    label: 'Emergency (gas, flooding, sparks, break-in, sewage, collapse)',
    roomGroup: 'general',
    responsibleParty: null,
    guidanceText: 'Always logged straight away. Call the after-hours number as well if anyone is in danger.',
    clauseRef: null,
    defaultPriority: 'EMERGENCY',
    needsCostNotice: false,
    ruleItemId: null,
  },
  {
    categoryKey: OTHER_CATEGORY,
    label: 'Something else',
    roomGroup: 'general',
    responsibleParty: null,
    guidanceText: 'Describe the problem; your agency will check who fixes it.',
    clauseRef: null,
    defaultPriority: 'MEDIUM',
    needsCostNotice: false,
    ruleItemId: null,
  },
]

/** Picker options from rule items: loggable ones, then Emergency / Other. */
export function tenantCategoryOptions(items: ReadonlyArray<RuleItem & { id?: string | null }>): TenantCategoryOption[] {
  const loggable = items
    .filter((i) => i.tenantCanLog && !ALWAYS_ON_CATEGORIES.has(i.categoryKey))
    .map((i) => ({
      categoryKey: i.categoryKey,
      label: i.label,
      roomGroup: i.roomGroup,
      responsibleParty: i.responsibleParty,
      guidanceText: i.guidanceText,
      clauseRef: i.clauseRef,
      defaultPriority: i.defaultPriority,
      needsCostNotice: i.responsibleParty === 'TENANT',
      ruleItemId: i.id ?? null,
    }))
  return [...loggable, ...ALWAYS_ON_OPTIONS]
}
