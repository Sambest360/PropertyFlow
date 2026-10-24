import { describe, expect, it } from 'vitest'
import { latestActivityByProperty } from './propertyActivity'

const NOW = '2026-10-24T12:00:00.000Z'

describe('latestActivityByProperty', () => {
  it('uses the property created date when nothing else happened', () => {
    const map = latestActivityByProperty({ properties: [{ id: 'p1', createdAt: '2026-10-01' }] }, NOW)
    expect(map.get('p1')).toBe('2026-10-01')
  })

  it('moves a property forward on a newer lead, application or ticket', () => {
    const map = latestActivityByProperty(
      {
        properties: [
          { id: 'old', createdAt: '2026-01-01' },
          { id: 'new', createdAt: '2026-10-20' },
        ],
        leads: [{ propertyId: 'old', createdAt: '2026-10-22', updatedAt: '2026-10-22' }],
        tickets: [{ propertyId: 'old', openedAt: '2026-10-23T08:00:00.000Z' }],
      },
      NOW,
    )
    expect(map.get('old')).toBe('2026-10-23T08:00:00.000Z')
    expect(map.get('new')).toBe('2026-10-20')
  })

  it('ignores future-dated viewings and unknown properties', () => {
    const map = latestActivityByProperty(
      {
        properties: [{ id: 'p1', createdAt: '2026-10-01' }],
        viewings: [
          { propertyId: 'p1', date: '2026-11-05' },
          { propertyId: 'ghost', date: '2026-10-10' },
        ],
      },
      NOW,
    )
    expect(map.get('p1')).toBe('2026-10-01')
    expect(map.has('ghost')).toBe(false)
  })
})
