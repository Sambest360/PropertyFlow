import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, ChevronRight, Plus, Search } from 'lucide-react'
import type { PaymentRecord } from '../../types/domain'
import { Badge, Button, Card, Input, Modal, Select, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { ListPagination, paginate } from './ListPagination'
import { ICON_STROKE } from './types'

const TYPES: PaymentRecord['type'][] = [
  'Deposit',
  'First Month Rent',
  'Rent',
  'Sale Deposit',
  'Commission',
  'Refund',
  'Other',
]

export function PropertyPaymentsPanel({
  payments,
  agencyId,
  propertyId,
  canManage,
  onCreate,
}: {
  payments: PaymentRecord[]
  agencyId: string
  propertyId: string
  canManage: boolean
  onCreate: (
    input: Omit<PaymentRecord, 'id' | 'paidAt' | 'method' | 'status'> &
      Partial<Pick<PaymentRecord, 'status' | 'paidAt' | 'method'>>,
  ) => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const navigate = useNavigate()
  const [partyName, setPartyName] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<PaymentRecord['type']>('Rent')
  const [dueDate, setDueDate] = useState('')
  const [method, setMethod] = useState('EFT')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return payments
    return payments.filter(
      (p) =>
        p.partyName.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q),
    )
  }, [payments, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const paged = useMemo(() => paginate(filtered, page), [filtered, page])

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page)
  }, [page, paged.page])

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
          <h2 className="font-semibold text-ink">Payments</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            <Input
              className="min-h-11 pl-9"
              placeholder="Filter payments…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {canManage && (
            <Button
              className="min-h-11"
              onClick={() => {
                setPartyName('')
                setAmount('')
                setType('Rent')
                setDueDate('')
                setMethod('EFT')
                setModalOpen(true)
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Add payment
            </Button>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {paged.items.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => navigate(`/workspace/operations/payments/${p.id}`)}
              className="flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-primary-100 bg-white px-4 py-3 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">
                  {p.type} · <span className="tabular">{formatZAR(p.amount)}</span>
                </span>
                <span className="text-xs text-ink-500">
                  {p.partyName} · due {p.dueDate}
                </span>
              </span>
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          </li>
        ))}
        {!filtered.length && (
          <li className="py-8 text-center text-sm text-ink-500">No payments for this property.</li>
        )}
      </ul>

      <ListPagination
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        pageSize={paged.pageSize}
        onPageChange={setPage}
        label="payments"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add payment"
        description="Record a due amount against this property."
        footer={
          <>
            <Button variant="secondary" className="min-h-11" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="min-h-11"
              disabled={!partyName.trim() || !dueDate || !amount}
              onClick={() => {
                const amt = Number(amount)
                if (!Number.isFinite(amt)) return
                onCreate({
                  agencyId,
                  propertyId,
                  applicationId: null,
                  tenancyId: null,
                  partyName: partyName.trim(),
                  partyUserId: null,
                  type,
                  amount: amt,
                  dueDate,
                  landlordVisible: true,
                  method,
                })
                setModalOpen(false)
              }}
            >
              Create payment
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
            Party name
            <Input
              className="mt-1 min-h-11"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Amount
            <Input
              type="number"
              className="mt-1 min-h-11 tabular"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Type
            <Select
              className="mt-1 min-h-11 w-full"
              value={type}
              onChange={(e) => setType(e.target.value as PaymentRecord['type'])}
            >
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Due date
            <Input
              type="date"
              className="mt-1 min-h-11"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Preferred method
            <Select
              className="mt-1 min-h-11 w-full"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {['EFT', 'Card', 'Cash', 'Debit order'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </label>
        </div>
      </Modal>
    </Card>
  )
}
