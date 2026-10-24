/**
 * Postgres ScreeningStore (migration 028). Inline SQL like listingLimits.ts.
 * Runs on DATABASE_URL (bypasses RLS); access is enforced in screeningChecks.ts.
 * Never log rows from here: they carry sealed results and subject details.
 */
import { query, withTransaction } from './db.js'
import { isUuid, resolveFrontendId, resolveUuid } from './entityMap.js'
import type { DemoActor } from './actor.js'
import {
  screeningLineItem,
  type ApplicationRow,
  type AuditInsert,
  type ChargeInsert,
  type CheckRow,
  type ConsentRow,
  type PriceRow,
  type ScreeningCheckStatus,
  type ScreeningCheckType,
  type ScreeningStore,
  type UsageRow,
} from './screeningChecks.js'

type Raw = Record<string, unknown>

const CHECK_COLS = `id::text AS id, client_id::text AS client_id, application_id::text AS application_id,
  consent_id::text AS consent_id, check_type, provider, provider_ref, status, result_summary,
  result_encrypted, result_key_id, retain_until, purged_at, attempt,
  previous_check_id::text AS previous_check_id, requested_by::text AS requested_by, requested_at, completed_at`

const CONSENT_COLS = `id::text AS id, client_id::text AS client_id, application_id::text AS application_id,
  subject_user_id::text AS subject_user_id, subject_name, subject_id_last4, subject_id_encrypted,
  subject_id_key_id, check_types, consent_text_version, consent_text_hash, typed_name, accepted_at,
  expires_at, ip, user_agent, withdrawn_at`

function date(v: unknown): Date | null {
  if (v == null) return null
  return v instanceof Date ? v : new Date(String(v))
}

function checkFrom(r: Raw): CheckRow {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    applicationId: (r.application_id as string | null) ?? null,
    consentId: String(r.consent_id),
    checkType: r.check_type as ScreeningCheckType,
    provider: String(r.provider),
    providerRef: (r.provider_ref as string | null) ?? null,
    status: r.status as ScreeningCheckStatus,
    resultSummary: (r.result_summary as Record<string, unknown>) ?? {},
    resultEncrypted: (r.result_encrypted as Buffer | null) ?? null,
    resultKeyId: (r.result_key_id as string | null) ?? null,
    retainUntil: date(r.retain_until),
    purgedAt: date(r.purged_at),
    attempt: Number(r.attempt ?? 1),
    previousCheckId: (r.previous_check_id as string | null) ?? null,
    requestedBy: (r.requested_by as string | null) ?? null,
    requestedAt: date(r.requested_at) ?? new Date(),
    completedAt: date(r.completed_at),
  }
}

function consentFrom(r: Raw): ConsentRow {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    applicationId: (r.application_id as string | null) ?? null,
    subjectUserId: (r.subject_user_id as string | null) ?? null,
    subjectName: String(r.subject_name),
    subjectIdLast4: (r.subject_id_last4 as string | null) ?? null,
    subjectIdEncrypted: (r.subject_id_encrypted as Buffer | null) ?? null,
    subjectIdKeyId: (r.subject_id_key_id as string | null) ?? null,
    checkTypes: (r.check_types as ScreeningCheckType[]) ?? [],
    consentTextVersion: String(r.consent_text_version),
    consentTextHash: String(r.consent_text_hash),
    typedName: String(r.typed_name),
    acceptedAt: date(r.accepted_at) ?? new Date(),
    expiresAt: date(r.expires_at) ?? new Date(),
    ip: (r.ip as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
    withdrawnAt: date(r.withdrawn_at),
  }
}

/** CheckRow field -> column (+ cast). */
const CHECK_PATCH_COLUMNS: Partial<Record<keyof CheckRow, string>> = {
  providerRef: 'provider_ref',
  status: 'status',
  resultSummary: 'result_summary',
  resultEncrypted: 'result_encrypted',
  resultKeyId: 'result_key_id',
  retainUntil: 'retain_until',
  purgedAt: 'purged_at',
  completedAt: 'completed_at',
}

async function uuidOf(type: 'user' | 'agency' | 'application', ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null
  const mapped = await resolveUuid(type, ref)
  if (mapped) return mapped
  return isUuid(ref) ? ref : null
}

export const pgScreeningStore: ScreeningStore = {
  tx: (fn) => withTransaction(fn),

  async resolveActor(actor: DemoActor) {
    const userUuid = await uuidOf('user', actor.userId)
    let clientUuid = actor.agencyId ? await uuidOf('agency', actor.agencyId) : null
    if (!clientUuid && userUuid) {
      const rows = await query<{ client_id: string | null }>(
        `SELECT client_id::text AS client_id FROM users WHERE id = $1::uuid -- screening_actor`,
        [userUuid],
      )
      clientUuid = rows[0]?.client_id ?? null
    }
    return { userUuid, clientUuid }
  },

  async resolveClient(ref) {
    const id = await uuidOf('agency', ref)
    if (!id) return null
    const rows = await query<{ id: string }>(`SELECT id::text AS id FROM clients WHERE id = $1::uuid`, [id])
    return rows[0]?.id ?? null
  },

  async loadApplication(ref) {
    const id = await uuidOf('application', ref)
    if (!id) return null
    const rows = await query<Raw>(
      `SELECT a.id::text AS id, a.client_id::text AS client_id, a.applicant_id::text AS applicant_id,
              a.agent_id::text AS agent_id, a.id_number_or_passport, a.metadata->>'applicantName' AS meta_name,
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS user_name,
              b.landlord_id::text AS landlord_id, c.company_name, c.settings
         FROM applications a
         JOIN clients c ON c.id = a.client_id
         LEFT JOIN users u ON u.id = a.applicant_id
         LEFT JOIN units un ON un.id = a.unit_id
         LEFT JOIN buildings b ON b.id = un.building_id
        WHERE a.id = $1::uuid -- screening_application`,
      [id],
    )
    const r = rows[0]
    if (!r) return null
    const row: ApplicationRow = {
      id: String(r.id),
      ref,
      clientId: String(r.client_id),
      agencyName: String(r.company_name ?? 'the agency'),
      agencySettings: r.settings ?? {},
      applicantUserId: (r.applicant_id as string | null) ?? null,
      applicantName: String(r.meta_name || r.user_name || 'Applicant'),
      agentId: (r.agent_id as string | null) ?? null,
      landlordUserId: (r.landlord_id as string | null) ?? null,
      idNumber: (r.id_number_or_passport as string | null) ?? null,
    }
    return row
  },

  async agencySettings(clientId) {
    const rows = await query<{ settings: unknown }>(`SELECT settings FROM clients WHERE id = $1::uuid`, [clientId])
    return rows[0]?.settings ?? {}
  },

  async saveAgencyScreeningSettings(clientId, settings) {
    await query(
      `UPDATE clients
          SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('screening', $2::jsonb),
              updated_at = NOW()
        WHERE id = $1::uuid`,
      [clientId, JSON.stringify(settings)],
    )
  },

  async insertConsent(c) {
    const rows = await query<Raw>(
      `INSERT INTO screening_consents (
         client_id, application_id, subject_user_id, subject_name, subject_id_last4, subject_id_encrypted,
         subject_id_key_id, check_types, consent_text_version, consent_text_hash, typed_name, accepted_at,
         expires_at, ip, user_agent
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${CONSENT_COLS}`,
      [
        c.clientId, c.applicationId, c.subjectUserId, c.subjectName, c.subjectIdLast4, c.subjectIdEncrypted,
        c.subjectIdKeyId, c.checkTypes, c.consentTextVersion, c.consentTextHash, c.typedName, c.acceptedAt,
        c.expiresAt, c.ip, c.userAgent,
      ],
    )
    return consentFrom(rows[0])
  },

  async getConsent(id) {
    if (!isUuid(id)) return null
    const rows = await query<Raw>(`SELECT ${CONSENT_COLS} FROM screening_consents WHERE id = $1::uuid`, [id])
    return rows[0] ? consentFrom(rows[0]) : null
  },

  async listConsents(applicationId) {
    const rows = await query<Raw>(
      `SELECT ${CONSENT_COLS} FROM screening_consents WHERE application_id = $1::uuid ORDER BY accepted_at DESC`,
      [applicationId],
    )
    return rows.map(consentFrom)
  },

  async withdrawConsent(id, at) {
    const rows = await query<{ id: string }>(
      `UPDATE screening_consents SET withdrawn_at = $2 WHERE id = $1::uuid AND withdrawn_at IS NULL RETURNING id::text AS id`,
      [id, at],
    )
    return rows.length > 0
  },

  async findValidConsent(applicationId, checkType, now) {
    const rows = await query<Raw>(
      `SELECT ${CONSENT_COLS} FROM screening_consents
        WHERE application_id = $1::uuid AND $2 = ANY(check_types)
          AND withdrawn_at IS NULL AND expires_at > $3
        ORDER BY accepted_at DESC LIMIT 1 -- screening_consent_valid`,
      [applicationId, checkType, now],
    )
    return rows[0] ? consentFrom(rows[0]) : null
  },

  async findRecentCheck(applicationId, checkType, since) {
    const rows = await query<Raw>(
      `SELECT ${CHECK_COLS} FROM screening_checks
        WHERE application_id = $1::uuid AND check_type = $2 AND requested_at >= $3
          AND status NOT IN ('ERROR', 'CANCELLED')
        ORDER BY requested_at DESC LIMIT 1 -- screening_duplicate`,
      [applicationId, checkType, since],
    )
    return rows[0] ? checkFrom(rows[0]) : null
  },

  async insertCheck(c) {
    const rows = await query<Raw>(
      `INSERT INTO screening_checks (
         client_id, application_id, consent_id, check_type, provider, provider_ref, status, result_summary,
         attempt, previous_check_id, requested_by, requested_at
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb, $9, $10::uuid, $11::uuid, $12)
       RETURNING ${CHECK_COLS}`,
      [
        c.clientId, c.applicationId, c.consentId, c.checkType, c.provider, c.providerRef, c.status,
        JSON.stringify(c.resultSummary ?? {}), c.attempt, c.previousCheckId, c.requestedBy, c.requestedAt,
      ],
    )
    return checkFrom(rows[0])
  },

  async updateCheck(id, patch, onlyIfStatus) {
    const sets: string[] = []
    const params: unknown[] = [id]
    for (const [key, column] of Object.entries(CHECK_PATCH_COLUMNS) as Array<[keyof CheckRow, string]>) {
      if (!(key in patch)) continue
      const value = patch[key as keyof typeof patch]
      params.push(key === 'resultSummary' ? JSON.stringify(value ?? {}) : value)
      sets.push(`${column} = $${params.length}${key === 'resultSummary' ? '::jsonb' : ''}`)
    }
    if (!sets.length) return this.getCheck(id)
    let guard = ''
    if (onlyIfStatus?.length) {
      params.push(onlyIfStatus)
      guard = ` AND status = ANY($${params.length}::text[])`
    }
    const rows = await query<Raw>(
      `UPDATE screening_checks SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $1::uuid${guard} RETURNING ${CHECK_COLS}`,
      params,
    )
    return rows[0] ? checkFrom(rows[0]) : null
  },

  async getCheck(id) {
    if (!isUuid(id)) return null
    const rows = await query<Raw>(`SELECT ${CHECK_COLS} FROM screening_checks WHERE id = $1::uuid`, [id])
    return rows[0] ? checkFrom(rows[0]) : null
  },

  async listChecks(applicationId) {
    const rows = await query<Raw>(
      `SELECT ${CHECK_COLS} FROM screening_checks WHERE application_id = $1::uuid ORDER BY requested_at DESC, attempt DESC`,
      [applicationId],
    )
    return rows.map(checkFrom)
  },

  async findCheckByProviderRef(provider, providerRef) {
    const rows = await query<Raw>(
      `SELECT ${CHECK_COLS} FROM screening_checks WHERE provider = $1 AND provider_ref = $2 LIMIT 1`,
      [provider, providerRef],
    )
    return rows[0] ? checkFrom(rows[0]) : null
  },

  async insertAudit(a: AuditInsert) {
    await query(
      `INSERT INTO screening_check_audit (client_id, check_id, consent_id, action, actor_user_id, detail)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::jsonb)`,
      [a.clientId, a.checkId ?? null, a.consentId ?? null, a.action, a.actorUserId ?? null, JSON.stringify(a.detail ?? {})],
    )
  },

  async getPrice(provider, checkType) {
    const rows = await query<Raw>(
      `SELECT provider, check_type, cost_cents, markup_bps FROM screening_provider_prices
        WHERE provider = $1 AND check_type = $2`,
      [provider, checkType],
    )
    const r = rows[0]
    return r
      ? { provider, checkType, costCents: Number(r.cost_cents), markupBps: Number(r.markup_bps) }
      : null
  },

  async listPrices() {
    const rows = await query<Raw>(
      `SELECT provider, check_type, cost_cents, markup_bps FROM screening_provider_prices ORDER BY provider, check_type`,
    )
    return rows.map(
      (r): PriceRow => ({
        provider: String(r.provider),
        checkType: r.check_type as ScreeningCheckType,
        costCents: Number(r.cost_cents),
        markupBps: Number(r.markup_bps),
      }),
    )
  },

  async upsertPrice(p, actorUserId) {
    await query(
      `INSERT INTO screening_provider_prices (provider, check_type, cost_cents, markup_bps, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5::uuid, NOW())
       ON CONFLICT (provider, check_type) DO UPDATE SET
         cost_cents = EXCLUDED.cost_cents, markup_bps = EXCLUDED.markup_bps,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [p.provider, p.checkType, p.costCents, p.markupBps, actorUserId],
    )
    return p
  },

  async insertCharge(c: ChargeInsert) {
    const rows = await query<{ id: string }>(
      `INSERT INTO screening_charges (
         client_id, check_id, provider, check_type, cost_cents, markup_bps, price_cents, payer, billing_month
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::date)
       ON CONFLICT (check_id) DO NOTHING
       RETURNING id::text AS id`,
      [c.clientId, c.checkId, c.provider, c.checkType, c.costCents, c.markupBps, c.priceCents, c.payer, c.billingMonth],
    )
    return rows[0] ?? null
  },

  async usage(billingMonth, clientId) {
    const rows = await query<Raw>(
      `SELECT ch.client_id::text AS client_id, c.company_name, ch.provider, ch.check_type, ch.payer,
              COUNT(*)::int AS n, COALESCE(SUM(ch.cost_cents), 0)::bigint AS cost,
              COALESCE(SUM(ch.price_cents), 0)::bigint AS price,
              COALESCE(SUM(ch.price_cents) FILTER (WHERE ch.invoice_id IS NULL), 0)::bigint AS uninvoiced
         FROM screening_charges ch
         JOIN clients c ON c.id = ch.client_id
        WHERE ch.billing_month = $1::date AND ($2::uuid IS NULL OR ch.client_id = $2::uuid)
        GROUP BY ch.client_id, c.company_name, ch.provider, ch.check_type, ch.payer
        ORDER BY c.company_name, ch.provider, ch.check_type -- screening_usage`,
      [billingMonth, clientId],
    )
    const out: UsageRow[] = []
    for (const r of rows) {
      const cid = String(r.client_id)
      out.push({
        clientId: cid,
        agencyRef: (await resolveFrontendId('agency', cid)) ?? cid,
        agencyName: String(r.company_name),
        provider: String(r.provider),
        checkType: r.check_type as ScreeningCheckType,
        payer: r.payer === 'APPLICANT' ? 'APPLICANT' : 'AGENCY',
        count: Number(r.n),
        costCents: Number(r.cost),
        priceCents: Number(r.price),
        uninvoicedPriceCents: Number(r.uninvoiced),
      })
    }
    return out
  },

  async billCharges(clientId, billingMonth, invoiceRef) {
    const invoiceId = (await resolveUuid('invoice', invoiceRef)) ?? (isUuid(invoiceRef) ? invoiceRef : null)
    if (!invoiceId) {
      throw Object.assign(new Error('Invoice not found (persist it first)'), { status: 409, code: 'INVOICE_NOT_PERSISTED' })
    }
    // Only agency-paid charges go on the agency invoice; applicant-paid ones are collected separately.
    const billed = await query<{ n: number; price: number | string }>(
      `WITH upd AS (
         UPDATE screening_charges SET invoice_id = $3::uuid
          WHERE client_id = $1::uuid AND billing_month = $2::date AND invoice_id IS NULL AND payer = 'AGENCY'
          RETURNING price_cents
       )
       SELECT COUNT(*)::int AS n, COALESCE(SUM(price_cents), 0)::bigint AS price FROM upd`,
      [clientId, billingMonth, invoiceId],
    )
    const count = Number(billed[0]?.n ?? 0)
    const priceCents = Number(billed[0]?.price ?? 0)
    if (!count) return { count, priceCents, lineItemAdded: false }
    const item = screeningLineItem(count, priceCents, billingMonth)
    // Add the line once (the client may already have put it on the invoice) and keep totals in step.
    const added = await query<{ id: string }>(
      `UPDATE invoices
          SET line_items = COALESCE(line_items, '[]'::jsonb) || jsonb_build_array($2::jsonb),
              vat_amount = vat_amount + ROUND($3::numeric * 0.15, 2),
              total_amount_due = total_amount_due + ROUND($3::numeric * 1.15, 2)
        WHERE id = $1::uuid
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(line_items, '[]'::jsonb)) li WHERE li->>'kind' = 'screening'
          )
        RETURNING id::text AS id`,
      [invoiceId, JSON.stringify(item), item.amount],
    )
    return { count, priceCents, lineItemAdded: added.length > 0 }
  },

  async purgeCandidates(now, limit) {
    const rows = await query<Raw>(
      `SELECT ${CHECK_COLS} FROM screening_checks
        WHERE result_encrypted IS NOT NULL AND retain_until IS NOT NULL AND retain_until <= $1
        ORDER BY retain_until ASC LIMIT $2 -- screening_purge`,
      [now, limit],
    )
    return rows.map(checkFrom)
  },

  async relationshipEnd(applicationId, clientId) {
    if (!applicationId) return null
    const rows = await query<{ ongoing: boolean | null; end_date: Date | string | null }>(
      `SELECT BOOL_OR(l.end_date IS NULL AND l.status NOT IN ('ENDED', 'CANCELLED')) AS ongoing,
              MAX(COALESCE(l.end_date, CASE WHEN l.status IN ('ENDED', 'CANCELLED') THEN l.updated_at::date END)) AS end_date
         FROM applications a
         JOIN leases l ON l.client_id = $2::uuid AND l.tenant_id = a.applicant_id
        WHERE a.id = $1::uuid AND a.applicant_id IS NOT NULL -- screening_relationship`,
      [applicationId, clientId],
    )
    const r = rows[0]
    if (!r) return null
    if (r.ongoing) return 'ongoing'
    return date(r.end_date)
  },
}
