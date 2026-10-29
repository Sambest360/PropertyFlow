/**
 * CR10: the ONE server sign function (Jim's sign-off B + spec §2, §5, §6).
 *
 * Every lease signing goes through stampLeaseSignature: the portal tenancy
 * write (tenant / landlord signing their own block) and the staff tenancy
 * write (landlord block on behalf, or paper mark-signed). It:
 *  - takes the signer from the session actor, never from the payload;
 *  - tenant block: only the lease's tenant, else 403 SIGNATURE_NOT_SIGNER
 *    (staff may only paper mark-signed it, method paper_mark, no image);
 *  - landlord block: the landlord, or staff of the lease's agency on behalf
 *    with the mandate confirmation ticked (else 403 SIGNATURE_ON_BEHALF_UNCONFIRMED);
 *    staff draw (never a saved image);
 *  - validates the image (PNG data URL <= 150 KB, else 400 SIGNATURE_INVALID);
 *  - saved_image: sha256 must match the actor's own stored signature, else
 *    403 SIGNATURE_NOT_OWN;
 *  - stamps server time, signer uuid, method, on_behalf, image hash, IP and
 *    user agent; recomputes the envelope status (forward only: a signed block
 *    is never replaced);
 *  - writes the lease UPDATE and exactly one event_log `lease_signed` row in
 *    one transaction (nothing on refusal or failure).
 */
import { createHash, randomUUID } from 'node:crypto'
import { afterCommit, clientQuery, query, withTransaction } from './db.js'
import { resolveUuid } from './entityMap.js'
import type { DemoActor } from './actor.js'
import { isValidSignatureDataUrl, signatureInvalidError } from '../src/lib/signature/signatureImage.js'

export type SignMethod = 'drawn' | 'saved_image' | 'paper_mark'
export type SignPartyKey = 'tenant' | 'landlord'

export const SIGN_METHODS: ReadonlySet<string> = new Set(['drawn', 'saved_image', 'paper_mark'])
export const SIGN_PARTY_STATUSES: ReadonlySet<string> = new Set(['pending', 'signed', 'declined'])

/** Agency staff who may sign the landlord block on behalf, or paper mark-signed. */
export const SIGN_STAFF_ROLES: ReadonlySet<string> = new Set(['client_admin', 'agent_admin', 'agent', 'ground_agent'])

/** The mandate line staff tick before signing for a landlord (shown in the dialog). */
export function onBehalfConfirmationText(landlordName: string): string {
  return `I am signing for ${landlordName} under the agency's mandate.`
}

export type LeaseSignRow = {
  id: string
  client_id: string | null
  tenant_id: string | null
  landlord_id: string | null
  metadata: Record<string, unknown> | null
}

export type RequestMeta = { ip?: string | null; userAgent?: string | null }

type Row = Record<string, unknown>
const asRow = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null)

/** Overall envelope status from the two parties (never taken from the client). */
export function envelopeStatus(prev: string, tenant: Row | null | undefined, landlord: Row | null | undefined): string {
  const t = String(tenant?.status ?? 'pending')
  const l = String(landlord?.status ?? 'pending')
  if (t === 'declined' || l === 'declined') return 'declined'
  const done = (s: string) => s === 'signed' || s === 'waived'
  if (done(t) && done(l)) return 'completed' // #80: both parties, as on main
  if (done(t) || done(l)) return 'partially_signed'
  return prev
}

export function sha256Hex(v: string): string {
  return createHash('sha256').update(v, 'utf8').digest('hex')
}

export function signError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code })
}

export async function loadLeaseForSign(leaseUuid: string): Promise<LeaseSignRow | null> {
  const rows = await query<LeaseSignRow>(
    `SELECT id::text AS id, client_id::text AS client_id, tenant_id::text AS tenant_id,
            landlord_id::text AS landlord_id, metadata
       FROM leases WHERE id = $1::uuid`,
    [leaseUuid],
  )
  return rows[0] ?? null
}

async function actorStoredSignature(actorUuid: string): Promise<string | null> {
  const rows = await query<{ metadata: Row | null }>(`SELECT metadata FROM users WHERE id = $1::uuid`, [actorUuid])
  const s = rows[0]?.metadata?.signature
  return typeof s === 'string' ? s : null
}

/** True when the sent party block asks for a change against the stored one. */
export function partyChanged(stored: Row | null | undefined, sent: Row | null | undefined): boolean {
  if (!sent) return false
  const keys = ['status', 'signedAt', 'signerName', 'signatureDataUrl', 'method', 'onBehalf']
  return keys.some((k) => (sent[k] ?? null) !== (stored?.[k] ?? null))
}

export type StampInput = {
  actor: DemoActor
  tenancyFeId: string
  lease: LeaseSignRow
  party: SignPartyKey
  /** The party block the client sent (only status, signerName, image, method, confirmation are read). */
  sent: Row
  meta?: RequestMeta
}

export type StampResult = {
  /** The eSign now stored on the lease. */
  eSign: Row
  /** CR10 N3: id of the lease_signed row this stamp wrote (null: none). */
  eventId?: string | null
  /** True when a signing was accepted and recorded (one lease_signed row). */
  signed: boolean
  /** True when this signing completed the envelope (first time). */
  completedNow: boolean
}

export async function stampLeaseSignature(input: StampInput): Promise<StampResult> {
  const { actor, lease, party, sent } = input
  const stored = asRow(lease.metadata?.eSign)
  if (!stored || !stored.envelopeId) {
    throw signError(403, 'SIGNATURE_NO_ENVELOPE', 'This lease has no signing envelope yet. Issue the lease first.')
  }
  const storedParty = asRow(stored[party])
  if (party === 'landlord' && !storedParty) {
    throw signError(403, 'SIGNATURE_NOT_SIGNER', 'This lease has no landlord signature block.')
  }
  // Forward only: a signed (or declined) block is never replaced.
  if (storedParty && (storedParty.status === 'signed' || storedParty.status === 'declined')) {
    return { eSign: stored, signed: false, completedNow: false }
  }
  const status = String(sent.status ?? '')
  if (!SIGN_PARTY_STATUSES.has(status)) throw signatureInvalidError('missing or invalid signature status')
  if (status === 'pending') return { eSign: stored, signed: false, completedNow: false }

  const actorUuid = await resolveUuid('user', actor.userId)
  if (!actorUuid) throw signError(403, 'SIGNATURE_NOT_SIGNER', 'Signer is not a known user.')
  const actorClient = actor.agencyId ? await resolveUuid('agency', actor.agencyId) : null
  const isLeaseStaff =
    SIGN_STAFF_ROLES.has(actor.role) && Boolean(actorClient) && actorClient === lease.client_id
  // CR10 B2b: the uuid match alone is not enough — the actor's role must be
  // that party's role (staff or super admin set as tenant_id never qualify).
  const isParty =
    party === 'tenant'
      ? actor.role === 'tenant' && lease.tenant_id === actorUuid
      : actor.role === 'landlord' && lease.landlord_id === actorUuid

  const method = String(sent.method ?? '')
  if (!SIGN_METHODS.has(method)) throw signatureInvalidError('signature method must be drawn, saved_image or paper_mark')

  let onBehalf = false
  if (!isParty) {
    if (!isLeaseStaff) throw signError(403, 'SIGNATURE_NOT_SIGNER', `Only the ${party} can sign this part of the lease.`)
    if (party === 'tenant' && method !== 'paper_mark') {
      throw signError(403, 'SIGNATURE_NOT_SIGNER', 'Only the tenant can sign the tenant part of the lease.')
    }
    onBehalf = true
  }
  if (method === 'paper_mark' && !isLeaseStaff) {
    throw signError(403, 'SIGNATURE_NOT_SIGNER', 'Only agency staff can mark a paper lease as signed.')
  }
  if (onBehalf && method === 'saved_image') {
    throw signError(403, 'SIGNATURE_NOT_OWN', 'Signing on behalf needs a newly drawn signature.')
  }

  let confirmation: string | null = null
  if (onBehalf && party === 'landlord') {
    const c = typeof sent.onBehalfConfirmation === 'string' ? sent.onBehalfConfirmation.trim() : ''
    if (!c) {
      throw signError(
        403,
        'SIGNATURE_ON_BEHALF_UNCONFIRMED',
        "Tick the confirmation that you are signing for the landlord under the agency's mandate.",
      )
    }
    confirmation = c.slice(0, 300)
  }

  let image: string | null = null
  let imageSha256: string | null = null
  if (status === 'signed' && method !== 'paper_mark') {
    if (!isValidSignatureDataUrl(sent.signatureDataUrl)) throw signatureInvalidError()
    image = sent.signatureDataUrl
    imageSha256 = sha256Hex(image)
    if (method === 'saved_image') {
      const own = await actorStoredSignature(actorUuid)
      if (!own || sha256Hex(own) !== imageSha256) {
        throw signError(403, 'SIGNATURE_NOT_OWN', 'A saved signature must be your own.')
      }
    }
  }

  const at = new Date().toISOString()
  const ip = input.meta?.ip ? String(input.meta.ip).slice(0, 64) : null
  const userAgent = input.meta?.userAgent ? String(input.meta.userAgent).slice(0, 200) : null
  const signerName = typeof sent.signerName === 'string' ? sent.signerName.slice(0, 120) : undefined
  const nextParty: Row = {
    status,
    signedAt: at,
    ...(signerName ? { signerName } : {}),
    ...(image ? { signatureDataUrl: image } : {}),
    signerUserId: actor.userId,
    signerRole: actor.role,
    method,
    onBehalf,
    imageSha256,
    ...(confirmation ? { onBehalfConfirmation: confirmation } : {}),
    ...(ip ? { ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  }
  // CR10 gate blocker 1: the merge is built from the eSign read under the
  // FOR UPDATE lock (inside the transaction), never from the pre-lock copy.
  const buildMerge = (base: Row) => {
    const other: SignPartyKey = party === 'tenant' ? 'landlord' : 'tenant'
    const m: Row = { ...base, [party]: nextParty, [other]: base[other] ?? null }
    m.status = envelopeStatus(String(base.status ?? 'sent'), asRow(m.tenant), asRow(m.landlord))
    const done = m.status === 'completed' && base.status !== 'completed'
    // Part 8: once per envelope. The sent flag is set in the same UPDATE that
    // reaches completed; a later write never sends again.
    const send = done && !base.completedEmailSentAt
    if (send) m.completedEmailSentAt = at
    return { m, done, send }
  }
  let { m: merged, done: completedNow, send: sendCompletedEmail } = buildMerge(stored)

  const accepted = status === 'signed'
  // CR10 N7: a paper decline is a recorded outcome too — it writes its audit row.
  const auditDecline = status === 'declined' && method === 'paper_mark'
  let eventId: string | null = null
  await withTransaction(async (client) => {
    // CR10 N1: lock the lease row for this signing and re-check the stored
    // envelope / party block under the lock (two signings can't both land).
    const lockedRows = await clientQuery<{ metadata: Record<string, unknown> | null }>(
      client,
      `SELECT metadata FROM leases WHERE id = $1::uuid FOR UPDATE`,
      [lease.id],
    )
    const lockedESign = asRow(lockedRows[0]?.metadata?.eSign)
    const lockedParty = asRow(lockedESign?.[party])
    if (
      !lockedESign ||
      String(lockedESign.envelopeId ?? '') !== String(stored.envelopeId ?? '') ||
      (lockedParty && (lockedParty.status === 'signed' || lockedParty.status === 'declined'))
    ) {
      throw signError(409, 'SIGNATURE_CONFLICT', 'The lease changed while signing. Refresh and try again.')
    }
    ;({ m: merged, done: completedNow, send: sendCompletedEmail } = buildMerge(lockedESign))
    await clientQuery(
      client,
      `UPDATE leases
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('eSign', $2::jsonb),
              updated_at = NOW()
        WHERE id = $1::uuid`,
      [lease.id, JSON.stringify(merged)],
    )
    if (accepted || auditDecline) {
      eventId = await insertLeaseSignedEvent(client, {
        outcome: accepted ? 'signed' : 'declined',
        lease,
        tenancyFeId: input.tenancyFeId,
        envelopeId: String(stored.envelopeId),
        party,
        actorUuid,
        role: actor.role,
        method: method as SignMethod,
        onBehalf,
        imageSha256,
        confirmation,
        at,
        ip,
        userAgent,
      })
    }
  })
  if (sendCompletedEmail) {
    // CR10 N3: best effort, only after the OUTER commit (the stamp may run
    // inside the persist transaction; on rollback the hook never runs).
    afterCommit(() => notifyLeaseCompleted(lease, input.tenancyFeId).catch(() => undefined))
  }
  return { eSign: merged, signed: accepted, completedNow, eventId }
}

/** Part 8: "signed by all parties" email to the tenant and the landlord (or the lease's agent). */
/** In-app notice to the tenant, landlord and agent that every party has signed (also emailed by the mailer). */
async function notifyLeaseCompletedInApp(lease: LeaseSignRow, tenancyFeId: string): Promise<void> {
  try {
    const rows = await query<{ client_id: string | null; tenant_id: string | null; landlord_id: string | null; agent_id: string | null; title: string | null }>(
      `SELECT l.client_id::text AS client_id, l.tenant_id::text AS tenant_id, l.landlord_id::text AS landlord_id,
              l.agent_id::text AS agent_id, COALESCE(un.title, un.unit_number::text) AS title
         FROM leases l LEFT JOIN units un ON un.id = l.unit_id WHERE l.id = $1::uuid`,
      [lease.id],
    )
    const r = rows[0]
    if (!r) return
    const { notifyUsers } = await import('./supportDesk.js')
    const title = 'Lease signed by everyone'
    const body = `The lease for ${r.title || 'the property'} is now signed by all parties. You can view and download it.`
    if (r.tenant_id) {
      await notifyUsers([r.tenant_id], { clientId: r.client_id, title, body, link: '/workspace/portals/tenant/leases', resource: 'lease', action: 'updated' })
    }
    await notifyUsers([r.landlord_id, r.agent_id], {
      clientId: r.client_id,
      title,
      body,
      link: `/workspace/people/leases?lease=${encodeURIComponent(tenancyFeId)}`,
      resource: 'lease',
      action: 'updated',
    }, r.tenant_id)
  } catch (err) {
    console.warn('[lease-signed] in-app notice failed:', err instanceof Error ? err.message : err)
  }
}

export async function notifyLeaseCompleted(lease: LeaseSignRow, tenancyFeId: string): Promise<number> {
  await notifyLeaseCompletedInApp(lease, tenancyFeId)
  const { isEmailLeaseSignedEnabled, sendLeaseSignedEmail } = await import('./mailtrap.js')
  if (!isEmailLeaseSignedEnabled()) return 0
  try {
    const rows = await query<{
      tenant_email: string | null
      tenant_name: string | null
      landlord_email: string | null
      landlord_name: string | null
      agent_email: string | null
      agent_name: string | null
      property_title: string | null
    }>(
      `SELECT t.email AS tenant_email, NULLIF(TRIM(CONCAT_WS(' ', t.first_name, t.last_name)), '') AS tenant_name,
              ll.email AS landlord_email, NULLIF(TRIM(CONCAT_WS(' ', ll.first_name, ll.last_name)), '') AS landlord_name,
              ag.email AS agent_email, NULLIF(TRIM(CONCAT_WS(' ', ag.first_name, ag.last_name)), '') AS agent_name,
              COALESCE(un.title, un.unit_number::text) AS property_title
         FROM leases l
         LEFT JOIN users t ON t.id = l.tenant_id
         LEFT JOIN users ll ON ll.id = l.landlord_id
         LEFT JOIN users ag ON ag.id = l.agent_id
         LEFT JOIN units un ON un.id = l.unit_id
        WHERE l.id = $1::uuid`,
      [lease.id],
    )
    const r = rows[0]
    if (!r) return 0
    const base = (process.env.PUBLIC_APP_URL || process.env.PAYFAST_PUBLIC_URL || '').replace(/\/+$/, '')
    // CR10 N8: no absolute base URL, no email (never a relative link).
    if (!/^https?:\/\/[^/]/.test(base)) {
      console.warn('[lease-signed email] skipped: no absolute PUBLIC_APP_URL / PAYFAST_PUBLIC_URL', { tenancyFeId })
      return 0
    }
    const leaseLink = `${base}/workspace/people/leases?lease=${encodeURIComponent(tenancyFeId)}`
    const propertyTitle = r.property_title || 'your property'
    const to: Array<{ email: string; name: string | null }> = []
    if (r.tenant_email) to.push({ email: r.tenant_email, name: r.tenant_name })
    if (r.landlord_email) to.push({ email: r.landlord_email, name: r.landlord_name })
    else if (r.agent_email) to.push({ email: r.agent_email, name: r.agent_name })
    let sent = 0
    for (const x of to) {
      try {
        const res = await sendLeaseSignedEmail({ to: x.email, name: x.name, propertyTitle, leaseLink })
        if (res.sent) sent++
      } catch {
        /* best effort */
      }
    }
    return sent
  } catch {
    return 0
  }
}

export type LeaseSignedPayload = {
  tenancyId: string
  leaseId: string
  envelopeId: string
  party: SignPartyKey
  actorUserId: string
  role: string
  method: SignMethod
  on_behalf: boolean
  image_sha256: string | null
  on_behalf_confirmation: string | null
  signed_at: string
  ip: string | null
  user_agent: string | null
  /** CR10 N7: 'signed' (default) or 'declined' (paper decline, still audited). */
  outcome?: 'signed' | 'declined'
}

/** Event type of the server-written signing audit row. Clients can never persist it. */
export const LEASE_SIGNED_EVENT = 'lease_signed'

/** True when a persist body tries to write a lease_signed row (refused in both policies). */
export function isClientLeaseSignedWrite(body: { resource?: unknown; data?: Record<string, unknown> | undefined }): boolean {
  if (String(body.resource ?? '') === LEASE_SIGNED_EVENT) return true
  const d = body.data ?? {}
  return [d.event_type, d.eventType, d.type, d.action, d.kind].some((v) => v === LEASE_SIGNED_EVENT)
}

export function leaseSignedRefusedError(): Error & { status: number; code: string } {
  return signError(403, 'LEASE_SIGNED_SERVER_ONLY', 'lease_signed audit rows are written by the server only')
}

/** The lease_signed audit row, in the caller's transaction. Never the image. */
async function insertLeaseSignedEvent(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  e: {
    lease: LeaseSignRow
    tenancyFeId: string
    envelopeId: string
    party: SignPartyKey
    actorUuid: string
    role: string
    method: SignMethod
    onBehalf: boolean
    imageSha256: string | null
    confirmation: string | null
    at: string
    ip: string | null
    userAgent: string | null
    outcome?: 'signed' | 'declined'
  },
): Promise<string> {
  const payload: LeaseSignedPayload = {
    tenancyId: e.tenancyFeId,
    leaseId: e.lease.id,
    envelopeId: e.envelopeId,
    party: e.party,
    actorUserId: e.actorUuid,
    role: e.role,
    method: e.method,
    on_behalf: e.onBehalf,
    image_sha256: e.imageSha256,
    on_behalf_confirmation: e.confirmation,
    signed_at: e.at,
    ip: e.ip,
    user_agent: e.userAgent,
    outcome: e.outcome ?? 'signed',
  }
  const eventId = randomUUID()
  await clientQuery(
    client,
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2::uuid, 'lease_signed', 'lease', $3::uuid, $4::uuid, $5::jsonb, NOW())`,
    [eventId, e.lease.client_id, e.lease.id, e.actorUuid, JSON.stringify(payload)],
  )
  return eventId
}

const PARTY_KEYS: SignPartyKey[] = ['tenant', 'landlord']

/** CR10 N5: drop the server-owned signed copy fields from client eSign data. */
export function stripClientSignedCopy(eSign: Row): Row {
  const { signedPdfUrl: _u, signedPdfDocumentId: _d, ...rest } = eSign
  void _u
  void _d
  return rest
}


function pendingBlock(b: unknown): Row | null {
  return b == null ? null : { status: 'pending' }
}

/**
 * Staff (non-portal) tenancy write: the eSign party blocks can no longer be
 * written wholesale. Mutates body.data.eSign so the generic upsert stores:
 *  - a new lease / a new envelope: party blocks reset to pending (an issued
 *    envelope is never pre-signed);
 *  - the same envelope: each changed party block goes through
 *    stampLeaseSignature (or is refused); unchanged / already signed blocks
 *    are the stored ones; the status is the server's;
 *  - no eSign in the payload: the stored eSign is kept.
 * An envelope with any signed block cannot be replaced by a new one.
 */
export async function enforceStaffTenancyESign(
  actor: DemoActor,
  body: { id: string; action: string; data?: Record<string, unknown>; requestMeta?: RequestMeta},
): Promise<void> {
  // CR10 B1: early return on delete only; any other action is gated as an upsert.
  if (body.action === 'delete') return
  const data = (body.data ?? {}) as Row
  const leaseUuid = await resolveUuid('tenancy', body.id)
  const lease = leaseUuid ? await loadLeaseForSign(leaseUuid) : null
  const stored = asRow(lease?.metadata?.eSign)
  const hasSent = Object.prototype.hasOwnProperty.call(data, 'eSign') && data.eSign !== undefined
  if (!hasSent) {
    if (stored) data.eSign = stored
    return
  }
  const sentRaw = asRow(data.eSign)
  // CR10 N5: the signed copy fields are server-owned; a client never sets them.
  const sent = sentRaw ? stripClientSignedCopy(sentRaw) : null
  if (!sent) {
    if (stored) data.eSign = stored // never wiped by a staff save
    return
  }
  if (!lease || !stored || !stored.envelopeId || sent.envelopeId !== stored.envelopeId) {
    const anySigned = PARTY_KEYS.some((k) => String(asRow(stored?.[k])?.status ?? '') === 'signed')
    if (stored?.envelopeId && (stored.status === 'completed' || stored.status === 'partially_signed' || anySigned)) {
      throw signError(403, 'SIGNATURE_ENVELOPE_LOCKED', 'A signed envelope cannot be replaced.')
    }
    const fresh: Row = { ...sent, tenant: pendingBlock(sent.tenant ?? {}), landlord: pendingBlock(sent.landlord) }
    const st = String(sent.status ?? 'sent')
    fresh.status = ['partially_signed', 'completed', 'declined'].includes(st) ? 'sent' : st
    delete fresh.completedEmailSentAt
    data.eSign = fresh
    return
  }
  let current: Row = stored
  let row: LeaseSignRow = lease
  for (const party of PARTY_KEYS) {
    const sentParty = asRow(sent[party])
    if (!partyChanged(asRow(current[party]), sentParty) || !sentParty) continue
    const res = await stampLeaseSignature({
      actor,
      tenancyFeId: body.id,
      lease: row,
      party,
      sent: sentParty,
      meta: body.requestMeta,
    })
    current = res.eSign
    row = { ...row, metadata: { ...(row.metadata ?? {}), eSign: current } }
  }
  // Non-party fields (events, note, pdfUrl) as sent; party blocks, status,
  // envelope and server flags always the stored / stamped ones.
  data.eSign = {
    ...sent,
    envelopeId: current.envelopeId,
    provider: current.provider ?? sent.provider,
    tenant: current.tenant ?? null,
    landlord: current.landlord ?? null,
    status: current.status,
    ...(current.completedEmailSentAt ? { completedEmailSentAt: current.completedEmailSentAt } : {}),
    ...(typeof current.signedPdfUrl === 'string' ? { signedPdfUrl: current.signedPdfUrl } : {}),
    ...(typeof current.signedPdfDocumentId === 'string' ? { signedPdfDocumentId: current.signedPdfDocumentId } : {}),
  }
}
