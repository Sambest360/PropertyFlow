/**
 * Lease inspection rules and writes. Application PCR packs are not touched.
 */
import { randomUUID } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { query } from './db.js'
import { isUuid, resolveUuid, type EntityType } from './entityMap.js'
import type { DemoActor } from './actor.js'
import { forbiddenError } from './actor.js'
import {
  defaultInventoryTemplate,
  type InventoryPropertyType,
  type InventoryTemplateItem,
} from '../src/lib/inspections/templates.js'
import { INSPECTION_DEADLINES, INSPECTION_DEADLINE_NOTE } from '../src/lib/inspections/deadlines.js'

export { INSPECTION_DEADLINES, INSPECTION_DEADLINE_NOTE }

const STAFF = new Set(['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'])
const AGENTS = new Set(['agent_admin', 'ground_agent', 'agent'])
const DEDUCTION_OUTCOMES = new Set(['MISSING', 'DAMAGED'])

export type InspectionPhoto = { dataUrl: string; uploadedAt: string; uploadedBy: string }

export type SuggestionLine = {
  itemId: string
  description: string
  amountCents: number
  outcome: string
}

export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** Reminders beside the 80/45-day lease-end bands. */
export function reminderNeeded(input: {
  today: string
  startDate: string | null
  endDate: string | null
  signedMoveIn: boolean
  moveOutScheduled: boolean
}): Array<'move_in' | 'move_out'> {
  const out: Array<'move_in' | 'move_out'> = []
  if (input.startDate && !input.signedMoveIn) {
    const days = calendarDaysBetween(input.today, input.startDate)
    if (days >= 0 && days <= 7) out.push('move_in')
  }
  if (input.endDate && !input.moveOutScheduled) {
    const days = calendarDaysBetween(input.today, input.endDate)
    if (days >= 0 && days <= 3) out.push('move_out')
  }
  return out
}

export function deductionForOutcome(input: {
  outcome: string | null
  amountCents: number
  description: string
  itemId: string
  deemedGoodOrder: boolean
}): { line: SuggestionLine | null; blocked: boolean } {
  const outcome = (input.outcome ?? '').toUpperCase()
  if (outcome === 'WEAR_AND_TEAR' || outcome === 'OK' || !outcome) {
    return { line: null, blocked: false }
  }
  if (!DEDUCTION_OUTCOMES.has(outcome)) return { line: null, blocked: false }
  if (input.deemedGoodOrder) return { line: null, blocked: true }
  return {
    blocked: false,
    line: {
      itemId: input.itemId,
      description: input.description,
      amountCents: Math.max(0, Math.round(input.amountCents)),
      outcome,
    },
  }
}

export function capSuggestions<T extends { amountCents: number }>(
  lines: T[],
  capCents: number,
): { lines: T[]; capped: boolean; warning: string | null; totalCents: number; remainderCents: number } {
  const cap = Math.max(0, Math.round(capCents))
  const original = lines.reduce((sum, line) => sum + line.amountCents, 0)
  if (original <= cap) {
    return {
      lines,
      capped: false,
      warning: null,
      totalCents: original,
      remainderCents: cap - original,
    }
  }
  let over = original - cap
  const next = lines.map((line) => ({ ...line }))
  for (let i = next.length - 1; i >= 0 && over > 0; i--) {
    const cut = Math.min(next[i].amountCents, over)
    next[i].amountCents -= cut
    over -= cut
  }
  const total = next.reduce((sum, line) => sum + line.amountCents, 0)
  return {
    lines: next,
    capped: true,
    warning: 'Suggested deductions exceed the deposit and interest held. Amounts were capped.',
    totalCents: total,
    remainderCents: cap - total,
  }
}

export type SignatureMark = { role: string; tenantDeclined?: boolean; witnessNote?: string | null }

export function statusAfterSignatures(marks: SignatureMark[]): 'SIGNED' | 'AWAITING_SIGNATURES' | 'DRAFT' {
  const tenant = marks.find((m) => m.role === 'TENANT')
  const agent = marks.find((m) => m.role === 'AGENT')
  const declined =
    Boolean(agent?.tenantDeclined) && Boolean(agent?.witnessNote && agent.witnessNote.trim())
  if (agent && (tenant || declined)) return 'SIGNED'
  if (tenant || agent) return 'AWAITING_SIGNATURES'
  return 'DRAFT'
}

export function itemPatchDecision(input: {
  status: string
  addendum?: boolean
  tenantAgreed?: boolean
}): 'update' | 'addendum' | 'locked' {
  if (input.status !== 'SIGNED') return 'update'
  if (input.addendum && input.tenantAgreed) return 'addendum'
  return 'locked'
}

export function inspectionReadable(input: {
  actorRole: string
  actorUserId: string
  actorClientId: string | null
  leaseClientId: string
  tenantId: string | null
  landlordId: string | null
}): boolean {
  if (input.actorRole === 'super_admin') return true
  if (STAFF.has(input.actorRole) && input.actorClientId && input.actorClientId === input.leaseClientId) {
    return true
  }
  if (input.actorRole === 'tenant' && input.tenantId && input.actorUserId === input.tenantId) return true
  if (input.actorRole === 'landlord' && input.landlordId && input.actorUserId === input.landlordId) return true
  return false
}

export function prefillMoveOutItems<T extends { itemName: string }>(items: T[]): T[] {
  return items.map((item) => ({ ...item }))
}

function httpError(status: number, message: string, code: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code })
}

async function idOf(type: EntityType, id: string): Promise<string> {
  const uuid = await resolveUuid(type, id)
  if (!uuid) throw httpError(404, `${type} not found`, 'NOT_FOUND')
  return uuid
}

type LeaseRow = {
  id: string
  client_id: string
  unit_id: string
  tenant_id: string | null
  landlord_id: string | null
  agent_id: string | null
  deposit_amount: string | number | null
  unit_agent_id: string | null
}

async function loadLease(leaseId: string): Promise<LeaseRow> {
  const id = isUuid(leaseId) ? leaseId : await idOf('tenancy', leaseId)
  const rows = await query<LeaseRow>(
    `SELECT l.id::text AS id, l.client_id::text AS client_id, l.unit_id::text AS unit_id,
            l.tenant_id::text AS tenant_id, l.landlord_id::text AS landlord_id,
            l.agent_id::text AS agent_id, l.deposit_amount,
            u.agent_id::text AS unit_agent_id
       FROM leases l
       JOIN units u ON u.id = l.unit_id
      WHERE l.id = $1::uuid`,
    [id],
  )
  if (!rows[0]) throw httpError(404, 'Lease not found', 'NOT_FOUND')
  return rows[0]
}

async function actorUuid(actor: DemoActor): Promise<string | null> {
  return resolveUuid('user', actor.userId)
}

async function actorClient(actor: DemoActor): Promise<string | null> {
  if (!actor.agencyId) return null
  return resolveUuid('agency', actor.agencyId)
}

function assertReadable(actor: DemoActor, actorUser: string | null, actorClientId: string | null, lease: LeaseRow) {
  const ok = inspectionReadable({
    actorRole: actor.role,
    actorUserId: actorUser ?? actor.userId,
    actorClientId,
    leaseClientId: lease.client_id,
    tenantId: lease.tenant_id,
    landlordId: lease.landlord_id,
  })
  if (!ok) throw forbiddenError('Forbidden: inspection is outside your lease')
}

function assertStaffWriter(actor: DemoActor, actorUser: string | null, lease: LeaseRow, actorClientId: string | null) {
  if (actor.role === 'super_admin') return
  if (actorClientId !== lease.client_id) {
    throw forbiddenError('Forbidden: inspection is outside your agency')
  }
  if (actor.role === 'client_admin') return
  if (!AGENTS.has(actor.role)) throw forbiddenError('Forbidden: only the assigned agent or an agency admin can change this inspection')
  if (actorUser && (actorUser === lease.agent_id || actorUser === lease.unit_agent_id)) return
  throw forbiddenError('Forbidden: only the assigned agent or an agency admin can change this inspection')
}

async function audit(
  clientId: string,
  eventType: string,
  subjectId: string,
  actorUser: string | null,
  payload: Record<string, unknown>,
) {
  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2::uuid, $3, 'inspection', $4::uuid, $5::uuid, $6::jsonb, NOW())`,
    [randomUUID(), clientId, eventType, subjectId, actorUser, JSON.stringify(payload)],
  )
}

async function notify(clientId: string, userId: string | null, title: string, body: string, link: string) {
  if (!userId) return
  await query(
    `INSERT INTO notifications (id, client_id, user_id, title, body, link_path, resource_type, action_type)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'inspection', 'updated')`,
    [randomUUID(), clientId, userId, title, body, link],
  )
}

async function interestCents(unitId: string): Promise<number> {
  const rows = await query<{ interest_accrued_cents: string | number | null }>(
    `SELECT interest_accrued_cents FROM deposit_holdings
      WHERE unit_id = $1::uuid
      ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    [unitId],
  )
  return Math.max(0, Math.round(Number(rows[0]?.interest_accrued_cents ?? 0)))
}

function depositCapCents(depositAmount: string | number | null, interest: number): number {
  return Math.max(0, Math.round(Number(depositAmount ?? 0) * 100)) + interest
}

type InspectionRow = {
  id: string
  client_id: string
  unit_id: string
  lease_id: string
  type: string
  status: string
  baseline_inspection_id: string | null
  pdf_document_id: string | null
  dispute_note: string | null
  tenant_attended: boolean
}

async function loadInspection(id: string): Promise<InspectionRow> {
  const uuid = isUuid(id) ? id : id
  const rows = await query<InspectionRow>(
    `SELECT id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id, lease_id::text AS lease_id,
            type, status, baseline_inspection_id::text AS baseline_inspection_id,
            pdf_document_id::text AS pdf_document_id, dispute_note, tenant_attended
       FROM inspections WHERE id = $1::uuid`,
    [uuid],
  )
  if (!rows[0]) throw httpError(404, 'Inspection not found', 'NOT_FOUND')
  return rows[0]
}

type ItemRow = {
  id: string
  inspection_id: string
  asset_id: string | null
  room_id: string | null
  item_name: string
  quantity: number
  condition: string | null
  outcome: string | null
  notes: string | null
  photos: unknown
  tenant_comment: string | null
  addendum: boolean
  purchase_value: string | number | null
}

async function loadItems(inspectionId: string): Promise<ItemRow[]> {
  return query<ItemRow>(
    `SELECT i.id::text AS id, i.inspection_id::text AS inspection_id, i.asset_id::text AS asset_id,
            i.room_id::text AS room_id, i.item_name, i.quantity, i.condition, i.outcome, i.notes,
            i.photos, i.tenant_comment, i.addendum, a.purchase_value
       FROM inspection_items i
       LEFT JOIN internal_assets a ON a.id = i.asset_id
      WHERE i.inspection_id = $1::uuid
      ORDER BY i.created_at, i.item_name`,
    [inspectionId],
  )
}

export async function listInventory(actor: DemoActor, unitRef: string) {
  const unitId = await idOf('unit', unitRef).catch(async () => idOf('property', unitRef))
  const rows = await query(
    `SELECT id::text AS id, item_name, quantity, condition_status, notes, photos, room_id::text AS room_id
       FROM internal_assets WHERE unit_id = $1::uuid ORDER BY item_name`,
    [unitId],
  )
  const unit = await query<{ client_id: string; agent_id: string | null }>(
    `SELECT client_id::text AS client_id, agent_id::text AS agent_id FROM units WHERE id = $1::uuid`,
    [unitId],
  )
  if (!unit[0]) throw httpError(404, 'Unit not found', 'NOT_FOUND')
  const user = await actorUuid(actor)
  const client = await actorClient(actor)
  if (
    !inspectionReadable({
      actorRole: actor.role,
      actorUserId: user ?? actor.userId,
      actorClientId: client,
      leaseClientId: unit[0].client_id,
      tenantId: null,
      landlordId: null,
    }) &&
    !(user && user === unit[0].agent_id)
  ) {
    throw forbiddenError('Forbidden: inventory is outside your agency')
  }
  return { unitId, items: rows }
}

export async function createInventory(actor: DemoActor, unitRef: string, body: Record<string, unknown>) {
  const unitId = await idOf('unit', unitRef).catch(async () => idOf('property', unitRef))
  const unit = await query<{ client_id: string; agent_id: string | null }>(
    `SELECT client_id::text AS client_id, agent_id::text AS agent_id FROM units WHERE id = $1::uuid`,
    [unitId],
  )
  if (!unit[0]) throw httpError(404, 'Unit not found', 'NOT_FOUND')
  const user = await actorUuid(actor)
  const leaseLike: LeaseRow = {
    id: unitId,
    client_id: unit[0].client_id,
    unit_id: unitId,
    tenant_id: null,
    landlord_id: null,
    agent_id: unit[0].agent_id,
    deposit_amount: 0,
    unit_agent_id: unit[0].agent_id,
  }
  assertStaffWriter(actor, user, leaseLike, await actorClient(actor))
  const propertyType = String(body.propertyType ?? body.template ?? 'apartment') as InventoryPropertyType
  let items = Array.isArray(body.items) ? (body.items as InventoryTemplateItem[]) : null
  if (!items) {
    const stored = await query<{ items: InventoryTemplateItem[] }>(
      `SELECT items FROM inventory_templates WHERE client_id = $1::uuid AND property_type = $2`,
      [unit[0].client_id, propertyType],
    )
    items = stored[0]?.items?.length ? stored[0].items : defaultInventoryTemplate(
      propertyType === 'house' || propertyType === 'room' ? propertyType : 'apartment',
    )
  }
  const created: Array<{ id: string; itemName: string; room: string; quantity: number }> = []
  for (const item of items) {
    const id = randomUUID()
    const name = String(item.name ?? '').trim()
    if (!name) continue
    await query(
      `INSERT INTO internal_assets (
         id, unit_id, client_id, item_name, asset_type_key, condition_status, quantity, notes, photos
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'FURNITURE', 'GOOD', $5, $6, '[]'::jsonb)`,
      [id, unitId, unit[0].client_id, name, Math.max(1, Number(item.quantity) || 1), item.room ? String(item.room) : null],
    )
    created.push({ id, itemName: name, room: item.room ?? '', quantity: Math.max(1, Number(item.quantity) || 1) })
  }
  return { unitId, items: created }
}

export async function patchInventory(actor: DemoActor, unitRef: string, body: Record<string, unknown>) {
  const assetId = String(body.id ?? '')
  if (!isUuid(assetId)) throw httpError(400, 'Asset id is required', 'ASSET_REQUIRED')
  const rows = await query<{ unit_id: string; client_id: string; agent_id: string | null }>(
    `SELECT a.unit_id::text AS unit_id, a.client_id::text AS client_id, u.agent_id::text AS agent_id
       FROM internal_assets a JOIN units u ON u.id = a.unit_id WHERE a.id = $1::uuid`,
    [assetId],
  )
  if (!rows[0]) throw httpError(404, 'Asset not found', 'NOT_FOUND')
  const user = await actorUuid(actor)
  assertStaffWriter(actor, user, {
    id: rows[0].unit_id,
    client_id: rows[0].client_id,
    unit_id: rows[0].unit_id,
    tenant_id: null,
    landlord_id: null,
    agent_id: rows[0].agent_id,
    deposit_amount: 0,
    unit_agent_id: rows[0].agent_id,
  }, await actorClient(actor))
  const unitId = await idOf('unit', unitRef).catch(async () => rows[0].unit_id)
  if (unitId !== rows[0].unit_id) throw forbiddenError('Forbidden: asset is not on this unit')
  await query(
    `UPDATE internal_assets SET
       quantity = COALESCE($2::int, quantity),
       condition_status = COALESCE($3, condition_status),
       notes = COALESCE($4, notes),
       photos = COALESCE($5::jsonb, photos),
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [
      assetId,
      body.quantity != null ? Math.max(1, Number(body.quantity) || 1) : null,
      body.condition ? String(body.condition).toUpperCase().replace(/\s+/g, '_') : null,
      body.notes != null ? String(body.notes) : null,
      body.photos != null ? JSON.stringify(body.photos) : null,
    ],
  )
  return { id: assetId }
}

async function copyItems(clientId: string, inspectionId: string, source: ItemRow[]) {
  for (const item of source) {
    await query(
      `INSERT INTO inspection_items (
         id, client_id, inspection_id, asset_id, room_id, item_name, quantity, condition, notes, photos
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10::jsonb)`,
      [
        randomUUID(),
        clientId,
        inspectionId,
        item.asset_id,
        item.room_id,
        item.item_name,
        item.quantity || 1,
        item.condition,
        item.notes,
        JSON.stringify(item.photos ?? []),
      ],
    )
  }
}

export async function createInspection(actor: DemoActor, leaseRef: string, body: Record<string, unknown>) {
  const type = String(body.type ?? '').toUpperCase()
  if (!['MOVE_IN', 'MOVE_OUT', 'ROUTINE'].includes(type)) {
    throw httpError(400, 'type must be MOVE_IN, MOVE_OUT, or ROUTINE', 'TYPE_REQUIRED')
  }
  const lease = await loadLease(leaseRef)
  const user = await actorUuid(actor)
  assertStaffWriter(actor, user, lease, await actorClient(actor))
  let baseline: string | null = null
  if (type === 'MOVE_OUT') {
    const signed = await query<{ id: string }>(
      `SELECT id::text AS id FROM inspections
        WHERE lease_id = $1::uuid AND type = 'MOVE_IN' AND status = 'SIGNED'
        ORDER BY conducted_at DESC NULLS LAST, created_at DESC LIMIT 1`,
      [lease.id],
    )
    baseline = signed[0]?.id ?? null
  }
  const id = randomUUID()
  await query(
    `INSERT INTO inspections (
       id, client_id, unit_id, lease_id, type, status, scheduled_at, baseline_inspection_id, tenant_attended
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'DRAFT', $6::timestamptz, $7::uuid, $8)`,
    [
      id,
      lease.client_id,
      lease.unit_id,
      lease.id,
      type,
      body.scheduledAt ? String(body.scheduledAt) : null,
      baseline,
      body.tenantAttended !== false,
    ],
  )
  if (type === 'MOVE_OUT' && baseline) {
    const items = await loadItems(baseline)
    await copyItems(lease.client_id, id, prefillMoveOutItems(items))
  } else if (type === 'MOVE_IN' || type === 'ROUTINE') {
    const assets = await query<ItemRow>(
      `SELECT id::text AS asset_id, NULL::text AS id, NULL::text AS inspection_id, room_id::text AS room_id,
              item_name, quantity, condition_status AS condition, NULL::text AS outcome, notes, photos,
              NULL::text AS tenant_comment, FALSE AS addendum, purchase_value
         FROM internal_assets WHERE unit_id = $1::uuid`,
      [lease.unit_id],
    )
    await copyItems(lease.client_id, id, assets)
  }
  await audit(lease.client_id, 'inspection_started', id, user, { type, leaseId: lease.id, baseline })
  await notify(lease.client_id, lease.tenant_id, 'Inspection started', `A ${type.replace('_', ' ').toLowerCase()} inspection is ready to review.`, `/workspace/portals/tenant/leases`)
  return getInspection(actor, id)
}

export async function listLeaseInspections(actor: DemoActor, leaseRef: string) {
  const lease = await loadLease(leaseRef)
  const user = await actorUuid(actor)
  const client = await actorClient(actor)
  assertReadable(actor, user, client, lease)
  const rows = await query(
    `SELECT id::text AS id, type, status, scheduled_at, conducted_at, baseline_inspection_id::text AS baseline_inspection_id,
            pdf_document_id::text AS pdf_document_id, dispute_note
       FROM inspections WHERE lease_id = $1::uuid ORDER BY created_at`,
    [lease.id],
  )
  return { leaseId: lease.id, inspections: rows }
}

export async function getInspection(actor: DemoActor, inspectionId: string) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  const user = await actorUuid(actor)
  const client = await actorClient(actor)
  assertReadable(actor, user, client, lease)
  const items = await loadItems(inspection.id)
  const signatures = await query(
    `SELECT role, signed_at, method, witness_note, tenant_declined, signer_user_id::text AS signer_user_id
       FROM inspection_signatures WHERE inspection_id = $1::uuid`,
    [inspection.id],
  )
  return { inspection, items, signatures, deadlines: INSPECTION_DEADLINES, deadlineNote: INSPECTION_DEADLINE_NOTE }
}

export async function patchInspectionItem(
  actor: DemoActor,
  inspectionId: string,
  itemId: string,
  body: Record<string, unknown>,
) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  const user = await actorUuid(actor)
  const decision = itemPatchDecision({
    status: inspection.status,
    addendum: body.addendum === true,
    tenantAgreed: body.tenantAgreed === true,
  })
  if (decision === 'locked') {
    throw httpError(409, 'Signed inspection items are read-only', 'INSPECTION_LOCKED')
  }
  const isTenant = actor.role === 'tenant'
  if (isTenant) {
    const client = await actorClient(actor)
    assertReadable(actor, user, client, lease)
  } else {
    assertStaffWriter(actor, user, lease, await actorClient(actor))
  }
  if (decision === 'addendum') {
    const id = randomUUID()
    await query(
      `INSERT INTO inspection_items (
         id, client_id, inspection_id, item_name, quantity, condition, notes, photos, addendum, added_at, tenant_agreed
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb, TRUE, NOW(), TRUE)`,
      [
        id,
        inspection.client_id,
        inspection.id,
        String(body.itemName ?? 'Addendum item'),
        Math.max(1, Number(body.quantity) || 1),
        body.condition ? String(body.condition) : null,
        body.notes ? String(body.notes) : null,
        JSON.stringify(body.photos ?? []),
      ],
    )
    return { id, addendum: true }
  }
  const items = await loadItems(inspection.id)
  const item = items.find((row) => row.id === itemId)
  if (!item) throw httpError(404, 'Inspection item not found', 'NOT_FOUND')
  const outcome = body.outcome != null ? String(body.outcome).toUpperCase() : item.outcome
  const deemed = inspection.type === 'MOVE_OUT' && !inspection.baseline_inspection_id
  const amount =
    body.amountCents != null
      ? Number(body.amountCents)
      : Math.round(Number(item.purchase_value ?? 0) * 100)
  const planned = deductionForOutcome({
    outcome,
    amountCents: amount,
    description: `${item.item_name} ${outcome ?? ''}`.trim(),
    itemId: item.id,
    deemedGoodOrder: deemed,
  })
  if (planned.blocked) {
    throw httpError(403, 'No signed move-in inspection. Deposit suggestions are blocked.', 'DEEMED_GOOD_ORDER')
  }
  if (isTenant) {
    await query(
      `UPDATE inspection_items SET tenant_comment = COALESCE($2, tenant_comment), photos = COALESCE($3::jsonb, photos)
        WHERE id = $1::uuid`,
      [item.id, body.tenantComment != null ? String(body.tenantComment) : null, body.photos != null ? JSON.stringify(body.photos) : null],
    )
  } else {
    await query(
      `UPDATE inspection_items SET
         condition = COALESCE($2, condition),
         outcome = COALESCE($3, outcome),
         notes = COALESCE($4, notes),
         photos = COALESCE($5::jsonb, photos),
         quantity = COALESCE($6::int, quantity),
         tenant_comment = COALESCE($7, tenant_comment)
       WHERE id = $1::uuid`,
      [
        item.id,
        body.condition != null ? String(body.condition) : null,
        outcome,
        body.notes != null ? String(body.notes) : null,
        body.photos != null ? JSON.stringify(body.photos) : null,
        body.quantity != null ? Math.max(1, Number(body.quantity) || 1) : null,
        body.tenantComment != null ? String(body.tenantComment) : null,
      ],
    )
  }
  if (planned.line && !isTenant) {
    await query(
      `DELETE FROM deposit_deductions WHERE inspection_item_id = $1::uuid AND status = 'SUGGESTED'`,
      [item.id],
    )
    await query(
      `INSERT INTO deposit_deductions (
         id, client_id, lease_id, inspection_item_id, description, amount_cents, evidence, status
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb, 'SUGGESTED')`,
      [
        randomUUID(),
        inspection.client_id,
        lease.id,
        item.id,
        planned.line.description,
        planned.line.amountCents,
        JSON.stringify(body.photos ?? item.photos ?? []),
      ],
    )
    await audit(inspection.client_id, 'deposit_deduction_suggested', inspection.id, user, planned.line)
  }
  if (outcome === 'WEAR_AND_TEAR' || outcome === 'OK') {
    await query(
      `DELETE FROM deposit_deductions WHERE inspection_item_id = $1::uuid AND status = 'SUGGESTED'`,
      [item.id],
    )
  }
  return { id: item.id, outcome, deduction: planned.line }
}

export async function signInspection(actor: DemoActor, inspectionId: string, body: Record<string, unknown>, ip: string | null) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  const user = await actorUuid(actor)
  const role = String(body.role ?? (actor.role === 'tenant' ? 'TENANT' : 'AGENT')).toUpperCase()
  if (!['TENANT', 'AGENT', 'LANDLORD'].includes(role)) throw httpError(400, 'role is required', 'ROLE_REQUIRED')
  if (role === 'TENANT') {
    if (actor.role !== 'tenant') throw forbiddenError('Forbidden: only the tenant can sign as tenant')
    const client = await actorClient(actor)
    assertReadable(actor, user, client, lease)
  } else if (role === 'LANDLORD') {
    if (actor.role !== 'landlord' && actor.role !== 'super_admin') {
      throw forbiddenError('Forbidden: only the landlord can sign as landlord')
    }
    const client = await actorClient(actor)
    assertReadable(actor, user, client, lease)
  } else {
    assertStaffWriter(actor, user, lease, await actorClient(actor))
  }
  const declined = body.tenantDeclined === true
  const witness = body.witnessNote != null ? String(body.witnessNote) : null
  if (declined && !witness?.trim()) throw httpError(400, 'A witness note is required when the tenant declined', 'WITNESS_REQUIRED')
  await query(
    `INSERT INTO inspection_signatures (
       id, client_id, inspection_id, signer_user_id, role, ip, method, witness_note, tenant_declined
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9)
     ON CONFLICT (inspection_id, role) DO UPDATE SET
       signer_user_id = EXCLUDED.signer_user_id,
       signed_at = NOW(),
       ip = EXCLUDED.ip,
       witness_note = EXCLUDED.witness_note,
       tenant_declined = EXCLUDED.tenant_declined`,
    [randomUUID(), inspection.client_id, inspection.id, user, role, ip, body.method === 'ESIGN' ? 'ESIGN' : 'IN_APP', witness, declined],
  )
  const marks = await query<SignatureMark & { witness_note: string | null; tenant_declined: boolean }>(
    `SELECT role, tenant_declined, witness_note FROM inspection_signatures WHERE inspection_id = $1::uuid`,
    [inspection.id],
  )
  const status = statusAfterSignatures(
    marks.map((m) => ({ role: m.role, tenantDeclined: m.tenant_declined, witnessNote: m.witness_note })),
  )
  await query(
    `UPDATE inspections SET status = $2, conducted_at = COALESCE(conducted_at, NOW()), updated_at = NOW() WHERE id = $1::uuid`,
    [inspection.id, status],
  )
  await audit(inspection.client_id, 'inspection_signed', inspection.id, user, { role, status, tenantDeclined: declined })
  const other = role === 'TENANT' ? lease.agent_id : lease.tenant_id
  await notify(inspection.client_id, other, 'Inspection signature', `The inspection was signed (${role}).`, `/workspace/people/tenants/${lease.id}?tab=inspections`)
  return { id: inspection.id, status }
}

export async function disputeInspection(actor: DemoActor, inspectionId: string, body: Record<string, unknown>) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  const user = await actorUuid(actor)
  const client = await actorClient(actor)
  assertReadable(actor, user, client, lease)
  if (inspection.status === 'SIGNED') throw httpError(409, 'A signed inspection cannot be disputed', 'INSPECTION_LOCKED')
  const note = String(body.comment ?? body.note ?? '').trim()
  if (!note) throw httpError(400, 'A dispute comment is required', 'COMMENT_REQUIRED')
  await query(
    `UPDATE inspections SET status = 'DISPUTED', dispute_note = $2, updated_at = NOW() WHERE id = $1::uuid`,
    [inspection.id, note],
  )
  if (body.itemId && isUuid(String(body.itemId))) {
    await query(`UPDATE inspection_items SET tenant_comment = $2 WHERE id = $1::uuid`, [String(body.itemId), note])
  }
  await audit(inspection.client_id, 'inspection_disputed', inspection.id, user, { note })
  await notify(inspection.client_id, lease.agent_id, 'Inspection disputed', note, `/workspace/people/tenants/${lease.id}?tab=inspections`)
  return { id: inspection.id, status: 'DISPUTED' }
}

export async function compareInspection(actor: DemoActor, inspectionId: string) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  const user = await actorUuid(actor)
  const client = await actorClient(actor)
  assertReadable(actor, user, client, lease)
  const moveOut = await loadItems(inspection.id)
  const baselineId = inspection.baseline_inspection_id
  const moveIn = baselineId ? await loadItems(baselineId) : []
  const deemedGoodOrder = inspection.type === 'MOVE_OUT' && !baselineId
  const suggestions = await query<{ id: string; inspection_item_id: string | null; description: string; amount_cents: number; status: string }>(
    `SELECT id::text AS id, inspection_item_id::text AS inspection_item_id, description, amount_cents, status
       FROM deposit_deductions WHERE lease_id = $1::uuid AND status <> 'REJECTED'`,
    [lease.id],
  )
  const interest = await interestCents(lease.unit_id)
  const cap = depositCapCents(lease.deposit_amount, interest)
  const capped = capSuggestions(
    suggestions.map((row) => ({ ...row, amountCents: Number(row.amount_cents) })),
    deemedGoodOrder ? 0 : cap,
  )
  const byName = new Map(moveIn.map((item) => [item.item_name, item]))
  const rows = moveOut.map((item) => ({
    itemId: item.id,
    itemName: item.item_name,
    moveInCondition: byName.get(item.item_name)?.condition ?? null,
    moveOutCondition: item.condition,
    outcome: item.outcome,
    tone: item.outcome === 'MISSING' ? 'red' : item.outcome === 'DAMAGED' ? 'amber' : item.outcome === 'WEAR_AND_TEAR' ? 'grey' : 'neutral',
  }))
  return {
    deemedGoodOrder,
    warning: deemedGoodOrder
      ? 'No signed move-in inspection. Under a common reading of the Rental Housing Act the unit is deemed in good order and the full deposit is refundable. Suggestions are blocked.'
      : capped.warning,
    rows,
    totalCents: deemedGoodOrder ? 0 : capped.totalCents,
    remainderCents: deemedGoodOrder ? cap : capped.remainderCents,
    capCents: cap,
    capped: capped.capped,
    deadlines: INSPECTION_DEADLINES,
    deadlineNote: INSPECTION_DEADLINE_NOTE,
    suggestions: deemedGoodOrder ? [] : capped.lines,
  }
}

export async function storeInspectionPdf(actor: DemoActor, inspectionId: string) {
  const packed = await getInspection(actor, inspectionId)
  const inspection = packed.inspection
  const lease = await loadLease(inspection.lease_id)
  const user = await actorUuid(actor)
  assertStaffWriter(actor, user, lease, await actorClient(actor))
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  page.drawText('Move inspection', { x: 48, y: 780, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) })
  page.drawText(`${inspection.type} · ${inspection.status}`, { x: 48, y: 756, size: 11, font, color: rgb(0.2, 0.2, 0.2) })
  page.drawText(INSPECTION_DEADLINE_NOTE.slice(0, 180), { x: 48, y: 730, size: 8, font, color: rgb(0.35, 0.35, 0.35) })
  let y = 700
  for (const item of packed.items) {
    if (y < 72) break
    const line = `${item.item_name} · ${item.condition ?? '—'} · ${item.outcome ?? '—'}`
    page.drawText(line.replace(/[^\x20-\x7E]/g, '?').slice(0, 90), { x: 48, y, size: 10, font })
    y -= 16
  }
  const bytes = await doc.save()
  const url = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`
  const documentId = randomUUID()
  await query(
    `INSERT INTO documents (
       id, client_id, unit_id, lease_id, uploaded_by, name, category, status, storage_url, mime_type, uploaded_at
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'INSPECTION', 'UPLOADED', $7, 'application/pdf', NOW())`,
    [documentId, inspection.client_id, inspection.unit_id, inspection.lease_id, user, `${inspection.type} inspection.pdf`, url],
  )
  await query(`UPDATE inspections SET pdf_document_id = $2::uuid, updated_at = NOW() WHERE id = $1::uuid`, [
    inspection.id,
    documentId,
  ])
  return { documentId, url, pdfDocumentId: documentId }
}

export async function decideDeductions(actor: DemoActor, leaseRef: string, body: Record<string, unknown>) {
  const lease = await loadLease(leaseRef)
  const user = await actorUuid(actor)
  const client = await actorClient(actor)
  const landlord = actor.role === 'landlord' && user && user === lease.landlord_id
  const admin = actor.role === 'super_admin' || (actor.role === 'client_admin' && client === lease.client_id)
  if (!landlord && !admin) throw forbiddenError('Forbidden: only the landlord or an agency admin can decide deductions')
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
  const status = String(body.status ?? 'APPROVED').toUpperCase()
  if (!['APPROVED', 'REJECTED'].includes(status)) throw httpError(400, 'status must be APPROVED or REJECTED', 'STATUS_REQUIRED')
  if (!ids.length) throw httpError(400, 'ids are required', 'IDS_REQUIRED')
  await query(
    `UPDATE deposit_deductions SET status = $3, updated_at = NOW()
      WHERE lease_id = $1::uuid AND id = ANY($2::uuid[]) AND status = 'SUGGESTED'`,
    [lease.id, ids, status],
  )
  await audit(lease.client_id, 'deposit_deduction_decided', lease.id, user, { ids, status })
  const lines = await query<{ description: string; amount_cents: number }>(
    `SELECT description, amount_cents FROM deposit_deductions
      WHERE lease_id = $1::uuid AND status = 'APPROVED'`,
    [lease.id],
  )
  return {
    leaseId: lease.id,
    refundPrefill: lines.map((line) => ({ reason: line.description, amountCents: Number(line.amount_cents) })),
  }
}

export async function listTemplates(actor: DemoActor) {
  if (!STAFF.has(actor.role)) throw forbiddenError('Forbidden')
  const client = actor.role === 'super_admin' ? null : await actorClient(actor)
  if (!client && actor.role !== 'super_admin') throw forbiddenError('Forbidden')
  const rows = client
    ? await query(`SELECT id::text AS id, property_type, items FROM inventory_templates WHERE client_id = $1::uuid`, [client])
    : await query(`SELECT id::text AS id, client_id::text AS client_id, property_type, items FROM inventory_templates`)
  return {
    templates: rows,
    defaults: {
      house: defaultInventoryTemplate('house'),
      apartment: defaultInventoryTemplate('apartment'),
      room: defaultInventoryTemplate('room'),
    },
  }
}

export async function saveTemplate(actor: DemoActor, body: Record<string, unknown>) {
  if (actor.role !== 'super_admin' && actor.role !== 'client_admin' && actor.role !== 'agent_admin') {
    throw forbiddenError('Forbidden: agency admin manages checklist templates')
  }
  const client = await actorClient(actor)
  if (!client) throw httpError(400, 'Agency is required', 'AGENCY_REQUIRED')
  const propertyType = String(body.propertyType ?? '')
  if (!['house', 'apartment', 'room'].includes(propertyType)) {
    throw httpError(400, 'propertyType must be house, apartment, or room', 'TYPE_REQUIRED')
  }
  const items = Array.isArray(body.items) ? body.items : defaultInventoryTemplate(propertyType as InventoryPropertyType)
  const id = randomUUID()
  await query(
    `INSERT INTO inventory_templates (id, client_id, property_type, items, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, NOW())
     ON CONFLICT (client_id, property_type) DO UPDATE SET items = EXCLUDED.items, updated_at = NOW()`,
    [id, client, propertyType, JSON.stringify(items)],
  )
  return { propertyType, items }
}
