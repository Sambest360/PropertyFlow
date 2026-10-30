import { useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { hideBackendUuid } from '../../lib/displayIds'
import { useAuth } from '../../context/AuthContext'
import { Card } from '../../components/ui'
import { Button } from '../../components/ui'
import type { PaymentRecord, Role } from '../../types/domain'

function qsRef(params: URLSearchParams): string | null {
  return params.get('ref')
}

const STAFF_ROLES: ReadonlySet<Role> = new Set<Role>([
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
])

/** While the ITN has not landed yet, re-read the ledger from the server at these offsets (ms). */
export const PAYFAST_RETURN_REFRESH_MS = [2500, 8000, 20000] as const

/**
 * Jim A3: where "back" goes after PayFast. Tenant → their application's
 * payments tab; staff → the applicant page; otherwise the payments list.
 */
export function paymentBackLink(
  payment: Pick<PaymentRecord, 'applicationId'> | null,
  role: Role | null | undefined,
): { to: string; label: string } {
  const appId = payment?.applicationId
  if (appId && role === 'tenant') {
    return {
      to: `/workspace/portals/tenant/applications/${encodeURIComponent(appId)}?tab=payments`,
      label: 'Back to your application payments',
    }
  }
  if (appId && role && STAFF_ROLES.has(role)) {
    return { to: `/workspace/sales/applications/${encodeURIComponent(appId)}`, label: 'Back to the application' }
  }
  return { to: '/workspace/operations/payments', label: 'Go to payments' }
}

export default function PayfastResultPage({ cancelled = false }: { cancelled?: boolean }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { state, refreshSessionData } = useStore()
  const { user } = useAuth()
  const ref = qsRef(params)

  const payment = useMemo(
    () => (ref ? state.payments.find((p) => p.id === ref) ?? null : null),
    [ref, state.payments],
  )

  const isPaid = payment?.status === 'Paid'
  // Held in a ref so a new function identity never restarts the timers.
  const refreshRef = useRef(refreshSessionData)
  refreshRef.current = refreshSessionData

  // The browser often returns before PayFast's ITN reaches our server, so the
  // ledger row can still be Due. Re-read the session data from the server a
  // few times; the row flips to Paid in the store once the ITN has landed.
  useEffect(() => {
    if (cancelled || !ref || isPaid) return
    const timers = PAYFAST_RETURN_REFRESH_MS.map((ms) =>
      setTimeout(() => {
        void Promise.resolve(refreshRef.current({ force: true })).catch(() => undefined)
      }, ms),
    )
    return () => timers.forEach(clearTimeout)
  }, [cancelled, ref, isPaid])

  const back = paymentBackLink(payment, user?.role)
  const isStaff = Boolean(user?.role && STAFF_ROLES.has(user.role))

  const iconClass = cancelled
    ? 'bg-primary-50 text-ink-500'
    : isPaid
      ? 'bg-green-100 text-green-700'
      : 'bg-amber-100 text-amber-700'

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 py-16">
      <Card className="w-full p-8 text-center">
        <div
          data-testid="payfast-result-icon"
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl ${iconClass}`}
          aria-hidden
        >
          {cancelled ? '↩' : isPaid ? '✓' : '⏳'}
        </div>
        <h1 className="font-display text-xl font-semibold">
          {cancelled ? 'No payment was taken' : isPaid ? 'Payment received' : 'Payment received, confirming'}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          {cancelled
            ? 'You cancelled on PayFast, so nothing was charged. You can pay again from your application payments.'
            : isPaid
              ? 'PayFast confirmed the transaction and your ledger is updated. A receipt is attached to the payment.'
              : 'If you paid, do not pay again; confirmation can take a few minutes. This page checks for the confirmation automatically.'}
        </p>
        {payment && (
          <div className="mt-5 rounded-xl bg-primary-50 p-4 text-left text-sm">
            <p className="font-medium">{payment.type}</p>
            <p className="text-ink-500">
              Reference {payment.reference || hideBackendUuid(payment.id, 'Payment')} · R
              {(payment.amount ?? 0).toFixed(2)}
            </p>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2">
          {user ? (
            <Link
              to={back.to}
              data-testid="payfast-back-to-application"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600"
            >
              {back.label}
            </Link>
          ) : (
            <Button onClick={() => navigate('/')}>Back to home</Button>
          )}
          {payment && isStaff ? (
            <Link
              to={`/workspace/operations/payments/${encodeURIComponent(payment.id)}`}
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              View payment
            </Link>
          ) : null}
          <Link
            to="/"
            className="text-sm text-ink-400 underline-offset-2 hover:underline"
          >
            Back to Lekaya Rentals
          </Link>
        </div>
      </Card>
    </div>
  )
}
