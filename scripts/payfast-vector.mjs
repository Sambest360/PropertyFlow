import { createHash } from 'node:crypto'

const f = {
  merchant_id: '10047719',
  merchant_key: 'wkq8dmfysau1q',
  return_url: 'https://pf.demo/pay/return',
  cancel_url: 'https://pf.demo/pay/cancel',
  notify_url: 'https://pf.demo/api/payfast/itn',
  name_first: 'Thandiwe',
  name_last: 'Mokoena',
  email_address: 'thandiwe@example.com',
  m_payment_id: 'PAY-1',
  amount: '1850.00',
  item_name: 'Rent October',
}
// Single-pass PHP urlencode semantics: escape specials first, then space -> +.
const enc = (v) =>
  String(v ?? '')
    .trim()
    .replace(/["#$%&'()*+,/:;<=>?@[\]^`{|}~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/ /g, '+')
// POSTED order (PayFast's PHP sample iterates $_POST as received) —
// alphabetical order is rejected by the sandbox process URL.
const keys = Object.keys(f).filter((k) => f[k] !== '' && f[k] != null)
const str =
  keys.map((k) => `${k}=${enc(f[k])}`).join('&') +
  '&passphrase=QjjCCNZ1VgtYaxivmXOWLmAlunZpU0Xk'
console.log('STR:', str)
console.log('MD5:', createHash('md5').update(str).digest('hex'))
