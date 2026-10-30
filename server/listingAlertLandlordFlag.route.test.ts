import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * End to end through the real Hono route and the real sendListingLeadAlert:
 * who actually receives the listing-enquiry alert, with ALERT_LANDLORDS on
 * and off (Michael ruling: off by default, agent only at launch). Only
 * Postgres, listing resolution, id mapping and the mail transport are stubbed.
 * With the flag on, this is also mutant J8 end to end (the route must pass the
 * building landlord's email on).
 */
vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
})

type Lead = { id: string; unit: string; email: string; notes: string | null }
const store = vi.hoisted(() => ({ leads: [] as Lead[] }))
const sent = vi.hoisted(() => [] as Array<{ to: string; category?: string }>)

vi.mock('./db.js', async (orig) => ({
  ...(await orig<typeof import('./db.js')>()),
  databaseConfigured: true,
  query: vi.fn(async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
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
    if (sql.includes('listing_limit_duplicate')) {
      const contact = params.slice(2).filter((p) => typeof p === 'string' && p !== '') as string[]
      const hit = store.leads.find((l) => l.unit === params[0] && contact.some((v) => v.toLowerCase() === l.email.toLowerCase()))
      return hit ? [{ id: hit.id }] : []
    }
    if (sql.trimStart().startsWith('INSERT INTO leads')) {
      store.leads.push({ id: String(params[0]), unit: String(params[2]), email: String(params[5]), notes: (params[10] as string | null) ?? null })
      return []
    }
    if (sql.includes('repeat_note_lock')) {
      const l = store.leads.find((x) => x.id === params[0])
      return l ? [{ notes: l.notes }] : []
    }
    if (sql.includes('repeat_note_append')) {
      const l = store.leads.find((x) => x.id === params[0])
      if (l) l.notes = String(params[1])
      return []
    }
    if (sql.includes('LEFT JOIN users ag'))
      return [{ agent_email: 'agent@example.com', agent_first: 'Agent', landlord_email: 'landlord@example.com', unit_title: 'Flat 1' }]
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
vi.mock('./email/send.js', async (orig) => ({
  ...(await orig<typeof import('./email/send.js')>()),
  deliverEmail: vi.fn(async (input: { to: string; category?: string }) => {
    sent.push(input)
    return { ok: true, provider: 'log' }
  }),
}))

type App = { request: (path: string, init?: RequestInit, env?: unknown) => Response | Promise<Response> }
let app: App
beforeAll(async () => {
  app = (await import('./index.js')).default as unknown as App
}, 60_000)

const saved = process.env.ALERT_LANDLORDS
let ipN = 0
beforeEach(async () => {
  const rl = (await import('./rateLimit.js')) as { resetRateLimitsForTests?: () => void }
  rl.resetRateLimitsForTests?.()
  store.leads = []
  sent.length = 0
  delete process.env.ALERT_LANDLORDS
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  if (saved === undefined) delete process.env.ALERT_LANDLORDS
  else process.env.ALERT_LANDLORDS = saved
})

async function enquire(body: Record<string, unknown>) {
  const env = { incoming: { socket: { remoteAddress: '127.0.0.1', remotePort: 1, remoteFamily: 'IPv4' } } }
  const res = await app.request(
    '/api/public/listing-enquiry',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': `192.0.2.${++ipN % 250}` },
      body: JSON.stringify({ propertyId: 'PR-1011', action: 'lead', firstName: 'Kelly', lastName: 'Buyer', email: 'kelly@example.com', phone: '0821234567', ...body }),
    },
    env,
  )
  expect(res.status).toBe(201)
}
const alertTo = () => sent.filter((m) => m.category === 'listing-lead-alert').map((m) => m.to).sort()
const waitAlerts = (n: number) => vi.waitFor(() => expect(alertTo().length).toBeGreaterThanOrEqual(n), { timeout: 5000 })
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('listing-enquiry alert recipients with ALERT_LANDLORDS', () => {
  it('flag 1, first enquiry: agent and building landlord (J8)', async () => {
    process.env.ALERT_LANDLORDS = '1'
    await enquire({})
    await waitAlerts(2)
    await settle()
    expect(alertTo()).toEqual(['agent@example.com', 'landlord@example.com'])
  })

  it('flag 1, viewing: agent and landlord', async () => {
    process.env.ALERT_LANDLORDS = '1'
    await enquire({ action: 'viewing' })
    await waitAlerts(2)
    await settle()
    expect(alertTo()).toEqual(['agent@example.com', 'landlord@example.com'])
  })

  it('flag 1, repeat with a new note: agent and landlord', async () => {
    process.env.ALERT_LANDLORDS = '1'
    await enquire({ notes: 'Is parking included?' })
    await waitAlerts(2)
    await settle()
    sent.length = 0
    await enquire({ notes: 'Can I view on Saturday?' })
    await waitAlerts(2)
    await settle()
    expect(alertTo()).toEqual(['agent@example.com', 'landlord@example.com'])
  })

  for (const [label, value] of [['unset', undefined], ['0', '0'], ['true', 'true']] as const) {
    it(`flag ${label}: first enquiry, viewing and repeat-with-note alert the agent only`, async () => {
      if (value !== undefined) process.env.ALERT_LANDLORDS = value
      await enquire({ notes: 'Is parking included?' })
      await waitAlerts(1)
      await enquire({ email: 'viewer@example.com', action: 'viewing' })
      await waitAlerts(2)
      await enquire({ notes: 'Can I view on Saturday?' })
      await waitAlerts(3)
      await settle()
      expect(alertTo()).toEqual(['agent@example.com', 'agent@example.com', 'agent@example.com'])
    })
  }
})
