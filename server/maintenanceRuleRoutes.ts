/**
 * Maintenance responsibility routes (migration 029).
 *
 * GET    /api/units/:id/maintenance-categories
 *   Tenant picker: the unit's tenant_can_log items plus Emergency / Other,
 *   with the agency's after-hours number. A tenant with a lease on the unit,
 *   the unit's landlord, or staff of its agency (staff also see rule warnings).
 * GET    /api/maintenance-rule-sets[?unitId=]      agency sets + platform templates
 * GET    /api/maintenance-rule-sets/:id
 * POST   /api/maintenance-rule-sets                new set (replaces the active one in its scope)
 * PATCH  /api/maintenance-rule-sets/:id            writes a new version, old one deactivated
 * DELETE /api/maintenance-rule-sets/:id            deactivates (tickets keep their snapshot)
 *   Staff of the agency only. Agency defaults: agency admins. A unit set: an
 *   agency admin or the unit's assigned agent (as listing limits).
 * PATCH  /api/tickets/:id/responsibility
 *   Staff override of who is responsible; reason required; audit row in
 *   maintenance_ticket_updates in the same transaction.
 * POST   /api/tickets/:id/forward-body-corporate
 *   Returns the "forward to managing agent" email draft and records it on the
 *   ticket. Nothing is sent from the server.
 */
import { query as dbQuery, withTransaction as dbWithTransaction } from './db.js'
import { isUuid, resolveUuid as dbResolveUuid } from './entityMap.js'
import { forbiddenError, type DemoActor } from './actor.js'
import { agencyFeId as dbAgencyFeId } from './scopeGate.js'
import { tenantOwnLeaseFeOnUnit } from './ticketLease.js'
import { TICKET_IDS } from './idMap.js'
import {
  RULE_ITEM_COLUMNS,
  RULE_SET_COLUMNS,
  bodyCorporateEmailDraft,
  categoriesForTenant,
  itemFromRow,
  loadUnitContext,
  overrideAuditText,
  parseOverride,
  resolveRuleSet,
  type RulesDeps,
} from './maintenanceRules.js'
import {
  ALWAYS_ON_CATEGORIES,
  RESPONSIBLE_PARTY_LABEL,
  RULE_PRIORITIES,
  RULE_PROPERTY_TYPES,
  RULE_ROOM_GROUPS,
  isResponsibleParty,
  normalizeCategoryKey,
  type RuleItem,
  type RulePropertyType,
} from '../src/lib/maintenanceRules.js'

export type RuleRouteDeps = RulesDeps & {
  withTransaction: <T>(fn: () => Promise<T>) => Promise<T>
  resolveUuid: (type: 'user' | 'unit' | 'property' | 'ticket' | 'document', fe: string) => Promise<string | null>
  agencyFeId: (clientOrFe: string | null | undefined) => Promise<string | null>
  tenantLeaseOnUnit: (tenantUuid: string, unitUuid: string) => Promise<string | null>
}

export const defaultRuleRouteDeps: RuleRouteDeps = {
  query: (sql, params) => dbQuery(sql, params) as never,
  withTransaction: (fn) => dbWithTransaction(() => fn()),
  resolveUuid: (type, fe) => dbResolveUuid(type, fe),
  agencyFeId: (v) => dbAgencyFeId(v),
  tenantLeaseOnUnit: (t, u) => tenantOwnLeaseFeOnUnit(t, u),
}

const STAFF = new Set(['client_admin', 'agent_admin', 'ground_agent', 'agent'])
const AGENCY_ADMIN = new Set(['client_admin', 'agent_admin'])

function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code })
}

const notFound = (what: string) => httpError(404, 'NOT_FOUND', `${what} not found`)

async function actorUuid(actor: DemoActor, deps: RuleRouteDeps): Promise<string | null> {
  return deps.resolveUuid('user', actor.userId)
}

async function sameAgency(actor: DemoActor, clientId: string | null, deps: RuleRouteDeps): Promise<boolean> {
  if (!clientId) return false
  const mine = await deps.agencyFeId(actor.agencyId)
  const theirs = await deps.agencyFeId(clientId)
  return Boolean(mine && theirs && mine === theirs)
}

/** Staff of the row's agency (super admin: any). */
async function assertStaffOf(actor: DemoActor, clientId: string | null, verb: string, deps: RuleRouteDeps): Promise<void> {
  if (actor.role === 'super_admin') return
  if (!STAFF.has(actor.role)) throw forbiddenError(`Forbidden: ${actor.role} cannot ${verb}`)
  if (!(await sameAgency(actor, clientId, deps))) throw forbiddenError(`Forbidden: another agency cannot ${verb}`)
}

async function resolveUnitRef(ref: string, deps: RuleRouteDeps): Promise<string | null> {
  const hit = (await deps.resolveUuid('unit', ref)) ?? (await deps.resolveUuid('property', ref))
  if (hit) return hit
  if (!isUuid(ref)) return null
  const rows = await deps.query<{ id: string }>(`SELECT id::text AS id FROM units WHERE id = $1::uuid`, [ref])
  return rows[0]?.id ?? null
}

async function resolveTicketRef(ref: string, deps: RuleRouteDeps): Promise<string | null> {
  const seeded = Object.entries(TICKET_IDS).find(([, v]) => v === ref)?.[0]
  return seeded ?? (await deps.resolveUuid('ticket', ref))
}

function afterHoursPhone(settings: unknown, phone: string | null): string | null {
  const root = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
  const block = root.maintenance && typeof root.maintenance === 'object' ? (root.maintenance as Record<string, unknown>) : {}
  const v = typeof block.afterHoursPhone === 'string' && block.afterHoursPhone.trim() ? block.afterHoursPhone.trim() : null
  return v ?? (phone && phone.trim() ? phone.trim() : null)
}

// ---------------------------------------------------------------------------
// GET /api/units/:id/maintenance-categories
// ---------------------------------------------------------------------------

export async function getUnitMaintenanceCategories(
  actor: DemoActor,
  unitRef: string,
  deps: RuleRouteDeps = defaultRuleRouteDeps,
) {
  const unitId = await resolveUnitRef(unitRef, deps)
  if (!unitId) throw notFound('Unit')
  const unit = await loadUnitContext(unitId, deps)
  if (!unit) throw notFound('Unit')
  const me = await actorUuid(actor, deps)
  let staff = false
  if (actor.role === 'tenant') {
    if (!me || !(await deps.tenantLeaseOnUnit(me, unitId))) throw forbiddenError('Forbidden: no lease on this unit')
  } else if (actor.role === 'landlord') {
    const rows = await deps.query<{ landlord_id: string | null }>(
      `SELECT b.landlord_id::text AS landlord_id FROM units u JOIN buildings b ON b.id = u.building_id WHERE u.id = $1::uuid`,
      [unitId],
    )
    if (!me || rows[0]?.landlord_id !== me) throw forbiddenError('Forbidden: not their property')
  } else {
    await assertStaffOf(actor, unit.clientId, 'read this unit’s maintenance rules', deps)
    staff = true
  }
  const set = await resolveRuleSet(unit, deps)
  const agency = (
    await deps.query<{ settings: unknown; phone: string | null }>(`SELECT settings, phone FROM clients WHERE id = $1::uuid`, [
      unit.clientId,
    ])
  )[0]
  return {
    unitId,
    propertyType: unit.propertyType,
    ruleSet: { id: set.id, name: set.name, version: set.version, source: set.source },
    categories: categoriesForTenant(set),
    afterHoursPhone: afterHoursPhone(agency?.settings, agency?.phone ?? null),
    ...(staff ? { warnings: set.warnings } : {}),
  }
}

// ---------------------------------------------------------------------------
// Rule set CRUD
// ---------------------------------------------------------------------------

type SetRow = {
  id: string
  client_id: string | null
  unit_id: string | null
  property_type?: string | null
  name: string
  version: number | string
  active?: boolean
  source_document_id: string | null
  source_url: string | null
  body_corporate_email: string | null
}

const SET_SELECT = `SELECT ${RULE_SET_COLUMNS}, property_type, active FROM maintenance_rule_sets`

async function loadSet(id: string, deps: RuleRouteDeps): Promise<SetRow> {
  if (!isUuid(id)) throw notFound('Rule set')
  const row = (await deps.query<SetRow>(`${SET_SELECT} WHERE id = $1::uuid`, [id]))[0]
  if (!row) throw notFound('Rule set')
  return row
}

async function withItems(set: SetRow, deps: RuleRouteDeps) {
  const items = await deps.query<Parameters<typeof itemFromRow>[0]>(
    `SELECT ${RULE_ITEM_COLUMNS} FROM maintenance_rule_items WHERE rule_set_id = $1::uuid ORDER BY sort_order, label`,
    [set.id],
  )
  return {
    id: set.id,
    unitId: set.unit_id,
    propertyType: set.property_type ?? null,
    name: set.name,
    version: Number(set.version) || 1,
    active: set.active !== false,
    platformTemplate: set.client_id == null,
    sourceDocumentId: set.source_document_id,
    sourceUrl: set.source_url,
    bodyCorporateEmail: set.body_corporate_email,
    items: items.map(itemFromRow),
  }
}

/** Who may change a set in this scope: agency admins; a unit set also its assigned agent. */
async function assertCanWriteScope(
  actor: DemoActor,
  scope: { clientId: string | null; unitId: string | null },
  deps: RuleRouteDeps,
): Promise<void> {
  if (actor.role === 'super_admin') return
  if (!scope.clientId) throw forbiddenError('Forbidden: platform templates are read-only')
  await assertStaffOf(actor, scope.clientId, 'change maintenance rules', deps)
  if (AGENCY_ADMIN.has(actor.role)) return
  if (scope.unitId) {
    const rows = await deps.query<{ agent_id: string | null }>(`SELECT agent_id::text AS agent_id FROM units WHERE id = $1::uuid`, [
      scope.unitId,
    ])
    const me = await actorUuid(actor, deps)
    if (me && rows[0]?.agent_id === me) return
  }
  throw forbiddenError('Forbidden: only an agency admin or the unit’s agent can change maintenance rules')
}

export async function listRuleSets(
  actor: DemoActor,
  params: { unitId?: string | null },
  deps: RuleRouteDeps = defaultRuleRouteDeps,
) {
  if (actor.role !== 'super_admin' && !STAFF.has(actor.role)) throw forbiddenError('Forbidden: staff only')
  if (params.unitId) {
    const unitId = await resolveUnitRef(params.unitId, deps)
    if (!unitId) throw notFound('Unit')
    const unit = await loadUnitContext(unitId, deps)
    if (!unit) throw notFound('Unit')
    await assertStaffOf(actor, unit.clientId, 'read this unit’s maintenance rules', deps)
    const effective = await resolveRuleSet(unit, deps)
    const own = (await deps.query<SetRow>(`${SET_SELECT} WHERE unit_id = $1::uuid AND active`, [unitId]))[0]
    return {
      unitId,
      propertyType: unit.propertyType,
      effective: {
        id: effective.id,
        name: effective.name,
        version: effective.version,
        source: effective.source,
        sourceDocumentId: effective.sourceDocumentId,
        sourceUrl: effective.sourceUrl,
        bodyCorporateEmail: effective.bodyCorporateEmail,
        items: effective.items,
      },
      unitRuleSet: own ? await withItems(own, deps) : null,
      warnings: effective.warnings,
    }
  }
  const clientId = actor.role === 'super_admin' ? null : await deps.resolveUuid('user', actor.userId).then(async (me) => {
    const rows = me
      ? await deps.query<{ client_id: string | null }>(`SELECT client_id::text AS client_id FROM users WHERE id = $1::uuid`, [me])
      : []
    return rows[0]?.client_id ?? null
  })
  if (actor.role !== 'super_admin' && !clientId) throw forbiddenError('Forbidden: no agency')
  const rows = await deps.query<SetRow>(
    `${SET_SELECT} WHERE active AND (client_id IS NULL OR ($1::uuid IS NOT NULL AND client_id = $1::uuid) OR $2::boolean)
      ORDER BY client_id NULLS FIRST, property_type, unit_id NULLS FIRST`,
    [clientId, actor.role === 'super_admin'],
  )
  const sets = []
  for (const r of rows) {
    // Defence in depth: never return another agency's set.
    if (r.client_id && actor.role !== 'super_admin' && r.client_id !== clientId) continue
    sets.push(await withItems(r, deps))
  }
  return { ruleSets: sets }
}

export async function getRuleSet(actor: DemoActor, id: string, deps: RuleRouteDeps = defaultRuleRouteDeps) {
  if (actor.role !== 'super_admin' && !STAFF.has(actor.role)) throw forbiddenError('Forbidden: staff only')
  const set = await loadSet(id, deps)
  // Platform templates are readable by all staff; agency sets by their agency.
  if (set.client_id) await assertStaffOf(actor, set.client_id, 'read this rule set', deps)
  return withItems(set, deps)
}

const ROOM_KEYS: ReadonlySet<string> = new Set(RULE_ROOM_GROUPS.map((g) => g.key))

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

/** Validated items of a rule set payload (400 on anything unusable). */
export function parseRuleItems(raw: unknown): RuleItem[] {
  if (!Array.isArray(raw) || raw.length === 0) throw httpError(400, 'RULE_ITEMS_REQUIRED', 'items must be a non-empty list')
  if (raw.length > 200) throw httpError(400, 'RULE_ITEMS_INVALID', 'at most 200 items')
  const seen = new Set<string>()
  return raw.map((r, i) => {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const bad = (why: string) => httpError(400, 'RULE_ITEMS_INVALID', `item ${i + 1}: ${why}`)
    const categoryKey = normalizeCategoryKey(o.categoryKey)
    if (!/^[A-Z0-9_]{2,80}$/.test(categoryKey)) throw bad('categoryKey must be letters, digits and _')
    if (ALWAYS_ON_CATEGORIES.has(categoryKey)) throw bad(`${categoryKey} is always on and cannot be a rule`)
    if (seen.has(categoryKey)) throw bad(`duplicate category ${categoryKey}`)
    seen.add(categoryKey)
    const label = str(o.label, 200)
    if (!label) throw bad('label is required')
    const party = typeof o.responsibleParty === 'string' ? o.responsibleParty.toUpperCase() : ''
    if (!isResponsibleParty(party)) throw bad('responsibleParty must be LANDLORD, TENANT, BODY_CORPORATE or SHARED')
    const priority = typeof o.defaultPriority === 'string' ? o.defaultPriority.toUpperCase() : 'MEDIUM'
    if (!(RULE_PRIORITIES as readonly string[]).includes(priority)) throw bad('defaultPriority is not a ticket priority')
    const room = typeof o.roomGroup === 'string' && ROOM_KEYS.has(o.roomGroup) ? o.roomGroup : 'general'
    return {
      categoryKey,
      label,
      roomGroup: room as RuleItem['roomGroup'],
      responsibleParty: party,
      guidanceText: str(o.guidanceText, 2000) ?? '',
      clauseRef: str(o.clauseRef, 80),
      tenantCanLog: o.tenantCanLog !== false,
      defaultPriority: priority as RuleItem['defaultPriority'],
      vendorCategoryKey: str(o.vendorCategoryKey, 80)?.toUpperCase() ?? null,
      isSafety: o.isSafety === true,
    }
  })
}

type SetInput = {
  name: string
  sourceDocumentId: string | null
  sourceUrl: string | null
  bodyCorporateEmail: string | null
  items: RuleItem[]
}

async function parseSetInput(body: Record<string, unknown>, fallback: SetRow | null, deps: RuleRouteDeps): Promise<SetInput> {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const name = str(body.name, 160) ?? fallback?.name ?? null
  if (!name) throw httpError(400, 'RULE_SET_NAME_REQUIRED', 'name is required')
  let sourceDocumentId = fallback?.source_document_id ?? null
  if (has('sourceDocumentId')) {
    const ref = str(body.sourceDocumentId, 120)
    sourceDocumentId = ref ? await deps.resolveUuid('document', ref) : null
    if (ref && !sourceDocumentId) throw httpError(400, 'RULE_SET_DOCUMENT_UNKNOWN', 'unknown source document')
  }
  const sourceUrl = has('sourceUrl') ? str(body.sourceUrl, 1000) : (fallback?.source_url ?? null)
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw httpError(400, 'RULE_SET_URL_INVALID', 'sourceUrl must be http(s)')
  const bodyCorporateEmail = has('bodyCorporateEmail') ? str(body.bodyCorporateEmail, 190) : (fallback?.body_corporate_email ?? null)
  if (bodyCorporateEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bodyCorporateEmail)) {
    throw httpError(400, 'RULE_SET_EMAIL_INVALID', 'bodyCorporateEmail is not an email address')
  }
  let items: RuleItem[]
  if (has('items')) items = parseRuleItems(body.items)
  else if (fallback) items = (await withItems(fallback, deps)).items
  else throw httpError(400, 'RULE_ITEMS_REQUIRED', 'items must be a non-empty list')
  return { name, sourceDocumentId, sourceUrl, bodyCorporateEmail, items }
}

/** Deactivate the active set in this scope and insert the new version with its items. */
async function writeVersion(
  scope: { clientId: string; unitId: string | null; propertyType: RulePropertyType | null },
  input: SetInput,
  actorUserUuid: string | null,
  deps: RuleRouteDeps,
): Promise<string> {
  return deps.withTransaction(async () => {
    const prev = await deps.query<{ version: number | string }>(
      `UPDATE maintenance_rule_sets SET active = FALSE, updated_at = NOW()
        WHERE client_id = $1::uuid AND active
          AND (($2::uuid IS NOT NULL AND unit_id = $2::uuid) OR ($2::uuid IS NULL AND unit_id IS NULL AND property_type = $3))
        RETURNING version`,
      [scope.clientId, scope.unitId, scope.propertyType],
    )
    const last = await deps.query<{ v: number | string | null }>(
      `SELECT MAX(version) AS v FROM maintenance_rule_sets
        WHERE client_id = $1::uuid
          AND (($2::uuid IS NOT NULL AND unit_id = $2::uuid) OR ($2::uuid IS NULL AND unit_id IS NULL AND property_type = $3))`,
      [scope.clientId, scope.unitId, scope.propertyType],
    )
    const version = Math.max(Number(last[0]?.v ?? 0), ...prev.map((p) => Number(p.version) || 0)) + 1
    const inserted = await deps.query<{ id: string }>(
      `INSERT INTO maintenance_rule_sets
         (client_id, unit_id, property_type, name, source_document_id, source_url, body_corporate_email, version, active, created_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7, $8, TRUE, $9::uuid)
       RETURNING id::text AS id`,
      [
        scope.clientId,
        scope.unitId,
        scope.propertyType,
        input.name,
        input.sourceDocumentId,
        input.sourceUrl,
        input.bodyCorporateEmail,
        version,
        actorUserUuid,
      ],
    )
    const setId = inserted[0]!.id
    let n = 0
    for (const i of input.items) {
      n += 1
      await deps.query(
        `INSERT INTO maintenance_rule_items
           (rule_set_id, category_key, label, room_group, responsible_party, guidance_text, clause_ref,
            tenant_can_log, default_priority, vendor_category_key, is_safety, sort_order)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          setId,
          i.categoryKey,
          i.label,
          i.roomGroup,
          i.responsibleParty,
          i.guidanceText,
          i.clauseRef,
          i.tenantCanLog,
          i.defaultPriority,
          i.vendorCategoryKey,
          i.isSafety,
          n,
        ],
      )
    }
    await deps.query(
      `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload)
       VALUES ($1::uuid, 'maintenance_rule_set_saved', 'maintenance_rule_set', $2::uuid, $3::uuid, $4::jsonb)`,
      [scope.clientId, setId, actorUserUuid, JSON.stringify({ unitId: scope.unitId, propertyType: scope.propertyType, version })],
    )
    return setId
  })
}

export async function createRuleSet(
  actor: DemoActor,
  body: Record<string, unknown>,
  deps: RuleRouteDeps = defaultRuleRouteDeps,
) {
  let unitId: string | null = null
  let clientId: string | null = null
  let propertyType: RulePropertyType | null = null
  if (str(body.unitId, 120)) {
    unitId = await resolveUnitRef(String(body.unitId).trim(), deps)
    if (!unitId) throw notFound('Unit')
    const unit = await loadUnitContext(unitId, deps)
    if (!unit) throw notFound('Unit')
    clientId = unit.clientId
    propertyType = unit.propertyType
  } else {
    const t = typeof body.propertyType === 'string' ? body.propertyType.trim().toLowerCase() : ''
    if (!(RULE_PROPERTY_TYPES as readonly string[]).includes(t)) {
      throw httpError(400, 'RULE_SET_SCOPE_INVALID', 'give a unitId, or a propertyType of house, apartment, townhouse or room')
    }
    propertyType = t as RulePropertyType
    const me = await actorUuid(actor, deps)
    const rows = me
      ? await deps.query<{ client_id: string | null }>(`SELECT client_id::text AS client_id FROM users WHERE id = $1::uuid`, [me])
      : []
    clientId = rows[0]?.client_id ?? null
    if (!clientId) throw forbiddenError('Forbidden: an agency default needs an agency')
  }
  await assertCanWriteScope(actor, { clientId, unitId }, deps)
  const input = await parseSetInput(body, null, deps)
  const id = await writeVersion({ clientId: clientId!, unitId, propertyType }, input, await actorUuid(actor, deps), deps)
  return withItems(await loadSet(id, deps), deps)
}

export async function updateRuleSet(
  actor: DemoActor,
  id: string,
  body: Record<string, unknown>,
  deps: RuleRouteDeps = defaultRuleRouteDeps,
) {
  const set = await loadSet(id, deps)
  await assertCanWriteScope(actor, { clientId: set.client_id, unitId: set.unit_id }, deps)
  if (set.active === false) throw httpError(409, 'RULE_SET_INACTIVE', 'This rule set has been replaced; edit the active version')
  const input = await parseSetInput(body, set, deps)
  const next = await writeVersion(
    {
      clientId: set.client_id!,
      unitId: set.unit_id,
      propertyType: (set.property_type as RulePropertyType | null) ?? null,
    },
    input,
    await actorUuid(actor, deps),
    deps,
  )
  return withItems(await loadSet(next, deps), deps)
}

export async function deactivateRuleSet(actor: DemoActor, id: string, deps: RuleRouteDeps = defaultRuleRouteDeps) {
  const set = await loadSet(id, deps)
  await assertCanWriteScope(actor, { clientId: set.client_id, unitId: set.unit_id }, deps)
  await deps.query(`UPDATE maintenance_rule_sets SET active = FALSE, updated_at = NOW() WHERE id = $1::uuid`, [set.id])
  await deps.query(
    `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload)
     VALUES ($1::uuid, 'maintenance_rule_set_deactivated', 'maintenance_rule_set', $2::uuid, $3::uuid, '{}'::jsonb)`,
    [set.client_id, set.id, await actorUuid(actor, deps)],
  )
  return { ok: true, id: set.id, active: false }
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

type TicketRow = {
  id: string
  client_id: string
  unit_id: string
  title: string
  description: string | null
  category_key: string | null
  responsible_party: string | null
  rule_item_id: string | null
}

async function loadTicket(ref: string, deps: RuleRouteDeps, lock = false): Promise<TicketRow> {
  const uuid = await resolveTicketRef(ref, deps)
  if (!uuid) throw notFound('Ticket')
  const row = (
    await deps.query<TicketRow>(
      `SELECT id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id, title, description, category_key,
              responsible_party, rule_item_id::text AS rule_item_id
         FROM maintenance_tickets WHERE id = $1::uuid${lock ? ' FOR UPDATE' : ''}`,
      [uuid],
    )
  )[0]
  if (!row) throw notFound('Ticket')
  return row
}

export async function patchTicketResponsibility(
  actor: DemoActor,
  ticketRef: string,
  body: Record<string, unknown>,
  deps: RuleRouteDeps = defaultRuleRouteDeps,
) {
  const { party, reason } = parseOverride(body)
  const first = await loadTicket(ticketRef, deps)
  await assertStaffOf(actor, first.client_id, 'change who is responsible for this ticket', deps)
  const me = await actorUuid(actor, deps)
  return deps.withTransaction(async () => {
    const t = await loadTicket(ticketRef, deps, true)
    const from = t.responsible_party
    if (from === party) {
      throw httpError(409, 'RESPONSIBILITY_UNCHANGED', `This ticket is already ${RESPONSIBLE_PARTY_LABEL[party]}`)
    }
    await deps.query(
      `UPDATE maintenance_tickets
          SET responsible_party = $2, responsibility_overridden_by = $3::uuid, override_reason = $4, updated_at = NOW()
        WHERE id = $1::uuid`,
      [t.id, party, me, reason],
    )
    const audit = await deps.query<{ id: string; created_at: string }>(
      `INSERT INTO maintenance_ticket_updates (ticket_id, author_id, body)
       VALUES ($1::uuid, $2::uuid, $3)
       RETURNING id::text AS id, created_at::text AS created_at`,
      [t.id, me, overrideAuditText(from, party, reason)],
    )
    return {
      ok: true,
      ticketId: ticketRef,
      responsibleParty: party,
      previousResponsibleParty: from,
      overrideReason: reason,
      auditId: audit[0]?.id ?? null,
    }
  })
}

export async function forwardToBodyCorporate(
  actor: DemoActor,
  ticketRef: string,
  deps: RuleRouteDeps = defaultRuleRouteDeps,
) {
  const t = await loadTicket(ticketRef, deps)
  await assertStaffOf(actor, t.client_id, 'forward this ticket', deps)
  if (t.responsible_party !== 'BODY_CORPORATE') {
    throw httpError(409, 'NOT_BODY_CORPORATE', 'Only a body corporate ticket can be forwarded to the managing agent')
  }
  const unit = await loadUnitContext(t.unit_id, deps)
  if (!unit) throw notFound('Unit')
  const set = await resolveRuleSet(unit, deps)
  const label =
    (t.rule_item_id
      ? (
          await deps.query<{ label: string }>(`SELECT label FROM maintenance_rule_items WHERE id = $1::uuid`, [t.rule_item_id])
        )[0]?.label
      : null) ??
    set.items.find((i) => i.categoryKey === t.category_key)?.label ??
    'Common property'
  const agency = (
    await deps.query<{ company_name: string | null }>(`SELECT company_name FROM clients WHERE id = $1::uuid`, [t.client_id])
  )[0]
  const draft = bodyCorporateEmailDraft({
    to: set.bodyCorporateEmail,
    unitLabel: unit.unitLabel,
    title: t.title,
    description: t.description ?? '',
    categoryLabel: label,
    reference: ticketRef,
    agencyName: agency?.company_name ?? null,
  })
  await deps.query(
    `INSERT INTO maintenance_ticket_updates (ticket_id, author_id, body) VALUES ($1::uuid, $2::uuid, $3)`,
    [t.id, await actorUuid(actor, deps), `Forward to body corporate drafted${draft.to ? ` for ${draft.to}` : ''}.`],
  )
  return { ok: true, ticketId: ticketRef, emailDraft: draft }
}
