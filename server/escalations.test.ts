import { describe, expect, it } from 'vitest'
import { DEFAULT_ESCALATION_SETTINGS as S, addMonthsIso, maintenanceLevel, nextAnniversary, readEscalationSettings } from './escalations.js'

const H = 3600_000

describe('maintenanceLevel', () => {
  const t = (priority: string, hours: number, contractorAssigned = false, status = 'OPEN') =>
    maintenanceLevel({ priority, status, contractorAssigned, ageMs: hours * H }, S)

  it('stays quiet inside the response time', () => {
    expect(t('EMERGENCY', 1).level).toBe(0)
  })
  it('escalates an unanswered emergency after 2h, 4h, then past the fix time', () => {
    expect(t('EMERGENCY', 2).level).toBe(1)
    expect(t('EMERGENCY', 4).level).toBe(2)
    expect(t('EMERGENCY', 24, true, 'IN_PROGRESS').level).toBe(2)
    expect(t('EMERGENCY', 48, true, 'IN_PROGRESS').level).toBe(3)
  })
  it('does not flag a slow response once a contractor is on it', () => {
    expect(t('MEDIUM', 100, true, 'IN_PROGRESS').level).toBe(0)
  })
})

describe('rent dates', () => {
  it('adds months without spilling into the next month', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsIso('2025-03-01', 12)).toBe('2026-03-01')
  })
  it('finds the next anniversary after today', () => {
    expect(nextAnniversary('2024-11-01', '2026-10-29')).toBe('2026-11-01')
    expect(nextAnniversary('2024-03-15', '2026-10-29')).toBe('2027-03-15')
  })
})

describe('readEscalationSettings', () => {
  it('clamps bad values back to the defaults', () => {
    const s = readEscalationSettings({ escalation: { responseHours: { EMERGENCY: -5 }, rentNoticeDays: 30, defaultRentEscalationPct: 8 } })
    expect(s.responseHours.EMERGENCY).toBe(2)
    expect(s.rentNoticeDays).toBe(30)
    expect(s.defaultRentEscalationPct).toBe(8)
  })
})
