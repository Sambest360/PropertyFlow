import { DEFAULT_RENTAL_JOURNEY, DEFAULT_RENTAL_JOURNEY_STEPS } from './defaultRentalJourney.js'
import type { AgencyJourneyOverride, JourneyStep, ResolvedJourney } from './types.js'

function stepOrder(steps: JourneyStep[], key: string, fallback: number): number {
  const idx = steps.findIndex((s) => s.key === key)
  return idx >= 0 ? idx : fallback
}

/**
 * Merge agency overrides onto the SA default. Locked steps stay enabled/required.
 */
export function resolveJourney(
  base: ResolvedJourney = DEFAULT_RENTAL_JOURNEY,
  override?: AgencyJourneyOverride | null,
): ResolvedJourney {
  if (!override?.steps?.length) return base

  const byKey = new Map(base.steps.map((s) => [s.key, { ...s }]))
  for (const patch of override.steps) {
    const row = byKey.get(patch.key)
    if (!row) continue
    if (patch.label?.trim()) row.label = patch.label.trim()
    if (!row.locked) {
      if (patch.enabled !== undefined) row.enabled = patch.enabled
      if (patch.required !== undefined) row.required = patch.required
    }
  }

  let steps = [...byKey.values()]
  if (override.steps.some((p) => p.order !== undefined)) {
    steps.sort((a, b) => {
      const oa = override.steps!.find((p) => p.key === a.key)?.order
      const ob = override.steps!.find((p) => p.key === b.key)?.order
      const fa = oa ?? stepOrder(base.steps, a.key, 999)
      const fb = ob ?? stepOrder(base.steps, b.key, 999)
      return fa - fb
    })
  }

  for (const s of steps) {
    if (s.locked) {
      s.enabled = true
      s.required = true
    }
  }

  return {
    version: override.version ?? base.version,
    templateId: base.templateId,
    steps,
  }
}

export function defaultRentalJourneyForAgency(
  agencySettings?: { applicationJourney?: AgencyJourneyOverride | null },
): ResolvedJourney {
  return resolveJourney(DEFAULT_RENTAL_JOURNEY, agencySettings?.applicationJourney ?? null)
}

export { DEFAULT_RENTAL_JOURNEY_STEPS }
