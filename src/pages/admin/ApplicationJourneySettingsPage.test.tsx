import { describe, expect, it } from 'vitest'
import { resolveJourney } from '../../lib/journey/resolveJourney'
import { DEFAULT_RENTAL_JOURNEY } from '../../lib/journey/defaultRentalJourney'

describe('ApplicationJourneySettingsPage (resolve)', () => {
  it('reset override yields default step count', () => {
    const resolved = resolveJourney(DEFAULT_RENTAL_JOURNEY, null)
    expect(resolved.steps.length).toBeGreaterThanOrEqual(15)
  })
})
