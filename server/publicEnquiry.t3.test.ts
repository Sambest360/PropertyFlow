import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T3 (spec r4): the server answer is the only save of a public enquiry.
 * A repeat email+unit says so (duplicate: true) and gives back the ORIGINAL
 * lead reference (its front-end id), so the form can show "already registered"
 * with a real reference instead of a raw database id.
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

  it('a repeat email+unit returns duplicate: true with the original reference, and inserts nothing', async () => {
    dupRow.current = { id: 'uuid-existing' }
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const res = await submitPublicListingEnquiry({ ...base, action: 'lead' })
    expect(res.ok).toBe(true)
    expect(res.duplicate).toBe(true)
    expect(res.leadId).toBe('LD-guest-1700000000000-abc123')
    expect(insertsInto('leads')).toHaveLength(0)
  })

  it('a repeat viewing request without a slot is also a duplicate', async () => {
    dupRow.current = { id: 'uuid-existing' }
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const res = await submitPublicListingEnquiry({ ...base, action: 'viewing' })
    expect(res.duplicate).toBe(true)
    expect(res.leadId).toBe('LD-guest-1700000000000-abc123')
  })
})
