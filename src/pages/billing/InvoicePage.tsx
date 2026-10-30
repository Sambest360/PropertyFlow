/** One Lekaya invoice: view, print / save as PDF, payments, proof uploads. */
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button, Card, PageHeader } from '../../components/ui'
import { InvoiceStatusBadge, RecordPaymentModal, UploadProofModal, asPaymentAttachments } from '../../components/billing/BillingParts'
import { PaymentAttachmentsList } from '../../components/payments/PaymentAttachmentsField'
import { billingApi, formatRand, type SaasInvoice } from '../../lib/api/billingApi'
import { invoiceHtml } from '../../lib/billing/invoiceHtml'

export default function InvoicePage() {
  const { id = '' } = useParams()
  const { user, role } = useAuth()
  const [inv, setInv] = useState<SaasInvoice | null>(null)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'pay' | 'proof' | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    billingApi.invoice(id).then(setInv).catch((err) => setError(err instanceof Error ? err.message : 'Invoice not found'))
  }, [id])

  const back = role === 'super_admin' ? '/workspace/platform/billing' : '/workspace/admin/subscription'
  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
  if (!inv) return <p className="text-sm text-ink-500">Loading invoice…</p>
  const open = inv.status !== 'PAID' && inv.status !== 'VOID'

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Invoice ${inv.number}`}
        subtitle={`${inv.agencyName} · ${inv.periodLabel} · ${formatRand(inv.total)} incl. VAT`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={back}><Button variant="secondary"><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Button></Link>
            <Button variant="secondary" onClick={() => frame.current?.contentWindow?.print()}><Download className="h-4 w-4" aria-hidden /> Download PDF</Button>
            {open && role === 'super_admin' ? <Button onClick={() => setModal('pay')}>Record payment</Button> : null}
            {open && role !== 'super_admin' ? <Button onClick={() => setModal('proof')}>Upload proof of payment</Button> : null}
          </div>
        }
      />
      <InvoiceStatusBadge invoice={inv} />
      <Card className="overflow-hidden p-0">
        <iframe ref={frame} title={`Invoice ${inv.number}`} srcDoc={invoiceHtml(inv)} className="h-[75vh] w-full bg-white" />
      </Card>
      {inv.payments.length ? (
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold text-ink">Payments</h2>
          {inv.payments.map((p) => (
            <div key={p.id} className="rounded-xl border border-primary-100 p-3 text-sm">
              <p className="font-semibold text-ink">{formatRand(p.amount)} · {p.method} · {p.paidOn}</p>
              <p className="text-xs text-ink-500">Recorded by {p.recordedBy}{p.reference ? ` · ref ${p.reference}` : ''}{p.note ? ` · ${p.note}` : ''}</p>
              {p.attachments.length ? <div className="mt-2"><PaymentAttachmentsList attachments={asPaymentAttachments(p.attachments)} /></div> : null}
            </div>
          ))}
        </Card>
      ) : null}
      {inv.proofs.length ? (
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold text-ink">Proof uploaded by the agency</h2>
          {inv.proofs.map((p) => (
            <div key={p.id} className="rounded-xl border border-primary-100 p-3 text-sm">
              <p className="text-ink-600">{p.uploadedBy} · {new Date(p.at).toLocaleString()}{p.reference ? ` · ref ${p.reference}` : ''}</p>
              {p.note ? <p className="text-xs text-ink-500">{p.note}</p> : null}
              {p.attachments.length ? <div className="mt-2"><PaymentAttachmentsList attachments={asPaymentAttachments(p.attachments)} /></div> : null}
            </div>
          ))}
        </Card>
      ) : null}
      {modal === 'pay' ? <RecordPaymentModal invoice={inv} onClose={() => setModal(null)} actorName={user.name} onSaved={(x) => { setInv(x); setModal(null) }} /> : null}
      {modal === 'proof' ? <UploadProofModal invoice={inv} onClose={() => setModal(null)} actorName={user.name} onSaved={(x) => { setInv(x); setModal(null) }} /> : null}
    </div>
  )
}
