import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PR #124 (Jim C5, mutant J8): the public listing-enquiry route must pass the
 * landlord's email (from loadListingAlertStaff, i.e. the unit's building) on to
 * sendListingLeadAlert. Real Hono app and route; Postgres, listing resolution,
 * id mapping and the mail senders are stubbed.
 */
vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
})

const staff = vi.hoisted(() => ({
  row: { agent_email: 'agent@example.com', agent_first: 'Agent', landlord_email: 'landlord@example.com', unit_title: 'Flat 1' } as Record<string, unknown>,
}))
const alerts = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('./db.js', async (orig) => ({
  ...(await orig<typeof import('./db.js')>()),
  databaseConfigured: true,
  query: vi.fn(async (sql: string): Promise<unknown[]> => {
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
    if (sql.includes('LEFT JOIN users ag')) return [staff.row]
    return []
  }),
  withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({}),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))
vi.mock('./listingResolve.js', () => ({
  resolveLiveListing: vi.fn(async () => ({ unitId: 'unit-1', clientId: 'client-1' })),
}))
vi.mock('./entityMap.js', async (orig) => ({
  ...(await orig<typeof import('./entityMap.js')>()),
  ensureUuid: vi.fn(async (_t: string, feId: string) => `uuid-${feId}`),
  resolveUuid: vi.fn(async (_t: string, feId: string) => `uuid-${feId}`),
}))
vi.mock('./mailtrap.js', async (orig) => ({
  ...(await orig<typeof import('./mailtrap.js')>()),
  sendListingEnquiryConfirmation: vi.fn(async () => {}),
  sendListingLeadAlert: vi.fn(async (input: Record<string, unknown>) => {
    alerts.push(input)
  }),
}))

type App = { request: (path: string, init?: RequestInit, env?: unknown) => Response | Promise<Response> }
let app: App
beforeAll(async () => {
  app = (await import('./index.js')).default as unknown as App
}, 60_000)

// Landlord copies are sent only with ALERT_LANDLORDS=1 (gated in
// sendListingLeadAlert, mocked here). Run with the flag on so this file pins
// the route contract for the state where the landlord email is used; the
// end-to-end recipients for both flag states are in
// listingAlertLandlordFlag.route.test.ts.
const savedFlag = process.env.ALERT_LANDLORDS
let ipN = 0
afterEach(() => {
  if (savedFlag === undefined) delete process.env.ALERT_LANDLORDS
  else process.env.ALERT_LANDLORDS = savedFlag
})
beforeEach(async () => {
  process.env.ALERT_LANDLORDS = '1'
  const rl = (await import('./rateLimit.js')) as { resetRateLimitsForTests?: () => void }
  rl.resetRateLimitsForTests?.()
  alerts.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

async function enquire(email: string) {
  const env = { incoming: { socket: { remoteAddress: '127.0.0.1', remotePort: 1, remoteFamily: 'IPv4' } } }
  const res = await app.request(
    '/api/public/listing-enquiry',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': `203.0.113.${++ipN % 250}` },
      body: JSON.stringify({ propertyId: 'PR-1011', action: 'lead', firstName: 'Kelly', lastName: 'Buyer', email, phone: '0821234567' }),
    },
    env,
  )
  expect(res.status).toBe(201)
}

describe('listing-enquiry alert recipients (J8)', () => {
  it("passes the building landlord's email on to the agent alert", async () => {
    staff.row = { agent_email: 'agent@example.com', agent_first: 'Agent', landlord_email: 'landlord@example.com', unit_title: 'Flat 1' }
    await enquire('j8-one@example.com')
    await vi.waitFor(() => expect(alerts).toHaveLength(1), { timeout: 5000 })
    expect(alerts[0]?.agentEmail).toBe('agent@example.com')
    expect(alerts[0]?.landlordEmail).toBe('landlord@example.com')
  })

  it('a building with no landlord sends the agent alert with no landlordEmail', async () => {
    staff.row = { agent_email: 'agent@example.com', agent_first: 'Agent', landlord_email: null, unit_title: 'Flat 1' }
    await enquire('j8-two@example.com')
    await vi.waitFor(() => expect(alerts).toHaveLength(1), { timeout: 5000 })
    expect(alerts[0]?.agentEmail).toBe('agent@example.com')
    expect(alerts[0]?.landlordEmail).toBeUndefined()
  })
})
