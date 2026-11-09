import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guest houses: Full Agents (ground_agent) and Candidates (agent) cannot
 * delete a guest house or change a booking's payment status; an agency admin
 * can. Unit test over a mocked db, so the 'agent' arm of each guard is pinned
 * in `npm test` without Postgres (QA mutant M11).
 */
const sqls: string[] = []
const query = vi.fn()
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(async (fn: (c: unknown) => unknown) => fn({})),
  clientQuery: vi.fn(async () => []),
}))
vi.mock('./entityMap.js', () => ({ resolveUuid: vi.fn(async () => null) }))
vi.mock('./supportDesk.js', () => ({ notifyUsers: vi.fn(async () => 0) }))

const CLIENT = '0c000000-0000-4000-8000-000000000001'
const HOUSE = '0c000000-0000-4000-8000-0000000000a1'
const BOOKING = '0c000000-0000-4000-8000-0000000000b1'
const ROOM = '0c000000-0000-4000-8000-0000000000c1'
const USER = '0c000000-0000-4000-8000-0000000000d1'

const houseRow = {
  id: HOUSE, client_id: CLIENT, owner_user_id: null, owner_name: null, name: 'H', description: '', address: '', suburb: null, city: 'X',
  latitude: null, longitude: null, photos: [], amenities: [], house_rules: '', check_in_time: '14:00', check_out_time: '10:00',
  cancellation_policy: 'moderate', instant_book: false, tourism_levy_pct: '1', contact_phone: null, contact_email: null, status: 'published', created_at: new Date(),
}
const bookingRow = {
  id: BOOKING, reference: 'GH-TEST01', guesthouse_id: HOUSE, guesthouse_name: 'H', city: 'X', room_id: ROOM, room_name: 'R', guest_name: 'G',
  guest_email: 'g@example.test', guest_phone: null, guests: 1, check_in: '2030-01-01', check_out: '2030-01-02', nights: 1, accommodation: '100',
  cleaning_fee: '0', tourism_levy: '0', total: '100', status: 'confirmed', payment_status: 'unpaid', guest_message: null, host_note: null,
  expires_at: null, check_in_time: '14:00', check_out_time: '10:00', cancellation_policy: 'moderate', created_at: new Date(),
  client_id: CLIENT, owner_user_id: null, guest_user_id: null,
}

beforeEach(() => {
  sqls.length = 0
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    sqls.push(sql)
    if (/FROM users WHERE id/.test(sql)) return [{ client_id: CLIENT, focus: null }]
    if (/FROM guesthouse_bookings b\s+JOIN guesthouses g/.test(sql)) return [bookingRow]
    if (/FROM guesthouses g LEFT JOIN users o/.test(sql)) return [houseRow]
    if (/COUNT\(\*\)::int AS n/.test(sql)) return [{ n: 0 }]
    return []
  })
})

const { deleteGuesthouse, actOnGuestBooking } = await import('./guesthouses.js')
const actor = (role: string) => ({ userId: USER, role, agencyId: null }) as never
const deleted = () => sqls.some((s) => /DELETE FROM guesthouses/.test(s))
const paid = () => sqls.some((s) => /UPDATE guesthouse_bookings SET payment_status/.test(s))
const settle = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e)

describe('guest-house guards: delete and payment are admin-only', () => {
  for (const role of ['agent', 'ground_agent']) {
    it(`${role}: deleteGuesthouse is 403 and nothing is deleted`, async () => {
      const e = await settle(deleteGuesthouse(actor(role), HOUSE))
      expect({ status: (e as { status?: number } | null)?.status, deleted: deleted() }).toEqual({ status: 403, deleted: false })
    })
    it(`${role}: the payment action is 403 and payment_status is not written`, async () => {
      const e = await settle(actOnGuestBooking(actor(role), BOOKING, { action: 'payment', paymentStatus: 'paid' }))
      expect({ status: (e as { status?: number } | null)?.status, paid: paid() }).toEqual({ status: 403, paid: false })
    })
  }

  it('agent_admin passes both guards', async () => {
    await deleteGuesthouse(actor('agent_admin'), HOUSE)
    await actOnGuestBooking(actor('agent_admin'), BOOKING, { action: 'payment', paymentStatus: 'paid' })
    expect({ deleted: deleted(), paid: paid() }).toEqual({ deleted: true, paid: true })
  })
})
