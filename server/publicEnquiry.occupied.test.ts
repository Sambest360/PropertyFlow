import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Item 10 (Michael's ruling), API mode. An occupied unit that is advertised
 * takes enquiries and the lead says when it is free. Occupied units that are
 * not advertised, and unlisted units, stay closed with property_not_public.
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

const OCCUPIED_ADVERT = {
  id: 'unit-1',
  client_id: 'client-1',
  agent_id: null,
  status_config_key: 'OCCUPIED',
  price: null,
  rent: '12000',
  listing_type: 'rent',
  advertise_while_occupied: true,
  available_from: '2027-02-01',
}

function enquire(slotId: string | null = null) {
  return import('./publicEnquiry.js').then(({ submitPublicListingEnquiry }) =>
    submitPublicListingEnquiry({
      propertyId: 'PR-1011',
      action: slotId ? 'viewing' : 'lead',
      slotId,
      firstName: 'Naledi',
      lastName: 'Dlamini',
      email: 'naledi@example.com',
      interestType: 'Rent',
    }),
  )
}

describe('public enquiry on an occupied unit (API mode)', () => {
  beforeEach(() => {
    query.mockReset()
    unitRow.current = { ...OCCUPIED_ADVERT }
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units WHERE id')) return [unitRow.current]
      return []
    })
  })

  it('accepts an occupied advert and notes "Interested, available from <date>"', async () => {
    const result = await enquire()
    expect(Object.keys(result).sort()).toEqual(['availableFrom', 'bookingId', 'leadId', 'ok', 'stage', 'unitId'].sort())
    expect(result.ok).toBe(true)
    // Same as the RPC's available_from return.
    expect(result.availableFrom).toBe('2027-02-01')
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO leads'))
    expect(insert).toBeTruthy()
    const notes = String((insert![1] as unknown[])[10])
    expect(notes.split('\n')[0]).toBe('Interested, available from 1 Feb 2027')
  })

  it('rejects an occupied unit that is not advertised with property_not_public', async () => {
    unitRow.current = { ...OCCUPIED_ADVERT, advertise_while_occupied: false }
    await expect(enquire()).rejects.toMatchObject({ message: 'property_not_public', status: 422 })
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO leads'))).toBe(false)
  })

  it('rejects an unlisted unit with property_not_public, even when the flag is on', async () => {
    unitRow.current = { ...OCCUPIED_ADVERT, listing_type: 'NOT_LISTED' }
    await expect(enquire()).rejects.toMatchObject({ message: 'property_not_public', status: 422 })
  })

  it('rejects a draft unit with property_not_public', async () => {
    unitRow.current = { ...OCCUPIED_ADVERT, status_config_key: 'DRAFT', advertise_while_occupied: false }
    await expect(enquire()).rejects.toMatchObject({ message: 'property_not_public', status: 422 })
  })

  it('still accepts a normal available listing, with no interest note', async () => {
    unitRow.current = { ...OCCUPIED_ADVERT, status_config_key: 'AVAILABLE', advertise_while_occupied: false }
    const result = await enquire()
    expect(result.ok).toBe(true)
    expect(result.availableFrom).toBeNull()
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO leads'))
    expect(String((insert![1] as unknown[])[10] ?? '')).not.toMatch(/Interested, available from/)
  })
})

describe('24h notice across the UTC / SAST boundary (API mode, Michael d)', () => {
  // 22:30 UTC on 9 Jan = 00:30 SAST on 10 Jan.
  const NOW = new Date('2027-01-09T22:30:00Z')
  let slot = { slot_date: '2027-01-11', slot_time: '00:00' }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    query.mockReset()
    unitRow.current = { ...OCCUPIED_ADVERT }
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units WHERE id')) return [unitRow.current]
      if (sql.includes('FROM viewing_slots')) {
        return [{ ...slot, capacity: 5, booked_count: 0, status: 'OPEN' }]
      }
      if (sql.includes('FROM tenant_viewing_windows')) {
        return [{ weekday: null, window_date: '2027-01-11', start_time: '00:00', end_time: '02:00' }]
      }
      return []
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('refuses 00:00 SAST on 11 Jan (23.5h away) even though naive UTC parsing would say 25.5h', async () => {
    slot = { slot_date: '2027-01-11', slot_time: '00:00' }
    await expect(enquire('VS-1')).rejects.toMatchObject({ code: 'NOTICE_TOO_SHORT', status: 400 })
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO bookings'))).toBe(false)
  })

  it('accepts 00:45 SAST on 11 Jan (24.25h away) and stores the wall time labelled Z (same as staff bookings)', async () => {
    slot = { slot_date: '2027-01-11', slot_time: '00:45:00' }
    const result = await enquire('VS-1')
    expect(result.ok).toBe(true)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO bookings'))
    expect(insert).toBeTruthy()
    expect((insert![1] as unknown[])).toContain('2027-01-11T00:45:00.000Z')
  })
})

