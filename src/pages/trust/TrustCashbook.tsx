import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Upload,
  Download,
  Search,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { formatZAR } from '../../data/seed'
import { PageHeader, Card, Badge, Button, Input, Select, EmptyState } from '../../components/ui'
import { DashboardPage } from '../../components/dashboard'


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

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'allocated':
    case 'settled':
      return 'success'
    case 'unallocated':
      return 'warning'
    case 'reversed':
    case 'failed':
      return 'danger'
    case 'received':
    case 'recognised':
      return 'info'
    default:
      return 'neutral'
  }
}

export default function TrustCashbook() {
  const { state } = useStore()
  const { user } = useAuth()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [directionFilter, setDirectionFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const agencyId = user?.agencyId

  const transactions = useMemo(() => {
    let result = state.trustTransactions?.filter((t) => !agencyId || t.agencyId === agencyId) ?? []

    // Apply filters
    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter)
    }
    if (directionFilter !== 'all') {
      result = result.filter((t) => t.direction === directionFilter)
    }
    if (dateFrom) {
      result = result.filter((t) => t.valueDate >= dateFrom)
    }
    if (dateTo) {
      result = result.filter((t) => t.valueDate <= dateTo)
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(query) ||
          t.bankRef?.toLowerCase().includes(query) ||
          t.partnerTxnId?.toLowerCase().includes(query)
      )
    }

    return result.sort((a, b) => new Date(b.valueDate).getTime() - new Date(a.valueDate).getTime())
  }, [state.trustTransactions, agencyId, statusFilter, directionFilter, dateFrom, dateTo, searchQuery])

  const totalIn = useMemo(
    () => transactions.filter((t) => t.direction === 'in').reduce((sum, t) => sum + t.amountCents, 0),
    [transactions]
  )

  const totalOut = useMemo(
    () => transactions.filter((t) => t.direction === 'out').reduce((sum, t) => sum + t.amountCents, 0),
    [transactions]
  )

  return (
    <DashboardPage>
      <PageHeader
        title="Trust Cashbook"
        subtitle="Immutable record of all trust transactions"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="primary" size="sm">
              <Upload className="h-4 w-4" />
              Import Bank CSV
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-ink-500">Total In</p>
          <p className="text-xl font-semibold text-emerald-600">{formatCents(totalIn)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Total Out</p>
          <p className="text-xl font-semibold text-red-600">{formatCents(totalOut)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Net Movement</p>
          <p className={`text-xl font-semibold ${(totalIn - totalOut) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCents(totalIn - totalOut)}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-ink-600 mb-1">Status</label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="received">Received</option>
                <option value="recognised">Recognised</option>
                <option value="allocated">Allocated</option>
                <option value="unallocated">Unallocated</option>
                <option value="reversed">Reversed</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-600 mb-1">Direction</label>
              <Select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}>
                <option value="all">All directions</option>
                <option value="in">Incoming</option>
                <option value="out">Outgoing</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-600 mb-1">From date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-600 mb-1">To date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Transactions List */}
      <Card>
        {transactions.length === 0 ? (
          <EmptyState
            title="No transactions found"
            description="No transactions match your filters. Try adjusting your search criteria."
          />
        ) : (
          <div className="divide-y divide-primary-100">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 bg-primary-50/50 px-4 py-3 text-xs font-medium text-ink-500">
              <div className="col-span-1">Type</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-4">Description</div>
              <div className="col-span-2">Reference</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2 text-right">Amount</div>
            </div>

            {/* Transaction Rows */}
            {transactions.map((txn) => (
              <div
                key={txn.id}
                className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-primary-50/30 transition-colors"
              >
                <div className="col-span-1">
                  {txn.direction === 'in' ? (
                    <ArrowDownLeft className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <ArrowUpRight className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div className="col-span-2 text-sm text-ink-600">
                  {formatDate(txn.valueDate)}
                </div>
                <div className="col-span-4 text-sm text-ink">
                  <p className="font-medium">{txn.description}</p>
                  <p className="text-xs text-ink-400">{txn.partnerTxnId}</p>
                </div>
                <div className="col-span-2 text-sm text-ink-500 font-mono">
                  {txn.bankRef || '—'}
                </div>
                <div className="col-span-1">
                  <Badge tone={statusTone(txn.status)}>
                    {txn.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className={`col-span-2 text-right font-semibold tabular ${txn.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {txn.direction === 'in' ? '+' : '-'}{formatCents(txn.amountCents)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Import Notice */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>CSV Import:</strong> Upload a bank statement CSV to import trust transactions. The system will
        attempt to auto-match transactions to existing charges and occupancies. Unmatched transactions will
        appear in the Unallocated queue for manual allocation.
      </div>
    </DashboardPage>
  )
}
