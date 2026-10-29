import { describe, expect, it } from 'vitest'
import { dedupePropertyEvents } from './dedupeEvents'
import type { PropertyEvent } from '../../types/domain'

const ev = (id: string, at: string, to = 'Published'): PropertyEvent => ({
  id,
  agencyId: 'ag',
  propertyId: 'p1',
  actorUserId: null,
  actorName: 'System',
  action: 'changed the Status',
  at,
  changes: [{ field: 'Status', from: 'Draft', to }],
})

describe('dedupePropertyEvents', () => {
  it('collapses the same change written twice', () => {
    const out = dedupePropertyEvents([ev('a', '2026-10-26T18:26:00Z'), ev('b', '2026-10-26T18:26:01Z')])
    expect(out.map((e) => e.id)).toEqual(['a'])
  })
  it('keeps the same change made again later, and different changes', () => {
    const out = dedupePropertyEvents([
      ev('a', '2026-10-26T18:26:00Z'),
      ev('b', '2026-10-27T09:00:00Z'),
      ev('c', '2026-10-26T18:26:00Z', 'Draft'),
    ])
    expect(out).toHaveLength(3)
  })
})
