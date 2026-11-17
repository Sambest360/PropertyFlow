import { useEffect, useState } from 'react'
import { Scale } from 'lucide-react'
import { Card, Button, Input } from '../ui'
import { formatZAR } from '../../data/seed'
import { parseSignedCents } from '../../lib/trust/csvImport'
import { todayYmd } from '../../lib/trust/tenancyArrears'
import {
  fetchTrustReconciliation,
  recordTrustReconciliation,
  type TrustReconciliation,
} from '../../lib/api/trustBankApi'
import { sweetSuccess, sweetError } from '../../lib/sweetAlert'

const cents = (c: number) => formatZAR(c / 100)

/**
 * Lekaya ledger balance vs the bank statement closing balance. The ledger is
 * summed on the server over every row, not just the rows loaded in the page.
 */
export function BankReconciliationCard({
  agencyId,
  prefill,
  refreshKey,
}: {
  agencyId: string
  /** Closing balance read from the last imported statement. */
  prefill?: { valueDate: string; cents: number } | null
  /** Changes when the cashbook changes, so the ledger figure reloads. */
  refreshKey: number
}) {
  const [asOf, setAsOf] = useState(todayYmd())
  const [bankInput, setBankInput] = useState('')
  const [rec, setRec] = useState<TrustReconciliation | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!prefill) return
    setAsOf(prefill.valueDate)
    setBankInput((prefill.cents / 100).toFixed(2))
  }, [prefill])

  useEffect(() => {
    let live = true
    void fetchTrustReconciliation(agencyId, asOf).then((r) => {
      if (!live) return
      setRec(r.ok ? r.data : null)
      setLoadError(r.ok ? null : r.error)
    })
    return () => {
      live = false
    }
  }, [agencyId, asOf, refreshKey])

  const bankCents = bankInput.trim() ? parseSignedCents(bankInput) : null
  const difference = rec && bankCents != null ? bankCents - rec.ledgerBalanceCents : null

  async function handleRecord() {
    if (bankCents == null) return
    setBusy(true)
    const r = await recordTrustReconciliation(agencyId, asOf, bankCents)
    setBusy(false)
    if (!r.ok) {
      await sweetError('Reconciliation not recorded', r.error)
      return
    }
    setRec((prev) => (prev ? { ...prev, last: r.data.reconciliation } : prev))
    await sweetSuccess(
      'Reconciliation recorded',
      r.data.reconciliation.differenceCents === 0
        ? 'Lekaya agrees with the bank.'
        : `Difference of ${cents(r.data.reconciliation.differenceCents)} recorded for follow-up.`,
    )
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Scale className="h-4 w-4 text-ink-500" aria-hidden />
        <h3 className="text-base font-semibold text-ink">Bank reconciliation</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-600">Statement date</span>
          <Input type="date" value={asOf} max={todayYmd()} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-600">Bank closing balance (R)</span>
          <Input inputMode="decimal" placeholder="e.g. 20250.00" value={bankInput} onChange={(e) => setBankInput(e.target.value)} />
        </label>
        <div className="text-sm">
          <p className="mb-1 font-medium text-ink-600">Lekaya ledger balance</p>
          <p className="text-lg font-semibold text-ink">{rec ? cents(rec.ledgerBalanceCents) : '—'}</p>
        </div>
        <div className="text-sm" aria-live="polite">
          <p className="mb-1 font-medium text-ink-600">Difference (bank − ledger)</p>
          <p className={`text-lg font-semibold ${difference == null ? 'text-ink-400' : difference === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {difference == null ? '—' : difference === 0 ? 'Balanced' : cents(difference)}
          </p>
        </div>
      </div>
      {loadError && <p className="mt-2 text-sm text-red-600">Could not load the ledger balance: {loadError}</p>}
      {bankInput.trim() && bankCents == null && <p className="mt-2 text-sm text-red-600">Enter the balance as a number, e.g. 20250.00</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500">
          {rec && rec.unallocatedCount > 0
            ? `${rec.unallocatedCount} receipt(s) worth ${cents(rec.unallocatedCents)} are not yet allocated to a tenant. `
            : ''}
          {rec?.last
            ? `Last recorded: ${rec.last.asOf}, difference ${rec.last.differenceCents === 0 ? 'none' : cents(rec.last.differenceCents)}.`
            : 'No reconciliation recorded yet.'}
        </p>
        <Button variant="secondary" size="sm" disabled={busy || bankCents == null || !rec} onClick={handleRecord}>
          Record reconciliation
        </Button>
      </div>
    </Card>
  )
}
