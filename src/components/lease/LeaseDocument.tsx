import { useMemo, useState } from 'react'
import { Download, Eye, FileSignature, ShieldCheck } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import type { Tenancy } from '../../types/domain'
import { Badge, Button, Modal } from '../ui'
import { buildLeaseContract, type LeaseContract } from '../../lib/lease/leaseContract'
import { contractInputForTenancy } from '../../lib/lease/contractInput'
import { downloadLeasePdf } from '../../lib/lease/leaseDownload'

/** The full lease as readable text (used in the viewer and the sign dialog). */
export function LeaseContractView({ contract, compact }: { contract: LeaseContract; compact?: boolean }) {
  return (
    <article className={compact ? 'space-y-3 text-sm' : 'space-y-4 text-sm'}>
      <header>
        <p className="font-display text-lg font-semibold text-ink">{contract.title}</p>
        <p className="text-xs text-ink-500">{contract.reference} · {contract.version}</p>
      </header>
      <dl className="grid gap-x-4 gap-y-1 rounded-xl bg-primary-50/60 p-3 sm:grid-cols-2">
        {contract.summary.map(([k, v]) => (
          <div key={k} className="flex gap-2"><dt className="shrink-0 text-ink-500">{k}:</dt><dd className="font-medium text-ink">{v}</dd></div>
        ))}
      </dl>
      {contract.sections.map((s) => (
        <section key={s.title}>
          <h3 className="font-semibold text-ink">{s.title}</h3>
          <ol className="mt-1 space-y-1.5 text-ink-700">
            {s.clauses.map((c, i) => (
              <li key={i}><span className="mr-1 text-ink-400">{s.title.split('.')[0]}.{i + 1}</span>{c}</li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  )
}

export function useLeaseContract(tenancy: Tenancy | null | undefined): LeaseContract | null {
  const { state } = useStore()
  return useMemo(
    () => (tenancy ? buildLeaseContract(contractInputForTenancy(tenancy, { properties: state.properties, users: state.users, agencies: state.agencies })) : null),
    [tenancy, state.properties, state.users, state.agencies],
  )
}

const PARTY_LABEL: Record<string, string> = { pending: 'Waiting to sign', signed: 'Signed', declined: 'Declined', waived: 'Not needed' }

/** View / download buttons, signing status, and (optionally) a Sign button for one lease. */
export function LeaseDocumentActions({
  tenancy,
  onSign,
  signLabel = 'Sign the lease',
}: {
  tenancy: Tenancy
  onSign?: () => void
  signLabel?: string
}) {
  const { state } = useStore()
  const contract = useLeaseContract(tenancy)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const download = async () => {
    setBusy(true)
    setError('')
    try {
      await downloadLeasePdf(tenancy, { properties: state.properties, users: state.users, agencies: state.agencies })
    } catch {
      setError('Could not build the PDF. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const es = tenancy.eSign
  return (
    <div className="space-y-2" data-tip-target="lease-document">
      {es ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={es.tenant.status === 'signed' ? 'success' : 'warning'}>Tenant: {PARTY_LABEL[es.tenant.status]}</Badge>
          {es.landlord ? <Badge tone={es.landlord.status === 'signed' ? 'success' : 'warning'}>Landlord: {PARTY_LABEL[es.landlord.status]}</Badge> : null}
          {es.status === 'completed' ? <Badge tone="success"><ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden />Signed by all parties</Badge> : null}
        </div>
      ) : (
        <p className="text-xs text-ink-500">The agency has not sent this lease for signing yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Eye className="h-4 w-4" aria-hidden /> View lease</Button>
        <Button size="sm" variant="secondary" onClick={() => void download()} disabled={busy}>
          <Download className="h-4 w-4" aria-hidden /> {busy ? 'Preparing…' : es?.status === 'completed' ? 'Download signed PDF' : 'Download PDF'}
        </Button>
        {onSign ? <Button size="sm" onClick={onSign}><FileSignature className="h-4 w-4" aria-hidden /> {signLabel}</Button> : null}
      </div>
      {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}
      {open && contract ? (
        <Modal open onClose={() => setOpen(false)} title="Lease agreement" size="lg"
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Close</Button><Button onClick={() => void download()} disabled={busy}><Download className="h-4 w-4" aria-hidden /> Download PDF</Button></>}>
          <div className="max-h-[65vh] overflow-y-auto pr-1"><LeaseContractView contract={contract} /></div>
        </Modal>
      ) : null}
    </div>
  )
}
