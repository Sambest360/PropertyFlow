import { describe, expect, it, vi } from 'vitest'

// The routes import db / entityMap / scopeGate defaults; the tests inject every
// dependency, so the modules are stubbed only to keep the import side-effect free.
vi.mock('./db.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), databaseConfigured: true }))
vi.mock('./scopeGate.js', () => ({ agencyFeId: vi.fn() }))

import {
  createRuleSet,
  forwardToBodyCorporate,
  getRuleSet,
  getUnitMaintenanceCategories,
  listRuleSets,
  parseRuleItems,
  patchTicketResponsibility,
  updateRuleSet,
  type RuleRouteDeps,
} from './maintenanceRuleRoutes.js'
import type { DemoActor } from './actor.js'

/**
 * Migration 029 routes, deps-injected fakes (as leaseReminders.test.ts).
 * Two agencies; agency B's staff must never read or change agency A's rules.
 */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const AG_A = id(0xa1)
const AG_B = id(0xa2)
const U = {
  agentA: id(101),
  adminA: id(102),
  agentB: id(201),
  tenant: id(301),
  otherTenant: id(302),
  landlord: id(401),
}
const UNIT_A = id(501)
const SET_A = id(601)
const SET_A_ITEM = id(602)
const TICKET_A = id(701)

const actor = (userId: string, role: DemoActor['role'], agencyId: string | null): DemoActor => ({ userId, role, agencyId })
const AGENT_A = actor(U.agentA, 'agent', 'ag-a')
const ADMIN_A = actor(U.adminA, 'client_admin', 'ag-a')
const AGENT_B = actor(U.agentB, 'client_admin', 'ag-b')
const TENANT = actor(U.tenant, 'tenant', null)
const OTHER_TENANT = actor(U.otherTenant, 'tenant', null)

type Call = { sql: string; params: unknown[] }

function world(opts: { ticketParty?: string | null; unitType?: string } = {}) {
  const calls: Call[] = []
  const sets: Array<Record<string, unknown>> = [
    {
      id: SET_A,
      client_id: AG_A,
      unit_id: UNIT_A,
      property_type: null,
      name: 'E2E TEST unit rules',
      version: 1,
      active: true,
      source_document_id: null,
      source_url: 'https://e2e.example.com/conduct-rules.pdf',
      body_corporate_email: 'e2e-managing-agent@example.com',
    },
  ]
  const ticket = {
    id: TICKET_A,
    client_id: AG_A,
    unit_id: UNIT_A,
    title: 'E2E TEST lift broken',
    description: 'Stuck between floors',
    category_key: 'LIFT',
    responsible_party: opts.ticketParty === undefined ? 'BODY_CORPORATE' : opts.ticketParty,
    rule_item_id: SET_A_ITEM,
  }
  let txDepth = 0
  const deps: RuleRouteDeps & { calls: Call[]; inTx: () => boolean } = {
    calls,
    inTx: () => txDepth > 0,
    withTransaction: async (fn) => {
      txDepth++
      calls.push({ sql: 'BEGIN', params: [] })
      try {
        const out = await fn()
        calls.push({ sql: 'COMMIT', params: [] })
        return out
      } finally {
        txDepth--
      }
    },
    resolveUuid: async (_t, fe) => (/^0{8}-/.test(fe) ? fe : null),
    agencyFeId: async (v) => (v === AG_A || v === 'ag-a' ? 'ag-a' : v === AG_B || v === 'ag-b' ? 'ag-b' : null),
    tenantLeaseOnUnit: async (tenant, unit) => (tenant === U.tenant && unit === UNIT_A ? 'L-E2E-1' : null),
    query: async <T,>(sql: string, params: unknown[] = []) => {
      const q = sql.replace(/\s+/g, ' ').trim()
      calls.push({ sql: q, params })
      const rows = (r: unknown[]) => r as T[]
      if (q.includes('FROM units u LEFT JOIN buildings b')) {
        return params[0] === UNIT_A
          ? rows([{ id: UNIT_A, client_id: AG_A, agent_id: U.agentA, property_type: opts.unitType ?? 'apartment', unit_number: '7', building_name: 'E2E TEST Towers' }])
          : []
      }
      if (q.startsWith('SELECT agent_id::text AS agent_id FROM units')) return rows([{ agent_id: U.agentA }])
      if (q.includes('b.landlord_id::text AS landlord_id')) return rows([{ landlord_id: U.landlord }])
      if (q.startsWith('SELECT client_id::text AS client_id FROM users')) {
        return rows([{ client_id: params[0] === U.agentB ? AG_B : AG_A }])
      }
      if (q.startsWith('SELECT settings, phone FROM clients')) {
        return rows([{ settings: { maintenance: { afterHoursPhone: '+27 21 000 0000' } }, phone: '+27 21 111 1111' }])
      }
      if (q.startsWith('SELECT company_name FROM clients')) return rows([{ company_name: 'E2E TEST Agency A' }])
      if (q.includes('FROM maintenance_rule_sets WHERE unit_id = $1::uuid AND active ORDER BY')) {
        return rows(sets.filter((s) => s.unit_id === params[0] && s.active))
      }
      if (q.includes('FROM maintenance_rule_sets WHERE unit_id = $1::uuid AND active')) {
        return rows(sets.filter((s) => s.unit_id === params[0] && s.active))
      }
      if (q.includes('FROM maintenance_rule_sets WHERE id = $1::uuid')) return rows(sets.filter((s) => s.id === params[0]))
      if (q.includes('FROM maintenance_rule_sets WHERE active AND (client_id IS NULL')) {
        // A buggy filter returning every row: the route must still drop agency A's set for B.
        return rows(sets)
      }
      if (q.startsWith('UPDATE maintenance_rule_sets SET active = FALSE, updated_at = NOW() WHERE client_id')) {
        const hit = sets.filter((s) => s.client_id === params[0] && s.active && s.unit_id === params[1])
        hit.forEach((s) => (s.active = false))
        return rows(hit.map((s) => ({ version: s.version })))
      }
      if (q.startsWith('SELECT MAX(version)')) return rows([{ v: Math.max(...sets.map((s) => Number(s.version))) }])
      if (q.startsWith('INSERT INTO maintenance_rule_sets')) {
        const row = {
          id: id(600 + sets.length + 10),
          client_id: params[0],
          unit_id: params[1],
          property_type: params[2],
          name: params[3],
          source_document_id: params[4],
          source_url: params[5],
          body_corporate_email: params[6],
          version: params[7],
          active: true,
        }
        sets.push(row)
        return rows([{ id: row.id }])
      }
      if (q.includes('FROM maintenance_rule_items WHERE rule_set_id')) {
        return params[0] === SET_A
          ? rows([
              {
                id: SET_A_ITEM,
                category_key: 'LIFT',
                label: 'Lift broken',
                room_group: 'common',
                responsible_party: 'BODY_CORPORATE',
                guidance_text: '',
                clause_ref: '4.1',
                tenant_can_log: true,
                default_priority: 'HIGH',
                vendor_category_key: null,
                is_safety: false,
              },
              {
                id: id(603),
                category_key: 'PEST_CONTRACT',
                label: 'Pest control contract',
                room_group: 'general',
                responsible_party: 'LANDLORD',
                guidance_text: '',
                clause_ref: null,
                tenant_can_log: false,
                default_priority: 'LOW',
                vendor_category_key: null,
                is_safety: false,
              },
            ])
          : []
      }
      if (q.startsWith('SELECT label FROM maintenance_rule_items')) return rows([{ label: 'Lift broken' }])
      if (q.includes('FROM maintenance_tickets WHERE id = $1::uuid')) return params[0] === TICKET_A ? rows([ticket]) : []
      if (q.startsWith('UPDATE maintenance_tickets')) {
        ticket.responsible_party = String(params[1])
        return []
      }
      if (q.startsWith('INSERT INTO maintenance_ticket_updates')) return rows([{ id: id(801), created_at: '2026-10-23' }])
      return []
    },
  }
  return { deps, sets, ticket }
}

describe('GET /api/units/:id/maintenance-categories', () => {
  it('tenant with a lease: loggable items plus Emergency / Other, the after-hours number, no agent warnings', async () => {
    const { deps } = world()
    const out = await getUnitMaintenanceCategories(TENANT, UNIT_A, deps)
    const keys = out.categories.map((c) => c.categoryKey)
    expect(keys).toEqual(['LIFT', 'EMERGENCY', 'OTHER'])
    expect(out.afterHoursPhone).toBe('+27 21 000 0000')
    expect(out).not.toHaveProperty('warnings')
  })

  it('a tenant with no lease on the unit is refused', async () => {
    const { deps } = world()
    await expect(getUnitMaintenanceCategories(OTHER_TENANT, UNIT_A, deps)).rejects.toMatchObject({ status: 403 })
  })

  it('another agency’s staff are refused; own staff see rule warnings', async () => {
    const { deps } = world()
    await expect(getUnitMaintenanceCategories(AGENT_B, UNIT_A, deps)).rejects.toMatchObject({ status: 403 })
    const own = await getUnitMaintenanceCategories(AGENT_A, UNIT_A, deps)
    expect(own.warnings).toEqual([])
  })
})

describe('another agency can’t see rule sets (route)', () => {
  it('get / list by unit / list all never return agency A’s set to agency B', async () => {
    const { deps } = world()
    await expect(getRuleSet(AGENT_B, SET_A, deps)).rejects.toMatchObject({ status: 403 })
    await expect(listRuleSets(AGENT_B, { unitId: UNIT_A }, deps)).rejects.toMatchObject({ status: 403 })
    const listed = await listRuleSets(AGENT_B, {}, deps)
    expect('ruleSets' in listed && listed.ruleSets.map((s) => s.id)).toEqual([])
    const mine = await listRuleSets(AGENT_A, {}, deps)
    expect('ruleSets' in mine && mine.ruleSets.map((s) => s.id)).toEqual([SET_A])
  })

  it('tenants never read rule sets; another agency cannot write one', async () => {
    const { deps } = world()
    await expect(listRuleSets(TENANT, {}, deps)).rejects.toMatchObject({ status: 403 })
    await expect(updateRuleSet(AGENT_B, SET_A, { name: 'E2E TEST hijack' }, deps)).rejects.toMatchObject({ status: 403 })
    await expect(
      createRuleSet(AGENT_B, { unitId: UNIT_A, name: 'E2E TEST hijack', items: [{ categoryKey: 'X1', label: 'x', responsibleParty: 'TENANT' }] }, deps),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('rule set versions', () => {
  it('an update writes version 2 and deactivates version 1 in one transaction', async () => {
    const { deps, sets } = world()
    const out = await updateRuleSet(
      AGENT_A,
      SET_A,
      { items: [{ categoryKey: 'lift', label: 'Lift broken', responsibleParty: 'BODY_CORPORATE', defaultPriority: 'URGENT' }] },
      deps,
    )
    expect(out.version).toBe(2)
    expect(sets.find((s) => s.id === SET_A)!.active).toBe(false)
    const sqls = deps.calls.map((c) => c.sql)
    const begin = sqls.indexOf('BEGIN')
    const commit = sqls.indexOf('COMMIT')
    const deact = sqls.findIndex((s) => s.startsWith('UPDATE maintenance_rule_sets SET active = FALSE'))
    const item = sqls.findIndex((s) => s.startsWith('INSERT INTO maintenance_rule_items'))
    expect(begin).toBeLessThan(deact)
    expect(item).toBeLessThan(commit)
    expect(deps.calls[item]!.params.slice(1, 3)).toEqual(['LIFT', 'Lift broken'])
  })

  it('items are validated (400)', () => {
    expect(() => parseRuleItems([])).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => parseRuleItems([{ categoryKey: 'EMERGENCY', label: 'x', responsibleParty: 'LANDLORD' }])).toThrow(/always on/)
    expect(() => parseRuleItems([{ categoryKey: 'A1', label: 'x', responsibleParty: 'NOBODY' }])).toThrow(/responsibleParty/)
    expect(() =>
      parseRuleItems([
        { categoryKey: 'A1', label: 'x', responsibleParty: 'LANDLORD' },
        { categoryKey: 'a1', label: 'y', responsibleParty: 'LANDLORD' },
      ]),
    ).toThrow(/duplicate/)
  })
})

describe('PATCH /api/tickets/:id/responsibility', () => {
  it('a reason is required', async () => {
    const { deps } = world()
    await expect(patchTicketResponsibility(AGENT_A, TICKET_A, { responsibleParty: 'LANDLORD' }, deps)).rejects.toMatchObject({
      status: 400,
      code: 'OVERRIDE_REASON_REQUIRED',
    })
    await expect(
      patchTicketResponsibility(AGENT_A, TICKET_A, { responsibleParty: 'LANDLORD', reason: '  ' }, deps),
    ).rejects.toMatchObject({ status: 400 })
    expect(deps.calls.some((c) => c.sql.startsWith('UPDATE maintenance_tickets'))).toBe(false)
  })

  it('writes the override and an audit row in maintenance_ticket_updates, in one transaction', async () => {
    const { deps, ticket } = world()
    const out = await patchTicketResponsibility(
      AGENT_A,
      TICKET_A,
      { responsibleParty: 'landlord', reason: 'Lift is inside the unit (private), per lease clause 9' },
      deps,
    )
    expect(out).toMatchObject({ ok: true, responsibleParty: 'LANDLORD', previousResponsibleParty: 'BODY_CORPORATE' })
    expect(ticket.responsible_party).toBe('LANDLORD')
    const sqls = deps.calls.map((c) => c.sql)
    const upd = deps.calls.find((c) => c.sql.startsWith('UPDATE maintenance_tickets'))!
    expect(upd.params).toEqual([TICKET_A, 'LANDLORD', U.agentA, 'Lift is inside the unit (private), per lease clause 9'])
    const audit = deps.calls.find((c) => c.sql.startsWith('INSERT INTO maintenance_ticket_updates'))!
    expect(audit.params[0]).toBe(TICKET_A)
    expect(audit.params[1]).toBe(U.agentA)
    expect(String(audit.params[2])).toBe(
      'Responsibility changed from Body corporate to Landlord. Reason: Lift is inside the unit (private), per lease clause 9',
    )
    expect(sqls.indexOf('BEGIN')).toBeLessThan(sqls.indexOf(audit.sql))
    expect(sqls.indexOf(audit.sql)).toBeLessThan(sqls.indexOf('COMMIT'))
  })

  it('another agency, a tenant or a landlord cannot override', async () => {
    const { deps } = world()
    const body = { responsibleParty: 'TENANT', reason: 'E2E TEST not theirs' }
    await expect(patchTicketResponsibility(AGENT_B, TICKET_A, body, deps)).rejects.toMatchObject({ status: 403 })
    await expect(patchTicketResponsibility(TENANT, TICKET_A, body, deps)).rejects.toMatchObject({ status: 403 })
    await expect(
      patchTicketResponsibility(actor(U.landlord, 'landlord', null), TICKET_A, body, deps),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('POST /api/tickets/:id/forward-body-corporate', () => {
  it('drafts the managing agent email and records it on the ticket', async () => {
    const { deps } = world()
    const out = await forwardToBodyCorporate(ADMIN_A, TICKET_A, deps)
    expect(out.emailDraft).toMatchObject({ to: 'e2e-managing-agent@example.com' })
    expect(out.emailDraft.subject).toBe(`Common property repair: Lift broken at E2E TEST Towers 7 (ref ${TICKET_A})`)
    expect(out.emailDraft.body).toContain('E2E TEST Agency A')
    expect(deps.calls.some((c) => c.sql.startsWith('INSERT INTO maintenance_ticket_updates'))).toBe(true)
  })

  it('only for a body corporate ticket', async () => {
    const { deps } = world({ ticketParty: 'LANDLORD' })
    await expect(forwardToBodyCorporate(ADMIN_A, TICKET_A, deps)).rejects.toMatchObject({ status: 409 })
  })
})
