import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./listingResolve.js', () => ({
  resolveLiveListing: vi.fn(async () => ({
    unitId: 'unit-1',
    clientId: 'client-1',
  })),
}))

vi.mock('./entityMap.js', () => ({
  ensureUuid: vi.fn(async (_t: string, feId: string) => `uuid-${feId}`),
  resolveUuid: vi.fn(async (_t: string, feId: string) => `uuid-${feId}`),
}))

describe('submitPublicListingEnquiry viewing slot', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    query.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T12:00:00+02:00'))
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units WHERE')) {
        return [
          {
            id: 'unit-1',
            client_id: 'client-1',
            agent_id: null,
            status_config_key: 'AVAILABLE',
            price: null,
            rent: '10000',
          },
        ]
      }
      if (sql.includes('FROM viewing_slots') && sql.includes('FOR UPDATE')) {
        return [
          {
            slot_date: '2026-07-12',
            slot_time: '09:30',
            capacity: 2,
            booked_count: 1,
            status: 'OPEN',
          },
        ]
      }
      if (sql.startsWith('INSERT INTO leads')) return []
      return []
    })
  })

  it('rejects a past viewing slot with slot_not_found', async () => {
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    await expect(
      submitPublicListingEnquiry({
        propertyId: 'PR-1011',
        action: 'viewing',
        firstName: 'Sam',
        lastName: 'Applicant',
        email: 'sam@example.com',
        slotId: 'VS-4',
      }),
    ).rejects.toMatchObject({ message: 'slot_not_found' })
  })
})
