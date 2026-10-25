/**
 * Help desk API (server/supportDesk.ts): routing to the super admins,
 * server-set facts, who may act, and notifications both ways. Postgres and
 * the id map are replaced by an in-memory fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DemoActor } from './actor.js'

type User = { uuid: string; fe: string; role: string; name: string; active?: boolean }
const db = vi.hoisted(() => ({
  users: [] as User[],
  events: new Map<string, { id: string; client_id: string | null; event_type: string; actor_user_id: string | null; payload: Record<string, unknown>; created_at: string }>(),
  map: new Map<string, string>(),
  notes: [] as Array<{ user: string; title: string; body: string; link: string }>,
}))

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string, params: unknown[] = []) => fake(sql, params)),
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
}))
vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: async () => undefined,
  resolveUuid: async (type: string, fe: string) => {
    if (!fe) return null
    if (type === 'user') return db.users.find((u) => u.fe === fe || u.uuid === fe)?.uuid ?? null
    return db.map.get(`${type}:${fe}`) ?? null
  },
  ensureUuid: async (type: string, fe: string) => {
    const k = `${type}:${fe}`
    if (!db.map.has(k)) db.map.set(k, `0000000${db.map.size}-0000-4000-8000-000000000000`)
    return db.map.get(k)!
  },
}))
vi.mock('./scopeGate.js', () => ({
  agencyFeId: async (id: string | null) => id,
  actorIdAliases: async (a: DemoActor) => {
    const u = db.users.find((x) => x.fe === a.userId)
    return new Set([a.userId, ...(u ? [u.uuid] : [])])
  },
  resolveActorUsersManage: async (a: DemoActor) => a.role === 'super_admin' || a.role === 'client_admin',
}))

function fake(sql: string, p: unknown[]): unknown[] {
  if (sql.includes("role = 'SUPER_ADMIN' OR metadata->>'frontend_role' = 'super_admin') AS ok")) {
    const u = db.users.find((x) => x.uuid === p[0] && x.active !== false)
    return u ? [{ ok: u.role === 'super_admin' }] : []
  }
  if (sql.includes('FROM users') && sql.includes("role = 'SUPER_ADMIN'")) {
    return db.users.filter((u) => u.role === 'super_admin' && u.active !== false).map((u) => ({ id: u.uuid }))
  }
  if (sql.includes('CONCAT_WS')) return [{ name: db.users.find((u) => u.uuid === p[0])?.name ?? null }]
  if (sql.startsWith('INSERT INTO notifications')) {
    db.notes.push({ user: String(p[1]), title: String(p[2]), body: String(p[3]), link: String(p[4]) })
    return []
  }
  if (sql.includes('INSERT INTO event_log')) {
    const row = {
      id: String(p[0]),
      client_id: null,
      event_type: 'support_ticket',
      actor_user_id: (p[1] as string) ?? null,
      payload: JSON.parse(String(p[2])),
      created_at: '2026-10-20T08:00:00.000Z',
    }
    db.events.set(row.id, row)
    return [row]
  }
  if (sql.includes('FROM event_log WHERE id')) {
    const r = db.events.get(String(p[0]))
    return r ? [structuredClone(r)] : []
  }
  if (sql.startsWith('UPDATE event_log')) {
    const r = db.events.get(String(p[0]))!
    r.payload = JSON.parse(String(p[1]))
    return [structuredClone(r)]
  }
  throw new Error(`unexpected sql: ${sql.slice(0, 120)}`)
}

const U = (n: number) => `b0000000-0000-4000-8000-00000000000${n}`
const superA: DemoActor = { userId: 'u-super', role: 'super_admin', agencyId: null }
const superB: DemoActor = { userId: 'u-super2', role: 'super_admin', agencyId: null }
const landlord: DemoActor = { userId: 'u-ll', role: 'landlord', agencyId: 'ag-horizon' }
const tenant: DemoActor = { userId: 'u-tenant', role: 'tenant', agencyId: 'ag-horizon' }
const agencyAdmin: DemoActor = { userId: 'u-admin', role: 'client_admin', agencyId: 'ag-horizon' }

async function mod() {
  return import('./supportDesk.js')
}

describe('help desk API', () => {
  beforeEach(() => {
    db.users = [
      { uuid: U(1), fe: 'u-super', role: 'super_admin', name: 'Sam Super' },
      { uuid: U(2), fe: 'u-super2', role: 'super_admin', name: 'Sue Super' },
      { uuid: U(3), fe: 'u-ll', role: 'landlord', name: 'Lindi Landlord' },
      { uuid: U(4), fe: 'u-tenant', role: 'tenant', name: 'Tina Tenant' },
      { uuid: U(5), fe: 'u-admin', role: 'client_admin', name: 'Ann Admin' },
      { uuid: U(6), fe: 'u-gone', role: 'super_admin', name: 'Old Super', active: false },
    ]
    db.events = new Map()
    db.map = new Map()
    db.notes = []
  })

  it('routes every role’s ticket to the super admins and stamps the submitter from the session', async () => {
    const { createSupportTicket } = await mod()
    for (const actor of [tenant, landlord, agencyAdmin, { userId: 'u-co', role: 'contractor', agencyId: 'ag-horizon' } as DemoActor]) {
      db.notes = []
      const t = await createSupportTicket(actor, {
        id: `HD-${actor.role}`,
        subject: 'Cannot open page',
        body: 'It errors',
        category: 'bug',
        pageUrl: 'https://app/workspace/x',
        // forged fields are ignored
        ...({ submittedByUserId: 'u-someone', agencyId: 'ag-cape', status: 'resolved' } as object),
      }, 'UA/1')
      expect(t.agencyId).toBeNull()
      expect(t.status).toBe('new')
      expect(t.submittedByUserId).toBe(actor.userId)
      expect(t.submitterRole).toBe(actor.role)
      expect(t.pageUrl).toBe('https://app/workspace/x')
      expect(t.userAgent).toBe('UA/1')
      // every active super admin, never the inactive one
      expect(db.notes.map((n) => n.user).sort()).toEqual([U(1), U(2)])
      expect(db.notes[0].link).toBe(`/workspace/help?ticket=HD-${actor.role}`)
    }
  })

  it('refuses an empty ticket and a duplicate id', async () => {
    const { createSupportTicket } = await mod()
    await expect(createSupportTicket(tenant, { subject: '', body: 'x' })).rejects.toMatchObject({ status: 400 })
    await createSupportTicket(tenant, { id: 'HD-dup', subject: 's', body: 'b' })
    await expect(createSupportTicket(landlord, { id: 'HD-dup', subject: 's', body: 'b' })).rejects.toMatchObject({ status: 409 })
  })

  it('notifies the reporter when support replies or changes the status, and support when the reporter replies', async () => {
    const { createSupportTicket, actOnSupportTicket } = await mod()
    await createSupportTicket(landlord, { id: 'HD-1', subject: 'Statement', body: 'Blank PDF' })
    db.notes = []
    const replied = await actOnSupportTicket(superA, 'HD-1', { action: 'reply', body: 'Looking now' })
    expect(replied.status).toBe('in_progress')
    expect(db.notes.map((n) => n.user)).toEqual([U(3)])
    expect(db.notes[0].title).toMatch(/Support replied/)

    db.notes = []
    await actOnSupportTicket(superA, 'HD-1', { action: 'status', status: 'waiting_on_user' })
    expect(db.notes.map((n) => n.user)).toEqual([U(3)])
    expect(db.notes[0].body).toMatch(/more information/)

    db.notes = []
    const back = await actOnSupportTicket(landlord, 'HD-1', { action: 'reply', body: 'Here is a screenshot' })
    expect(back.status).toBe('in_progress')
    expect(db.notes.map((n) => n.user).sort()).toEqual([U(1), U(2)])
  })

  it('sends reporter replies only to the assignee once assigned, and only to a real super admin', async () => {
    const { createSupportTicket, actOnSupportTicket } = await mod()
    await createSupportTicket(tenant, { id: 'HD-2', subject: 's', body: 'b' })
    await expect(actOnSupportTicket(superA, 'HD-2', { action: 'assign', assigneeUserId: 'u-admin' })).rejects.toMatchObject({ status: 400 })
    await expect(actOnSupportTicket(superA, 'HD-2', { action: 'assign', assigneeUserId: 'u-gone' })).rejects.toMatchObject({ status: 400 })
    db.notes = []
    const t = await actOnSupportTicket(superA, 'HD-2', { action: 'assign', assigneeUserId: 'u-super2' })
    expect(t.assigneeUserId).toBe('u-super2')
    expect(t.assigneeName).toBe('Sue Super')
    expect(db.notes.map((n) => n.user)).toEqual([U(2)])
    db.notes = []
    await actOnSupportTicket(tenant, 'HD-2', { action: 'reply', body: 'any news?' })
    expect(db.notes.map((n) => n.user)).toEqual([U(2)])
  })

  it('keeps internal notes from the reporter and notifies nobody', async () => {
    const { createSupportTicket, actOnSupportTicket } = await mod()
    await createSupportTicket(tenant, { id: 'HD-3', subject: 's', body: 'b' })
    db.notes = []
    const desk = await actOnSupportTicket(superA, 'HD-3', { action: 'reply', body: 'user is on old browser', internal: true })
    expect(desk.replies?.some((r) => r.internal)).toBe(true)
    expect(desk.status).toBe('new')
    expect(db.notes).toEqual([])
    const mine = await actOnSupportTicket(tenant, 'HD-3', { action: 'reply', body: 'hello?' })
    expect(mine.replies?.some((r) => r.internal)).toBe(false)
  })

  it('refuses the reporter desk actions, other users everything, and an agency admin on a platform ticket', async () => {
    const { createSupportTicket, actOnSupportTicket } = await mod()
    await createSupportTicket(tenant, { id: 'HD-4', subject: 's', body: 'b' })
    for (const act of [
      { action: 'status', status: 'resolved' },
      { action: 'priority', priority: 'urgent' },
      { action: 'assign', assigneeUserId: 'u-super' },
      { action: 'reply', body: 'x', internal: true },
    ]) {
      await expect(actOnSupportTicket(tenant, 'HD-4', act)).rejects.toMatchObject({ status: 403 })
    }
    await expect(actOnSupportTicket(landlord, 'HD-4', { action: 'reply', body: 'x' })).rejects.toMatchObject({ status: 403 })
    await expect(actOnSupportTicket(agencyAdmin, 'HD-4', { action: 'reply', body: 'x' })).rejects.toMatchObject({ status: 403 })
    await expect(actOnSupportTicket(tenant, 'HD-missing', { action: 'reply', body: 'x' })).rejects.toMatchObject({ status: 404 })
  })

  it('lets the reporter reopen a resolved ticket and rate it once closed', async () => {
    const { createSupportTicket, actOnSupportTicket } = await mod()
    await createSupportTicket(tenant, { id: 'HD-5', subject: 's', body: 'b' })
    await actOnSupportTicket(superB, 'HD-5', { action: 'status', status: 'resolved' })
    await expect(actOnSupportTicket(tenant, 'HD-5', { action: 'rate', rating: 9 })).rejects.toMatchObject({ status: 403 })
    const reopened = await actOnSupportTicket(tenant, 'HD-5', { action: 'reopen', body: 'Still broken' })
    expect(reopened.status).toBe('in_progress')
    await actOnSupportTicket(superB, 'HD-5', { action: 'status', status: 'resolved' })
    const rated = await actOnSupportTicket(tenant, 'HD-5', { action: 'rate', rating: 4, comment: 'quick' })
    expect(rated.rating).toBe(4)
    await expect(actOnSupportTicket(tenant, 'HD-5', { action: 'rate', rating: 5 })).rejects.toMatchObject({ status: 403 })
    const closed = await actOnSupportTicket(tenant, 'HD-5', { action: 'close' })
    expect(closed.status).toBe('closed')
    await expect(actOnSupportTicket(tenant, 'HD-5', { action: 'reply', body: 'x' })).rejects.toMatchObject({ status: 403 })
  })
})
