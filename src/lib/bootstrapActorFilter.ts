/**
 * Actor-scoped bootstrap filtering (shared by API server and Supabase client hydration).
 */
import { agencyIdInFeSpace } from "./agencyScope.js"
import { dealInScope, isAgencyWideRole, ticketInScope, type PropertyScope } from "./scope.js"
import { effectiveCan, isAgencyStaff } from "./permissions.js"
import type { Permission, Role } from "../types/domain.js"
import { filterSupportTicketsForViewer } from "./supportTickets.js"
import { tenantSeesTicket, tenantTicketTenancyIds, tenantTicketView } from "./ticketTenantView.js"

export type BootstrapActor = {
  userId: string
  role: Role | string
  agencyId: string | null
}

function isStaffRole(role: string | null | undefined): boolean {
  if (!role) return false
  if (role === "super_admin") return true
  return isAgencyStaff(role as Role)
}


export type BootstrapPayload = {
  source: string
  fetchedAt: string
  scoped?: boolean
  actor?: { userId: string; role: string; agencyId: string | null } | null
  agencies: Array<{ id: string; status?: string }>
  users: unknown[]
  buildings: Array<{ id: string; clientId?: string }>
  units: Array<{ id: string; clientId?: string; buildingId?: string }>
  properties: Array<{
    id: string
    agencyId: string
    agentId: string | null
    landlordId: string
    buildingId?: string
  }>
  leads: Array<{ propertyId: string; agencyId: string; agentId: string | null }>
  applications: Array<{
    propertyId: string
    agencyId: string
    agentId: string | null
    applicantUserId?: string | null
    email?: string
  }>
  tenancies: Array<{
    propertyId: string
    agencyId?: string
    agentId?: string | null
  }>
  viewings: Array<{ propertyId: string; agencyId: string; agentId: string | null }>
  viewingSlots?: Array<{ propertyId: string; agencyId: string; agentId: string | null }>
  payments: Array<{
    propertyId: string
    agencyId: string
    partyUserId: string | null
    partyName: string
    landlordVisible: boolean
  }>
  propertyDocuments: Array<{ propertyId: string; agencyId: string }>
  tickets: Array<{
    propertyId: string
    agencyId: string
    assignedAgentId: string | null
    contractorId: string | null
  }>
  threads: Array<{
    id: string
    agencyId: string
    propertyId: string | null
    participantIds: string[]
  }>
  messages: Array<{ threadId: string; agencyId: string }>
  notifications: Array<{ userId: string; agencyId: string | null }>
  suiteAlerts?: Array<{ agencyId: string | null }>
  activities?: Array<{ agencyId: string | null }>
  propertyEvents?: Array<{ propertyId?: string; agencyId?: string | null }>
  invoices?: Array<{ agencyId?: string | null; clientId?: string | null }>
  trustTransactions?: Array<{ agencyId?: string | null }>
  trustAllocations?: Array<{ agencyId?: string | null }>
  payoutInstructions?: Array<{ agencyId?: string | null }>
  depositHoldings?: Array<{ agencyId?: string | null }>
  arrearsSnapshots?: Array<{ agencyId?: string | null }>
  csvImportBatches?: Array<{ agencyId?: string | null }>
  supportTickets?: Array<{ agencyId: string | null; submittedByUserId: string; submitterRole?: string | null }>
  [key: string]: unknown
}

export type BootstrapUser = {
  id?: string
  name?: string
  email?: string
  phone?: string
  role?: string
  agencyId?: string | null
  enabledPermissions?: string[]
  idNumberOrPassport?: string
  verification?: Record<string, unknown> | null
  [key: string]: unknown
}

/** Agency staff roles (not tenants / landlords / contractors). */
const AGENCY_STAFF_ROLES: ReadonlySet<string> = new Set([
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
])

/** Record fields that name another user — used to keep names visible on scoped rows. */
const USER_REF_FIELDS = [
  'agentId',
  'landlordId',
  'applicantUserId',
  'tenantUserId',
  'tenantId',
  'partyUserId',
  'assignedAgentId',
  'contractorId',
  'ownerUserId',
  'fromUserId',
  'senderId',
  'createdBy',
  'createdByUserId',
  'reportedByUserId',
  'uploadedByUserId',
  'userId',
] as const

const USER_REF_COLLECTIONS = [
  'properties',
  'leads',
  'applications',
  'tenancies',
  'viewings',
  'viewingSlots',
  'payments',
  'tickets',
  'threads',
  'messages',
] as const

/** User ids referenced by the actor's already-scoped rows (names only are exposed for these). */
export function referencedUserIds(
  filtered: BootstrapPayload,
  actorRole?: string,
): Set<string> {
  const ids = new Set<string>()
  for (const key of USER_REF_COLLECTIONS) {
    const rows = filtered[key]
    if (!Array.isArray(rows)) continue
    // A tenant's tickets add only their reporters to the users list (not the
    // assigned agent or contractor).
    const fields: readonly string[] =
      actorRole === 'tenant' && key === 'tickets' ? ['reportedByUserId'] : USER_REF_FIELDS
    for (const row of rows as Array<Record<string, unknown>>) {
      if (!row || typeof row !== 'object') continue
      for (const f of fields) {
        const v = row[f]
        if (typeof v === 'string' && v) ids.add(v)
      }
      const participants = row.participantIds
      if (Array.isArray(participants)) {
        for (const v of participants) if (typeof v === 'string' && v) ids.add(v)
      }
    }
  }
  return ids
}

/**
 * Directory view of another user: no email, phone, ID/passport number,
 * verification documents or verification profile. Verification keeps status
 * dates only (listing visibility + contractor roster read the status).
 */
export function redactBootstrapUser(u: BootstrapUser): BootstrapUser {
  const { email: _e, phone: _p, idNumberOrPassport: _id, signature: _sig, verification, ...rest } = u
  void _sig
  void _e
  void _p
  void _id
  const out: BootstrapUser = { ...rest }
  if (verification && typeof verification === 'object') {
    const v = verification as Record<string, unknown>
    out.verification = {
      status: v.status,
      ...(v.submittedAt !== undefined ? { submittedAt: v.submittedAt } : {}),
      ...(v.reviewedAt !== undefined ? { reviewedAt: v.reviewedAt } : {}),
      ...(v.reviewedBy !== undefined ? { reviewedBy: v.reviewedBy } : {}),
    }
  }
  return out
}

/** Agency admin who may see contact + verification details of their agency's users. */
function actorManagesAgencyUsers(actor: BootstrapActor, self: BootstrapUser | undefined): boolean {
  if (actor.role !== 'client_admin' && actor.role !== 'agent_admin') return false
  return effectiveCan(
    actor.role as Role,
    'users.manage',
    undefined,
    (self?.enabledPermissions as Permission[] | undefined) ?? undefined,
  )
}

/**
 * Users in bootstrap for a non-super-admin actor.
 * - Self: full record.
 * - Own agency's users: agency staff see all of them; tenants / landlords /
 *   contractors see only their agency's staff (not other tenants or owners).
 * - Users named on the actor's scoped rows (agent on their lease, landlord on
 *   their thread, null-agency tenant on an agency's application): name only.
 * - Agency users.manage admins also see contractor names (any agency) so the
 *   add-to-roster picker keeps working.
 * Contact fields, ID/passport and verification documents are stripped for
 * everyone except self and the actor's own agency when the actor is a
 * users.manage admin. Super admin is not filtered here.
 */
export function filterBootstrapUsersForActor(
  users: unknown[],
  actor: BootstrapActor,
  filtered: BootstrapPayload,
): BootstrapUser[] {
  const all = users as BootstrapUser[]
  const self = all.find((u) => u.id === actor.userId)
  const ag = actor.agencyId
  const isStaff = AGENCY_STAFF_ROLES.has(actor.role)
  const manager = Boolean(ag) && actorManagesAgencyUsers(actor, self)
  const related = referencedUserIds(filtered, actor.role)
  const out: BootstrapUser[] = []
  for (const u of all) {
    if (!u?.id) continue
    if (u.id === actor.userId) {
      out.push(u)
      continue
    }
    const sameAgency =
      Boolean(ag) && agencyIdInFeSpace(u.agencyId) === agencyIdInFeSpace(ag)
    const visible =
      (sameAgency && (isStaff || AGENCY_STAFF_ROLES.has(String(u.role)))) ||
      related.has(u.id) ||
      (manager && u.role === 'contractor')
    if (!visible) continue
    out.push(manager && sameAgency ? u : redactBootstrapUser(u))
  }
  return out
}

/** Portal (non-staff) roles: rows are narrowed to the actor's own records. */
const PORTAL_ROLES: ReadonlySet<string> = new Set(['tenant', 'landlord', 'contractor'])

/** Roles that never receive trust-book rows in bootstrap (B1). */
const NO_TRUST_ROLES: ReadonlySet<string> = new Set([
  'tenant',
  'landlord',
  'contractor',
  'agent',
  'ground_agent',
])

type Row = Record<string, unknown>

const lc = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '')

/** Lead with the prospect's contact fields removed (name kept). */
export function redactLeadContact<T extends object>(row: T): T {
  return { ...row, email: '', phone: '' }
}

/**
 * Application with the applicant's contact + identity fields and pack files
 * removed. Name, stage, income, employment and the document checklist
 * (key / label / status only, no file, note or reviewer) stay so a landlord can
 * still do landlord review. keyCollection.contactPhone is blanked.
 */
export function redactApplicationContact<T extends object>(row: T): T {
  const {
    idNumberOrPassport: _id,
    uploadedDocs: _docs,
    documents,
    keyCollection,
    ...rest
  } = row as Row
  void _id
  void _docs
  const out: Row = { ...rest, email: '', phone: '' }
  if (Array.isArray(documents)) {
    out.documents = (documents as Row[]).map((d) => ({
      key: d?.key,
      label: d?.label,
      status: d?.status,
    }))
  }
  if (keyCollection && typeof keyCollection === 'object') {
    out.keyCollection = { ...(keyCollection as Row), contactPhone: '' }
  }
  return out as T
}

/** Viewing with the visitor's email removed (name kept). */
export function redactViewingContact<T extends object>(row: T): T {
  const { applicantEmail: _e, ...rest } = row as Row
  void _e
  return rest as T
}

/** Tenancy with the tenant's email and the key-collection phone removed. */
export function redactTenancyContact<T extends object>(row: T): T {
  const r = row as Row
  const kc = r.keyCollection
  return {
    ...r,
    tenantEmail: '',
    ...(kc && typeof kc === 'object'
      ? { keyCollection: { ...(kc as Row), contactPhone: '' } }
      : {}),
  } as T
}

/**
 * Applicant-pack document (a person's own files), classified by type and
 * category, never by whether it is linked to a lease:
 * - source type ID (documents.category = 'ID', mapped to 'Other' in the FE),
 *   whoever it belongs to;
 * - any document tied to an applicant (applicationId or applicantName) whose
 *   category is not 'Lease' — i.e. Other (payslips, bank statements, proof of
 *   address, ID copies), Compliance (FICA), Title, Inspection, Marketing.
 * The signed lease (category 'Lease') is the only applicant-linked document
 * that is not pack: both lease parties are entitled to it.
 */
export const APPLICANT_PACK_SOURCE_TYPES: ReadonlySet<string> = new Set(['ID'])

export function isApplicantPackDocument(d: Row): boolean {
  if (typeof d.sourceType === 'string' && APPLICANT_PACK_SOURCE_TYPES.has(d.sourceType.toUpperCase())) {
    return true
  }
  const applicantLinked = Boolean(d.applicationId) || Boolean(d.applicantName)
  return applicantLinked && d.category !== 'Lease'
}

type PortalCollections = {
  leads: unknown[]
  applications: unknown[]
  viewings: unknown[]
  tenancies: unknown[]
  propertyDocuments: unknown[]
}

/**
 * Own-rows rule for portal roles (tenant, landlord, contractor) on the
 * collections that carry other people's contact details or files.
 *
 * Tenant (incl. a public applicant whose property entered scope by applying):
 * - leads: only leads under their own email
 * - applications: only their own (applicantUserId or email)
 * - viewings: only viewings booked under their email (or, when the viewing has
 *   no email, under their exact name)
 * - tenancies: only their own (tenantUserId, or an unlinked lease created from
 *   their own application)
 * - propertyDocuments: documents they uploaded, documents linked to their own
 *   application or tenancy (incl. the lease PDF), and non-pack Compliance
 *   documents on a property where they hold their own Active tenancy
 * - tickets: only tickets they reported (see filterBootstrapEntitiesForActor)
 *
 * Landlord (property scope = properties they own):
 * - leads / applications / viewings / tenancies on their own properties stay
 *   (owner portal landlord review, owner statement, rent roll, messaging a
 *   tenant on the book), with other people's email, phone, ID number,
 *   key-collection phone and application document files removed. Names and
 *   the document checklist status stay.
 * - propertyDocuments on their own properties, minus applicant-pack files.
 *
 * Contractor (property scope = properties with their jobs):
 * - no leads, applications, viewings or tenancies
 * - propertyDocuments: only documents they uploaded
 * - no payments; threads only where they are a participant (+ their messages)
 */
export function narrowPortalCollections(
  input: PortalCollections,
  actor: BootstrapActor,
  actorUser: { email?: string; name?: string } | undefined,
): PortalCollections {
  const role = actor.role
  if (role === 'contractor') {
    return {
      leads: [],
      applications: [],
      viewings: [],
      tenancies: [],
      propertyDocuments: (input.propertyDocuments as Row[]).filter(
        (d) => d.uploadedByUserId === actor.userId,
      ),
    }
  }
  if (role === 'landlord') {
    return {
      leads: (input.leads as Row[]).map(redactLeadContact),
      applications: (input.applications as Row[]).map(redactApplicationContact),
      viewings: (input.viewings as Row[]).map(redactViewingContact),
      tenancies: (input.tenancies as Row[]).map((t) =>
        t.tenantUserId === actor.userId ? t : redactTenancyContact(t),
      ),
      propertyDocuments: (input.propertyDocuments as Row[]).filter(
        (d) => d.uploadedByUserId === actor.userId || !isApplicantPackDocument(d),
      ),
    }
  }
  if (role !== 'tenant') return input

  const email = lc(actorUser?.email)
  const name = lc(actorUser?.name)
  const ownApps = (input.applications as Row[]).filter(
    (a) =>
      (Boolean(a.applicantUserId) && a.applicantUserId === actor.userId) ||
      (Boolean(email) && lc(a.email) === email),
  )
  const ownAppIds = new Set(ownApps.map((a) => a.id).filter((id): id is string => typeof id === 'string'))
  const ownTenancies = (input.tenancies as Row[]).filter(
    (t) =>
      (Boolean(t.tenantUserId) && t.tenantUserId === actor.userId) ||
      (!t.tenantUserId && typeof t.applicationId === 'string' && ownAppIds.has(t.applicationId)),
  )
  const ownTenancyIds = new Set(
    ownTenancies.map((t) => t.id).filter((id): id is string => typeof id === 'string'),
  )
  const leaseDocIds = new Set(
    ownTenancies
      .flatMap((t) => [t.leaseDocumentId, (t.eSign as Row | null | undefined)?.leaseDocumentId])
      .filter((id): id is string => typeof id === 'string' && Boolean(id)),
  )
  // Unit compliance documents only while the tenancy is Active (not Pending
  // Move-In, not Ended).
  const activeTenancyPropertyIds = new Set(
    ownTenancies.filter((t) => t.status === 'Active').map((t) => t.propertyId as string),
  )
  return {
    leads: (input.leads as Row[]).filter((l) => Boolean(email) && lc(l.email) === email),
    applications: ownApps,
    viewings: (input.viewings as Row[]).filter((v) => {
      const vEmail = lc(v.applicantEmail)
      if (vEmail) return Boolean(email) && vEmail === email
      return Boolean(name) && lc(v.applicantName) === name
    }),
    tenancies: ownTenancies,
    propertyDocuments: (input.propertyDocuments as Row[]).filter((d) => {
      if (d.uploadedByUserId === actor.userId) return true
      if (typeof d.applicationId === 'string' && ownAppIds.has(d.applicationId)) return true
      if (typeof d.tenancyId === 'string' && ownTenancyIds.has(d.tenancyId)) return true
      if (typeof d.id === 'string' && leaseDocIds.has(d.id)) return true
      return (
        d.category === 'Compliance' &&
        !isApplicantPackDocument(d) &&
        !d.tenancyId &&
        activeTenancyPropertyIds.has(d.propertyId as string)
      )
    }),
  }
}

/**
 * Filter a full bootstrap payload for an actor (super admin keeps everything).
 * Users are always narrowed + redacted for non-super-admins (see
 * filterBootstrapUsersForActor).
 */

/**
 * CR10 A: bootstrap returns `signature` for the session user only. Every other
 * user record loses it, for every role (super admin and agency admins too).
 */
export function stripOtherUsersSignatures(users: BootstrapUser[], selfId: string): BootstrapUser[] {
  return users.map((u) => {
    if (!u || u.id === selfId || !Object.prototype.hasOwnProperty.call(u, 'signature')) return u
    const { signature: _sig, ...rest } = u
    void _sig
    return rest as BootstrapUser
  })
}

/** Roles that never see the signer IP address or user agent (CR10: staff only). */
const NO_SIGN_DEVICE_ROLES: ReadonlySet<string> = new Set(['tenant', 'landlord', 'contractor'])

function stripSignDevice<T extends Record<string, unknown>>(row: T): T {
  const { ip: _ip, userAgent: _ua, ...rest } = row
  void _ip
  void _ua
  return rest as T
}

/**
 * CR10 B: lease_signed rows only for leases the actor already receives
 * (tenancy tenant / landlord, that agency's staff, super admin: the #80/#85
 * tenancy scope). IP and user agent go to staff only, on the audit rows and
 * on the eSign stamps of the leases.
 */
export function scopeLeaseSignReads(entities: BootstrapPayload, raw: BootstrapPayload, actor: BootstrapActor): BootstrapPayload {
  const tenancies = Array.isArray(entities.tenancies) ? (entities.tenancies as Row[]) : []
  const visible = new Set(tenancies.map((t) => String(t.id)))
  const portal = NO_SIGN_DEVICE_ROLES.has(actor.role)
  const events = (Array.isArray(raw.leaseSignEvents) ? (raw.leaseSignEvents as Row[]) : [])
    .filter((e) => {
      if (actor.role === 'super_admin') return true
      if (!visible.has(String(e.tenancyId))) return false
      // Agency staff: only their own agency's rows (no global cap; scope, not LIMIT).
      if (!portal) return Boolean(actor.agencyId) && (e.agencyId == null || e.agencyId === actor.agencyId)
      return true // tenancy parties: their own leases (visible set)
    })
    .map((e) => (portal ? stripSignDevice(e) : e))
  const out: BootstrapPayload = { ...entities, leaseSignEvents: events }
  if (portal && tenancies.length) {
    out.tenancies = tenancies.map((t) => {
      const e = t.eSign as Row | null | undefined
      if (!e || typeof e !== 'object') return t
      const fix = (b: unknown) => (b && typeof b === 'object' ? stripSignDevice(b as Row) : b)
      return { ...t, eSign: { ...e, tenant: fix(e.tenant), landlord: fix(e.landlord) } }
    }) as BootstrapPayload['tenancies']
  }
  return out
}

export function filterBootstrapForActor(
  raw: BootstrapPayload,
  actorIn: BootstrapActor,
  scope: PropertyScope,
  actorIds?: ReadonlySet<string>,
  /** CR7: effective users.manage (resolveActorUsersManage); role default when omitted. */
  opts?: { usersManage?: boolean },
): BootstrapPayload {
  // Session / header agency may be a client UUID; scope.viewer carries the FE id.
  const normalizedAgency = scope.viewer?.agencyId ?? actorIn.agencyId
  const actor =
    normalizedAgency !== actorIn.agencyId ? { ...actorIn, agencyId: normalizedAgency } : actorIn
  const entities = scopeLeaseSignReads(
    filterBootstrapEntitiesForActor(raw, actor, scope, actorIds ?? new Set([actor.userId]), opts),
    raw,
    actor,
  )
  if (actor.role === 'super_admin') {
    return Array.isArray(entities.users)
      ? { ...entities, users: stripOtherUsersSignatures(entities.users as BootstrapUser[], actor.userId) }
      : entities
  }
  const roster = Array.isArray(raw.agencyContractors)
    ? (raw.agencyContractors as Array<{ agencyId?: string | null; contractorUserId?: string }>).filter(
        (r) =>
          r.contractorUserId === actor.userId || (Boolean(actor.agencyId) && r.agencyId === actor.agencyId),
      )
    : raw.agencyContractors
  return {
    ...entities,
    users: stripOtherUsersSignatures(filterBootstrapUsersForActor(raw.users, actor, entities), actor.userId),
    ...(roster !== undefined ? { agencyContractors: roster } : {}),
  }
}

function filterBootstrapEntitiesForActor(
  raw: BootstrapPayload,
  actor: BootstrapActor,
  scope: PropertyScope,
  actorIds: ReadonlySet<string>,
  /** CR7: effective users.manage (resolveActorUsersManage); role default when omitted. */
  opts?: { usersManage?: boolean },
): BootstrapPayload {
  const agencyWide = isAgencyWideRole(actor.role as Role) || actor.role === 'super_admin'
  const scoped = !agencyWide

  // Users are narrowed + redacted by filterBootstrapForActor after this runs.
  // Agencies for super_admin stay full; others get their own agency only.
  let agencies = raw.agencies
  if (actor.role !== 'super_admin' && actor.agencyId) {
    agencies = raw.agencies.filter((a) => a.id === actor.agencyId)
  }

  if (!scoped) {
    // Agency-wide: filter property-linked entities to agency when not platform
    if (actor.role === 'super_admin') {
      return {
        ...raw,
        scoped: false,
        actor: { userId: actor.userId, role: actor.role, agencyId: actor.agencyId },
      }
    }
    const ag = actor.agencyId
    // No pass-through for agency-wide staff without an agency (B1).
    const inAg = (agencyId: string | null | undefined) => Boolean(ag) && agencyId === ag
    const props = raw.properties.filter((p) => inAg(p.agencyId))
    const propIds = new Set(props.map((p) => p.id))
    const buildingIds = new Set(
      raw.buildings.filter((b) => inAg(b.clientId)).map((b) => b.id),
    )
    return {
      ...raw,
      scoped: false,
      actor: { userId: actor.userId, role: actor.role, agencyId: actor.agencyId },
      agencies,
      properties: props,
      buildings: raw.buildings.filter((b) => inAg(b.clientId)),
      units: raw.units.filter(
        (u) => inAg(u.clientId) || (u.buildingId ? buildingIds.has(u.buildingId) : false),
      ),
      leads: raw.leads.filter((x) => inAg(x.agencyId)),
      applications: raw.applications.filter((x) => inAg(x.agencyId)),
      tenancies: raw.tenancies.filter((x) => inAg(x.agencyId)),
      viewings: raw.viewings.filter((x) => inAg(x.agencyId)),
      viewingSlots: (raw.viewingSlots ?? []).filter((x) => inAg(x.agencyId)),
      payments: raw.payments.filter((x) => inAg(x.agencyId)),
      propertyDocuments: raw.propertyDocuments.filter((x) => inAg(x.agencyId)),
      tickets: raw.tickets.filter((x) => inAg(x.agencyId)),
      threads: raw.threads.filter((x) => inAg(x.agencyId)),
      messages: raw.messages.filter((x) => inAg(x.agencyId)),
      notifications: raw.notifications.filter(
        (n) => n.userId === actor.userId || inAg(n.agencyId),
      ),
      // No null-agency pass-through: a platform alert with no agency is not
      // one agency's to read.
      suiteAlerts: (raw.suiteAlerts ?? []).filter((s) => s.agencyId != null && inAg(s.agencyId)),
      activities: (raw.activities ?? []).filter((a) => inAg(a.agencyId)),
      propertyEvents: (raw.propertyEvents ?? []).filter(
        (e) => inAg(e.agencyId) && (!e.propertyId || propIds.has(e.propertyId)),
      ),
      invoices: (raw.invoices ?? []).filter(
        (i) => inAg(i.agencyId) || inAg(i.clientId),
      ),
      // Trust books are agency-scoped financials (P0-7)
      trustTransactions: (raw.trustTransactions ?? []).filter((x) => inAg(x.agencyId)),
      trustAllocations: (raw.trustAllocations ?? []).filter((x) => inAg(x.agencyId)),
      payoutInstructions: (raw.payoutInstructions ?? []).filter((x) => inAg(x.agencyId)),
      depositHoldings: (raw.depositHoldings ?? []).filter((x) => inAg(x.agencyId)),
      arrearsSnapshots: (raw.arrearsSnapshots ?? []).filter((x) => inAg(x.agencyId)),
      csvImportBatches: (raw.csvImportBatches ?? []).filter((x) => inAg(x.agencyId)),
      // CR7: own submissions + this agency's desk; platform (null) stays super admin only.
      supportTickets: filterSupportTicketsForViewer(raw.supportTickets ?? [], {
        userId: actor.userId,
        role: actor.role as Role,
        agencyId: actor.agencyId,
        hasUsersManage: opts?.usersManage,
        aliasIds: actorIds,
      }),
    }
  }

  // Property-locked
  const allowed = scope.allowedPropertyIds
  const props = raw.properties.filter((p) => allowed.has(p.id))
  const propIds = new Set(props.map((p) => p.id))
  const buildingIds = new Set(
    props.map((p) => p.buildingId).filter((id): id is string => Boolean(id)),
  )

  const leads = raw.leads.filter((x) =>
    dealInScope(scope, { propertyId: x.propertyId, agentId: x.agentId, agencyId: x.agencyId }),
  )
  // Tenants keep own apps by applicant identity (no canSeeAgency) — mirrors client
  // Applications / TenantPortal filters. Null-agency public applicants must retain APP
  // after LiveSync bootstrap or the portal hangs empty after apply.
  const actorEmail =
    actor.role === 'tenant'
      ? (
          raw.users as Array<{ id?: string; email?: string }>
        ).find((u) => u.id === actor.userId)?.email?.toLowerCase()
      : undefined
  const applications = raw.applications.filter((x) => {
    if (actor.role === 'tenant') {
      if (x.applicantUserId && x.applicantUserId === actor.userId) return true
      if (actorEmail && x.email?.toLowerCase() === actorEmail) return true
      return false
    }
    return dealInScope(scope, {
      propertyId: x.propertyId,
      agentId: x.agentId,
      agencyId: x.agencyId,
    })
  })
  const viewings = raw.viewings.filter((x) =>
    dealInScope(scope, { propertyId: x.propertyId, agentId: x.agentId, agencyId: x.agencyId }),
  )
  const viewingSlots = (raw.viewingSlots ?? []).filter((x) =>
    dealInScope(scope, { propertyId: x.propertyId, agentId: x.agentId, agencyId: x.agencyId }),
  )
  const tenancies = raw.tenancies.filter((x) => allowed.has(x.propertyId))
  // Tenants: tickets they reported (any id form they carry, any tenancy
  // status) or tickets linked to one of their own Active / Notice tenancies.
  // Never by property or unit alone — applying to a listing puts it in a
  // tenant's book. Every ticket is reduced to the tenant view (no staff
  // notes, contractor, quote, cost or warranty fields); their own reports
  // also keep their access notes and photos.
  const ownTenancyIds =
    actor.role === 'tenant'
      ? tenantTicketTenancyIds(
          raw.tenancies as Array<{ id?: string; tenantUserId?: string | null; status?: string; leaseStatus?: string }>,
          (id) => actorIds.has(id),
        )
      : new Set<string>()
  const tickets =
    actor.role === 'tenant'
      ? raw.tickets
          .filter((t) => tenantSeesTicket(t as { reportedByUserId?: string | null; tenancyId?: string | null }, actorIds, ownTenancyIds))
          .map((t) => tenantTicketView(t as unknown as Record<string, unknown>, actorIds) as unknown as typeof t)
      : raw.tickets
          .filter((t) => ticketInScope(scope, t))
          .map((t) => staffTicketAccessNotes(t as unknown as Record<string, unknown>, actor.role, actorIds) as unknown as typeof t)
  const payments = raw.payments.filter((p) => {
    if (actor.role === 'tenant') {
      return p.partyUserId === actor.userId
    }
    // Contractors get no payment rows (their invoices are not payments).
    if (actor.role === 'contractor') return false
    if (actor.role === 'landlord') {
      return p.landlordVisible && allowed.has(p.propertyId)
    }
    return allowed.has(p.propertyId)
  })
  const propertyDocuments = raw.propertyDocuments.filter((d) => allowed.has(d.propertyId))
  const threads = raw.threads.filter((th) => {
    // Mode A: landlords/tenants/contractors see only threads where they are
    // participants (match client threadInScope).
    if (actor.role === 'landlord' || actor.role === 'tenant' || actor.role === 'contractor') {
      return th.participantIds.includes(actor.userId)
    }
    if (th.participantIds.includes(actor.userId)) return true
    if (!th.propertyId) return false
    return allowed.has(th.propertyId)
  })
  const threadIds = new Set(threads.map((t) => t.id as string))
  const messages = raw.messages.filter((m) => threadIds.has(m.threadId))
  const notifications = raw.notifications.filter((n) => n.userId === actor.userId)

  // Portal roles: own rows only in the collections that carry other people's
  // contact details or files (property scope alone is too wide — applying to a
  // listing puts that property in a tenant's scope).
  const portal = PORTAL_ROLES.has(actor.role)
    ? narrowPortalCollections(
        { leads, applications, viewings, tenancies, propertyDocuments },
        actor,
        (raw.users as Array<{ id?: string; email?: string; name?: string }>).find(
          (u) => u.id === actor.userId,
        ),
      )
    : null
  const ownAgency = actor.agencyId
  const noTrust = NO_TRUST_ROLES.has(actor.role)
  const trustRows = <T extends { agencyId?: string | null }>(rows: T[] | undefined): T[] =>
    noTrust || !ownAgency ? [] : (rows ?? []).filter((x) => x.agencyId === ownAgency)

  // Landlords (owner statement): trust allocations on their own tenancies and
  // payout instructions paying them on their own properties. Nothing else
  // from the trust books. Ids matched in every form the actor may carry.
  const isLandlord = actor.role === 'landlord'
  const mine = (id: unknown) => typeof id === 'string' && id !== '' && actorIds.has(id)
  // Agency comes from the property, never the session: a row passes only
  // with a non-null agencyId equal to its property's non-null agencyId.
  const ownPropertyAgency = new Map<string, string>(
    isLandlord
      ? (raw.properties as Array<{ id: string; landlordId?: string | null; agencyId?: string | null }>)
          .filter((p) => mine(p.landlordId) && Boolean(p.agencyId))
          .map((p) => [p.id, p.agencyId as string])
      : [],
  )
  const tenancyProperty = new Map<string, string>(
    isLandlord
      ? (raw.tenancies as Array<{ id: string; landlordId?: string | null; propertyId?: string }>)
          .filter((t) => mine(t.landlordId) && Boolean(t.propertyId) && ownPropertyAgency.has(t.propertyId!))
          .map((t) => [t.id, t.propertyId as string])
      : [],
  )
  const sameAgency = (rowAgency: unknown, propertyId: string | undefined) =>
    typeof rowAgency === 'string' &&
    rowAgency !== '' &&
    Boolean(propertyId) &&
    ownPropertyAgency.get(propertyId!) === rowAgency
  const landlordAllocations = isLandlord
    ? (raw.trustAllocations ?? []).filter((a) => {
        const r = a as { occupancyId?: string | null; agencyId?: string | null }
        return Boolean(r.occupancyId) && sameAgency(r.agencyId, tenancyProperty.get(r.occupancyId!))
      })
    : null
  const landlordPayouts = isLandlord
    ? (raw.payoutInstructions ?? []).filter((p) => {
        const r = p as { payeeType?: string; payeeId?: string; propertyId?: string; agencyId?: string | null }
        return r.payeeType === 'landlord' && mine(r.payeeId) && sameAgency(r.agencyId, r.propertyId)
      })
    : null

  return {
    ...raw,
    scoped: true,
    actor: { userId: actor.userId, role: actor.role, agencyId: actor.agencyId },
    agencies,
    properties: props,
    buildings: raw.buildings.filter(
      (b) => buildingIds.has(b.id) || (actor.agencyId ? b.clientId === actor.agencyId : false),
    ),
    units: raw.units.filter((u) => {
      const pid = u.id.startsWith('unt-') ? u.id.slice(4) : null
      return (pid && propIds.has(pid)) || (u.buildingId ? buildingIds.has(u.buildingId) : false)
    }),
    leads: (portal?.leads ?? leads) as BootstrapPayload['leads'],
    applications: (portal?.applications ?? applications) as BootstrapPayload['applications'],
    tenancies: (portal?.tenancies ?? tenancies) as BootstrapPayload['tenancies'],
    viewings: (portal?.viewings ?? viewings) as BootstrapPayload['viewings'],
    viewingSlots,
    payments,
    propertyDocuments: (portal?.propertyDocuments ??
      propertyDocuments) as BootstrapPayload['propertyDocuments'],
    tickets,
    threads,
    messages,
    notifications,
    // No null-agency pass-through (B1): a no-agency actor gets none of these.
    suiteAlerts: (raw.suiteAlerts ?? []).filter(
      (s) => Boolean(ownAgency) && s.agencyId === ownAgency,
    ),
    activities: (raw.activities ?? []).filter(
      (a) => Boolean(ownAgency) && a.agencyId === ownAgency,
    ),
    propertyEvents: (raw.propertyEvents ?? []).filter(
      (e) => e.propertyId && propIds.has(e.propertyId),
    ),
    invoices: [],
    // Trust books (B1): tenants, contractors and field agents get none;
    // landlords only the allocation / payout rows above (never transactions,
    // deposits, arrears or CSV batches); everyone else only their own
    // agency's rows, never a null-agency pass-through.
    trustTransactions: trustRows(raw.trustTransactions),
    trustAllocations: landlordAllocations ?? trustRows(raw.trustAllocations),
    payoutInstructions: landlordPayouts ?? trustRows(raw.payoutInstructions),
    depositHoldings: trustRows(raw.depositHoldings),
    arrearsSnapshots: trustRows(raw.arrearsSnapshots),
    csvImportBatches: trustRows(raw.csvImportBatches),
    // CR7: property-locked roles never hold the desk — own submissions only,
    // matched through the round-trip actorIds (never email).
    supportTickets: (raw.supportTickets ?? []).filter((t) => actorIds.has(t.submittedByUserId)),
  }
}

/**
 * Access notes (gate codes, pets) go to staff, the ticket's assigned
 * contractor and the tenant who reported it (tenantTicketView). Everyone else
 * in scope (landlords, other contractors) gets them stripped.
 */
export function staffTicketAccessNotes<T extends Record<string, unknown>>(
  t: T,
  role: string,
  actorIds: ReadonlySet<string>,
): T {
  if (!('accessNotes' in t)) return t
  if (isStaffRole(role)) return t
  const contractor = t.contractorId
  if (role === 'contractor' && typeof contractor === 'string' && contractor !== '' && actorIds.has(contractor)) return t
  const { accessNotes: _drop, ...rest } = t
  return rest as unknown as T
}
