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
 *     `notify_url`; we verify the source, validate the MD5 signature, and
 *     reconcile `m_payment_id` + `amount_gross` against our ledger.
 *
 * Money: PayFast `amount` is a decimal ZAR string ("12.34"). Our payments
 * table stores ZAR rand as numeric — convert at the edges.
 */

import { createHash } from 'node:crypto'
import { BlockList, isIPv4 } from 'node:net'

export const PAYFAST_PROCESS_URL = 'https://sandbox.payfast.co.za/eng/process'
export const PAYFAST_LIVE_PROCESS_URL = 'https://www.payfast.io/eng/process'
export const PAYFAST_VALIDATE_URL = 'https://sandbox.payfast.co.za/eng/query/validate'

/**
 * PayFast ITN source ranges (H1, spec r5 :45-50). Re-read from the PayFast
 * developer docs ("Confirm the source IP" / ITN security checks) on
 * 30 Oct 2026. Re-check these against the docs before each PayFast change;
 * PayFast announces range changes to merchants by email.
 */
export const PAYFAST_ITN_RANGES: ReadonlyArray<{ net: string; prefix: number }> = [
  { net: '197.97.145.144', prefix: 28 },
  { net: '41.74.179.192', prefix: 27 },
  { net: '102.216.36.0', prefix: 28 },
  { net: '102.216.36.128', prefix: 28 },
  { net: '144.126.193.139', prefix: 32 },
]

const PAYFAST_ITN_BLOCKLIST = (() => {
  const list = new BlockList()
  for (const r of PAYFAST_ITN_RANGES) list.addSubnet(r.net, r.prefix, 'ipv4')
  return list
})()

/** Host PayFast's sandbox ITNs come from; resolved by DNS in sandbox mode only. */
export const PAYFAST_SANDBOX_HOST = 'sandbox.payfast.co.za'

function plainIp(ip: string | null | undefined): string {
  const v = String(ip ?? '').trim().toLowerCase()
  return v.startsWith('::ffff:') && isIPv4(v.slice(7)) ? v.slice(7) : v
}

/** True when `ip` (IPv4, or IPv4-mapped IPv6) is inside a documented PayFast range. */
export function isPayfastItnIp(ip: string | null | undefined): boolean {
  const v = plainIp(ip)
  return isIPv4(v) && PAYFAST_ITN_BLOCKLIST.check(v, 'ipv4')
}

/** PayFast env config, resolved from the server environment. */
export type PayfastConfig = {
  merchantId: string
  merchantKey: string
  passphrase?: string
  /** Sandbox (default) or live process URL. */
  processUrl?: string
}

export function payfastConfigFromEnv(): PayfastConfig | null {
  const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim()
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY?.trim()
  const passphrase = process.env.PAYFAST_PASSPHRASE?.trim()
  if (!merchantId || !merchantKey) return null
  const live = process.env.PAYFAST_MODE?.trim().toLowerCase() === 'live'
  return {
    merchantId,
    merchantKey,
    passphrase: passphrase || undefined,
    processUrl: live ? PAYFAST_LIVE_PROCESS_URL : PAYFAST_PROCESS_URL,
  }
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

/** Live means the live process URL; anything else (including unset) is sandbox. */
export function payfastIsLive(config: PayfastConfig): boolean {
  return Boolean(config.processUrl) && config.processUrl !== PAYFAST_PROCESS_URL
}

/**
 * H1 R2: on a production box PayFast must be in live mode. Returns the boot
 * error to log, or null. Sandbox ITNs on production would trust DNS for
 * money, so this is loud (it does not stop the server: rent pages must stay up).
 */
export function payfastProductionModeError(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV !== 'production') return null
  if (!env.PAYFAST_MERCHANT_ID?.trim() || !env.PAYFAST_MERCHANT_KEY?.trim()) return null
  if (env.PAYFAST_MODE?.trim().toLowerCase() === 'live') return null
  return '[payfast] payfast_mode_not_live: NODE_ENV=production but PAYFAST_MODE is not "live"; sandbox ITNs are accepted from DNS-resolved addresses. Set PAYFAST_MODE=live.'
}

export type ItnVerdict =
  | { ok: true; paymentId: string; amountCents: number; status: string; raw: Record<string, string> }
  | { ok: false; reason: string }

/**
 * Validate an ITN body against our ledger expectations.
 *
 * `sourceIp` is the client IP from clientIp(c). There is no bypass: a
 * missing or unknown IP is rejected in both modes (H1).
 * Live: the IP must be inside PAYFAST_ITN_RANGES; DNS is never consulted.
 * Sandbox: the IP must be inside the ranges or in `sandboxAddresses` (the
 * resolved sandbox host). `sandboxAddresses` null/undefined means the lookup
 * failed, and the ITN is rejected (fail closed).
 */
export function verifyItn(
  body: Record<string, string>,
  config: PayfastConfig,
  opts: {
    sourceIp?: string | null
    sandboxAddresses?: ReadonlySet<string> | null
    expectedPaymentId?: string
    expectedAmountCents?: number
  },
): ItnVerdict {
  const ip = plainIp(opts.sourceIp)
  if (payfastIsLive(config)) {
    if (!isPayfastItnIp(ip)) return { ok: false, reason: 'ITN source IP is not a PayFast endpoint' }
  } else {
    if (!opts.sandboxAddresses) {
      return { ok: false, reason: 'ITN source IP could not be checked: sandbox host lookup failed' }
    }
    if (!isPayfastItnIp(ip) && !opts.sandboxAddresses.has(ip)) {
      return { ok: false, reason: 'ITN source IP is not a PayFast sandbox endpoint' }
    }
  }
  const signature = body.signature
  if (!signature) return { ok: false, reason: 'ITN missing signature' }
  const { signature: _drop, ...rest } = body
  const computed = payfastSignature(rest, config.passphrase)
  if (computed !== signature) {
    return { ok: false, reason: 'ITN signature mismatch' }
  }
  // H1 (spec r5 :55): a validly signed ITN for another merchant is not ours.
  if ((body.merchant_id ?? '').trim() !== config.merchantId) {
    return { ok: false, reason: 'ITN merchant_id does not match this merchant' }
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
  const amountCents = amountToCents(body.amount_gross ?? '0')
  if (
    opts.expectedAmountCents != null &&
    status === 'COMPLETE' &&
    Math.abs(amountCents - opts.expectedAmountCents) > 1 // 1c float tolerance
  ) {
    return { ok: false, reason: `ITN amount ${body.amount_gross} does not match ledger amount` }
  }
  return { ok: true, paymentId, amountCents, status, raw: body }
}
