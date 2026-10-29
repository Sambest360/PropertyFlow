import type { BuildingGrading } from '../data/infrastructure'

/**
 * Property grading (P / A / B / C) built from what the property offers.
 *
 * Every feature earns points in one of five categories, each with a cap so
 * one category cannot carry the grade alone. Better features earn more (a
 * borehole beats a water-saving fitting, solar beats an inverter), and the
 * more categories a property covers, the higher it grades.
 *
 *   P (Premium) ≥ 70 · A ≥ 45 · B ≥ 25 · C below
 */
export type BuildingGradingInput = {
  hasBorehole: boolean
  amenities: string[]
  propertyType?: string
  /** Optional room counts from the wizard / unit. */
  bedrooms?: number
  bathrooms?: number
  garages?: number
  parking?: number
  solarCapacityKw?: number
}

export type GradeCategory = 'power_water' | 'security' | 'comfort' | 'lifestyle' | 'space'

export type GradeItem = { category: GradeCategory; label: string; points: number }

export type GradeBreakdown = {
  grade: Exclude<BuildingGrading, null>
  score: number
  items: GradeItem[]
  byCategory: Record<GradeCategory, { points: number; max: number }>
  /** Features that would raise the grade most, best first. */
  suggestions: string[]
}

export const GRADE_CATEGORY_LABEL: Record<GradeCategory, string> = {
  power_water: 'Power & water',
  security: 'Security',
  comfort: 'Comfort',
  lifestyle: 'Lifestyle',
  space: 'Space & parking',
}

const CATEGORY_MAX: Record<GradeCategory, number> = {
  power_water: 30,
  security: 22,
  comfort: 18,
  lifestyle: 18,
  space: 12,
}

/** Feature → points. First matching rule per feature wins. */
const RULES: Array<{ match: RegExp; category: GradeCategory; points: number; label: string }> = [
  { match: /^solar$/i, category: 'power_water', points: 12, label: 'Solar power' },
  { match: /load-?shedding free/i, category: 'power_water', points: 10, label: 'Load-shedding free' },
  { match: /generator/i, category: 'power_water', points: 8, label: 'Generator' },
  { match: /inverter|ups/i, category: 'power_water', points: 6, label: 'Inverter / UPS' },
  { match: /borehole/i, category: 'power_water', points: 10, label: 'Borehole' },
  { match: /water tank|jojo/i, category: 'power_water', points: 5, label: 'Water tank' },
  { match: /prepaid electricity/i, category: 'power_water', points: 2, label: 'Prepaid electricity' },
  { match: /fibre/i, category: 'comfort', points: 5, label: 'Fibre' },
  { match: /wifi/i, category: 'comfort', points: 3, label: 'WiFi' },
  { match: /security estate|gated/i, category: 'security', points: 8, label: 'Security estate' },
  { match: /24.?hour security|security patrol|guard/i, category: 'security', points: 8, label: '24-hour security' },
  { match: /access control/i, category: 'security', points: 5, label: 'Access control' },
  { match: /electric fence/i, category: 'security', points: 4, label: 'Electric fence' },
  { match: /alarm/i, category: 'security', points: 4, label: 'Alarm system' },
  { match: /cctv/i, category: 'security', points: 4, label: 'CCTV' },
  { match: /air conditioning|aircon/i, category: 'comfort', points: 4, label: 'Air conditioning' },
  { match: /fitted kitchen/i, category: 'comfort', points: 3, label: 'Fitted kitchen' },
  { match: /built-in cupboards/i, category: 'comfort', points: 2, label: 'Built-in cupboards' },
  { match: /^furnished$/i, category: 'comfort', points: 3, label: 'Furnished' },
  { match: /semi-furnished/i, category: 'comfort', points: 2, label: 'Semi-furnished' },
  { match: /laundry/i, category: 'comfort', points: 2, label: 'Laundry' },
  { match: /lift access|elevator/i, category: 'comfort', points: 3, label: 'Lift access' },
  { match: /wheelchair/i, category: 'comfort', points: 3, label: 'Wheelchair access' },
  { match: /pool/i, category: 'lifestyle', points: 6, label: 'Pool' },
  { match: /gym/i, category: 'lifestyle', points: 5, label: 'Gym' },
  { match: /concierge/i, category: 'lifestyle', points: 5, label: 'Concierge' },
  { match: /clubhouse/i, category: 'lifestyle', points: 3, label: 'Clubhouse' },
  { match: /sea view/i, category: 'lifestyle', points: 5, label: 'Sea view' },
  { match: /mountain view/i, category: 'lifestyle', points: 3, label: 'Mountain view' },
  { match: /garden/i, category: 'lifestyle', points: 3, label: 'Garden' },
  { match: /balcony|patio/i, category: 'lifestyle', points: 2, label: 'Balcony' },
  { match: /braai/i, category: 'lifestyle', points: 2, label: 'Braai area' },
  { match: /irrigation/i, category: 'lifestyle', points: 1, label: 'Irrigation' },
  { match: /pet friendly|pets negotiable/i, category: 'lifestyle', points: 2, label: 'Pet friendly' },
  { match: /staff quarters/i, category: 'space', points: 3, label: 'Staff quarters' },
  { match: /^garage$/i, category: 'space', points: 3, label: 'Garage' },
  { match: /parking/i, category: 'space', points: 2, label: 'Parking' },
]

/** Best upgrades to suggest, in order. */
const SUGGEST = ['Solar', 'Borehole', 'Security Estate', 'Fibre', 'Pool', 'Air conditioning', 'Alarm system', 'Garden']

const GRADE_CUTS: Array<[number, 'P' | 'A' | 'B']> = [
  [70, 'P'],
  [45, 'A'],
  [25, 'B'],
]

export function gradeBreakdown(input: BuildingGradingInput): GradeBreakdown {
  const items: GradeItem[] = []
  const seen = new Set<string>()
  const add = (category: GradeCategory, label: string, points: number) => {
    if (seen.has(label) || points <= 0) return
    seen.add(label)
    items.push({ category, label, points })
  }
  for (const feature of input.amenities) {
    const rule = RULES.find((r) => r.match.test(feature.trim()))
    if (rule) add(rule.category, rule.label, rule.points)
  }
  if (input.hasBorehole) add('power_water', 'Borehole', 10)
  if ((input.solarCapacityKw ?? 0) >= 3) add('power_water', 'Solar power', 12)

  // Space: bathrooms per bedroom, extra bedrooms, covered and open parking.
  const beds = input.bedrooms ?? 0
  const baths = input.bathrooms ?? 0
  if (beds >= 3) add('space', `${beds} bedrooms`, beds >= 4 ? 4 : 3)
  if (baths >= 2) add('space', `${baths} bathrooms`, baths >= 3 ? 4 : 3)
  if ((input.garages ?? 0) > 0) add('space', 'Garage', Math.min(4, 2 * (input.garages ?? 0)))
  if ((input.parking ?? 0) > 0) add('space', 'Parking', Math.min(3, input.parking ?? 0))

  const byCategory = Object.fromEntries(
    (Object.keys(CATEGORY_MAX) as GradeCategory[]).map((c) => {
      const raw = items.filter((i) => i.category === c).reduce((n, i) => n + i.points, 0)
      return [c, { points: Math.min(raw, CATEGORY_MAX[c]), max: CATEGORY_MAX[c] }]
    }),
  ) as GradeBreakdown['byCategory']

  // Covering more categories adds a breadth bonus (up to 10).
  const covered = Object.values(byCategory).filter((c) => c.points > 0).length
  const breadth = covered >= 5 ? 10 : covered === 4 ? 6 : covered === 3 ? 3 : 0
  const base = Object.values(byCategory).reduce((n, c) => n + c.points, 0)
  const score = Math.min(100, base + breadth)

  const land = (input.propertyType ?? '').toLowerCase() === 'vacant land'
  const grade = land ? 'C' : (GRADE_CUTS.find(([cut]) => score >= cut)?.[1] ?? 'C')
  const have = new Set(items.map((i) => i.label.toLowerCase()))
  const suggestions = land
    ? []
    : SUGGEST.filter((s) => !have.has(s.toLowerCase()) && !input.amenities.some((a) => a.toLowerCase() === s.toLowerCase())).slice(0, 3)

  return { grade, score, items, byCategory, suggestions }
}

/** P–C grade from what the property offers. */
export function resolveBuildingGrading(input: BuildingGradingInput): BuildingGrading {
  return gradeBreakdown(input).grade
}

export function gradingLabel(grade: BuildingGrading): string {
  if (!grade) return 'Not graded yet'
  if (grade === 'P') return 'P — Premium'
  return grade
}
