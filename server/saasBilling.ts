/**
 * Monthly Lekaya Rentals subscription billing for agencies (price sheet in
 * src/lib/saasPricing.ts). On the 1st of each month every active agency gets
 * an invoice, due on the 7th: monthly fee by portfolio size, front-page
 * advertising (R25 per featured listing) and, on the first invoice, the
 * once-off sign-up fee, plus 15% VAT.
 *
 * The platform team records payments (with proof uploads). Agency admins see
 * their invoices and can upload their own proof of payment. Unpaid invoices
 * are escalated by server/escalations.ts (agency admins, then the platform team).
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { notifyUsers, superAdminUuids } from './supportDesk.js'
import type { DemoActor } from './actor.js'
import {
  draftSaasInvoice,
  type AgencyBillingSettings,
  type InvoiceLine,
  type SaasInvoiceDraft,
} from '../src/lib/saasPricing.js'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS saas_invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number            VARCHAR(40) NOT NULL UNIQUE,
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period            CHAR(7) NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date          DATE NOT NULL,
  tier_id           VARCHAR(40),
  property_count    INT NOT NULL DEFAULT 0,
  advertised_count  INT NOT NULL DEFAULT 0,
  lines             JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal          NUMERIC(14,2) NOT NULL,
  vat               NUMERIC(14,2) NOT NULL,
  total             NUMERIC(14,2) NOT NULL,
  amount_paid       NUMERIC(14,2) NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
                      CHECK (status IN ('UNPAID', 'PART_PAID', 'PAID', 'OVERDUE', 'VOID')),
  payments          JSONB NOT NULL DEFAULT '[]'::jsonb,
  proofs            JSONB NOT NULL DEFAULT '[]'::jsonb,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, period)
);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_status ON saas_invoices (status, due_date);
`
let ready: Promise<void> | null = null
export function ensureSaasBillingTable(): Promise<void> {
  ready ??= query(SCHEMA_SQL).then(() => undefined).catch((e) => {
    ready = null
    throw e
  })
  return ready
}

function fail(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

const PAY_ATTACH = /^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/=]+$/
export type Attachment = { id: string; name: string; mimeType: string; dataUrl: string; uploadedAt: string; uploadedByName?: string | null }

/** Images / PDFs up to 2.5 MB each, at most 6. */
export function cleanAttachments(raw: unknown, by?: string | null): Attachment[] {
  if (!Array.isArray(raw)) return []
  const out: Attachment[] = []
  for (const a of raw.slice(0, 6)) {
    const x = (a ?? {}) as Record<string, unknown>
    const dataUrl = typeof x.dataUrl === 'string' ? x.dataUrl : ''
    if (!PAY_ATTACH.test(dataUrl) || dataUrl.length * 0.75 > 2.5 * 1024 * 1024) continue
    out.push({
      id: String(x.id ?? `att-${out.length}`).slice(0, 40),
      name: String(x.name ?? 'attachment').slice(0, 120),
      mimeType: dataUrl.slice(5, dataUrl.indexOf(';')),
      dataUrl,
      uploadedAt: new Date().toISOString(),
      uploadedByName: by ?? null,
    })
  }
  return out
}

export function periodOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
}

type ClientRow = { id: string; fe: string; name: string; status: string; settings: Record<string, unknown> | null }

function billingSettings(settings: Record<string, unknown> | null): AgencyBillingSettings {
  const b = (settings?.billing ?? {}) as AgencyBillingSettings
  return b && typeof b === 'object' ? b : {}
}

async function clients(clientId?: string | null): Promise<ClientRow[]> {
  return query<ClientRow>(
    `SELECT id::text AS id, COALESCE(settings->>'frontend_id', id::text) AS fe, company_name AS name, status, settings
       FROM clients WHERE ($1::uuid IS NULL OR id = $1::uuid) ORDER BY company_name`,
    [clientId ?? null],
  )
}

async function usage(clientId: string): Promise<{ propertyCount: number; advertisedCount: number }> {
  const rows = await query<{ n: string; ads: string }>(
    `SELECT count(*)::text AS n, count(*) FILTER (WHERE featured)::text AS ads FROM units WHERE client_id = $1::uuid`,
    [clientId],
  )
  return { propertyCount: Number(rows[0]?.n ?? 0), advertisedCount: Number(rows[0]?.ads ?? 0) }
}

export async function agencyAdminUuids(clientId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM users
      WHERE client_id = $1::uuid AND COALESCE(active, true)
        AND (role IN ('AGENCY_ADMIN', 'AGENT_ADMIN') OR metadata->>'frontend_role' IN ('client_admin', 'agent_admin'))`,
    [clientId],
  )
  return rows.map((r) => r.id)
}

export type SaasInvoice = {
  id: string
  number: string
  agencyId: string
  agencyName: string
  period: string
  periodLabel: string
  issuedAt: string
  dueDate: string
  tierId: string | null
  propertyCount: number
  advertisedCount: number
  lines: InvoiceLine[]
  subtotal: number
  vat: number
  total: number
  amountPaid: number
  balance: number
  status: 'UNPAID' | 'PART_PAID' | 'PAID' | 'OVERDUE' | 'VOID'
  payments: Array<{ id: string; amount: number; paidOn: string; method: string; reference: string; note: string; attachments: Attachment[]; recordedBy: string; recordedAt: string }>
  proofs: Array<{ id: string; reference: string; note: string; attachments: Attachment[]; uploadedBy: string; at: string }>
}

type InvoiceRow = {
  id: string
  number: string
  client_id: string
  fe: string
  name: string
  period: string
  issued_at: Date | string
  due_date: Date | string
  tier_id: string | null
  property_count: number
  advertised_count: number
  lines: InvoiceLine[]
  subtotal: string
  vat: string
  total: string
  amount_paid: string
  status: SaasInvoice['status']
  payments: SaasInvoice['payments']
  proofs: SaasInvoice['proofs']
}

const dateOnly = (v: Date | string) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

function toInvoice(r: InvoiceRow): SaasInvoice {
  const total = Number(r.total)
  const paid = Number(r.amount_paid)
  return {
    id: r.id,
    number: r.number,
    agencyId: r.fe,
    agencyName: r.name,
    period: r.period,
    periodLabel: periodLabel(r.period),
    issuedAt: new Date(r.issued_at).toISOString(),
    dueDate: dateOnly(r.due_date),
    tierId: r.tier_id,
    propertyCount: r.property_count,
    advertisedCount: r.advertised_count,
    lines: Array.isArray(r.lines) ? r.lines : [],
    subtotal: Number(r.subtotal),
    vat: Number(r.vat),
    total,
    amountPaid: paid,
    balance: Math.max(0, Math.round((total - paid) * 100) / 100),
    status: r.status,
    payments: Array.isArray(r.payments) ? r.payments : [],
    proofs: Array.isArray(r.proofs) ? r.proofs : [],
  }
}

const SELECT_INVOICE = `
  SELECT i.id::text AS id, i.number, i.client_id::text AS client_id,
         COALESCE(c.settings->>'frontend_id', c.id::text) AS fe, c.company_name AS name,
         i.period, i.issued_at, i.due_date, i.tier_id, i.property_count, i.advertised_count, i.lines,
         i.subtotal::text AS subtotal, i.vat::text AS vat, i.total::text AS total, i.amount_paid::text AS amount_paid,
         i.status, i.payments, i.proofs
    FROM saas_invoices i JOIN clients c ON c.id = i.client_id`

async function actorClient(actor: DemoActor): Promise<string | null> {
  if (!actor.agencyId) return null
  if (/^[0-9a-f-]{36}$/i.test(actor.agencyId)) return actor.agencyId
  return (await resolveUuid('agency', actor.agencyId).catch(() => null)) ?? null
}

async function actorUuid(actor: DemoActor): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/i.test(actor.userId)) return actor.userId
  return (await resolveUuid('user', actor.userId).catch(() => null)) ?? null
}

const AGENCY_ADMIN_ROLES = new Set(['client_admin', 'agent_admin'])

async function loadInvoice(id: string): Promise<SaasInvoice & { clientId: string }> {
  await ensureSaasBillingTable()
  const rows = await query<InvoiceRow>(`${SELECT_INVOICE} WHERE i.id = $1::uuid`, [id])
  if (!rows[0]) throw fail(404, 'Invoice not found')
  return { ...toInvoice(rows[0]), clientId: rows[0].client_id }
}

/** Platform team: every invoice. Agency admins: their agency's. */
export async function listInvoices(actor: DemoActor): Promise<SaasInvoice[]> {
  await ensureSaasBillingTable()
  if (actor.role === 'super_admin') {
    return (await query<InvoiceRow>(`${SELECT_INVOICE} ORDER BY i.period DESC, c.company_name LIMIT 500`)).map(toInvoice)
  }
  if (!AGENCY_ADMIN_ROLES.has(actor.role)) throw fail(403, 'Only agency admins can see billing')
  const clientId = await actorClient(actor)
  if (!clientId) return []
  return (await query<InvoiceRow>(`${SELECT_INVOICE} WHERE i.client_id = $1::uuid ORDER BY i.period DESC`, [clientId])).map(toInvoice)
}

export async function getInvoice(actor: DemoActor, id: string): Promise<SaasInvoice> {
  const inv = await loadInvoice(id)
  if (actor.role !== 'super_admin') {
    if (!AGENCY_ADMIN_ROLES.has(actor.role) || (await actorClient(actor)) !== inv.clientId) throw fail(404, 'Invoice not found')
  }
  const { clientId: _c, ...rest } = inv
  return rest
}

export type AgencyBillingRow = {
  agencyId: string
  clientId: string
  name: string
  status: string
  settings: AgencyBillingSettings
  draft: SaasInvoiceDraft
  balance: number
  overdueCount: number
}

/** Platform team: each agency's size, tier, settings and what it owes. */
export async function listAgencyBilling(): Promise<AgencyBillingRow[]> {
  await ensureSaasBillingTable()
  const out: AgencyBillingRow[] = []
  const owed = await query<{ client_id: string; balance: string; overdue: string }>(
    `SELECT client_id::text AS client_id, SUM(total - amount_paid)::text AS balance,
            count(*) FILTER (WHERE due_date < CURRENT_DATE)::text AS overdue
       FROM saas_invoices WHERE status IN ('UNPAID', 'PART_PAID', 'OVERDUE') GROUP BY client_id`,
  )
  for (const c of await clients()) {
    const s = billingSettings(c.settings)
    const u = await usage(c.id)
    const o = owed.find((x) => x.client_id === c.id)
    out.push({
      agencyId: c.fe,
      clientId: c.id,
      name: c.name,
      status: c.status,
      settings: s,
      draft: draftSaasInvoice({ ...u, settings: s, includeSignUp: !s.signUpBilled, periodLabel: periodLabel(periodOf(new Date())) }),
      balance: Number(o?.balance ?? 0),
      overdueCount: Number(o?.overdue ?? 0),
    })
  }
  return out
}

export async function saveAgencyBillingSettings(agencyRef: string, input: unknown): Promise<AgencyBillingSettings> {
  const clientId = /^[0-9a-f-]{36}$/i.test(agencyRef) ? agencyRef : await resolveUuid('agency', agencyRef).catch(() => null)
  if (!clientId) throw fail(404, 'Agency not found')
  const x = (input ?? {}) as Record<string, unknown>
  const money = (v: unknown) => (v === null || v === '' || v === undefined ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 100) / 100 : null)
  const dueDay = Number(x.dueDay)
  const next: AgencyBillingSettings = {
    customMonthlyFee: money(x.customMonthlyFee),
    customSignUpFee: money(x.customSignUpFee),
    signUpBilled: x.signUpBilled === true,
    exempt: x.exempt === true,
    dueDay: Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 28 ? dueDay : 7,
  }
  await query(
    `UPDATE clients SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('billing', $2::jsonb), updated_at = NOW() WHERE id = $1::uuid`,
    [clientId, JSON.stringify(next)],
  )
  return next
}

async function nextNumber(period: string): Promise<string> {
  const rows = await query<{ n: string }>(`SELECT count(*)::text AS n FROM saas_invoices WHERE period = $1`, [period])
  return `LR-${period.replace('-', '')}-${String(Number(rows[0]?.n ?? 0) + 1).padStart(4, '0')}`
}

/**
 * Create this month's invoice for every active agency that has none yet.
 * Safe to run any number of times (one invoice per agency per month).
 */
export async function generateMonthlyInvoices(now = new Date(), onlyClientId?: string | null): Promise<{ created: number; skipped: number }> {
  await ensureSaasBillingTable()
  const period = periodOf(now)
  let created = 0
  let skipped = 0
  for (const c of await clients(onlyClientId)) {
    const s = billingSettings(c.settings)
    if (c.status !== 'active' || s.exempt) {
      skipped++
      continue
    }
    const exists = await query<{ id: string }>(`SELECT id::text AS id FROM saas_invoices WHERE client_id = $1::uuid AND period = $2`, [c.id, period])
    if (exists[0]) {
      skipped++
      continue
    }
    const u = await usage(c.id)
    const draft = draftSaasInvoice({ ...u, settings: s, includeSignUp: !s.signUpBilled, periodLabel: periodLabel(period) })
    if (draft.needsAgreedFee || draft.total <= 0) {
      skipped++
      if (draft.needsAgreedFee) {
        await notifyUsers(await superAdminUuids(), {
          clientId: c.id,
          title: `Set a monthly fee for ${c.name}`.slice(0, 200),
          body: `${c.name} has ${u.propertyCount} properties (1,000+ tier). Add their agreed monthly fee on the Billing page so they can be invoiced.`,
          link: '/workspace/platform/billing',
          resource: 'billing',
          action: 'alert',
        })
      }
      continue
    }
    const due = new Date(now.getFullYear(), now.getMonth(), s.dueDay ?? 7)
    if (due < now) due.setDate(now.getDate() + 7)
    const number = await nextNumber(period)
    await query(
      `INSERT INTO saas_invoices (number, client_id, period, due_date, tier_id, property_count, advertised_count, lines, subtotal, vat, total)
       VALUES ($1, $2::uuid, $3, $4::date, $5, $6, $7, $8::jsonb, $9, $10, $11)
       ON CONFLICT (client_id, period) DO NOTHING`,
      [number, c.id, period, due.toISOString().slice(0, 10), draft.tierId, u.propertyCount, u.advertisedCount, JSON.stringify(draft.lines), draft.subtotal, draft.vat, draft.total],
    )
    if (!s.signUpBilled && draft.lines.some((l) => l.label.startsWith('Once-off'))) {
      await saveAgencyBillingSettings(c.id, { ...s, signUpBilled: true })
    }
    created++
    await notifyUsers(await agencyAdminUuids(c.id), {
      clientId: c.id,
      title: `Your Lekaya invoice for ${periodLabel(period)}`,
      body: `Invoice ${number}: R ${draft.total.toFixed(2)} (incl. VAT), due ${due.toISOString().slice(0, 10)}. View it under Admin → Subscription & billing.`,
      link: '/workspace/admin/subscription',
      resource: 'billing',
      action: 'created',
    })
  }
  return { created, skipped }
}

/** Platform team records money received, with proof uploads. */
export async function recordInvoicePayment(actor: DemoActor, id: string, input: Record<string, unknown>): Promise<SaasInvoice> {
  if (actor.role !== 'super_admin') throw fail(403, 'Only the platform team records payments')
  const inv = await loadInvoice(id)
  if (inv.status === 'VOID') throw fail(400, 'This invoice was cancelled')
  const amount = Math.round(Number(input.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) throw fail(400, 'Enter the amount received')
  const who = await actorUuid(actor)
  const name = who ? (await query<{ n: string }>(`SELECT concat_ws(' ', first_name, last_name) AS n FROM users WHERE id = $1::uuid`, [who]))[0]?.n : null
  const payment = {
    id: `pay-${Date.now().toString(36)}`,
    amount,
    paidOn: String(input.paidOn ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    method: String(input.method ?? 'EFT').slice(0, 40),
    reference: String(input.reference ?? '').slice(0, 120),
    note: String(input.note ?? '').slice(0, 500),
    attachments: cleanAttachments(input.attachments, name),
    recordedBy: name ?? 'Platform team',
    recordedAt: new Date().toISOString(),
  }
  const paid = Math.round((inv.amountPaid + amount) * 100) / 100
  const status = paid + 0.009 >= inv.total ? 'PAID' : 'PART_PAID'
  await query(
    `UPDATE saas_invoices SET payments = payments || $2::jsonb, amount_paid = $3, status = $4,
            paid_at = CASE WHEN $4 = 'PAID' THEN NOW() ELSE paid_at END, updated_at = NOW()
      WHERE id = $1::uuid`,
    [id, JSON.stringify([payment]), paid, status],
  )
  if (status === 'PAID') {
    await query(
      `UPDATE event_log SET payload = payload || jsonb_build_object('status', 'resolved', 'updatedAt', $2::text)
        WHERE event_type = 'escalation' AND subject_id = $1::uuid`,
      [id, new Date().toISOString()],
    ).catch(() => undefined)
  }
  await notifyUsers(await agencyAdminUuids(inv.clientId), {
    clientId: inv.clientId,
    title: status === 'PAID' ? `Invoice ${inv.number} paid — thank you` : `Part payment received for ${inv.number}`,
    body: `We received R ${amount.toFixed(2)}. ${status === 'PAID' ? 'The invoice is settled.' : `R ${(inv.total - paid).toFixed(2)} is still owed.`}`,
    link: '/workspace/admin/subscription',
    resource: 'billing',
    action: 'updated',
  })
  return getInvoice(actor, id)
}

/** Agency admins upload their proof of payment for the platform team to confirm. */
export async function submitInvoiceProof(actor: DemoActor, id: string, input: Record<string, unknown>): Promise<SaasInvoice> {
  await getInvoice(actor, id)
  const inv = await loadInvoice(id)
  const who = await actorUuid(actor)
  const name = who ? (await query<{ n: string }>(`SELECT concat_ws(' ', first_name, last_name) AS n FROM users WHERE id = $1::uuid`, [who]))[0]?.n : null
  const attachments = cleanAttachments(input.attachments, name)
  const reference = String(input.reference ?? '').slice(0, 120)
  if (!attachments.length && !reference) throw fail(400, 'Add the payment reference or upload the proof of payment')
  const proof = { id: `proof-${Date.now().toString(36)}`, reference, note: String(input.note ?? '').slice(0, 500), attachments, uploadedBy: name ?? 'Agency', at: new Date().toISOString() }
  await query(`UPDATE saas_invoices SET proofs = proofs || $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`, [id, JSON.stringify([proof])])
  await notifyUsers(await superAdminUuids(), {
    clientId: inv.clientId,
    title: `Proof of payment for ${inv.number}`,
    body: `${inv.agencyName} uploaded proof of payment${reference ? ` (ref ${reference})` : ''}. Check it and record the payment.`,
    link: `/workspace/billing/invoices/${inv.id}`,
    resource: 'billing',
    action: 'updated',
  })
  return getInvoice(actor, id)
}

export async function voidInvoice(actor: DemoActor, id: string): Promise<SaasInvoice> {
  if (actor.role !== 'super_admin') throw fail(403, 'Only the platform team can cancel invoices')
  await loadInvoice(id)
  await query(`UPDATE saas_invoices SET status = 'VOID', updated_at = NOW() WHERE id = $1::uuid`, [id])
  return getInvoice(actor, id)
}

/** Unpaid invoices past their due date (for the escalation sweep). */
export async function overdueInvoices(): Promise<Array<{ id: string; clientId: string; number: string; agencyName: string; balance: number; dueDate: string; daysOverdue: number }>> {
  await ensureSaasBillingTable()
  const rows = await query<{ id: string; client_id: string; number: string; name: string; balance: string; due_date: Date | string; days: string }>(
    `SELECT i.id::text AS id, i.client_id::text AS client_id, i.number, c.company_name AS name,
            (i.total - i.amount_paid)::text AS balance, i.due_date, (CURRENT_DATE - i.due_date)::text AS days
       FROM saas_invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.status IN ('UNPAID', 'PART_PAID', 'OVERDUE') AND i.due_date < CURRENT_DATE`,
  )
  const ids = rows.filter((r) => Number(r.days) >= 7).map((r) => r.id)
  if (ids.length) await query(`UPDATE saas_invoices SET status = 'OVERDUE', updated_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'UNPAID'`, [ids])
  return rows.map((r) => ({ id: r.id, clientId: r.client_id, number: r.number, agencyName: r.name, balance: Number(r.balance), dueDate: dateOnly(r.due_date), daysOverdue: Number(r.days) }))
}
