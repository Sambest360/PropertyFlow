import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { RequirePermission } from '../components/RequirePermission'
import { Card, PageHeader } from '../components/ui'
import { PaymentsToolbar } from '../components/payments/PaymentsToolbar'
import { PaymentsListView } from '../components/payments/PaymentsListView'
import { PaymentPortfolioCard } from '../components/payments/PaymentPortfolioCard'
import {
  VIEW_STORAGE_KEY,
  daysPastDue,
  isOpenPayment,
  paymentAttentionScore,
  type PaymentAttentionFilter,
  type PaymentSortKey,
  type PaymentStatusFilter,
  type PaymentTypeFilter,
  type PaymentsViewMode,
  type PortfolioPayment,
} from '../components/payments/types'
import { useLookupOptions } from '../hooks/useLookupOptions'

function readStoredView(): PaymentsViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY)
    if (v === 'cards' || v === 'list') return v
  } catch {
    /* ignore */
  }
  return 'list'
}

export default function Payments() {
  const { state } = useStore()
  const { user, role } = useAuth()
  const { paymentVisible, allowedPropertyIds, agencyId } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const navigate = useNavigate()
  const paymentStatuses = useLookupOptions('PAYMENT_STATUS', agencyId)
  const paymentTypes = useLookupOptions('PAYMENT_TYPE', agencyId)
  const [searchParams, setSearchParams] = useSearchParams()

  const [q, setQ] = useState('')
  const [status, setStatus] = useState<PaymentStatusFilter>('all')
  const [type, setType] = useState<PaymentTypeFilter>('all')
  const [propertyId, setPropertyId] = useState(() => searchParams.get('property') || 'all')
  const [attention, setAttention] = useState<PaymentAttentionFilter>('all')
  const [sort, setSort] = useState<PaymentSortKey>('attention')
  const [view, setView] = useState<PaymentsViewMode>(() => readStoredView())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const hideParty = role === 'landlord'

  useEffect(() => {
    const prop = searchParams.get('property')
    const payment = searchParams.get('payment')
    if (prop) setPropertyId(prop)
    if (payment) {
      navigate(`/workspace/operations/payments/${encodeURIComponent(payment)}`, { replace: true })
    }
  }, [searchParams, navigate])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      /* ignore */
    }
  }, [view])

  const setPropertyFilter = (id: string) => {
    setPropertyId(id)
    const next = new URLSearchParams(searchParams)
    if (id === 'all') next.delete('property')
    else next.set('property', id)
    setSearchParams(next, { replace: true })
  }

  const toggleExpand = (item: PortfolioPayment) => {
    setExpandedId((id) => (id === item.payment.id ? null : item.payment.id))
  }

  const properties = useMemo(
    () =>
      state.properties
        .filter((p) => allowedPropertyIds.has(p.id))
        .map((p) => ({ id: p.id, title: p.title }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [state.properties, allowedPropertyIds],
  )

  const portfolio: PortfolioPayment[] = useMemo(() => {
    return state.payments
      .filter((p) => {
        const prop = state.properties.find((x) => x.id === p.propertyId)
        return paymentVisible(p, {
          viewerName: user.name,
          propertyLandlordId: prop?.landlordId,
        })
      })
      .map((payment) => {
        const property = state.properties.find((x) => x.id === payment.propertyId) ?? null
        const daysOverdue = daysPastDue(payment)
        const attachmentCount = payment.attachments?.length ?? 0
        return {
          payment,
          property,
          daysOverdue,
          attachmentCount,
          attentionScore: paymentAttentionScore(payment, daysOverdue, attachmentCount),
        }
      })
  }, [state.payments, state.properties, paymentVisible, user.name])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const p = item.payment
      if (status !== 'all' && p.status !== status) return false
      if (type !== 'all' && p.type !== type) return false
      if (propertyId !== 'all' && p.propertyId !== propertyId) return false

      if (attention === 'open' && !isOpenPayment(p.status)) return false
      if (attention === 'overdue' && !(p.status === 'Overdue' || item.daysOverdue > 0)) return false
      if (attention === 'paid' && p.status !== 'Paid') return false
      if (attention === 'cancelled' && p.status !== 'Cancelled') return false

      if (!needle) return true
      return (
        p.id.toLowerCase().includes(needle) ||
        p.type.toLowerCase().includes(needle) ||
        p.partyName.toLowerCase().includes(needle) ||
        (item.property?.title ?? '').toLowerCase().includes(needle) ||
        (item.property?.suburb ?? '').toLowerCase().includes(needle)
      )
    })

    rows = [...rows].sort((a, b) => {
      if (sort === 'attention') return b.attentionScore - a.attentionScore
      if (sort === 'amount') return b.payment.amount - a.payment.amount
      if (sort === 'status') return a.payment.status.localeCompare(b.payment.status)
      if (sort === 'property') {
        return (a.property?.title ?? '').localeCompare(b.property?.title ?? '')
      }
      if (sort === 'party') return a.payment.partyName.localeCompare(b.payment.partyName)
      return a.payment.dueDate.localeCompare(b.payment.dueDate)
    })

    return rows
  }, [portfolio, q, status, type, propertyId, attention, sort])

  const filtersActive =
    Boolean(q.trim()) ||
    status !== 'all' ||
    type !== 'all' ||
    propertyId !== 'all' ||
    attention !== 'all'

  const clearFilters = () => {
    setQ('')
    setStatus('all')
    setType('all')
    setPropertyFilter('all')
    setAttention('all')
  }

  const resultLabel =
    filtered.length === portfolio.length
      ? `${filtered.length} ${filtered.length === 1 ? 'payment' : 'payments'}`
      : `${filtered.length} of ${portfolio.length} payments`

  return (
    <RequirePermission permission="payments.view">
      <div className="animate-fade-in">
        <PageHeader
          title="Payments"
          subtitle="Scan the ledger, spot overdue lines and missing proof, then open a payment for full detail."
        />

        <PaymentsToolbar
          query={q}
          onQueryChange={setQ}
          status={status}
          onStatusChange={setStatus}
          type={type}
          onTypeChange={setType}
          propertyId={propertyId}
          onPropertyChange={setPropertyFilter}
          properties={properties}
          attention={attention}
          onAttentionChange={setAttention}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          resultLabel={resultLabel}
          reducedMotion={reducedMotion}
          paymentStatuses={paymentStatuses}
          paymentTypes={paymentTypes}
        />

        {portfolio.length === 0 ? (
          <Card className="p-10 text-center text-sm text-ink-500">
            No payments in your scope for this role.
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-ink-500">No payments match these filters.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl px-4 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Clear filters
            </button>
          </Card>
        ) : view === 'list' ? (
          <PaymentsListView
            items={filtered}
            expandedId={expandedId}
            onToggle={toggleExpand}
            hideParty={hideParty}
            reducedMotion={reducedMotion}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <PaymentPortfolioCard
                key={item.payment.id}
                item={item}
                expanded={expandedId === item.payment.id}
                onToggle={toggleExpand}
                hideParty={hideParty}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        )}

        {filtersActive && filtered.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-11 cursor-pointer items-center px-2 text-sm font-semibold text-primary transition-colors duration-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </RequirePermission>
  )
}
