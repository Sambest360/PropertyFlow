/**
 * Print a signed PayFast ITN JSON body for local QA.
 *
 * Credentials come from the environment (the same values the API is using).
 * This file does not contain a merchant id, key, or passphrase.
 *
 *   PAYFAST_MERCHANT_ID=... PAYFAST_MERCHANT_KEY=... PAYFAST_PASSPHRASE=... \
 *     node scripts/payfast-itn-fixture.mjs --payment-id <uuid> --amount 10.00
 *
 *   --status COMPLETE|CANCELLED
 *   --merchant-id <other>   sign this id so the signature is valid and the merchant check fails
 *   --bad-signature         replace the signature after signing
 */
import { createHash } from 'node:crypto'

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index === -1 || !process.argv[index + 1]) return fallback
  return process.argv[index + 1]
}

function enc(value) {
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

const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim()
const merchantKey = process.env.PAYFAST_MERCHANT_KEY?.trim()
const passphrase = process.env.PAYFAST_PASSPHRASE?.trim()
if (!merchantId || !merchantKey || !passphrase) {
  console.error('Set PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, and PAYFAST_PASSPHRASE')
  process.exit(1)
}

const paymentId = arg('--payment-id')
const amount = arg('--amount')
if (!paymentId || !amount) {
  console.error('Usage: node scripts/payfast-itn-fixture.mjs --payment-id <id> --amount <rands>')
  process.exit(1)
}

const fields = {
  merchant_id: arg('--merchant-id', merchantId),
  merchant_key: merchantKey,
  m_payment_id: paymentId,
  payment_status: arg('--status', 'COMPLETE'),
  amount_gross: amount,
  pf_payment_id: arg('--pf-payment-id', '1089250'),
  item_name: arg('--item-name', 'PropertyFlow QA'),
}

const source =
  Object.keys(fields)
    .filter((key) => fields[key] !== '' && fields[key] != null)
    .map((key) => `${key}=${enc(fields[key])}`)
    .join('&') + `&passphrase=${enc(passphrase)}`
fields.signature = process.argv.includes('--bad-signature')
  ? 'deadbeefdeadbeefdeadbeefdeadbeef'
  : createHash('md5').update(source).digest('hex')

process.stdout.write(`${JSON.stringify(fields)}\n`)
