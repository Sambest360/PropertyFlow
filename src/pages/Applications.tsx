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
import { DirectoryStatCard } from '../components/directory/DirectoryStats'
import { ApplicantsListView } from '../components/applicants/ApplicantsListView'
import { ApplicantPortfolioCard } from '../components/applicants/ApplicantPortfolioCard'
import {
  matchesApplicantAttention,
  type ApplicantAttentionFilter,
  type PortfolioApplicant,
  VIEW_STORAGE_KEY,
} from '../components/applicants/types'
import { PageHeader, Select } from '../components/ui'
import { APPLICATION_STAGES } from '../lib/workflow'

export default function Applications() {
  const { state } = useStore()
  const { user, role } = useAuth()
  const { dealVisible } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = useDirectoryView(VIEW_STORAGE_KEY)
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('all')
  const [type, setType] = useState('all')
  const [attention, setAttention] = useState<ApplicantAttentionFilter>('all')
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
    const progress = portfolio.filter((p) => matchesApplicantAttention(p, 'progress')).length
    const credit = portfolio.filter((p) => matchesApplicantAttention(p, 'credit')).length
    const tenancy = portfolio.filter((p) => matchesApplicantAttention(p, 'tenancy')).length
    const rejected = portfolio.filter((p) => matchesApplicantAttention(p, 'rejected')).length
    return { progress, credit, tenancy, rejected, total: portfolio.length }
  }, [portfolio])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const a = item.application
      if (!matchesApplicantAttention(item, attention)) return false
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
  }, [portfolio, q, stage, type, attention, sort])

  const filtersActive =
    Boolean(q.trim()) || stage !== 'all' || type !== 'all' || attention !== 'all'
  const clearFilters = () => {
    setQ('')
    setStage('all')
    setType('all')
    setAttention('all')
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
            active={attention === 'all'}
            onClick={() => setAttention('all')}
          />
          <DirectoryStatCard
            label="In progress"
            value={counts.progress}
            hint="Still moving through stages"
            active={attention === 'progress'}
            onClick={() => setAttention(attention === 'progress' ? 'all' : 'progress')}
          />
          <DirectoryStatCard
            label="Credit check"
            value={counts.credit}
            hint="Awaiting credit outcome"
            active={attention === 'credit'}
            onClick={() => setAttention(attention === 'credit' ? 'all' : 'credit')}
            highlight={counts.credit > 0}
          />
          <DirectoryStatCard
            label="Active tenancy"
            value={counts.tenancy}
            hint="Lease live"
            active={attention === 'tenancy'}
            onClick={() => setAttention(attention === 'tenancy' ? 'all' : 'tenancy')}
          />
        </section>

        <DirectoryToolbar
          query={q}
          onQueryChange={setQ}
          searchPlaceholder="Filter by applicant, email, property, or stage…"
          searchLabel="Filter applicants"
          view={view}
          onViewChange={setView}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: 'updated', label: 'Sort: Recently updated' },
            { value: 'name', label: 'Sort: Name' },
            { value: 'progress', label: 'Sort: Progress' },
            { value: 'stage', label: 'Sort: Stage' },
          ]}
          resultLabel={resultLabel}
          reducedMotion={reducedMotion}
          filters={
            <>
              <Select
                className="min-h-11"
                value={attention}
                onChange={(e) => setAttention(e.target.value as ApplicantAttentionFilter)}
                aria-label="Focus"
              >
                <option value="all">All applicants</option>
                <option value="progress">In progress</option>
                <option value="credit">Credit check</option>
                <option value="tenancy">Active tenancy</option>
                <option value="rejected">Rejected / blocked</option>
              </Select>
              <Select
                className="min-h-11"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                aria-label="Filter by stage"
              >
                <option value="all">All stages</option>
                {APPLICATION_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="Rejected">Rejected</option>
                <option value="Blocked">Blocked</option>
              </Select>
              <Select
                className="min-h-11"
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Filter by type"
              >
                <option value="all">Purchase & rental</option>
                <option value="Purchase">Purchase</option>
                <option value="Rental">Rental</option>
              </Select>
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
