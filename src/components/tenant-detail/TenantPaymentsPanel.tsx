import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { PaymentRecord } from '../../types/domain'
import { Badge, Card, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { ICON_STROKE } from './types'

export function TenantPaymentsPanel({ payments }: { payments: PaymentRecord[] }) {
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Payments</h2>
      <p className="mt-1 text-sm text-ink-500">Ledger lines linked to this tenant or lease.</p>
      {!payments.length ? (
        <p className="mt-4 py-8 text-center text-sm text-ink-500">No payments linked yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-primary-50 overflow-hidden rounded-xl border border-primary-100">
          {payments.map((p) => (
            <li key={p.id}>
              <Link
                to={`/workspace/operations/payments/${encodeURIComponent(p.id)}`}
                className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">{p.type}</span>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </span>
                  <span className="mt-0.5 block text-xs tabular text-ink-500">
                    Due {p.dueDate}
                    {p.paidAt ? ` · Paid ${p.paidAt}` : ''}
                  </span>
                </span>
                <span className="shrink-0 tabular text-sm font-semibold text-ink">
                  {formatZAR(p.amount)}
                </span>
                <ChevronRight className="h-4 w-4 text-ink-300" strokeWidth={ICON_STROKE} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
