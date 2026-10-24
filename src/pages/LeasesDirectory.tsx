import { useMemo, useRef, useState } from 'react'
import { acquireSubmitLock, releaseSubmitLock } from '../lib/wizardSubmitGuard'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, FileSignature, FileText, PenLine, RefreshCw, TrendingUp } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { usePropertyScope, useAuth } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import {
  ClearFiltersButton,
  DirectoryEmpty,
  DirectoryToolbar,
  useDirectoryView,
} from '../components/directory/DirectoryToolbar'
import { DirectoryStatGrid } from '../components/directory/DirectoryStats'
import { DirectoryFilterSelect, directoryResultLabel } from '../components/directory/DirectoryFilters'
import { Badge, Button, Modal, PageHeader, cn, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import { resolveDocumentUrl } from '../lib/api'
import { eSignStatusLabel as leaseESignLabel } from '../lib/lease'
import type { Tenancy } from '../types/domain'
import { LeaseSignDialog } from '../components/lease/LeaseSignDialog'
import { LeaseSigningRecord } from '../components/lease/LeaseSigningRecord'
import { SignedCopyNote } from '../components/lease/SignedCopyNote'
import type { LeaseSignCapture } from '../lib/lease/signaturePrefill'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { FieldHelp } from '../components/onboarding/FieldHelp'
import { RENEWALS_MODE_A_COPY } from '../lib/renewals'
import {
  LeaseRenewalsPanel,
  type LeaseRenewalsHandlers,
} from '../components/renewals/LeaseRenewalsPanel'
import { propertyRefLabel } from '../lib/propertyRefs'
import { daysLabel, renewalSnapshot, RENEWAL_PROMPT_DAYS, type RenewalSnapshot } from '../lib/renewals/renewalStatus'
import { usePortalHydrating } from '../components/PortalHydrationGate'
import { DataTableSkeleton } from '../components/loading/PageSkeleton'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-leases-view'

type SignFilter = 'all' | 'awaiting' | 'partial' | 'completed' | 'missing'
type LeasesTab = 'leases' | 'renewals'
type RenewalFilter = 'action' | 'ending' | 'notice' | 'increase' | 'answer' | 'all'

type LeaseRow = {
  tenancy: Tenancy
  propertyTitle: string
  landlordName: string | null
  pdfUrl: string | null
  signLabel: string
  signTone: string
  renewal: RenewalSnapshot
}

export default function LeasesDirectory() {
  const dataLoading = usePortalHydrating()
  const {
    state,
    recordTenancyLeaseSign,
    issueLeasePackage,
    notify,
    offerLeaseRenewal,
    acceptLeaseRenewal,
    declineLeaseRenewal,
    markLeaseMonthToMonth,
    sendCpaExpiryNotice,
    setLeaseEscalation,
    applyDueLeaseEscalations,
  } = useStore()
  const { user } = useAuth()
  const { dealVisible } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = useDirectoryView(VIEW_KEY)
  const [q, setQ] = useState('')
  const [signFilter, setSignFilter] = useState<SignFilter>('all')
  const [sort, setSort] = useState('tenant')
  const [busyId, setBusyId] = useState<string | null>(null)
  const renewalOfferLockRef = useRef(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: LeasesTab = searchParams.get('tab') === 'renewals' ? 'renewals' : 'leases'
  const setTab = (next: LeasesTab) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'renewals') params.set('tab', 'renewals')
    else params.delete('tab')
    setSearchParams(params, { replace: true })
  }
  const [renewalFilter, setRenewalFilter] = useState<RenewalFilter>('action')
  const [renewalTargetId, setRenewalTargetId] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const rows: LeaseRow[] = useMemo(() => {
    return state.tenancies
      .filter((t) => dealVisible(t))
      .map((tenancy) => {
        const property = state.properties.find((p) => p.id === tenancy.propertyId)
        const landlord = tenancy.landlordId
          ? state.users.find((u) => u.id === tenancy.landlordId)
          : null
        const doc = tenancy.leaseDocumentId
          ? state.propertyDocuments.find((d) => d.id === tenancy.leaseDocumentId)
          : state.propertyDocuments.find(
              (d) =>
                d.propertyId === tenancy.propertyId &&
                d.category === 'Lease' &&
                (d.applicationId === tenancy.applicationId ||
                  d.applicantName === tenancy.tenantName),
            )
        const pdfUrl =
          tenancy.leasePdfUrl ||
          tenancy.eSign?.pdfUrl ||
          (doc ? resolveDocumentUrl(doc) : null)
        const status = tenancy.eSign?.status ?? (doc ? 'generated' : 'not_started')
        return {
          tenancy,
          propertyTitle: property?.title ?? propertyRefLabel(tenancy.propertyId),
          landlordName: landlord?.name ?? null,
          pdfUrl,
          signLabel: leaseESignLabel(status as NonNullable<Tenancy['eSign']>['status']),
          signTone: status,
          renewal: renewalSnapshot(tenancy, today),
        }
      })
  }, [state.tenancies, state.properties, state.users, state.propertyDocuments, dealVisible, today])

  // Renewals worklist: live leases, most urgent first.
  const renewalRows = useMemo(
    () =>
      rows
        .filter((r) => r.tenancy.status === 'Active' || r.tenancy.status === 'Pending Move-In')
        .sort(
          (a, b) =>
            a.renewal.urgency - b.renewal.urgency ||
            (a.renewal.daysToEnd ?? 99999) - (b.renewal.daysToEnd ?? 99999),
        ),
    [rows],
  )
  const renewalCounts = useMemo(() => {
    const c = { action: 0, ending: 0, notice: 0, increase: 0, answer: 0, all: renewalRows.length }
    for (const r of renewalRows) {
      if (r.renewal.nextStep !== 'none') c.action++
      if (r.renewal.daysToEnd != null && r.renewal.daysToEnd <= RENEWAL_PROMPT_DAYS) c.ending++
      if (r.renewal.notice.state === 'open' || r.renewal.notice.state === 'late') c.notice++
      if (r.renewal.escalation.due) c.increase++
      if (r.renewal.election === 'offered') c.answer++
    }
    return c
  }, [renewalRows])
  const visibleRenewals = useMemo(() => {
    return renewalRows.filter((r) => {
      if (renewalFilter === 'action') return r.renewal.nextStep !== 'none'
      if (renewalFilter === 'ending') return r.renewal.daysToEnd != null && r.renewal.daysToEnd <= RENEWAL_PROMPT_DAYS
      if (renewalFilter === 'notice') return r.renewal.notice.state === 'open' || r.renewal.notice.state === 'late'
      if (renewalFilter === 'increase') return r.renewal.escalation.due
      if (renewalFilter === 'answer') return r.renewal.election === 'offered'
      return true
    })
  }, [renewalRows, renewalFilter])
  const renewalTarget = rows.find((r) => r.tenancy.id === renewalTargetId) ?? null

  const counts = useMemo(() => {
    const awaiting = rows.filter((r) => {
      const s = r.tenancy.eSign?.status
      return s === 'sent' || s === 'generated'
    }).length
    const partial = rows.filter((r) => r.tenancy.eSign?.status === 'partially_signed').length
    const completed = rows.filter((r) => r.tenancy.eSign?.status === 'completed').length
    const missing = rows.filter((r) => !r.tenancy.eSign && !r.pdfUrl).length
    return { awaiting, partial, completed, missing, total: rows.length }
  }, [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = rows.filter((r) => {
      const s = r.tenancy.eSign?.status
      if (signFilter === 'awaiting' && s !== 'sent' && s !== 'generated') return false
      if (signFilter === 'partial' && s !== 'partially_signed') return false
      if (signFilter === 'completed' && s !== 'completed') return false
      if (signFilter === 'missing' && (r.tenancy.eSign || r.pdfUrl)) return false
      if (!needle) return true
      const hay = [
        r.tenancy.tenantName,
        r.tenancy.tenantEmail,
        r.propertyTitle,
        r.landlordName,
        r.signLabel,
        r.tenancy.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
    list = [...list].sort((a, b) => {
      if (sort === 'property') return a.propertyTitle.localeCompare(b.propertyTitle)
      if (sort === 'rent') return b.tenancy.rent - a.tenancy.rent
      if (sort === 'sign') return a.signLabel.localeCompare(b.signLabel)
      return a.tenancy.tenantName.localeCompare(b.tenancy.tenantName)
    })
    return list
  }, [rows, q, signFilter, sort])

  const clearFilters = () => {
    setQ('')
    setSignFilter('all')
  }

  const onIssue = async (tenancyId: string) => {
    setBusyId(tenancyId)
    try {
      const res = await issueLeasePackage(tenancyId, {
        userId: user?.id,
        name: user?.name,
      })
      if (!res.ok)
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Lease issue failed',
          body: res.error ?? 'Unknown error',
        })
      else
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Lease issued',
          body: 'PDF generated and e-sign envelope opened (mock unless partner keys set).',
        })
    } finally {
      setBusyId(null)
    }
  }

  // CR10: every signing opens the sign dialog and goes through the one server
  // sign function (signer check, on-behalf confirmation, lease_signed row).
  const [signTarget, setSignTarget] = useState<{ tenancyId: string; party: 'tenant' | 'landlord'; paper: boolean } | null>(null)
  const onSign = (tenancyId: string, party: 'tenant' | 'landlord', paper = false) => {
    setSignTarget({ tenancyId, party, paper })
  }
  const submitSign = async (capture: LeaseSignCapture & { signerName: string }) => {
    if (!signTarget) return
    const { tenancyId, party } = signTarget
    setBusyId(`${tenancyId}-${party}`)
    try {
      const res = await recordTenancyLeaseSign({
        tenancyId,
        party,
        signerName: capture.signerName,
        signatureDataUrl: capture.signatureDataUrl,
        method: capture.method,
        onBehalfConfirmation: capture.onBehalfConfirmation,
        actorUserId: user?.id,
      })
      if (!res.ok)
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Signature not saved',
          body: res.error ?? 'The signature was not saved. Refresh and try again.',
        })
      else {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Signature saved.',
          body: 'Signature saved.',
        })
        setSignTarget(null)
      }
    } finally {
      setBusyId(null)
    }
  }

  const renewalHandlers: LeaseRenewalsHandlers = {
    onOffer: ({ tenancyId, offeredEndDate, offeredRent, termMonths }) => {
      if (!acquireSubmitLock(renewalOfferLockRef)) return
      try {
        const res = offerLeaseRenewal(tenancyId, { offeredEndDate, offeredRent, termMonths })
        if (res.ok) {
          notify({
            userId: user?.id ?? 'system',
            agencyId: user?.agencyId ?? null,
            title: 'Renewal offered',
            body: 'Renewal terms recorded. Let the tenant know and record their answer here.',
          })
        } else {
          notify({
            userId: user?.id ?? 'system',
            agencyId: user?.agencyId ?? null,
            title: 'Offer failed',
            body: 'reason' in res ? res.reason : 'Unknown error',
          })
        }
      } finally {
        releaseSubmitLock(renewalOfferLockRef)
      }
    },
    onAccept: (tenancyId) => {
      const res = acceptLeaseRenewal(tenancyId)
      if (res.ok) {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Renewal accepted',
          body: `Lease now runs to ${res.newEndDate} at ${formatZAR(res.newRent)} a month.`,
        })
      } else {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Accept failed',
          body: 'reason' in res ? res.reason : 'Unknown error',
        })
      }
    },
    onDecline: (tenancyId) => {
      const res = declineLeaseRenewal(tenancyId)
      if (res.ok) {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Renewal declined',
          body: `Recorded as not renewing (notice ${res.noticeGivenAt}).`,
        })
      } else {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Decline failed',
          body: 'reason' in res ? res.reason : 'Unknown error',
        })
      }
    },
    onMonthToMonth: (tenancyId) => {
      const res = markLeaseMonthToMonth(tenancyId)
      if (res.ok) {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Month-to-month noted',
          body: 'The lease continues month-to-month until someone gives notice.',
        })
      } else {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Note failed',
          body: 'reason' in res ? res.reason : 'Unknown error',
        })
      }
    },
    onSendCpaNotice: (tenancyId) => {
      const res = sendCpaExpiryNotice(tenancyId)
      if (res.ok) {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Expiry notice recorded',
          body: res.late
            ? 'Recorded after the notice window closed — consider getting advice.'
            : 'Recorded in PropertyFlow. Remember to send it to the tenant.',
        })
      } else {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Notice failed',
          body: 'reason' in res ? res.reason : 'Unknown error',
        })
      }
    },
    onSetEscalation: ({ tenancyId, escalationPct, nextEscalationOn }) => {
      const res = setLeaseEscalation(tenancyId, { escalationPct, nextEscalationOn })
      if (res.ok) {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Rent increase scheduled',
          body: 'The yearly increase is saved for this lease.',
        })
      } else {
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Save failed',
          body: 'reason' in res ? res.reason : 'Unknown error',
        })
      }
    },
    onApplyEscalation: (tenancyId) => {
      // Only this lease — not every lease with an increase due.
      const result = applyDueLeaseEscalations(undefined, { tenancyIds: [tenancyId] })
      notify({
        userId: user?.id ?? 'system',
        agencyId: user?.agencyId ?? null,
        title: result.applied ? 'Rent increase applied' : 'No increase due',
        body: result.applied ? 'The scheduled increase was applied to this lease.' : 'This lease has no increase due yet.',
      })
    },
  }

  const applyAllDueIncreases = () => {
    const result = applyDueLeaseEscalations()
    notify({
      userId: user?.id ?? 'system',
      agencyId: user?.agencyId ?? null,
      title: 'Rent increases applied',
      body: `Applied ${result.applied} scheduled increase${result.applied === 1 ? '' : 's'} due by ${result.asOf}.`,
    })
  }

  const tabButton = (id: LeasesTab, label: string, count?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cn(
        'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        tab === id ? 'bg-primary text-white' : 'text-ink-500 hover:bg-primary-50 hover:text-ink',
      )}
    >
      {label}
      {count ? (
        <span
          className={cn(
            'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5',
            tab === id ? 'bg-white text-primary' : 'bg-primary text-white',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )

  return (
    <RequirePermission permission="occupants.view">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Leases"
          subtitle={
            tab === 'renewals'
              ? 'Leases coming up for renewal, expiry notices and yearly rent increases.'
              : 'Every tenancy lease, its PDF and signing status.'
          }
          actions={
            tab === 'renewals' && renewalCounts.increase > 0 ? (
              <Button className="min-h-11 gap-1.5" onClick={applyAllDueIncreases}>
                <TrendingUp className="h-4 w-4" />
                Apply all due increases ({renewalCounts.increase})
              </Button>
            ) : (
              <FieldHelp title="Renewals & escalation" body={RENEWALS_MODE_A_COPY} />
            )
          }
        />

        <div role="tablist" aria-label="Leases views" className="inline-flex gap-1 rounded-full border border-primary-100 bg-white p-1">
          {tabButton('leases', 'All leases')}
          {tabButton('renewals', 'Renewals & escalation', renewalCounts.action)}
        </div>

        {tab === 'renewals' ? (
          <>
            <DirectoryStatGrid<RenewalFilter>
              allId="all"
              value={renewalFilter}
              onChange={setRenewalFilter}
              className="xl:grid-cols-5"
              options={[
                { id: 'action', label: 'Needs action', value: renewalCounts.action, hint: 'Something to do now', highlight: renewalCounts.action > 0 },
                { id: 'ending', label: 'Ending soon', value: renewalCounts.ending, hint: `Within ${RENEWAL_PROMPT_DAYS} days` },
                { id: 'notice', label: 'Notice due', value: renewalCounts.notice, hint: 'Expiry reminder window', highlight: renewalCounts.notice > 0 },
                { id: 'increase', label: 'Increase due', value: renewalCounts.increase, hint: 'Yearly rent increase', highlight: renewalCounts.increase > 0 },
                { id: 'answer', label: 'Awaiting tenant', value: renewalCounts.answer, hint: 'Offer sent' },
              ]}
            />
            {dataLoading ? (
              <DataTableSkeleton />
            ) : visibleRenewals.length === 0 ? (
              <DirectoryEmpty
                title={renewalFilter === 'action' ? 'Nothing needs action' : 'No leases here'}
                hint={
                  renewalFilter === 'action'
                    ? `Leases show up here ${RENEWAL_PROMPT_DAYS} days before they end, when a notice or rent increase is due.`
                    : 'Try another filter.'
                }
                action={
                  renewalFilter !== 'all' ? (
                    <Button variant="secondary" className="min-h-11" onClick={() => setRenewalFilter('all')}>
                      Show all active leases
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="space-y-2">
                {visibleRenewals.map((row) => (
                  <RenewalRow key={row.tenancy.id} row={row} onOpen={() => setRenewalTargetId(row.tenancy.id)} />
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <DirectoryStatGrid<SignFilter>
              allId="all"
              value={signFilter}
              onChange={setSignFilter}
              options={[
                { id: 'all', label: 'All', value: counts.total, hint: 'Leases in scope' },
                { id: 'awaiting', label: 'Awaiting sign', value: counts.awaiting, hint: 'Sent / generated' },
                {
                  id: 'partial',
                  label: 'Partial',
                  value: counts.partial,
                  hint: 'One party signed',
                  highlight: counts.partial > 0,
                },
                { id: 'completed', label: 'Completed', value: counts.completed, hint: 'Fully countersigned' },
                {
                  id: 'missing',
                  label: 'No PDF',
                  value: counts.missing,
                  hint: 'Not issued yet',
                  highlight: counts.missing > 0,
                },
              ]}
            />

            <DirectoryToolbar
              query={q}
              onQueryChange={setQ}
              searchPlaceholder="Search leases…"
              searchLabel="Filter leases"
              view={view}
              onViewChange={setView}
              sort={sort}
              onSortChange={setSort}
              sortOptions={[
                { value: 'tenant', label: 'Tenant' },
                { value: 'property', label: 'Property' },
                { value: 'rent', label: 'Rent' },
                { value: 'sign', label: 'E-sign status' },
              ]}
              resultLabel={directoryResultLabel(filtered.length, rows.length, 'lease', 'leases')}
              reducedMotion={reducedMotion}
              activeFilterCount={(signFilter !== 'all' ? 1 : 0) + (sort !== 'tenant' ? 1 : 0)}
              onClearFilters={clearFilters}
              filters={
                <DirectoryFilterSelect
                  value={signFilter}
                  onChange={(e) => setSignFilter(e.target.value as SignFilter)}
                  aria-label="E-sign focus"
                >
                  <option value="all">All leases</option>
                  <option value="awaiting">Awaiting signature</option>
                  <option value="partial">Partially signed</option>
                  <option value="completed">Fully signed</option>
                  <option value="missing">Missing PDF</option>
                </DirectoryFilterSelect>
              }
            />

            {dataLoading ? (
              <DataTableSkeleton />
            ) : filtered.length === 0 ? (
              <DirectoryEmpty
                title="No leases match"
                hint="Approve a rental application to create a tenancy — the lease PDF is generated on approve."
                action={
                  q.trim() || signFilter !== 'all' ? (
                    <ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />
                  ) : undefined
                }
              />
            ) : view === 'cards' ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((row) => (
                  <LeaseCard
                    key={row.tenancy.id}
                    row={row}
                    busyId={busyId}
                    onIssue={onIssue}
                    onSign={onSign}
                    onRenewal={() => setRenewalTargetId(row.tenancy.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-primary-100 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-primary-50/60 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3">Lease term</th>
                      <th className="px-4 py-3">Rent</th>
                      <th className="px-4 py-3">Signing</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.tenancy.id} className="border-t border-primary-50 align-top">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink">{row.tenancy.tenantName}</div>
                          <div className="text-xs text-ink-500">{row.propertyTitle}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="tabular text-ink">
                            {row.tenancy.startDate} → {row.tenancy.endDate ?? 'open-ended'}
                          </div>
                          <EndChip days={row.renewal.daysToEnd} active={row.tenancy.status !== 'Ended'} />
                        </td>
                        <td className="px-4 py-3 tabular">{formatZAR(row.tenancy.rent)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(row.signLabel)}>{row.signLabel}</Badge>
                          {row.tenancy.eSign?.nonProduction ? (
                            <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                              Test signing
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {row.pdfUrl ? (
                              <a
                                href={row.pdfUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-medium text-primary hover:bg-primary-50"
                              >
                                <FileText className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                                PDF
                              </a>
                            ) : null}
                            <LeaseActions row={row} busyId={busyId} onIssue={onIssue} onSign={onSign} />
                            {row.tenancy.status !== 'Ended' ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="gap-1.5"
                                onClick={() => setRenewalTargetId(row.tenancy.id)}
                              >
                                <RefreshCw className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                                Renewal
                                {row.renewal.nextStep !== 'none' ? (
                                  <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Needs action" />
                                ) : null}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        open={Boolean(renewalTarget)}
        onClose={() => setRenewalTargetId(null)}
        title={renewalTarget ? `Renewal · ${renewalTarget.tenancy.tenantName}` : 'Renewal'}
        description={renewalTarget?.propertyTitle}
        size="lg"
      >
        {renewalTarget ? (
          <LeaseRenewalsPanel
            key={renewalTarget.tenancy.id}
            tenancy={renewalTarget.tenancy}
            busy={busyId === renewalTarget.tenancy.id}
            handlers={renewalHandlers}
          />
        ) : null}
      </Modal>

      <LeaseSignDialog
        open={Boolean(signTarget)}
        tenancy={state.tenancies.find((t) => t.id === signTarget?.tenancyId) ?? null}
        party={signTarget?.party ?? 'tenant'}
        paper={signTarget?.paper}
        busy={Boolean(signTarget) && busyId === `${signTarget?.tenancyId}-${signTarget?.party}`}
        onClose={() => setSignTarget(null)}
        onSign={(c) => void submitSign(c)}
      />
    </RequirePermission>
  )
}

/** "in 42 days" chip under the lease term; amber inside the renewal window. */
function EndChip({ days, active }: { days: number | null; active: boolean }) {
  if (!active || days == null) return null
  const soon = days <= RENEWAL_PROMPT_DAYS
  return (
    <span
      className={cn(
        'mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
        days < 0 ? 'bg-red-50 text-red-700' : soon ? 'bg-amber-50 text-amber-800' : 'bg-primary-50 text-ink-500',
      )}
    >
      {daysLabel(days)}
    </span>
  )
}

const NOTICE_BADGE: Record<RenewalSnapshot['notice']['state'], { tone: 'neutral' | 'success' | 'warning' | 'danger'; label: string }> = {
  no_fixed_end: { tone: 'neutral', label: 'No notice needed' },
  not_yet: { tone: 'neutral', label: 'Notice not yet due' },
  open: { tone: 'warning', label: 'Notice due' },
  late: { tone: 'danger', label: 'Notice late' },
  sent: { tone: 'success', label: 'Notice recorded' },
}

function RenewalRow({ row, onOpen }: { row: LeaseRow; onOpen: () => void }) {
  const r = row.renewal
  const notice = NOTICE_BADGE[r.notice.state]
  const urgent = r.nextStep !== 'none'
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'group grid w-full cursor-pointer gap-3 rounded-2xl border bg-white p-4 text-left transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center',
          urgent ? 'border-amber-200' : 'border-primary-100',
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink">{row.tenancy.tenantName}</span>
          <span className="block truncate text-xs text-ink-500">{row.propertyTitle}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-ink-400">Ends</span>
          <span className="block tabular text-sm text-ink">{row.tenancy.endDate ?? 'Open-ended'}</span>
          <EndChip days={r.daysToEnd} active />
        </span>
        <span className="flex min-w-0 flex-wrap gap-1.5">
          <Badge tone={r.election === 'accepted' ? 'success' : r.election === 'offered' ? 'info' : r.election === 'declined' ? 'danger' : 'neutral'}>
            {r.electionLabel}
          </Badge>
          <Badge tone={notice.tone}>{notice.label}</Badge>
          {r.escalation.due ? (
            <Badge tone="warning">Increase due</Badge>
          ) : r.escalation.pct != null ? (
            <Badge tone="neutral">
              +{r.escalation.pct}% {r.escalation.nextOn ? `on ${r.escalation.nextOn}` : ''}
            </Badge>
          ) : null}
        </span>
        <span
          className={cn(
            'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold',
            urgent ? 'bg-primary text-white' : 'text-primary group-hover:bg-primary-50',
          )}
        >
          {urgent ? r.nextStepLabel : 'Open'}
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>
    </li>
  )
}

function LeaseCard({
  row,
  busyId,
  onIssue,
  onSign,
  onRenewal,
}: {
  row: LeaseRow
  busyId: string | null
  onIssue: (id: string) => void
  onSign: (id: string, party: 'tenant' | 'landlord', paper?: boolean) => void
  onRenewal: () => void
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">{row.tenancy.tenantName}</h3>
          <p className="text-sm text-ink-500">{row.propertyTitle}</p>
        </div>
        <Badge tone={statusTone(row.signLabel)}>{row.signLabel}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs text-ink-500">
        <div>
          <dt className="font-medium">Rent</dt>
          <dd className="text-sm text-ink">{formatZAR(row.tenancy.rent)}</dd>
        </div>
        <div>
          <dt className="font-medium">Landlord</dt>
          <dd className="text-sm text-ink">{row.landlordName ?? '—'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-medium">Lease term</dt>
          <dd className="text-sm text-ink">
            {row.tenancy.startDate} → {row.tenancy.endDate ?? 'open-ended'}{' '}
            <EndChip days={row.renewal.daysToEnd} active={row.tenancy.status !== 'Ended'} />
          </dd>
        </div>
      </dl>
      {row.tenancy.eSign?.nonProduction ? (
        <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
          Test signing — not a live e-signature.
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2">
        {row.pdfUrl ? (
          <a
            href={row.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary-100 px-3 text-sm font-semibold text-primary hover:bg-primary-50"
          >
            <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} />
            PDF
          </a>
        ) : null}
        <LeaseActions row={row} busyId={busyId} onIssue={onIssue} onSign={onSign} />
        {row.tenancy.eSign?.envelopeId ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-primary">Signing record</summary>
            <div className="mt-2 space-y-2">
              <SignedCopyNote eSign={row.tenancy.eSign} />
              <LeaseSigningRecord tenancy={row.tenancy} />
            </div>
          </details>
        ) : null}
        {row.tenancy.status !== 'Ended' ? (
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={onRenewal}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
            Renewal
            {row.renewal.nextStep !== 'none' ? (
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Needs action" />
            ) : null}
          </Button>
        ) : null}
        <Link
          to={`/workspace/people/tenants/${encodeURIComponent(row.tenancy.id)}`}
          className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-ink-500 hover:text-primary"
        >
          Tenant record
        </Link>
      </div>
    </article>
  )
}

function LeaseActions({
  row,
  busyId,
  onIssue,
  onSign,
  compact,
}: {
  row: LeaseRow
  busyId: string | null
  onIssue: (id: string) => void
  onSign: (id: string, party: 'tenant' | 'landlord', paper?: boolean) => void
  compact?: boolean
}) {
  const e = row.tenancy.eSign
  const needsIssue = !e?.envelopeId && !row.pdfUrl
  const tenantPending = e && e.tenant.status !== 'signed' && e.status !== 'completed'
  const landlordPending =
    e?.landlord && e.landlord.status !== 'signed' && e.status !== 'completed'
  const { user } = useAuth()
  const isTenant = Boolean(user?.id) && user?.id === row.tenancy.tenantUserId

  return (
    <div className={cn('flex flex-wrap gap-2', compact && 'flex-col sm:flex-row')}>
      {needsIssue ? (
        <Button
          type="button"
          size="sm"
          disabled={busyId === row.tenancy.id}
          onClick={() => onIssue(row.tenancy.id)}
        >
          <FileSignature className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          Issue lease
        </Button>
      ) : null}
      {tenantPending && isTenant ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busyId === `${row.tenancy.id}-tenant`}
          onClick={() => onSign(row.tenancy.id, 'tenant')}
        >
          <PenLine className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          Sign as tenant
        </Button>
      ) : null}
      {landlordPending ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busyId === `${row.tenancy.id}-landlord`}
          onClick={() => onSign(row.tenancy.id, 'landlord')}
        >
          <PenLine className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          Sign for landlord
        </Button>
      ) : null}
    </div>
  )
}
