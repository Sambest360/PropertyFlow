/**
 * PayFast integration core (sandbox-first) — SERVER ONLY.
 *
 * The salt passphrase and merchant key live here (or in env) and are never
 * shipped to the browser. The client only ever receives signed fields from
 * `POST /api/payfast/create` and POSTs them straight to PayFast's hosted
 * process page.
 *
 * PayFast checkout flow:
 *  1. Build payment fields, urlencode per PayFast rules, append the
 *     passphrase, MD5 → `signature`.
 *  2. POST the fields as a form to the process URL (sandbox or live); PayFast
 *     renders its hosted payment page.
 *  3. PayFast server-to-server ITN (Instant Transaction Notification) hits
 *     `notify_url`. We take the platform client IP (not the first
 *     X-Forwarded-For hop), require a signature in sandbox and live, check
 *     merchant_id and amount_gross against the ledger, then POST the payload
 *     back to PayFast's validate URL. The payment is marked PAID only when
 *     that postback returns VALID.
 *
 * Money: PayFast `amount` is a decimal ZAR string ("12.34"). Our payments
 * table stores ZAR rand as numeric — convert at the edges.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

export const PAYFAST_PROCESS_URL = 'https://sandbox.payfast.co.za/eng/process'
export const PAYFAST_LIVE_PROCESS_URL = 'https://www.payfast.io/eng/process'
export const PAYFAST_VALIDATE_URL = 'https://sandbox.payfast.co.za/eng/query/validate'
export const PAYFAST_LIVE_VALIDATE_URL = 'https://www.payfast.co.za/eng/query/validate'

/**
 * PayFast ITN source IPs (developer docs: sandbox + live nets). ITN requests
 * must originate from one of these (or the sandbox host names resolved).
 */
export const PAYFAST_ITN_IPS = new Set([
  '197.97.145.140',
  '197.97.145.143',
  '41.72.144.4',
  '41.72.144.5',
  '196.33.227.100',
  '196.33.227.101',
])

/** PayFast env config, resolved from the server environment. */
export type PayfastConfig = {
  merchantId: string
  merchantKey: string
  passphrase?: string
  /** Sandbox (default) or live process URL. */
  processUrl?: string
  /** Server-to-server ITN confirm URL. Payment is not marked paid until this returns VALID. */
  validateUrl?: string
}

export function payfastConfigFromEnv(): PayfastConfig | null {
  const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim()
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY?.trim()
  const passphrase = process.env.PAYFAST_PASSPHRASE?.trim()
  if (!merchantId || !merchantKey) return null
  const live = process.env.PAYFAST_MODE?.trim().toLowerCase() === 'live'
  // Live ITNs are forgeable without a passphrase: merchant id and key are in the browser form.
  if (live && !passphrase) return null
  return {
    merchantId,
    merchantKey,
    passphrase: passphrase || undefined,
    processUrl: live ? PAYFAST_LIVE_PROCESS_URL : PAYFAST_PROCESS_URL,
    validateUrl: live ? PAYFAST_LIVE_VALIDATE_URL : PAYFAST_VALIDATE_URL,
  }
}

/**
 * How the ITN handler learns the connecting client IP.
 *
 * `PAYFAST_CLIENT_IP_HEADER` — header the platform sets to the real client
 * address. Default `x-real-ip`. On Vercel the edge overwrites that header, so
 * a browser-supplied value cannot survive. Set to `none` to ignore it.
 *
 * `PAYFAST_TRUSTED_PROXY_HOPS` — when the platform header is absent, which
 * X-Forwarded-For entry to trust, counted from the right. Default 1: the last
 * entry, appended by the nearest trusted proxy. The first entry is whatever
 * the client sent and is never used.
 *
 * `PAYFAST_ITN_EXTRA_IPS` — comma-separated extra source IPs (local ITN
 * simulators). The PayFast allow-list still applies in sandbox and live.
 */
export type ClientIpSettings = {
  header: string | null
  trustedProxyHops: number
}

export function clientIpSettingsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ClientIpSettings {
  const raw = env.PAYFAST_CLIENT_IP_HEADER
  const header = (raw === undefined ? 'x-real-ip' : raw).trim().toLowerCase()
  const hops = Number(env.PAYFAST_TRUSTED_PROXY_HOPS ?? '1')
  return {
    header: header === '' || header === 'none' ? null : header,
    trustedProxyHops: Number.isFinite(hops) && hops >= 1 ? Math.floor(hops) : 1,
  }
}

export function extraItnIpsFromEnv(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const ips = new Set(PAYFAST_ITN_IPS)
  for (const part of (env.PAYFAST_ITN_EXTRA_IPS ?? '').split(',')) {
    const ip = part.trim()
    if (ip) ips.add(ip)
  }
  return ips
}

/**
 * Platform client IP. Prefers the configured header (`x-real-ip` on Vercel).
 * Falls back to the last trusted X-Forwarded-For hop, never the first entry.
 */
export function resolveItnClientIp(
  header: (name: string) => string | undefined | null,
  settings: ClientIpSettings = clientIpSettingsFromEnv(),
): string | null {
  if (settings.header) {
    const platform = header(settings.header)?.trim()
    if (platform) return platform.split(',')[0]?.trim() || null
  }
  const forwarded = header('x-forwarded-for')
  if (!forwarded) return null
  const hops = forwarded
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (hops.length === 0) return null
  const index = hops.length - settings.trustedProxyHops
  if (index < 0) return null
  return hops[index] ?? null
}

/**
 * PHP-compatible urlencode, per PayFast's signature spec: every byte except
 * unreserved `A-Z a-z 0-9 - _ .` is percent-encoded (uppercase hex), spaces
 * become `+`. Implemented byte-wise over UTF-8 so multi-byte names survive
 * round-trip with PHP's urlencode.
 */
export function payfastEncode(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim()
  const bytes = Buffer.from(raw, 'utf8')
  let out = ''
  for (const b of bytes) {
    const c = String.fromCharCode(b)
    if (/[A-Za-z0-9\-_.]/.test(c)) out += c
    else if (c === ' ') out += '+'
    else out += '%' + b.toString(16).toUpperCase().padStart(2, '0')
  }
  return out
}

export type PayfastFields = Record<string, string | number | null | undefined>

/**
 * Signature source: fields in POSTED order (matching PayFast's own PHP sample,
 * which iterates `$_POST` as received), skipping empty values. Verified live
 * against the sandbox process URL — alphabetical order is rejected by PayFast.
 */
export function payfastSignatureSource(fields: PayfastFields): string {
  return Object.keys(fields)
    .filter((k) => fields[k] !== '' && fields[k] != null)
    .map((k) => `${k}=${payfastEncode(fields[k])}`)
    .join('&')
}

/** MD5 of source + passphrase (when configured) — the PayFast `signature` value. */
export function payfastSignature(fields: PayfastFields, passphrase?: string): string {
  let source = payfastSignatureSource(fields)
  if (passphrase) source += `&passphrase=${payfastEncode(passphrase)}`
  return createHash('md5').update(source).digest('hex')
}

/** Checkout amount always comes from the ledger. Client-supplied cents are ignored. */
export function checkoutAmountCents(ledgerAmountRands: number, _clientAmountCents?: unknown): number {
  if (!Number.isFinite(ledgerAmountRands) || ledgerAmountRands <= 0) return 0
  return Math.round(ledgerAmountRands * 100)
}

function signaturesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** cents → "12.34" (PayFast amount format). */
export function centsToAmount(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2)
}

/** "12.34" → 1234 cents. Returns 0 for unparseable input. */
export function amountToCents(amount: string | number): number {
  const n = Number(String(amount).replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export type PayfastCheckoutInput = {
  /** Ledger payment FE id — sent as m_payment_id and echoed in ITN. */
  paymentId: string
  /** Integer cents. Converted to the PayFast decimal amount format. */
  amountCents: number
  itemName: string
  itemDescription?: string
  payer?: { firstName?: string; lastName?: string; email?: string }
  /** Absolute URLs — PayFast requires https in production. */
  returnUrl: string
  cancelUrl: string
  notifyUrl: string
  /** Optional subscription contract (recurring billing_type=1). */
  subscription?: { cycles: string; frequency: 3 | 4 | 5 | 6 | 7; annualRecurring?: string }
}

/** Assemble the full field set + signature for a checkout POST. */
export function buildCheckoutFields(
  config: PayfastConfig,
  input: PayfastCheckoutInput,
): Record<string, string> {
  const fields: PayfastFields = {
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    notify_url: input.notifyUrl,
    name_first: input.payer?.firstName ?? '',
    name_last: input.payer?.lastName ?? '',
    email_address: input.payer?.email ?? '',
    m_payment_id: input.paymentId,
    amount: centsToAmount(input.amountCents),
    item_name: input.itemName,
    item_description: input.itemDescription ?? '',
  }
  if (input.subscription) {
    fields.subscription_type = '1'
    fields.billing_date = new Date().toISOString().slice(0, 10)
    fields.recurring_amount = centsToAmount(input.amountCents)
    fields.frequency = String(input.subscription.frequency)
    fields.cycles = input.subscription.cycles
  }
  const signature = payfastSignature(fields, config.passphrase)
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v !== '' && v != null) out[k] = String(v)
  }
  out.signature = signature
  return out
}

export type ItnVerdict =
  | { ok: true; paymentId: string; amountCents: number; status: string; raw: Record<string, string> }
  | { ok: false; reason: string }

/**
 * Validate an ITN body against our ledger expectations.
 * Signature is required in sandbox and live. `sourceIp` must be a PayFast
 * address in both modes (the route resolves it from the platform header or
 * the last trusted proxy hop — never the client-controlled first XFF entry).
 * `expectedAmountCents` is the ledger payment amount (the same figure checkout
 * sends to PayFast).
 */
export function verifyItn(
  body: Record<string, string>,
  config: PayfastConfig,
  opts: {
    sourceIp?: string | null
    allowedIps?: ReadonlySet<string>
    expectedPaymentId?: string
    expectedAmountCents?: number
  },
): ItnVerdict {
  const allowed = opts.allowedIps ?? PAYFAST_ITN_IPS
  if (!opts.sourceIp || !allowed.has(opts.sourceIp)) {
    return { ok: false, reason: 'ITN source IP is not a PayFast endpoint' }
  }
  const signature = body.signature?.trim() ?? ''
  if (!signature) return { ok: false, reason: 'ITN missing signature' }
  const { signature: _drop, ...rest } = body
  const computed = payfastSignature(rest, config.passphrase)
  if (!signaturesMatch(computed, signature)) {
    return { ok: false, reason: 'ITN signature mismatch' }
  }
  const merchantId = (body.merchant_id ?? '').trim()
  if (!merchantId || merchantId !== config.merchantId) {
    return { ok: false, reason: 'ITN merchant_id does not match the configured merchant' }
  }
  const paymentId = body.m_payment_id
  if (!paymentId) return { ok: false, reason: 'ITN missing m_payment_id' }
  if (opts.expectedPaymentId && paymentId !== opts.expectedPaymentId) {
    return { ok: false, reason: 'ITN m_payment_id does not match any ledger payment' }
  }
  const status = body.payment_status ?? ''
  if (!['COMPLETE', 'CANCELLED'].includes(status)) {
    return { ok: false, reason: `ITN unexpected payment_status: ${status}` }
  }
  const amountCents = amountToCents(body.amount_gross ?? '')
  if (status === 'COMPLETE' && opts.expectedAmountCents != null) {
    if (!body.amount_gross?.trim()) {
      return { ok: false, reason: 'ITN missing amount_gross' }
    }
    if (Math.abs(amountCents - opts.expectedAmountCents) > 1) {
      return { ok: false, reason: `ITN amount ${body.amount_gross} does not match ledger amount` }
    }
  }
  return { ok: true, paymentId, amountCents, status, raw: body }
}

/** application/x-www-form-urlencoded body PayFast's validate endpoint expects (signature excluded). */
export function itnValidationBody(body: Record<string, string>): string {
  const parts: string[] = []
  for (const [key, val] of Object.entries(body)) {
    if (key === 'signature') continue
    parts.push(`${key}=${payfastEncode(val)}`)
  }
  return parts.join('&')
}

/**
 * PayFast server-to-server confirm. The response body is `VALID` or `INVALID`.
 * Callers must not mark a payment paid unless `valid` is true.
 * Tests pass a mock `fetchImpl` — never call the live or sandbox host from tests.
 */
export async function confirmItnWithPayfast(
  body: Record<string, string>,
  validateUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ valid: boolean; responseText: string }> {
  const res = await fetchImpl(validateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: itnValidationBody(body),
    signal: AbortSignal.timeout(10_000),
  })
  const responseText = (await res.text()).trim()
  return { valid: res.ok && responseText === 'VALID', responseText }
}
