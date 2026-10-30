/** Agency admins: their Lekaya plan, invoices, and uploading proof of payment. */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Card, PageHeader } from '../../components/ui'
import { InvoiceList, PricingCard, UploadProofModal } from '../../components/billing/BillingParts'
import { billingApi, formatRand, type SaasInvoice } from '../../lib/api/billingApi'

export default function AgencySubscriptionPage() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<SaasInvoice[]>([])
  const [error, setError] = useState('')
  const [proofFor, setProofFor] = useState<SaasInvoice | null>(null)
  const [flash, setFlash] = useState('')
  const load = () =>
    billingApi.invoices().then(setInvoices).catch((err) => setError(err instanceof Error ? err.message : 'Could not load invoices'))
  useEffect(() => {
    void load()
  }, [])

  const open = invoices.filter((i) => i.status !== 'PAID' && i.status !== 'VOID')
  const owed = open.reduce((a, i) => a + i.balance, 0)
  const today = new Date().toISOString().slice(0, 10)
  const late = open.filter((i) => i.dueDate < today)

  return (
    <div className="space-y-5">
      <PageHeader title="Subscription & billing" subtitle="Your monthly Lekaya Rentals invoices. Pay by EFT using the invoice number as reference, then upload your proof of payment." />
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}
      {flash ? <p className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-ink-700" role="status">{flash}</p> : null}
      {late.length ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {late.length} invoice{late.length === 1 ? ' is' : 's are'} past the due date. Please pay and upload the proof so your account stays in good standing.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4"><p className="text-xs text-ink-500">You owe</p><p className="text-2xl font-bold tabular text-ink">{formatRand(owed)}</p></Card>
        <Card className="p-4"><p className="text-xs text-ink-500">Latest plan</p><p className="text-lg font-semibold text-ink">{invoices[0] ? `${invoices[0].propertyCount} properties` : '—'}</p></Card>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-primary-50 px-5 py-3"><h2 className="font-semibold text-ink">Invoices</h2></div>
        <InvoiceList invoices={invoices} onUploadProof={setProofFor} />
      </Card>
      <PricingCard />
      <UploadProofModal invoice={proofFor} onClose={() => setProofFor(null)} actorName={user.name}
        onSaved={(inv) => { setProofFor(null); setFlash(`Proof sent for ${inv.number}. We will confirm it shortly.`); void load() }} />
    </div>
  )
}
