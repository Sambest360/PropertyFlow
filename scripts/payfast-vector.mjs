/**
 * Print a PayFast signature source and its MD5.
 *
 * Merchant id and key default to clearly fake placeholders. The passphrase
 * is generated at runtime unless PAYFAST_PASSPHRASE is set. This file does
 * not contain PayFast's published documentation credentials.
 *
 *   node scripts/payfast-vector.mjs
 *   PAYFAST_MERCHANT_ID=... PAYFAST_MERCHANT_KEY=... PAYFAST_PASSPHRASE=... \
 *     node scripts/payfast-vector.mjs
 */
import { createHash, randomBytes } from 'node:crypto'

const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim() || 'fake-merchant-id'
const merchantKey = process.env.PAYFAST_MERCHANT_KEY?.trim() || 'fake-merchant-key'
const passphrase = process.env.PAYFAST_PASSPHRASE?.trim() || randomBytes(12).toString('hex')

const fields = {
  merchant_id: merchantId,
  merchant_key: merchantKey,
  return_url: 'http://www.yourdomain.co.za/return.php',
  cancel_url: 'http://www.yourdomain.co.za/cancel.php',
  notify_url: 'http://www.yourdomain.co.za/notify.php',
  name_first: 'First Name',
  name_last: 'Last Name',
  email_address: 'test@test.com',
  m_payment_id: '1234',
  amount: '10.00',
  item_name: 'Order#123',
}

function phpUrlEncode(value) {
  const raw = String(value ?? '').trim()
  const bytes = Buffer.from(raw, 'utf8')
  let out = ''
  for (const byte of bytes) {
    const digit = byte >= 48 && byte <= 57
    const upper = byte >= 65 && byte <= 90
    const lower = byte >= 97 && byte <= 122
    const unreserved = digit || upper || lower || byte === 45 || byte === 95 || byte === 46
    if (unreserved) out += String.fromCharCode(byte)
    else if (byte === 32) out += '+'
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

const param = Object.keys(fields)
  .filter((key) => fields[key] !== '' && fields[key] != null)
  .map((key) => `${key}=${phpUrlEncode(fields[key])}`)
  .join('&')
const source = `${param}&passphrase=${phpUrlEncode(passphrase)}`
console.log('STR:', source)
console.log('MD5:', createHash('md5').update(source).digest('hex'))
