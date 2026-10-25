/**
 * Tenant faults (server/faultDesk.ts): a new fault reaches the responsible
 * person for that property (assigned agent, else agency admins) and the
 * landlord; the thread is limited to the people on the ticket; confirm /
 * reopen are the reporter's; replies notify the other side.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DemoActor } from './actor.js'

const CLIENT = 'c0000000-0000-4000-8000-000000000001'
const OTHER_CLIENT = 'c0000000-0000-4000-8000-000000000002'
const U = (n: number) => `b0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const TICKET = 'd0000000-0000-4000-8000-000000000001'

type Ticket = {
  id: string
  client_id: string
  unit_id: string
  lease_id: string | null
  reported_by: string | null
  assigned_to: string | null
  contractor_id: string | null
  status: string
  title: string
  priority: string
  landlord_id: string | null
  unit_agent_id: string | null
  lease_tenant_id: string | null
}

const db = vi.hoisted(() => ({
  users: [] as Array<{ uuid: string; fe: string; role: string; client: string | null; name: string }>,
  ticket: null as Ticket | null,
  thread: [] as Array<{ id: string; payload: Record<string, unknown>; created_at: string }>,
  notes: [] as Array<{ user: string; title: string; link: string }>,
  inScope: new Set<string>(),
}))

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string, params: unknown[] = []) => fake(sql, params)),
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
}))
vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: async () => undefined,
  resolveUuid: async (type: string, fe: string) => {
    if (type === 'user') return db.users.find((u) => u.fe === fe)?.uuid ?? null
    if (type === 'ticket') return fe === 'MT-1' ? TICKET : null
    return null
  },
  ensureUuid: async () => 'x',
}))
vi.mock('./idMapCache.js', () => ({
  loadIdMapCache: async () => ({}),
  feUserFromCache: (_c: unknown, uuid: string | null) => db.users.find((u) => u.uuid === uuid)?.fe ?? null,
  fePropertyFromUnitCache: () => 'p-1',
  feAgencyFromCache: (_c: unknown, id: string) => (id === CLIENT ? 'ag-horizon' : 'ag-cape'),
}))
vi.mock('./scopeGate.js', () => ({
  agencyFeId: async (id: string | null) => id,
  actorIdAliases: async (a: DemoActor) => new Set([a.userId]),
  resolveActorUsersManage: async () => true,
  buildActorPropertyScope: async (a: DemoActor) => ({ actor: a }),
}))
// Staff book: only actors listed in db.inScope hold this property.
vi.mock('../src/lib/scope.js', () => ({
  ticketInScope: (scope: { actor: DemoActor }) => db.inScope.has(scope.actor.userId),
}))

function fake(sql: string, p: unknown[]): unknown[] {
  if (sql.includes('FROM maintenance_tickets t')) return db.ticket ? [{ ...db.ticket }] : []
  if (sql.includes('FROM users') && sql.includes("role IN ('AGENCY_ADMIN'")) {
    return db.users.filter((u) => u.client === p[0] && (u.role === 'client_admin' || u.role === 'agent_admin')).map((u) => ({ id: u.uuid }))
  }
  if (sql.includes('CONCAT_WS')) return [{ name: db.users.find((u) => u.uuid === p[0])?.name ?? null }]
  if (sql.startsWith('INSERT INTO notifications')) {
    db.notes.push({ user: String(p[1]), title: String(p[2]), link: String(p[4]) })
    return []
  }
  if (sql.includes("INSERT INTO event_log") && sql.includes("'fault_thread'")) {
    db.thread.push({ id: `e${db.thread.length}`, payload: JSON.parse(String(p[3])), created_at: '2026-10-20T08:00:00.000Z' })
    return []
  }
  if (sql.includes("event_type = 'fault_thread'")) return db.thread.map((r) => ({ ...r }))
  if (sql.startsWith('UPDATE maintenance_tickets')) {
    if (db.ticket) db.ticket.status = 'OPEN'
    return []
  }
  throw new Error(`unexpected sql: ${sql.slice(0, 120)}`)
}

const tenant: DemoActor = { userId: 'u-tenant', role: 'tenant', agencyId: null }
const otherTenant: DemoActor = { userId: 'u-tenant2', role: 'tenant', agencyId: null }
const agent: DemoActor = { userId: 'u-agent', role: 'ground_agent', agencyId: 'ag-horizon' }
const outsideAgent: DemoActor = { userId: 'u-agent-c', role: 'ground_agent', agencyId: 'ag-cape' }
const landlord: DemoActor = { userId: 'u-ll', role: 'landlord', agencyId: 'ag-horizon' }
const otherLandlord: DemoActor = { userId: 'u-ll2', role: 'landlord', agencyId: 'ag-horizon' }

function baseTicket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: TICKET,
    client_id: CLIENT,
    unit_id: 'unit-1',
    lease_id: null,
    reported_by: U(1),
    assigned_to: U(3),
    contractor_id: null,
    status: 'OPEN',
    title: 'Geyser leaking',
    priority: 'MEDIUM',
    landlord_id: U(5),
    unit_agent_id: U(3),
    lease_tenant_id: null,
    ...over,
  }
}

describe('tenant fault routing', () => {
  beforeEach(() => {
    db.users = [
      { uuid: U(1), fe: 'u-tenant', role: 'tenant', client: null, name: 'Tina Tenant' },
      { uuid: U(2), fe: 'u-tenant2', role: 'tenant', client: null, name: 'Tom Tenant' },
      { uuid: U(3), fe: 'u-agent', role: 'ground_agent', client: CLIENT, name: 'Gina Agent' },
      { uuid: U(4), fe: 'u-admin', role: 'client_admin', client: CLIENT, name: 'Ann Admin' },
      { uuid: U(5), fe: 'u-ll', role: 'landlord', client: CLIENT, name: 'Lindi Landlord' },
      { uuid: U(6), fe: 'u-ll2', role: 'landlord', client: CLIENT, name: 'Leo Landlord' },
      { uuid: U(7), fe: 'u-admin-c', role: 'client_admin', client: OTHER_CLIENT, name: 'Cape Admin' },
      { uuid: U(8), fe: 'u-agent-c', role: 'ground_agent', client: OTHER_CLIENT, name: 'Cape Agent' },
    ]
    db.ticket = baseTicket()
    db.thread = []
    db.notes = []
    db.inScope = new Set(['u-agent', 'u-admin'])
  })

  it('sends a new fault to the assigned agent and the owning landlord, not the agency admins', async () => {
    const { notifyFaultReported } = await import('./faultDesk.js')
    await notifyFaultReported(tenant, TICKET, 'MT-1')
    expect(db.notes.map((n) => n.user).sort()).toEqual([U(3), U(5)])
    expect(db.notes.find((n) => n.user === U(3))?.link).toBe('/workspace/operations/maintenance/MT-1')
  })

  it('falls back to the unit agent, then to that agency’s admins only', async () => {
    const { notifyFaultReported } = await import('./faultDesk.js')
    db.ticket = baseTicket({ assigned_to: null, unit_agent_id: U(3) })
    await notifyFaultReported(tenant, TICKET, 'MT-1')
    expect(db.notes.map((n) => n.user)).toContain(U(3))
    db.notes = []
    db.ticket = baseTicket({ assigned_to: null, unit_agent_id: null, landlord_id: null })
    await notifyFaultReported(tenant, TICKET, 'MT-1')
    expect(db.notes.map((n) => n.user)).toEqual([U(4)])
  })

  it('flags an emergency in the title', async () => {
    const { notifyFaultReported } = await import('./faultDesk.js')
    db.ticket = baseTicket({ priority: 'EMERGENCY' })
    await notifyFaultReported(tenant, TICKET, 'MT-1')
    expect(db.notes.every((n) => n.title.startsWith('EMERGENCY'))).toBe(true)
  })

  it('opens the thread to the reporter, staff in scope and the owning landlord only', async () => {
    const { getFaultThread } = await import('./faultDesk.js')
    expect((await getFaultThread(tenant, 'MT-1')).access).toBe('reporter')
    expect((await getFaultThread(agent, 'MT-1')).access).toBe('staff')
    expect((await getFaultThread(landlord, 'MT-1')).access).toBe('landlord')
    for (const who of [otherTenant, outsideAgent, otherLandlord]) {
      await expect(getFaultThread(who, 'MT-1')).rejects.toMatchObject({ status: 403 })
    }
    await expect(getFaultThread(tenant, 'MT-404')).rejects.toMatchObject({ status: 404 })
  })

  it('lets the tenant on the linked lease in even when staff reported it', async () => {
    const { getFaultThread } = await import('./faultDesk.js')
    db.ticket = baseTicket({ reported_by: U(3), lease_tenant_id: U(1) })
    expect((await getFaultThread(tenant, 'MT-1')).access).toBe('reporter')
  })

  it('notifies the responsible agent when the tenant replies, and the tenant when staff reply', async () => {
    const { postFaultThread } = await import('./faultDesk.js')
    await postFaultThread(tenant, 'MT-1', { action: 'reply', body: 'Water on the floor now' })
    expect(db.notes.map((n) => n.user)).toEqual([U(3)])
    db.notes = []
    await postFaultThread(agent, 'MT-1', { action: 'reply', body: 'Plumber booked for 10am' })
    expect(db.notes.map((n) => n.user)).toEqual([U(1)])
    expect(db.notes[0].link).toBe('/workspace/portals/tenant/maintenance')
  })

  it('hides staff internal notes from the tenant and sends no notification', async () => {
    const { postFaultThread, getFaultThread } = await import('./faultDesk.js')
    await postFaultThread(agent, 'MT-1', { action: 'reply', body: 'Tenant may be liable', internal: true })
    expect(db.notes).toEqual([])
    expect((await getFaultThread(tenant, 'MT-1')).entries).toEqual([])
    expect((await getFaultThread(agent, 'MT-1')).entries).toHaveLength(1)
    await expect(postFaultThread(tenant, 'MT-1', { action: 'reply', body: 'x', internal: true })).rejects.toMatchObject({ status: 403 })
  })

  it('lets only the reporter confirm or reopen, and only once it is fixed; reopen puts it back to open', async () => {
    const { postFaultThread } = await import('./faultDesk.js')
    await expect(postFaultThread(tenant, 'MT-1', { action: 'confirm' })).rejects.toMatchObject({ status: 403 })
    db.ticket!.status = 'COMPLETED'
    await expect(postFaultThread(agent, 'MT-1', { action: 'confirm' })).rejects.toMatchObject({ status: 403 })
    await expect(postFaultThread(landlord, 'MT-1', { action: 'reopen', body: 'no' })).rejects.toMatchObject({ status: 403 })
    db.notes = []
    const r = await postFaultThread(tenant, 'MT-1', { action: 'reopen', body: 'Still leaking' })
    expect(r.status).toBe('Requested')
    expect(db.ticket!.status).toBe('OPEN')
    expect(db.notes.map((n) => n.user)).toEqual([U(3)])
    expect(db.notes[0].title).toMatch(/reopened/)
    db.ticket!.status = 'COMPLETED'
    db.notes = []
    await postFaultThread(tenant, 'MT-1', { action: 'confirm', rating: 5 })
    expect(db.thread.at(-1)?.payload).toMatchObject({ kind: 'confirmed', rating: 5, authorUserId: 'u-tenant' })
    expect(db.notes[0].title).toMatch(/confirmed fixed.*5\/5/)
  })
})
