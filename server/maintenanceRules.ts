/**
 * Maintenance responsibility rules (migration 029): resolve who fixes a
 * ticket's category, validate a tenant's category, and act on the result.
 *
 * Resolution order for a unit: its own active rule set, then the agency's
 * default for the unit's property_type, then the platform template, then the
 * code seed (src/lib/maintenanceRules.ts) when no table or row exists yet.
 *
 * Tenants are never blocked from reporting an emergency: EMERGENCY and OTHER
 * always succeed, and a safety hazard in the tenant's words (gas, electrical,
 * flooding, security, sewage, structural) sets is_safety_flag.
 *
 * The rule a tenant ticket resolved to is handed from the portal policy to
 * upsertTicket through stampTicketRule (a WeakMap on the payload object), so a
 * client can never send its own responsibility fields.
 */
import { query as dbQuery } from './db.js'
import {
  ALWAYS_ON_CATEGORIES,
  EMERGENCY_CATEGORY,
  OTHER_CATEGORY,
  RESPONSIBLE_PARTY_LABEL,
  isResponsibleParty,
  maxPriority,
  normalizeCategoryKey,
  rulePropertyType,
  safetyHazardsIn,
  seedRuleItems,
  tenantCategoryOptions,
  type ResponsibleParty,
  type RuleItem,
  type RulePriority,
  type RulePropertyType,
  type RuleRoomGroup,
  type TenantCategoryOption,
} from '../src/lib/maintenanceRules.js'

export type RulesDeps = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>
}

export const defaultRulesDeps: RulesDeps = {
  query: (sql, params) => dbQuery(sql, params) as never,
}

export type RuleSetSource = 'unit' | 'agency' | 'platform' | 'seed'

export type StoredRuleItem = RuleItem & { id: string | null }

export type ResolvedRuleSet = {
  source: RuleSetSource
  id: string | null
  name: string
  version: number
  propertyType: RulePropertyType
  sourceDocumentId: string | null
  sourceUrl: string | null
  bodyCorporateEmail: string | null
  items: StoredRuleItem[]
  warnings: RuleWarning[]
}

export type RuleWarning = { code: string; message: string }

export const APARTMENT_NO_CONDUCT_RULES: RuleWarning = {
  code: 'APARTMENT_NO_CONDUCT_RULES',
  message:
    'No body corporate conduct rules are linked to this apartment, so the default apartment template was used. Upload or link the conduct rules on the unit Rules tab.',
}

export type UnitContext = {
  id: string
  clientId: string
  agentId: string | null
  propertyType: RulePropertyType
  unitLabel: string
}

function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code })
}

/** Missing table / column (migration 029 not applied yet): fall back, never fail the ticket. */
export function isSchemaMissing(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return code === '42P01' || code === '42703'
}

export async function loadUnitContext(unitId: string, deps: RulesDeps = defaultRulesDeps): Promise<UnitContext | null> {
  const rows = await deps.query<{
    id: string
    client_id: string
    agent_id: string | null
    property_type: string | null
    unit_number: string | null
    building_name: string | null
  }>(
    `SELECT u.id::text AS id, u.client_id::text AS client_id, u.agent_id::text AS agent_id,
            u.property_type, u.unit_number, b.name AS building_name
       FROM units u LEFT JOIN buildings b ON b.id = u.building_id
      WHERE u.id = $1::uuid`,
    [unitId],
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    clientId: r.client_id,
    agentId: r.agent_id,
    propertyType: rulePropertyType(r.property_type),
    unitLabel: [r.building_name, r.unit_number].filter(Boolean).join(' ') || 'the unit',
  }
}

type SetRow = {
  id: string
  client_id: string | null
  unit_id: string | null
  name: string
  version: number | string
  source_document_id: string | null
  source_url: string | null
  body_corporate_email: string | null
}

type ItemRow = {
  id: string
  category_key: string
  label: string
  room_group: string | null
  responsible_party: string
  guidance_text: string | null
  clause_ref: string | null
  tenant_can_log: boolean
  default_priority: string
  vendor_category_key: string | null
  is_safety: boolean
}

export const RULE_SET_COLUMNS = `id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id, name, version,
       source_document_id::text AS source_document_id, source_url, body_corporate_email`

export const RULE_ITEM_COLUMNS = `id::text AS id, category_key, label, room_group, responsible_party, guidance_text, clause_ref,
       tenant_can_log, default_priority, vendor_category_key, is_safety`

export function itemFromRow(r: ItemRow): StoredRuleItem {
  return {
    id: r.id,
    categoryKey: r.category_key,
    label: r.label,
    roomGroup: (r.room_group ?? 'general') as RuleRoomGroup,
    responsibleParty: r.responsible_party as ResponsibleParty,
    guidanceText: r.guidance_text ?? '',
    clauseRef: r.clause_ref,
    tenantCanLog: Boolean(r.tenant_can_log),
    defaultPriority: (r.default_priority ?? 'MEDIUM') as RulePriority,
    vendorCategoryKey: r.vendor_category_key,
    isSafety: Boolean(r.is_safety),
  }
}

/** The active rule set for a unit, by the resolution order above. */
export async function resolveRuleSet(unit: UnitContext, deps: RulesDeps = defaultRulesDeps): Promise<ResolvedRuleSet> {
  const lookups: Array<{ source: RuleSetSource; sql: string; params: unknown[] }> = [
    {
      source: 'unit',
      sql: `SELECT ${RULE_SET_COLUMNS} FROM maintenance_rule_sets
             WHERE unit_id = $1::uuid AND active ORDER BY version DESC LIMIT 1`,
      params: [unit.id],
    },
    {
      source: 'agency',
      sql: `SELECT ${RULE_SET_COLUMNS} FROM maintenance_rule_sets
             WHERE client_id = $1::uuid AND unit_id IS NULL AND property_type = $2 AND active
             ORDER BY version DESC LIMIT 1`,
      params: [unit.clientId, unit.propertyType],
    },
    {
      source: 'platform',
      sql: `SELECT ${RULE_SET_COLUMNS} FROM maintenance_rule_sets
             WHERE client_id IS NULL AND property_type = $1 AND active ORDER BY version DESC LIMIT 1`,
      params: [unit.propertyType],
    },
  ]
  let found: ResolvedRuleSet | null = null
  try {
    for (const l of lookups) {
      const set = (await deps.query<SetRow>(l.sql, l.params))[0]
      if (!set) continue
      const items = await deps.query<ItemRow>(
        `SELECT ${RULE_ITEM_COLUMNS} FROM maintenance_rule_items WHERE rule_set_id = $1::uuid ORDER BY sort_order, label`,
        [set.id],
      )
      found = {
        source: l.source,
        id: set.id,
        name: set.name,
        version: Number(set.version) || 1,
        propertyType: unit.propertyType,
        sourceDocumentId: set.source_document_id,
        sourceUrl: set.source_url,
        bodyCorporateEmail: set.body_corporate_email,
        items: items.map(itemFromRow),
        warnings: [],
      }
      break
    }
  } catch (err) {
    if (!isSchemaMissing(err)) throw err
  }
  const set: ResolvedRuleSet = found ?? {
    source: 'seed',
    id: null,
    name: 'Default, check against lease and conduct rules',
    version: 1,
    propertyType: unit.propertyType,
    sourceDocumentId: null,
    sourceUrl: null,
    bodyCorporateEmail: null,
    items: seedRuleItems(unit.propertyType).map((i) => ({ ...i, id: null })),
    warnings: [],
  }
  // Sectional title: an apartment's rules come from its scheme's conduct
  // rules. Without a linked document the default apartment template applies.
  if (unit.propertyType === 'apartment' && !(set.source === 'unit' && (set.sourceDocumentId || set.sourceUrl))) {
    set.warnings.push(APARTMENT_NO_CONDUCT_RULES)
  }
  return set
}

export type TicketRule = {
  categoryKey: string
  ruleItemId: string | null
  responsibleParty: ResponsibleParty | null
  isSafetyFlag: boolean
  safetyHazards: string[]
  /** API form; the more severe of the tenant's pick and the rule default. */
  priority: RulePriority | null
  vendorCategoryKey: string | null
  ruleSetSource: RuleSetSource
  bodyCorporateEmail: string | null
  warnings: RuleWarning[]
  label: string
}

export type TenantTicketInput = {
  categoryKey: unknown
  title?: unknown
  description?: unknown
  /** API form (LOW…EMERGENCY) or null when not sent. */
  priority?: string | null
  costNoticeAcknowledged?: unknown
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * A tenant's new ticket: the category must be one they may log on this unit
 * (unknown or staff-only is a 400), EMERGENCY and OTHER always pass, and a
 * TENANT-responsible category needs the cost-notice acknowledgement (except
 * at Emergency priority: an urgent report is never blocked).
 */
export function ruleForTenantTicket(set: ResolvedRuleSet, input: TenantTicketInput): TicketRule {
  const categoryKey = normalizeCategoryKey(input.categoryKey)
  const words = `${text(input.title)} ${text(input.description)}`
  const sent = input.priority ? String(input.priority).toUpperCase() : null
  if (ALWAYS_ON_CATEGORIES.has(categoryKey)) {
    const hazards = safetyHazardsIn(words)
    const emergency = categoryKey === EMERGENCY_CATEGORY
    return {
      categoryKey,
      ruleItemId: null,
      responsibleParty: null,
      isSafetyFlag: hazards.length > 0,
      safetyHazards: hazards,
      priority: emergency ? 'EMERGENCY' : sent ? maxPriority(sent, 'LOW') : null,
      vendorCategoryKey: null,
      ruleSetSource: set.source,
      bodyCorporateEmail: set.bodyCorporateEmail,
      warnings: set.warnings,
      label: emergency ? 'Emergency' : 'Other',
    }
  }
  const item = set.items.find((i) => i.categoryKey === categoryKey)
  if (!item || !item.tenantCanLog) {
    throw httpError(
      400,
      'TICKET_CATEGORY_INVALID',
      `Bad request: category ${categoryKey} cannot be logged on this unit; choose another category, Emergency or Other`,
    )
  }
  if (item.responsibleParty === 'TENANT' && sent !== 'EMERGENCY' && input.costNoticeAcknowledged !== true) {
    throw httpError(
      400,
      'TICKET_COST_NOTICE_REQUIRED',
      'Bad request: this repair is usually the tenant’s cost; acknowledge the cost notice to log it',
    )
  }
  const hazards = item.isSafety ? safetyHazardsIn(`${item.label} ${words}`) : []
  return {
    categoryKey,
    ruleItemId: item.id,
    responsibleParty: item.responsibleParty,
    isSafetyFlag: item.isSafety || hazards.length > 0,
    safetyHazards: hazards,
    priority: maxPriority(sent, item.defaultPriority),
    vendorCategoryKey: item.vendorCategoryKey ?? item.categoryKey,
    ruleSetSource: set.source,
    bodyCorporateEmail: set.bodyCorporateEmail,
    warnings: set.warnings,
    label: item.label,
  }
}

/** Staff-raised ticket: same snapshot, never refused (staff use legacy keys too). */
export function ruleForStaffTicket(set: ResolvedRuleSet, input: TenantTicketInput): TicketRule {
  try {
    const r = ruleForTenantTicket(set, { ...input, costNoticeAcknowledged: true })
    // Staff priority is their own triage call: keep what they sent.
    return { ...r, priority: null }
  } catch {
    const categoryKey = normalizeCategoryKey(input.categoryKey)
    const hazards = safetyHazardsIn(`${text(input.title)} ${text(input.description)}`)
    return {
      categoryKey,
      ruleItemId: null,
      responsibleParty: null,
      isSafetyFlag: hazards.length > 0,
      safetyHazards: hazards,
      priority: null,
      vendorCategoryKey: null,
      ruleSetSource: set.source,
      bodyCorporateEmail: set.bodyCorporateEmail,
      warnings: set.warnings,
      label: categoryKey,
    }
  }
}

const STAMPS = new WeakMap<object, TicketRule>()

/** Server-only hand-off from the portal policy to upsertTicket. */
export function stampTicketRule(data: object, rule: TicketRule): void {
  STAMPS.set(data, rule)
}

export function takeTicketRule(data: object): TicketRule | null {
  const r = STAMPS.get(data) ?? null
  STAMPS.delete(data)
  return r
}

/** API priority -> the UI form the ticket writer maps (TICKET_PRI_TO_DB). */
export const PRIORITY_TO_UI: Readonly<Record<RulePriority, string>> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
  EMERGENCY: 'Emergency',
}

export type EmailDraft = { to: string | null; subject: string; body: string }

/** "Forward to managing agent" email for a body corporate ticket. */
export function bodyCorporateEmailDraft(input: {
  to: string | null
  unitLabel: string
  title: string
  description: string
  categoryLabel: string
  reference: string
  agencyName?: string | null
}): EmailDraft {
  return {
    to: input.to,
    subject: `Common property repair: ${input.categoryLabel} at ${input.unitLabel} (ref ${input.reference})`,
    body: [
      'Dear Managing Agent,',
      '',
      `Our tenant at ${input.unitLabel} has reported a problem with common property, which is the body corporate’s responsibility under the Sectional Titles Schemes Management Act and the scheme’s conduct rules.`,
      '',
      `Category: ${input.categoryLabel}`,
      `Reported: ${input.title}`,
      input.description ? `Details: ${input.description}` : '',
      '',
      'Please confirm when a contractor has been arranged so we can update the tenant.',
      '',
      `Kind regards,`,
      input.agencyName ?? 'The managing agency',
    ]
      .filter((l, i, all) => !(l === '' && all[i - 1] === ''))
      .join('\n'),
  }
}

/**
 * After a new ticket row exists: write the rule snapshot (first time only),
 * then the follow-up the responsible party needs. BODY_CORPORATE: an agent
 * task (notification + event_log row carrying the forward email draft).
 * Rule warnings (e.g. apartment without conduct rules) go to the agent too.
 * TENANT: informational only (no contractor). Before migration 029 the
 * snapshot is skipped with a warning; the ticket itself is already saved.
 */
export async function applyTicketRule(
  ticketId: string,
  rule: TicketRule,
  ctx: { unit: UnitContext; title: string; description: string; reference: string; actorUserId: string | null },
  deps: RulesDeps = defaultRulesDeps,
): Promise<{ agentTask: boolean; emailDraft: EmailDraft | null }> {
  try {
    await deps.query(
      `UPDATE maintenance_tickets
          SET responsible_party = $2, rule_item_id = $3::uuid, is_safety_flag = $4, updated_at = NOW()
        WHERE id = $1::uuid AND responsible_party IS NULL AND rule_item_id IS NULL`,
      [ticketId, rule.responsibleParty, rule.ruleItemId, rule.isSafetyFlag],
    )
  } catch (err) {
    if (!isSchemaMissing(err)) throw err
    console.warn('[maintenance-rules] migration 029 not applied; ticket saved without a rule snapshot')
    return { agentTask: false, emailDraft: null }
  }
  const tasks: Array<{ kind: string; title: string; body: string; payload: Record<string, unknown> }> = []
  let emailDraft: EmailDraft | null = null
  if (rule.responsibleParty === 'BODY_CORPORATE') {
    const agency = (
      await deps.query<{ company_name: string | null }>(`SELECT company_name FROM clients WHERE id = $1::uuid`, [
        ctx.unit.clientId,
      ])
    )[0]
    emailDraft = bodyCorporateEmailDraft({
      to: rule.bodyCorporateEmail,
      unitLabel: ctx.unit.unitLabel,
      title: ctx.title,
      description: ctx.description,
      categoryLabel: rule.label,
      reference: ctx.reference,
      agencyName: agency?.company_name ?? null,
    })
    tasks.push({
      kind: 'forward_body_corporate',
      title: 'Forward to body corporate',
      body: `${rule.label} at ${ctx.unit.unitLabel} is common property. Forward it to the managing agent.`,
      payload: { emailDraft },
    })
  }
  for (const w of rule.warnings) {
    tasks.push({ kind: 'rule_warning', title: 'Check maintenance rules', body: w.message, payload: { warning: w.code } })
  }
  for (const t of tasks) {
    await deps.query(
      `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
       VALUES ($1::uuid, 'maintenance_agent_task', 'maintenance_ticket', $2::uuid, $3::uuid, $4::jsonb, NOW())`,
      [
        ctx.unit.clientId,
        ticketId,
        ctx.actorUserId,
        JSON.stringify({ kind: t.kind, title: t.title, body: t.body, ticketRef: ctx.reference, status: 'open', ...t.payload }),
      ],
    )
    if (ctx.unit.agentId) {
      await deps.query(
        `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'maintenance', 'task')`,
        [ctx.unit.clientId, ctx.unit.agentId, t.title, t.body, `/workspace/operations/maintenance?ticket=${encodeURIComponent(ctx.reference)}`],
      )
    }
  }
  return { agentTask: tasks.some((t) => t.kind === 'forward_body_corporate'), emailDraft }
}

/** Picker options for a unit (tenant_can_log items plus Emergency / Other). */
export function categoriesForTenant(set: ResolvedRuleSet): TenantCategoryOption[] {
  return tenantCategoryOptions(set.items)
}

/** Reason is required on every responsibility override. */
export function parseOverride(body: Record<string, unknown>): { party: ResponsibleParty; reason: string } {
  const party = typeof body.responsibleParty === 'string' ? body.responsibleParty.trim().toUpperCase() : ''
  if (!isResponsibleParty(party)) {
    throw httpError(400, 'RESPONSIBLE_PARTY_INVALID', 'responsibleParty must be LANDLORD, TENANT, BODY_CORPORATE or SHARED')
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 3) throw httpError(400, 'OVERRIDE_REASON_REQUIRED', 'A reason is required to change who is responsible')
  return { party, reason: reason.slice(0, 1000) }
}

export function overrideAuditText(from: string | null, to: ResponsibleParty, reason: string): string {
  const label = (p: string | null) => (p && isResponsibleParty(p) ? RESPONSIBLE_PARTY_LABEL[p] : 'Not set')
  return `Responsibility changed from ${label(from)} to ${label(to)}. Reason: ${reason}`
}

export { EMERGENCY_CATEGORY, OTHER_CATEGORY }
