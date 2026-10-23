import { afterEach, describe, expect, it, vi } from 'vitest'

// Michael ruling 2 / Jim F1: bookings.starts_at is SAST wall time labelled Z.
// A guest booking (publicEnquiry / 027 RPC) and a staff save of the same slot
// store the same value, so a staff edit that keeps the slot is not "moved":
// it does not re-run the occupied notice / window checks (writes.ts upsertViewing).

const query = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(async (fn: () => unknown) => fn()),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

const AGENCY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UNIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const BOOKING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  ensureUuid: vi.fn(async () => BOOKING),
  resolveUuid: vi.fn(async (type: string) => {
    if (type === 'agency') return AGENCY
    if (type === 'property' || type === 'unit') return UNIT
    return null
  }),
  forgetId: vi.fn(async () => undefined),
  upsertEntityMapFrontendId: vi.fn(async (_et: string, _fe: string, uuid: string) => uuid),
  isUuid: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

/**
 * The guest booked a 10:00 slot on 1 Jan 2026 (long past, so a notice check
 * would refuse it); pg returns timestamptz as a Date. The unit is an occupied
 * advert with no tenant windows: any occupied check would throw.
 */
function db() {
  return async (sql: string) => {
    if (/SELECT status, unit_id::text AS unit_id, starts_at FROM bookings/.test(sql)) {
      return [{ status: 'SCHEDULED', unit_id: UNIT, starts_at: new Date('2026-01-01T10:00:00.000Z') }]
    }
    if (/SELECT advertise_while_occupied, status_config_key, occupied_viewing_notice_hours/.test(sql)) {
      return [{ advertise_while_occupied: true, status_config_key: 'OCCUPIED', occupied_viewing_notice_hours: 24 }]
    }
    return []
  }
}

const body = (time: string) => ({
  resource: 'viewing' as const,
  action: 'upsert' as const,
  id: 'VW-guest-1',
  data: {
    agencyId: 'AG-1',
    propertyId: 'P-1',
    date: '2026-01-01',
    time,
    status: 'Scheduled',
    applicantName: 'Guest Visitor',
    notes: 'staff added a note',
  },
})

const bookingWrite = () =>
  query.mock.calls.find(([sql]) => /INSERT INTO bookings/.test(String(sql))) as [string, unknown[]] | undefined

describe('staff edit of a guest booking (wall time labelled Z on both paths)', () => {
  afterEach(() => {
    query.mockReset()
  })

  it('same slot: not moved, no NOTICE_TOO_SHORT (writes.ts:1673), stores the identical starts_at', async () => {
    query.mockImplementation(db())
    const { handlePersist } = await import('./writes.js')
    await expect(handlePersist(body('10:00') as never)).resolves.toBeDefined()
    expect(query.mock.calls.some(([sql]) => /FROM tenant_viewing_windows/.test(String(sql)))).toBe(false)
    expect(bookingWrite()?.[1][7]).toBe('2026-01-01T10:00:00.000Z')
  })

  it('a real move is still checked (and refused here: NOTICE_TOO_SHORT)', async () => {
    query.mockImplementation(db())
    const { handlePersist } = await import('./writes.js')
    await expect(handlePersist(body('11:00') as never)).rejects.toMatchObject({ status: 400, code: 'NOTICE_TOO_SHORT' })
    expect(bookingWrite()).toBeUndefined()
  })
})
