import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { hideBackendUuid } from '../../lib/displayIds'
import { useAuth } from '../../context/AuthContext'
import { Card } from '../../components/ui'
import { Button } from '../../components/ui'

function qsRef(params: URLSearchParams): string | null {
  return params.get('ref')
}

export default function PayfastResultPage({ cancelled = false }: { cancelled?: boolean }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { state } = useStore()
  const { user } = useAuth()
  const ref = qsRef(params)

  const payment = useMemo(
    () => (ref ? state.payments.find((p) => p.id === ref) ?? null : null),
    [ref, state.payments],
  )

  // Ledger may still be DUE — ITN usually beats the browser redirect, but a
  // short refresh catches the late-arriving update either way.
  useEffect(() => {
    if (!cancelled && ref) {
      const t = setTimeout(() => {
        void import('../../hooks/useLiveSync').catch(() => undefined)
      }, 2500)
      return () => clearTimeout(t)
    }
  }, [cancelled, ref])

  const isPaid = payment?.status === 'Paid'

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 py-16">
      <Card className="w-full p-8 text-center">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
            isPaid || (cancelled && payment?.status !== 'Paid')
              ? 'bg-green-100 text-green-700'
              : 'bg-amber-100 text-amber-700'
          }`}
          aria-hidden
        >
          {cancelled ? '↩' : isPaid ? '✓' : '⏳'}
        </div>
        <h1 className="font-display text-xl font-semibold">
          {cancelled ? 'Payment cancelled' : isPaid ? 'Payment received' : 'Confirming payment…'}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          {cancelled
            ? 'No money moved. You can restart the payment any time from your payment page.'
            : isPaid
              ? 'PayFast confirmed the transaction and your ledger is updated. A receipt is attached to the payment.'
              : 'PayFast is finalising the transaction. Your ledger updates automatically the moment we receive confirmation — this page will be stale-safe if you refresh shortly.'}
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
          {payment ? (
            <Button onClick={() => navigate(`/workspace/operations/payments/${payment.id}`)}>
              View payment
            </Button>
          ) : (
            <Button onClick={() => navigate(user ? '/workspace/operations/payments' : '/')}>
              {user ? 'Go to payments' : 'Back to home'}
            </Button>
          )}
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
