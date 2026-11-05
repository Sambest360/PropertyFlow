import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ProofOfPaymentForm } from '../components/payments/ProofOfPaymentForm'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { Card, Modal } from '../components/ui'
import { PaymentDetailHeader } from '../components/payment-detail/PaymentDetailHeader'
import { PaymentOverviewPanel } from '../components/payment-detail/PaymentOverviewPanel'
import { PaymentDocumentsPanel } from '../components/payment-detail/PaymentDocumentsPanel'
import { MarkPaymentPaidModal } from '../components/payments/MarkPaymentPaidModal'
import {
  isPaymentDetailTab,
  type PaymentDetailTab,
} from '../components/payment-detail/types'
import { daysPastDue, isOpenPayment, type MarkPaymentPaidDetails } from '../components/payments/types'
import { canSendDunningNotice } from '../lib/rentCycle'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { useMarkOpened } from '../context/UnopenedContext'

export default function PaymentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { state, markPaymentPaid, updatePayment, removePayment, sendDunningNotice } = useStore()
  const { user, has, role } = useAuth()
  const { paymentVisible, canMutate } = usePropertyScope()
  const alert = useSuiteAlert()

  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  const [proofSent, setProofSent] = useState<string | null>(null)

  const payment = state.payments.find((p) => p.id === id)
  useMarkOpened('payment', payment?.id)

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

  /** The payer uploads proof of an EFT / deposit; the agency then marks it paid. */
  const handleProof = (input: import('../components/payments/ProofOfPaymentForm').ProofInput) => {
    if (!payment) return
    updatePayment(payment.id, {
      reference: input.reference || payment.reference || undefined,
      attachments: [...(payment.attachments ?? []), ...input.attachments],
      notes: input.notes ?? 'Proof of payment uploaded by the payer. Waiting for the agency to confirm.',
      recordedByUserId: user.id,
      recordedByName: user.name,
    })
    setProofOpen(false)
    setProofSent('Thank you. Your proof of payment is uploaded; the agency confirms it and marks the payment paid.')
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
      text: 'Payment details recorded.',
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


  const handleSendDunning = () => {
    if (!payment || !canMaintain) return
    const result = sendDunningNotice(payment.id, {
      actorUserId: user.id,
      actorName: user.name,
      // Staff may send before Day +3 — force reminder_1 when still early.
      stage: canSendDunningNotice(payment, new Date().toISOString().slice(0, 10))
        ? undefined
        : 'reminder_1',
    })
    if (result.ok === false) {
      void alert.success({
        title: 'Could not send notice',
        text: result.reason,
        tone: 'warning',
      })
      return
    }
    void alert.success({
      title: 'Dunning notice recorded',
      text: `In-app ${result.stage} notice recorded. Optional Mailtrap email only if ENABLE_EMAIL_DUNNING is on — not WhatsApp/SMS.`,
    })
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
          onPayOnline={() => setProofOpen(true)}
          onCancel={handleCancel}
          onRemove={handleRemove}
          onSendDunning={
            canMaintain &&
            payment &&
            isOpenPayment(payment.status) &&
            (payment.type === 'Rent' ||
              payment.type === 'First Month Rent' ||
              payment.type === 'Deposit') &&
            daysPastDue(payment) > 0
              ? handleSendDunning
              : undefined
          }
        />

        {(payment.status === 'Overdue' || daysOverdue > 0) && isOpenPayment(payment.status) && (
          <p
            className="mb-5 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
            role="status"
          >
            This payment is <strong>{daysOverdue || 0} days overdue</strong>. Follow up with the
            party, send an in-app dunning notice, or mark paid once received. In-app notice
            always; optional Mailtrap email only when ENABLE_EMAIL_DUNNING is on (not WhatsApp/SMS/bank debit).
          </p>
        )}

        {proofSent && (
          <p className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
            {proofSent}
          </p>
        )}
        <Modal open={proofOpen} onClose={() => setProofOpen(false)} title="Upload proof of payment">
          <ProofOfPaymentForm uploadedByName={user.name} onSubmit={handleProof} onCancel={() => setProofOpen(false)} />
        </Modal>

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
