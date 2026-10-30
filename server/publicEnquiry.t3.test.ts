import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T3 (spec r4/r5): the server answer is the only save of a public enquiry.
 * A repeat email/phone + unit says so (duplicate: true). F4 (Michael): it
 * never gives back the existing lead's reference (nor its raw uuid), because
 * whoever typed the email or phone may not be the person who registered.
 * A fresh save returns its own front-end reference (LD-…), never a uuid.
 */
const query = vi.hoisted(() => vi.fn())
const dupRow = vi.hoisted(() => ({ current: null as { id: string } | null }))

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./listingResolve.js', () => ({
  resolveLiveListing: vi.fn(async () => ({ unitId: 'unit-1', clientId: 'client-1' })),
}))

vi.mock('./entityMap.js', () => ({
  ensureUuid: vi.fn(async (_t: string, feId: string) => `uuid-${feId}`),
  resolveUuid: vi.fn(async (_t: string, feId: string) => `uuid-${feId}`),
  resolveFrontendId: vi.fn(async (_t: string, backendId: string) =>
    backendId === 'uuid-existing' ? 'LD-guest-1700000000000-abc123' : backendId,
  ),
}))

const base = {
  propertyId: 'PR-1011',
  firstName: 'Kelly',
  lastName: 'Buyer',
  email: 'kelly@example.com',
  phone: '0821234567',
}

function insertsInto(table: string) {
  return query.mock.calls.filter((c) => String(c[0]).trimStart().startsWith(`INSERT INTO ${table}`))
}

describe('T3: public enquiry result', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    query.mockReset()
    dupRow.current = null
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T12:00:00+02:00'))
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units WHERE'))
        return [
          {
            id: 'unit-1',
            client_id: 'client-1',
            agent_id: null,
            status_config_key: 'AVAILABLE',
            price: null,
            rent: '10000',
            listing_type: 'RENT',
            max_enquiries: null,
            max_viewings: null,
            limit_action: null,
            limits_round_started_at: null,
            show_remaining: false,
          },
        ]
      if (sql.includes('listing_limit_count')) return [{ n: 1 }]
      if (sql.includes('listing_limit_duplicate')) return dupRow.current ? [dupRow.current] : []
      if (sql.includes('FROM viewing_slots') && sql.includes('FOR UPDATE'))
        return [{ slot_date: '2026-10-20', slot_time: '10:00:00', capacity: 5, booked_count: 0, status: 'OPEN' }]
      return []
    })
  })

  it('a new register-interest lead returns its LD- reference and no duplicate flag', async () => {
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const res = await submitPublicListingEnquiry({ ...base, action: 'lead' })
    expect(res.ok).toBe(true)
    expect(res.leadId).toMatch(/^LD-guest-/)
    expect(res.duplicate).not.toBe(true)
    expect(insertsInto('leads')).toHaveLength(1)
  })

  const leaksExisting = (res: unknown) => /LD-guest-1700000000000-abc123|uuid-existing/.test(JSON.stringify(res))

  it('a repeat email/phone + unit returns duplicate: true with NO reference (F4), and inserts nothing', async () => {
    dupRow.current = { id: 'uuid-existing' }
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const res = await submitPublicListingEnquiry({ ...base, action: 'lead' })
    expect(res.ok).toBe(true)
    expect(res.duplicate).toBe(true)
    expect(res.leadId).toBeNull()
    expect(leaksExisting(res)).toBe(false)
    expect(insertsInto('leads')).toHaveLength(0)
  })

  it('a repeat viewing request without a slot is also a duplicate, with no reference', async () => {
    dupRow.current = { id: 'uuid-existing' }
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const res = await submitPublicListingEnquiry({ ...base, action: 'viewing' })
    expect(res.duplicate).toBe(true)
    expect(res.leadId).toBeNull()
    expect(leaksExisting(res)).toBe(false)
  })

  it('a slot booking on a NEW lead is not a duplicate and returns its front-end references (M11, M13)', async () => {
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const res = await submitPublicListingEnquiry({ ...base, action: 'viewing', slotId: 'VS-1' })
    expect(res.duplicate).not.toBe(true)
    expect(res.leadId).toMatch(/^LD-guest-\d+-[a-z0-9]+$/)
    expect(res.bookingId).toMatch(/^VW-guest-\d+-[a-z0-9]+$/)
    expect(res.stage).toBe('Viewing Scheduled')
    expect(insertsInto('leads')).toHaveLength(1)
    expect(insertsInto('bookings')).toHaveLength(1)
  })

  it('a slot booking by a matching email/phone books the viewing, is not a duplicate, and does not reveal the existing lead (F4, M11, M13)', async () => {
    dupRow.current = { id: 'uuid-existing' }
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const res = await submitPublicListingEnquiry({ ...base, action: 'viewing', slotId: 'VS-1' })
    expect(res.duplicate).not.toBe(true)
    expect(res.leadId).toBeNull()
    expect(res.bookingId).toMatch(/^VW-guest-\d+-[a-z0-9]+$/)
    expect(leaksExisting(res)).toBe(false)
    expect(insertsInto('leads')).toHaveLength(0)
    expect(insertsInto('bookings')).toHaveLength(1)
  })
})
