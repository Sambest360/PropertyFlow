/**
 * PayFast's published signature example (developers.payfast.co.za custom integration).
 * Merchant id, key and passphrase below are PayFast's public documentation values,
 * not PropertyFlow credentials. Real credentials belong in server env only:
 * PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE.
 *
 * Optional overrides: PAYFAST_MERCHANT_ID / PAYFAST_MERCHANT_KEY / PAYFAST_PASSPHRASE.
 */
import { createHash } from 'node:crypto'

const f = {
  merchant_id: process.env.PAYFAST_MERCHANT_ID?.trim() || '10000100',
  merchant_key: process.env.PAYFAST_MERCHANT_KEY?.trim() || '46f0cd694581a',
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
const passphrase = process.env.PAYFAST_PASSPHRASE?.trim() || 'jt7NOE43FZPn'

const enc = (value) => {
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

const keys = Object.keys(f).filter((k) => f[k] !== '' && f[k] != null)
const str = keys.map((k) => `${k}=${enc(f[k])}`).join('&') + `&passphrase=${enc(passphrase)}`
console.log('STR:', str)
console.log('MD5:', createHash('md5').update(str).digest('hex'))
