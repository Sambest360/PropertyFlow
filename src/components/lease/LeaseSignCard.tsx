import { useState } from 'react'
import { FileText } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import type { Tenancy } from '../../types/domain'
import { Card } from '../ui'
import { LeaseDocumentActions } from './LeaseDocument'
import { LeaseSignDialog } from './LeaseSignDialog'
import type { LeaseSignCapture } from '../../lib/lease/signaturePrefill'

/** One lease for a tenant or landlord: view, download and sign their own part. */
export function LeaseSignCard({ tenancy, party, title }: { tenancy: Tenancy; party: 'tenant' | 'landlord'; title?: string }) {
  const { state, recordTenancyLeaseSign } = useStore()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const block = party === 'tenant' ? tenancy.eSign?.tenant : tenancy.eSign?.landlord
  const mine = party === 'tenant' ? tenancy.tenantUserId === user.id : tenancy.landlordId === user.id
  const canSign = Boolean(tenancy.eSign?.envelopeId && block && block.status === 'pending' && mine)
  const property = state.properties.find((p) => p.id === tenancy.propertyId)

  const sign = async (capture: LeaseSignCapture & { signerName: string }) => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await recordTenancyLeaseSign({
        tenancyId: tenancy.id,
        party,
        signerName: capture.signerName,
        signatureDataUrl: capture.signatureDataUrl,
        method: capture.method,
        ectaConsent: capture.ectaConsent,
        actorUserId: user.id,
      })
      if (res.ok) {
        setOpen(false)
        setMsg({ ok: true, text: 'Thank you — your signature is saved. Everyone is told once all parties have signed.' })
      } else setMsg({ ok: false, text: res.error ?? 'Your signature was not saved. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink">{title ?? 'Lease agreement'}</h2>
          <p className="text-sm text-ink-500">
            {property?.title ?? tenancy.propertyId} · {tenancy.startDate} to {tenancy.endDate ?? 'month to month'}
          </p>
          {canSign ? <p className="mt-1 text-sm font-semibold text-amber-800">Your signature is needed. Read the lease, then sign.</p> : null}
        </div>
      </div>
      <LeaseDocumentActions tenancy={tenancy} onSign={canSign ? () => setOpen(true) : undefined} />
      {msg ? <p className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{msg.text}</p> : null}
      <LeaseSignDialog open={open} tenancy={tenancy} party={party} busy={busy} onClose={() => setOpen(false)} onSign={(c) => void sign(c)} />
    </Card>
  )
}
