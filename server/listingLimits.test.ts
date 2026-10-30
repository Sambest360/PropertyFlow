import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  capacityDecision,
  effectiveCap,
  limitsApply,
  remainingCount,
} from './listingLimits.js'

const state = vi.hoisted(() => ({
  bookings: [] as string[],
  waitlist: [] as string[],
  leads: [] as Array<{ email: string; waitlisted: boolean }>,
  events: [] as string[],
  notifications: [] as string[],
  maxViewings: 2 as number | null,
  maxEnquiries: null as number | null,
  listingType: 'RENT',
  limitAction: 'WAITLIST' as 'WAITLIST' | 'CLOSE',
  round: null as string | null,
  clientId: 'client-a',
  agentId: 'user-agent',
  tail: Promise.resolve() as Promise<unknown>,
}))

const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: (fn: () => Promise<unknown>) => {
    const run = state.tail.then(() => fn())
    state.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  },
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./listingResolve.js', () => ({
  resolveLiveListing: vi.fn(async () => ({ unitId: 'unit-1', clientId: 'client-a' })),
}))

vi.mock('./entityMap.js', () => ({
  isUuid: (v: string) => /^[0-9a-f-]{36}$/i.test(v),
  ensureUuid: vi.fn(async (_t: string, fe: string) => `uuid-${fe}`),
  resolveUuid: vi.fn(async (type: string, fe: string) => {
    if (type === 'agency') return fe === 'agency-b' ? 'client-b' : 'client-a'
    if (type === 'user') return fe === 'agent-other' ? 'user-other' : 'user-agent'
    if (type === 'viewing_slot') return 'slot-1'
    if (type === 'unit' || type === 'property') return 'unit-1'
    return fe
  }),
  // T3: publicEnquiry now maps a duplicate's uuid back to its FE ref; no map here.
  resolveFrontendId: vi.fn(async () => null),
}))

function unitRow() {
  return {
    id: 'unit-1',
    client_id: state.clientId,
    agent_id: state.agentId,
    listing_type: state.listingType,
    max_enquiries: state.maxEnquiries,
    max_viewings: state.maxViewings,
    limit_action: state.limitAction,
    limits_round_started_at: state.round,
    show_remaining: true,
    status_config_key: 'AVAILABLE',
    price: null,
    rent: '10000',
  }
}

describe('listing limit rules', () => {
  beforeEach(() => {
    state.bookings = []
    state.waitlist = []
    state.leads = []
    state.events = []
    state.notifications = []
    state.maxViewings = 2
    state.maxEnquiries = null
    state.listingType = 'RENT'
    state.limitAction = 'WAITLIST'
    state.round = null
    state.clientId = 'client-a'
    state.agentId = 'user-agent'
    state.tail = Promise.resolve()
    query.mockReset()
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('listing_limit_lock')) return [unitRow()]
      if (sql.includes('listing_limit_agency') || sql.includes('FROM clients WHERE id')) {
        return [{ settings: {} }]
      }
      if (sql.includes('listing_limit_count') && sql.includes('FROM leads')) {
        return [{ n: state.leads.filter((l) => !l.waitlisted).length }]
      }
      if (sql.includes('listing_limit_count') && sql.includes('FROM bookings')) {
        return [{ n: state.bookings.length }]
      }
      if (sql.includes('listing_limit_duplicate')) {
        const email = String(params?.[2] ?? '')
        const hit = state.leads.find((l) => !l.waitlisted && l.email === email)
        return hit ? [{ id: 'lead-existing' }] : []
      }
      if (sql.includes('FROM viewing_slots')) {
        return [
          {
            slot_date: '2099-01-01',
            slot_time: '10:00',
            capacity: 50,
            booked_count: 0,
            status: 'OPEN',
          },
        ]
      }
      if (sql.includes('INSERT INTO bookings')) {
        state.bookings.push(String(params?.[0] ?? `b-${state.bookings.length}`))
        return [{ id: `booking-${state.bookings.length}` }]
      }
      if (sql.includes('INSERT INTO viewing_waitlist')) {
        state.waitlist.push(String(params?.[2] ?? 'wait'))
        return [{ id: `wait-${state.waitlist.length}` }]
      }
      if (sql.includes('INSERT INTO leads')) {
        const waitlisted = sql.includes('is_waitlisted') && String(params?.at(-1) ?? '') !== 'false' && sql.includes('true')
        state.leads.push({ email: String(params?.[5] ?? params?.[2] ?? ''), waitlisted: sql.includes('Waitlist') || waitlisted })
        return []
      }
      if (sql.includes('UPDATE viewing_slots')) return []
      if (sql.includes('INSERT INTO event_log')) {
        state.events.push(String(params?.[1] ?? ''))
        return []
      }
      if (sql.includes('INSERT INTO notifications')) {
        state.notifications.push(String(params?.[2] ?? ''))
        return []
      }
      if (sql.includes('FROM viewing_waitlist WHERE id')) {
        return [
          {
            id: '11111111-1111-4111-8111-111111111111',
            client_id: 'client-a',
            unit_id: 'unit-1',
            name: 'E2E TEST',
            email: 'e2e-wait@example.com',
            phone: null,
            promoted_at: null,
          },
        ]
      }
      if (sql.includes('FROM viewing_waitlist') && sql.includes('promoted_at IS NULL')) {
        return state.waitlist.length
          ? [{ id: 'wait-1', client_id: 'client-a', email: 'e2e-wait@example.com', name: 'E2E TEST Wait' }]
          : []
      }
      if (sql.includes('FROM users WHERE lower(email)')) {
        return [{ id: 'user-wait' }]
      }
      if (sql.includes('FROM users WHERE id')) return [{ client_id: 'client-a' }]
      if (sql.includes('UPDATE units') && sql.includes('limits_round_started_at')) {
        state.round = '2099-02-01T00:00:00Z'
        return [{ started: state.round }]
      }
      if (sql.includes('UPDATE units')) return []
      if (sql.includes('UPDATE viewing_waitlist')) return []
      if (sql.includes('FROM units WHERE id') && !sql.includes('INSERT INTO')) return [unitRow()]
      return []
    })
  })

  it('treats a blank cap as unlimited and ignores sale listings', () => {
    expect(effectiveCap(null, null)).toBeNull()
    expect(effectiveCap(null, 4)).toBe(4)
    expect(effectiveCap(2, 9)).toBe(2)
    expect(limitsApply('SALE')).toBe(false)
    expect(limitsApply('RENT')).toBe(true)
    expect(limitsApply('BOTH')).toBe(true)
    expect(capacityDecision(2, 2, 'WAITLIST')).toBe('waitlist')
    expect(capacityDecision(2, 2, 'CLOSE')).toBe('close')
    expect(capacityDecision(1, 2, 'CLOSE')).toBe('allow')
    expect(remainingCount(8, 5)).toBe(0)
  })

  it('blocks the third viewing and stores a waitlist row', async () => {
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const book = (n: number) =>
      submitPublicListingEnquiry({
        propertyId: 'PR-1',
        action: 'viewing',
        firstName: 'E2E',
        lastName: 'TEST',
        email: `e2e-${n}@example.com`,
        slotId: 'VS-1',
      })
    await book(1)
    await book(2)
    await expect(book(3)).rejects.toMatchObject({ code: 'LISTING_FULL', status: 409, waitlist: true })
    expect(state.bookings).toHaveLength(2)
    expect(state.waitlist).toHaveLength(1)
  })

  it('lets exactly 5 of 20 parallel bookings through', async () => {
    state.maxViewings = 5
    state.limitAction = 'CLOSE'
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, n) =>
        submitPublicListingEnquiry({
          propertyId: 'PR-1',
          action: 'viewing',
          firstName: 'E2E',
          lastName: 'TEST',
          email: `e2e-par-${n}@example.com`,
          slotId: 'VS-1',
        }).then(
          () => 'ok' as const,
          (err: { code?: string }) => err.code ?? 'err',
        ),
      ),
    )
    expect(results.filter((r) => r === 'ok')).toHaveLength(5)
    expect(results.filter((r) => r === 'LISTING_FULL')).toHaveLength(15)
    expect(state.bookings).toHaveLength(5)
    expect(state.waitlist).toHaveLength(0)
  })

  it('does not count a duplicate enquiry twice', async () => {
    state.maxEnquiries = 1
    state.maxViewings = null
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const first = await submitPublicListingEnquiry({
      propertyId: 'PR-1',
      action: 'lead',
      firstName: 'E2E',
      lastName: 'TEST',
      email: 'e2e-dup@example.com',
    })
    expect(first.ok).toBe(true)
    const second = await submitPublicListingEnquiry({
      propertyId: 'PR-1',
      action: 'lead',
      firstName: 'E2E',
      lastName: 'TEST',
      email: 'e2e-dup@example.com',
    })
    expect(second.leadId).toBe('lead-existing')
    expect(state.leads.filter((l) => !l.waitlisted)).toHaveLength(1)
  })

  it('does not apply the cap to a sale listing', async () => {
    state.listingType = 'SALE'
    state.maxViewings = 0
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const result = await submitPublicListingEnquiry({
      propertyId: 'PR-1',
      action: 'viewing',
      firstName: 'E2E',
      lastName: 'TEST',
      email: 'e2e-sale@example.com',
      slotId: 'VS-1',
    })
    expect(result.ok).toBe(true)
    expect(state.bookings).toHaveLength(1)
  })

  it('promotes a waitlisted person when a viewing spot is free', async () => {
    state.maxViewings = 5
    const { promoteWaitlist } = await import('./listingLimits.js')
    const result = await promoteWaitlist(
      { userId: 'agent-1', role: 'client_admin', agencyId: 'agency-a' },
      '11111111-1111-4111-8111-111111111111',
    )
    expect(result.ok).toBe(true)
    expect(state.bookings).toHaveLength(1)
    expect(state.events).toContain('waitlist_promoted')
    expect(state.notifications).toHaveLength(1)
  })

  it('refuses an agent from another agency and resets the round', async () => {
    const { patchListingLimits, resetListingLimits, notifyWaitlistSpotOpen } = await import('./listingLimits.js')
    state.clientId = 'client-b'
    await expect(
      patchListingLimits(
        { userId: 'agent-1', role: 'ground_agent', agencyId: 'agency-a' },
        'unit-1',
        { maxViewings: 9 },
      ),
    ).rejects.toMatchObject({ status: 403 })

    state.clientId = 'client-a'
    state.waitlist = ['held']
    await notifyWaitlistSpotOpen('unit-1')
    expect(state.events).toContain('listing_spot_freed')
    expect(state.notifications.length).toBe(1)

    const reset = await resetListingLimits(
      { userId: 'agent-1', role: 'client_admin', agencyId: 'agency-a' },
      'unit-1',
    )
    expect(reset.ok).toBe(true)
    expect(state.events).toContain('listing_limits_reset')
  })
})
