import { describe, expect, it, vi } from 'vitest'
import {
  LEASE_BATCH_SQL,
  buildReminderCopy,
  checkCronAuth,
  currentBand,
  dedupKey,
  formatDMMMYYYY,
  handleLeaseRemindersCron,
  runLeaseReminders,
  sastTodayIso,
  type LeaseReminderDeps,
} from './leaseReminders.js'
import {
  isSaBusinessDay,
  isSaPublicHoliday,
  isoAddDays,
  saBusinessDaysBetween,
  subtractSaBusinessDays,
} from './saPublicHolidays.js'

const TODAY = '2026-10-12' // Monday
const AG = '00000000-0000-4000-8000-0000000000a1'
const AG2 = '00000000-0000-4000-8000-0000000000a2'
const AGENT = '00000000-0000-4000-8000-000000000101'
const ADMIN = '00000000-0000-4000-8000-000000000102'
const ADMIN_NOPERM = '00000000-0000-4000-8000-000000000103'
const LANDLORD = '00000000-0000-4000-8000-000000000104'
const TENANT = '00000000-0000-4000-8000-000000000105'
const OTHER_ADMIN = '00000000-0000-4000-8000-000000000201'
const OTHER_LANDLORD = '00000000-0000-4000-8000-000000000202'
const OTHER_AGENT = '00000000-0000-4000-8000-000000000203'

function addBd(from: string, n: number): string {
  let cur = from
  let left = n
  while (left > 0) {
    cur = isoAddDays(cur, 1)
    if (isSaBusinessDay(cur)) left--
  }
  return cur
}

type Lease = {
  id: string
  client_id: string | null
  status: string
  end_date: string | null
  landlord_id: string | null
  agent_id: string | null
  tenant_id: string | null
  lease_reference: string
  unit_number: string
  building_name: string
  unit_client_id: string | null
  building_client_id: string | null
  metadata?: Record<string, unknown>
}
type User = {
  id: string
  client_id: string | null
  role: string
  active: boolean
  email: string | null
  first_name: string
  metadata: Record<string, unknown> | null
}

function leaseId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

function mkLease(n: number, bd: number | null, over: Partial<Lease> = {}): Lease {
  return {
    id: leaseId(n),
    client_id: AG,
    status: 'ACTIVE',
    end_date: bd === null ? null : addBd(TODAY, bd),
    landlord_id: LANDLORD,
    agent_id: AGENT,
    tenant_id: TENANT,
    lease_reference: `LR-${n}`,
    unit_number: '4B',
    building_name: 'Oak Court',
    unit_client_id: AG,
    building_client_id: AG,
    ...over,
  }
}

function baseUsers(): User[] {
  const u = (id: string, client_id: string | null, role: string, metadata: Record<string, unknown> | null = null): User => ({
    id,
    client_id,
    role,
    active: true,
    email: `${id.slice(-3)}@example.com`,
    first_name: 'X',
    metadata,
  })
  return [
    u(AGENT, AG, 'GROUND_AGENT'),
    u(ADMIN, AG, 'AGENCY_ADMIN'),
    u(ADMIN_NOPERM, AG, 'AGENT_ADMIN', { enabledPermissions: ['leases.view'] }),
    u(LANDLORD, null, 'LANDLORD'),
    u(TENANT, AG, 'END_USER'),
    u(OTHER_ADMIN, AG2, 'AGENCY_ADMIN'),
    u(OTHER_LANDLORD, AG2, 'LANDLORD'),
    u(OTHER_AGENT, AG2, 'GROUND_AGENT'),
  ]
}

type EventRow = { client_id: string; subject_id: string; payload: Record<string, unknown> }
type NotifRow = { client_id: string; user_id: string; title: string; body: string; link_path: string; resource_type: string; action_type: string }

function fakeDb(opts: { leases: Lease[]; users?: User[]; failInsertFor?: string; failNotifications?: boolean }) {
  const state = {
    leases: opts.leases,
    users: opts.users ?? baseUsers(),
    events: [] as EventRow[],
    notifications: [] as NotifRow[],
    batchQueries: 0,
    sql: [] as string[],
    deadUserMap: new Set<string>(),
    agencyEnabled: {} as Record<string, string[]>,
  }
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    if (text === LEASE_BATCH_SQL) {
      state.batchQueries++
      const [today, horizon, cursor] = params as [string, string, string | null]
      return state.leases
        .filter(
          (l) =>
            ['ACTIVE', 'NOTICE'].includes(l.status) &&
            l.client_id !== null &&
            l.end_date !== null &&
            l.end_date > today &&
            l.end_date <= horizon &&
            ((l.metadata?.renewalOps as { election?: string } | undefined)?.election ?? '') !== 'month_to_month' &&
            (cursor === null || l.id > cursor),
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, 200)
        .map(({ status: _s, metadata: _m, ...rest }) => rest)
    }
    if (/FROM clients/.test(text)) {
      const enabled = state.agencyEnabled[params[0] as string]
      return enabled ? [{ enabled }] : []
    }
    if (/FROM users/.test(text)) {
      const [clientId, ids] = params as [string, string[]]
      if (clientId === 'boom') throw new Error('boom')
      return state.users.filter(
        (u) => u.active && ((u.client_id === clientId && ['AGENCY_ADMIN', 'AGENT_ADMIN'].includes(u.role)) || ids.includes(u.id)),
      )
    }
    throw new Error(`unexpected query: ${text}`)
  }) as unknown as LeaseReminderDeps['query']

  const withTransaction: LeaseReminderDeps['withTransaction'] = async (fn) => {
    const staged = { events: [] as EventRow[], notifications: [] as NotifRow[] }
    const client = {
      query: vi.fn(async (text: string, params: unknown[] = []) => {
        state.sql.push(text)
        if (/pg_advisory_xact_lock\(hashtext\(\$1\)\)/.test(text)) return { rows: [{}] }
        if (/SELECT 1 FROM event_log/.test(text)) {
          const key = params[0]
          const hit = [...state.events, ...staged.events].some((e) => e.payload.dedup_key === key)
          return { rows: hit ? [{ '?column?': 1 }] : [] }
        }
        if (/INSERT INTO event_log/.test(text)) {
          if (opts.failInsertFor && params[1] === opts.failInsertFor) throw new Error('insert failed')
          staged.events.push({ client_id: params[0] as string, subject_id: params[1] as string, payload: JSON.parse(params[2] as string) })
          return { rows: [] }
        }
        if (/INSERT INTO notifications/.test(text)) {
          if (opts.failNotifications) throw new Error('notif failed')
          const [client_id, user_id, title, body, link_path] = params as string[]
          staged.notifications.push({ client_id, user_id, title, body, link_path, resource_type: 'lease', action_type: 'reminder' })
          return { rows: [] }
        }
        throw new Error(`unexpected tx query: ${text}`)
      }),
    }
    const result = await fn(client as never) // throws -> rollback (staged discarded)
    state.events.push(...staged.events)
    state.notifications.push(...staged.notifications)
    return result
  }

  const deps: LeaseReminderDeps = {
    query,
    withTransaction,
    resolveFrontendId: async (type, id) => (type === 'tenancy' ? `ten-${id.slice(-4)}` : `u-${id.slice(-4)}`),
    resolveUuid: async (_t, fe) => {
      const hit = state.users.find((u) => `u-${u.id.slice(-4)}` === fe)
      return hit && !state.deadUserMap.has(hit.id) ? hit.id : null
    },
    todayIso: () => TODAY,
    log: () => {},
  }
  return { state, deps }
}

const recipientsOf = (n: NotifRow[]) => [...new Set(n.map((x) => x.user_id))].sort()

describe('saPublicHolidays', () => {
  it("2027: Human Rights Day (Sun 21 Mar) is observed on Monday 22 Mar", () => {
    expect(new Date('2027-03-21T00:00:00Z').getUTCDay()).toBe(0)
    expect(isSaPublicHoliday('2027-03-22')).toBe(true)
    expect(isSaBusinessDay('2027-03-22')).toBe(false)
    expect(isSaPublicHoliday('2027-12-27')).toBe(true) // Day of Goodwill Sun -> Mon
  })
  it('2026 Women\'s Day (Sun 9 Aug) observed Mon 10 Aug; Easter dates listed', () => {
    expect(isSaPublicHoliday('2026-08-10')).toBe(true)
    expect(isSaPublicHoliday('2026-04-03')).toBe(true)
    expect(isSaPublicHoliday('2028-04-17')).toBe(true)
    expect(isSaPublicHoliday('2028-01-03')).toBe(false) // Sat 1 Jan 2028 not moved
  })
  it('counts business days skipping weekends and holidays', () => {
    // Fri 11 Dec 2026 -> Fri 18 Dec: Mon14 Tue15 (Wed16 holiday) Thu17 Fri18 = 4
    expect(saBusinessDaysBetween('2026-12-11', '2026-12-18')).toBe(4)
    expect(subtractSaBusinessDays('2026-12-18', 4)).toBe('2026-12-11')
  })
  it('header says it must be extended by 2028', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./saPublicHolidays.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/MUST BE EXTENDED BY 2028/)
  })
})

describe('s2A extra dates', () => {
  it('Election Day 2026-11-04 is a holiday and skipped in business-day counts', () => {
    expect(isSaPublicHoliday('2026-11-04')).toBe(true)
    expect(isSaBusinessDay('2026-11-04')).toBe(false)
    // Mon 2 Nov -> Fri 6 Nov: Tue3, Thu5, Fri6 (Wed4 skipped) = 3
    expect(saBusinessDaysBetween('2026-11-02', '2026-11-06')).toBe(3)
  })
})

describe('sendLeaseEndReminder', () => {
  it('escapes HTML in the recipient name', async () => {
    vi.resetModules()
    vi.doMock('nodemailer', () => ({
      default: { createTransport: () => ({ sendMail: sendMailSpy }) },
      createTransport: () => ({ sendMail: sendMailSpy }),
    }))
    const sendMailSpy = vi.fn(async () => ({ messageId: 'm1' }))
    const env = { ...process.env }
    process.env.ENABLE_EMAIL_LEASE_REMINDER = '1'
    process.env.MAILTRAP_TRANSPORT = 'smtp'
    process.env.MAILTRAP_SMTP_USER = 'u'
    process.env.MAILTRAP_SMTP_PASS = 'p'
    try {
      const m = await import('./mailtrap.js')
      await m.sendLeaseEndReminder({ email: 'a@example.com', name: '<b>Bob</b>', title: 'T', body: 'x <i>y</i>' })
      expect(sendMailSpy).toHaveBeenCalledTimes(1)
      const html = (sendMailSpy.mock.calls[0] as unknown as [{ html: string }])[0].html
      expect(html).toContain('&lt;b&gt;Bob&lt;/b&gt;')
      expect(html).not.toContain('<b>Bob</b>')
      expect(html).toContain('x &lt;i&gt;y&lt;/i&gt;')
    } finally {
      process.env = env
      vi.doUnmock('nodemailer')
      vi.resetModules()
    }
  })
})

describe('cron auth', () => {
  it('503 without CRON_SECRET and does nothing', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80)] })
    const r = await handleLeaseRemindersCron('Bearer x', undefined, deps)
    expect(r.status).toBe(503)
    expect(state.batchQueries).toBe(0)
    expect((await handleLeaseRemindersCron('Bearer x', '  ', deps)).status).toBe(503)
  })
  it('401 without or with wrong bearer (same and different length)', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80)] })
    expect((await handleLeaseRemindersCron(undefined, 'sekret', deps)).status).toBe(401)
    expect((await handleLeaseRemindersCron('Bearer sekreT', 'sekret', deps)).status).toBe(401)
    expect((await handleLeaseRemindersCron('Bearer sek', 'sekret', deps)).status).toBe(401)
    expect((await handleLeaseRemindersCron('sekret', 'sekret', deps)).status).toBe(401)
    expect(state.batchQueries).toBe(0)
  })
  it('checkCronAuth accepts the exact bearer', () => {
    expect(checkCronAuth('Bearer sekret', 'sekret')).toBeNull()
  })
  it('200 with { ok, checked, created, skipped } and no PII', async () => {
    const { deps } = fakeDb({ leases: [mkLease(1, 80), mkLease(2, 82)] })
    const r = await handleLeaseRemindersCron('Bearer sekret', 'sekret', deps)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, checked: 2, created: 1, skipped: 1 })
  })
  it('route is wired in server/index.ts with no actor resolution', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    const block = src.slice(src.indexOf("app.get('/api/cron/lease-reminders'"))
    const route = block.slice(0, block.indexOf('\n})') + 3)
    expect(route).toContain('process.env.CRON_SECRET')
    expect(route).not.toMatch(/resolveRequestActor|x-demo|X-Role/i)
    const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    expect(vercel.crons).toContainEqual({ path: '/api/cron/lease-reminders', schedule: '0 5 * * *' })
  })
})

describe('runLeaseReminders', () => {
  it('lease at 80bd: one event_log row + notifications to agent, admin with users.manage, landlord; rerun creates 0', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80)] })
    const r1 = await runLeaseReminders(deps)
    expect(r1).toEqual({ ok: true, checked: 1, created: 1, skipped: 0 })
    expect(state.events).toHaveLength(1)
    expect(state.events[0].payload.dedup_key).toBe(`lease_end:${leaseId(1)}:${addBd(TODAY, 80)}:80bd`)
    expect(recipientsOf(state.notifications)).toEqual([AGENT, ADMIN, LANDLORD].sort())
    expect(state.notifications.every((n) => n.link_path === `/leases?tenancy=ten-0001`)).toBe(true)
    expect(state.notifications.every((n) => n.resource_type === 'lease' && n.action_type === 'reminder')).toBe(true)
    const r2 = await runLeaseReminders(deps)
    expect(r2.created).toBe(0)
    expect(state.events).toHaveLength(1)
    expect(state.notifications).toHaveLength(3)
  })

  it('takes the transaction advisory lock (never session lock) before the dedup check', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80)] })
    await runLeaseReminders(deps)
    expect(state.sql[0]).toMatch(/pg_advisory_xact_lock\(hashtext/)
    expect(state.sql[1]).toMatch(/SELECT 1 FROM event_log/)
    expect(state.sql.join('\n')).not.toMatch(/pg_advisory_lock\(/)
  })

  it('never the tenant, never another agency admin', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 45)] })
    await runLeaseReminders(deps)
    const ids = recipientsOf(state.notifications)
    expect(ids).not.toContain(TENANT)
    expect(ids).not.toContain(OTHER_ADMIN)
    expect(ids).not.toContain(ADMIN_NOPERM)
  })

  it('a landlord tied to another agency gets nothing', async () => {
    const { state, deps } = fakeDb({
      leases: [
        mkLease(1, 80, { landlord_id: OTHER_LANDLORD }),
        mkLease(2, 80, { building_client_id: AG2, unit_client_id: AG2 }),
      ],
    })
    await runLeaseReminders(deps)
    expect(recipientsOf(state.notifications)).not.toContain(OTHER_LANDLORD)
    const l2 = state.notifications.filter((n) => n.link_path.endsWith('0002'))
    expect(recipientsOf(l2)).not.toContain(LANDLORD)
  })

  it('agency enabledPermissions without users.manage removes admin recipients', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80)] })
    state.agencyEnabled[AG] = ['leases.view']
    await runLeaseReminders(deps)
    expect(recipientsOf(state.notifications)).toEqual([AGENT, LANDLORD].sort())
  })

  it('warns when the run horizon passes the end of the holiday list', async () => {
    const warn = vi.fn()
    const { deps } = fakeDb({ leases: [] })
    deps.warn = warn
    await runLeaseReminders(deps)
    expect(warn).not.toHaveBeenCalled()
    deps.todayIso = () => '2028-10-01'
    await runLeaseReminders(deps)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('agent must be in the same agency and round-trip resolve', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80, { agent_id: OTHER_AGENT }), mkLease(2, 80)] })
    state.deadUserMap.add(AGENT)
    await runLeaseReminders(deps)
    const ids = recipientsOf(state.notifications)
    expect(ids).not.toContain(OTHER_AGENT)
    expect(ids).not.toContain(AGENT)
  })

  it('catch-up: at 50bd with no row fires the 80 band once', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 50)] })
    await runLeaseReminders(deps)
    expect(state.events.map((e) => e.payload.band)).toEqual(['80bd'])
    await runLeaseReminders(deps)
    expect(state.events).toHaveLength(1)
  })

  it('a missed 80 band is not backfilled: first seen at 30bd fires only 45, without the CPA line', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 30)] })
    await runLeaseReminders(deps)
    expect(state.events.map((e) => e.payload.band)).toEqual(['45bd'])
    expect(state.notifications[0].body).not.toMatch(/Consumer Protection Act/)
    expect(state.notifications[0].title).toBe('Lease ends in 30 business days')
  })

  it('beyond 80bd or on/after end date: nothing', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 81), mkLease(2, 0)] })
    await runLeaseReminders(deps)
    expect(state.events).toHaveLength(0)
  })

  it('a renewal with a new end_date re-arms the reminder', async () => {
    const lease = mkLease(1, 45)
    const { state, deps } = fakeDb({ leases: [lease] })
    await runLeaseReminders(deps)
    lease.end_date = addBd(TODAY, 44) // renewal changes end date, still in 45 band
    await runLeaseReminders(deps)
    expect(state.events).toHaveLength(2)
    expect(new Set(state.events.map((e) => e.payload.dedup_key)).size).toBe(2)
  })

  it('ENDED / CANCELLED / PENDING / null end_date / null client_id / month_to_month -> none', async () => {
    const { state, deps } = fakeDb({
      leases: [
        mkLease(1, 80, { status: 'ENDED' }),
        mkLease(2, 80, { status: 'CANCELLED' }),
        mkLease(3, 80, { status: 'PENDING' }),
        mkLease(4, null),
        mkLease(5, 80, { client_id: null }),
        mkLease(6, 80, { metadata: { renewalOps: { election: 'month_to_month' } } }),
      ],
    })
    const r = await runLeaseReminders(deps)
    expect(r.checked).toBe(0)
    expect(state.events).toHaveLength(0)
  })

  it('NOTICE status is included', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80, { status: 'NOTICE' })] })
    await runLeaseReminders(deps)
    expect(state.events).toHaveLength(1)
  })

  it('SQL filters status, nulls and the periodic field', () => {
    expect(LEASE_BATCH_SQL).toMatch(/l\.status IN \('ACTIVE', 'NOTICE'\)/)
    expect(LEASE_BATCH_SQL).toMatch(/l\.end_date IS NOT NULL/)
    expect(LEASE_BATCH_SQL).toMatch(/l\.client_id IS NOT NULL/)
    expect(LEASE_BATCH_SQL).toMatch(/renewalOps'->>'election', ''\) <> 'month_to_month'/)
    expect(LEASE_BATCH_SQL).toMatch(/LIMIT 200/)
  })

  it('a failing lease row is logged and the batch continues', async () => {
    const log = vi.fn()
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80, { client_id: 'boom' }), mkLease(2, 80)], failInsertFor: undefined })
    deps.log = log
    const r = await runLeaseReminders(deps)
    expect(r).toEqual({ ok: true, checked: 2, created: 1, skipped: 1 })
    expect(log).toHaveBeenCalledTimes(1)
    expect(state.events).toHaveLength(1)
  })

  it('a failed insert rolls back: no event row, no notifications', async () => {
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80)], failNotifications: true })
    const r = await runLeaseReminders(deps)
    expect(r.created).toBe(0)
    expect(state.events).toHaveLength(0)
    expect(state.notifications).toHaveLength(0)
  })

  it('processes in batches of 200', async () => {
    const leases = Array.from({ length: 450 }, (_, i) => mkLease(i + 1, 82))
    const { state, deps } = fakeDb({ leases })
    const r = await runLeaseReminders(deps)
    expect(r.checked).toBe(450)
    expect(state.batchQueries).toBe(3)
  })

  it('email flag off -> no send', async () => {
    const send = vi.fn()
    const { deps } = fakeDb({ leases: [mkLease(1, 80)] })
    deps.sendEmail = send
    deps.emailEnabled = () => false
    await runLeaseReminders(deps)
    expect(send).not.toHaveBeenCalled()
  })

  it('email flag on and send throws -> notifications still committed', async () => {
    const send = vi.fn(async () => {
      throw new Error('smtp down')
    })
    const { state, deps } = fakeDb({ leases: [mkLease(1, 80)] })
    deps.sendEmail = send
    deps.emailEnabled = () => true
    const r = await runLeaseReminders(deps)
    expect(send).toHaveBeenCalled()
    expect(r.created).toBe(1)
    expect(state.notifications).toHaveLength(3)
  })
})

describe('copy', () => {
  const end = '2027-02-26'
  const c80 = buildReminderCopy({ propertyLabel: 'Oak Court, unit 4B', leaseReference: 'LR-1', endDateIso: end, businessDaysLeft: 80, band: 80 })
  const c45 = buildReminderCopy({ propertyLabel: 'Oak Court, unit 4B', leaseReference: 'LR-1', endDateIso: end, businessDaysLeft: 45, band: 45 })

  it('title and property/lease line with D MMM YYYY', () => {
    expect(c80.title).toBe('Lease ends in 80 business days')
    expect(c80.body).toContain('Oak Court, unit 4B (lease LR-1) ends on 26 Feb 2027.')
    expect(formatDMMMYYYY('2026-04-03')).toBe('3 Apr 2026')
  })
  it('CPA line uses end minus 80bd and end minus 40bd', () => {
    const open = formatDMMMYYYY(subtractSaBusinessDays(end, 80))
    const close = formatDMMMYYYY(subtractSaBusinessDays(end, 40))
    expect(c80.body).toContain(
      `Tenant expiry notice: send between ${open} and ${close} if the Consumer Protection Act applies to this lease.`,
    )
  })
  it('45bd adds the outgoing inspection line; 80bd does not', () => {
    const line = 'Plan the joint outgoing inspection with the tenant before the lease ends.'
    expect(c45.body).toContain(line)
    expect(c80.body).not.toContain(line)
  })
  it('under 40bd leaves out the CPA line', () => {
    const c = buildReminderCopy({ propertyLabel: 'P', leaseReference: 'R', endDateIso: end, businessDaysLeft: 39, band: 45 })
    expect(c.body).not.toMatch(/Consumer Protection Act|Tenant expiry notice/)
  })
  it('neutral wording: no we, no "the agency will", never "required by law"', () => {
    for (const c of [c80, c45]) {
      const t = `${c.title} ${c.body}`
      expect(t).not.toMatch(/\bwe\b/i)
      expect(t).not.toMatch(/the agency will/i)
      expect(t).not.toMatch(/required by law/i)
    }
  })
})

describe('helpers', () => {
  it('bands and dedup key', () => {
    expect(currentBand(81)).toBeNull()
    expect(currentBand(80)).toBe(80)
    expect(currentBand(46)).toBe(80)
    expect(currentBand(45)).toBe(45)
    expect(currentBand(1)).toBe(45)
    expect(currentBand(0)).toBeNull()
    expect(dedupKey('abc', '2027-01-29', 45)).toBe('lease_end:abc:2027-01-29:45bd')
  })
  it('today is computed in SAST', () => {
    expect(sastTodayIso(new Date('2026-10-11T22:30:00Z'))).toBe('2026-10-12')
  })
})
