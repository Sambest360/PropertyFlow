/**
 * PCR / inspections Mode A types (Jim + Oscar soft stamp).
 * Joint-style soft PCR pack beside occupancy — not PropertyInspect parity,
 * not RHA legal advice, not a full field PCR product.
 */

export type InspectionKind = 'incoming' | 'outgoing'

export type InspectionStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'signed'
  | 'no_show_override'

export type ItemCondition =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'damaged'
  | 'missing'
  | 'not_checked'

export type PcrItemPhoto = {
  id: string
  /** Data URL or storage URL — Mode A soft demo; not a native field camera app. */
  url: string
  caption?: string
  capturedAt?: string
}

export type PcrInspectionItem = {
  id: string
  label: string
  condition: ItemCondition
  notes: string
  photos: PcrItemPhoto[]
  /** When true, optional maintenance handoff may draft a ticket. */
  needsMaintenance?: boolean
}

export type PcrInspectionRoom = {
  id: string
  name: string
  notes: string
  items: PcrInspectionItem[]
}

export type PcrSoftSignature = {
  role: 'staff' | 'tenant'
  signedByUserId: string | null
  signedByName: string
  signedAt: string
  /** Soft ack method — not wet-ink / not GPS-required / not RHA certified. */
  method: 'in_app_ack' | 'staff_recorded'
  note?: string
}

export type PcrNoShowOverride = {
  byUserId: string
  byName: string
  at: string
  reason: string
  /** Documented no-show or admin override path. */
  kind: 'tenant_no_show' | 'admin_override'
}

/**
 * Incoming / outgoing inspection object (Mode A).
 * `ingoingPcrSigned` (or equivalent) is derived + mirrored for soft-gate.
 */
export type PropertyConditionInspection = {
  id: string
  agencyId: string
  applicationId: string
  propertyId: string
  tenancyId?: string | null
  unitId?: string | null
  kind: InspectionKind
  status: InspectionStatus
  scheduledOn?: string | null
  completedAt?: string | null
  rooms: PcrInspectionRoom[]
  generalNotes: string
  staffSignature?: PcrSoftSignature | null
  tenantSignature?: PcrSoftSignature | null
  noShowOverride?: PcrNoShowOverride | null
  /**
   * Soft-gate flag for keys / move-in (incoming only).
   * Set when both soft-signed OR documented no-show + admin override.
   */
  ingoingPcrSigned: boolean
  createdAt: string
  updatedAt: string
}

export type PcrPartnerCode = 'propertyinspect' | 'redrabbit' | 'manual'

export type PcrPartnerUpsertResult =
  | { ok: true; mode: 'manual'; status: 'exported_manual' }
  | { ok: false; mode: 'partner'; status: 'error'; error: string }

export type IPcrPartnerAdapter = {
  readonly id: string
  readonly live: boolean
  readonly configured: boolean
  readonly partnerCode: PcrPartnerCode
  pushInspection(inspection: PropertyConditionInspection): Promise<PcrPartnerUpsertResult>
}

export class PcrNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PcrNotConfiguredError'
  }
}

export type PcrPdfInput = {
  inspection: PropertyConditionInspection
  agencyName: string
  propertyTitle: string
  propertyAddress: string
  tenantName: string
  brandName?: string
  generatedAt?: string
}

export type PcrPdfResult = {
  bytes: Uint8Array
  dataUrl: string
  fileName: string
  honesty: string
}

export type MaintenanceHandoffDraft = {
  category_key: string
  priority: 'MEDIUM' | 'HIGH'
  title: string
  description: string
  roomName: string
  itemLabel: string
  inspectionId: string
  itemId: string
}
