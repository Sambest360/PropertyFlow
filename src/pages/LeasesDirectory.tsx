import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSignature, FileText, PenLine } from 'lucide-react'
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
import { Badge, Button, PageHeader, cn, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import { resolveDocumentUrl } from '../lib/api'
import { eSignStatusLabel as leaseESignLabel } from '../lib/lease'
import type { Tenancy } from '../types/domain'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-leases-view'

type SignFilter = 'all' | 'awaiting' | 'partial' | 'completed' | 'missing'

type LeaseRow = {
  tenancy: Tenancy
  propertyTitle: string
  landlordName: string | null
  pdfUrl: string | null
  signLabel: string
  signTone: string
}

export default function LeasesDirectory() {
  const { state, recordTenancyLeaseSign, issueLeasePackage, notify } = useStore()
  const { user } = useAuth()
  const { dealVisible } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = useDirectoryView(VIEW_KEY)
  const [q, setQ] = useState('')
  const [signFilter, setSignFilter] = useState<SignFilter>('all')
  const [sort, setSort] = useState('tenant')
  const [busyId, setBusyId] = useState<string | null>(null)

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
          propertyTitle: property?.title ?? tenancy.propertyId,
          landlordName: landlord?.name ?? null,
          pdfUrl,
          signLabel: leaseESignLabel(status as NonNullable<Tenancy['eSign']>['status']),
          signTone: status,
        }
      })
  }, [state.tenancies, state.properties, state.users, state.propertyDocuments, dealVisible])

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

  const onSign = async (tenancyId: string, party: 'tenant' | 'landlord') => {
    setBusyId(`${tenancyId}-${party}`)
    try {
      const tenancy = state.tenancies.find((t) => t.id === tenancyId)
      const signerName =
        party === 'tenant'
          ? tenancy?.tenantName ?? 'Tenant'
          : state.users.find((u) => u.id === tenancy?.landlordId)?.name ?? 'Landlord'
      const res = await recordTenancyLeaseSign({
        tenancyId,
        party,
        signerName,
        actorUserId: user?.id,
      })
      if (!res.ok)
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: 'Sign failed',
          body: res.error ?? 'Unknown error',
        })
      else
        notify({
          userId: user?.id ?? 'system',
          agencyId: user?.agencyId ?? null,
          title: `${party === 'tenant' ? 'Tenant' : 'Landlord'} signed`,
          body: 'E-sign status updated — workflow mirrors real countersign progress.',
        })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <RequirePermission permission="occupants.view">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Leases"
          subtitle="Tenancy leases with generated PDFs and e-sign status. Mock e-sign is non-production soft-demo. Live SigniFlow needs server keys (DQ-C1); DocuSign stays placeholder."
        />

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

        {filtered.length === 0 ? (
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
              />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-primary-100 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-primary-50/60 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Rent</th>
                  <th className="px-4 py-3">PDF</th>
                  <th className="px-4 py-3">E-sign</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.tenancy.id} className="border-t border-primary-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{row.tenancy.tenantName}</div>
                      <div className="text-xs text-ink-500">{row.tenancy.id}</div>
                    </td>
                    <td className="px-4 py-3">{row.propertyTitle}</td>
                    <td className="px-4 py-3">{formatZAR(row.tenancy.rent)}</td>
                    <td className="px-4 py-3">
                      {row.pdfUrl ? (
                        <a
                          href={row.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                          Open PDF
                        </a>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(row.signLabel)}>{row.signLabel}</Badge>
                      {row.tenancy.eSign?.nonProduction ? (
                        <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                          Mock · non-production
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <LeaseActions row={row} busyId={busyId} onIssue={onIssue} onSign={onSign} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequirePermission>
  )
}

function LeaseCard({
  row,
  busyId,
  onIssue,
  onSign,
}: {
  row: LeaseRow
  busyId: string | null
  onIssue: (id: string) => void
  onSign: (id: string, party: 'tenant' | 'landlord') => void
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
      </dl>
      {row.tenancy.eSign?.nonProduction ? (
        <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
          Mock e-sign — non-production. Live partners need keys.
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
  onSign: (id: string, party: 'tenant' | 'landlord') => void
  compact?: boolean
}) {
  const e = row.tenancy.eSign
  const needsIssue = !e?.envelopeId && !row.pdfUrl
  const tenantPending = e && e.tenant.status !== 'signed' && e.status !== 'completed'
  const landlordPending =
    e?.landlord && e.landlord.status !== 'signed' && e.status !== 'completed'

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
      {tenantPending ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busyId === `${row.tenancy.id}-tenant`}
          onClick={() => onSign(row.tenancy.id, 'tenant')}
        >
          <PenLine className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          Record tenant sign
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
          Record landlord sign
        </Button>
      ) : null}
    </div>
  )
}
