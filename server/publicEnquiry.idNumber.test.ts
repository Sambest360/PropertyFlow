import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T1: Register interest no longer collects an ID, and the server ignores an
 * idNumber an older client still sends. No ID reaches leads.notes (lead and
 * waitlist) or bookings.notes, and bootstrap strips the line from older rows.
 */
const query = vi.hoisted(() => vi.fn())
const unitRow = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

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
}))

const ID = '8001015009087'
const base = {
  propertyId: 'PR-1011',
  firstName: 'Sam',
  lastName: 'Applicant',
  email: 'sam@example.com',
  phone: '0821234567',
  notes: 'Looking to move in December',
  monthlyIncome: 25000,
  idNumber: ID,
}

function insertsInto(table: string) {
  return query.mock.calls.filter((c) => String(c[0]).trimStart().startsWith(`INSERT INTO ${table}`))
}

describe('T1: no ID number in enquiry notes', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    query.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T12:00:00+02:00'))
    unitRow.current = {
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
    }
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units WHERE')) return [unitRow.current]
      if (sql.includes('listing_limit_count')) return [{ n: 5 }]
      if (sql.includes('FROM viewing_slots') && sql.includes('FOR UPDATE')) {
        return [{ slot_date: '2026-10-20', slot_time: '09:30', capacity: 4, booked_count: 1, status: 'OPEN' }]
      }
      return []
    })
  })

  it('a register-interest lead keeps the notes and income but carries no ID', async () => {
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const res = await submitPublicListingEnquiry({ ...base, action: 'lead' })
    expect(res.ok).toBe(true)
    const leads = insertsInto('leads')
    expect(leads).toHaveLength(1)
    const notes = String((leads[0][1] as unknown[])[10] ?? '')
    expect(notes).toContain('Looking to move in December')
    expect(notes).toContain('Monthly income: 25000')
    expect(notes).not.toContain(ID)
    expect(notes).not.toMatch(/ID\/Passport/i)
    expect(JSON.stringify(query.mock.calls)).not.toContain(ID)
  })

  it('a viewing booking (lead + bookings row) carries no ID', async () => {
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const res = await submitPublicListingEnquiry({ ...base, action: 'viewing', slotId: 'VS-9' })
    expect(res.ok).toBe(true)
    expect(insertsInto('leads')).toHaveLength(1)
    const bookings = insertsInto('bookings')
    expect(bookings).toHaveLength(1)
    const notes = String((bookings[0][1] as unknown[])[9] ?? '')
    expect(notes).toContain('Looking to move in December')
    expect(notes).not.toContain(ID)
    expect(JSON.stringify(query.mock.calls)).not.toContain(ID)
  })

  it('a waitlisted enquiry carries no ID', async () => {
    unitRow.current = { ...unitRow.current, max_enquiries: 1, limit_action: 'WAITLIST' }
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    await submitPublicListingEnquiry({ ...base, action: 'lead' }).catch(() => undefined)
    const leads = insertsInto('leads')
    expect(leads).toHaveLength(1)
    expect(String(leads[0][0])).toContain('is_waitlisted')
    expect(String((leads[0][1] as unknown[])[9] ?? '')).not.toContain(ID)
    expect(JSON.stringify(query.mock.calls)).not.toContain(ID)
  })
})

describe('T1: stripIdPassportLines (bootstrap read of older notes)', () => {
  it('drops only the ID/Passport line', async () => {
    const { stripIdPassportLines } = await import('./enquiryNotes.js')
    expect(stripIdPassportLines(`Hi\nMonthly income: 25000\nID/Passport: ${ID}`)).toBe('Hi\nMonthly income: 25000')
    expect(stripIdPassportLines(`ID/Passport: ${ID}\nHi`)).toBe('Hi')
    expect(stripIdPassportLines(`ID/Passport: ${ID}`)).toBe('')
    expect(stripIdPassportLines('Plain note')).toBe('Plain note')
    expect(stripIdPassportLines(null)).toBeNull()
    expect(stripIdPassportLines(undefined)).toBeUndefined()
  })
})
