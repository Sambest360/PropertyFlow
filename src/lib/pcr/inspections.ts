/**
 * Mode A PCR inspection lifecycle — create, items/photos/notes, soft sign / no-show override.
 * Sets `ingoingPcrSigned` when staff+tenant soft-ack OR documented no-show + admin override.
 */

import type { Application } from '../../types/domain'
import { cloneTemplateRooms, defaultResidentialTemplate } from './templates.js'
import type {
  ItemCondition,
  PcrInspectionItem,
  PcrInspectionRoom,
  PcrItemPhoto,
  PcrNoShowOverride,
  PcrSoftSignature,
  PropertyConditionInspection,
} from './types'

export const PCR_MODE_A_COPY =
  'Non-production PCR pack. Joint-style incoming/outgoing condition notes beside occupancy — not RHA legal advice, not PropertyInspect / RedRabbit parity, not a full offline field PCR product, and not GPS-required.'

export function listInspections(
  app: Pick<Application, 'pcrInspections'> | null | undefined,
): PropertyConditionInspection[] {
  return (app?.pcrInspections ?? []) as PropertyConditionInspection[]
}

export function findInspection(
  app: Pick<Application, 'pcrInspections'> | null | undefined,
  kind: 'incoming' | 'outgoing',
): PropertyConditionInspection | null {
  return listInspections(app).find((i) => i.kind === kind) ?? null
}

export function isIngoingPcrSigned(
  app: Pick<Application, 'pcrInspections'> | null | undefined,
): boolean {
  const incoming = findInspection(app, 'incoming')
  return Boolean(incoming?.ingoingPcrSigned)
}

export function createInspection(params: {
  id: string
  agencyId: string
  applicationId: string
  propertyId: string
  kind: 'incoming' | 'outgoing'
  scheduledOn?: string | null
  tenancyId?: string | null
  unitId?: string | null
  now: string
  rooms?: PcrInspectionRoom[]
}): PropertyConditionInspection {
  const rooms = cloneTemplateRooms(
    params.rooms?.length ? params.rooms : defaultResidentialTemplate(),
    params.id,
  )
  return {
    id: params.id,
    agencyId: params.agencyId,
    applicationId: params.applicationId,
    propertyId: params.propertyId,
    tenancyId: params.tenancyId ?? null,
    unitId: params.unitId ?? null,
    kind: params.kind,
    status: params.scheduledOn ? 'scheduled' : 'draft',
    scheduledOn: params.scheduledOn ?? null,
    completedAt: null,
    rooms,
    generalNotes: '',
    staffSignature: null,
    tenantSignature: null,
    noShowOverride: null,
    ingoingPcrSigned: false,
    createdAt: params.now,
    updatedAt: params.now,
  }
}

/** Ensure an incoming inspection exists on the application (idempotent). */
export function ensureIngoingInspection(
  app: Application,
  now: string,
  scheduledOn?: string | null,
  /** The agency's configured rooms (default template when empty). */
  rooms?: PcrInspectionRoom[],
): { application: Application; inspection: PropertyConditionInspection; created: boolean } {
  const existing = findInspection(app, 'incoming')
  if (existing) {
    if (scheduledOn && !existing.scheduledOn) {
      const updated: PropertyConditionInspection = {
        ...existing,
        scheduledOn,
        status: existing.status === 'draft' ? 'scheduled' : existing.status,
        updatedAt: now,
      }
      return {
        application: upsertInspectionOnApplication(app, updated),
        inspection: updated,
        created: false,
      }
    }
    return { application: app, inspection: existing, created: false }
  }
  const inspection = createInspection({
    id: `pcr-in-${app.id}`,
    agencyId: app.agencyId,
    applicationId: app.id,
    propertyId: app.propertyId,
    unitId: app.unitId ?? null,
    kind: 'incoming',
    scheduledOn: scheduledOn ?? app.moveInDate ?? null,
    now,
    rooms,
  })
  return {
    application: upsertInspectionOnApplication(app, inspection),
    inspection,
    created: true,
  }
}

/** Ensure an outgoing inspection exists (idempotent). */
export function ensureOutgoingInspection(
  app: Application,
  now: string,
  scheduledOn?: string | null,
  /** The agency's configured rooms (default template when empty). */
  rooms?: PcrInspectionRoom[],
): { application: Application; inspection: PropertyConditionInspection; created: boolean } {
  const existing = findInspection(app, 'outgoing')
  if (existing) {
    return { application: app, inspection: existing, created: false }
  }
  const inspection = createInspection({
    id: `pcr-out-${app.id}`,
    agencyId: app.agencyId,
    applicationId: app.id,
    propertyId: app.propertyId,
    unitId: app.unitId ?? null,
    kind: 'outgoing',
    scheduledOn: scheduledOn ?? null,
    now,
    rooms,
  })
  return {
    application: upsertInspectionOnApplication(app, inspection),
    inspection,
    created: true,
  }
}

export function upsertInspectionOnApplication(
  app: Application,
  inspection: PropertyConditionInspection,
): Application {
  const rest = listInspections(app).filter((i) => i.id !== inspection.id)
  // Domain mirrors lib shape (PropertyConditionInspectionRecord).
  return {
    ...app,
    pcrInspections: [...rest, inspection] as Application['pcrInspections'],
  }
}

export function updateItemNotes(
  inspection: PropertyConditionInspection,
  roomId: string,
  itemId: string,
  patch: {
    notes?: string
    condition?: ItemCondition
    needsMaintenance?: boolean
  },
  now: string,
): PropertyConditionInspection {
  return {
    ...inspection,
    status: inspection.status === 'draft' || inspection.status === 'scheduled' ? 'in_progress' : inspection.status,
    rooms: inspection.rooms.map((r) =>
      r.id !== roomId
        ? r
        : {
            ...r,
            items: r.items.map((it) =>
              it.id !== itemId
                ? it
                : {
                    ...it,
                    notes: patch.notes ?? it.notes,
                    condition: patch.condition ?? it.condition,
                    needsMaintenance: patch.needsMaintenance ?? it.needsMaintenance,
                  },
            ),
          },
    ),
    updatedAt: now,
  }
}

export function addItemPhoto(
  inspection: PropertyConditionInspection,
  roomId: string,
  itemId: string,
  photo: PcrItemPhoto,
  now: string,
): PropertyConditionInspection {
  return {
    ...inspection,
    status: inspection.status === 'draft' || inspection.status === 'scheduled' ? 'in_progress' : inspection.status,
    rooms: inspection.rooms.map((r) =>
      r.id !== roomId
        ? r
        : {
            ...r,
            items: r.items.map((it) =>
              it.id !== itemId ? it : { ...it, photos: [...it.photos, photo] },
            ),
          },
    ),
    updatedAt: now,
  }
}

export function setGeneralNotes(
  inspection: PropertyConditionInspection,
  notes: string,
  now: string,
): PropertyConditionInspection {
  return { ...inspection, generalNotes: notes, updatedAt: now }
}

export function markInspectionCompleted(
  inspection: PropertyConditionInspection,
  now: string,
): PropertyConditionInspection {
  if (inspection.ingoingPcrSigned || inspection.status === 'signed' || inspection.status === 'no_show_override') {
    return { ...inspection, completedAt: inspection.completedAt ?? now, updatedAt: now }
  }
  return {
    ...inspection,
    status: 'completed',
    completedAt: now,
    updatedAt: now,
  }
}

/** Sign-off needs a condition on every item. */
function uncheckedItemsError(inspection: PropertyConditionInspection): string | null {
  const left = inspection.rooms.reduce(
    (n, r) => n + r.items.filter((i) => i.condition === 'not_checked').length,
    0,
  )
  return left ? `Check every item before signing off (${left} still to check).` : null
}

function recomputeIngoingSigned(inspection: PropertyConditionInspection): boolean {
  if (inspection.kind !== 'incoming') return false
  if (inspection.noShowOverride) return true
  return Boolean(inspection.staffSignature && inspection.tenantSignature)
}

/** Staff soft sign / ack (in-app). */
export function softSignStaff(
  inspection: PropertyConditionInspection,
  actor: { userId: string; name: string },
  now: string,
  note?: string,
): { ok: true; inspection: PropertyConditionInspection } | { ok: false; error: string } {
  if (!actor.userId || !actor.name.trim()) {
    return { ok: false, error: 'Staff actor required for soft sign' }
  }
  const unchecked = uncheckedItemsError(inspection)
  if (unchecked) return { ok: false, error: unchecked }
  const sig: PcrSoftSignature = {
    role: 'staff',
    signedByUserId: actor.userId,
    signedByName: actor.name.trim(),
    signedAt: now,
    method: 'in_app_ack',
    note,
  }
  let next: PropertyConditionInspection = {
    ...inspection,
    staffSignature: sig,
    status: 'in_progress',
    updatedAt: now,
  }
  const signed = recomputeIngoingSigned(next)
  if (signed) {
    next = {
      ...next,
      ingoingPcrSigned: next.kind === 'incoming',
      status: next.kind === 'incoming' ? 'signed' : 'completed',
      completedAt: next.completedAt ?? now,
    }
  }
  return { ok: true, inspection: next }
}

/** Tenant soft sign / ack (in-app or staff-recorded on behalf). */
export function softSignTenant(
  inspection: PropertyConditionInspection,
  actor: { userId: string | null; name: string; method?: 'in_app_ack' | 'staff_recorded' },
  now: string,
  note?: string,
): { ok: true; inspection: PropertyConditionInspection } | { ok: false; error: string } {
  if (!actor.name.trim()) {
    return { ok: false, error: 'Tenant name required for soft ack' }
  }
  const unchecked = uncheckedItemsError(inspection)
  if (unchecked) return { ok: false, error: unchecked }
  const sig: PcrSoftSignature = {
    role: 'tenant',
    signedByUserId: actor.userId,
    signedByName: actor.name.trim(),
    signedAt: now,
    method: actor.method ?? 'in_app_ack',
    note,
  }
  let next: PropertyConditionInspection = {
    ...inspection,
    tenantSignature: sig,
    status: 'in_progress',
    updatedAt: now,
  }
  const signed = recomputeIngoingSigned(next)
  if (signed) {
    next = {
      ...next,
      ingoingPcrSigned: next.kind === 'incoming',
      status: next.kind === 'incoming' ? 'signed' : 'completed',
      completedAt: next.completedAt ?? now,
    }
  }
  return { ok: true, inspection: next }
}

/**
 * Documented tenant no-show + admin override → sets `ingoingPcrSigned` for incoming.
 * Audited reason required.
 */
export function recordNoShowOrAdminOverride(
  inspection: PropertyConditionInspection,
  params: {
    byUserId: string
    byName: string
    reason: string
    kind: PcrNoShowOverride['kind']
    now: string
  },
): { ok: true; inspection: PropertyConditionInspection } | { ok: false; error: string } {
  if (!params.byUserId || !params.byName.trim()) {
    return { ok: false, error: 'Admin actor required for override' }
  }
  const reason = params.reason.trim()
  if (reason.length < 8) {
    return { ok: false, error: 'Documented reason required (min 8 chars) for no-show / admin override' }
  }
  const override: PcrNoShowOverride = {
    byUserId: params.byUserId,
    byName: params.byName.trim(),
    at: params.now,
    reason,
    kind: params.kind,
  }
  const next: PropertyConditionInspection = {
    ...inspection,
    noShowOverride: override,
    ingoingPcrSigned: inspection.kind === 'incoming',
    status: 'no_show_override',
    completedAt: inspection.completedAt ?? params.now,
    updatedAt: params.now,
  }
  return { ok: true, inspection: next }
}

export function inspectionStatusLabel(status: PropertyConditionInspection['status']): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'scheduled':
      return 'Scheduled'
    case 'in_progress':
      return 'In progress'
    case 'completed':
      return 'Completed (unsigned)'
    case 'signed':
      return 'Soft-signed'
    case 'no_show_override':
      return 'No-show / admin override'
    default:
      return status
  }
}

export function countCheckedItems(inspection: PropertyConditionInspection): {
  total: number
  checked: number
  withPhotos: number
  needsMaintenance: number
} {
  let total = 0
  let checked = 0
  let withPhotos = 0
  let needsMaintenance = 0
  for (const r of inspection.rooms) {
    for (const it of r.items) {
      total += 1
      if (it.condition !== 'not_checked') checked += 1
      if (it.photos.length) withPhotos += 1
      if (it.needsMaintenance) needsMaintenance += 1
    }
  }
  return { total, checked, withPhotos, needsMaintenance }
}

export type { PcrInspectionItem, PcrInspectionRoom }
