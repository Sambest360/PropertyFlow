/**
 * Move-in vs move-out for one move-out inspection: two columns per item, red
 * Missing, amber Damaged, grey wear and tear, and a running deduction total
 * against the deposit + interest. The landlord or an agency admin approves
 * deductions here; approved lines go to the deposit release flow.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BackButton } from '../components/BackButton'
import { InspectionPhotoThumb } from '../components/inspections/InspectionPhotoThumb'
import { Badge, Button, Card, PageHeader, cn } from '../components/ui'
import { inspectionApi } from '../lib/inspections/api'
import {
  OUTCOME_LABEL,
  formatCents,
  toneClasses,
  withRunningTotal,
  type CompareBody,
  type ComparePhoto,
} from '../lib/inspections/compare'

type DecideResult = {
  totalCents: number
  warning: string | null
  deposit: { depositId: string; status: string; nextStep: string } | null
  depositWarning: string | null
}

const NEXT_STEP: Record<string, string> = {
  'propose-release': 'Next: propose the deposit release in the deposit register.',
  'approve-release': 'Next: a second admin approves the proposed release.',
  refund: 'Next: record the refund; the approved deductions prefill the split.',
  none: 'The deposit is not in a release step that takes deductions.',
}

function Photos({ photos, label }: { photos: ComparePhoto[]; label: string }) {
  if (!photos.length) return null
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
      {photos.map((p) => (
        <InspectionPhotoThumb key={p.documentId} url={p.url} uploadedAt={p.uploadedAt} label={label} />
      ))}
    </div>
  )
}

export default function InspectionComparePage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<CompareBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [decided, setDecided] = useState<DecideResult | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await inspectionApi<CompareBody>(`/api/inspections/${encodeURIComponent(id)}/compare`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the comparison')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => (data ? withRunningTotal(data.rows, data.capCents) : []), [data])
  const canDecide = user.role === 'landlord' || user.role === 'client_admin' || user.role === 'super_admin'
  const open = data?.suggestions.filter((s) => s.status === 'SUGGESTED') ?? []

  async function decide(status: 'APPROVED' | 'REJECTED') {
    if (!data || !open.length) return
    setBusy(true)
    setError(null)
    try {
      const result = await inspectionApi<DecideResult>(`/api/leases/${encodeURIComponent(data.leaseId)}/deductions`, {
        method: 'POST',
        body: JSON.stringify({ ids: open.map((s) => s.id), status }),
      })
      setDecided(result)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update deductions')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-36 sm:pb-6">
      <BackButton label="Back" onClick={() => navigate(-1)} />
      <PageHeader title="Move-in and move-out" subtitle="Item by item, with the deductions against the deposit held." />

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!data && !error && <Card className="p-6 text-sm text-ink-500">Loading…</Card>}

      {data && (
        <>
          {data.warning && (
            <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{data.warning}</p>
          )}

          <div className="hidden grid-cols-2 gap-3 px-4 text-xs font-semibold uppercase tracking-wide text-ink-500 sm:grid">
            <span>Move-in</span>
            <span>Move-out</span>
          </div>

          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.itemId} className={cn('rounded-2xl border p-4', toneClasses(row.tone))}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{row.itemName}</p>
                  <div className="flex items-center gap-2">
                    {row.addendum && <Badge tone="info">Addendum</Badge>}
                    {row.outcome && <span className="text-sm font-semibold">{OUTCOME_LABEL[row.outcome] ?? row.outcome}</span>}
                  </div>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-70 sm:hidden">Move-in</p>
                    <p className="text-sm">{row.moveInCondition ?? 'Not on the move-in'}</p>
                    <Photos photos={row.moveInPhotos} label={`${row.itemName} at move-in`} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-70 sm:hidden">Move-out</p>
                    <p className="text-sm">{row.moveOutCondition ?? 'Not checked'}</p>
                    <Photos photos={row.moveOutPhotos} label={`${row.itemName} at move-out`} />
                  </div>
                </div>
                <p className="mt-2 text-right text-xs">
                  {row.outcome === 'WEAR_AND_TEAR'
                    ? 'Wear and tear: not charged'
                    : `${formatCents(row.amountCents)} · running ${formatCents(row.runningCents)}`}
                </p>
              </li>
            ))}
            {rows.length === 0 && <Card className="p-4 text-sm text-ink-500">This inspection has no items yet.</Card>}
          </ul>

          <p className="text-xs text-ink-500">{data.deadlineNote}</p>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-primary-100 bg-white/95 p-3 backdrop-blur sm:static sm:rounded-2xl sm:border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                Deductions {formatCents(data.totalCents)} of {formatCents(data.capCents)} deposit + interest
                <span className="block text-xs font-normal text-ink-500">
                  Refund {formatCents(data.remainderCents)}
                  {data.capped ? ' · capped at the deposit held' : ''}
                </span>
              </p>
              {canDecide && open.length > 0 && !data.deemedGoodOrder && (
                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                  <Button disabled={busy} onClick={() => void decide('APPROVED')}>Approve deductions</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => void decide('REJECTED')}>Reject</Button>
                </div>
              )}
            </div>
            {decided && (
              <div className="mt-2 text-sm text-ink-600">
                <p>Approved total {formatCents(decided.totalCents)}.{decided.warning ? ` ${decided.warning}` : ''}</p>
                {decided.deposit ? (
                  <p>
                    {NEXT_STEP[decided.deposit.nextStep] ?? ''}{' '}
                    {user.role !== 'landlord' && (
                      <Link className="font-semibold text-primary underline" to="/workspace/trust/deposits">Deposit register</Link>
                    )}
                  </p>
                ) : (
                  decided.depositWarning && <p>{decided.depositWarning}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
