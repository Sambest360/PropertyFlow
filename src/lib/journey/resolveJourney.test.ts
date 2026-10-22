import { describe, expect, it } from 'vitest'
import { DEFAULT_RENTAL_JOURNEY } from './defaultRentalJourney'
import { resolveJourney } from './resolveJourney'

describe('resolveJourney', () => {
  it('keeps locked steps enabled when agency tries to disable', () => {
    const resolved = resolveJourney(DEFAULT_RENTAL_JOURNEY, {
      steps: [{ key: 'credit_consent', enabled: false, required: false }],
    })
    const consent = resolved.steps.find((s) => s.key === 'credit_consent')
    expect(consent?.enabled).toBe(true)
    expect(consent?.required).toBe(true)
  })

  it('allows renaming non-locked steps', () => {
    const resolved = resolveJourney(DEFAULT_RENTAL_JOURNEY, {
      steps: [{ key: 'documents', label: 'Paperwork' }],
    })
    expect(resolved.steps.find((s) => s.key === 'documents')?.label).toBe('Paperwork')
  })
})
