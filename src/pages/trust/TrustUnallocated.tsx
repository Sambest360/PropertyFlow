import { useMemo, useState } from 'react'
import {
  Search,
  Split,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { formatZAR } from '../../data/seed'
import { PageHeader, Card, Button, Input, EmptyState } from '../../components/ui'
import { DashboardPage } from '../../components/dashboard'
import { FieldHelp } from '../../components/onboarding/FieldHelp'
import { TRUST_MODE_A_COPY } from '../../lib/trust/modeA'
import { sweetSuccess, sweetError } from '../../lib/sweetAlert'
import { labelOrReference } from '../../lib/displayIds'

function formatCents(cents: number): string {
  return formatZAR(cents / 100)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function TrustUnallocated() {
  const { state, allocateTrustReceipt, markTrustSuspense } = useStore()
  const { user } = useAuth()

  const [selectedTxn, setSelectedTxn] = useState<string | null>(null)
  const [searchOccupancy, setSearchOccupancy] = useState('')
  const [allocations, setAllocations] = useState<Array<{ occupancyId: string; bucketCode: string; amount: number }>>([])
  const [busy, setBusy] = useState(false)

  const agencyId = user?.agencyId

  const unallocated = useMemo(
    () =>
      state.trustTransactions?.filter(
        (t) =>
          t.status === 'unallocated' &&
          (!agencyId || t.agencyId === agencyId)
      ) ?? [],
    [state.trustTransactions, agencyId]
  )

  const occupancies = useMemo(
    () =>
      state.tenancies?.filter(
        (t) =>
          t.status === 'Active' &&
          (!agencyId || t.agencyId === agencyId)
      ) ?? [],
    [state.tenancies, agencyId]
  )

  const filteredOccupancies = useMemo(() => {
    if (!searchOccupancy) return occupancies
    const query = searchOccupancy.toLowerCase()
    return occupancies.filter(
      (o) =>
        o.tenantName.toLowerCase().includes(query) ||
        o.propertyId.toLowerCase().includes(query)
    )
  }, [occupancies, searchOccupancy])

  const selectedTransaction = useMemo(
    () => unallocated.find((t) => t.id === selectedTxn),
    [unallocated, selectedTxn]
  )

  const totalAllocated = useMemo(
    () => allocations.reduce((sum, a) => sum + a.amount, 0),
    [allocations]
  )

  const remaining = selectedTransaction
    ? selectedTransaction.amountCents - totalAllocated
    : 0

  function handleAddAllocation(occupancyId: string, amount: number) {
    setAllocations((prev) => [...prev, { occupancyId, bucketCode: 'rent', amount }])
  }

  function handleRemoveAllocation(index: number) {
    setAllocations((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleAllocate() {
    if (!selectedTxn || !user) return
    setBusy(true)
    const result = await allocateTrustReceipt({
      transactionId: selectedTxn,
      actorUserId: user.id,
      lines: allocations.map((a) => ({
        occupancyId: a.occupancyId,
        bucketCode: a.bucketCode,
        amountCents: Math.round(a.amount),
      })),
    })
    setBusy(false)
    if (!result.ok) {
      await sweetError('Cannot allocate', result.error ?? 'Allocation failed')
      return
    }
    await sweetSuccess(
      'Receipt allocated',
      'The receipt is now matched to occupancy buckets — visible in the cashbook.'
    )
    setSelectedTxn(null)
    setAllocations([])
  }

  async function handleMarkSuspense() {
    if (!selectedTxn || !user) return
    setBusy(true)
    await markTrustSuspense({ transactionId: selectedTxn, actorUserId: user.id })
    setBusy(false)
    await sweetSuccess(
      'Moved to suspense',
      'Matched to the agency but not to an occupancy — it will age and alert until resolved.'
    )
    setSelectedTxn(null)
  }

  return (
    <DashboardPage>
      <PageHeader
        title="Unallocated Receipts"
        subtitle="Manual allocate / suspense"
      />
      <div className="mb-2"><FieldHelp title="Unallocated receipts" body={TRUST_MODE_A_COPY} /></div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-ink-500">Unallocated Count</p>
          <p className="text-xl font-semibold text-amber-600">{unallocated.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Total Unallocated</p>
          <p className="text-xl font-semibold text-ink">
            {formatCents(unallocated.reduce((sum, t) => sum + t.amountCents, 0))}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Oldest Unallocated</p>
          <p className="text-xl font-semibold text-ink">
            {unallocated.length > 0
              ? formatDate(
                  unallocated.sort(
                    (a, b) => new Date(a.valueDate).getTime() - new Date(b.valueDate).getTime()
                  )[0].valueDate
                )
              : '—'}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Unallocated List */}
        <div>
          <h3 className="mb-3 text-lg font-semibold text-ink">Unallocated Transactions</h3>
          {unallocated.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                title="No unallocated receipts"
                description="All receipts have been allocated to occupancies."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {unallocated
                .sort((a, b) => new Date(a.valueDate).getTime() - new Date(b.valueDate).getTime())
                .map((txn) => (
                  <Card
                    key={txn.id}
                    className={`p-4 cursor-pointer transition-all ${
                      selectedTxn === txn.id
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'hover:border-primary-200'
                    }`}
                    onClick={() => setSelectedTxn(txn.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-ink">{txn.description}</p>
                        <p className="text-sm text-ink-500">
                          {formatDate(txn.valueDate)} • {txn.bankRef || 'No reference'}
                        </p>
                      </div>
                      <p className="font-semibold text-ink">{formatCents(txn.amountCents)}</p>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </div>

        {/* Allocation Panel */}
        <div data-tip-target="trust-unallocated-selection">
          <h3 className="mb-3 text-lg font-semibold text-ink">Allocation</h3>
          {selectedTransaction ? (
            <Card className="p-4">
              <div className="mb-4 rounded-lg bg-primary-50 p-3">
                <p className="text-sm font-medium text-ink-600">Selected Transaction</p>
                <p className="font-medium text-ink">{selectedTransaction.description}</p>
                <p className="text-lg font-semibold text-ink">
                  {formatCents(selectedTransaction.amountCents)}
                </p>
              </div>

              {/* Occupancy Search */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-ink-600 mb-1">
                  Search Occupancy
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    placeholder="Search by tenant or property..."
                    value={searchOccupancy}
                    onChange={(e) => setSearchOccupancy(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Occupancy List */}
              <div className="mb-4 max-h-48 overflow-y-auto">
                {filteredOccupancies.length === 0 ? (
                  <p className="text-sm text-ink-500">No occupancies found</p>
                ) : (
                  <div className="space-y-2">
                    {filteredOccupancies.map((occ) => {
                      const propertyLabel = labelOrReference(
                        state.properties.find((p) => p.id === occ.propertyId)?.title,
                        occ.propertyId,
                        'Property',
                      )
                      return (
                        // The whole row allocates — no need to hit the small split icon.
                        <button
                          key={occ.id}
                          type="button"
                          onClick={() => handleAddAllocation(occ.id, Math.min(occ.rent * 100, remaining))}
                          disabled={remaining <= 0}
                          aria-label={`Allocate to ${occ.tenantName}, ${propertyLabel}`}
                          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-primary-100 p-2 text-left transition-colors duration-150 hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">{occ.tenantName}</span>
                            <span className="block truncate text-xs text-ink-500">{propertyLabel}</span>
                          </span>
                          <Split className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Current Allocations */}
              {allocations.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium text-ink-600">Current Allocations</p>
                  <div className="space-y-2">
                    {allocations.map((alloc, index) => {
                      const occ = occupancies.find((o) => o.id === alloc.occupancyId)
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-lg bg-emerald-50 p-2"
                        >
                          <span className="text-sm text-ink">
                            {occ?.tenantName || alloc.occupancyId}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-emerald-600">
                              {formatCents(alloc.amount)}
                            </span>
                            <button
                              onClick={() => handleRemoveAllocation(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Remaining */}
              <div className="mb-4 rounded-lg bg-amber-50 p-3">
                <p className="text-sm text-ink-600">Remaining to allocate</p>
                <p className={`text-lg font-semibold ${remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {formatCents(remaining)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleAllocate}
                  disabled={busy || remaining < 0 || allocations.length === 0}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Allocate
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleMarkSuspense}
                  disabled={busy}
                >
                  <Clock className="h-4 w-4" />
                  Mark as Suspense
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <EmptyState
                title="Select a transaction"
                description="Click on an unallocated transaction to begin allocation."
              />
            </Card>
          )}
        </div>
      </div>
    </DashboardPage>
  )
}
