import { describe, expect, it } from 'vitest'
import { propertyStatusFromUnit } from './propertyBootstrapFromUnit'

describe('propertyStatusFromUnit', () => {
  it('maps DELETED to Archived with deletedAt from unit updated_at', () => {
    const { status, deletedAt } = propertyStatusFromUnit(
      'DELETED',
      false,
      '2026-03-01T12:00:00.000Z',
    )
    expect(status).toBe('Archived')
    expect(deletedAt).toBe('2026-03-01T12:00:00.000Z')
  })

  it('maps published keys without deletedAt', () => {
    expect(propertyStatusFromUnit('PUBLISHED', false).deletedAt).toBeNull()
    expect(propertyStatusFromUnit('PUBLISHED', false).status).toBe('Published')
    expect(propertyStatusFromUnit('FEATURED', true).status).toBe('Featured')
  })
})
