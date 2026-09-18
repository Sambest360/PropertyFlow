import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { startPayfastCheckout } from '../lib/payfast/checkout'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { Card } from '../components/ui'
import { PaymentDetailHeader } from '../components/payment-detail/PaymentDetailHeader'
import { PaymentOverviewPanel } from '../components/payment-detail/PaymentOverviewPanel'
import { PaymentDocumentsPanel } from '../components/payment-detail/PaymentDocumentsPanel'
import { MarkPaymentPaidModal } from '../components/payments/MarkPaymentPaidModal'
import {
  isPaymentDetailTab,
  type PaymentDetailTab,
} from '../components/payment-detail/types'
import { daysPastDue, isOpenPayment, type MarkPaymentPaidDetails } from '../components/payments/types'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'

export default function PaymentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { state, markPaymentPaid, updatePayment, removePayment } = useStore()
  const { user, has, role } = useAuth()
  const { paymentVisible, canMutate } = usePropertyScope()
  const alert = useSuiteAlert()

  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [payOnlineBusy, setPayOnlineBusy] = useState(false)
  const [payOnlineError, setPayOnlineError] = useState<string | null>(null)

  const payment = state.payments.find((p) => p.id === id)

  const tabParam = params.get('tab')
  const tab: PaymentDetailTab = isPaymentDetailTab(tabParam) ? tabParam : 'overview'
  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === 'overview') sp.delete('tab')
    else sp.set('tab', next)
    setParams(sp, { replace: true })
  }

  const property = useMemo(
    () =>
      payment ? state.properties.find((p) => p.id === payment.propertyId) ?? null : null,
    [payment, state.properties],
  )

  const inScope = useMemo(() => {
    if (!payment) return false
    return paymentVisible(payment, {
      viewerName: user.name,
      propertyLandlordId: property?.landlordId,
    })
  }, [payment, paymentVisible, user.name, property?.landlordId])

  const hideParty = role === 'landlord'
  const canMaintain = has('payments.manage')
  const canSelfPay =
    role === 'tenant' &&
    !!payment &&
    isOpenPayment(payment.status) &&
    (payment.partyUserId === user.id || payment.partyName === user.name)

  const handlePayOnline = async () => {
    if (!payment || payOnlineBusy) return
    setPayOnlineBusy(true)
    setPayOnlineError(null)
    const result = await startPayfastCheckout(payment.id, {
      itemName: `PropertyFlow · ${payment.type}`,
      payer: { firstName: user.name.split(' ')[0], lastName: user.name.split(' ').slice(1).join(' ') },
    })
    if (result.ok) {
      // Form submitted — browser navigates to PayFast.
      return
    }
    setPayOnlineBusy(false)
    setPayOnlineError(result.userMessage ?? 'Checkout could not be started.')
  }

  const handleMarkPaid = (details: MarkPaymentPaidDetails) => {
    if (!payment) return
    if (!canMutate(payment.propertyId) && role !== 'tenant') return
    markPaymentPaid(payment.id, {
      ...details,
      recordedByUserId: user.id,
      recordedByName: details.recordedByName ?? user.name,
    })
    setMarkPaidOpen(false)
    void alert.success({
      title: 'Payment marked paid',
      text: 'Settlement details were saved to the ledger.',
    })
  }

  const handleCancel = () => {
    if (!payment || !canMaintain) return
    updatePayment(payment.id, { status: 'Cancelled' })
    void alert.success({
      title: 'Payment cancelled',
      text: 'This line remains on the ledger as cancelled.',
    })
  }

  const handleRemove = async () => {
    if (!payment || !canMaintain) return
    const ok = await alert.confirmDelete({
      title: 'Remove unpaid payment?',
      text: 'This deletes the ledger line. Paid or cancelled payments cannot be removed.',
      confirmLabel: 'Remove',
    })
    if (!ok) return
    const removed = removePayment(payment.id)
    if (removed) {
      void alert.deleted({
        title: 'Payment removed',
        text: 'The unpaid ledger line was deleted.',
      })
      navigate('/workspace/operations/payments', { replace: true })
    } else {
      void alert.success({
        title: 'Cannot remove',
        text: 'Only due or overdue lines can be removed.',
        tone: 'warning',
      })
    }
  }

  const handleUpdateAttachments = (attachments: NonNullable<typeof payment>['attachments']) => {
    if (!payment) return
    updatePayment(payment.id, { attachments })
  }

  if (!payment) {
    return (
      <RequirePermission permission="payments.view">
        <Card className="p-10 text-center">
          <p className="text-sm text-ink-500">Payment not found.</p>
        </Card>
      </RequirePermission>
    )
  }

  if (!inScope) {
    return <Navigate to="/workspace/operations/payments" replace />
  }

  const daysOverdue = daysPastDue(payment)
  const attachmentCount = payment.attachments?.length ?? 0

  return (
    <RequirePermission permission="payments.view">
      <div className="animate-fade-in">
        <PaymentDetailHeader
          payment={payment}
          property={property}
          hideParty={hideParty}
          canMaintain={canMaintain}
          canSelfPay={canSelfPay}
          onMarkPaid={() => setMarkPaidOpen(true)}
          onPayOnline={handlePayOnline}
          payOnlineBusy={payOnlineBusy}
          onCancel={handleCancel}
          onRemove={handleRemove}
        />

        {(payment.status === 'Overdue' || daysOverdue > 0) && isOpenPayment(payment.status) && (
          <p
            className="mb-5 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
            role="status"
          >
            This payment is <strong>{daysOverdue || 0} days overdue</strong>. Follow up with the
            party or mark paid once received.
          </p>
        )}

        {payOnlineError && (
          <p
            className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {payOnlineError}
          </p>
        )}

        <DashboardTabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'documents', label: 'Documents', count: attachmentCount },
          ]}
          value={tab}
          onChange={setTab}
          className="mb-5"
        />

        <div>
          {tab === 'overview' && (
            <PaymentOverviewPanel payment={payment} property={property} hideParty={hideParty} />
          )}
          {tab === 'documents' && (
            <PaymentDocumentsPanel
              payment={payment}
              canManage={canMaintain}
              actorName={user.name}
              onUpdateAttachments={handleUpdateAttachments}
            />
          )}
        </div>

        <MarkPaymentPaidModal
          open={markPaidOpen}
          payment={payment}
          actorName={user.name}
          onClose={() => setMarkPaidOpen(false)}
          onConfirm={handleMarkPaid}
        />
      </div>
    </RequirePermission>
  )
}
