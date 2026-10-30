import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * H1 r5 items 7 and 8 through the real Hono app (server/index.ts), the real
 * route and the real submitPublicListingEnquiry. Only Postgres (an in-memory
 * leads table answering by SQL shape), id mapping and the mail transport are
 * stubbed.
 *  7: a repeat sends no confirmation; the agent alert goes out only for a NEW
 *     note, which is appended to the existing lead once and alerted once.
 *  8: the duplicate lookup is (email + unit); phone only when no email.
 */
vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
})

type Lead = { id: string; unit: string; email: string; phone: string | null; notes: string | null }
const store = vi.hoisted(() => ({ leads: [] as Lead[], dupCalls: [] as unknown[][] }))
const mail = vi.hoisted(() => ({ confirmations: [] as unknown[], alerts: [] as Array<Record<string, unknown>> }))

const query = vi.hoisted(() =>
  vi.fn(async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
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
      store.dupCalls.push(params)
      // The fake answers the lookup by the values the query was given: the
      // unit, and every contact value passed. It cannot tell an email from a
      // phone except by position, so it matches any lead whose email or
      // phone equals one of the passed contact values.
      const contact = params.slice(2).filter((p) => typeof p === 'string' && p !== '') as string[]
      const hit = store.leads.find(
        (l) => l.unit === params[0] && contact.some((v) => v.toLowerCase() === l.email.toLowerCase() || v === l.phone),
      )
      return hit ? [{ id: hit.id }] : []
    }
    if (sql.trimStart().startsWith('INSERT INTO leads')) {
      store.leads.push({ id: String(params[0]), unit: String(params[2]), email: String(params[5]), phone: (params[6] as string | null) ?? null, notes: (params[10] as string | null) ?? null })
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
      return [{ agent_email: 'agent@example.com', agent_first: 'Agent', landlord_email: null, unit_title: 'Flat 1' }]
    return []
  }),
)

vi.mock('./db.js', async (orig) => ({
  ...(await orig<typeof import('./db.js')>()),
  databaseConfigured: true,
  query: (sql: string, params?: unknown[]) => query(sql, params),
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
  sendListingEnquiryConfirmation: vi.fn(async (input: unknown) => {
    mail.confirmations.push(input)
  }),
  sendListingLeadAlert: vi.fn(async (input: Record<string, unknown>) => {
    mail.alerts.push(input)
  }),
}))

type App = { request: (path: string, init?: RequestInit, env?: unknown) => Response | Promise<Response> }
let app: App
beforeAll(async () => {
  app = (await import('./index.js')).default as unknown as App
}, 60_000)
const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => quiet.mockRestore())

let ipN = 0
beforeEach(async () => {
  // Optional call so the tests-first run at base fails on behaviour, not on the missing hook.
  const rl = (await import('./rateLimit.js')) as { resetRateLimitsForTests?: () => void }
  rl.resetRateLimitsForTests?.()
  store.leads = []
  store.dupCalls = []
  mail.confirmations = []
  mail.alerts = []
})

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
}

async function enquire(body: Record<string, unknown>) {
  const env = { incoming: { socket: { remoteAddress: '127.0.0.1', remotePort: 1, remoteFamily: 'IPv4' } } }
  const res = await app.request(
    '/api/public/listing-enquiry',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': `198.51.100.${++ipN % 250}` },
      body: JSON.stringify({ propertyId: 'PR-1011', action: 'lead', firstName: 'Kelly', lastName: 'Buyer', email: 'kelly@example.com', phone: '0821234567', ...body }),
    },
    env,
  )
  const json = (await res.json()) as Record<string, unknown>
  await settle()
  return { status: res.status, body: json }
}

describe('H1 item 7: repeat enquiries', () => {
  it('a first enquiry sends one confirmation and one agent alert (control)', async () => {
    const r = await enquire({ notes: 'Is parking included?' })
    expect(r.status).toBe(201)
    expect(mail.confirmations).toHaveLength(1)
    expect(mail.alerts).toHaveLength(1)
  })

  it('a repeat with no note makes 0 emails', async () => {
    await enquire({ notes: 'Is parking included?' })
    mail.confirmations = []
    mail.alerts = []
    const r = await enquire({})
    expect(r.body.duplicate).toBe(true)
    expect(mail.confirmations).toHaveLength(0)
    expect(mail.alerts).toHaveLength(0)
    expect(store.leads[0]?.notes).toBe('Is parking included?')
  })

  it('a repeat that re-sends the original note is not new: 0 emails, nothing appended', async () => {
    await enquire({ notes: 'Is parking included?' })
    mail.confirmations = []
    mail.alerts = []
    await enquire({ notes: '  is parking   included? ' })
    expect(mail.confirmations).toHaveLength(0)
    expect(mail.alerts).toHaveLength(0)
    expect(store.leads[0]?.notes).toBe('Is parking included?')
  })

  it('a repeat with a NEW note: 0 confirmations, 1 alert carrying the note, note appended once (never overwriting)', async () => {
    await enquire({ notes: 'Is parking included?' })
    mail.confirmations = []
    mail.alerts = []
    const r = await enquire({ notes: 'Can I view on Saturday?' })
    expect(r.status).toBe(201)
    expect(r.body.duplicate).toBe(true)
    expect(r.body.leadId).toBeNull()
    expect(r.body).not.toHaveProperty('noteAppended')
    expect(mail.confirmations).toHaveLength(0)
    expect(mail.alerts).toHaveLength(1)
    expect(mail.alerts[0]?.repeatNote).toBe('Can I view on Saturday?')
    const notes = String(store.leads[0]?.notes)
    expect(notes.startsWith('Is parking included?')).toBe(true)
    expect(notes.split('Can I view on Saturday?')).toHaveLength(2)
    expect(store.leads).toHaveLength(1)
  })

  it('an identical re-send of that same new note is not appended or alerted twice', async () => {
    await enquire({ notes: 'Is parking included?' })
    await enquire({ notes: 'Can I view on Saturday?' })
    mail.confirmations = []
    mail.alerts = []
    await enquire({ notes: 'Can I view on Saturday?' })
    expect(mail.confirmations).toHaveLength(0)
    expect(mail.alerts).toHaveLength(0)
    expect(String(store.leads[0]?.notes).split('Can I view on Saturday?')).toHaveLength(2)
  })

  it('a short new note that is only a fragment of an earlier note still counts as new', async () => {
    await enquire({ notes: 'Do you allow pets? I have a cat.' })
    mail.alerts = []
    await enquire({ notes: 'pets?' })
    expect(mail.alerts).toHaveLength(1)
  })
})

describe('H1 item 8: duplicate matching is (email + unit), phone only without an email', () => {
  it('two different emails with one phone and one unit give two leads, two confirmations', async () => {
    await enquire({ email: 'partner.one@example.com', phone: '0821112222' })
    const second = await enquire({ firstName: 'Sam', email: 'partner.two@example.com', phone: '0821112222' })
    expect(second.body.duplicate).not.toBe(true)
    expect(second.body.leadId).toMatch(/^LD-guest-/)
    expect(store.leads).toHaveLength(2)
    expect(mail.confirmations).toHaveLength(2)
  })

  it('the same email and unit give one lead plus an appended note', async () => {
    await enquire({ email: 'same@example.com', notes: 'First question' })
    const r = await enquire({ email: 'SAME@example.com', phone: '0830000000', notes: 'Second question' })
    expect(r.body.duplicate).toBe(true)
    expect(store.leads).toHaveLength(1)
    expect(String(store.leads[0]?.notes)).toMatch(/First question[\s\S]*Second question/)
  })

  it('when an email is given, the duplicate lookup is not given the phone at all', async () => {
    await enquire({ email: 'x@example.com', phone: '0821112222' })
    expect(store.dupCalls).toHaveLength(1)
    expect(store.dupCalls[0]).not.toContain('0821112222')
  })
})
