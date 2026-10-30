/**
 * PayFast checkout routes (sandbox-first).
 *
 * POST /api/payfast/create
 *   (amount = payments.amount; a sent amountCents must match it or 409)
 *   body: { paymentId, paymentDbId?, amountCents?, itemName?, itemDescription?,
 *           payer?, subscription? }
 *   → { ok, processUrl, fields } — fields include the server-computed
 *     signature. The passphrase never leaves the server.
 *
 * POST /api/payfast/itn
 *   PayFast server-to-server notification (form-encoded). Verifies source,
 *   signature, and ledger amount, then marks the payment PAID (idempotent)
 *   and emits a notification row. Always answers 200 once verified so PayFast
 *   stops retrying; non-verified requests get 400.
 *   H1: the source IP comes from clientIp(c) (loopback-only header trust);
 *   live mode checks the documented ranges only; sandbox adds the resolved
 *   sandbox host (5 min cache, fails closed). Every rejection is logged loudly
 *   (rate-capped when it names no payment); a rejection naming one of our
 *   payments also writes an event_log row (deduped per payment + reason).
 *   No per-IP cap on this route.
 */
import { randomUUID } from 'node:crypto'
import { promises as dnsPromises } from 'node:dns'
import type { Context } from 'hono'
import { clientIp } from './clientIp.js'
import { query, withTransaction } from './db.js'
import { resolveUuid } from './entityMap.js'
import { sendPaymentReceipt } from './mailtrap.js'
import {
  buildCheckoutFields,
  payfastConfigFromEnv,
  payfastIsLive,
  PAYFAST_SANDBOX_HOST,
  verifyItn,
  type PayfastConfig,
} from './payfast.js'

/** Server-side failure log — never leaks internals to the HTTP response. */
function logPayfastFailure(kind: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[payfast] ${kind}: ${message}`)
}

type Json = Record<string, unknown>

/* ---------------------------------------------------------------- H1 ITN */

/** Sandbox source addresses: resolved on demand, cached for `ttlMs`, never cached on failure. */
export type SandboxSourceCache = { get(): Promise<ReadonlySet<string> | null> }

export function createSandboxSourceCache(
  lookup: () => Promise<string[]>,
  ttlMs = 5 * 60_000,
): SandboxSourceCache {
  let cached: { at: number; addrs: ReadonlySet<string> } | null = null
  return {
    async get() {
      const now = Date.now()
      if (cached && now - cached.at < ttlMs) return cached.addrs
      try {
        const list = await lookup()
        const addrs = new Set(list.map((a) => a.trim().toLowerCase()).filter(Boolean))
        cached = { at: now, addrs }
        return addrs
      } catch (err) {
        logPayfastFailure('payfast_sandbox_dns_failed', err)
        return null
      }
    },
  }
}

async function lookupSandboxHost(): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DNS lookup of ${PAYFAST_SANDBOX_HOST} timed out`)), 3000)
  })
  try {
    const rows = await Promise.race([dnsPromises.lookup(PAYFAST_SANDBOX_HOST, { all: true }), timeout])
    return rows.map((r) => r.address)
  } finally {
    clearTimeout(timer)
  }
}

const defaultSandboxSources = createSandboxSourceCache(lookupSandboxHost)

export type PayfastItnDeps = { sandboxSources?: SandboxSourceCache }

/** One line, no newlines, at most 200 chars: safe for logs and event_log. */
function clip(v: unknown): string {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200)
}

const ITN_ALERT_DEDUPE_MS = 15 * 60_000
const UNMATCHED_LOG_WINDOW_MS = 60_000
const UNMATCHED_LOG_MAX = 30
const matchedRejectSeen = new Map<string, number>()
let unmatchedWindow = { start: 0, logged: 0, suppressed: 0 }

/** Test hook: forget dedupe and cap state. */
export function resetItnRejectLogForTests(): void {
  matchedRejectSeen.clear()
  unmatchedWindow = { start: 0, logged: 0, suppressed: 0 }
}

/**
 * Loud logging for a rejected ITN (Q5). Never logs the signature, passphrase
 * or merchant key. Matched (names one of our payments): console + event_log,
 * once per (m_payment_id, reason) per 15 min. Unmatched: console only, at most
 * ~30 lines per minute, then one summary line.
 */
async function reportItnRejection(
  body: Record<string, string>,
  reason: string,
  sourceIp: string,
  payment: { uuid: string; clientUuid: string | null } | null,
): Promise<void> {
  const fields = {
    m_payment_id: clip(body.m_payment_id),
    pf_payment_id: clip(body.pf_payment_id),
    source_ip: clip(sourceIp),
    amount_gross: clip(body.amount_gross),
    reason: clip(reason),
  }
  const line = `[payfast] payfast_itn_rejected: ${fields.reason} · m_payment_id=${fields.m_payment_id} · pf_payment_id=${fields.pf_payment_id} · source_ip=${fields.source_ip} · amount_gross=${fields.amount_gross}`
  const now = Date.now()
  if (payment) {
    const key = `${fields.m_payment_id}\u0000${fields.reason}`
    const seen = matchedRejectSeen.get(key)
    if (seen != null && now - seen < ITN_ALERT_DEDUPE_MS) return
    matchedRejectSeen.set(key, now)
    if (matchedRejectSeen.size > 1000) {
      for (const [k, t] of matchedRejectSeen) if (now - t >= ITN_ALERT_DEDUPE_MS) matchedRejectSeen.delete(k)
    }
    console.error(line)
    try {
      await query(
        `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::jsonb, NOW())`,
        [randomUUID(), payment.clientUuid, 'payfast_itn_rejected', 'payment', payment.uuid, null, JSON.stringify(fields)],
      )
    } catch (err) {
      logPayfastFailure('payfast_itn_reject_audit_failed', err)
    }
    return
  }
  if (now - unmatchedWindow.start >= UNMATCHED_LOG_WINDOW_MS) {
    if (unmatchedWindow.suppressed > 0) {
      console.error(`[payfast] payfast_itn_rejected: ${unmatchedWindow.suppressed} more rejected ITNs naming no known payment were not logged in the last minute`)
    }
    unmatchedWindow = { start: now, logged: 0, suppressed: 0 }
  }
  if (unmatchedWindow.logged < UNMATCHED_LOG_MAX) {
    unmatchedWindow.logged++
    console.error(line)
    if (unmatchedWindow.logged === UNMATCHED_LOG_MAX) {
      console.error('[payfast] payfast_itn_rejected: log cap reached; further rejections naming no known payment are counted, not logged, for the rest of this minute')
    }
  } else {
    unmatchedWindow.suppressed++
  }
}

function config(): PayfastConfig | null {
  return payfastConfigFromEnv()
}

function absoluteOrigin(c: Context): string {
  const configured = process.env.PAYFAST_PUBLIC_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  const url = new URL(c.req.url)
  const proto = c.req.header('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return `${proto}://${url.host}`
}

export type LoadedPayment = {
  id: string
  uuid: string
  amount: number
  status: string
  paymentType: string
  partyName: string
  partyUserId: string | null
  clientUuid: string | null
  propertyFeId: string | null
}

/**
 * Route-level authorisation for checkout, run once the payment row is loaded.
 * Returns an HTTP error to send, or null to continue.
 */
export type PayfastCreateAuthorize = (
  payment: LoadedPayment,
) => Promise<{ status: 401 | 403; error: string } | null>

/** Look up the payments row for a FE payment id (accepting the raw uuid too). */
async function loadPayment(paymentId: string): Promise<{
  id: string
  uuid: string
  amount: number
  status: string
  paymentType: string
  partyName: string
  partyUserId: string | null
  clientUuid: string | null
  propertyFeId: string | null
} | null> {
  const uuid = await resolveUuid('payment', paymentId)
  if (!uuid) return null
  const rows = await query<{
    id: string
    amount: string | number
    status: string
    payment_type: string
    party_name: string
    party_user_id: string | null
    client_id: string | null
    unit_id: string | null
  }>(
    `SELECT id::text, amount, status, payment_type, party_name, party_user_id, client_id::text, unit_id::text
     FROM payments WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  const row = rows[0]
  if (!row) return null
  const unitRows = row.unit_id
    ? await query<{ frontend_id: string }>(
        `SELECT frontend_id FROM entity_id_map WHERE backend_id = $1::uuid AND entity_type IN ('property','unit') LIMIT 1`,
        [row.unit_id],
      )
    : []
  return {
    id: paymentId,
    uuid: row.id,
    amount: Number(row.amount),
    status: row.status,
    paymentType: row.payment_type,
    partyName: row.party_name,
    partyUserId: row.party_user_id,
    clientUuid: row.client_id,
    propertyFeId: unitRows[0]?.frontend_id ?? null,
  }
}

export async function payfastCreate(c: Context, authorize?: PayfastCreateAuthorize) {
  try {
    const cfg = config()
    if (!cfg) {
      return c.json({ ok: false, error: 'payfast_not_configured' }, 503)
    }
    const body = (await c.req.json().catch(() => ({}))) as Json
    const paymentId = typeof body.paymentId === 'string' ? body.paymentId : ''
    if (!paymentId) {
      return c.json({ ok: false, error: 'paymentId required' }, 400)
    }
    const payment = await loadPayment(paymentId)
    if (!payment) {
      return c.json({ ok: false, error: 'payment_not_found' }, 404)
    }
    if (authorize) {
      const denied = await authorize(payment)
      if (denied) return c.json({ ok: false, error: denied.error }, denied.status)
    }
    if (payment.status === 'PAID') {
      return c.json({ ok: false, error: 'payment_already_paid' }, 409)
    }
    if (payment.status === 'CANCELLED') {
      return c.json({ ok: false, error: 'payment_cancelled' }, 409)
    }
    // The charge always comes from the ledger row. A client amount is only a
    // cross-check: if one is sent and differs from the record, refuse.
    const amountCents = Math.round(payment.amount * 100)
    const sentAmount = body.amountCents
    if (sentAmount !== undefined && sentAmount !== null && sentAmount !== '') {
      const sent = Number(sentAmount)
      if (!Number.isFinite(sent)) {
        return c.json({ ok: false, error: 'invalid_amount' }, 400)
      }
      if (Math.round(sent) !== amountCents) {
        return c.json({ ok: false, error: 'amount_mismatch' }, 409)
      }
    }
    const itemName =
      typeof body.itemName === 'string' && body.itemName.trim()
        ? body.itemName.trim()
        : `Lekaya · ${payment.paymentType} · ${payment.partyName}`
    const itemDescription = typeof body.itemDescription === 'string' ? body.itemDescription : undefined
    const payerRaw = (body.payer ?? {}) as Json
    const payer = {
      firstName: typeof payerRaw.firstName === 'string' ? payerRaw.firstName : undefined,
      lastName: typeof payerRaw.lastName === 'string' ? payerRaw.lastName : undefined,
      email: typeof payerRaw.email === 'string' ? payerRaw.email : undefined,
    }
    const origin = absoluteOrigin(c)
    const fields = buildCheckoutFields(cfg, {
      paymentId,
      amountCents,
      itemName,
      itemDescription,
      payer,
      returnUrl: `${origin}/payfast/return?ref=${encodeURIComponent(paymentId)}`,
      cancelUrl: `${origin}/payfast/cancel?ref=${encodeURIComponent(paymentId)}`,
      notifyUrl: `${origin}/api/payfast/itn`,
      ...(body.subscription && typeof body.subscription === 'object'
        ? { subscription: body.subscription as { cycles: string; frequency: 3 | 4 | 5 | 6 | 7 } }
        : {}),
    })
    return c.json({ ok: true, processUrl: cfg.processUrl ?? 'https://sandbox.payfast.co.za/eng/process', fields })
  } catch (err) {
    logPayfastFailure('payfast_create_error', err)
    return c.json({ ok: false, error: 'payfast_create_failed' }, 500)
  }
}

/** `deps` is a test-only seam (the DNS cache); production passes nothing. */
export async function payfastItn(c: Context, deps: PayfastItnDeps = {}) {
  try {
    const cfg = config()
    if (!cfg) return c.text('PayFast not configured', 503)
    const body: Record<string, string> = {}
    const contentType = c.req.header('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const json = (await c.req.json().catch(() => ({}))) as Json
      for (const [k, v] of Object.entries(json)) body[k] = String(v ?? '')
    } else {
      const form = await c.req.parseBody()
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === 'string') body[k] = v
      }
    }
    const expected = await loadPayment(body.m_payment_id ?? '')
    const sourceIp = clientIp(c)
    // Live never touches DNS; sandbox resolves the sandbox host (cached, fail closed).
    const sandboxAddresses = payfastIsLive(cfg)
      ? null
      : // A bare `app.post(path, payfastItn)` passes Hono's next() here; only a plain object counts.
        await ((typeof deps === 'object' && deps?.sandboxSources) || defaultSandboxSources).get()
    const verdict = verifyItn(body, cfg, {
      sourceIp,
      sandboxAddresses,
      expectedPaymentId: expected?.id,
      expectedAmountCents: expected ? Math.round(expected.amount * 100) : undefined,
    })
    if (!verdict.ok) {
      await reportItnRejection(body, verdict.reason, sourceIp, expected ? { uuid: expected.uuid, clientUuid: expected.clientUuid } : null)
      return c.text('ITN rejected', 400)
    }
    if (!expected) {
      // Valid signature for an unknown payment — accept but do nothing.
      logPayfastFailure('payfast_itn_unknown_payment', new Error(body.m_payment_id ?? ''))
      return c.text('ITN accepted', 200)
    }
    const paid = verdict.status === 'COMPLETE'
    await withTransaction(async (client) => {
      // Idempotent transition: only flip DUE/OVERDUE → terminal state.
      const res = await client.query(
        `UPDATE payments
         SET status = $2::text,
             paid_at = CASE WHEN $5::boolean THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
             paid_amount = CASE WHEN $5::boolean THEN COALESCE(paid_amount, amount) ELSE paid_amount END,
             method = CASE WHEN $5::boolean THEN COALESCE(method, 'PayFast') ELSE method END,
             reference = CASE WHEN $5::boolean THEN COALESCE(reference, $3) ELSE reference END,
             notes = CASE WHEN $5::boolean THEN COALESCE(notes, $4) ELSE notes END,
             updated_at = NOW()
         WHERE id = $1::uuid AND status::text IN ('DUE', 'OVERDUE')`,
        [
          expected.uuid,
          paid ? 'PAID' : 'CANCELLED',
          `PF-${verdict.raw.pf_payment_id ?? ''}`,
          `PayFast sandbox ITN · pf_payment_id ${verdict.raw.pf_payment_id ?? ''} · ${verdict.status}`,
          paid,
        ],
      )
      if (res.rowCount === 0) {
        // Already terminal — idempotent no-op (PayFast retries ITNs).
        return
      }
      if (!expected.partyUserId) {
        // Ledger settled; no party user to notify (notifications.user_id is NOT NULL).
        return
      }
      await client.query(
        `INSERT INTO notifications (
           id, client_id, user_id, title, body, link_path, resource_type, action_type
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, '/workspace/operations/payments', 'payment', 'updated'
         )`,
        [
          expected.clientUuid,
          expected.partyUserId,
          paid ? 'Payment received via PayFast' : 'PayFast payment cancelled',
          `${expected.paymentType} of R${(expected.amount).toFixed(2)} for ${expected.partyName} — ${paid ? 'paid' : 'cancelled'} via PayFast.`,
        ],
      )
    })
    // Receipt email — outside the DB transaction; never blocks the ITN reply.
    if (paid) {
      void (async () => {
        try {
          const payer = await query<{ email: string; first_name: string }>(
            `SELECT email, first_name FROM users WHERE id = $1::uuid LIMIT 1`,
            [expected.partyUserId],
          )
          const email = payer[0]?.email
          if (email) {
            await sendPaymentReceipt({
              email,
              payerName: payer[0]?.first_name,
              paymentId: expected.id,
              amountDisplay: `R${expected.amount.toFixed(2)}`,
              status: verdict.status,
            })
          }
        } catch (emailErr) {
          console.error('[payfast] receipt email failed:', emailErr instanceof Error ? emailErr.message : emailErr)
        }
      })()
    }
    return c.text('ITN accepted', 200)
  } catch (err) {
    logPayfastFailure('payfast_itn_error', err)
    return c.text('ITN error', 500)
  }
}
