/**
 * Mode A renewals + escalation panel beside leases (#15).
 * Offer / accept / decline on book; soft CPA notice; scheduled % (not CPI).
 */
import { useMemo, useState } from 'react'
import type { Tenancy } from '../../types/domain'
import { Badge, Button } from '../ui'
import { formatZAR } from '../../data/seed'
import {
  CPA_NOTICE_LATE_COPY,
  canSendCpaExpiryNotice,
  computeCpaNoticeWindow,
  ensureRenewalOps,
  isEscalationDue,
  needsMonthToMonthNote,
} from '../../lib/renewals'
import { RenewalsModeABanner } from './RenewalsModeABanner'

export type LeaseRenewalsHandlers = {
  onOffer: (input: {
    tenancyId: string
    offeredEndDate?: string
    offeredRent?: number
    termMonths?: number
  }) => void
  onAccept: (tenancyId: string) => void
  onDecline: (tenancyId: string) => void
  onMonthToMonth: (tenancyId: string) => void
  onSendCpaNotice: (tenancyId: string) => void
  onSetEscalation: (input: {
    tenancyId: string
    escalationPct: number | null
    nextEscalationOn: string | null
  }) => void
  onApplyEscalation: (tenancyId: string) => void
}

export function LeaseRenewalsPanel({
  tenancy,
  propertyTitle,
  asOf,
  busy = false,
  handlers,
  compact = false,
}: {
  tenancy: Tenancy
  propertyTitle?: string
  asOf?: string
  busy?: boolean
  handlers: LeaseRenewalsHandlers
  compact?: boolean
}) {
  const day = (asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
  const ops = ensureRenewalOps(tenancy, day)
  const window = computeCpaNoticeWindow(tenancy.endDate, day)
  const canNotice = canSendCpaExpiryNotice(tenancy.endDate, ops, day)
  const escalationDue = isEscalationDue(tenancy.billingSchedule, day)
  const m2m = needsMonthToMonthNote(tenancy, day)

  const [offeredRent, setOfferedRent] = useState(String(ops.offeredRent ?? tenancy.rent))
  const [offeredEnd, setOfferedEnd] = useState(ops.offeredEndDate ?? '')
  const [termMonths, setTermMonths] = useState(String(ops.offeredTermMonths || 12))
  const [escPct, setEscPct] = useState(
    tenancy.billingSchedule?.escalationPct != null
      ? String(tenancy.billingSchedule.escalationPct)
      : '',
  )
  const [escNext, setEscNext] = useState(tenancy.billingSchedule?.nextEscalationOn ?? '')

  const electionLabel = useMemo(() => {
    switch (ops.election) {
      case 'offered':
        return 'Renewal offered'
      case 'accepted':
        return 'Renewed on book'
      case 'declined':
        return 'Declined · notice given'
      case 'month_to_month':
        return 'Month-to-month (no election)'
      default:
        return 'No election'
    }
  }, [ops.election])

  return (
    <section
      className={
        compact
          ? 'space-y-3 rounded-xl border border-primary-100 bg-primary-50/40 p-3'
          : 'space-y-4 rounded-2xl border border-primary-100 bg-white p-4 shadow-sm'
      }
      data-testid={`lease-renewals-panel-${tenancy.id}`}
    >
      {!compact ? <RenewalsModeABanner /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">Renewals & escalation</h3>
        <Badge tone="neutral">{electionLabel}</Badge>
        {ops.cpaNotice.late ? (
          <Badge tone="danger">CPA late · {CPA_NOTICE_LATE_COPY}</Badge>
        ) : window?.open ? (
          <Badge tone="warning">CPA notice window open</Badge>
        ) : null}
        {escalationDue ? <Badge tone="warning">Escalation due</Badge> : null}
      </div>

      <dl className="grid gap-2 text-xs text-ink-500 sm:grid-cols-2">
        <div>
          <dt className="font-medium">Lease end</dt>
          <dd className="text-sm text-ink">{tenancy.endDate ?? 'Open-ended'}</dd>
        </div>
        <div>
          <dt className="font-medium">Rent (book)</dt>
          <dd className="text-sm text-ink">{formatZAR(tenancy.rent)}</dd>
        </div>
        <div>
          <dt className="font-medium">CPA window</dt>
          <dd className="text-sm text-ink">
            {window
              ? `${window.windowOpen} → ${window.windowClose}`
              : 'N/A (no fixed end)'}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Escalation</dt>
          <dd className="text-sm text-ink">
            {tenancy.billingSchedule?.escalationPct != null
              ? `${tenancy.billingSchedule.escalationPct}% · next ${tenancy.billingSchedule.nextEscalationOn ?? '—'}`
              : 'Not set (staff % — not live CPI)'}
          </dd>
        </div>
      </dl>

      {ops.monthToMonthNote ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{ops.monthToMonthNote}</p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs font-medium text-ink-500">
          Offered rent (ZAR)
          <input
            className="mt-1 w-full rounded-lg border border-primary-100 px-2 py-2 text-sm"
            value={offeredRent}
            onChange={(e) => setOfferedRent(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="text-xs font-medium text-ink-500">
          Offered end
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-primary-100 px-2 py-2 text-sm"
            value={offeredEnd}
            onChange={(e) => setOfferedEnd(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-ink-500">
          Term (months)
          <input
            className="mt-1 w-full rounded-lg border border-primary-100 px-2 py-2 text-sm"
            value={termMonths}
            onChange={(e) => setTermMonths(e.target.value)}
            inputMode="numeric"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="min-h-10"
          disabled={busy || tenancy.status === 'Ended'}
          onClick={() =>
            handlers.onOffer({
              tenancyId: tenancy.id,
              offeredRent: Number(offeredRent) || tenancy.rent,
              offeredEndDate: offeredEnd || undefined,
              termMonths: Number(termMonths) || 12,
            })
          }
        >
          Offer renewal
        </Button>
        <Button
          variant="primary"
          className="min-h-10"
          disabled={busy || ops.election !== 'offered'}
          onClick={() => handlers.onAccept(tenancy.id)}
        >
          Accept (extend book)
        </Button>
        <Button
          variant="secondary"
          className="min-h-10"
          disabled={busy || (ops.election !== 'offered' && ops.election !== 'none')}
          onClick={() => handlers.onDecline(tenancy.id)}
        >
          Decline → notice
        </Button>
        {m2m && ops.election !== 'month_to_month' ? (
          <Button
            variant="secondary"
            className="min-h-10"
            disabled={busy}
            onClick={() => handlers.onMonthToMonth(tenancy.id)}
          >
            Note month-to-month
          </Button>
        ) : null}
        <Button
          variant="secondary"
          className="min-h-10"
          disabled={busy || !canNotice}
          onClick={() => handlers.onSendCpaNotice(tenancy.id)}
          title={
            canNotice
              ? 'Record in-app CPA-style expiry notice'
              : 'Window not open yet (or no fixed end)'
          }
        >
          Send CPA notice (in-app)
        </Button>
      </div>

      <div className="grid gap-2 border-t border-primary-50 pt-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-ink-500">
          Escalation %
          <input
            className="mt-1 w-full rounded-lg border border-primary-100 px-2 py-2 text-sm"
            value={escPct}
            onChange={(e) => setEscPct(e.target.value)}
            placeholder="e.g. 5"
            inputMode="decimal"
          />
        </label>
        <label className="text-xs font-medium text-ink-500">
          Next escalation on
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-primary-100 px-2 py-2 text-sm"
            value={escNext}
            onChange={(e) => setEscNext(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            variant="secondary"
            className="min-h-10"
            disabled={busy}
            onClick={() =>
              handlers.onSetEscalation({
                tenancyId: tenancy.id,
                escalationPct: escPct.trim() === '' ? null : Number(escPct),
                nextEscalationOn: escNext || null,
              })
            }
          >
            Save schedule
          </Button>
          <Button
            variant="primary"
            className="min-h-10"
            disabled={busy || !escalationDue}
            onClick={() => handlers.onApplyEscalation(tenancy.id)}
          >
            Apply due increase
          </Button>
        </div>
      </div>

      {propertyTitle ? (
        <p className="text-[11px] text-ink-400">
          {propertyTitle} · in-app book only — Mailtrap/WhatsApp stay flag-gated / refuse-closed.
        </p>
      ) : null}

      {ops.auditNotes.length > 0 ? (
        <details className="text-xs text-ink-500">
          <summary className="cursor-pointer font-medium">Audit ({ops.auditNotes.length})</summary>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {[...ops.auditNotes].reverse().map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`} className="rounded bg-primary-50/60 px-2 py-1">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
