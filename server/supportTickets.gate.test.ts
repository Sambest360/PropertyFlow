/**
 * CR7 help desk — real scope gate (assertPersistAllowed) + real writer
 * (handlePersist → upsertSupportTicket) + real bootstrap filter.
 * Only the Postgres driver is replaced: an in-memory entity_id_map + event_log
 * that applies the writer's INSERT … ON CONFLICT … WHERE semantics.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENCY_TO_CLIENT } from './idMap.js'
import { buildPropertyScope } from '../src/lib/scope.js'
import { SUPPORT_TICKET_RESOLUTION_KEYS } from '../src/lib/supportTickets.js'
import type { DemoActor } from './actor.js'

type EventRow = {
  id: string
  client_id: string | null
  event_type: string
  subject_type: string
  actor_user_id: string | null
  payload: Record<string, unknown>
}

const db = vi.hoisted(() => ({
  map: [] as Array<{ entity_type: string; frontend_id: string; backend_id: string }>,
  events: new Map<string, EventRow>(),
  /** clients.settings.enabledPermissions by client uuid. */
  clientPerms: new Map<string, string[]>(),
}))
const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

const HORIZON = AGENCY_TO_CLIENT['ag-horizon']!
const CAPE = AGENCY_TO_CLIENT['ag-cape']!

function fakeQuery(sql: string, params: unknown[] = []): unknown[] {
  if (/CREATE (TABLE|UNIQUE INDEX)/.test(sql)) return []
  if (sql.includes('INSERT INTO entity_id_map')) {
    const update = /DO UPDATE/i.test(sql)
    for (let i = 0; i + 2 < params.length; i += 3) {
      const [et, fe, be] = [String(params[i]), String(params[i + 1]), String(params[i + 2])]
      const hit = db.map.find((r) => r.entity_type === et && r.frontend_id === fe)
      if (hit) {
        if (update) hit.backend_id = be
      } else if (!db.map.some((r) => r.entity_type === et && r.backend_id === be)) {
        db.map.push({ entity_type: et, frontend_id: fe, backend_id: be })
      }
    }
    return []
  }
  if (sql.includes('FROM entity_id_map') && sql.includes('ANY($1::text[]) AND frontend_id')) {
    const types = params[0] as string[]
    const fes = params[1] as string[]
    return db.map
      .filter((r) => types.includes(r.entity_type) && fes.includes(r.frontend_id))
      .slice(0, 1)
      .map((r) => ({ backend_id: r.backend_id }))
  }
  if (sql.includes('FROM entity_id_map')) return db.map
  if (sql.includes("settings->'enabledPermissions'") && sql.includes('FROM clients')) {
    return [{ enabled: db.clientPerms.get(String(params[0])) ?? null }]
  }
  if (sql.includes('FROM users')) return []
  if (sql.includes('FROM clients')) return []
  if (sql.includes('FROM units') || sql.includes('FROM applications') || sql.includes('FROM leases')) return []
  if (sql.includes('FROM maintenance_tickets')) return []
  if (sql.includes('FROM event_log WHERE id')) {
    const r = db.events.get(String(params[0]))
    if (!r) return []
    return [
      {
        event_type: r.event_type,
        client_id: r.client_id,
        status: (r.payload.status as string) ?? null,
        submitted_by: (r.payload.submittedByUserId as string) ?? null,
      },
    ]
  }
  if (sql.includes('INSERT INTO event_log') && sql.includes("'support_ticket'")) {
    const [id, client, actor, insertJson, patchJson] = params as [
      string,
      string | null,
      string | null,
      string,
      string,
    ]
    const existing = db.events.get(id)
    if (!existing) {
      db.events.set(id, {
        id,
        client_id: client,
        event_type: 'support_ticket',
        subject_type: 'support_ticket',
        actor_user_id: actor,
        payload: JSON.parse(insertJson),
      })
      return []
    }
    // ON CONFLICT (id) DO UPDATE SET payload = payload || patch
    // WHERE event_type = 'support_ticket' AND status <> 'resolved'
    if (existing.event_type === 'support_ticket' && existing.payload.status !== 'resolved') {
      existing.payload = { ...existing.payload, ...JSON.parse(patchJson) }
    }
    return []
  }
  throw new Error(`unexpected sql: ${sql.slice(0, 160)}`)
}

async function gateAndPersist(actor: DemoActor, body: { action: 'upsert' | 'delete'; id: string; data?: Record<string, unknown> }) {
  const { assertPersistAllowed } = await import('./scopeGate.js')
  const { handlePersist } = await import('./writes.js')
  const op = { resource: 'support_ticket' as const, ...body }
  await assertPersistAllowed(actor, op)
  return handlePersist(op)
}

async function rowFor(feId: string): Promise<EventRow | undefined> {
  const hit = db.map.find((r) => r.entity_type === 'support_ticket' && r.frontend_id === feId)
  return hit ? db.events.get(hit.backend_id) : undefined
}

const tenant: DemoActor = { userId: 'u-tenant-h', role: 'tenant', agencyId: 'ag-horizon' }
const horizonAdmin: DemoActor = { userId: 'u-admin-h', role: 'agent_admin', agencyId: 'ag-horizon' }
const capeAdmin: DemoActor = { userId: 'u-admin-c', role: 'client_admin', agencyId: 'ag-cape' }
const superAdmin: DemoActor = { userId: 'u-super', role: 'super_admin', agencyId: null }

describe('CR7 support tickets — scope gate + writer', () => {
  beforeEach(() => {
    db.map = []
    db.events = new Map()
    db.clientPerms = new Map()
    query.mockReset()
    query.mockImplementation(async (sql: string, params?: unknown[]) => fakeQuery(sql, params ?? []))
  })

  it('forces an insert to open even if the payload says resolved', async () => {
    await gateAndPersist(tenant, {
      action: 'upsert',
      id: 'HD-forced',
      data: {
        subject: 'Cannot see my lease',
        body: 'The lease tab is empty.',
        submittedByUserId: 'u-tenant-h',
        submitterName: 'Tina Tenant',
        status: 'resolved',
        resolutionNote: 'self-resolved',
        resolvedByUserId: 'u-tenant-h',
      },
    })
    const row = await rowFor('HD-forced')
    expect(row?.payload.status).toBe('open')
    expect(row?.payload.resolutionNote).toBeUndefined()
    expect(row?.payload.resolvedByUserId).toBeUndefined()

    // Writer on its own (gate bypassed) still stores open.
    const { handlePersist } = await import('./writes.js')
    await handlePersist({
      resource: 'support_ticket',
      action: 'upsert',
      id: 'HD-writer-only',
      data: { subject: 's', body: 'b', submittedByUserId: 'u-x', status: 'resolved' },
    })
    expect((await rowFor('HD-writer-only'))?.payload.status).toBe('open')
  })

  it('routes a tenant ticket to their agency and an agency staff ticket to the platform', async () => {
    await gateAndPersist(tenant, {
      action: 'upsert',
      id: 'HD-route-tenant',
      // A forged agency in the payload is ignored — the server derives it.
      data: { subject: 's', body: 'b', submittedByUserId: 'u-tenant-h', agencyId: 'ag-cape' },
    })
    expect((await rowFor('HD-route-tenant'))?.client_id).toBe(HORIZON)

    await gateAndPersist(horizonAdmin, {
      action: 'upsert',
      id: 'HD-route-staff',
      data: { subject: 's', body: 'b', submittedByUserId: 'u-admin-h', agencyId: 'ag-horizon' },
    })
    const staff = await rowFor('HD-route-staff')
    expect(staff?.client_id).toBeNull()
    expect(staff?.payload.submitterRole).toBe('agent_admin')
  })

  it('refuses a non-submitter inserting as someone else', async () => {
    await expect(
      gateAndPersist(tenant, {
        action: 'upsert',
        id: 'HD-impersonate',
        data: { subject: 's', body: 'b', submittedByUserId: 'u-someone-else' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(await rowFor('HD-impersonate')).toBeUndefined()
  })

  it('gives 403 when an agency admin resolves another agency’s ticket', async () => {
    await gateAndPersist(tenant, {
      action: 'upsert',
      id: 'HD-horizon',
      data: { subject: 'Horizon subject', body: 'Horizon body', submittedByUserId: 'u-tenant-h' },
    })
    await expect(
      gateAndPersist(capeAdmin, {
        action: 'upsert',
        id: 'HD-horizon',
        data: { status: 'resolved', resolutionNote: 'not mine' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect((await rowFor('HD-horizon'))?.payload.status).toBe('open')
    expect(CAPE).not.toBe(HORIZON)
  })

  it('gives 403 when an agency admin resolves a platform ticket', async () => {
    await gateAndPersist(horizonAdmin, {
      action: 'upsert',
      id: 'HD-platform',
      data: { subject: 's', body: 'b', submittedByUserId: 'u-admin-h' },
    })
    expect((await rowFor('HD-platform'))?.client_id).toBeNull()
    await expect(
      gateAndPersist(horizonAdmin, {
        action: 'upsert',
        id: 'HD-platform',
        data: { status: 'resolved', resolutionNote: 'own ticket' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    // Super admin can.
    await gateAndPersist(superAdmin, {
      action: 'upsert',
      id: 'HD-platform',
      data: { status: 'resolved', resolutionNote: 'Handled by support' },
    })
    expect((await rowFor('HD-platform'))?.payload.status).toBe('resolved')
  })

  it('leaves subject and body unchanged on resolve, and the row read-only after', async () => {
    await gateAndPersist(tenant, {
      action: 'upsert',
      id: 'HD-resolve',
      data: {
        subject: 'Original subject',
        body: 'Original body',
        submittedByUserId: 'u-tenant-h',
        submitterName: 'Tina Tenant',
      },
    })
    await gateAndPersist(horizonAdmin, {
      action: 'upsert',
      id: 'HD-resolve',
      data: {
        status: 'resolved',
        resolutionNote: 'Reset your access.',
        resolvedByName: 'Hana Admin',
        subject: 'TAMPERED',
        body: 'TAMPERED',
        submittedByUserId: 'u-admin-h',
        agencyId: 'ag-cape',
      },
    })
    const row = await rowFor('HD-resolve')
    expect(row?.payload).toMatchObject({
      subject: 'Original subject',
      body: 'Original body',
      submittedByUserId: 'u-tenant-h',
      submitterName: 'Tina Tenant',
      status: 'resolved',
      resolvedByUserId: 'u-admin-h',
      resolutionNote: 'Reset your access.',
    })
    expect(row?.client_id).toBe(HORIZON)

    // The patch the writer sent carries only resolution keys.
    const insertCalls = query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO event_log'))
    const patch = JSON.parse(String((insertCalls.at(-1)![1] as unknown[])[4]))
    expect(Object.keys(patch).every((k) => (SUPPORT_TICKET_RESOLUTION_KEYS as readonly string[]).includes(k))).toBe(true)

    // No reopen / second resolve.
    await expect(
      gateAndPersist(superAdmin, {
        action: 'upsert',
        id: 'HD-resolve',
        data: { status: 'resolved', resolutionNote: 'again' },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('gives 403 for a non-ticket event_log UUID', async () => {
    const ACTIVITY_UUID = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'
    db.events.set(ACTIVITY_UUID, {
      id: ACTIVITY_UUID,
      client_id: HORIZON,
      event_type: 'activity',
      subject_type: 'agency',
      actor_user_id: null,
      payload: { text: 'Lease signed', user: 'System' },
    })
    for (const [actor, data] of [
      [tenant, { subject: 's', body: 'b', submittedByUserId: 'u-tenant-h' }],
      [horizonAdmin, { status: 'resolved', resolutionNote: 'x' }],
      [superAdmin, { status: 'resolved', resolutionNote: 'x' }],
    ] as const) {
      await expect(
        gateAndPersist(actor, { action: 'upsert', id: ACTIVITY_UUID, data: { ...data } }),
      ).rejects.toMatchObject({ status: 403 })
    }
    const row = db.events.get(ACTIVITY_UUID)
    expect(row?.event_type).toBe('activity')
    expect(row?.payload).toEqual({ text: 'Lease signed', user: 'System' })
  })

  it('gives 403 when the agency has users.manage turned off (effectiveCan)', async () => {
    await gateAndPersist(tenant, {
      action: 'upsert',
      id: 'HD-pack-off',
      data: { subject: 's', body: 'b', submittedByUserId: 'u-tenant-h' },
    })
    db.clientPerms.set(HORIZON, ['assets.view', 'maintenance.view', 'messages.manage'])
    const { resolveActorUsersManage } = await import('./scopeGate.js')
    expect(await resolveActorUsersManage(horizonAdmin)).toBe(false)
    await expect(
      gateAndPersist(horizonAdmin, {
        action: 'upsert',
        id: 'HD-pack-off',
        data: { status: 'resolved', resolutionNote: 'blocked' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect((await rowFor('HD-pack-off'))?.payload.status).toBe('open')

    // Pack back on → the same admin may resolve.
    db.clientPerms.set(HORIZON, ['users.manage', 'assets.view'])
    expect(await resolveActorUsersManage(horizonAdmin)).toBe(true)
    await gateAndPersist(horizonAdmin, {
      action: 'upsert',
      id: 'HD-pack-off',
      data: { status: 'resolved', resolutionNote: 'ok' },
    })
    expect((await rowFor('HD-pack-off'))?.payload.status).toBe('resolved')
  })

  it('allows delete for super admin only', async () => {
    await gateAndPersist(tenant, {
      action: 'upsert',
      id: 'HD-delete',
      data: { subject: 's', body: 'b', submittedByUserId: 'u-tenant-h' },
    })
    const { assertPersistAllowed } = await import('./scopeGate.js')
    for (const actor of [tenant, horizonAdmin]) {
      await expect(
        assertPersistAllowed(actor, { resource: 'support_ticket', action: 'delete', id: 'HD-delete' }),
      ).rejects.toMatchObject({ status: 403 })
    }
    await expect(
      assertPersistAllowed(superAdmin, { resource: 'support_ticket', action: 'delete', id: 'HD-delete' }),
    ).resolves.toEqual({})
  })
})

describe('CR7 support tickets — bootstrap filter', () => {
  const tickets = [
    { id: 'HD-t1', agencyId: 'ag-horizon', submittedByUserId: 'u-tenant-h' },
    { id: 'HD-t2', agencyId: 'ag-horizon', submittedByUserId: 'u-other-tenant' },
    { id: 'HD-c1', agencyId: 'ag-cape', submittedByUserId: 'u-tenant-c' },
    { id: 'HD-p1', agencyId: null, submittedByUserId: 'u-admin-h' },
    { id: 'HD-p2', agencyId: null, submittedByUserId: 'u-agent-h' },
  ]
  const raw = {
    source: 'test',
    fetchedAt: '2026-10-09T10:00:00.000Z',
    agencies: [{ id: 'ag-horizon' }, { id: 'ag-cape' }],
    users: [],
    buildings: [],
    units: [],
    properties: [],
    leads: [],
    applications: [],
    tenancies: [],
    viewings: [],
    payments: [],
    propertyDocuments: [],
    tickets: [],
    threads: [],
    messages: [],
    notifications: [],
    supportTickets: tickets,
  }
  const run = async (actor: DemoActor, usersManage?: boolean) => {
    const { filterBootstrapForActor } = await import('./scopeGate.js')
    const scope = buildPropertyScope(
      { role: actor.role, userId: actor.userId, agencyId: actor.agencyId, agencySuspended: false },
      { properties: [] },
    )
    return (filterBootstrapForActor(raw, actor, scope, undefined, { usersManage }).supportTickets ?? []).map(
      (t) => (t as { id: string }).id,
    )
  }

  it('shows a tenant only their own tickets', async () => {
    expect(await run(tenant)).toEqual(['HD-t1'])
  })

  it('shows a ground agent only their own tickets (no desk)', async () => {
    expect(await run({ userId: 'u-agent-h', role: 'ground_agent', agencyId: 'ag-horizon' })).toEqual([
      'HD-p2',
    ])
  })

  it('shows an agency admin their agency desk plus their own, never other platform or other agency tickets', async () => {
    expect((await run(horizonAdmin)).sort()).toEqual(['HD-p1', 'HD-t1', 'HD-t2'])
    expect(await run(capeAdmin)).toEqual(['HD-c1'])
  })

  it('drops the agency desk when users.manage is off for the agency admin', async () => {
    expect(await run(horizonAdmin, false)).toEqual(['HD-p1'])
  })

  it('shows super admin all tickets', async () => {
    expect((await run(superAdmin)).sort()).toEqual(['HD-c1', 'HD-p1', 'HD-p2', 'HD-t1', 'HD-t2'])
  })
})
