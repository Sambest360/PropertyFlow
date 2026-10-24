import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  APARTMENT_NO_CONDUCT_RULES,
  applyTicketRule,
  resolveRuleSet,
  ruleForStaffTicket,
  ruleForTenantTicket,
  stampTicketRule,
  takeTicketRule,
  type RulesDeps,
  type UnitContext,
} from './maintenanceRules.js'
import {
  RULE_PROPERTY_TYPES,
  normalizeCategoryKey,
  rulePropertyType,
  seedRuleItems,
  tenantCategoryOptions,
} from '../src/lib/maintenanceRules.js'

/**
 * Migration 029: responsibility rules. Deps-injected fakes (as
 * leaseReminders.test.ts): every SQL statement is recorded; reads answer from
 * small in-memory tables.
 */
const AG_A = '00000000-0000-4000-8000-0000000000a1'
const AGENT = '00000000-0000-4000-8000-000000000101'
const UNIT_APT = '00000000-0000-4000-8000-000000000201'
const UNIT_HOUSE = '00000000-0000-4000-8000-000000000202'
const TICKET = '00000000-0000-4000-8000-000000000301'

type Sql = { sql: string; params: unknown[] }

function fakeDeps(tables: {
  sets?: Array<Record<string, unknown>>
  items?: Record<string, Array<Record<string, unknown>>>
  failWith?: string
} = {}): RulesDeps & { calls: Sql[] } {
  const calls: Sql[] = []
  return {
    calls,
    query: async <T,>(sql: string, params: unknown[] = []) => {
      const q = sql.replace(/\s+/g, ' ').trim()
      calls.push({ sql: q, params })
      if (tables.failWith && q.includes('maintenance_rule')) throw Object.assign(new Error('missing'), { code: tables.failWith })
      if (q.includes('FROM maintenance_rule_sets')) {
        const sets = tables.sets ?? []
        const hit = sets.find((s) => {
          if (q.includes('WHERE unit_id = $1')) return s.unit_id === params[0]
          if (q.includes('WHERE client_id = $1::uuid AND unit_id IS NULL'))
            return s.client_id === params[0] && !s.unit_id && s.property_type === params[1]
          if (q.includes('WHERE client_id IS NULL')) return !s.client_id && s.property_type === params[0]
          return false
        })
        return (hit ? [hit] : []) as T[]
      }
      if (q.includes('FROM maintenance_rule_items')) return ((tables.items ?? {})[String(params[0])] ?? []) as T[]
      if (q.startsWith('SELECT company_name FROM clients')) return [{ company_name: 'E2E TEST Agency A' }] as T[]
      return [] as T[]
    },
  }
}

const unit = (id: string, propertyType: UnitContext['propertyType']): UnitContext => ({
  id,
  clientId: AG_A,
  agentId: AGENT,
  propertyType,
  unitLabel: 'E2E TEST Block 7',
})

describe('rule resolution order: unit, agency default, platform template, seed', () => {
  it('falls back to the code seed when nothing is stored', async () => {
    const set = await resolveRuleSet(unit(UNIT_HOUSE, 'house'), fakeDeps())
    expect(set.source).toBe('seed')
    expect(set.items.map((i) => i.categoryKey)).toContain('GEYSER_BURST')
    expect(set.warnings).toEqual([])
  })

  it('falls back to the seed (not a 500) before migration 029 is applied', async () => {
    const set = await resolveRuleSet(unit(UNIT_HOUSE, 'house'), fakeDeps({ failWith: '42P01' }))
    expect(set.source).toBe('seed')
  })

  it('a unit set wins over the agency default; the agency default over the template', async () => {
    const item = (key: string, party: string) => ({
      id: `item-${key}`,
      category_key: key,
      label: key,
      room_group: 'general',
      responsible_party: party,
      guidance_text: '',
      clause_ref: '7.2',
      tenant_can_log: true,
      default_priority: 'LOW',
      vendor_category_key: null,
      is_safety: false,
    })
    const deps = fakeDeps({
      sets: [
        { id: 'set-agency', client_id: AG_A, unit_id: null, property_type: 'house', name: 'E2E TEST agency', version: 2 },
        { id: 'set-unit', client_id: AG_A, unit_id: UNIT_HOUSE, property_type: null, name: 'E2E TEST unit', version: 3 },
        { id: 'set-platform', client_id: null, unit_id: null, property_type: 'house', name: 'template', version: 1 },
      ],
      items: { 'set-unit': [item('GARDEN', 'LANDLORD')], 'set-agency': [item('GARDEN', 'SHARED')] },
    })
    const set = await resolveRuleSet(unit(UNIT_HOUSE, 'house'), deps)
    expect(set).toMatchObject({ source: 'unit', id: 'set-unit', version: 3 })
    expect(set.items[0]).toMatchObject({ categoryKey: 'GARDEN', responsibleParty: 'LANDLORD', clauseRef: '7.2' })

    const other = await resolveRuleSet(unit('00000000-0000-4000-8000-0000000002ff', 'house'), deps)
    expect(other).toMatchObject({ source: 'agency', id: 'set-agency' })
  })

  it('student accommodation uses the room template', () => {
    expect(rulePropertyType('student_accommodation')).toBe('room')
    expect(rulePropertyType('student')).toBe('room')
    expect(rulePropertyType('Apartment')).toBe('apartment')
    expect(rulePropertyType(null)).toBe('house')
  })
})

describe('apartment without conduct rules', () => {
  it('uses the default apartment template and warns the agent', async () => {
    const deps = fakeDeps()
    const set = await resolveRuleSet(unit(UNIT_APT, 'apartment'), deps)
    expect(set.items.map((i) => i.categoryKey)).toContain('LIFT')
    expect(set.warnings).toEqual([APARTMENT_NO_CONDUCT_RULES])

    const rule = ruleForTenantTicket(set, { categoryKey: 'GEYSER_BURST', title: 'E2E TEST geyser' })
    await applyTicketRule(TICKET, rule, { unit: unit(UNIT_APT, 'apartment'), title: 'E2E TEST geyser', description: '', reference: 'MT-E2E-1', actorUserId: null }, deps)
    const tasks = deps.calls.filter((c) => c.sql.includes("'maintenance_agent_task'"))
    expect(tasks).toHaveLength(1)
    expect(JSON.parse(String(tasks[0]!.params[3]))).toMatchObject({ kind: 'rule_warning', warning: 'APARTMENT_NO_CONDUCT_RULES' })
  })

  it('no warning once the unit set links its conduct rules', async () => {
    const deps = fakeDeps({
      sets: [{ id: 'set-u', client_id: AG_A, unit_id: UNIT_APT, name: 'E2E TEST rules', version: 1, source_url: 'https://e2e.example.com/rules.pdf' }],
      items: { 'set-u': [] },
    })
    const set = await resolveRuleSet(unit(UNIT_APT, 'apartment'), deps)
    expect(set.warnings).toEqual([])
  })
})

describe('Apartment, "Lift broken": body corporate and an agent task', () => {
  it('resolves BODY_CORPORATE, no vendor, and writes the task with the forward email draft', async () => {
    const deps = fakeDeps({
      sets: [
        {
          id: 'set-u',
          client_id: AG_A,
          unit_id: UNIT_APT,
          name: 'E2E TEST conduct rules',
          version: 1,
          source_document_id: '00000000-0000-4000-8000-000000000401',
          body_corporate_email: 'e2e-managing-agent@example.com',
        },
      ],
      items: {
        'set-u': seedRuleItems('apartment').map((i, n) => ({
          id: `00000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`,
          category_key: i.categoryKey,
          label: i.label,
          room_group: i.roomGroup,
          responsible_party: i.responsibleParty,
          guidance_text: i.guidanceText,
          clause_ref: i.clauseRef,
          tenant_can_log: i.tenantCanLog,
          default_priority: i.defaultPriority,
          vendor_category_key: i.vendorCategoryKey,
          is_safety: i.isSafety,
        })),
      },
    })
    const apt = unit(UNIT_APT, 'apartment')
    const set = await resolveRuleSet(apt, deps)
    const rule = ruleForTenantTicket(set, { categoryKey: 'LIFT', title: 'Lift broken', priority: 'MEDIUM' })
    expect(rule).toMatchObject({ responsibleParty: 'BODY_CORPORATE', priority: 'HIGH', bodyCorporateEmail: 'e2e-managing-agent@example.com' })
    expect(rule.ruleItemId).toMatch(/^00000000-/)

    const out = await applyTicketRule(TICKET, rule, { unit: apt, title: 'Lift broken', description: 'Stuck on 3', reference: 'MT-E2E-2', actorUserId: null }, deps)
    expect(out.agentTask).toBe(true)
    expect(out.emailDraft).toMatchObject({ to: 'e2e-managing-agent@example.com' })
    expect(out.emailDraft!.subject).toContain('Lift broken')

    const snapshot = deps.calls.find((c) => c.sql.startsWith('UPDATE maintenance_tickets SET responsible_party'))
    expect(snapshot!.params).toEqual([TICKET, 'BODY_CORPORATE', rule.ruleItemId, false])
    // Snapshot only once: later rule changes never rewrite an existing ticket.
    expect(snapshot!.sql).toContain('responsible_party IS NULL AND rule_item_id IS NULL')

    const task = deps.calls.find((c) => c.sql.includes("'maintenance_agent_task'"))
    expect(JSON.parse(String(task!.params[3]))).toMatchObject({
      kind: 'forward_body_corporate',
      status: 'open',
      emailDraft: { to: 'e2e-managing-agent@example.com' },
    })
    const note = deps.calls.find((c) => c.sql.startsWith('INSERT INTO notifications'))
    expect(note!.params.slice(0, 3)).toEqual([AG_A, AGENT, 'Forward to body corporate'])
  })
})

describe('tenant categories: unknown is a 400, Emergency and Other always succeed', () => {
  const house = async () => resolveRuleSet(unit(UNIT_HOUSE, 'house'), fakeDeps())

  it('unknown or staff-only category -> 400 TICKET_CATEGORY_INVALID', async () => {
    const set = await house()
    expect(() => ruleForTenantTicket(set, { categoryKey: 'NO_SUCH_THING' })).toThrow(
      expect.objectContaining({ status: 400, code: 'TICKET_CATEGORY_INVALID' }),
    )
    // Lift is body corporate on apartments only: not loggable on a house.
    expect(() => ruleForTenantTicket(set, { categoryKey: 'LIFT' })).toThrow(expect.objectContaining({ status: 400 }))
    const staffOnly = { ...set, items: set.items.map((i) => (i.categoryKey === 'GARDEN' ? { ...i, tenantCanLog: false } : i)) }
    expect(() => ruleForTenantTicket(staffOnly, { categoryKey: 'GARDEN', costNoticeAcknowledged: true })).toThrow(
      expect.objectContaining({ code: 'TICKET_CATEGORY_INVALID' }),
    )
  })

  it('EMERGENCY and OTHER succeed even on an empty rule set, with the safety flag for hazards', async () => {
    const empty = { ...(await house()), items: [] }
    const gas = ruleForTenantTicket(empty, { categoryKey: 'EMERGENCY', title: 'Smell of gas in the kitchen' })
    expect(gas).toMatchObject({ categoryKey: 'EMERGENCY', responsibleParty: null, priority: 'EMERGENCY', isSafetyFlag: true })
    expect(gas.safetyHazards).toEqual(['gas'])
    for (const [title, hazard] of [
      ['Sparks from the plug', 'electrical'],
      ['Flooding from upstairs', 'flooding'],
      ['Break-in, back door lock broken', 'security'],
      ['Sewage coming up the drain', 'sewage'],
      ['Ceiling collapsed in bedroom', 'structural'],
    ] as const) {
      const r = ruleForTenantTicket(empty, { categoryKey: 'OTHER', title })
      expect(r.isSafetyFlag, title).toBe(true)
      expect(r.safetyHazards, title).toContain(hazard)
    }
    const plain = ruleForTenantTicket(empty, { categoryKey: 'OTHER', title: 'Cupboard door squeaks', priority: 'LOW' })
    expect(plain).toMatchObject({ categoryKey: 'OTHER', isSafetyFlag: false, priority: 'LOW' })
    // Blank and the legacy GENERAL key are Other.
    expect(normalizeCategoryKey('')).toBe('OTHER')
    expect(normalizeCategoryKey('general')).toBe('OTHER')
  })

  it('a TENANT category needs the cost notice (except at Emergency priority)', async () => {
    const set = await house()
    expect(() => ruleForTenantTicket(set, { categoryKey: 'LIGHT_BULBS' })).toThrow(
      expect.objectContaining({ status: 400, code: 'TICKET_COST_NOTICE_REQUIRED' }),
    )
    expect(ruleForTenantTicket(set, { categoryKey: 'LIGHT_BULBS', costNoticeAcknowledged: true })).toMatchObject({
      responsibleParty: 'TENANT',
    })
    expect(ruleForTenantTicket(set, { categoryKey: 'DRAIN_BLOCKED_MISUSE', priority: 'EMERGENCY' })).toMatchObject({
      responsibleParty: 'TENANT',
      priority: 'EMERGENCY',
    })
  })

  it('staff tickets are never refused (legacy keys map to the closest rule)', async () => {
    const set = await house()
    expect(ruleForStaffTicket(set, { categoryKey: 'HVAC' })).toMatchObject({ responsibleParty: null, ruleItemId: null })
    expect(ruleForStaffTicket(set, { categoryKey: 'PLUMBING' })).toMatchObject({ categoryKey: 'PLUMBING_PIPES', responsibleParty: 'LANDLORD', priority: null })
    expect(ruleForStaffTicket(set, { categoryKey: 'LIGHT_BULBS' })).toMatchObject({ responsibleParty: 'TENANT' })
  })

  it('picker options: loggable items plus Emergency and Other, cost notice on TENANT items', () => {
    const opts = tenantCategoryOptions(seedRuleItems('apartment'))
    const keys = opts.map((o) => o.categoryKey)
    expect(keys.slice(-2)).toEqual(['EMERGENCY', 'OTHER'])
    expect(keys).toContain('LIFT')
    expect(opts.find((o) => o.categoryKey === 'LIGHT_BULBS')!.needsCostNotice).toBe(true)
    expect(opts.find((o) => o.categoryKey === 'LIFT')!.needsCostNotice).toBe(false)
  })

  it('the stamp is server-only and taken once', () => {
    const data = { categoryKey: 'OTHER' }
    expect(takeTicketRule(data)).toBeNull()
    stampTicketRule(data, { categoryKey: 'OTHER' } as never)
    expect(takeTicketRule(data)).toMatchObject({ categoryKey: 'OTHER' })
    expect(takeTicketRule(data)).toBeNull()
    // A JSON copy (what a client could send) never carries it.
    stampTicketRule(data, { categoryKey: 'OTHER' } as never)
    expect(takeTicketRule(JSON.parse(JSON.stringify(data)))).toBeNull()
  })
})

describe('migration 029 seeds the same templates as the code', () => {
  const sql = readFileSync(new URL('../database/postgres/migrations/029_maintenance_rule_sets.sql', import.meta.url), 'utf8')

  it('one platform set per property type, items row for row', () => {
    RULE_PROPERTY_TYPES.forEach((t, n) => {
      const setId = `00000000-0000-4029-8000-00000000000${n + 1}`
      expect(sql).toContain(`('${setId}', NULL, NULL, '${t}', `)
      const rows = [...sql.matchAll(new RegExp(`\\('${setId}', '([A-Z_]+)', '((?:[^']|'')*)', '([a-z]+)', '([A-Z_]+)', '((?:[^']|'')*)', (NULL|'[^']*'), (TRUE|FALSE), '([A-Z]+)', (NULL|'[A-Z_]+'), (TRUE|FALSE), (\\d+)\\)`, 'g'))]
      const fromSql = rows.map((m) => ({
        categoryKey: m[1],
        label: m[2]!.replace(/''/g, "'"),
        roomGroup: m[3],
        responsibleParty: m[4],
        guidanceText: m[5]!.replace(/''/g, "'"),
        tenantCanLog: m[7] === 'TRUE',
        defaultPriority: m[8],
        vendorCategoryKey: m[9] === 'NULL' ? null : m[9]!.slice(1, -1),
        isSafety: m[10] === 'TRUE',
      }))
      const fromCode = seedRuleItems(t).map(({ clauseRef: _c, ...i }) => i)
      expect(fromSql, t).toEqual(fromCode)
    })
  })

  it('templates carry the lease / conduct rules caveat and RLS is on', () => {
    expect(sql.match(/default, check against lease and conduct rules/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql).toContain('ALTER TABLE maintenance_rule_sets ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE maintenance_rule_items ENABLE ROW LEVEL SECURITY')
    expect(sql).toMatch(/client_id = current_app_client_id\(\)/)
  })

  it('the seed covers the agreed defaults', () => {
    const party = (t: Parameters<typeof seedRuleItems>[0], key: string) => seedRuleItems(t).find((i) => i.categoryKey === key)?.responsibleParty
    for (const key of ['ROOF_LEAK', 'GEYSER_BURST', 'ELECTRICAL_FAULT', 'STRUCTURAL_CRACKS', 'PLUMBING_PIPES']) {
      expect(party('house', key), key).toBe('LANDLORD')
    }
    expect(seedRuleItems('house').find((i) => i.categoryKey === 'GEYSER_BURST')!.defaultPriority).toBe('URGENT')
    for (const key of ['BROKEN_WINDOW_TENANT', 'DRAIN_BLOCKED_MISUSE', 'LIGHT_BULBS', 'GARDEN']) {
      expect(party('house', key), key).toBe('TENANT')
    }
    for (const key of ['LIFT', 'COMMON_PASSAGE_LIGHTS', 'PERIMETER_WALL', 'POOL', 'COMPLEX_GATE_MOTOR', 'SECTIONAL_TITLE_ROOF']) {
      expect(party('apartment', key), key).toBe('BODY_CORPORATE')
    }
  })
})
