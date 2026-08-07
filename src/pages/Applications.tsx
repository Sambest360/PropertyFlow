import { useMemo, useState } from 'react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { RequirePermission } from '../components/RequirePermission'
import {
  ClearFiltersButton,
  DirectoryEmpty,
  DirectoryToolbar,
  useDirectoryView,
} from '../components/directory/DirectoryToolbar'
import { DirectoryFilterSelect } from '../components/directory/DirectoryFilters'
import { DirectoryStatCard } from '../components/directory/DirectoryStats'
import { ApplicantsListView } from '../components/applicants/ApplicantsListView'
import { ApplicantPortfolioCard } from '../components/applicants/ApplicantPortfolioCard'
import {
  matchesPipelineBucketFilter,
  type ApplicationPipelineBucket,
  type PortfolioApplicant,
  VIEW_STORAGE_KEY,
} from '../components/applicants/types'
import { PageHeader } from '../components/ui'
import {
  PIPELINE_BUCKET_LABELS,
  type ApplicationPipelineBucket as PipelineBucket,
} from '../lib/applicationPipeline'

export default function Applications() {
  const { state } = useStore()
  const { user, role } = useAuth()
  const { dealVisible } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = useDirectoryView(VIEW_STORAGE_KEY)
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('all')
  const [type, setType] = useState('all')
  const [pipeline, setPipeline] = useState<ApplicationPipelineBucket>('all')
  const [sort, setSort] = useState('updated')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const portfolio: PortfolioApplicant[] = useMemo(() => {
    return state.applications
      .filter((a) => {
        if (role === 'tenant') return a.applicantUserId === user.id || a.email === user.email
        return dealVisible(a)
      })
      .map((application) => {
        const prop = state.properties.find((p) => p.id === application.propertyId)
        const agent = application.agentId
          ? state.users.find((u) => u.id === application.agentId)
          : null
        const unit = application.unitId
          ? state.units.find((u) => u.id === application.unitId)
          : undefined
        const building = unit
          ? state.buildings.find((b) => b.id === unit.buildingId)
          : prop?.buildingId
            ? state.buildings.find((b) => b.id === prop.buildingId)
            : undefined
        return {
          application,
          propertyTitle: prop?.title ?? application.propertyId,
          agentName: agent?.name ?? null,
          gridIndependent: Boolean(
            building && (building.solarCapacityKw >= 3 || building.hasBorehole),
          ),
          premium: building?.grading === 'P',
        }
      })
  }, [
    state.applications,
    state.properties,
    state.users,
    state.units,
    state.buildings,
    dealVisible,
    role,
    user,
  ])

  const counts = useMemo(() => {
    const buckets: ApplicationPipelineBucket[] = [
      'new',
      'documents_pending',
      'credit_checks',
      'awaiting_approval',
      'deposit_pending',
      'lease_signing',
      'completed',
      'rejected',
    ]
    const bucketCounts = Object.fromEntries(
      buckets.map((b) => [b, portfolio.filter((p) => matchesPipelineBucketFilter(p, b)).length]),
    ) as Record<Exclude<ApplicationPipelineBucket, 'all'>, number>
    return { ...bucketCounts, total: portfolio.length }
  }, [portfolio])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const a = item.application
      if (!matchesPipelineBucketFilter(item, pipeline)) return false
      if (stage !== 'all' && a.stage !== stage) return false
      if (type !== 'all' && a.type !== type) return false
      if (!needle) return true
      const hay = [
        a.applicantName,
        a.email,
        a.phone,
        a.id,
        item.propertyTitle,
        item.agentName,
        a.stage,
        a.employment,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
    rows = [...rows].sort((a, b) => {
      if (sort === 'name') return a.application.applicantName.localeCompare(b.application.applicantName)
      if (sort === 'progress') return b.application.progress - a.application.progress
      if (sort === 'stage') return a.application.stage.localeCompare(b.application.stage)
      return b.application.updatedAt.localeCompare(a.application.updatedAt)
    })
    return rows
  }, [portfolio, q, stage, type, pipeline, sort])

  const filtersActive =
    Boolean(q.trim()) || stage !== 'all' || type !== 'all' || pipeline !== 'all'
  const activeFilterCount =
    (stage !== 'all' ? 1 : 0) +
    (type !== 'all' ? 1 : 0) +
    (pipeline !== 'all' ? 1 : 0) +
    (sort !== 'updated' ? 1 : 0)
  const clearFilters = () => {
    setQ('')
    setStage('all')
    setType('all')
    setPipeline('all')
  }

  const resultLabel =
    filtered.length === portfolio.length
      ? `${filtered.length} ${filtered.length === 1 ? 'applicant' : 'applicants'}`
      : `${filtered.length} of ${portfolio.length} applicants`

  const toggleExpand = (item: PortfolioApplicant) => {
    setExpandedId((id) => (id === item.application.id ? null : item.application.id))
  }

  return (
    <RequirePermission permission="applications.view">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Applicants"
          subtitle="People who have applied — review progress, then open an applicant for full detail."
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DirectoryStatCard
            label="All"
            value={counts.total}
            hint="Applicants in scope"
            active={pipeline === 'all'}
            onClick={() => setPipeline('all')}
          />
          <DirectoryStatCard
            label={PIPELINE_BUCKET_LABELS.new}
            value={counts.new}
            hint="Recently submitted"
            active={pipeline === 'new'}
            onClick={() => setPipeline(pipeline === 'new' ? 'all' : 'new')}
            highlight={counts.new > 0}
          />
          <DirectoryStatCard
            label={PIPELINE_BUCKET_LABELS.documents_pending}
            value={counts.documents_pending}
            hint="Awaiting uploads or review"
            active={pipeline === 'documents_pending'}
            onClick={() => setPipeline(pipeline === 'documents_pending' ? 'all' : 'documents_pending')}
            highlight={counts.documents_pending > 0}
          />
          <DirectoryStatCard
            label={PIPELINE_BUCKET_LABELS.credit_checks}
            value={counts.credit_checks}
            hint="Screening in progress"
            active={pipeline === 'credit_checks'}
            onClick={() => setPipeline(pipeline === 'credit_checks' ? 'all' : 'credit_checks')}
            highlight={counts.credit_checks > 0}
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DirectoryStatCard
            label={PIPELINE_BUCKET_LABELS.awaiting_approval}
            value={counts.awaiting_approval}
            hint="Agent or landlord decision"
            active={pipeline === 'awaiting_approval'}
            onClick={() => setPipeline(pipeline === 'awaiting_approval' ? 'all' : 'awaiting_approval')}
          />
          <DirectoryStatCard
            label={PIPELINE_BUCKET_LABELS.deposit_pending}
            value={counts.deposit_pending}
            hint="Deposit not yet verified"
            active={pipeline === 'deposit_pending'}
            onClick={() => setPipeline(pipeline === 'deposit_pending' ? 'all' : 'deposit_pending')}
          />
          <DirectoryStatCard
            label={PIPELINE_BUCKET_LABELS.lease_signing}
            value={counts.lease_signing}
            hint="Agreement in progress"
            active={pipeline === 'lease_signing'}
            onClick={() => setPipeline(pipeline === 'lease_signing' ? 'all' : 'lease_signing')}
          />
          <DirectoryStatCard
            label={PIPELINE_BUCKET_LABELS.completed}
            value={counts.completed}
            hint="Tenancy or sale complete"
            active={pipeline === 'completed'}
            onClick={() => setPipeline(pipeline === 'completed' ? 'all' : 'completed')}
          />
        </section>

        <DirectoryToolbar
          query={q}
          onQueryChange={setQ}
          searchPlaceholder="Search applicants…"
          searchLabel="Filter applicants"
          view={view}
          onViewChange={setView}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: 'updated', label: 'Recently updated' },
            { value: 'name', label: 'Name' },
            { value: 'progress', label: 'Progress' },
            { value: 'stage', label: 'Stage' },
          ]}
          resultLabel={resultLabel}
          reducedMotion={reducedMotion}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
          filters={
            <>
              <DirectoryFilterSelect
                value={pipeline}
                onChange={(e) => setPipeline(e.target.value as ApplicationPipelineBucket)}
                aria-label="Pipeline bucket"
              >
                {(Object.keys(PIPELINE_BUCKET_LABELS) as PipelineBucket[]).map((b) => (
                  <option key={b} value={b}>
                    {PIPELINE_BUCKET_LABELS[b]}
                  </option>
                ))}
              </DirectoryFilterSelect>
              <DirectoryFilterSelect
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                aria-label="Filter by stage"
              >
                <option value="all">All stages</option>
                {[...new Set(portfolio.map((p) => p.application.stage))].sort().map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </DirectoryFilterSelect>
              <DirectoryFilterSelect
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Filter by type"
              >
                <option value="all">Purchase & rental</option>
                <option value="Purchase">Purchase</option>
                <option value="Rental">Rental</option>
              </DirectoryFilterSelect>
            </>
          }
        />

        {portfolio.length === 0 ? (
          <DirectoryEmpty title="No applications in your scope yet" />
        ) : filtered.length === 0 ? (
          <DirectoryEmpty
            title="No applicants match these filters"
            action={<ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />}
          />
        ) : view === 'list' ? (
          <ApplicantsListView
            items={filtered}
            expandedId={expandedId}
            onToggle={toggleExpand}
            reducedMotion={reducedMotion}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <ApplicantPortfolioCard
                key={item.application.id}
                item={item}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        )}

        {filtersActive && filtered.length > 0 && (
          <div className="mt-4 flex justify-end">
            <ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />
          </div>
        )}
      </div>
    </RequirePermission>
  )
}
