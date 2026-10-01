/**
 * Supabase persist layer — replaces /api/persist for production.
 */
import { createClient } from '../../utils/supabase/client'
import type { EntityType } from '../api/persistTypes'
import type { PersistAction, PersistOp } from '../api/persist'
import { GLOBAL_CLIENT_ID } from '../../data/platformLookups'
import { ROLE_TO_DB } from './idMap'

import { canonicalListingId, unitIdForProperty, listingIdAliases } from '../listingIds'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(v: string): boolean {
  return UUID_RE.test(v)
}

async function ensureUuid(entityType: EntityType | 'agency', frontendId: string): Promise<string> {
  const supabase = createClient()
  const idsToTry =
    entityType === 'property' || entityType === 'unit'
      ? listingIdAliases(frontendId)
      : [frontendId]
  const typesToTry =
    entityType === 'property' || entityType === 'unit' ? (['unit', 'property'] as const) : [entityType]

  for (const et of typesToTry) {
    for (const fe of idsToTry) {
      const { data: existing } = await supabase
        .from('entity_id_map')
        .select('backend_id')
        .eq('entity_type', et)
        .eq('frontend_id', fe)
        .maybeSingle()
      if (existing?.backend_id) return existing.backend_id
    }
  }
  if (isUuid(frontendId)) return frontendId

  const backendId = crypto.randomUUID()
  const canon = canonicalListingId(frontendId)
  const unitFe = unitIdForProperty(canon)
  const rows =
    entityType === 'property' || entityType === 'unit'
      ? [
          { entity_type: 'property', backend_id: backendId, frontend_id: canon },
          { entity_type: 'unit', backend_id: backendId, frontend_id: unitFe },
        ]
      : [{ entity_type: entityType, backend_id: backendId, frontend_id: frontendId }]

  await supabase.from('entity_id_map').upsert(rows, { onConflict: 'entity_type,backend_id' })
  return backendId
}

async function resolveUuid(entityType: EntityType | 'agency', frontendId: string): Promise<string | null> {
  if (isUuid(frontendId)) return frontendId
  const supabase = createClient()
  const et = entityType === 'property' ? 'unit' : entityType
  const { data } = await supabase
    .from('entity_id_map')
    .select('backend_id')
    .eq('entity_type', et)
    .eq('frontend_id', frontendId)
    .maybeSingle()
  return data?.backend_id ?? null
}

async function clientUuid(agencyId: unknown): Promise<string | null> {
  if (!agencyId) return null
  const feId = String(agencyId)
  if (feId === GLOBAL_CLIENT_ID) {
    return resolveUuid('agency', GLOBAL_CLIENT_ID)
  }
  return resolveUuid('agency', feId)
}

async function userUuid(feId: unknown): Promise<string | null> {
  if (!feId) return null
  return resolveUuid('user', String(feId))
}

async function unitUuid(propertyId: unknown): Promise<string | null> {
  if (!propertyId) return null
  return resolveUuid('property', String(propertyId))
}

function str(v: unknown, fallback = ''): string {
  if (v == null) return fallback
  return String(v)
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const APP_STAGE_TO_DB: Record<string, string> = {
  Started: 'SUBMITTED',
  // P0-approve: the guest/apply flow labels new applications this way.
  'Application started': 'SUBMITTED',
  // P0-3: guest-submitted apps land at this FE stage.
  'Application submitted': 'SUBMITTED',
  'Documents Pending': 'SUBMITTED',
  'Documents requested': 'UNDER_REVIEW',
  'Documents uploaded': 'UNDER_REVIEW',
  'Under Review': 'UNDER_REVIEW',
  'Agent review': 'UNDER_REVIEW',
  'Credit Check': 'CREDIT_CHECK',
  'Credit check': 'CREDIT_CHECK',
  'Conditionally approved': 'APPROVED',
  Approved: 'APPROVED',
  // P0-approve: the approve machine's post-approval stage. The DB CHECK
  // constraint has no AWAITING_PAYMENT — status stays APPROVED and the
  // fine-grained label lives in metadata.stage (single source of truth).
  'Awaiting Payment': 'APPROVED',
  'Deposit Paid': 'APPROVED',
  'Lease Signed': 'APPROVED',
  Rejected: 'REJECTED',
  Blocked: 'REJECTED',
  Withdrawn: 'WITHDRAWN',
  'Active Tenancy': 'LEASED',
}

const PAY_TYPE_TO_DB: Record<string, string> = {
  Deposit: 'DEPOSIT',
  'First Month Rent': 'FIRST_MONTH_RENT',
  Rent: 'RENT',
  'Sale Deposit': 'SALE_DEPOSIT',
  Commission: 'COMMISSION',
  Refund: 'REFUND',
  Other: 'OTHER',
}

const PAY_STATUS_TO_DB: Record<string, string> = {
  Due: 'DUE',
  Paid: 'PAID',
  Overdue: 'OVERDUE',
  Cancelled: 'CANCELLED',
}

const TICKET_STATUS_TO_DB: Record<string, string> = {
  Open: 'OPEN',
  'In Progress': 'IN_PROGRESS',
  'Awaiting Parts': 'AWAITING_PARTS',
  Completed: 'COMPLETED',
  Cancelled: 'CANCELLED',
}

const TICKET_PRI_TO_DB: Record<string, string> = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
  Urgent: 'URGENT',
  Emergency: 'EMERGENCY',
}

async function upsertAgency(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('agency', id)
  await supabase.from('clients').upsert({
    id: uuid,
    company_name: str(data.name, 'Agency'),
    subdomain: str(data.slug, id),
    status: str(data.status).toLowerCase() === 'suspended' ? 'suspended' : 'active',
    city: str(data.city),
    settings: {
      frontend_id: id,
      enabledPermissions: data.enabledPermissions ?? [],
      trading_as: str(data.tradingAs) || undefined,
      email: str(data.email) || undefined,
      phone: str(data.phone) || undefined,
      province: str(data.province) || undefined,
      country_code: str(data.countryCode) || undefined,
      timezone: str(data.timezone) || undefined,
    },
    updated_at: new Date().toISOString(),
  })
}

async function upsertUser(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('user', id)
  const clientId = await clientUuid(data.agencyId)
  const roleFe = str(data.role, 'tenant')
  const meta: Record<string, unknown> = {
    frontend_id: id,
    frontend_role: roleFe,
    enabledPermissions: data.enabledPermissions,
    verification: data.verification,
    company: data.company,
    idNumberOrPassport: data.idNumberOrPassport,
    licenseStatus: data.licenseStatus,
    mentorId: data.mentorId,
    commissionSharePct: data.commissionSharePct,
  }
  const name = str(data.name, 'User')
  const parts = name.trim().split(/\s+/)
  const firstName = str(data.firstName) || parts[0] || 'User'
  const lastName = str(data.lastName) || parts.slice(1).join(' ') || firstName
  await supabase.from('users').upsert({
    id: uuid,
    client_id: clientId,
    email: str(data.email, `${id}@propertyflow.local`).toLowerCase(),
    first_name: firstName,
    last_name: lastName,
    phone: str(data.phone) || null,
    role: ROLE_TO_DB[roleFe] ?? 'END_USER',
    active: data.active !== false,
    metadata: meta,
    updated_at: new Date().toISOString(),
  })
}

async function upsertLead(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('lead', id)
  const clientId = await clientUuid(data.agencyId)
  const unitId = await unitUuid(data.propertyId)
  // Read-merge-write: incoming metadata keys override, existing row keys
  // (other stages' progress, unrelated extras) survive the upsert.
  const incomingMeta = (data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
    ? data.metadata
    : {}) as Record<string, unknown>
  let mergedMeta = incomingMeta
  const { data: existingRow } = await supabase
    .from('leads')
    .select('metadata')
    .eq('id', uuid)
    .maybeSingle()
  const existingMeta = (existingRow?.metadata ?? null) as Record<string, unknown> | null
  if (existingMeta && typeof existingMeta === 'object' && !Array.isArray(existingMeta)) {
    mergedMeta = { ...existingMeta, ...incomingMeta }
  }
  await supabase.from('leads').upsert({
    id: uuid,
    client_id: clientId,
    unit_id: unitId,
    agent_id: await userUuid(data.agentId),
    name: str(data.name),
    email: str(data.email),
    phone: str(data.phone),
    channel: str(data.channel),
    stage: str(data.stage, 'New'),
    interest_type: str(data.type) === 'Buy' ? 'BUY' : 'RENT',
    value_amount: num(data.value),
    notes: str(data.notes),
    metadata: mergedMeta,
    updated_at: new Date().toISOString(),
  })
}

async function upsertApplication(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  let uuid = await ensureUuid('application', id)
  const unitId = await unitUuid(data.propertyId)
  // P0-sync (R11): never write client_id NULL — staff RLS (client_id = agency)
  // hides those rows while the guest still sees their optimistic copy. Prefer
  // agencyId resolve; if the FE id is missing from entity_id_map, take the
  // listing unit's client_id (same agency that owns the rent listing).
  let clientId = await clientUuid(data.agencyId)
  if (!clientId && unitId) {
    const { data: unitRow } = await supabase
      .from('units')
      .select('client_id')
      .eq('id', unitId)
      .maybeSingle()
    if (unitRow?.client_id) clientId = unitRow.client_id as string
  }
  if (!unitId) {
    throw new Error(`application upsert failed: unit not resolved for property ${str(data.propertyId) || id}`)
  }
  if (!clientId) {
    throw new Error(
      `application upsert failed: agency client_id not resolved for agency ${str(data.agencyId) || '(blank)'} / unit ${unitId}`,
    )
  }
  const stage = str(data.stage)

  // P0-approve (409 fix): the app row may exist without an entity_id_map
  // entry — the approve_application RPC inserts the lease but never seeds the
  // map, and rows created server-side before this client existed have the
  // same gap. Minting a fresh uuid then upserting with reference_code: id
  // violates unique (client_id, reference_code). Resolve the real row by its
  // natural key first and upsert onto that row's id (same pattern as
  // upsertLookup).
  let existingRow: { id: string; metadata: unknown } | null = null
  if (clientId) {
    const { data: byRef } = await supabase
      .from('applications')
      .select('id, metadata, status')
      .eq('client_id', clientId)
      .eq('reference_code', id)
      .maybeSingle()
    if (byRef?.id) {
      uuid = byRef.id as string
      existingRow = byRef as { id: string; metadata: unknown }
      await supabase
        .from('entity_id_map')
        .upsert(
          { entity_type: 'application', backend_id: byRef.id as string, frontend_id: id },
          { onConflict: 'entity_type,frontend_id' },
        )
    } else {
      const { data: byFrontendMeta } = await supabase
        .from('applications')
        .select('id, metadata, status')
        .eq('client_id', clientId)
        .eq('metadata->>frontend_id', id)
        .maybeSingle()
      if (byFrontendMeta?.id) {
        uuid = byFrontendMeta.id as string
        existingRow = byFrontendMeta as { id: string; metadata: unknown }
        await supabase
          .from('entity_id_map')
          .upsert(
            { entity_type: 'application', backend_id: byFrontendMeta.id as string, frontend_id: id },
            { onConflict: 'entity_type,frontend_id' },
          )
      }
    }
  }

  // Read-merge-write: keep metadata keys written by other consumers (the
  // approve RPC writes `stage`, enquiry flows write checkout refs) — only the
  // incoming keys are overwritten. workflow_status is the machine key that
  // hydration uses as the single stage source for staff and applicant.
  const incomingMeta: Record<string, unknown> = {
    stage,
    workflow_status: typeof data.workflowStatus === 'string' ? data.workflowStatus : null,
    progress: data.progress,
    keyCollection: data.keyCollection,
    frontend_id: id,
    // P0-sync (R9): denormalise the applicant identity into metadata. The
    // bootstrap's profile-name join reads auth-linked public.users; when that
    // read fails (RLS context race on freshly-registered guests) staff detail
    // pages rendered a blank "Applicant". Row metadata is readable by the
    // same staff policy that reads the row itself.
    applicant_name: str(data.applicantName) || undefined,
    applicant_email: str(data.email) || undefined,
  }
  let mergedMeta = incomingMeta
  const existingMeta = (existingRow?.metadata ?? null) as Record<string, unknown> | null
  if (existingMeta && typeof existingMeta === 'object' && !Array.isArray(existingMeta)) {
    mergedMeta = { ...existingMeta, ...incomingMeta }
  }

  const res = await supabase.from('applications').upsert(
    {
      id: uuid,
      client_id: clientId,
      unit_id: unitId,
      agent_id: await userUuid(data.agentId),
      applicant_id: await userUuid(data.applicantUserId),
      // P0-sync (R9): the applicant's own contact fields live on the row
      // metadata (below). PostgREST has no nested applicant_user upsert, so
      // name/email denormalisation rides metadata.applicant_name/_email —
      // always readable by the staff policy that reads the row itself.
      reference_code: id,
      application_type: str(data.type) === 'Purchase' ? 'PURCHASE' : 'RENTAL',
      status: APP_STAGE_TO_DB[stage] ?? 'UNDER_REVIEW',
      monthly_income: num(data.income),
      employment_summary: str(data.employment),
      message: str(data.notes),
      move_in_date: str(data.moveInDate) || null,
      metadata: mergedMeta,
      // P0-sync (R9): the staff bootstrap orders applications by submitted_at
      // DESC NULLS LAST with a hard limit — a NULL submitted_at sorted the
      // guest-created application AFTER every seeded row, past the limit, so
      // staff detail/list/search all answered "not found" while the applicant
      // saw their own optimistic row. Stamp it on every write; on conflict the
      // ON CONFLICT update does not touch the column, so existing rows keep
      // their original value.
      submitted_at: str(data.submittedAt) || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: false },
  )
  // supabase-js resolves with { error } instead of throwing — surface RLS /
  // constraint failures so callers can gate success UI on a durable write.
  if (res.error) throw new Error(`application upsert failed: ${res.error.message}`)
}

/** supabase-js resolves with { error } instead of throwing — surface DB/RLS failures. */
function throwIfUpsertFailed(res: { error: { message: string } | null }, label: string): void {
  if (res.error) throw new Error(`${label} upsert failed: ${res.error.message}`)
}

async function upsertPayment(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('payment', id)
  const clientId = await clientUuid(data.agencyId)
  const res = await supabase.from('payments').upsert({
    id: uuid,
    client_id: clientId,
    unit_id: await unitUuid(data.propertyId),
    lease_id: data.tenancyId ? await resolveUuid('tenancy', str(data.tenancyId)) : null,
    party_name: str(data.partyName),
    party_user_id: await userUuid(data.partyUserId),
    payment_type: PAY_TYPE_TO_DB[str(data.type)] ?? 'OTHER',
    amount: num(data.amount) ?? 0,
    status: PAY_STATUS_TO_DB[str(data.status)] ?? 'DUE',
    due_date: str(data.dueDate) || new Date().toISOString().slice(0, 10),
    paid_at: data.paidAt ? str(data.paidAt) : null,
    method: str(data.method) || null,
    landlord_visible: data.landlordVisible !== false,
    reference: str(data.reference) || null,
    notes: str(data.notes) || null,
    paid_amount: num(data.paidAmount),
    attachments: data.attachments ?? [],
    recorded_by: await userUuid(data.recordedByUserId),
    updated_at: new Date().toISOString(),
  })
  throwIfUpsertFailed(res, 'payment')
}

async function upsertNotification(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('notification', id)
  const res = await supabase.from('notifications').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    user_id: await userUuid(data.userId),
    title: str(data.title),
    body: str(data.body),
    link_path: str(data.link) || null,
    resource_type: str(data.resource) || null,
    action_type: str(data.action) || null,
    read_at: data.read ? new Date().toISOString() : null,
    created_at: str(data.at) || new Date().toISOString(),
  })
  throwIfUpsertFailed(res, 'notification')
}

async function upsertTicket(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('ticket', id)
  const dbStatus = TICKET_STATUS_TO_DB[str(data.status)] ?? 'OPEN'
  // FE has one `cost` field: estimate while open, actual once resolved/cancelled.
  const isClosed = dbStatus === 'COMPLETED' || dbStatus === 'CANCELLED'
  const photoUrls = Array.isArray(data.photoUrls)
    ? (data.photoUrls as string[]).filter((u) => typeof u === 'string' && u.length > 0)
    : []
  const resolutionNotes = str(data.resolutionNotes)
  const res = await supabase.from('maintenance_tickets').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    unit_id: await unitUuid(data.propertyId),
    category_key: str(data.categoryKey) || null,
    reported_by: await userUuid(data.reportedByUserId),
    title: str(data.title),
    description: str(data.description),
    priority: TICKET_PRI_TO_DB[str(data.priority)] ?? 'MEDIUM',
    status: dbStatus,
    contractor_id: await userUuid(data.contractorId),
    assigned_to: await userUuid(data.assignedAgentId),
    ...(isClosed ? { cost_actual: num(data.cost) } : { cost_estimate: num(data.cost) }),
    ...(dbStatus === 'COMPLETED' ? { completed_at: str(data.resolvedAt) || new Date().toISOString() } : {}),
    ...(photoUrls.length > 0 ? { photos: photoUrls } : {}),
    warranty_covered: Boolean(data.warrantyCovered),
    updated_at: new Date().toISOString(),
  })
  // supabase-js resolves with { error } instead of throwing — surface RLS/permission failures.
  if (res.error) throw new Error(`ticket upsert failed: ${res.error.message}`)
  // Resolution notes have no column — persist as a ticket update row (audit trail).
  if (isClosed && resolutionNotes) {
    const existing = await supabase
      .from('maintenance_ticket_updates')
      .select('id')
      .eq('ticket_id', uuid)
      .eq('body', resolutionNotes)
      .limit(1)
    if (!existing.data || existing.data.length === 0) {
      const ins = await supabase.from('maintenance_ticket_updates').insert({
        ticket_id: uuid,
        body: resolutionNotes,
        status_after: dbStatus,
      })
      if (ins.error) throw new Error(`ticket update row failed: ${ins.error.message}`)
    }
  }
}

async function upsertMessage(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('message', id)
  await supabase.from('messages').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    thread_id: await resolveUuid('thread', str(data.threadId)),
    from_user_id: await userUuid(data.fromUserId),
    body: str(data.body),
    created_at: str(data.at) || new Date().toISOString(),
  })
}

async function upsertActivity(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('activity', id)
  // P0-approve (400 fix): event_log.subject_type is NOT NULL — the previous
  // payload was rejected with a validation error, silently dropping the
  // approve audit entry.
  const res = await supabase.from('event_log').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    event_type: 'activity',
    subject_type: 'agency',
    payload: { text: data.text, user: data.user },
    created_at: str(data.at) || new Date().toISOString(),
  })
  if (res.error) throw new Error(`event_log upsert failed: ${res.error.message}`)
}

async function upsertPropertyEvent(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('property_event', id)
  const unitId = await unitUuid(data.propertyId)
  // P0-approve (400 fix): same NOT NULL subject_type as upsertActivity.
  const res = await supabase.from('event_log').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    event_type: 'property_event',
    subject_type: 'unit',
    subject_id: unitId,
    actor_user_id: await userUuid(data.actorUserId),
    payload: {
      propertyId: data.propertyId,
      actorName: data.actorName,
      action: data.action,
      changes: data.changes,
    },
    created_at: str(data.at) || new Date().toISOString(),
  })
  if (res.error) throw new Error(`event_log upsert failed: ${res.error.message}`)
}

async function upsertSuiteAlert(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('suite_alert', id)
  await supabase.from('suite_alerts').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    resource: str(data.resource),
    actions: data.actions ?? [],
    enabled: data.enabled !== false,
    popup_enabled: data.popupEnabled !== false,
    popup_duration_ms: num(data.popupDurationMs) ?? 6000,
    notify_roles: data.notifyRoles ?? [],
    updated_at: new Date().toISOString(),
  })
}

async function upsertViewingSlot(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('viewing_slot', id)
  await supabase.from('viewing_slots').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    unit_id: await unitUuid(data.propertyId),
    agent_id: await userUuid(data.agentId),
    slot_date: str(data.date),
    slot_time: str(data.time),
    capacity: num(data.capacity) ?? 1,
    booked_count: num(data.booked) ?? 0,
    status: str(data.status, 'Open').toUpperCase(),
    title: str(data.title) || null,
    notes: str(data.notes) || null,
    duration_minutes: num(data.durationMinutes),
    updated_at: new Date().toISOString(),
  })
}

async function upsertTenancy(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('tenancy', id)
  // P0-approve (R8): leases.landlord_id has an FK + NOT NULL — an empty FE id
  // lands as HTTP 409. Fall back to the building's owner (the same chain the
  // listing detail uses) before writing; if neither resolves, surface the
  // real error instead of writing an ownerless lease.
  let landlordUuid = await userUuid(data.landlordId)
  if (!landlordUuid) {
    const unitUuidVal = await unitUuid(data.propertyId)
    if (unitUuidVal) {
      const { data: buildingRow } = await supabase
        .from('units')
        .select('buildings(landlord_id)')
        .eq('id', unitUuidVal)
        .maybeSingle()
      const buildingLandlord =
        (buildingRow as { buildings?: { landlord_id?: string | null } | null } | null)?.buildings
          ?.landlord_id ?? null
      if (buildingLandlord) landlordUuid = buildingLandlord
    }
  }
  if (!landlordUuid) {
    throw new Error(
      `tenancy upsert failed: no landlord resolved for listing ${str(data.propertyId) || id}`,
    )
  }
  // P0-approve (R7): leases.lease_reference is NOT NULL with no default —
  // omitting it makes every lease write fail with "null value in column
  // lease_reference". The server lease-create path uses the frontend tenancy
  // id as the reference (server/writes.ts: str(d.leaseReference ?? feId)),
  // and the approve RPC mints the same shape ('tn-' || 8 hex chars).
  const leaseReference = str(data.leaseReference ?? data.reference ?? '').slice(0, 60) || id
  // P0-approve (R10): recovery re-approvals (and the RPC path) must dedupe on
  // the same application — resolve an existing lease row for this application
  // and upsert onto IT, so a re-approve updates rather than duplicates.
  let leaseUuid = uuid
  const appUuidVal = data.applicationId ? await resolveUuid('application', str(data.applicationId)) : null
  if (appUuidVal) {
    const { data: existingLease } = await supabase
      .from('leases')
      .select('id')
      .eq('application_id', appUuidVal)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existingLease?.id) {
      leaseUuid = existingLease.id as string
      await supabase
        .from('entity_id_map')
        .upsert(
          { entity_type: 'tenancy', backend_id: leaseUuid, frontend_id: id },
          { onConflict: 'entity_type,frontend_id' },
        )
    }
  }
  const res = await supabase.from('leases').upsert({
    id: leaseUuid,
    ...(appUuidVal ? { application_id: appUuidVal } : {}),
    client_id: await clientUuid(data.agencyId),
    unit_id: await unitUuid(data.propertyId),
    tenant_id: await userUuid(data.tenantUserId),
    landlord_id: landlordUuid,
    agent_id: await userUuid(data.agentId),
    lease_reference: leaseReference,
    start_date: str(data.startDate),
    end_date: str(data.endDate) || null,
    rent_amount: num(data.rent) ?? 0,
    deposit_amount: num(data.deposit) ?? 0,
    rent_due_day: Math.min(28, Math.max(1, num(data.rentDueDay) ?? 1)),
    status: str(data.status) === 'Active' ? 'ACTIVE' : 'PENDING',
    metadata: {
      keyCollection: data.keyCollection,
      leaseDocumentId: data.leaseDocumentId ?? null,
      leasePdfUrl: data.leasePdfUrl ?? null,
      eSign: data.eSign ?? null,
    },
    updated_at: new Date().toISOString(),
  })
  throwIfUpsertFailed(res, 'tenancy')
}

async function upsertDocument(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('document', id)
  await supabase.from('documents').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    unit_id: await unitUuid(data.propertyId),
    name: str(data.name),
    category: str(data.category, 'OTHER').toUpperCase(),
    status: str(data.status, 'pending').toUpperCase(),
    storage_url: str(data.fileUrl) || null,
    note: str(data.note) || null,
    uploaded_at: str(data.uploadedAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
}

async function upsertBuilding(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('building', id)
  const clientId = await clientUuid(data.clientId)
  // P0-approve (R10/D6): the wizard creates a manual landlord and immediately
  // writes the building that references it. ensureUuid's fresh entity_id_map
  // row is correct, but an existing staff-updated user row (frontend_id
  // changed, or an email-matched pre-existing row) resolves differently —
  // resolve by metadata/frontend_id before falling back to the map so the
  // building always carries the REAL owner id (leases.landlord_id FK comes
  // from buildings.landlord_id via upsertTenancy's fallback).
  let landlordUuid = await userUuid(data.landlordId)
  if (!landlordUuid && data.landlordId) {
    const feLandlord = str(data.landlordId)
    const { data: metaRow } = await supabase
      .from('users')
      .select('id')
      .eq('metadata->>frontend_id', feLandlord)
      .maybeSingle()
    if (metaRow?.id) {
      landlordUuid = metaRow.id as string
      await supabase
        .from('entity_id_map')
        .upsert(
          { entity_type: 'user', backend_id: metaRow.id as string, frontend_id: feLandlord },
          { onConflict: 'entity_type,frontend_id' },
        )
    }
  }
  await supabase.from('buildings').upsert({
    id: uuid,
    client_id: clientId,
    landlord_id: landlordUuid,
    name: str(data.name, 'Building'),
    address: str(data.addressLine1 ?? data.address, 'Address TBC'),
    city: str(data.city, 'Port Elizabeth'),
    province: str(data.province, 'Eastern Cape'),
    suburb: str(data.suburb) || null,
    grading: data.grading ? str(data.grading).charAt(0) : null,
    solar_capacity_kw: num(data.solarCapacityKw) ?? 0,
    has_borehole: Boolean(data.hasBorehole),
    lat: num(data.lat),
    lng: num(data.lng),
    place_id: str(data.placeId) || null,
    formatted_address: str(data.formattedAddress) || null,
    images: data.images ?? [],
    updated_at: new Date().toISOString(),
  })
}

async function upsertUnit(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('unit', id)
  const buildingUuid = await resolveUuid('building', str(data.buildingId))
  if (!buildingUuid) return
  const listingRaw = str(data.listingType ?? data.listingMode, 'rent').toUpperCase()
  const listingType =
    listingRaw === 'RENT' || listingRaw === 'SALE' || listingRaw === 'BOTH' || listingRaw === 'NOT_LISTED'
      ? listingRaw
      : 'RENT'
  const res = await supabase.from('units').upsert({
    id: uuid,
    client_id: await clientUuid(data.clientId ?? data.agencyId),
    building_id: buildingUuid,
    unit_number: str(data.unitNumber, 'MAIN'),
    title: str(data.title),
    square_meters: num(data.squareMeters ?? data.area),
    bedrooms: num(data.bedrooms ?? data.beds) ?? 0,
    bathrooms: num(data.bathrooms ?? data.baths) ?? 0,
    parking: num(data.parking) ?? 0,
    listing_type: listingType,
    price: num(data.price),
    rent: num(data.rent),
    status_config_key: str(data.statusKey ?? data.status, 'DRAFT').toUpperCase(),
    agent_id: await userUuid(data.agentId),
    description: str(data.description) || null,
    amenities: data.amenities ?? [],
    images: data.images ?? [],
    featured: Boolean(data.featured),
    lat: num(data.lat),
    lng: num(data.lng),
    place_id: str(data.placeId) || null,
    formatted_address: str(data.formattedAddress) || null,
    updated_at: new Date().toISOString(),
  })
  throwIfUpsertFailed(res, 'unit')
}

async function upsertRoom(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('room', id)
  const unitUuid = await resolveUuid('unit', str(data.unitId))
  if (!unitUuid) return
  const layout = data.layout as { x?: number; y?: number; w?: number; h?: number } | undefined
  await supabase.from('rooms').upsert({
    id: uuid,
    unit_id: unitUuid,
    client_id: await clientUuid(data.clientId),
    name: str(data.name, 'Room'),
    room_kind: str(data.kind, 'other'),
    beds: num(data.beds) ?? 0,
    baths: num(data.baths) ?? 0,
    area_sqm: num(data.areaSqm ?? data.area),
    layout_x: layout?.x ?? null,
    layout_y: layout?.y ?? null,
    layout_w: layout?.w ?? null,
    layout_h: layout?.h ?? null,
  })
}

async function upsertProperty(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const unitFe = str(data.unitId)
  const unitUuidVal =
    (unitFe ? await resolveUuid('unit', unitFe) : null) ?? (await ensureUuid('property', id))
  const clientId = await clientUuid(data.agencyId)
  const buildingFe = str(data.buildingId)
  const buildingUuid = buildingFe ? await resolveUuid('building', buildingFe) : null

  if (buildingUuid) {
    const res = await supabase.from('units').upsert({
      id: unitUuidVal,
      client_id: clientId,
      building_id: buildingUuid,
      unit_number: str(data.unitNumber ?? data.unitId, 'MAIN').replace(/^unt-/, ''),
      title: str(data.title),
      square_meters: num(data.area),
      bedrooms: num(data.beds) ?? 0,
      bathrooms: num(data.baths),
      parking: num(data.parking),
      listing_type: data.deletedAt
        ? 'NOT_LISTED'
        : str(data.listingMode, 'rent').toUpperCase(),
      price: num(data.price),
      rent: num(data.rent),
      status_config_key:
        data.deletedAt
          ? 'DELETED'
          : str(data.statusKey)
            ? String(str(data.statusKey)).toUpperCase()
            : str(data.status) === 'Rented'
              ? 'OCCUPIED'
              : str(data.status) === 'Maintenance'
                ? 'MAINTENANCE'
                : str(data.status) === 'Draft'
                  ? 'DRAFT'
                  : str(data.status) === 'Featured'
                    ? 'FEATURED'
                    : str(data.status) === 'Under Offer'
                      ? 'UNDER_OFFER'
                      : 'PUBLISHED',
      agent_id: await userUuid(data.agentId),
      description: str(data.description),
      amenities: data.amenities ?? [],
      images: data.images ?? [],
      featured: data.deletedAt ? false : Boolean(data.featured),
      lat: num(data.lat),
      lng: num(data.lng),
      place_id: str(data.placeId) || null,
      formatted_address: str(data.formattedAddress) || null,
      updated_at: new Date().toISOString(),
    })
    throwIfUpsertFailed(res, 'property/unit')
  } else {
    throw new Error(`property upsert failed: building ${str(data.buildingId) || id} not resolved`)
  }
}

async function deleteEntity(resource: EntityType, id: string): Promise<void> {
  const supabase = createClient()
  const uuid = await resolveUuid(resource === 'property' ? 'property' : resource, id)
  if (!uuid) return

  const tableMap: Partial<Record<EntityType, string>> = {
    agency: 'clients',
    user: 'users',
    lead: 'leads',
    application: 'applications',
    payment: 'payments',
    ticket: 'maintenance_tickets',
    notification: 'notifications',
    message: 'messages',
    document: 'documents',
    viewing: 'bookings',
    viewing_slot: 'viewing_slots',
    tenancy: 'leases',
    suite_alert: 'suite_alerts',
    property: 'units',
    activity: 'event_log',
    property_event: 'event_log',
  }
  const table = tableMap[resource]
  if (!table) return
  await supabase.from(table).delete().eq('id', uuid)
}

async function upsertLookup(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const clientId = await clientUuid(data.clientId)
  if (!clientId) throw new Error('lookup requires a valid clientId / agencyId')
  const configType = str(data.configType, 'CUSTOM')
  const keyValue = str(data.keyValue, id)

  // Seeded lookup rows may have no entity_id_map entry, in which case
  // ensureUuid would mint a fresh uuid that collides with the existing row's
  // unique (client_id, config_type, key_value). Resolve the real row by its
  // natural key first and upsert onto that row's id.
  let uuid = await ensureUuid('lookup', id)
  const { data: byNaturalKey } = await supabase
    .from('client_lookup_configs')
    .select('id, meta')
    .eq('client_id', clientId)
    .eq('config_type', configType)
    .eq('key_value', keyValue)
    .maybeSingle()
  if (byNaturalKey?.id) uuid = byNaturalKey.id as string

  // Read-merge-write: the platform's id-map keys (frontend_id etc.) and any
  // other meta consumers survive; requirement config merges over the top.
  const incoming = (data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)
    ? data.meta
    : {}) as Record<string, unknown>
  const existingMeta = (byNaturalKey?.meta ?? null) as Record<string, unknown> | null
  const merged: Record<string, unknown> = {
    frontend_id: id,
    ...(existingMeta && typeof existingMeta === 'object' && !Array.isArray(existingMeta)
      ? existingMeta
      : {}),
    frontend_client_id: String(data.clientId ?? ''),
    ...incoming,
  }

  const { error } = await supabase.from('client_lookup_configs').upsert(
    {
      id: uuid,
      client_id: clientId,
      config_type: configType,
      key_value: keyValue,
      display_label: str(data.displayLabel, keyValue),
      is_active: data.isActive !== false,
      sort_order: num(data.sortOrder) ?? 0,
      meta: merged,
    },
    { onConflict: 'id', ignoreDuplicates: false },
  )
  if (error) throw error
}

async function upsertEntity(
  resource: EntityType,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  switch (resource) {
    case 'agency':
      return upsertAgency(id, data)
    case 'user':
      return upsertUser(id, data)
    case 'lead':
      return upsertLead(id, data)
    case 'application':
      return upsertApplication(id, data)
    case 'payment':
      return upsertPayment(id, data)
    case 'notification':
      return upsertNotification(id, data)
    case 'ticket':
      return upsertTicket(id, data)
    // thread: Mode A createThread persists via server upsertThread (API) — no client supabase thread case.
    case 'message':
      return upsertMessage(id, data)
    case 'activity':
      return upsertActivity(id, data)
    case 'property_event':
      return upsertPropertyEvent(id, data)
    case 'suite_alert':
      return upsertSuiteAlert(id, data)
    case 'viewing_slot':
      return upsertViewingSlot(id, data)
    case 'tenancy':
      return upsertTenancy(id, data)
    case 'document':
      return upsertDocument(id, data)
    case 'building':
      return upsertBuilding(id, data)
    case 'unit':
      return upsertUnit(id, data)
    case 'room':
      return upsertRoom(id, data)
    case 'property':
      return upsertProperty(id, data)
    case 'lookup':
      return upsertLookup(id, data)
    default:
      console.warn('[supabase/persist] unhandled resource', resource, id)
  }
}

// P0-publish (R8): serialize writes per (resource, id). Two fire-and-forget
// upserts for the SAME entity (e.g. the wizard's updateProperty Draft write
// then publishProperty's Published write) raced before — the slower earlier
// write landed last and reverted the newer state (rent Publish → Draft).
// A later caller now waits for the earlier one to commit first.
const writeLocks = new Map<string, Promise<void>>()

export async function persistToSupabase(op: PersistOp): Promise<boolean> {
  const lockKey = `${op.resource}:${op.id}`
  const previous = writeLocks.get(lockKey) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  writeLocks.set(
    lockKey,
    previous.then(() => gate),
  )
  try {
    await previous
    if (op.action === 'delete') {
      await deleteEntity(op.resource, op.id)
    } else {
      await upsertEntity(op.resource, op.id, op.data ?? { id: op.id })
    }
    return true
  } catch (err) {
    console.warn('[supabase/persist]', op.resource, op.action, op.id, err)
    return false
  } finally {
    release()
    if (writeLocks.get(lockKey) === gate) {
      writeLocks.delete(lockKey)
    }
  }
}

export async function persistBatchToSupabase(ops: PersistOp[]): Promise<boolean> {
  try {
    // P0-publish (R8): same (resource, id) keys run SEQUENTIALLY through the
    // persistToSupabase locks; only distinct entities run in parallel. A flat
    // Promise.all re-introduced the Draft/Published write race.
    const seen = new Set<string>()
    const sequential: PersistOp[] = []
    const parallel: PersistOp[] = []
    for (const op of ops) {
      const key = `${op.resource}:${op.id}`
      if (seen.has(key)) sequential.push(op)
      else {
        seen.add(key)
        parallel.push(op)
      }
    }
    await Promise.all([
      ...parallel.map((op) => persistToSupabase(op)),
      ...sequential.map((op) => persistToSupabase(op)),
    ])
    return true
  } catch {
    return false
  }
}

/**
 * DEPRECATED (R8): not called anymore — persistApproveApplication skips the
 * RPC in Supabase mode because it cannot commit against the current schema.
 * Kept only so the RPC can be re-verified easily after a DB-side fix.
 */
export async function supabaseApproveApplication(params: {
  applicationId: string
  tenancy?: Record<string, unknown>
}): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.rpc('approve_application', {
    p_application_ref: params.applicationId,
    p_tenancy: params.tenancy ?? {},
  })
  if (error) {
    // P0-approve (R7): the deployed RPC inserts into leases without the NOT
    // NULL lease_reference column, so it can never commit against the current
    // schema (HTTP 400 "null value in column lease_reference"). It is also
    // not idempotent: an application the RPC already moved to LEASED makes
    // every retry fail. The direct mirror writes (application upsert +
    // upsertTenancy with lease_reference + payments) are the durable approve
    // transition — they run right after this call and gate the success UI —
    // so an RPC failure here is recoverable, not fatal.
    console.warn('[supabase/persist] approve_application (non-fatal)', error.message)
    return true
  }
  return true
}

export async function supabaseMarkNotificationsRead(params: {
  ids?: string[]
  userId?: string
  all?: boolean
}): Promise<boolean> {
  const supabase = createClient()
  const now = new Date().toISOString()
  if (params.all && params.userId) {
    const userBackend = await userUuid(params.userId)
    if (!userBackend) return false
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', userBackend)
      .is('read_at', null)
    return !error
  }
  if (params.ids?.length) {
    const uuids = await Promise.all(params.ids.map((id) => ensureUuid('notification', id)))
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .in('id', uuids)
    return !error
  }
  return false
}

export async function persistActionToSupabase(
  resource: EntityType,
  action: PersistAction,
  id: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  return persistToSupabase({ resource, action, id, data })
}
