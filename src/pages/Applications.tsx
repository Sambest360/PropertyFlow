import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, MapPin, Zap } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { RequirePermission } from '../components/RequirePermission'
import {
  ClearFiltersButton,
  DirectoryEmpty,
  DirectoryToolbar,
  PersonAvatar,
  useDirectoryView,
} from '../components/directory/DirectoryToolbar'
import { Badge, PageHeader, Select, cn, statusTone } from '../components/ui'
import { APPLICATION_STAGES } from '../lib/workflow'
import type { Application } from '../types/domain'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-applications-view'

type PortfolioApp = {
  application: Application
  propertyTitle: string
  agentName: string | null
  gridIndependent: boolean
  premium: boolean
}

export default function Applications() {
  const { state } = useStore()
  const { user } = useAuth()
  const { scopeAgency, scopeAgent, role } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()
  const navigate = useNavigate()
  const [view, setView] = useDirectoryView(VIEW_KEY)
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('all')
  const [type, setType] = useState('all')
  const [sort, setSort] = useState('updated')

  const portfolio: PortfolioApp[] = useMemo(() => {
    return state.applications
      .filter((a) => {
        if (role === 'tenant') return a.applicantUserId === user.id || a.email === user.email
        if (!scopeAgency(a.agencyId)) return false
        if (isFieldAgent(role) && !scopeAgent(a.agentId)) return false
        return true
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
    scopeAgency,
    scopeAgent,
    role,
    user,
  ])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const a = item.application
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
  }, [portfolio, q, stage, type, sort])

  const filtersActive = Boolean(q.trim()) || stage !== 'all' || type !== 'all'
  const clearFilters = () => {
    setQ('')
    setStage('all')
    setType('all')
  }

  const resultLabel =
    filtered.length === portfolio.length
      ? `${filtered.length} ${filtered.length === 1 ? 'applicant' : 'applicants'}`
      : `${filtered.length} of ${portfolio.length} applicants`

  const openApplicant = (id: string) => {
    navigate(`/workspace/sales/applications/${id}`)
  }

  return (
    <RequirePermission permission="applications.view">
      <div className="animate-fade-in">
        <PageHeader
          title="Applicants"
          subtitle="Scan the portfolio, then open an applicant for personal details, documents, residences, blocks, and lifecycle."
        />

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
          <ul className="overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.14)]">
            {filtered.map((item, index) => {
              const a = item.application
              return (
                <li key={a.id} className={cn(index > 0 && 'border-t border-primary-50')}>
                  <button
                    type="button"
                    onClick={() => openApplicant(a.id)}
                    className={cn(
                      'flex w-full min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5',
                      reducedMotion && 'transition-none',
                    )}
                  >
                    <PersonAvatar name={a.applicantName} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{a.applicantName}</span>
                        <Badge tone="brand">{a.type}</Badge>
                        <Badge tone={statusTone(a.stage)}>{a.stage}</Badge>
                        {item.gridIndependent && (
                          <Badge tone="success">
                            <Zap className="mr-0.5 inline h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
                            Grid
                          </Badge>
                        )}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
                          {item.propertyTitle}
                        </span>
                        <span>· {a.email}</span>
                      </span>
                    </span>
                    <span className="hidden text-right sm:block">
                      <span className="block text-xs text-ink-400">Progress</span>
                      <span className="tabular text-sm font-semibold text-ink">{a.progress}%</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const a = item.application
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openApplicant(a.id)}
                  className={cn(
                    'cursor-pointer rounded-[1.25rem] border border-primary-100/80 bg-white p-4 text-left shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] transition-shadow duration-200 hover:shadow-[0_14px_28px_-16px_rgba(15,39,68,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    reducedMotion && 'transition-none',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <PersonAvatar name={a.applicantName} />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-ink">{a.applicantName}</h3>
                      <p className="truncate text-xs text-ink-500">{item.propertyTitle}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone={statusTone(a.stage)}>{a.stage}</Badge>
                        <Badge tone="brand">{a.type}</Badge>
                      </div>
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-[11px] text-ink-400">
                          <span>Progress</span>
                          <span className="tabular font-medium text-ink">{a.progress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-primary-50">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${a.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
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
