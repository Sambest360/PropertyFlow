import type { SaasInvoice } from '../api/billingApi'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const money = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** A printable tax invoice (also what "Download PDF" prints). */
export function invoiceHtml(inv: SaasInvoice, origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  const rows = inv.lines
    .map((l) => `<tr><td>${esc(l.label)}</td><td class="n">${l.quantity}</td><td class="n">${money(l.unitPrice)}</td><td class="n">${money(l.amount)}</td></tr>`)
    .join('')
  const pays = inv.payments.length
    ? `<h3>Payments received</h3><table><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="n">Amount</th></tr></thead><tbody>${inv.payments
        .map((p) => `<tr><td>${esc(p.paidOn)}</td><td>${esc(p.method)}</td><td>${esc(p.reference || '—')}</td><td class="n">${money(p.amount)}</td></tr>`)
        .join('')}</tbody></table>`
    : ''
  const badge = inv.status === 'PAID' ? 'background:#dcfce7;color:#166534' : inv.status === 'OVERDUE' ? 'background:#fee2e2;color:#991b1b' : 'background:#fef3c7;color:#92400e'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title>
<style>
  body{font-family:Outfit,'Segoe UI',Arial,sans-serif;color:#0f2744;margin:0;padding:32px;background:#fff}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-top:6px solid #0B63C8;padding-top:20px}
  h1{font-size:26px;margin:0 0 4px} h3{font-size:14px;margin:24px 0 8px;color:#0B63C8;text-transform:uppercase;letter-spacing:.06em}
  .muted{color:#4a6788;font-size:13px;line-height:1.5}
  table{width:100%;border-collapse:collapse;font-size:13px} th{background:#0B63C8;color:#fff;text-align:left;padding:8px}
  td{padding:8px;border-bottom:1px solid #dceaf8} .n{text-align:right;white-space:nowrap}
  .tot td{border:0;padding:4px 8px} .grand td{font-size:16px;font-weight:700;border-top:2px solid #0f2744}
  .status{display:inline-block;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px;${badge}}
  @media print{body{padding:0}}
</style></head><body>
<div class="top">
  <div><img src="${origin}/brand/lekaya-logo-1024.png" alt="Lekaya Rentals" style="width:170px"><p class="muted">Lekaya Rentals<br>info@lekayarentals.site<br>lekayarentals.site</p></div>
  <div style="text-align:right"><h1>Tax invoice</h1><p class="muted"><b>${esc(inv.number)}</b><br>Issued ${esc(inv.issuedAt.slice(0, 10))}<br>Due ${esc(inv.dueDate)}</p><span class="status">${inv.status === 'PART_PAID' ? 'PART PAID' : inv.status === 'VOID' ? 'CANCELLED' : inv.status}</span></div>
</div>
<h3>Bill to</h3><p class="muted"><b>${esc(inv.agencyName)}</b><br>${inv.propertyCount} properties · ${inv.advertisedCount} advertised · ${esc(inv.periodLabel)}</p>
<table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<table style="width:320px;margin-left:auto;margin-top:12px" class="tot"><tbody>
<tr><td>Subtotal</td><td class="n">${money(inv.subtotal)}</td></tr>
<tr><td>VAT (15%)</td><td class="n">${money(inv.vat)}</td></tr>
<tr class="grand"><td>Total</td><td class="n">${money(inv.total)}</td></tr>
${inv.amountPaid ? `<tr><td>Paid</td><td class="n">${money(inv.amountPaid)}</td></tr><tr><td><b>Balance</b></td><td class="n"><b>${money(inv.balance)}</b></td></tr>` : ''}
</tbody></table>
${pays}
<h3>How to pay</h3><p class="muted">Pay by EFT and use <b>${esc(inv.number)}</b> as the reference, then upload your proof of payment under Admin → Subscription &amp; billing.</p>
</body></html>`
}
