/**
 * Postgres write handlers for AppStore domain mutations.
 * Accepts frontend demo IDs; resolves/registers UUIDs via entity_id_map.
 */
import { query, withTransaction, clientQuery } from './db.js'
import { isAcceptanceStatus, notifyAcceptedElsewhereServer } from './acceptedElsewhere.js'
import {
  ensureEntityMapTable,
  ensureUuid,
  forgetId,
  isUuid,
  resolveUuid,
  type EntityType,
} from './entityMap.js'
import { SUB_FE_TO_UUID } from './idMap.js'
import { resolveLiveListing } from './listingResolve.js'
import { supabaseAuthConfigured } from './supabase/env.js'
import {
  SUPPORT_BODY_MAX,
  SUPPORT_NOTE_MAX,
  SUPPORT_SUBJECT_MAX,
} from '../src/lib/supportTickets.js'

export type PersistAction = 'upsert' | 'delete' | 'patch'
export type PersistBody = {
  resource: EntityType
  action: PersistAction
  id: string
  data?: Record<string, unknown>
}

const ROLE_TO_DB: Record<string, string> = {
  super_admin: 'SUPER_ADMIN',
  client_admin: 'AGENCY_ADMIN',
  agency_admin: 'AGENCY_ADMIN',
  agent_admin: 'AGENT_ADMIN',
  agent: 'GROUND_AGENT',
  ground_agent: 'GROUND_AGENT',
  landlord: 'LANDLORD',
  tenant: 'END_USER',
  applicant: 'END_USER',
  contractor: 'CONTRACTOR',
}

/** Exported for focused Mode A stage→DB map tests (Sipho Deposit paid). */
export const APP_STAGE_TO_DB: Record<string, string> = {
  Started: 'DRAFT',
  'Documents Pending': 'SUBMITTED',
  'Documents Submitted': 'SUBMITTED',
  // Match browser persist — doc stages are under review, not draft/submit reset.
  'Documents requested': 'UNDER_REVIEW',
  'Documents uploaded': 'UNDER_REVIEW',
  'Viewing Booked': 'UNDER_REVIEW',
  'Under Review': 'UNDER_REVIEW',
  'Credit Check': 'CREDIT_CHECK',
  Approved: 'APPROVED',
  // Workflow label for conditionally_approved (landlord / staff decision);
  // without it the decision wrote status NULL / kept SUBMITTED.
  'Conditionally approved': 'APPROVED',
  'Awaiting Payment': 'APPROVED',
  'Deposit Paid': 'APPROVED',
  // Mode A canonical label (applicationWorkflow) — lowercase p
  'Deposit paid': 'APPROVED',
  'Lease Signed': 'LEASED',
  'Move-In Scheduled': 'LEASED',
  'Keys Handed Over': 'LEASED',
  'Active Tenancy': 'LEASED',
  Rejected: 'REJECTED',
  Withdrawn: 'WITHDRAWN',
  Blocked: 'REJECTED',
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
  Requested: 'OPEN',
  'In Progress': 'IN_PROGRESS',
  'Awaiting Parts': 'AWAITING_PARTS',
  Completed: 'COMPLETED',
  Resolved: 'RESOLVED',
  Cancelled: 'CANCELLED',
}

const TICKET_PRI_TO_DB: Record<string, string> = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
  Urgent: 'URGENT',
  Emergency: 'EMERGENCY',
}

const VIEW_STATUS_TO_DB: Record<string, string> = {
  Scheduled: 'SCHEDULED',
  Completed: 'COMPLETED',
  'No-show': 'NO_SHOW',
  Cancelled: 'CANCELLED',
}

const SLOT_STATUS_TO_DB: Record<string, string> = {
  Open: 'OPEN',
  Full: 'FULL',
  Cancelled: 'CANCELLED',
}

const DOC_CAT_TO_DB: Record<string, string> = {
  Title: 'TITLE',
  Compliance: 'COMPLIANCE',
  Lease: 'LEASE',
  Inspection: 'INSPECTION',
  Marketing: 'MARKETING',
  Other: 'OTHER',
}

const TENANCY_STATUS_TO_DB: Record<string, string> = {
  Active: 'ACTIVE',
  'Pending Move-In': 'PENDING',
  Notice: 'NOTICE',
  Ended: 'ENDED',
  Cancelled: 'CANCELLED',
}

const CONDITION_TO_DB: Record<string, string> = {
  Excellent: 'EXCELLENT',
  Good: 'GOOD',
  Fair: 'FAIR',
  Damaged: 'DAMAGED',
  'Needs Replacement': 'NEEDS_REPLACEMENT',
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

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v
  return fallback
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 1) return { first: parts[0] || 'User', last: '' }
  return { first: parts[0]!, last: parts.slice(1).join(' ') }
}

function listingType(mode: unknown): string {
  const m = String(mode ?? 'rent').toLowerCase()
  if (m === 'sale') return 'SALE'
  if (m === 'both') return 'BOTH'
  if (m === 'not_listed') return 'NOT_LISTED'
  return 'RENT'
}

function unitStatusFromProperty(status: unknown, deletedAt?: unknown): string {
  // P0-5: align with client persist + isPubliclyListed vocabulary.
  // Draft/Archived → DRAFT (OFF_MARKET kept as bootstrap alias only).
  // Published → PUBLISHED (AVAILABLE remains a legacy public alias on read).
  if (deletedAt) return 'DELETED'
  const s = String(status ?? '')
  if (s === 'Rented' || s === 'Occupied') return 'OCCUPIED'
  if (s === 'Maintenance') return 'MAINTENANCE'
  if (s === 'Featured') return 'FEATURED'
  if (s === 'Under Offer') return 'UNDER_OFFER'
  if (s === 'Draft' || s === 'Archived') return 'DRAFT'
  if (s === 'Published') return 'PUBLISHED'
  return 'PUBLISHED'
}

async function clientId(agencyId: unknown): Promise<string> {
  const id = await resolveUuid('agency', str(agencyId))
  if (!id) throw new Error(`Unknown agency: ${agencyId}`)
  return id
}

async function clientIdOptional(agencyId: unknown): Promise<string | null> {
  if (agencyId == null || agencyId === '') return null
  return clientId(agencyId)
}

async function resolveSubscriptionId(
  feSubId: unknown,
  clientUuid: string,
): Promise<string | null> {
  if (feSubId) {
    const fe = str(feSubId)
    if (SUB_FE_TO_UUID[fe]) return SUB_FE_TO_UUID[fe]!
    if (isUuid(fe)) return fe
  }
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM client_subscriptions WHERE client_id = $1::uuid LIMIT 1`,
    [clientUuid],
  )
  return rows[0]?.id ?? null
}

async function userId(fe: unknown): Promise<string | null> {
  if (!fe) return null
  return resolveUuid('user', str(fe))
}


/**
 * Mode A Sipho portal: resolve end-user uuid from FE id and/or email.
 * Prefer entity_id_map / users.id; fall back to LOWER(users.email).
 * When FE id + email both present and email hits, repair entity_id_map.
 */
async function resolveUserUuidByEmail(email: unknown): Promise<string | null> {
  const e = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!e || !e.includes('@')) return null
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
    [e],
  )
  return rows[0]?.id ?? null
}

async function linkUserFeToUuid(feStr: string, uuid: string): Promise<void> {
  await ensureEntityMapTable()
  await query(
    `DELETE FROM entity_id_map
     WHERE entity_type = 'user' AND backend_id = $1::uuid AND frontend_id <> $2`,
    [uuid, feStr],
  )
  await query(
    `INSERT INTO entity_id_map (entity_type, frontend_id, backend_id)
     VALUES ('user', $1, $2::uuid)
     ON CONFLICT (entity_type, frontend_id) DO UPDATE SET backend_id = EXCLUDED.backend_id`,
    [feStr, uuid],
  )
}

/** Resolve applicant/tenant uuid — FE user id first, else email → users. */
async function resolveApplicantOrTenantUuid(opts: {
  userFeId?: unknown
  email?: unknown
}): Promise<string | null> {
  const feRaw = opts.userFeId
  if (feRaw != null && feRaw !== '') {
    const feStr = str(feRaw)
    let uuid = await userId(feStr)
    if (uuid) {
      const live = await query<{ id: string }>(
        `SELECT id::text AS id FROM users WHERE id = $1::uuid LIMIT 1`,
        [uuid],
      )
      if (live[0]?.id) return uuid
    }
    if (isUuid(feStr)) {
      const live = await query<{ id: string }>(
        `SELECT id::text AS id FROM users WHERE id = $1::uuid LIMIT 1`,
        [feStr],
      )
      if (live[0]?.id) return feStr
    }
  }
  const fromEmail = await resolveUserUuidByEmail(opts.email)
  if (fromEmail && feRaw != null && feRaw !== '') {
    const feStr = str(feRaw)
    if (!isUuid(feStr)) await linkUserFeToUuid(feStr, fromEmail)
  }
  return fromEmail
}


/**
 * P0-5 residual / r17: agentId set but unmapped → fail create (no soft-null agent).
 * Map first, then verify users.id exists (orphan map UUID must not win). On miss/orphan,
 * fall through to users.metadata->>frontend_id and repair entity_id_map FE→live id
 * (respect unique entity_type+backend_id). Still fail-closed when neither resolves.
 */
async function requireAgentId(fe: unknown): Promise<string | null> {
  if (fe == null || fe === '') return null
  const feStr = str(fe)
  let uuid = await userId(feStr)
  if (uuid) {
    const live = await query<{ id: string }>(
      `SELECT id::text AS id FROM users WHERE id = $1::uuid LIMIT 1`,
      [uuid],
    )
    if (live[0]?.id) return uuid
    // Orphan map row (no users row) — fall through to metadata repair.
  }
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE metadata->>'frontend_id' = $1 LIMIT 1`,
    [feStr],
  )
  const hit = rows[0]?.id
  if (hit) {
    await ensureEntityMapTable()
    // Free unique (entity_type, backend_id) if another FE already owns the live UUID.
    await query(
      `DELETE FROM entity_id_map
       WHERE entity_type = 'user' AND backend_id = $1::uuid AND frontend_id <> $2`,
      [hit, feStr],
    )
    await query(
      `INSERT INTO entity_id_map (entity_type, frontend_id, backend_id)
       VALUES ('user', $1, $2::uuid)
       ON CONFLICT (entity_type, frontend_id) DO UPDATE SET backend_id = EXCLUDED.backend_id`,
      [feStr, hit],
    )
    return hit
  }
  throw Object.assign(new Error(`agent not resolved: ${feStr}`), { status: 400 })
}

async function unitIdFromProperty(propertyId: unknown): Promise<string | null> {
  if (!propertyId) return null
  return (
    (await resolveUuid('property', str(propertyId))) ??
    (await resolveUuid('unit', str(propertyId)))
  )
}

export async function handlePersist(body: PersistBody): Promise<{ ok: true; id: string; uuid: string }> {
  await ensureEntityMapTable()
  const { resource, action, id, data = {} } = body
  if (!resource || !action || !id) {
    throw Object.assign(new Error('resource, action, and id are required'), { status: 400 })
  }

  if (action === 'delete') {
    await deleteEntity(resource, id)
    return { ok: true, id, uuid: (await resolveUuid(resource, id)) ?? id }
  }

  const uuid = await upsertEntity(resource, id, data)
  return { ok: true, id, uuid }
}

async function deleteEntity(resource: EntityType, frontendId: string): Promise<void> {
  const uuid = await resolveUuid(resource, frontendId)
  if (!uuid) {
    await forgetId(resource, frontendId)
    return
  }

  const tableByType: Partial<Record<EntityType, string>> = {
    agency: 'clients',
    user: 'users',
    building: 'buildings',
    unit: 'units',
    property: 'units',
    room: 'rooms',
    asset: 'internal_assets',
    lead: 'leads',
    application: 'applications',
    tenancy: 'leases',
    viewing: 'bookings',
    viewing_slot: 'viewing_slots',
    payment: 'payments',
    ticket: 'maintenance_tickets',
    document: 'documents',
    notification: 'notifications',
    thread: 'message_threads',
    message: 'messages',
    lookup: 'client_lookup_configs',
    suite_alert: 'suite_alerts',
    activity: 'event_log',
    property_event: 'event_log',
    invoice: 'invoices',
    trust_transaction: 'trust_transactions',
    trust_allocation: 'trust_allocations',
    csv_import_batch: 'csv_import_batches',
    payout_instruction: 'payout_instructions',
    deposit_holding: 'deposit_holdings',
    support_ticket: 'event_log',
  }
  const table = tableByType[resource]
  if (!table) {
    // Resource type not supported for deletion - silently skip to maintain idempotency
    await forgetId(resource, frontendId)
    return
  }
  
  // Validate table name is in whitelist (defense in depth - should never fail)
  const allowedTables = new Set(Object.values(tableByType).filter(Boolean))
  if (!allowedTables.has(table)) {
    throw new Error(`Invalid table name in deletion: ${table}. Possible security violation.`)
  }
  
  // Use quoted identifier to prevent SQL injection (even though table name is from whitelist)
  await query(`DELETE FROM "${table}" WHERE id = $1::uuid`, [uuid])
  await forgetId(resource, frontendId)
  if (resource === 'property') await forgetId('unit', `unt-${frontendId}`)
}

async function upsertEntity(
  resource: EntityType,
  frontendId: string,
  data: Record<string, unknown>,
): Promise<string> {
  switch (resource) {
    case 'agency':
      return upsertAgency(frontendId, data)
    case 'user':
      return upsertUser(frontendId, data)
    case 'building':
      return upsertBuilding(frontendId, data)
    case 'property':
    case 'unit':
      return upsertProperty(frontendId, data)
    case 'room':
      return upsertRoom(frontendId, data)
    case 'asset':
      return upsertAsset(frontendId, data)
    case 'lead':
      return upsertLead(frontendId, data)
    case 'application':
      return upsertApplication(frontendId, data)
    case 'tenancy':
      return upsertTenancy(frontendId, data)
    case 'viewing':
      return upsertViewing(frontendId, data)
    case 'viewing_slot':
      return upsertViewingSlot(frontendId, data)
    case 'payment':
      return upsertPayment(frontendId, data)
    case 'ticket':
      return upsertTicket(frontendId, data)
    case 'document':
      return upsertDocument(frontendId, data)
    case 'notification':
      return upsertNotification(frontendId, data)
    case 'thread':
      return upsertThread(frontendId, data)
    case 'message':
      return upsertMessage(frontendId, data)
    case 'lookup':
      return upsertLookup(frontendId, data)
    case 'suite_alert':
      return upsertSuiteAlert(frontendId, data)
    case 'activity':
      return upsertActivity(frontendId, data)
    case 'property_event':
      return upsertPropertyEvent(frontendId, data)
    case 'invoice':
      return upsertInvoice(frontendId, data)
    case 'trust_transaction':
      return upsertTrustTransaction(frontendId, data)
    case 'trust_allocation':
      return upsertTrustAllocation(frontendId, data)
    case 'csv_import_batch':
      return upsertCsvImportBatch(frontendId, data)
    case 'payout_instruction':
      return upsertPayoutInstruction(frontendId, data)
    case 'deposit_holding':
      return upsertDepositHolding(frontendId, data)
    case 'support_ticket':
      return upsertSupportTicket(frontendId, data)
    default:
      throw Object.assign(new Error(`Unsupported resource: ${resource}`), { status: 400 })
  }
}

async function upsertAgency(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('agency', feId)
  const status = str(d.status, 'Active') === 'Suspended' ? 'suspended' : 'active'
  await query(
    `INSERT INTO clients (id, company_name, subdomain, status, city, settings, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       subdomain = EXCLUDED.subdomain,
       status = EXCLUDED.status,
       city = EXCLUDED.city,
       settings = clients.settings || EXCLUDED.settings,
       updated_at = NOW()`,
    [
      uuid,
      str(d.name, 'Agency'),
      str(d.slug, feId),
      status,
      str(d.city),
      JSON.stringify({
        frontend_id: feId,
        enabledPermissions: d.enabledPermissions ?? [],
      }),
    ],
  )
  return uuid
}

async function upsertUser(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('user', feId)
  const { first, last } = splitName(str(d.name, 'User'))
  const feRole = str(d.role, 'tenant').trim().toLowerCase() || 'tenant'
  const role = ROLE_TO_DB[feRole] ?? 'END_USER'
  const client = d.agencyId ? await clientId(d.agencyId) : null
  const email = str(d.email, `${feId}@propertyflow.local`).trim().toLowerCase()
  // A redacted bootstrap user (no email / phone) written back must not wipe the
  // stored contact details: on update, keep the existing value when the field is
  // missing (absent, null or blank) from the payload.
  const hasEmail = typeof d.email === 'string' && d.email.trim() !== ''
  const hasPhone = typeof d.phone === 'string' && d.phone.trim() !== ''
  let passwordSql = `crypt('ChangeMe123!', gen_salt('bf'))`
  let passwordParam: string | null = null
  if (typeof d.passwordHash === 'string' && d.passwordHash) {
    passwordSql = `$10`
    passwordParam = d.passwordHash
  } else if (typeof d.tempPassword === 'string' && d.tempPassword) {
    const { hashPassword } = await import('./auth.js')
    passwordSql = `$10`
    passwordParam = await hashPassword(d.tempPassword)
  } else if (typeof d.password === 'string' && d.password) {
    const { hashPassword } = await import('./auth.js')
    passwordSql = `$10`
    passwordParam = await hashPassword(d.password)
  }
  // Fields absent from the payload keep their stored value on update (a
  // stripped / redacted write-back must not reset role, agency, active,
  // permissions or staff settings).
  const has = (k: string) => Object.prototype.hasOwnProperty.call(d, k) && d[k] !== undefined
  const hasRole = typeof d.role === 'string' && d.role.trim() !== ''
  const hasAgency = has('agencyId')
  const hasActive = typeof d.active === 'boolean'
  const hasName = typeof d.name === 'string' && d.name.trim() !== ''
  const hasTempPassword = typeof d.tempPassword === 'string' && d.tempPassword !== ''
  const meta: Record<string, unknown> = { frontend_id: feId }
  // Only a temp password sets the flag; a write without one keeps the stored
  // value (a profile edit must not clear a pending forced password change).
  if (hasTempPassword) meta.mustChangePassword = true
  if (hasRole) meta.frontend_role = feRole
  for (const k of ['enabledPermissions', 'licenseStatus', 'mentorId', 'commissionSharePct']) {
    if (has(k)) meta[k] = d[k] ?? null
  }
  if (d.verification && typeof d.verification === 'object') meta.verification = d.verification
  if (d.company) meta.company = d.company
  if (d.idNumberOrPassport) meta.idNumberOrPassport = d.idNumberOrPassport

  const params: unknown[] = [
    uuid,
    client,
    email,
    first,
    last || first,
    d.phone ? str(d.phone) : null,
    role,
    bool(d.active, true),
    JSON.stringify(meta),
  ]
  let passwordExpr = passwordSql
  if (passwordParam) {
    params.push(passwordParam)
    passwordExpr = `$${params.length}`
  }
  const flag = (b: boolean) => {
    params.push(b)
    return `$${params.length}::boolean`
  }
  const fEmail = flag(hasEmail)
  const fPhone = flag(hasPhone)
  const fRole = flag(hasRole)
  const fAgency = flag(hasAgency)
  const fActive = flag(hasActive)
  const fName = flag(hasName)
  // metadata: shallow merge, plus verification merged by key (never replaced
  // wholesale) so a partial verification write keeps the stored ID documents.
  const metadataSql = `(COALESCE(users.metadata, '{}'::jsonb) || EXCLUDED.metadata)
           || CASE
                WHEN jsonb_typeof(users.metadata->'verification') = 'object'
                 AND jsonb_typeof(EXCLUDED.metadata->'verification') = 'object'
                THEN jsonb_build_object(
                  'verification',
                  (users.metadata->'verification') || (EXCLUDED.metadata->'verification')
                )
                ELSE '{}'::jsonb
              END`
  await query(
    `INSERT INTO users (
       id, client_id, email, password_hash, first_name, last_name, phone, role, active, metadata, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, ${passwordExpr}, $4, $5, $6, $7, $8, $9::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       client_id = CASE WHEN ${fAgency} THEN EXCLUDED.client_id ELSE users.client_id END,
       email = CASE WHEN ${fEmail} THEN EXCLUDED.email ELSE users.email END,${
         passwordParam
           ? `
       password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),`
           : ''
       }
       first_name = CASE WHEN ${fName} THEN EXCLUDED.first_name ELSE users.first_name END,
       last_name = CASE WHEN ${fName} THEN EXCLUDED.last_name ELSE users.last_name END,
       phone = CASE WHEN ${fPhone} THEN EXCLUDED.phone ELSE users.phone END,
       role = CASE WHEN ${fRole} THEN EXCLUDED.role ELSE users.role END,
       active = CASE WHEN ${fActive} THEN EXCLUDED.active ELSE users.active END,
       metadata = ${metadataSql},
       updated_at = NOW()`,
    params,
  )

  // P0-sa-mint: when Supabase Auth is configured, public.users + password_hash
  // alone is not a sign-in. Create auth.users (+ identity), link auth_user_id
  // on THIS profileId, and verify a password grant before OK.
  // Residual (r13d): profile INSERT then link is non-atomic — on Auth failure
  // delete the orphan so FE error cannot leave a sign-in-dead public.users row.
  // API-mode Neon has no Supabase Auth and no auth_user_id column. The bcrypt
  // password_hash written above is what POST /api/auth/login already checks,
  // so skip the link unless GoTrue is actually configured.
  const plainPassword =
    typeof d.tempPassword === 'string' && d.tempPassword
      ? d.tempPassword
      : typeof d.password === 'string' && d.password
        ? d.password
        : null
  if (plainPassword && supabaseAuthConfigured()) {
    console.info('[upsertUser] path=server linkStaffAuthUser=run', {
      feId,
      profileId: uuid,
      email,
    })
    try {
      const { linkStaffAuthUser } = await import('./supabase/registerUser.js')
      await linkStaffAuthUser({
        email,
        password: plainPassword,
        firstName: first,
        lastName: last || first,
        phone: d.phone ? str(d.phone) : undefined,
        roleFe: feRole,
        profileId: uuid,
      })
      const linkedRows = await query<{ auth_user_id: string | null }>(
        `SELECT auth_user_id::text AS auth_user_id FROM public.users WHERE id = $1::uuid`,
        [uuid],
      )
      if (!linkedRows[0]?.auth_user_id) {
        throw Object.assign(
          new Error('Auth link did not set auth_user_id on mint profileId'),
          { status: 500 },
        )
      }
    } catch (err) {
      try {
        await query(
          `DELETE FROM public.users WHERE id = $1::uuid AND auth_user_id IS NULL`,
          [uuid],
        )
        await forgetId('user', feId)
        console.info('[upsertUser] Auth fail — rolled back orphan profile', {
          feId,
          profileId: uuid,
          email,
        })
      } catch (rollbackErr) {
        console.error('[upsertUser] orphan rollback failed', rollbackErr)
      }
      throw err
    }
  } else if (plainPassword) {
    console.info('[upsertUser] path=server linkStaffAuthUser=skipped', {
      feId,
      profileId: uuid,
      email,
      reason: 'supabase-auth-not-configured',
    })
  } else {
    console.info('[upsertUser] path=server linkStaffAuthUser=skipped', {
      feId,
      profileId: uuid,
      email,
    })
  }
  return uuid
}

async function upsertBuilding(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('building', feId)
  const client = await clientId(d.clientId ?? d.agencyId)
  const landlord = await userId(d.landlordId)
  await query(
    `INSERT INTO buildings (
       id, client_id, landlord_id, name, address, city, province, suburb, grading,
       solar_capacity_kw, has_borehole, lat, lng, place_id, formatted_address, geocoded_at,
       images, notes, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, $16::timestamptz,
       $17::jsonb, $18, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       landlord_id = EXCLUDED.landlord_id,
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       city = EXCLUDED.city,
       province = EXCLUDED.province,
       suburb = EXCLUDED.suburb,
       grading = EXCLUDED.grading,
       solar_capacity_kw = EXCLUDED.solar_capacity_kw,
       has_borehole = EXCLUDED.has_borehole,
       lat = COALESCE(EXCLUDED.lat, buildings.lat),
       lng = COALESCE(EXCLUDED.lng, buildings.lng),
       place_id = COALESCE(EXCLUDED.place_id, buildings.place_id),
       formatted_address = COALESCE(EXCLUDED.formatted_address, buildings.formatted_address),
       geocoded_at = COALESCE(EXCLUDED.geocoded_at, buildings.geocoded_at),
       images = EXCLUDED.images,
       notes = EXCLUDED.notes,
       updated_at = NOW()`,
    [
      uuid,
      client,
      landlord,
      str(d.name, 'Building'),
      str(d.addressLine1 ?? d.address, 'Address TBD'),
      str(d.city, 'City'),
      str(d.province, 'GP'),
      str(d.suburb) || null,
      d.grading ? str(d.grading).slice(0, 1).toUpperCase() : null,
      num(d.solarCapacityKw) ?? 0,
      bool(d.hasBorehole),
      num(d.lat),
      num(d.lng),
      d.placeId ? str(d.placeId) : null,
      d.formattedAddress ? str(d.formattedAddress) : null,
      d.geocodedAt ? str(d.geocodedAt) : null,
      JSON.stringify(Array.isArray(d.images) ? d.images : []),
      d.notes ? str(d.notes) : null,
    ],
  )
  return uuid
}

async function upsertProperty(feId: string, d: Record<string, unknown>): Promise<string> {
  // Flat PropertyAsset → units row (+ ensure building if provided)
  const propFe = feId.startsWith('unt-') ? feId.slice(4) : feId
  const uuid = await ensureUuid('property', propFe)
  await ensureUuid('unit', `unt-${propFe}`, uuid)

  let buildingUuid = d.buildingId ? await resolveUuid('building', str(d.buildingId)) : null
  const client = await clientId(d.agencyId ?? d.clientId)

  if (!buildingUuid) {
    // Create a lightweight building shell for orphan property creates
    buildingUuid = await ensureUuid('building', `bld-auto-${propFe}`)
    await query(
      `INSERT INTO buildings (id, client_id, name, address, city, province, suburb, lat, lng, place_id, formatted_address, geocoded_at, images, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         address = COALESCE(EXCLUDED.address, buildings.address),
         city = COALESCE(EXCLUDED.city, buildings.city),
         suburb = COALESCE(EXCLUDED.suburb, buildings.suburb),
         lat = COALESCE(EXCLUDED.lat, buildings.lat),
         lng = COALESCE(EXCLUDED.lng, buildings.lng),
         place_id = COALESCE(EXCLUDED.place_id, buildings.place_id),
         formatted_address = COALESCE(EXCLUDED.formatted_address, buildings.formatted_address),
         geocoded_at = COALESCE(EXCLUDED.geocoded_at, buildings.geocoded_at),
         updated_at = NOW()`,
      [
        buildingUuid,
        client,
        str(d.title, propFe),
        str(d.address, 'Address TBD'),
        str(d.city, 'City'),
        'GP',
        str(d.suburb) || null,
        num(d.lat),
        num(d.lng),
        d.placeId ? str(d.placeId) : null,
        d.formattedAddress ? str(d.formattedAddress) : null,
        d.geocodedAt ? str(d.geocodedAt) : null,
        JSON.stringify(Array.isArray(d.images) ? d.images : []),
      ],
    )
  } else if (d.lat != null || d.placeId || d.formattedAddress || d.address) {
    // Geocode / address fields often live on the building
    await query(
      `UPDATE buildings SET
         address = COALESCE(NULLIF($2, ''), address),
         city = COALESCE(NULLIF($3, ''), city),
         suburb = COALESCE(NULLIF($4, ''), suburb),
         lat = COALESCE($5, lat),
         lng = COALESCE($6, lng),
         place_id = COALESCE($7, place_id),
         formatted_address = COALESCE($8, formatted_address),
         geocoded_at = COALESCE($9::timestamptz, geocoded_at),
         updated_at = NOW()
       WHERE id = $1::uuid`,
      [
        buildingUuid,
        str(d.address),
        str(d.city),
        str(d.suburb),
        num(d.lat),
        num(d.lng),
        d.placeId ? str(d.placeId) : null,
        d.formattedAddress ? str(d.formattedAddress) : null,
        d.geocodedAt ? str(d.geocodedAt) : null,
      ],
    )
  }

  const agent = await requireAgentId(d.agentId)
  const unitNumber = str(d.unitNumber ?? d.title, propFe).slice(0, 40)

  await query(
    `INSERT INTO units (
       id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
       listing_type, price, rent, status_config_key, agent_id, title, description, amenities,
       images, featured, lat, lng, place_id, formatted_address, geocoded_at, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13::uuid, $14, $15, $16::jsonb,
       $17::jsonb, $18, $19, $20, $21, $22, $23::timestamptz, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       building_id = EXCLUDED.building_id,
       client_id = EXCLUDED.client_id,
       unit_number = EXCLUDED.unit_number,
       square_meters = EXCLUDED.square_meters,
       bedrooms = EXCLUDED.bedrooms,
       bathrooms = EXCLUDED.bathrooms,
       parking = EXCLUDED.parking,
       listing_type = EXCLUDED.listing_type,
       price = EXCLUDED.price,
       rent = EXCLUDED.rent,
       status_config_key = EXCLUDED.status_config_key,
       agent_id = EXCLUDED.agent_id,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       amenities = EXCLUDED.amenities,
       images = EXCLUDED.images,
       featured = EXCLUDED.featured,
       lat = COALESCE(EXCLUDED.lat, units.lat),
       lng = COALESCE(EXCLUDED.lng, units.lng),
       place_id = COALESCE(EXCLUDED.place_id, units.place_id),
       formatted_address = COALESCE(EXCLUDED.formatted_address, units.formatted_address),
       geocoded_at = COALESCE(EXCLUDED.geocoded_at, units.geocoded_at),
       updated_at = NOW()`,
    [
      uuid,
      buildingUuid,
      client,
      unitNumber,
      num(d.area) ?? num(d.squareMeters),
      num(d.beds) ?? num(d.bedrooms) ?? 0,
      num(d.baths) ?? num(d.bathrooms) ?? 0,
      num(d.parking) ?? 0,
      listingType(d.deletedAt ? 'not_listed' : (d.listingMode ?? d.listingType)),
      num(d.price),
      num(d.rent),
      str(d.statusKey) || unitStatusFromProperty(d.status, d.deletedAt),
      agent,
      str(d.title, unitNumber),
      str(d.description),
      JSON.stringify(Array.isArray(d.amenities) ? d.amenities : []),
      JSON.stringify(Array.isArray(d.images) ? d.images : []),
      bool(d.featured) || str(d.status) === 'Featured',
      num(d.lat),
      num(d.lng),
      d.placeId ? str(d.placeId) : null,
      d.formattedAddress ? str(d.formattedAddress) : null,
      d.geocodedAt ? str(d.geocodedAt) : null,
    ],
  )
  return uuid
}

async function upsertRoom(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('room', feId)
  const unit =
    (await resolveUuid('unit', str(d.unitId))) ??
    (await unitIdFromProperty(d.propertyId ?? d.unitId))
  if (!unit) throw new Error('room requires unitId')
  const client = await clientId(d.clientId ?? d.agencyId)
  const layout = (d.layout as Record<string, number> | undefined) ?? undefined
  const kind = str(d.kind ?? d.roomKind, 'other').toLowerCase()
  const roomKind = [
    'bedroom',
    'bathroom',
    'kitchen',
    'living',
    'dining',
    'study',
    'garage',
    'other',
  ].includes(kind)
    ? kind
    : 'other'

  await query(
    `INSERT INTO rooms (
       id, unit_id, client_id, name, room_kind, beds, baths, area_sqm,
       layout_x, layout_y, layout_w, layout_h, sort_order
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       room_kind = EXCLUDED.room_kind,
       beds = EXCLUDED.beds,
       baths = EXCLUDED.baths,
       area_sqm = EXCLUDED.area_sqm,
       layout_x = EXCLUDED.layout_x,
       layout_y = EXCLUDED.layout_y,
       layout_w = EXCLUDED.layout_w,
       layout_h = EXCLUDED.layout_h,
       sort_order = EXCLUDED.sort_order`,
    [
      uuid,
      unit,
      client,
      str(d.name, 'Room'),
      roomKind,
      num(d.beds) ?? 0,
      num(d.baths) ?? 0,
      num(d.area) ?? num(d.areaSqm),
      layout?.x ?? null,
      layout?.y ?? null,
      layout?.w ?? null,
      layout?.h ?? null,
      num(d.sortOrder) ?? 0,
    ],
  )
  return uuid
}

async function upsertAsset(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('asset', feId)
  const unit =
    (await resolveUuid('unit', str(d.unitId))) ?? (await unitIdFromProperty(d.propertyId))
  if (!unit) throw new Error('asset requires unitId')
  const client = await clientId(d.clientId ?? d.agencyId)
  const room = d.roomId ? await resolveUuid('room', str(d.roomId)) : null
  const condition =
    CONDITION_TO_DB[str(d.condition)] ??
    str(d.conditionStatus, 'GOOD').toUpperCase().replace(/\s+/g, '_')

  await query(
    `INSERT INTO internal_assets (
       id, room_id, unit_id, client_id, item_name, serial_number, asset_type_key,
       condition_status, brand, purchase_value, warranty_expires_at, notes, metadata, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7,
       $8, $9, $10, $11::timestamptz, $12, $13::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       room_id = EXCLUDED.room_id,
       item_name = EXCLUDED.item_name,
       serial_number = EXCLUDED.serial_number,
       asset_type_key = EXCLUDED.asset_type_key,
       condition_status = EXCLUDED.condition_status,
       brand = EXCLUDED.brand,
       purchase_value = EXCLUDED.purchase_value,
       warranty_expires_at = EXCLUDED.warranty_expires_at,
       notes = EXCLUDED.notes,
       metadata = internal_assets.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      uuid,
      room,
      unit,
      client,
      str(d.itemName ?? d.name, 'Asset'),
      d.serialNumber ? str(d.serialNumber) : null,
      str(d.assetTypeKey ?? d.type, 'APPLIANCE').toUpperCase(),
      ['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'NEEDS_REPLACEMENT'].includes(condition)
        ? condition
        : 'GOOD',
      d.brand ? str(d.brand) : null,
      num(d.purchaseValue),
      d.warrantyExpiresAt ? str(d.warrantyExpiresAt) : null,
      d.notes ? str(d.notes) : null,
      JSON.stringify({ frontend_id: feId }),
    ],
  )
  return uuid
}

async function upsertLead(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('lead', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const agent = await userId(d.agentId)
  const interest = str(d.type, 'Rent').toLowerCase().startsWith('b') ? 'BUY' : 'RENT'
  // Merge server-side: incoming metadata keys override, existing keys survive —
  // so a stage-progress write never clobbers unrelated metadata.
  const incomingMeta = isPlainObject(d.metadata) ? d.metadata : {}
  const metadata = JSON.stringify(incomingMeta)

  await query(
    `INSERT INTO leads (
       id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
       interest_type, value_amount, notes, metadata, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9,
       $10, $11, $12, $13::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       unit_id = EXCLUDED.unit_id,
       agent_id = EXCLUDED.agent_id,
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       channel = EXCLUDED.channel,
       stage = EXCLUDED.stage,
       interest_type = EXCLUDED.interest_type,
       value_amount = EXCLUDED.value_amount,
       notes = EXCLUDED.notes,
       metadata = leads.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      agent,
      str(d.name, 'Lead'),
      d.email ? str(d.email) : null,
      d.phone ? str(d.phone) : null,
      d.channel ? str(d.channel) : null,
      str(d.stage, 'New'),
      interest,
      num(d.value),
      d.notes ? str(d.notes) : null,
      metadata,
    ],
  )
  return uuid
}


async function resolveListingForApplication(
  propertyId: unknown,
): Promise<{ unitId: string; clientId: string }> {
  return resolveLiveListing(propertyId)
}

/** Payload agency wins only when it is a real clients row; otherwise the listing. */
async function agencyClientForApplication(
  payloadAgency: unknown,
  listingClientId: string,
): Promise<string> {
  const raw =
    payloadAgency == null || String(payloadAgency).trim() === '' ? '' : str(payloadAgency)
  if (raw) {
    try {
      const resolved = await clientId(raw)
      const ok = await query<{ id: string }>(
        `SELECT id::text AS id FROM clients WHERE id = $1::uuid LIMIT 1`,
        [resolved],
      )
      if (ok[0]?.id) {
        // A public card that still carries the Framesby/Bayview agency must
        // not override the live Humewood client we just resolved.
        if (
          listingClientId &&
          ok[0].id === 'a1000001-0001-4000-8000-000000000003' &&
          listingClientId !== ok[0].id
        ) {
          return listingClientId
        }
        return ok[0].id
      }
    } catch {
      /* unresolved public agency id — inherit the listing */
    }
  }
  if (!listingClientId) {
    throw new Error(`application requires agencyId (got ${String(payloadAgency ?? '')})`)
  }
  return listingClientId
}

function blank(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

type JsonRow = Record<string, unknown>
function asRow(v: unknown): JsonRow | null {
  if (typeof v === 'string') {
    try {
      return asRow(JSON.parse(v))
    } catch {
      return null
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonRow) : null
}

/**
 * Application fields on update. email / phone / keyCollection: written as
 * sent (staff may clear a phone to blank), kept when absent. Redacted rows
 * only reach landlords, whose writes are the narrow decision UPDATE, and a
 * portal applicant's blank email / phone is dropped by the portal policy
 * before it gets here, so the keep-stored rule is not needed for blanks.
 * Documents: merged by key over the stored document, a document sent without
 * a file keeps the stored file, and the stored list is kept when the payload
 * has none.
 */
export function mergeRedactedApplicationFields(
  d: Record<string, unknown>,
  stored: { uploaded_docs_json: unknown; metadata: unknown } | null,
): { contact: JsonRow; documents: unknown[]; keyCollection: unknown; storedDocsJson: JsonRow } {
  const meta = asRow(stored?.metadata) ?? {}
  const docsJson = asRow(stored?.uploaded_docs_json) ?? {}
  const storedDocs = Array.isArray(docsJson.documents) ? (docsJson.documents as JsonRow[]) : []

  const contact: JsonRow = {}
  if (d.email !== undefined || !stored) {
    const email = blank(d.email) ? null : d.email
    contact.email = email
    contact.applicant_email = email
  }
  if (d.phone !== undefined || !stored) contact.phone = blank(d.phone) ? null : d.phone

  const sentDocs = (d.documents ?? d.docs) as unknown
  let documents: unknown[]
  if (!Array.isArray(sentDocs)) {
    documents = storedDocs
  } else {
    documents = sentDocs.map((raw) => {
      const doc = asRow(raw)
      if (!doc) return raw
      const prev = storedDocs.find((x) => x && x.key === doc.key)
      if (!prev) return doc
      const merged: JsonRow = { ...prev, ...doc }
      // A redacted document has no file: keep the stored one.
      if (doc.file == null && prev.file != null) merged.file = prev.file
      return merged
    })
  }

  const keyCollection: unknown =
    d.keyCollection !== undefined ? d.keyCollection : (asRow(meta.keyCollection) ?? null)
  return { contact, documents, keyCollection, storedDocsJson: docsJson }
}

async function upsertApplication(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('application', feId)
  // Stored row (if any). Narrowed writes (portal applicant: unchanged workflow
  // fields, agent / agency / listing dropped) must never blank the stored
  // values: absent fields keep the stored value (mergeRedactedApplicationFields).
  const storedRows = await query<{
    uploaded_docs_json: unknown
    metadata: unknown
    unit_id?: string | null
    client_id?: string | null
    applicant_id?: string | null
  }>(
    `SELECT uploaded_docs_json, metadata, unit_id::text AS unit_id, client_id::text AS client_id,
            applicant_id::text AS applicant_id
       FROM applications WHERE id = $1::uuid`,
    [uuid],
  )
  const stored = storedRows[0] ?? null
  const kept = mergeRedactedApplicationFields(d, stored)
  const has = (k: string) => d[k] !== undefined

  // Public payload may omit agencyId. Pick the live mapped unit, not the
  // static Framesby seed resolveUuid returns first. An update without a
  // propertyId keeps the stored unit.
  let unit: string
  let listingClient: string | null
  if (!has('propertyId') && stored?.unit_id) {
    unit = stored.unit_id
    listingClient = stored.client_id ?? null
  } else {
    const listing = await resolveListingForApplication(d.propertyId)
    unit = listing.unitId
    listingClient = listing.clientId
  }
  const client = await agencyClientForApplication(d.agencyId, listingClient ?? '')
  // Mode A Sipho: if applicantUserId missing, resolve from email → users and
  // persist. Only while no applicant is stored: an update without
  // applicantUserId keeps the stored applicant (never re-resolved by email).
  const applicant =
    stored?.applicant_id && !has('applicantUserId')
      ? stored.applicant_id
      : await resolveApplicantOrTenantUuid({
          userFeId: d.applicantUserId,
          email: d.email,
        })
  let agent = await userId(d.agentId)
  if (!agent && !has('agentId') && !stored) {
    // New application without an agent (portal applicants cannot pick one):
    // the listing's agent.
    const u = await query<{ agent_id: string | null }>(
      `SELECT agent_id::text AS agent_id FROM units WHERE id = $1::uuid`,
      [unit],
    )
    agent = u[0]?.agent_id ?? null
  }
  // Status from the stage label, else an explicit status; a stage with no DB
  // mapping (e.g. lease_sent) keeps the stored status instead of resetting it
  // to SUBMITTED.
  const statusFromStage = APP_STAGE_TO_DB[str(d.stage)]
  const statusSent = Boolean(statusFromStage) || !blank(d.status)
  const status =
    statusFromStage ?? str(d.status, 'SUBMITTED').toUpperCase().replace(/\s+/g, '_')
  const appType = str(d.type, 'Rental').toLowerCase().startsWith('p') ? 'PURCHASE' : 'RENTAL'
  const ref = str(d.referenceCode ?? feId)

  const docsJson: Record<string, unknown> = { documents: kept.documents }
  for (const k of ['creditCheck', 'creditConsent', 'screening']) {
    docsJson[k] = has(k) ? d[k] : (kept.storedDocsJson[k] ?? null)
  }
  // Metadata merges over the stored object: on update an absent field is left
  // out so the stored key survives.
  const meta: Record<string, unknown> = {
    frontend_id: feId,
    ...kept.contact,
    keyCollection: kept.keyCollection,
  }
  const metaFields: Array<[string, string]> = [
    ['applicantName', 'applicantName'],
    ['applicant_name', 'applicantName'],
    ['viewingSlotId', 'viewingSlotId'],
    ['progress', 'progress'],
    ['stage', 'stage'],
    ['workflow_status', 'workflowStatus'],
    ['screening', 'screening'],
  ]
  for (const [key, field] of metaFields) {
    if (has(field) || !stored) meta[key] = d[field] ?? null
  }

  await query(
    `INSERT INTO applications (
       id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type,
       status, monthly_income, employment_summary, message, uploaded_docs_json,
       move_in_date, metadata, submitted_at, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7,
       $8, $9, $10, $11, $12::jsonb,
       $13::date, $14::jsonb, COALESCE($15::timestamptz, NOW()), NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       -- P0-sync (R12): never leave a null/stale agency client_id on re-upsert.
       client_id = COALESCE(EXCLUDED.client_id, applications.client_id),
       unit_id = EXCLUDED.unit_id,
       applicant_id = COALESCE(EXCLUDED.applicant_id, applications.applicant_id),
       agent_id = CASE WHEN $17::boolean THEN EXCLUDED.agent_id ELSE applications.agent_id END,
       reference_code = COALESCE(EXCLUDED.reference_code, applications.reference_code),
       status = CASE WHEN $16::boolean THEN EXCLUDED.status ELSE applications.status END,
       monthly_income = EXCLUDED.monthly_income,
       employment_summary = EXCLUDED.employment_summary,
       message = EXCLUDED.message,
       uploaded_docs_json = EXCLUDED.uploaded_docs_json,
       move_in_date = COALESCE(EXCLUDED.move_in_date, applications.move_in_date),
       metadata = applications.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      applicant,
      agent,
      ref,
      appType,
      status,
      num(d.income),
      d.employment ? str(d.employment) : null,
      d.notes ? str(d.notes) : null,
      JSON.stringify(docsJson),
      d.moveInDate ? str(d.moveInDate) : null,
      JSON.stringify(meta),
      d.submittedAt ? str(d.submittedAt) : null,
      statusSent,
      has('agentId'),
    ],
  )
  // "Accepted elsewhere" notices are written here, not by the client (the
  // gate refuses a client notification for another agency's staff).
  const prevWorkflow = str(asRow(stored?.metadata)?.workflow_status)
  if (has('workflowStatus') && isAcceptanceStatus(d.workflowStatus) && !isAcceptanceStatus(prevWorkflow)) {
    await notifyAcceptedElsewhereServer(uuid)
  }
  return uuid
}

async function upsertTenancy(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('tenancy', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  if (!unit) throw new Error('tenancy requires propertyId')
  // Mode A Sipho: honor FE tenantUserId; else email / linked application applicant.
  // Fail-closed — never mint orphan PENDING lease with tenant_id NULL.
  let tenant = await resolveApplicantOrTenantUuid({
    userFeId: d.tenantUserId,
    email: d.tenantEmail ?? d.email,
  })
  const app = d.applicationId ? await resolveUuid('application', str(d.applicationId)) : null
  if (!tenant && app) {
    const appRows = await query<{
      applicant_id: string | null
      email: string | null
    }>(
      `SELECT applicant_id::text AS applicant_id,
              COALESCE(metadata->>'email', metadata->>'applicant_email') AS email
         FROM applications WHERE id = $1::uuid LIMIT 1`,
      [app],
    )
    const row = appRows[0]
    if (row?.applicant_id) {
      tenant = row.applicant_id
    } else if (row?.email) {
      tenant = await resolveApplicantOrTenantUuid({ email: row.email })
      if (tenant) {
        await query(
          `UPDATE applications SET applicant_id = $2::uuid, updated_at = NOW()
            WHERE id = $1::uuid AND applicant_id IS NULL`,
          [app, tenant],
        )
      }
    }
  }
  if (!tenant) {
    throw Object.assign(
      new Error(
        'tenancy requires resolvable tenantUserId or applicant email — refusing orphan PENDING lease',
      ),
      { status: 400 },
    )
  }
  const landlord = await userId(d.landlordId)
  const agent = await userId(d.agentId)
  const status = TENANCY_STATUS_TO_DB[str(d.status, 'Active')] ?? 'ACTIVE'

  await query(
    `INSERT INTO leases (
       id, client_id, unit_id, application_id, tenant_id, landlord_id, agent_id,
       lease_reference, status, start_date, end_date, rent_amount, deposit_amount, rent_due_day, metadata, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
       $8, $9, $10::date, $11::date, $12, $13, $14, $15::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       rent_amount = EXCLUDED.rent_amount,
       deposit_amount = EXCLUDED.deposit_amount,
       rent_due_day = EXCLUDED.rent_due_day,
       tenant_id = EXCLUDED.tenant_id,
       landlord_id = EXCLUDED.landlord_id,
       agent_id = EXCLUDED.agent_id,
       metadata = leases.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      app,
      tenant,
      landlord,
      agent,
      str(d.leaseReference ?? feId),
      status,
      str(d.startDate, new Date().toISOString().slice(0, 10)),
      d.endDate ? str(d.endDate) : null,
      num(d.rent) ?? 0,
      num(d.deposit) ?? 0,
      Math.min(28, Math.max(1, num(d.rentDueDay) ?? 1)),
      JSON.stringify({
        frontend_id: feId,
        tenantName: d.tenantName ?? null,
        keyCollection: d.keyCollection ?? null,
        leaseDocumentId: d.leaseDocumentId ?? null,
        leasePdfUrl: d.leasePdfUrl ?? null,
        eSign: d.eSign ?? null,
        renewalOps: d.renewalOps ?? null,
        billingSchedule: d.billingSchedule ?? null,
      }),
    ],
  )
  return uuid
}

async function upsertViewing(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('viewing', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  if (!unit) throw new Error('viewing requires propertyId')
  const agent = await userId(d.agentId)
  const slot = d.slotId ? await resolveUuid('viewing_slot', str(d.slotId)) : null
  const date = str(d.date, new Date().toISOString().slice(0, 10))
  const time = str(d.time, '10:00')
  const starts = `${date}T${time}:00`
  const status = VIEW_STATUS_TO_DB[str(d.status, 'Scheduled')] ?? 'SCHEDULED'

  await query(
    `INSERT INTO bookings (
       id, client_id, unit_id, slot_id, agent_id, visitor_name, visitor_email, starts_at, status, notes, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::timestamptz, $9, $10, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       visitor_name = EXCLUDED.visitor_name,
       visitor_email = EXCLUDED.visitor_email,
       starts_at = EXCLUDED.starts_at,
       status = EXCLUDED.status,
       agent_id = EXCLUDED.agent_id,
       slot_id = EXCLUDED.slot_id,
       notes = EXCLUDED.notes,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      slot,
      agent,
      str(d.applicantName, 'Visitor'),
      d.applicantEmail ? str(d.applicantEmail) : null,
      starts,
      status,
      d.notes ? str(d.notes) : null,
    ],
  )
  return uuid
}

async function upsertViewingSlot(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('viewing_slot', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  if (!unit) throw new Error('viewing_slot requires propertyId')
  const agent = await userId(d.agentId)
  const status = SLOT_STATUS_TO_DB[str(d.status, 'Open')] ?? 'OPEN'
  const capacity = num(d.capacity) ?? 3
  const booked = num(d.booked) ?? 0

  await query(
    `INSERT INTO viewing_slots (
       id, client_id, unit_id, agent_id, slot_date, slot_time, capacity, booked_count,
       status, title, notes, duration_minutes, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, $6, $7, $8,
       $9, $10, $11, $12, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       agent_id = EXCLUDED.agent_id,
       slot_date = EXCLUDED.slot_date,
       slot_time = EXCLUDED.slot_time,
       capacity = EXCLUDED.capacity,
       booked_count = EXCLUDED.booked_count,
       status = EXCLUDED.status,
       title = EXCLUDED.title,
       notes = EXCLUDED.notes,
       duration_minutes = EXCLUDED.duration_minutes,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      agent,
      str(d.date, new Date().toISOString().slice(0, 10)),
      str(d.time, '10:00'),
      capacity,
      booked,
      status,
      d.title ? str(d.title) : null,
      d.notes ? str(d.notes) : null,
      num(d.durationMinutes) ?? 30,
    ],
  )
  return uuid
}

async function upsertPayment(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('payment', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const lease = d.tenancyId ? await resolveUuid('tenancy', str(d.tenancyId)) : null
  const app = d.applicationId ? await resolveUuid('application', str(d.applicationId)) : null
  const party = await userId(d.partyUserId)
  const recorded = await userId(d.recordedByUserId)
  const payType = PAY_TYPE_TO_DB[str(d.type, 'Other')] ?? 'OTHER'
  const status = PAY_STATUS_TO_DB[str(d.status, 'Due')] ?? 'DUE'

  await query(
    `INSERT INTO payments (
       id, client_id, unit_id, lease_id, application_id, party_user_id, party_name,
       payment_type, amount, paid_amount, status, due_date, paid_at, method, reference,
       notes, landlord_visible, recorded_by, attachments, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7,
       $8, $9, $10, $11, $12::date, $13::timestamptz, $14, $15,
       $16, $17, $18::uuid, $19::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       amount = EXCLUDED.amount,
       paid_amount = EXCLUDED.paid_amount,
       status = EXCLUDED.status,
       due_date = EXCLUDED.due_date,
       paid_at = EXCLUDED.paid_at,
       method = EXCLUDED.method,
       reference = EXCLUDED.reference,
       notes = EXCLUDED.notes,
       attachments = EXCLUDED.attachments,
       recorded_by = EXCLUDED.recorded_by,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      lease,
      app,
      party,
      str(d.partyName, 'Party'),
      payType,
      num(d.amount) ?? 0,
      num(d.paidAmount),
      status,
      str(d.dueDate, new Date().toISOString().slice(0, 10)),
      d.paidAt ? str(d.paidAt) : null,
      d.method ? str(d.method) : null,
      d.reference ? str(d.reference) : null,
      d.notes ? str(d.notes) : null,
      bool(d.landlordVisible, true),
      recorded,
      JSON.stringify(Array.isArray(d.attachments) ? d.attachments : []),
    ],
  )
  return uuid
}

async function upsertTicket(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('ticket', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId ?? d.unitId)
  if (!unit) throw new Error('ticket requires propertyId')
  const reported = await userId(d.reportedByUserId)
  // Absent assignment / cost / status / priority / warranty (a tenant's own
  // ticket has them stripped) keep the stored values on update.
  const has = (k: string) => d[k] !== undefined
  const assignSent = has('assignedAgentId') || has('assignedTo')
  const assigned = await userId(d.assignedAgentId ?? d.assignedTo)
  const contractor = await userId(d.contractorId)
  const asset = d.internalAssetId ? await resolveUuid('asset', str(d.internalAssetId)) : null
  const status = TICKET_STATUS_TO_DB[str(d.status, 'Open')] ?? 'OPEN'
  const priority = TICKET_PRI_TO_DB[str(d.priority, 'Medium')] ?? 'MEDIUM'

  await query(
    `INSERT INTO maintenance_tickets (
       id, client_id, unit_id, asset_id, reported_by, assigned_to, contractor_id,
       category_key, title, description, priority, status, warranty_covered,
       escalated_at, cost_estimate, cost_actual, photos, completed_at, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
       -- A new ticket without an assignment (tenant-reported) goes to the unit's agent.
       CASE WHEN $19::boolean THEN $6::uuid ELSE (SELECT u.agent_id FROM units u WHERE u.id = $3::uuid) END,
       $7::uuid,
       $8, $9, $10, $11, $12, $13,
       $14::timestamptz, $15, $16, $17::jsonb, $18::timestamptz, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       asset_id = EXCLUDED.asset_id,
       assigned_to = CASE WHEN $19::boolean THEN EXCLUDED.assigned_to ELSE maintenance_tickets.assigned_to END,
       contractor_id = CASE WHEN $20::boolean THEN EXCLUDED.contractor_id ELSE maintenance_tickets.contractor_id END,
       category_key = EXCLUDED.category_key,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       priority = CASE WHEN $23::boolean THEN EXCLUDED.priority ELSE maintenance_tickets.priority END,
       status = CASE WHEN $21::boolean THEN EXCLUDED.status ELSE maintenance_tickets.status END,
       warranty_covered = CASE WHEN $24::boolean THEN EXCLUDED.warranty_covered ELSE maintenance_tickets.warranty_covered END,
       escalated_at = COALESCE(EXCLUDED.escalated_at, maintenance_tickets.escalated_at),
       cost_estimate = CASE WHEN $22::boolean THEN EXCLUDED.cost_estimate ELSE maintenance_tickets.cost_estimate END,
       cost_actual = CASE WHEN $22::boolean THEN EXCLUDED.cost_actual ELSE maintenance_tickets.cost_actual END,
       photos = EXCLUDED.photos,
       completed_at = CASE WHEN $21::boolean THEN EXCLUDED.completed_at ELSE maintenance_tickets.completed_at END,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      asset,
      reported,
      assigned,
      contractor,
      d.categoryKey ? str(d.categoryKey).toUpperCase() : null,
      str(d.title, 'Ticket'),
      str(d.description, ''),
      priority,
      status,
      bool(d.warrantyCovered),
      d.escalatedAt ? str(d.escalatedAt) : null,
      num(d.cost),
      num(d.cost),
      JSON.stringify(Array.isArray(d.photos) ? d.photos : []),
      status === 'COMPLETED' || status === 'RESOLVED' ? new Date().toISOString() : null,
      assignSent,
      has('contractorId'),
      has('status'),
      has('cost'),
      has('priority'),
      has('warrantyCovered'),
    ],
  )
  return uuid
}

async function upsertDocument(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('document', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const building = d.buildingId ? await resolveUuid('building', str(d.buildingId)) : null
  const uploadedBy = await userId(d.uploadedByUserId)
  const category = DOC_CAT_TO_DB[str(d.category, 'Other')] ?? 'OTHER'
  const statusMap: Record<string, string> = {
    Required: 'REQUIRED',
    Uploaded: 'UPLOADED',
    Verified: 'VERIFIED',
    Rejected: 'REJECTED',
  }
  const status = statusMap[str(d.status, 'Uploaded')] ?? 'UPLOADED'

  await query(
    `INSERT INTO documents (
       id, client_id, unit_id, building_id, uploaded_by, name, category, status,
       storage_url, note, applicant_name, uploaded_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8,
       $9, $10, $11, COALESCE($12::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       category = EXCLUDED.category,
       status = EXCLUDED.status,
       storage_url = EXCLUDED.storage_url,
       note = EXCLUDED.note,
       applicant_name = EXCLUDED.applicant_name`,
    [
      uuid,
      client,
      unit,
      building,
      uploadedBy,
      str(d.name, 'Document'),
      category,
      status,
      d.url ? str(d.url) : d.storageUrl ? str(d.storageUrl) : null,
      d.note ? str(d.note) : null,
      d.applicantName ? str(d.applicantName) : null,
      d.uploadedAt ? str(d.uploadedAt) : null,
    ],
  )
  return uuid
}

async function upsertNotification(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('notification', feId)
  const user = await userId(d.userId)
  if (!user) throw new Error('notification requires userId')
  const client = d.agencyId ? await resolveUuid('agency', str(d.agencyId)) : null

  await query(
    `INSERT INTO notifications (
       id, client_id, user_id, title, body, link_path, resource_type, action_type, broadcast_id, read_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::uuid, $10::timestamptz
     )
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       body = EXCLUDED.body,
       link_path = EXCLUDED.link_path,
       read_at = EXCLUDED.read_at`,
    [
      uuid,
      client,
      user,
      str(d.title, 'Notification'),
      str(d.body, ''),
      d.link ? str(d.link) : null,
      d.resource ? str(d.resource) : null,
      d.action ? str(d.action) : null,
      d.broadcastId && String(d.broadcastId).length > 30 ? str(d.broadcastId) : null,
      d.read ? (d.readAt ? str(d.readAt) : new Date().toISOString()) : null,
    ],
  )
  return uuid
}

async function upsertThread(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('thread', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const app = d.applicationId ? await resolveUuid('application', str(d.applicationId)) : null
  const routesRaw = str(d.routesTo, 'Agent').toUpperCase()
  const routes = routesRaw.startsWith('AGENCY')
    ? 'AGENCY'
    : routesRaw.startsWith('LANDLORD')
      ? 'LANDLORD'
      : 'AGENT'

  // Map participant frontend ids → UUIDs when possible
  const rawParts = Array.isArray(d.participantIds) ? d.participantIds : []
  const parts: string[] = []
  for (const p of rawParts) {
    const u = await resolveUuid('user', str(p))
    parts.push(u ?? str(p))
  }

  await query(
    `INSERT INTO message_threads (
       id, client_id, unit_id, application_id, subject, routes_to, participant_ids, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       subject = EXCLUDED.subject,
       routes_to = EXCLUDED.routes_to,
       participant_ids = EXCLUDED.participant_ids,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      app,
      str(d.subject, 'Thread'),
      routes,
      JSON.stringify(parts),
    ],
  )
  return uuid
}

async function upsertMessage(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('message', feId)
  const thread = await resolveUuid('thread', str(d.threadId))
  if (!thread) throw new Error('message requires threadId')
  const client = await clientId(d.agencyId)
  const from = await userId(d.fromUserId)
  if (!from) throw new Error('message requires fromUserId')

  await query(
    `INSERT INTO messages (id, thread_id, client_id, from_user_id, body, created_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, COALESCE($6::timestamptz, NOW()))
     ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body`,
    [uuid, thread, client, from, str(d.body, ''), d.at ? str(d.at) : null],
  )
  await query(`UPDATE message_threads SET updated_at = NOW() WHERE id = $1::uuid`, [thread])
  return uuid
}

async function upsertLookup(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('lookup', feId)
  const client = await clientId(d.clientId === 'global' || !d.clientId ? 'ag-horizon' : d.clientId)
  // Preserve the id-map keys the platform writes into meta; type-specific
  // extras (e.g. LEAD_STAGE step requirements) merge over them server-side.
  const incomingMeta = isPlainObject(d.meta) ? d.meta : {}
  const meta = JSON.stringify({ frontend_id: feId, ...incomingMeta })
  await query(
    `INSERT INTO client_lookup_configs (
       id, client_id, config_type, key_value, display_label, is_active, sort_order, meta
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb
     )
     ON CONFLICT (id) DO UPDATE SET
       display_label = EXCLUDED.display_label,
       is_active = EXCLUDED.is_active,
       sort_order = EXCLUDED.sort_order,
       key_value = EXCLUDED.key_value,
       meta = client_lookup_configs.meta || EXCLUDED.meta`,
    [
      uuid,
      client,
      str(d.configType, 'CUSTOM'),
      str(d.keyValue, feId),
      str(d.displayLabel, str(d.keyValue, feId)),
      bool(d.isActive, true),
      num(d.sortOrder) ?? 0,
      meta,
    ],
  )
  return uuid
}

async function upsertSuiteAlert(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('suite_alert', feId)
  const client = await clientIdOptional(d.agencyId)
  const actions = Array.isArray(d.actions) ? d.actions : ['created', 'updated', 'deleted']
  const notifyRoles = Array.isArray(d.notifyRoles) ? d.notifyRoles : []

  await query(
    `INSERT INTO suite_alerts (
       id, client_id, resource, actions, enabled, popup_enabled, popup_duration_ms, notify_roles, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4::jsonb, $5, $6, $7, $8::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       resource = EXCLUDED.resource,
       actions = EXCLUDED.actions,
       enabled = EXCLUDED.enabled,
       popup_enabled = EXCLUDED.popup_enabled,
       popup_duration_ms = EXCLUDED.popup_duration_ms,
       notify_roles = EXCLUDED.notify_roles,
       updated_at = NOW()`,
    [
      uuid,
      client,
      str(d.resource, 'property'),
      JSON.stringify(actions),
      bool(d.enabled, true),
      bool(d.popupEnabled, true),
      num(d.popupDurationMs) ?? 6000,
      JSON.stringify(notifyRoles),
    ],
  )
  return uuid
}

async function upsertActivity(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('activity', feId)
  const client = await clientIdOptional(d.agencyId)
  const payload = {
    text: str(d.text, ''),
    user: str(d.user, 'System'),
  }

  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2::uuid, 'activity', 'agency', NULL, NULL, $3::jsonb, COALESCE($4::timestamptz, NOW()))
     ON CONFLICT (id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       payload = EXCLUDED.payload`,
    [uuid, client, JSON.stringify(payload), d.at ? str(d.at) : null],
  )
  return uuid
}

async function upsertPropertyEvent(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('property_event', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const actor = await userId(d.actorUserId)
  const payload = {
    actorName: str(d.actorName, 'System'),
    action: str(d.action, 'updated'),
    changes: Array.isArray(d.changes) ? d.changes : [],
    propertyId: str(d.propertyId, ''),
  }

  await query(
    `INSERT INTO event_log (
       id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at
     ) VALUES (
       $1::uuid, $2::uuid, 'property_event', 'property', $3::uuid, $4::uuid, $5::jsonb,
       COALESCE($6::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       payload = EXCLUDED.payload,
       actor_user_id = EXCLUDED.actor_user_id,
       subject_id = EXCLUDED.subject_id`,
    [uuid, client, unit, actor, JSON.stringify(payload), d.at ? str(d.at) : null],
  )
  return uuid
}

/**
 * CR7 help desk ticket → event_log (event_type 'support_ticket'), no migration.
 *
 * The scope gate (assertPersistAllowed) has already checked the actor and, on
 * submit, stamped submittedByUserId / submitterRole / agencyId from the server
 * actor. This writer:
 *  - on insert always stores status 'open', whatever the payload says;
 *  - on conflict merges ONLY the status / resolution keys into payload — never
 *    subject, body, submitter or client_id — and only while the row
 *    is still open (a resolved ticket is read-only).
 */
async function upsertSupportTicket(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('support_ticket', feId)
  const client = await clientIdOptional(d.agencyId)
  const submitter = await userId(d.submittedByUserId)
  const insertPayload = {
    frontendId: feId,
    subject: str(d.subject, '').slice(0, SUPPORT_SUBJECT_MAX),
    body: str(d.body, '').slice(0, SUPPORT_BODY_MAX),
    submittedByUserId: str(d.submittedByUserId, ''),
    submitterName: str(d.submitterName, ''),
    submitterRole: str(d.submitterRole, ''),
    status: 'open',
  }
  const resolutionPatch: Record<string, unknown> =
    str(d.status) === 'resolved'
      ? {
          status: 'resolved',
          resolvedByUserId: str(d.resolvedByUserId, ''),
          resolvedByName: str(d.resolvedByName, ''),
          resolvedAt: str(d.resolvedAt) || new Date().toISOString(),
          resolutionNote: str(d.resolutionNote, '').slice(0, SUPPORT_NOTE_MAX),
        }
      : {}

  await query(
    `INSERT INTO event_log (
       id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at
     ) VALUES (
       $1::uuid, $2::uuid, 'support_ticket', 'support_ticket', NULL, $3::uuid, $4::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       payload = event_log.payload || $5::jsonb
     WHERE event_log.event_type = 'support_ticket'
       AND COALESCE(event_log.payload->>'status', 'open') <> 'resolved'`,
    [uuid, client, submitter, JSON.stringify(insertPayload), JSON.stringify(resolutionPatch)],
  )
  return uuid
}

async function upsertInvoice(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('invoice', feId)
  const client = await clientId(d.clientId)
  const subscriptionId = await resolveSubscriptionId(d.subscriptionId, client)
  const lineItems = Array.isArray(d.lineItems) ? d.lineItems : []
  const status = str(d.paymentStatus, 'UNPAID').toUpperCase()
  const allowed = new Set(['UNPAID', 'PAID', 'FAILED', 'VOID'])
  const paymentStatus = allowed.has(status) ? status : 'UNPAID'

  await query(
    `INSERT INTO invoices (
       id, client_id, subscription_id, billing_period_start, billing_period_end,
       base_amount, asset_usage_amount, vat_amount, total_amount_due, payment_status, line_items, created_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::date, $5::date,
       $6, $7, $8, $9, $10, $11::jsonb, COALESCE($12::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       payment_status = EXCLUDED.payment_status,
       base_amount = EXCLUDED.base_amount,
       asset_usage_amount = EXCLUDED.asset_usage_amount,
       vat_amount = EXCLUDED.vat_amount,
       total_amount_due = EXCLUDED.total_amount_due,
       line_items = EXCLUDED.line_items`,
    [
      uuid,
      client,
      subscriptionId,
      str(d.billingPeriodStart, new Date().toISOString().slice(0, 10)),
      str(d.billingPeriodEnd, new Date().toISOString().slice(0, 10)),
      num(d.baseAmount) ?? 0,
      num(d.assetUsageAmount) ?? 0,
      num(d.vatAmount) ?? 0,
      num(d.totalAmountDue) ?? 0,
      paymentStatus,
      JSON.stringify(lineItems),
      d.createdAt ? str(d.createdAt) : null,
    ],
  )
  return uuid
}

/** Approve application: status → APPROVED, create lease, mark unit OCCUPIED. */
export async function approveApplicationTx(params: {
  applicationId: string
  actorUserId?: string
  tenancy?: Record<string, unknown>
}): Promise<{ applicationUuid: string; leaseUuid: string | null }> {
  await ensureEntityMapTable()
  const appUuid = await resolveUuid('application', params.applicationId)
  if (!appUuid) throw Object.assign(new Error('Application not found'), { status: 404 })

  return withTransaction(async (client) => {
    const apps = await clientQuery<{
      id: string
      client_id: string
      unit_id: string
      applicant_id: string | null
      agent_id: string | null
      status: string
      monthly_income: string | null
      metadata: Record<string, unknown> | null
    }>(client, `SELECT * FROM applications WHERE id = $1::uuid FOR UPDATE`, [appUuid])
    const app = apps[0]
    if (!app) throw Object.assign(new Error('Application not found'), { status: 404 })

    // Mode A Sipho: link applicant before lease mint — null applicant_id minted orphan TN.
    let applicantId = app.applicant_id
    const t = params.tenancy
    if (!applicantId) {
      const meta = app.metadata ?? {}
      const metaEmail =
        (typeof meta.email === 'string' && meta.email) ||
        (typeof meta.applicant_email === 'string' && meta.applicant_email) ||
        (typeof t?.tenantEmail === 'string' && t.tenantEmail) ||
        (typeof t?.email === 'string' && t.email) ||
        null
      applicantId = await resolveApplicantOrTenantUuid({
        userFeId: t?.tenantUserId,
        email: metaEmail,
      })
      if (applicantId) {
        await clientQuery(
          client,
          `UPDATE applications SET applicant_id = $2::uuid, updated_at = NOW()
           WHERE id = $1::uuid AND applicant_id IS NULL`,
          [appUuid, applicantId],
        )
      }
    }

    const actorUuid = params.actorUserId
      ? await resolveUuid('user', params.actorUserId)
      : null
    await clientQuery(
      client,
      `UPDATE applications SET status = 'APPROVED', decided_at = NOW(), decided_by = $2::uuid, updated_at = NOW()
       WHERE id = $1::uuid`,
      [appUuid, actorUuid],
    )

    await clientQuery(
      client,
      `UPDATE units SET status_config_key = 'OCCUPIED', updated_at = NOW() WHERE id = $1::uuid`,
      [app.unit_id],
    )

    let leaseUuid: string | null = null
    if (t?.id) {
      // Fail-closed: do not mint orphan PENDING lease when tenant cannot be resolved.
      if (!applicantId) {
        throw Object.assign(
          new Error(
            'Cannot mint lease without linked applicant/tenant — resolve applicantUserId or email first',
          ),
          { status: 400 },
        )
      }
      leaseUuid = await ensureUuid('tenancy', str(t.id))
      const landlord = t.landlordId ? await resolveUuid('user', str(t.landlordId)) : null
      await clientQuery(
        client,
        `INSERT INTO leases (
           id, client_id, unit_id, application_id, tenant_id, landlord_id, agent_id,
           lease_reference, status, start_date, end_date, rent_amount, deposit_amount, rent_due_day, metadata, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
           $8, 'PENDING', $9::date, $10::date, $11, $12, $13, $14::jsonb, NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           application_id = EXCLUDED.application_id,
           tenant_id = COALESCE(EXCLUDED.tenant_id, leases.tenant_id),
           rent_due_day = EXCLUDED.rent_due_day,
           updated_at = NOW()`,
        [
          leaseUuid,
          app.client_id,
          app.unit_id,
          appUuid,
          applicantId,
          landlord,
          app.agent_id,
          str(t.id),
          str(t.startDate, new Date().toISOString().slice(0, 10)),
          t.endDate ? str(t.endDate) : null,
          num(t.rent) ?? 0,
          num(t.deposit) ?? 0,
          Math.min(28, Math.max(1, num(t.rentDueDay) ?? 1)),
          JSON.stringify({ frontend_id: str(t.id), from_approval: true }),
        ],
      )
    }

    return { applicationUuid: appUuid, leaseUuid }
  })
}


const TRUST_TXN_STATUSES = new Set([
  'received',
  'recognised',
  'allocated',
  'split_allocated',
  'unallocated',
  'reversed',
])

const CSV_BATCH_STATUSES = new Set(['pending', 'completed', 'failed'])

function trustTxnStatus(v: unknown): string {
  const s = str(v, 'unallocated')
  return TRUST_TXN_STATUSES.has(s) ? s : 'unallocated'
}

function csvBatchStatus(v: unknown): string {
  const s = str(v, 'pending')
  // FE uses "processing"; 007 schema uses "pending"
  if (s === 'processing') return 'pending'
  return CSV_BATCH_STATUSES.has(s) ? s : 'pending'
}

async function resolveOccupancyUuid(occupancyId: unknown): Promise<string | null> {
  const fe = str(occupancyId)
  if (!fe) return null
  if (isUuid(fe)) return fe
  return (await resolveUuid('tenancy', fe)) ?? null
}

/** Mode A trust cashbook row — manual/template CSV or allocate status updates. */
async function upsertTrustTransaction(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('trust_transaction', feId)
  const client = await clientId(d.agencyId)
  const direction = str(d.direction, 'in') === 'out' ? 'out' : 'in'
  const amountCents = Math.max(0, Math.round(num(d.amountCents) ?? 0))
  const valueDate = str(d.valueDate, new Date().toISOString().slice(0, 10)).slice(0, 10)

  await query(
    `INSERT INTO trust_transactions (
       id, client_id, direction, amount_cents, currency, value_date, posted_at,
       partner_txn_id, bank_ref, description, counterparty_hash, status,
       raw_payload_document_id, created_at, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6::date, COALESCE($7::timestamptz, NOW()),
       $8, $9, $10, $11, $12,
       $13::uuid, COALESCE($14::timestamptz, NOW()), NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       direction = EXCLUDED.direction,
       amount_cents = EXCLUDED.amount_cents,
       currency = EXCLUDED.currency,
       value_date = EXCLUDED.value_date,
       posted_at = EXCLUDED.posted_at,
       partner_txn_id = EXCLUDED.partner_txn_id,
       bank_ref = EXCLUDED.bank_ref,
       description = EXCLUDED.description,
       counterparty_hash = EXCLUDED.counterparty_hash,
       status = EXCLUDED.status,
       raw_payload_document_id = EXCLUDED.raw_payload_document_id,
       updated_at = NOW()`,
    [
      uuid,
      client,
      direction,
      amountCents,
      str(d.currency, 'ZAR') || 'ZAR',
      valueDate,
      d.postedAt ? str(d.postedAt) : null,
      d.partnerTxnId ? str(d.partnerTxnId) : null,
      d.bankRef ? str(d.bankRef) : null,
      str(d.description, ''),
      d.counterpartyHash ? str(d.counterpartyHash) : null,
      trustTxnStatus(d.status),
      d.rawPayloadDocumentId && isUuid(str(d.rawPayloadDocumentId))
        ? str(d.rawPayloadDocumentId)
        : null,
      d.createdAt ? str(d.createdAt) : null,
    ],
  )
  return uuid
}

/** Mode A allocate / suspense lines — durable so allocate survives reload. */
async function upsertTrustAllocation(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('trust_allocation', feId)
  const client = await clientId(d.agencyId)
  const txnFe = str(d.trustTransactionId)
  if (!txnFe) throw new Error('trust_allocation requires trustTransactionId')
  const txnUuid =
    (await resolveUuid('trust_transaction', txnFe)) ??
    (isUuid(txnFe) ? txnFe : null)
  if (!txnUuid) throw new Error(`Unknown trust_transaction: ${txnFe}`)

  const occupancyUuid = await resolveOccupancyUuid(d.occupancyId)
  const allocatedBy =
    (await userId(d.allocatedBy)) ??
    (d.allocatedBy && isUuid(str(d.allocatedBy)) ? str(d.allocatedBy) : null)
  const amountCents = Math.max(1, Math.round(num(d.amountCents) ?? 0))

  await query(
    `INSERT INTO trust_allocations (
       id, client_id, trust_transaction_id, occupancy_id, bucket_code, charge_id,
       amount_cents, allocated_by, allocated_at, created_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid,
       $7, $8::uuid, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       occupancy_id = EXCLUDED.occupancy_id,
       bucket_code = EXCLUDED.bucket_code,
       charge_id = EXCLUDED.charge_id,
       amount_cents = EXCLUDED.amount_cents,
       allocated_by = EXCLUDED.allocated_by,
       allocated_at = EXCLUDED.allocated_at`,
    [
      uuid,
      client,
      txnUuid,
      occupancyUuid,
      str(d.bucketCode, 'unallocated') || 'unallocated',
      d.chargeId && isUuid(str(d.chargeId)) ? str(d.chargeId) : null,
      amountCents,
      allocatedBy,
      d.allocatedAt ? str(d.allocatedAt) : null,
      d.createdAt ? str(d.createdAt) : null,
    ],
  )
  return uuid
}

async function upsertCsvImportBatch(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('csv_import_batch', feId)
  const client = await clientId(d.agencyId)
  const importedBy =
    (await userId(d.importedBy)) ??
    (d.importedBy && isUuid(str(d.importedBy)) ? str(d.importedBy) : null)

  await query(
    `INSERT INTO csv_import_batches (
       id, client_id, filename, row_count, imported_at, imported_by, status, created_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, COALESCE($5::timestamptz, NOW()), $6::uuid, $7,
       COALESCE($8::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       filename = EXCLUDED.filename,
       row_count = EXCLUDED.row_count,
       imported_at = EXCLUDED.imported_at,
       imported_by = EXCLUDED.imported_by,
       status = EXCLUDED.status`,
    [
      uuid,
      client,
      str(d.filename, 'template.csv'),
      Math.max(0, Math.round(num(d.rowCount) ?? 0)),
      d.importedAt ? str(d.importedAt) : null,
      importedBy,
      csvBatchStatus(d.status),
      d.createdAt ? str(d.createdAt) : null,
    ],
  )
  return uuid
}

/**
 * Payout instruction upsert — Mode A keeps submitted ≠ settled;
 * never invent partner_payout_id or settled_at here.
 */
async function upsertPayoutInstruction(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('payout_instruction', feId)
  const client = await clientId(d.agencyId)
  const occupancyUuid = await resolveOccupancyUuid(d.occupancyId)
  const unitUuid = d.propertyId
    ? await resolveUuid('property', str(d.propertyId))
    : d.unitId
      ? await resolveUuid('unit', str(d.unitId))
      : null
  const proposedBy = await userId(d.proposedBy)
  const amountCents = Math.max(1, Math.round(num(d.amountCents) ?? 0))

  // Dual control: a payout written through generic persist is always a new
  // proposal. status / approvedBy / submittedAt / settledAt / partnerPayoutId
  // from the payload are ignored, and an existing row is never changed here
  // (approve / submit go through /api/trust/payouts/:id/(approve|submit)).
  await query(
    `INSERT INTO payout_instructions (
       id, client_id, occupancy_id, unit_id, payee_type, payee_id, bank_account_id,
       amount_cents, bucket_code, status, proposed_by, approved_by, submitted_at,
       settled_at, partner_payout_id, failure_reason, idempotency_key, created_at, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7,
       $8, $9, 'proposed', $10::uuid, NULL, NULL,
       NULL, NULL, NULL, $11, COALESCE($12::timestamptz, NOW()), NOW()
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      uuid,
      client,
      occupancyUuid,
      unitUuid,
      str(d.payeeType, 'landlord'),
      d.payeeId ? str(d.payeeId) : null,
      d.bankAccountId ? str(d.bankAccountId) : null,
      amountCents,
      str(d.bucketCode, 'owner_payable'),
      proposedBy,
      d.idempotencyKey ? str(d.idempotencyKey) : null,
      d.createdAt ? str(d.createdAt) : null,
    ],
  )
  return uuid
}

/**
 * Deposit register row. Status and the release dual-control fields are never
 * taken from the payload (any actor): a new row is `held` when money is held,
 * else `expected`; on conflict the stored status and release_*_by are kept,
 * except `expected` -> `held` once held_cents > 0. Release moves only through
 * POST /api/trust/deposits/:id/propose-release | approve-release.
 */
async function upsertDepositHolding(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('deposit_holding', feId)
  const client = await clientId(d.agencyId)
  const occupancyUuid = await resolveOccupancyUuid(d.occupancyId)
  const unitUuid = d.propertyId
    ? await resolveUuid('property', str(d.propertyId))
    : d.unitId
      ? await resolveUuid('unit', str(d.unitId))
      : null
  const heldCents = Math.max(0, Math.round(num(d.heldCents) ?? 0))

  await query(
    `INSERT INTO deposit_holdings (
       id, client_id, occupancy_id, unit_id, expected_cents, held_cents,
       interest_accrued_cents, status, statutory_deadline_on, interest_rate_unknown,
       release_proposed_by, release_approved_by,
       created_at, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6,
       $7, CASE WHEN $6::bigint > 0 THEN 'held' ELSE 'expected' END, $8::date, $9,
       NULL, NULL,
       COALESCE($10::timestamptz, NOW()), NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       occupancy_id = EXCLUDED.occupancy_id,
       unit_id = EXCLUDED.unit_id,
       expected_cents = EXCLUDED.expected_cents,
       held_cents = EXCLUDED.held_cents,
       interest_accrued_cents = EXCLUDED.interest_accrued_cents,
       status = CASE
         WHEN deposit_holdings.status = 'expected' AND EXCLUDED.held_cents > 0 THEN 'held'
         ELSE deposit_holdings.status
       END,
       statutory_deadline_on = EXCLUDED.statutory_deadline_on,
       interest_rate_unknown = EXCLUDED.interest_rate_unknown,
       updated_at = NOW()`,
    [
      uuid,
      client,
      occupancyUuid,
      unitUuid,
      Math.max(0, Math.round(num(d.expectedCents) ?? 0)),
      heldCents,
      Math.max(0, Math.round(num(d.interestAccruedCents) ?? 0)),
      d.statutoryDeadlineOn ? str(d.statutoryDeadlineOn).slice(0, 10) : null,
      bool(d.interestRateUnknown, false),
      d.createdAt ? str(d.createdAt) : null,
    ],
  )
  return uuid
}

/** Mark notification(s) read. */
export async function markNotificationsRead(params: {
  ids?: string[]
  all?: boolean
  /** FE id of the verified actor. Only their own notifications are touched. */
  ownerUserId: string
}): Promise<{ updated: number }> {
  await ensureEntityMapTable()
  const owner = await resolveUuid('user', params.ownerUserId)
  if (!owner) return { updated: 0 }
  if (params.all) {
    const rows = await query(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = $1::uuid AND read_at IS NULL RETURNING id`,
      [owner],
    )
    return { updated: rows.length }
  }
  let updated = 0
  for (const id of params.ids ?? []) {
    const uuid = await resolveUuid('notification', id)
    if (!uuid) continue
    // Ownership in the WHERE clause: another user's notification id updates nothing.
    const rows = await query(
      `UPDATE notifications SET read_at = NOW() WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id`,
      [uuid, owner],
    )
    updated += rows.length
  }
  return { updated }
}
