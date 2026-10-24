/**
 * Renewals & escalation for one lease (#15): renewal offer and the tenant's
 * answer, the CPA-style expiry notice, and the scheduled annual rent increase.
 * Everything is recorded in PropertyFlow only — nothing is emailed or sent to
 * the tenant, and the increase % is set by staff (not a live CPI feed).
 */
import { useState, type ReactNode } from 'react'
import { BellRing, CalendarClock, Check, RefreshCw, TrendingUp, X } from 'lucide-react'
import type { Tenancy } from '../../types/domain'
import { Badge, Button, Input, cn } from '../ui'
import { formatZAR } from '../../data/seed'
import { addCalendarMonths, canSendCpaExpiryNotice, ensureRenewalOps, needsMonthToMonthNote } from '../../lib/renewals'
import { daysLabel, renewalSnapshot } from '../../lib/renewals/renewalStatus'

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

function Section({
  icon,
  title,
  status,
  children,
}: {
  icon: ReactNode
  title: string
  status?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-primary-100 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary">{icon}</span>
        <h4 className="font-semibold text-ink">{title}</h4>
        {status ? <span className="ml-auto">{status}</span> : null}
      </div>
      {children}
    </section>
  )
}

function Fact({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-primary-50/50 px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{value}</dd>
      {hint ? <dd className="truncate text-xs text-ink-500">{hint}</dd> : null}
    </div>
  )
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
  /** Tighter spacing when embedded (tenant detail). */
  compact?: boolean
}) {
  const day = (asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
  const ops = ensureRenewalOps(tenancy, day)
  const snap = renewalSnapshot(tenancy, day)
  const canNotice = canSendCpaExpiryNotice(tenancy.endDate, ops, day)
  const m2m = needsMonthToMonthNote(tenancy, day)
  const ended = tenancy.status === 'Ended'

  const [editingOffer, setEditingOffer] = useState(ops.election === 'none')
  const [offeredRent, setOfferedRent] = useState(String(ops.offeredRent ?? tenancy.rent))
  const [termMonths, setTermMonths] = useState(String(ops.offeredTermMonths || 12))
  const [offeredEnd, setOfferedEnd] = useState(ops.offeredEndDate ?? '')
  const [escPct, setEscPct] = useState(
    tenancy.billingSchedule?.escalationPct != null ? String(tenancy.billingSchedule.escalationPct) : '',
  )
  const [escNext, setEscNext] = useState(tenancy.billingSchedule?.nextEscalationOn ?? '')

  const term = Number(termMonths) || 12
  const defaultEnd = addCalendarMonths(tenancy.endDate ?? day, term)
  const pctNum = escPct.trim() === '' ? null : Number(escPct)
  const previewRent = pctNum != null && pctNum > 0 ? Math.round(tenancy.rent * (1 + pctNum / 100)) : null

  const electionTone =
    ops.election === 'accepted'
      ? 'success'
      : ops.election === 'declined'
        ? 'danger'
        : ops.election === 'offered'
          ? 'info'
          : ops.election === 'month_to_month'
            ? 'warning'
            : 'neutral'

  const noticeBadge =
    snap.notice.state === 'sent' ? (
      <Badge tone="success">Notice recorded {snap.notice.sentAt?.slice(0, 10)}</Badge>
    ) : snap.notice.state === 'late' ? (
      <Badge tone="danger">Late — seek advice</Badge>
    ) : snap.notice.state === 'open' ? (
      <Badge tone="warning">Due now</Badge>
    ) : snap.notice.state === 'not_yet' ? (
      <Badge tone="neutral">Not yet due</Badge>
    ) : (
      <Badge tone="neutral">Not needed</Badge>
    )

  return (
    <div className={cn('space-y-3', !compact && 'space-y-4')} data-testid={`lease-renewals-panel-${tenancy.id}`}>
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Fact label="Lease ends" value={tenancy.endDate ?? 'Open-ended'} hint={daysLabel(snap.daysToEnd)} />
        <Fact label="Rent now" value={formatZAR(tenancy.rent)} hint="per month" />
        <Fact
          label="Renewal"
          value={snap.electionLabel}
          hint={ops.election === 'offered' && ops.offeredAt ? `offered ${ops.offeredAt.slice(0, 10)}` : undefined}
        />
        <Fact
          label="Next increase"
          value={snap.escalation.pct != null ? `${snap.escalation.pct}%` : 'Not set'}
          hint={snap.escalation.nextOn ? `on ${snap.escalation.nextOn}` : undefined}
        />
      </dl>

      {ops.monthToMonthNote ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{ops.monthToMonthNote}</p>
      ) : null}

      <Section
        icon={<RefreshCw className="h-4 w-4" />}
        title="Renewal"
        status={<Badge tone={electionTone}>{snap.electionLabel}</Badge>}
      >
        {ops.election === 'accepted' ? (
          <p className="text-sm text-ink-600">
            Renewed — the lease now runs to <strong>{tenancy.endDate}</strong> at{' '}
            <strong>{formatZAR(tenancy.rent)}</strong> a month.
          </p>
        ) : ops.election === 'declined' ? (
          <p className="text-sm text-ink-600">
            Not renewing — notice given {ops.noticeGivenAt?.slice(0, 10) ?? ''}. The lease ends on{' '}
            {tenancy.endDate ?? '—'}.
          </p>
        ) : ops.election === 'offered' && !editingOffer ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              Offered <strong>{formatZAR(ops.offeredRent ?? tenancy.rent)}</strong> a month for{' '}
              <strong>{ops.offeredTermMonths} months</strong>
              {ops.offeredEndDate ? (
                <>
                  , to <strong>{ops.offeredEndDate}</strong>
                </>
              ) : null}
              . What did the tenant say?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11 gap-1.5" disabled={busy} onClick={() => handlers.onAccept(tenancy.id)}>
                <Check className="h-4 w-4" />
                Tenant accepted
              </Button>
              <Button
                variant="secondary"
                className="min-h-11 gap-1.5"
                disabled={busy}
                onClick={() => handlers.onDecline(tenancy.id)}
              >
                <X className="h-4 w-4" />
                Tenant declined
              </Button>
              <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setEditingOffer(true)}>
                Change offer
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-ink-600">
                New monthly rent (R)
                <Input
                  className="mt-1"
                  value={offeredRent}
                  onChange={(e) => setOfferedRent(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <label className="text-sm text-ink-600">
                Term (months)
                <Input
                  className="mt-1"
                  value={termMonths}
                  onChange={(e) => setTermMonths(e.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label className="text-sm text-ink-600">
                New end date
                <Input className="mt-1" type="date" value={offeredEnd} onChange={(e) => setOfferedEnd(e.target.value)} />
                <span className="mt-1 block text-xs text-ink-400">Leave empty for {defaultEnd}</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-11"
                disabled={busy || ended}
                onClick={() => {
                  handlers.onOffer({
                    tenancyId: tenancy.id,
                    offeredRent: Number(offeredRent) || tenancy.rent,
                    offeredEndDate: offeredEnd || undefined,
                    termMonths: term,
                  })
                  setEditingOffer(false)
                }}
              >
                {ops.election === 'offered' ? 'Update offer' : 'Offer renewal'}
              </Button>
              {ops.election === 'offered' ? (
                <Button variant="ghost" className="min-h-11" onClick={() => setEditingOffer(false)}>
                  Cancel
                </Button>
              ) : null}
              {ops.election === 'none' ? (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  disabled={busy || ended}
                  onClick={() => handlers.onDecline(tenancy.id)}
                >
                  Not renewing
                </Button>
              ) : null}
            </div>
          </div>
        )}
        {m2m && ops.election !== 'month_to_month' ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
            <p className="text-sm text-amber-900">The lease end date has passed without a decision.</p>
            <Button
              variant="secondary"
              className="min-h-10"
              disabled={busy}
              onClick={() => handlers.onMonthToMonth(tenancy.id)}
            >
              Continue month-to-month
            </Button>
          </div>
        ) : null}
      </Section>

      <Section icon={<BellRing className="h-4 w-4" />} title="Expiry notice" status={noticeBadge}>
        <p className="text-sm text-ink-600">
          Tenants on a fixed-term lease should be reminded 40–80 business days before it ends (Consumer Protection
          Act).{' '}
          {snap.notice.windowOpen && snap.notice.windowClose ? (
            <>
              Window: <strong>{snap.notice.windowOpen}</strong> to <strong>{snap.notice.windowClose}</strong>.
            </>
          ) : (
            'This lease has no fixed end date.'
          )}
        </p>
        {snap.notice.state !== 'sent' && snap.notice.state !== 'no_fixed_end' ? (
          <div className="mt-3">
            <Button
              variant={snap.notice.state === 'open' || snap.notice.state === 'late' ? 'primary' : 'secondary'}
              className="min-h-11"
              disabled={busy || !canNotice}
              onClick={() => handlers.onSendCpaNotice(tenancy.id)}
              title={canNotice ? undefined : 'Available once the notice window opens'}
            >
              Record notice sent
            </Button>
          </div>
        ) : null}
      </Section>

      <Section
        icon={<TrendingUp className="h-4 w-4" />}
        title="Annual rent increase"
        status={snap.escalation.due ? <Badge tone="warning">Increase due</Badge> : undefined}
      >
        {snap.escalation.due && snap.escalation.newRent != null ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
            <p className="text-sm text-amber-900">
              {formatZAR(tenancy.rent)} → <strong>{formatZAR(snap.escalation.newRent)}</strong> was due on{' '}
              {snap.escalation.nextOn}.
            </p>
            <Button className="min-h-10" disabled={busy} onClick={() => handlers.onApplyEscalation(tenancy.id)}>
              Apply increase now
            </Button>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm text-ink-600">
            Increase (%)
            <Input
              className="mt-1"
              value={escPct}
              onChange={(e) => setEscPct(e.target.value)}
              placeholder="e.g. 8"
              inputMode="decimal"
            />
          </label>
          <label className="text-sm text-ink-600">
            Next increase on
            <Input className="mt-1" type="date" value={escNext} onChange={(e) => setEscNext(e.target.value)} />
          </label>
          <Button
            variant="secondary"
            className="min-h-11"
            disabled={busy}
            onClick={() =>
              handlers.onSetEscalation({
                tenancyId: tenancy.id,
                escalationPct: pctNum,
                nextEscalationOn: escNext || null,
              })
            }
          >
            Save
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
          <CalendarClock className="h-3.5 w-3.5" />
          {previewRent != null
            ? `Rent becomes ${formatZAR(previewRent)} a month${escNext ? ` from ${escNext}` : ''}, then repeats yearly.`
            : 'Set a percentage to schedule a yearly increase.'}
        </p>
      </Section>

      {ops.auditNotes.length > 0 ? (
        <details className="rounded-xl border border-primary-100 px-3 py-2 text-xs text-ink-500">
          <summary className="cursor-pointer font-medium text-ink-600">History ({ops.auditNotes.length})</summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {[...ops.auditNotes].reverse().map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`} className="rounded bg-primary-50/60 px-2 py-1">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-[11px] text-ink-400">
        {propertyTitle ? `${propertyTitle} · ` : ''}Recorded in PropertyFlow only — nothing is emailed or sent to the
        tenant automatically.
      </p>
    </div>
  )
}
