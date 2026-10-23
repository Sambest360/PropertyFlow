/**
 * Lease inspection rules and writes. Application PCR packs are not touched.
 *
 * Scope: the Node API connects as a role that bypasses RLS, so every read and
 * write checks the actor against the lease here (staff of the lease's agency,
 * the lease's own tenant or landlord). Migration 026 adds the same rule as RLS.
 *
 * Files: photos and the PDF live in `documents` rows (category INSPECTION),
 * the same table document uploads use. Items only hold document ids.
 */
import { randomUUID } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { query } from './db.js'
import { isUuid, resolveFrontendId, resolveUuid, type EntityType } from './entityMap.js'
import type { DemoActor } from './actor.js'
import { forbiddenError } from './actor.js'
import { agencyFeId } from './scopeGate.js'
import {
  defaultInventoryTemplate,
  type InventoryPropertyType,
  type InventoryTemplateItem,
} from '../src/lib/inspections/templates.js'
import { INSPECTION_DEADLINES, INSPECTION_DEADLINE_NOTE } from '../src/lib/inspections/deadlines.js'

export { INSPECTION_DEADLINES, INSPECTION_DEADLINE_NOTE }
export { calendarDaysBetween, reminderNeeded } from './inspectionReminderRules.js'

const STAFF = new Set(['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'])
const AGENTS = new Set(['agent_admin', 'ground_agent', 'agent'])
const DEDUCTION_OUTCOMES = new Set(['MISSING', 'DAMAGED'])
const PATCHABLE_STATUSES = new Set(['DRAFT', 'AWAITING_SIGNATURES', 'DISPUTED'])

/** Same cap as application documents (images measured after the browser downscale). */
export const INSPECTION_PHOTO_MAX_BYTES = 2 * 1024 * 1024
export const INSPECTION_PHOTO_MAX_PER_ITEM = 12
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png'])
/** documents.note marker: bootstrap leaves these rows out (they load via /api/inspection-files). */
export const INSPECTION_FILE_NOTE = 'inspection-file:'

export const DEEMED_GOOD_ORDER_WARNING =
  'No signed move-in inspection. Under a common reading of the Rental Housing Act the unit is deemed in good order and the full deposit is refundable. Suggestions are blocked.'

export type InspectionPhoto = {
  documentId: string
  uploadedAt: string
  /** users.id of the uploader. */
  uploadedBy: string | null
  uploaderRole: string
  mimeType: string
  bytes: number
}

export type SuggestionLine = {
  itemId: string
  description: string
  amountCents: number
  outcome: string
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

export const CAP_WARNING = 'Suggested deductions exceed the deposit and interest held. Amounts were capped.'

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
    warning: CAP_WARNING,
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

/** A signed inspection is read-only; new items only go in as a dated addendum. */
export function itemPatchDecision(input: {
  status: string
  addendum?: boolean
  tenantAgreed?: boolean
}): 'update' | 'addendum' | 'locked' {
  if (input.status !== 'SIGNED') return 'update'
  if (input.addendum) return 'addendum'
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

/** Validated PATCH /api/inspections/:id fields. Throws 400 on a bad value. */
export function inspectionPatchFields(body: Record<string, unknown>): {
  status?: string
  scheduledAt?: string | null
  conductedAt?: string | null
  tenantAttended?: boolean
} {
  const out: ReturnType<typeof inspectionPatchFields> = {}
  const pick = (camel: string, snake: string) => (camel in body ? body[camel] : body[snake])
  const has = (camel: string, snake: string) => camel in body || snake in body
  if ('status' in body) {
    const status = String(body.status ?? '').toUpperCase()
    if (!PATCHABLE_STATUSES.has(status)) {
      throw httpError(400, 'status must be DRAFT, AWAITING_SIGNATURES or DISPUTED (signing sets SIGNED)', 'STATUS_INVALID')
    }
    out.status = status
  }
  for (const [camel, snake, key] of [
    ['scheduledAt', 'scheduled_at', 'scheduledAt'],
    ['conductedAt', 'conducted_at', 'conductedAt'],
  ] as const) {
    if (!has(camel, snake)) continue
    const raw = pick(camel, snake)
    if (raw == null || raw === '') {
      out[key] = null
      continue
    }
    const at = Date.parse(String(raw))
    if (!Number.isFinite(at)) throw httpError(400, `${snake} must be an ISO date`, 'DATE_INVALID')
    out[key] = new Date(at).toISOString()
  }
  if (has('tenantAttended', 'tenant_attended')) {
    const raw = pick('tenantAttended', 'tenant_attended')
    if (typeof raw !== 'boolean') throw httpError(400, 'tenant_attended must be true or false', 'ATTENDED_INVALID')
    out.tenantAttended = raw
  }
  return out
}

/** Mime type and decoded size of a base64 data URL, or null when it is not one. */
export function dataUrlInfo(dataUrl: string): { mimeType: string; bytes: number } | null {
  const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]*)$/i.exec(dataUrl)
  if (!m) return null
  const body = m[2].replace(/\s+/g, '')
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return { mimeType: m[1].toLowerCase(), bytes: Math.max(0, Math.floor((body.length * 3) / 4) - pad) }
}

/** Null when the photo may be stored, else the refusal. */
export function photoError(dataUrl: string): string | null {
  const info = dataUrlInfo(dataUrl)
  if (!info || !PHOTO_TYPES.has(info.mimeType)) return 'Upload a JPEG or PNG photo.'
  if (info.bytes > INSPECTION_PHOTO_MAX_BYTES) return 'This photo is larger than 2 MB after compression.'
  return null
}

export function inspectionFileHref(documentId: string): string {
  return `/api/inspection-files/${documentId}`
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

type ActorScope = { user: string | null; agency: string | null }

/** Actor user uuid and agency in the FE id space (as depositRoutes compares agencies). */
async function scopeOf(actor: DemoActor): Promise<ActorScope> {
  return {
    user: await resolveUuid('user', actor.userId),
    agency: await agencyFeId(actor.agencyId),
  }
}

async function assertReadable(actor: DemoActor, scope: ActorScope, lease: LeaseRow) {
  const ok = inspectionReadable({
    actorRole: actor.role,
    actorUserId: scope.user ?? actor.userId,
    actorClientId: scope.agency,
    leaseClientId: (await agencyFeId(lease.client_id)) ?? lease.client_id,
    tenantId: lease.tenant_id,
    landlordId: lease.landlord_id,
  })
  if (!ok) throw forbiddenError('Forbidden: inspection is outside your lease')
}

async function assertStaffWriter(actor: DemoActor, scope: ActorScope, lease: LeaseRow) {
  if (actor.role === 'super_admin') return
  const leaseAgency = await agencyFeId(lease.client_id)
  if (!scope.agency || scope.agency !== leaseAgency) {
    throw forbiddenError('Forbidden: inspection is outside your agency')
  }
  if (actor.role === 'client_admin') return
  if (!AGENTS.has(actor.role)) throw forbiddenError('Forbidden: only the assigned agent or an agency admin can change this inspection')
  if (scope.user && (scope.user === lease.agent_id || scope.user === lease.unit_agent_id)) return
  throw forbiddenError('Forbidden: only the assigned agent or an agency admin can change this inspection')
}

async function audit(
  clientId: string,
  eventType: string,
  subjectId: string,
  actorUser: string | null,
  payload: Record<string, unknown>,
  subjectType = 'inspection',
) {
  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::jsonb, NOW())`,
    [randomUUID(), clientId, eventType, subjectType, subjectId, actorUser, JSON.stringify(payload)],
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

type DepositRow = {
  id: string
  status: string
  held_cents: string | number | null
  interest_accrued_cents: string | number | null
}

/** The lease's deposit holding (occupancy = lease), else one on the unit with no lease set. */
async function findDeposit(lease: LeaseRow): Promise<DepositRow | null> {
  const rows = await query<DepositRow>(
    `SELECT id::text AS id, status, held_cents, interest_accrued_cents
       FROM deposit_holdings
      WHERE client_id = $1::uuid
        AND (occupancy_id = $2::uuid OR (occupancy_id IS NULL AND unit_id = $3::uuid))
      ORDER BY (occupancy_id = $2::uuid) DESC NULLS LAST, updated_at DESC NULLS LAST
      LIMIT 1`,
    [lease.client_id, lease.id, lease.unit_id],
  )
  return rows[0] ?? null
}

function centsOf(v: unknown): number {
  const n = Math.round(Number(v ?? 0))
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

/** Deposit plus interest: the trust holding when there is one, else the lease deposit. */
export function depositCapCents(lease: { deposit_amount: string | number | null }, deposit: DepositRow | null) {
  if (deposit) return centsOf(deposit.held_cents) + centsOf(deposit.interest_accrued_cents)
  return Math.max(0, Math.round(Number(lease.deposit_amount ?? 0) * 100))
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
  if (!isUuid(id)) throw httpError(404, 'Inspection not found', 'NOT_FOUND')
  const rows = await query<InspectionRow>(
    `SELECT id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id, lease_id::text AS lease_id,
            type, status, baseline_inspection_id::text AS baseline_inspection_id,
            pdf_document_id::text AS pdf_document_id, dispute_note, tenant_attended
       FROM inspections WHERE id = $1::uuid`,
    [id],
  )
  if (!rows[0]) throw httpError(404, 'Inspection not found', 'NOT_FOUND')
  return rows[0]
}

/** The latest signed move-in on the lease (the baseline for a move-out). */
async function signedMoveInId(leaseId: string): Promise<string | null> {
  const signed = await query<{ id: string }>(
    `SELECT id::text AS id FROM inspections
      WHERE lease_id = $1::uuid AND type = 'MOVE_IN' AND status = 'SIGNED'
      ORDER BY conducted_at DESC NULLS LAST, created_at DESC LIMIT 1`,
    [leaseId],
  )
  return signed[0]?.id ?? null
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
  added_at?: string | null
  purchase_value: string | number | null
}

async function loadItems(inspectionId: string): Promise<ItemRow[]> {
  return query<ItemRow>(
    `SELECT i.id::text AS id, i.inspection_id::text AS inspection_id, i.asset_id::text AS asset_id,
            i.room_id::text AS room_id, i.item_name, i.quantity, i.condition, i.outcome, i.notes,
            i.photos, i.tenant_comment, i.addendum, i.added_at, a.purchase_value
       FROM inspection_items i
       LEFT JOIN internal_assets a ON a.id = i.asset_id
      WHERE i.inspection_id = $1::uuid
      ORDER BY i.addendum, i.created_at, i.item_name`,
    [inspectionId],
  )
}

function photoList(raw: unknown): InspectionPhoto[] {
  const list = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
  return Array.isArray(list) ? (list as InspectionPhoto[]) : []
}

type UnitRow = { client_id: string; agent_id: string | null }

async function loadUnit(unitRef: string): Promise<{ unitId: string; unit: UnitRow }> {
  const unitId = await idOf('unit', unitRef).catch(async () => idOf('property', unitRef))
  const unit = await query<UnitRow>(
    `SELECT client_id::text AS client_id, agent_id::text AS agent_id FROM units WHERE id = $1::uuid`,
    [unitId],
  )
  if (!unit[0]) throw httpError(404, 'Unit not found', 'NOT_FOUND')
  return { unitId, unit: unit[0] }
}

function unitAsLease(unitId: string, unit: UnitRow): LeaseRow {
  return {
    id: unitId,
    client_id: unit.client_id,
    unit_id: unitId,
    tenant_id: null,
    landlord_id: null,
    agent_id: unit.agent_id,
    deposit_amount: 0,
    unit_agent_id: unit.agent_id,
  }
}

async function assertUnitReadable(actor: DemoActor, scope: ActorScope, unit: UnitRow) {
  const ok = inspectionReadable({
    actorRole: actor.role,
    actorUserId: scope.user ?? actor.userId,
    actorClientId: scope.agency,
    leaseClientId: (await agencyFeId(unit.client_id)) ?? unit.client_id,
    tenantId: null,
    landlordId: null,
  })
  if (!ok && !(scope.user && scope.user === unit.agent_id)) {
    throw forbiddenError('Forbidden: inventory is outside your agency')
  }
}

export async function listInventory(actor: DemoActor, unitRef: string) {
  const { unitId, unit } = await loadUnit(unitRef)
  await assertUnitReadable(actor, await scopeOf(actor), unit)
  const rows = await query(
    `SELECT id::text AS id, item_name, quantity, condition_status, notes, photos, room_id::text AS room_id
       FROM internal_assets WHERE unit_id = $1::uuid ORDER BY item_name`,
    [unitId],
  )
  return { unitId, items: rows }
}

/**
 * Items added to a unit after its move-in was signed go onto that inspection as
 * a dated addendum (the signed rows stay as they were).
 */
async function addToSignedMoveIn(
  unitId: string,
  clientId: string,
  asset: { id: string; itemName: string; quantity: number; notes: string | null },
): Promise<string | null> {
  const signed = await query<{ id: string }>(
    `SELECT i.id::text AS id
       FROM inspections i
       JOIN leases l ON l.id = i.lease_id
      WHERE i.unit_id = $1::uuid AND i.type = 'MOVE_IN' AND i.status = 'SIGNED'
        AND l.status IN ('PENDING', 'ACTIVE', 'NOTICE')
      ORDER BY i.conducted_at DESC NULLS LAST, i.created_at DESC
      LIMIT 1`,
    [unitId],
  )
  const inspectionId = signed[0]?.id
  if (!inspectionId) return null
  await query(
    `INSERT INTO inspection_items (
       id, client_id, inspection_id, asset_id, item_name, quantity, notes, photos, addendum, added_at, tenant_agreed
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, '[]'::jsonb, TRUE, NOW(), FALSE)`,
    [randomUUID(), clientId, inspectionId, asset.id, asset.itemName, asset.quantity, asset.notes],
  )
  return inspectionId
}

export async function createInventory(actor: DemoActor, unitRef: string, body: Record<string, unknown>) {
  const { unitId, unit } = await loadUnit(unitRef)
  const scope = await scopeOf(actor)
  await assertStaffWriter(actor, scope, unitAsLease(unitId, unit))
  const propertyType = String(body.propertyType ?? body.template ?? 'apartment') as InventoryPropertyType
  let items = Array.isArray(body.items) ? (body.items as InventoryTemplateItem[]) : null
  if (!items) {
    const stored = await query<{ items: InventoryTemplateItem[] }>(
      `SELECT items FROM inventory_templates WHERE client_id = $1::uuid AND property_type = $2`,
      [unit.client_id, propertyType],
    )
    items = stored[0]?.items?.length ? stored[0].items : defaultInventoryTemplate(
      propertyType === 'house' || propertyType === 'room' ? propertyType : 'apartment',
    )
  }
  const created: Array<{ id: string; itemName: string; room: string; quantity: number }> = []
  let addendumOn: string | null = null
  for (const item of items) {
    const id = randomUUID()
    const name = String(item.name ?? '').trim()
    if (!name) continue
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const notes = item.room ? String(item.room) : null
    await query(
      `INSERT INTO internal_assets (
         id, unit_id, client_id, item_name, asset_type_key, condition_status, quantity, notes, photos
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'FURNITURE', 'GOOD', $5, $6, '[]'::jsonb)`,
      [id, unitId, unit.client_id, name, quantity, notes],
    )
    addendumOn = (await addToSignedMoveIn(unitId, unit.client_id, { id, itemName: name, quantity, notes })) ?? addendumOn
    created.push({ id, itemName: name, room: item.room ?? '', quantity })
  }
  if (addendumOn) {
    await audit(unit.client_id, 'inspection_addendum_added', addendumOn, scope.user, {
      items: created.map((c) => c.itemName),
    })
  }
  return { unitId, items: created, addendumInspectionId: addendumOn }
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
  await assertStaffWriter(actor, await scopeOf(actor), unitAsLease(rows[0].unit_id, rows[0]))
  const unitId = await idOf('unit', unitRef).catch(async () => rows[0].unit_id)
  if (unitId !== rows[0].unit_id) throw forbiddenError('Forbidden: asset is not on this unit')
  // Photos are added through POST .../inventory/:assetId/photos (stored in documents).
  await query(
    `UPDATE internal_assets SET
       quantity = COALESCE($2::int, quantity),
       condition_status = COALESCE($3, condition_status),
       notes = COALESCE($4, notes),
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [
      assetId,
      body.quantity != null ? Math.max(1, Number(body.quantity) || 1) : null,
      body.condition ? String(body.condition).toUpperCase().replace(/\s+/g, '_') : null,
      body.notes != null ? String(body.notes) : null,
    ],
  )
  return { id: assetId }
}

/** Store one photo as a documents row (category INSPECTION). Returns the item photo record. */
async function storePhotoDocument(input: {
  clientId: string
  unitId: string
  leaseId: string | null
  uploader: string | null
  uploaderRole: string
  name: string
  dataUrl: string
}): Promise<InspectionPhoto> {
  const refusal = photoError(input.dataUrl)
  if (refusal) throw httpError(400, refusal, 'PHOTO_INVALID')
  const info = dataUrlInfo(input.dataUrl)!
  const documentId = randomUUID()
  const uploadedAt = new Date().toISOString()
  await query(
    `INSERT INTO documents (
       id, client_id, unit_id, lease_id, uploaded_by, name, category, status, storage_url,
       mime_type, file_size_bytes, note, uploaded_at
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'INSPECTION', 'UPLOADED', $7, $8, $9, $10, $11::timestamptz)`,
    [
      documentId,
      input.clientId,
      input.unitId,
      input.leaseId,
      input.uploader,
      input.name.slice(0, 255) || 'Inspection photo.jpg',
      input.dataUrl,
      info.mimeType,
      info.bytes,
      `${INSPECTION_FILE_NOTE}photo`,
      uploadedAt,
    ],
  )
  return {
    documentId,
    uploadedAt,
    uploadedBy: input.uploader,
    uploaderRole: input.uploaderRole,
    mimeType: info.mimeType,
    bytes: info.bytes,
  }
}

export async function addInventoryPhoto(
  actor: DemoActor,
  unitRef: string,
  assetId: string,
  body: Record<string, unknown>,
) {
  if (!isUuid(assetId)) throw httpError(400, 'Asset id is required', 'ASSET_REQUIRED')
  const rows = await query<{ unit_id: string; client_id: string; agent_id: string | null; photos: unknown }>(
    `SELECT a.unit_id::text AS unit_id, a.client_id::text AS client_id, u.agent_id::text AS agent_id, a.photos
       FROM internal_assets a JOIN units u ON u.id = a.unit_id WHERE a.id = $1::uuid`,
    [assetId],
  )
  const row = rows[0]
  if (!row) throw httpError(404, 'Asset not found', 'NOT_FOUND')
  const scope = await scopeOf(actor)
  await assertStaffWriter(actor, scope, unitAsLease(row.unit_id, row))
  const unitId = await idOf('unit', unitRef).catch(async () => row.unit_id)
  if (unitId !== row.unit_id) throw forbiddenError('Forbidden: asset is not on this unit')
  if (photoList(row.photos).length >= INSPECTION_PHOTO_MAX_PER_ITEM) {
    throw httpError(400, `At most ${INSPECTION_PHOTO_MAX_PER_ITEM} photos per item`, 'PHOTO_LIMIT')
  }
  const photo = await storePhotoDocument({
    clientId: row.client_id,
    unitId: row.unit_id,
    leaseId: null,
    uploader: scope.user,
    uploaderRole: actor.role,
    name: String(body.name ?? 'Inventory photo.jpg'),
    dataUrl: String(body.dataUrl ?? ''),
  })
  await query(
    `UPDATE internal_assets SET photos = COALESCE(photos, '[]'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`,
    [assetId, JSON.stringify([photo])],
  )
  return { id: assetId, photo: { ...photo, url: inspectionFileHref(photo.documentId) } }
}

/** Move-in rows keep the inventory photos; a move-out collects its own. */
async function copyItems(clientId: string, inspectionId: string, source: ItemRow[], keepPhotos: boolean) {
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
        keepPhotos ? JSON.stringify(photoList(item.photos)) : '[]',
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
  const scope = await scopeOf(actor)
  await assertStaffWriter(actor, scope, lease)
  const baseline = type === 'MOVE_OUT' ? await signedMoveInId(lease.id) : null
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
    await copyItems(lease.client_id, id, prefillMoveOutItems(items.map((item) => ({ ...item, itemName: item.item_name }))), false)
  } else {
    const assets = await query<ItemRow>(
      `SELECT id::text AS asset_id, NULL::text AS id, NULL::text AS inspection_id, room_id::text AS room_id,
              item_name, quantity, condition_status AS condition, NULL::text AS outcome, notes, photos,
              NULL::text AS tenant_comment, FALSE AS addendum, purchase_value
         FROM internal_assets WHERE unit_id = $1::uuid`,
      [lease.unit_id],
    )
    await copyItems(lease.client_id, id, assets, true)
  }
  await audit(lease.client_id, 'inspection_started', id, scope.user, { type, leaseId: lease.id, baseline })
  await notify(lease.client_id, lease.tenant_id, 'Inspection started', `A ${type.replace('_', ' ').toLowerCase()} inspection is ready to review.`, `/workspace/portals/tenant/leases`)
  return getInspection(actor, id)
}

export async function listLeaseInspections(actor: DemoActor, leaseRef: string) {
  const lease = await loadLease(leaseRef)
  await assertReadable(actor, await scopeOf(actor), lease)
  const rows = await query(
    `SELECT id::text AS id, type, status, scheduled_at, conducted_at, tenant_attended,
            baseline_inspection_id::text AS baseline_inspection_id,
            pdf_document_id::text AS pdf_document_id, dispute_note
       FROM inspections WHERE lease_id = $1::uuid ORDER BY created_at`,
    [lease.id],
  )
  return { leaseId: lease.id, inspections: rows }
}

function withPhotoUrls(item: ItemRow) {
  return {
    ...item,
    photos: photoList(item.photos).map((p) => ({ ...p, url: inspectionFileHref(p.documentId) })),
  }
}

export async function getInspection(actor: DemoActor, inspectionId: string) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  await assertReadable(actor, await scopeOf(actor), lease)
  const items = await loadItems(inspection.id)
  const signatures = await query(
    `SELECT role, signed_at, method, witness_note, tenant_declined, signer_user_id::text AS signer_user_id
       FROM inspection_signatures WHERE inspection_id = $1::uuid`,
    [inspection.id],
  )
  return {
    inspection: {
      ...inspection,
      pdf_url: inspection.pdf_document_id ? inspectionFileHref(inspection.pdf_document_id) : null,
    },
    items: items.map(withPhotoUrls),
    signatures,
    readOnly: inspection.status === 'SIGNED',
    deadlines: INSPECTION_DEADLINES,
    deadlineNote: INSPECTION_DEADLINE_NOTE,
  }
}

/** PATCH /api/inspections/:id: schedule and attendance. Refused once SIGNED. */
export async function patchInspection(actor: DemoActor, inspectionId: string, body: Record<string, unknown>) {
  const inspection = await loadInspection(inspectionId)
  if (inspection.status === 'SIGNED') {
    throw httpError(409, 'A signed inspection cannot be changed', 'INSPECTION_LOCKED')
  }
  const lease = await loadLease(inspection.lease_id)
  const scope = await scopeOf(actor)
  await assertStaffWriter(actor, scope, lease)
  const fields = inspectionPatchFields(body)
  const sets: string[] = []
  const params: unknown[] = [inspection.id]
  const set = (column: string, cast: string, value: unknown) => {
    params.push(value)
    sets.push(`${column} = $${params.length}${cast}`)
  }
  if (fields.status !== undefined) set('status', '', fields.status)
  if (fields.scheduledAt !== undefined) set('scheduled_at', '::timestamptz', fields.scheduledAt)
  if (fields.conductedAt !== undefined) set('conducted_at', '::timestamptz', fields.conductedAt)
  if (fields.tenantAttended !== undefined) set('tenant_attended', '::boolean', fields.tenantAttended)
  if (!sets.length) throw httpError(400, 'Nothing to change', 'NOTHING_TO_CHANGE')
  // status in the WHERE: a signature that lands first wins (409, not a silent overwrite).
  const updated = await query<{ id: string }>(
    `UPDATE inspections SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1::uuid AND status <> 'SIGNED'
      RETURNING id::text AS id`,
    params,
  )
  if (!updated[0]) throw httpError(409, 'A signed inspection cannot be changed', 'INSPECTION_LOCKED')
  await audit(inspection.client_id, 'inspection_updated', inspection.id, scope.user, fields)
  return { id: inspection.id, ...fields }
}

/** POST /api/inspections/:id/items: add a row; on a signed inspection it is a dated addendum. */
export async function addInspectionItem(actor: DemoActor, inspectionId: string, body: Record<string, unknown>) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  const scope = await scopeOf(actor)
  await assertStaffWriter(actor, scope, lease)
  const name = String(body.itemName ?? '').trim()
  if (!name) throw httpError(400, 'itemName is required', 'ITEM_NAME_REQUIRED')
  const addendum = inspection.status === 'SIGNED'
  const id = randomUUID()
  await query(
    `INSERT INTO inspection_items (
       id, client_id, inspection_id, item_name, quantity, condition, notes, photos, addendum, added_at, tenant_agreed
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, '[]'::jsonb, $8::boolean, CASE WHEN $8::boolean THEN NOW() END, $9::boolean)`,
    [
      id,
      inspection.client_id,
      inspection.id,
      name.slice(0, 160),
      Math.max(1, Number(body.quantity) || 1),
      body.condition ? String(body.condition) : null,
      body.notes ? String(body.notes) : null,
      addendum,
      addendum ? body.tenantAgreed === true : null,
    ],
  )
  if (addendum) {
    await audit(inspection.client_id, 'inspection_addendum_added', inspection.id, scope.user, { itemId: id, itemName: name })
  }
  return { id, addendum }
}

export async function patchInspectionItem(
  actor: DemoActor,
  inspectionId: string,
  itemId: string,
  body: Record<string, unknown>,
) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  const decision = itemPatchDecision({
    status: inspection.status,
    addendum: body.addendum === true,
    tenantAgreed: body.tenantAgreed === true,
  })
  if (decision === 'locked') {
    throw httpError(409, 'Signed inspection items are read-only', 'INSPECTION_LOCKED')
  }
  if (decision === 'addendum') return addInspectionItem(actor, inspectionId, body)
  const scope = await scopeOf(actor)
  const isTenant = actor.role === 'tenant'
  if (isTenant) await assertReadable(actor, scope, lease)
  else await assertStaffWriter(actor, scope, lease)
  const items = await loadItems(inspection.id)
  const item = items.find((row) => row.id === itemId)
  if (!item) throw httpError(404, 'Inspection item not found', 'NOT_FOUND')
  const outcome = body.outcome != null ? String(body.outcome).toUpperCase() : item.outcome
  const isMoveOut = inspection.type === 'MOVE_OUT'
  const baseline = isMoveOut ? inspection.baseline_inspection_id ?? (await signedMoveInId(lease.id)) : null
  const deemed = isMoveOut && !baseline
  const amount =
    body.amountCents != null
      ? Number(body.amountCents)
      : Math.round(Number(item.purchase_value ?? 0) * 100)
  const planned = isMoveOut
    ? deductionForOutcome({
        outcome,
        amountCents: amount,
        description: `${item.item_name} ${outcome ?? ''}`.trim(),
        itemId: item.id,
        deemedGoodOrder: deemed,
      })
    : { line: null, blocked: false }
  // The status check rides on the UPDATE: a signature that lands first wins.
  const unlocked = `AND EXISTS (SELECT 1 FROM inspections s WHERE s.id = inspection_id AND s.status <> 'SIGNED')`
  let changed: Array<{ id: string }>
  if (isTenant) {
    changed = await query<{ id: string }>(
      `UPDATE inspection_items SET tenant_comment = COALESCE($2, tenant_comment)
        WHERE id = $1::uuid ${unlocked} RETURNING id::text AS id`,
      [item.id, body.tenantComment != null ? String(body.tenantComment) : null],
    )
  } else {
    changed = await query<{ id: string }>(
      `UPDATE inspection_items SET
         condition = COALESCE($2, condition),
         outcome = COALESCE($3, outcome),
         notes = COALESCE($4, notes),
         quantity = COALESCE($5::int, quantity),
         tenant_comment = COALESCE($6, tenant_comment)
       WHERE id = $1::uuid ${unlocked} RETURNING id::text AS id`,
      [
        item.id,
        body.condition != null ? String(body.condition) : null,
        outcome,
        body.notes != null ? String(body.notes) : null,
        body.quantity != null ? Math.max(1, Number(body.quantity) || 1) : null,
        body.tenantComment != null ? String(body.tenantComment) : null,
      ],
    )
  }
  if (!changed[0]) throw httpError(409, 'Signed inspection items are read-only', 'INSPECTION_LOCKED')
  if (!isTenant && isMoveOut) {
    // One open suggestion per item: replace it, or clear it for OK / wear and tear.
    await query(
      `DELETE FROM deposit_deductions WHERE inspection_item_id = $1::uuid AND status = 'SUGGESTED'`,
      [item.id],
    )
  }
  if (planned.line && !isTenant) {
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
        JSON.stringify(photoList(item.photos).map((p) => p.documentId)),
      ],
    )
    await audit(inspection.client_id, 'deposit_deduction_suggested', inspection.id, scope.user, planned.line)
  }
  return {
    id: item.id,
    outcome,
    deduction: planned.line,
    warning: planned.blocked ? DEEMED_GOOD_ORDER_WARNING : null,
  }
}

/** POST /api/inspections/:id/items/:itemId/photos {name, dataUrl}: compressed in the browser first. */
export async function addInspectionPhoto(
  actor: DemoActor,
  inspectionId: string,
  itemId: string,
  body: Record<string, unknown>,
) {
  const inspection = await loadInspection(inspectionId)
  if (inspection.status === 'SIGNED') {
    throw httpError(409, 'Signed inspection items are read-only', 'INSPECTION_LOCKED')
  }
  const lease = await loadLease(inspection.lease_id)
  const scope = await scopeOf(actor)
  if (actor.role === 'tenant') await assertReadable(actor, scope, lease)
  else await assertStaffWriter(actor, scope, lease)
  const items = await loadItems(inspection.id)
  const item = items.find((row) => row.id === itemId)
  if (!item) throw httpError(404, 'Inspection item not found', 'NOT_FOUND')
  if (photoList(item.photos).length >= INSPECTION_PHOTO_MAX_PER_ITEM) {
    throw httpError(400, `At most ${INSPECTION_PHOTO_MAX_PER_ITEM} photos per item`, 'PHOTO_LIMIT')
  }
  const photo = await storePhotoDocument({
    clientId: inspection.client_id,
    unitId: inspection.unit_id,
    leaseId: lease.id,
    uploader: scope.user,
    uploaderRole: actor.role,
    name: String(body.name ?? `${item.item_name}.jpg`),
    dataUrl: String(body.dataUrl ?? ''),
  })
  const changed = await query<{ id: string }>(
    `UPDATE inspection_items SET photos = COALESCE(photos, '[]'::jsonb) || $2::jsonb
      WHERE id = $1::uuid
        AND EXISTS (SELECT 1 FROM inspections s WHERE s.id = inspection_id AND s.status <> 'SIGNED')
      RETURNING id::text AS id`,
    [item.id, JSON.stringify([photo])],
  )
  if (!changed[0]) throw httpError(409, 'Signed inspection items are read-only', 'INSPECTION_LOCKED')
  await audit(inspection.client_id, 'inspection_photo_added', inspection.id, scope.user, {
    itemId: item.id,
    documentId: photo.documentId,
    uploaderRole: actor.role,
  })
  return { id: item.id, photo: { ...photo, url: inspectionFileHref(photo.documentId) } }
}

/** GET /api/inspection-files/:documentId: scoped read of a stored photo or PDF. */
export async function readInspectionFile(actor: DemoActor, documentId: string) {
  if (!isUuid(documentId)) throw httpError(404, 'File not found', 'NOT_FOUND')
  const rows = await query<{ lease_id: string | null; unit_id: string | null; storage_url: string | null; mime_type: string | null; name: string }>(
    `SELECT lease_id::text AS lease_id, unit_id::text AS unit_id, storage_url, mime_type, name
       FROM documents WHERE id = $1::uuid AND category = 'INSPECTION' AND note LIKE 'inspection-file:%'`,
    [documentId],
  )
  const doc = rows[0]
  if (!doc) throw httpError(404, 'File not found', 'NOT_FOUND')
  const scope = await scopeOf(actor)
  if (doc.lease_id) {
    await assertReadable(actor, scope, await loadLease(doc.lease_id))
  } else if (doc.unit_id) {
    const { unit } = await loadUnit(doc.unit_id)
    await assertUnitReadable(actor, scope, unit)
  } else {
    throw httpError(404, 'File not found', 'NOT_FOUND')
  }
  const raw = doc.storage_url ?? ''
  const info = dataUrlInfo(raw)
  if (info) {
    const bytes = Buffer.from(raw.slice(raw.indexOf(',') + 1), 'base64')
    return { kind: 'bytes' as const, bytes, mimeType: info.mimeType, name: doc.name }
  }
  if (/^https:\/\//i.test(raw)) return { kind: 'redirect' as const, url: raw }
  throw httpError(404, 'File not found', 'NOT_FOUND')
}

export async function signInspection(actor: DemoActor, inspectionId: string, body: Record<string, unknown>, ip: string | null) {
  const inspection = await loadInspection(inspectionId)
  if (inspection.status === 'SIGNED') {
    throw httpError(409, 'This inspection is already signed', 'INSPECTION_LOCKED')
  }
  const lease = await loadLease(inspection.lease_id)
  const scope = await scopeOf(actor)
  const role = String(body.role ?? (actor.role === 'tenant' ? 'TENANT' : 'AGENT')).toUpperCase()
  if (!['TENANT', 'AGENT', 'LANDLORD'].includes(role)) throw httpError(400, 'role is required', 'ROLE_REQUIRED')
  if (role === 'TENANT') {
    if (actor.role !== 'tenant') throw forbiddenError('Forbidden: only the tenant can sign as tenant')
    await assertReadable(actor, scope, lease)
    // A tenant who will not sign disputes it; the agent can then sign "tenant declined".
    if (body.refused === true) return disputeInspection(actor, inspectionId, body)
  } else if (role === 'LANDLORD') {
    if (actor.role !== 'landlord' && actor.role !== 'super_admin') {
      throw forbiddenError('Forbidden: only the landlord can sign as landlord')
    }
    await assertReadable(actor, scope, lease)
  } else {
    await assertStaffWriter(actor, scope, lease)
  }
  const declined = role === 'AGENT' && body.tenantDeclined === true
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
    [randomUUID(), inspection.client_id, inspection.id, scope.user, role, ip, body.method === 'ESIGN' ? 'ESIGN' : 'IN_APP', witness, declined],
  )
  const marks = await query<SignatureMark & { witness_note: string | null; tenant_declined: boolean }>(
    `SELECT role, tenant_declined, witness_note FROM inspection_signatures WHERE inspection_id = $1::uuid`,
    [inspection.id],
  )
  const computed = statusAfterSignatures(
    marks.map((m) => ({ role: m.role, tenantDeclined: m.tenant_declined, witnessNote: m.witness_note })),
  )
  // A dispute stays visible until the inspection is fully signed.
  const status = computed !== 'SIGNED' && inspection.status === 'DISPUTED' ? 'DISPUTED' : computed
  await query(
    `UPDATE inspections SET status = $2, conducted_at = COALESCE(conducted_at, NOW()), updated_at = NOW() WHERE id = $1::uuid`,
    [inspection.id, status],
  )
  await audit(inspection.client_id, 'inspection_signed', inspection.id, scope.user, { role, status, tenantDeclined: declined })
  const other = role === 'TENANT' ? lease.agent_id : lease.tenant_id
  await notify(inspection.client_id, other, 'Inspection signature', `The inspection was signed (${role}).`, `/workspace/people/tenants/${lease.id}?tab=inspections`)
  return { id: inspection.id, status }
}

export async function disputeInspection(actor: DemoActor, inspectionId: string, body: Record<string, unknown>) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  const scope = await scopeOf(actor)
  await assertReadable(actor, scope, lease)
  if (inspection.status === 'SIGNED') throw httpError(409, 'A signed inspection cannot be disputed', 'INSPECTION_LOCKED')
  const note = String(body.comment ?? body.note ?? '').trim()
  if (!note) throw httpError(400, 'A dispute comment is required', 'COMMENT_REQUIRED')
  await query(
    `UPDATE inspections SET status = 'DISPUTED', dispute_note = $2, updated_at = NOW() WHERE id = $1::uuid AND status <> 'SIGNED'`,
    [inspection.id, note],
  )
  if (body.itemId && isUuid(String(body.itemId))) {
    await query(
      `UPDATE inspection_items SET tenant_comment = $2 WHERE id = $1::uuid AND inspection_id = $3::uuid`,
      [String(body.itemId), note, inspection.id],
    )
  }
  await audit(inspection.client_id, 'inspection_disputed', inspection.id, scope.user, { note, refused: body.refused === true })
  await notify(inspection.client_id, lease.agent_id, 'Inspection disputed', note, `/workspace/people/tenants/${lease.id}?tab=inspections`)
  return { id: inspection.id, status: 'DISPUTED' as const }
}

export type CompareTone = 'red' | 'amber' | 'grey' | 'neutral'

export function toneForOutcome(outcome: string | null): CompareTone {
  if (outcome === 'MISSING') return 'red'
  if (outcome === 'DAMAGED') return 'amber'
  if (outcome === 'WEAR_AND_TEAR') return 'grey'
  return 'neutral'
}

/** Pair move-out rows with their move-in row (same asset, else same name). */
export function pairRows<T extends { id: string; asset_id: string | null; item_name: string }>(moveIn: T[], moveOut: T[]) {
  const byAsset = new Map(moveIn.filter((i) => i.asset_id).map((i) => [i.asset_id as string, i]))
  const byName = new Map(moveIn.map((i) => [i.item_name, i]))
  return moveOut.map((out) => ({
    moveOut: out,
    moveIn: (out.asset_id ? byAsset.get(out.asset_id) : undefined) ?? byName.get(out.item_name) ?? null,
  }))
}

export async function compareInspection(actor: DemoActor, inspectionId: string) {
  const inspection = await loadInspection(inspectionId)
  const lease = await loadLease(inspection.lease_id)
  await assertReadable(actor, await scopeOf(actor), lease)
  const moveOut = await loadItems(inspection.id)
  const baselineId = inspection.baseline_inspection_id ?? (await signedMoveInId(lease.id))
  const moveIn = baselineId ? await loadItems(baselineId) : []
  const deemedGoodOrder = inspection.type === 'MOVE_OUT' && !baselineId
  const suggestions = await query<{ id: string; inspection_item_id: string | null; description: string; amount_cents: number; status: string }>(
    `SELECT id::text AS id, inspection_item_id::text AS inspection_item_id, description, amount_cents, status
       FROM deposit_deductions WHERE lease_id = $1::uuid AND status <> 'REJECTED'
      ORDER BY created_at`,
    [lease.id],
  )
  const deposit = await findDeposit(lease)
  const cap = depositCapCents(lease, deposit)
  const capped = capSuggestions(
    suggestions.map((row) => ({ ...row, amountCents: Number(row.amount_cents) })),
    deemedGoodOrder ? 0 : cap,
  )
  const amountByItem = new Map<string, number>()
  for (const line of capped.lines) {
    if (line.inspection_item_id) amountByItem.set(line.inspection_item_id, (amountByItem.get(line.inspection_item_id) ?? 0) + line.amountCents)
  }
  const rows = pairRows(moveIn, moveOut).map(({ moveIn: before, moveOut: after }) => ({
    itemId: after.id,
    itemName: after.item_name,
    moveInCondition: before?.condition ?? null,
    moveInPhotos: before ? withPhotoUrls(before).photos : [],
    moveOutCondition: after.condition,
    moveOutPhotos: withPhotoUrls(after).photos,
    outcome: after.outcome,
    tone: toneForOutcome(after.outcome),
    // Wear and tear is never charged, whatever was stored.
    amountCents: deemedGoodOrder || after.outcome === 'WEAR_AND_TEAR' ? 0 : amountByItem.get(after.id) ?? 0,
    addendum: after.addendum,
  }))
  return {
    inspectionId: inspection.id,
    leaseId: lease.id,
    type: inspection.type,
    status: inspection.status,
    baselineInspectionId: baselineId,
    deemedGoodOrder,
    warning: deemedGoodOrder ? DEEMED_GOOD_ORDER_WARNING : capped.warning,
    rows,
    totalCents: deemedGoodOrder ? 0 : capped.totalCents,
    remainderCents: deemedGoodOrder ? cap : capped.remainderCents,
    capCents: cap,
    capped: capped.capped,
    deadlines: INSPECTION_DEADLINES,
    deadlineNote: INSPECTION_DEADLINE_NOTE,
    suggestions: deemedGoodOrder
      ? []
      : capped.lines.map((line) => ({ id: line.id, description: line.description, amountCents: line.amountCents, status: line.status })),
  }
}

function pdfSafe(text: string, max = 90): string {
  return text.replace(/[^\x20-\x7E]/g, '?').slice(0, max)
}

export async function storeInspectionPdf(actor: DemoActor, inspectionId: string) {
  const packed = await getInspection(actor, inspectionId)
  const inspection = packed.inspection
  const lease = await loadLease(inspection.lease_id)
  const scope = await scopeOf(actor)
  await assertStaffWriter(actor, scope, lease)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([595.28, 841.89])
  page.drawText('Move inspection', { x: 48, y: 780, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) })
  page.drawText(`${inspection.type} - ${inspection.status}`, { x: 48, y: 756, size: 11, font, color: rgb(0.2, 0.2, 0.2) })
  page.drawText(pdfSafe(INSPECTION_DEADLINE_NOTE, 180), { x: 48, y: 730, size: 8, font, color: rgb(0.35, 0.35, 0.35) })
  let y = 700
  const line = (text: string, size = 10, face = font) => {
    if (y < 72) {
      page = doc.addPage([595.28, 841.89])
      y = 780
    }
    page.drawText(pdfSafe(text), { x: 48, y, size, font: face })
    y -= size + 6
  }
  for (const item of packed.items) {
    const prefix = item.addendum ? `[Addendum ${String(item.added_at ?? '').slice(0, 10)}] ` : ''
    line(`${prefix}${item.item_name} x${item.quantity} - ${item.condition ?? '-'} - ${item.outcome ?? '-'} - ${item.photos.length} photo(s)`)
  }
  y -= 8
  for (const sig of packed.signatures as Array<{ role: string; signed_at: string; tenant_declined: boolean; witness_note: string | null }>) {
    line(`${sig.role} signed ${String(sig.signed_at).slice(0, 19)}${sig.tenant_declined ? ` (tenant declined; witness: ${sig.witness_note ?? ''})` : ''}`, 9, bold)
  }
  const bytes = await doc.save()
  const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`
  const documentId = randomUUID()
  await query(
    `INSERT INTO documents (
       id, client_id, unit_id, lease_id, uploaded_by, name, category, status, storage_url, mime_type,
       file_size_bytes, note, uploaded_at
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'INSPECTION', 'UPLOADED', $7, 'application/pdf', $8, $9, NOW())`,
    [documentId, inspection.client_id, inspection.unit_id, inspection.lease_id, scope.user, `${inspection.type} inspection.pdf`, dataUrl, bytes.length, `${INSPECTION_FILE_NOTE}pdf`],
  )
  await query(`UPDATE inspections SET pdf_document_id = $2::uuid, updated_at = NOW() WHERE id = $1::uuid`, [
    inspection.id,
    documentId,
  ])
  const url = inspectionFileHref(documentId)
  return { documentId, url, pdfDocumentId: documentId }
}

/**
 * POST /api/leases/:id/deductions {ids, status}. The landlord or an agency admin
 * decides. APPROVED lines are capped at deposit + interest and handed to the
 * deposit release flow (server/depositRoutes.ts): an event_log row on the
 * deposit holding that the refund step reads as its deductions.
 */
export async function decideDeductions(actor: DemoActor, leaseRef: string, body: Record<string, unknown>) {
  const lease = await loadLease(leaseRef)
  const scope = await scopeOf(actor)
  const landlord = actor.role === 'landlord' && scope.user && scope.user === lease.landlord_id
  const admin =
    actor.role === 'super_admin' ||
    (actor.role === 'client_admin' && Boolean(scope.agency) && scope.agency === (await agencyFeId(lease.client_id)))
  if (!landlord && !admin) throw forbiddenError('Forbidden: only the landlord or an agency admin can decide deductions')
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((id) => isUuid(id)) : []
  const status = String(body.status ?? 'APPROVED').toUpperCase()
  if (!['APPROVED', 'REJECTED'].includes(status)) throw httpError(400, 'status must be APPROVED or REJECTED', 'STATUS_REQUIRED')
  if (!ids.length) throw httpError(400, 'ids are required', 'IDS_REQUIRED')
  if (!(await signedMoveInId(lease.id)) && status === 'APPROVED') {
    throw httpError(409, DEEMED_GOOD_ORDER_WARNING, 'DEEMED_GOOD_ORDER')
  }
  const deposit = await findDeposit(lease)
  let warning: string | null = null
  if (status === 'APPROVED') {
    const open = await query<{ id: string; amount_cents: number | string; outcome: string | null }>(
      `SELECT d.id::text AS id, d.amount_cents, i.outcome
         FROM deposit_deductions d
         LEFT JOIN inspection_items i ON i.id = d.inspection_item_id
        WHERE d.lease_id = $1::uuid AND d.id = ANY($2::uuid[]) AND d.status = 'SUGGESTED'
        ORDER BY d.created_at`,
      [lease.id, ids],
    )
    const already = await query<{ total: number | string | null }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM deposit_deductions WHERE lease_id = $1::uuid AND status = 'APPROVED'`,
      [lease.id],
    )
    // Wear and tear is never charged, even when a stale suggestion exists.
    const chargeable = open.filter((row) => row.outcome !== 'WEAR_AND_TEAR')
    const capped = capSuggestions(
      chargeable.map((row) => ({ id: row.id, amountCents: centsOf(row.amount_cents) })),
      depositCapCents(lease, deposit) - centsOf(already[0]?.total),
    )
    warning = capped.warning
    for (const line of capped.lines) {
      await query(
        `UPDATE deposit_deductions SET status = 'APPROVED', amount_cents = $3, updated_at = NOW()
          WHERE lease_id = $1::uuid AND id = $2::uuid AND status = 'SUGGESTED'`,
        [lease.id, line.id, line.amountCents],
      )
    }
    const wear = open.filter((row) => row.outcome === 'WEAR_AND_TEAR').map((row) => row.id)
    if (wear.length) {
      await query(
        `UPDATE deposit_deductions SET status = 'REJECTED', updated_at = NOW()
          WHERE lease_id = $1::uuid AND id = ANY($2::uuid[]) AND status = 'SUGGESTED'`,
        [lease.id, wear],
      )
    }
  } else {
    await query(
      `UPDATE deposit_deductions SET status = 'REJECTED', updated_at = NOW()
        WHERE lease_id = $1::uuid AND id = ANY($2::uuid[]) AND status = 'SUGGESTED'`,
      [lease.id, ids],
    )
  }
  await audit(lease.client_id, 'deposit_deduction_decided', lease.id, scope.user, { ids, status, capped: Boolean(warning) }, 'lease')
  const lines = await query<{ id: string; description: string; amount_cents: number | string; inspection_item_id: string | null }>(
    `SELECT id::text AS id, description, amount_cents, inspection_item_id::text AS inspection_item_id
       FROM deposit_deductions
      WHERE lease_id = $1::uuid AND status = 'APPROVED' AND amount_cents > 0
      ORDER BY created_at`,
    [lease.id],
  )
  const refundPrefill = lines.map((line) => ({ reason: line.description.slice(0, 200), amountCents: centsOf(line.amount_cents) }))
  const totalCents = refundPrefill.reduce((sum, line) => sum + line.amountCents, 0)
  let handoff: { depositId: string; status: string; nextStep: string } | null = null
  if (deposit) {
    await audit(
      lease.client_id,
      'deposit_deductions_approved',
      deposit.id,
      scope.user,
      {
        leaseId: lease.id,
        deductions: refundPrefill,
        deductionIds: lines.map((line) => line.id),
        totalCents,
        at: new Date().toISOString(),
      },
      'deposit_holding',
    )
    handoff = {
      depositId: (await resolveFrontendId('deposit_holding', deposit.id)) ?? deposit.id,
      status: deposit.status,
      nextStep:
        deposit.status === 'held'
          ? 'propose-release'
          : deposit.status === 'release_proposed'
            ? 'approve-release'
            : deposit.status === 'release_approved'
              ? 'refund'
              : 'none',
    }
  }
  return {
    leaseId: lease.id,
    refundPrefill,
    totalCents,
    warning,
    deposit: handoff,
    depositWarning: deposit ? null : 'No trust deposit holding is linked to this lease yet. Record it in the deposit register before release.',
  }
}

export async function listTemplates(actor: DemoActor) {
  if (!STAFF.has(actor.role)) throw forbiddenError('Forbidden')
  const client = actor.role === 'super_admin' ? null : await resolveUuid('agency', actor.agencyId)
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
  const client = await resolveUuid('agency', actor.agencyId)
  if (!client) throw httpError(400, 'Agency is required', 'AGENCY_REQUIRED')
  const propertyType = String(body.propertyType ?? '')
  if (!['house', 'apartment', 'room'].includes(propertyType)) {
    throw httpError(400, 'propertyType must be house, apartment, or room', 'TYPE_REQUIRED')
  }
  const items = Array.isArray(body.items)
    ? (body.items as InventoryTemplateItem[])
        .map((item) => ({
          room: String(item?.room ?? '').slice(0, 80),
          name: String(item?.name ?? '').trim().slice(0, 160),
          quantity: Math.max(1, Math.round(Number(item?.quantity) || 1)),
        }))
        .filter((item) => item.name)
        .slice(0, 200)
    : defaultInventoryTemplate(propertyType as InventoryPropertyType)
  const id = randomUUID()
  await query(
    `INSERT INTO inventory_templates (id, client_id, property_type, items, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, NOW())
     ON CONFLICT (client_id, property_type) DO UPDATE SET items = EXCLUDED.items, updated_at = NOW()`,
    [id, client, propertyType, JSON.stringify(items)],
  )
  return { propertyType, items }
}
