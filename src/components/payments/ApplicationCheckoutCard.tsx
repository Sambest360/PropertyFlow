import { useMemo, useRef, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Badge, Button, Card } from '../ui'
import { formatZAR } from '../../data/seed'
import type { PaymentRecord } from '../../types/domain'
import { startPayfastCheckout } from '../../lib/payfast/checkout'
import {
  AGENT_PAY_LABEL,
  APPLICANT_PAYS_COPY,
  SALE_DEPOSIT_EFT_COPY,
  createCheckoutLauncher,
  isOpenRow,
  isPayableOnline,
  outstandingTotal,
  paymentTypeLabel,
  rowStateLabel,
  type StartCheckout,
} from '../../lib/payfast/applicationCheckout'

/**
 * Pay card for one application (open-checkout-real).
 *
 * `rows` must be LIVE ledger rows from the store, already filtered with
 * applicationLedgerRows (this application; tenant: own rows only). Every row is
 * listed with its state; a Pay button appears only on Due/Overdue rows. A click
 * sends only that row's id to POST /api/payfast/create; the server signs and
 * reads the amount from the ledger, then the browser posts the signed form to
 * PayFast in the same tab. With no rows the card renders nothing.
 */
export function ApplicationCheckoutCard({
  rows,
  mode,
  canPay,
  start = startPayfastCheckout,
}: {
  rows: readonly PaymentRecord[]
  mode: 'tenant' | 'agent'
  /** Tenant: their own rows. Staff: payments.manage (same gate as Mark paid). */
  canPay: boolean
  start?: StartCheckout
}) {
  const startRef = useRef(start)
  startRef.current = start
  const launch = useMemo(() => createCheckoutLauncher((id, opts) => startRef.current(id, opts)), [])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (rows.length === 0) return null

  const total = outstandingTotal(rows)
  const anyOpen = rows.some(isOpenRow)

  const onPay = (p: PaymentRecord) => {
    if (busyId) return
    const pending = launch(p)
    setBusyId(p.id)
    setErrors((e) => {
      if (!(p.id in e)) return e
      const next = { ...e }
      delete next[p.id]
      return next
    })
    void pending.then((r) => {
      if (r === null) return // already starting / navigating
      if (!r.ok) {
        setErrors((e) => ({ ...e, [p.id]: r.userMessage || 'We could not start the PayFast checkout.' }))
        setBusyId((b) => (b === p.id ? null : b))
      }
      // ok: the browser is leaving for PayFast; keep the buttons held.
    })
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden />
        <h3 className="font-display text-base font-semibold">
          {mode === 'agent' ? 'Applicant payments' : 'Your payments'}
        </h3>
      </div>
      <ul className="mt-4 divide-y divide-primary-100/70">
        {rows.map((p) => {
          const payable = isPayableOnline(p)
          const saleEft = isOpenRow(p) && p.type === 'Sale Deposit' && !payable
          const typeLabel = paymentTypeLabel(p.type)
          const isBusy = busyId === p.id
          return (
            <li key={p.id} data-testid={`checkout-row-${p.id}`} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{rowStateLabel(p)}</p>
                  <p className="tabular text-xs text-ink-500">{formatZAR(p.amount)}</p>
                </div>
                {p.status === 'Paid' ? <Badge tone="success">Paid</Badge> : null}
                {p.status === 'Cancelled' ? <Badge tone="neutral">Cancelled</Badge> : null}
                {payable && canPay ? (
                  <Button
                    type="button"
                    size="sm"
                    data-testid={`pay-${p.id}`}
                    disabled={busyId !== null}
                    aria-busy={isBusy ? true : undefined}
                    aria-label={
                      mode === 'agent'
                        ? `${AGENT_PAY_LABEL}: ${typeLabel} ${formatZAR(p.amount)}`
                        : undefined
                    }
                    onClick={() => onPay(p)}
                  >
                    {mode === 'agent' ? AGENT_PAY_LABEL : `Pay ${String(p.type).toLowerCase()} · ${formatZAR(p.amount)}`}
                  </Button>
                ) : null}
              </div>
              {saleEft ? <p className="mt-1 text-xs text-ink-500">{SALE_DEPOSIT_EFT_COPY}</p> : null}
              {errors[p.id] ? (
                <p role="alert" className="mt-2 text-xs text-accent-700">
                  {errors[p.id]}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
      {anyOpen ? (
        <p className="mt-3 flex items-center justify-between border-t border-primary-100/70 pt-3 text-sm">
          <span className="text-ink-500">Total outstanding</span>
          <span className="tabular font-semibold">{formatZAR(total)}</span>
        </p>
      ) : null}
      {mode === 'agent' && !canPay && anyOpen ? (
        <p className="mt-2 text-xs text-ink-500">{APPLICANT_PAYS_COPY}</p>
      ) : null}
    </Card>
  )
}

export default ApplicationCheckoutCard
