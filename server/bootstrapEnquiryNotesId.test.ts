import { describe, expect, it, vi } from 'vitest'

/**
 * T1: rows written before the fix carry `ID/Passport: …` in leads.notes and
 * bookings.notes. The bootstrap read strips that line; the rest of the note stays.
 */
const C21 = 'f2a29694-8440-4dab-93a7-ed1bb917b2c5'
const BLD = '7d1c6a52-6f0e-4b8e-9a51-2f3b0c6d9e11'
const UNIT = '3b9f2e44-1c7a-4d2e-8f60-5a4b3c2d1e0f'
const LEAD = '5c0c3a11-0000-4000-8000-000000000001'
const BOOKING = '5c0c3a11-0000-4000-8000-000000000002'
const ID = '8001015009087'
const NOTE = `Looking to move in December\nMonthly income: 25000\nID/Passport: ${ID}`

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string) => {
    if (/unit_listing_limit_snapshot/.test(sql)) return []
    if (/FROM leads/.test(sql)) {
      return [{ id: LEAD, client_id: C21, unit_id: UNIT, agent_id: null, name: 'Sam Applicant', email: 's@example.com', phone: null, channel: 'Web Form', stage: 'New Lead', interest_type: 'RENT', value_amount: '9500', notes: NOTE, metadata: {}, created_at: new Date('2026-10-26'), updated_at: new Date('2026-10-26') }]
    }
    if (/FROM bookings/.test(sql)) {
      return [{ id: BOOKING, client_id: C21, unit_id: UNIT, slot_id: null, agent_id: null, visitor_name: 'Sam Applicant', visitor_email: 's@example.com', visitor_phone: null, starts_at: new Date('2026-10-28T09:30:00Z'), status: 'SCHEDULED', notes: NOTE, created_at: new Date('2026-10-26'), updated_at: new Date('2026-10-26') }]
    }
    if (/FROM clients/.test(sql)) {
      return [{ id: C21, company_name: 'century 21', subdomain: 'century-21', status: 'active', city: 'Gqeberha', created_at: new Date('2026-10-15'), settings: {} }]
    }
    if (/FROM buildings/.test(sql)) {
      return [{ id: BLD, client_id: C21, landlord_id: null, name: 'Sea View', address: '1 Beach Rd', city: 'Gqeberha', province: null, suburb: 'Summerstrand', images: [], created_at: new Date('2026-10-20') }]
    }
    if (/FROM units/.test(sql)) {
      return [{ id: UNIT, building_id: BLD, client_id: C21, unit_number: '1', listing_type: 'rent', rent: '9500', status_config_key: 'PUBLISHED', agent_id: null, title: 'Sea View 1', amenities: [], images: [], featured: false, created_at: new Date('2026-10-26'), updated_at: new Date('2026-10-26') }]
    }
    if (/FROM entity_id_map/.test(sql)) return [{ entity_type: 'agency', frontend_id: 'ag-14gu4m', backend_id: C21 }]
    return []
  }),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))

describe('T1: bootstrap strips the ID line from older enquiry notes', () => {
  it('leads and viewings carry the note without the ID', async () => {
    const { buildBootstrap } = await import('./bootstrap.js')
    const data = (await buildBootstrap({ lite: false })) as Record<string, unknown>
    const leads = data.leads as Array<{ notes?: string }>
    const viewings = data.viewings as Array<{ notes?: string }>
    expect(leads).toHaveLength(1)
    expect(viewings).toHaveLength(1)
    for (const row of [leads[0], viewings[0]]) {
      expect(row.notes).toBe('Looking to move in December\nMonthly income: 25000')
    }
    expect(JSON.stringify(data)).not.toContain(ID)
  })
})
