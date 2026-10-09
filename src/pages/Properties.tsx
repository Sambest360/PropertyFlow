import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Archive } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { Button, Card, PageHeader } from '../components/ui'
import { ActionButtonRow } from '../components/ActionButtonRow'
import { withReturnTo } from '../lib/returnTo'
import { PropertyMap } from '../components/PropertyMap'
import { PropertiesToolbar } from '../components/properties/PropertiesToolbar'
import { BuildingTreeView } from '../components/properties/BuildingTreeView'
import { PropertyPortfolioCard } from '../components/properties/PropertyPortfolioCard'
import {
  VIEW_STORAGE_KEY,
  type AttentionFilter,
  type OccupancyFilter,
  type PortfolioProperty,
  type PropertiesViewMode,
  type SortKey,
} from '../components/properties/types'
import { useLookupOptions } from '../hooks/useLookupOptions'
import { VerificationPendingBanner } from '../components/auth/VerificationBanner'
import { canDeletePropertyRole, isPropertyDeleted } from '../lib/propertyDeletion'
import {
  buildingsInScope,
  groupPortfolioByBuilding,
  propertyMatchesBuildingFilter,
  propertyMatchesOccupancyFilter,
} from '../lib/buildingHierarchy'

function readStoredView(): PropertiesViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY)
    if (v === 'cards' || v === 'list' || v === 'map') return v
  } catch {
    /* ignore */
  }
  return 'list'
}

export default function Properties() {
  const { state } = useStore()
  const { has, user } = useAuth()
  const { allowedPropertyIds, agencyId } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const propertyTypes = useLookupOptions('PROPERTY_TYPE', agencyId)
  const propertyStatuses = useLookupOptions('PROPERTY_STATUS', agencyId)
  const listingModes = useLookupOptions('LISTING_MODE', agencyId)
  const createPropertyHref = withReturnTo(
    agencyId && !has('platform.manage')
      ? `/workspace/properties/new?agencyId=${agencyId}`
      : '/workspace/properties/new',
    '/workspace/properties',
  )
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const [type, setType] = useState('All')
  const [listingMode, setListingMode] = useState('all')
  const [suburb, setSuburb] = useState('all')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [buildingFilter, setBuildingFilter] = useState('all')
  const [occupancy, setOccupancy] = useState<OccupancyFilter>('all')
  const [sort, setSort] = useState<SortKey>('building')
  const [view, setView] = useState<PropertiesViewMode>(() => readStoredView())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = (item: PortfolioProperty) => {
    setExpandedId((id) => (id === item.property.id ? null : item.property.id))
  }

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      /* ignore */
    }
  }, [view])

  const scoped = useMemo(() => {
    return state.properties.filter(
      (p) => allowedPropertyIds.has(p.id) && !isPropertyDeleted(p),
    )
  }, [state.properties, allowedPropertyIds])

  const deletedCount = useMemo(() => {
    return state.properties.filter(
      (p) => allowedPropertyIds.has(p.id) && isPropertyDeleted(p),
    ).length
  }, [state.properties, allowedPropertyIds])

  const canViewArchive = has('assets.manage') && canDeletePropertyRole(user.role)

  const buildingById = useMemo(
    () => new Map(state.buildings.map((b) => [b.id, b])),
    [state.buildings],
  )

  const portfolio: PortfolioProperty[] = useMemo(() => {
    return scoped.map((property) => {
      const unit = property.unitId ? state.units.find((u) => u.id === property.unitId) : undefined
      const building = property.buildingId ? buildingById.get(property.buildingId) : undefined
      const openTickets = state.tickets.filter(
        (t) =>
          t.propertyId === property.id &&
          t.status !== 'Completed' &&
          t.status !== 'Cancelled',
      ).length
      const scheduledViewings = state.viewings.filter(
        (v) => v.propertyId === property.id && v.status === 'Scheduled',
      ).length
      const waitingApps = state.applications.filter(
        (a) =>
          a.propertyId === property.id &&
          a.progress < 100 &&
          a.stage !== 'Active Tenancy' &&
          a.stage !== 'Rejected',
      ).length
      const agent = property.agentId
        ? state.users.find((u) => u.id === property.agentId)
        : undefined
      const attentionScore = openTickets * 3 + scheduledViewings * 2 + waitingApps
      return {
        property,
        occupancy: unit?.statusKey ?? null,
        openTickets,
        scheduledViewings,
        waitingApps,
        agentName: agent?.name ?? null,
        attentionScore,
        buildingName: building?.name ?? null,
        unitNumber: unit?.unitNumber ?? null,
      }
    })
  }, [
    scoped,
    state.units,
    state.tickets,
    state.viewings,
    state.applications,
    state.users,
    buildingById,
  ])

  const buildingOptions = useMemo(() => {
    return buildingsInScope(scoped, state.buildings).map((b) => ({
      value: b.id,
      label: b.name,
    }))
  }, [scoped, state.buildings])

  const suburbs = useMemo(() => {
    const set = new Set<string>()
    for (const item of portfolio) {
      set.add(`${item.property.suburb}, ${item.property.city}`)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [portfolio])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const p = item.property
      if (status !== 'All' && p.status !== status) return false
      if (type !== 'All' && p.type !== type) return false
      if (listingMode !== 'all' && p.listingMode !== listingMode) return false
      if (suburb !== 'all' && `${p.suburb}, ${p.city}` !== suburb) return false
      if (!propertyMatchesBuildingFilter(p, buildingFilter)) return false
      if (!propertyMatchesOccupancyFilter(item.occupancy, occupancy)) return false

      if (attention === 'tickets' && item.openTickets === 0) return false
      if (attention === 'viewings' && item.scheduledViewings === 0) return false
      if (attention === 'apps' && item.waitingApps === 0) return false
      if (
        attention === 'any' &&
        item.openTickets === 0 &&
        item.scheduledViewings === 0 &&
        item.waitingApps === 0
      ) {
        return false
      }

      if (!needle) return true
      return (
        p.title.toLowerCase().includes(needle) ||
        p.address.toLowerCase().includes(needle) ||
        p.suburb.toLowerCase().includes(needle) ||
        p.city.toLowerCase().includes(needle) ||
        p.id.toLowerCase().includes(needle) ||
        p.type.toLowerCase().includes(needle) ||
        (item.buildingName?.toLowerCase().includes(needle) ?? false) ||
        (item.unitNumber?.toLowerCase().includes(needle) ?? false)
      )
    })

    rows = [...rows].sort((a, b) => {
      if (sort === 'building') {
        const an = a.buildingName ?? 'zzz'
        const bn = b.buildingName ?? 'zzz'
        const byBuilding = an.localeCompare(bn)
        if (byBuilding !== 0) return byBuilding
        return a.property.title.localeCompare(b.property.title)
      }
      if (sort === 'suburb') {
        return `${a.property.suburb}${a.property.city}`.localeCompare(
          `${b.property.suburb}${b.property.city}`,
        )
      }
      if (sort === 'status') return a.property.status.localeCompare(b.property.status)
      if (sort === 'price') {
        const av = a.property.price ?? a.property.rent ?? 0
        const bv = b.property.price ?? b.property.rent ?? 0
        return bv - av
      }
      if (sort === 'attention') return b.attentionScore - a.attentionScore
      return a.property.title.localeCompare(b.property.title)
    })

    return rows
  }, [
    portfolio,
    q,
    status,
    type,
    listingMode,
    suburb,
    attention,
    buildingFilter,
    occupancy,
    sort,
  ])

  const buildingGroupCount = useMemo(
    () => groupPortfolioByBuilding(filtered, state.buildings).length,
    [filtered, state.buildings],
  )

  const filtersActive =
    Boolean(q.trim()) ||
    status !== 'All' ||
    type !== 'All' ||
    listingMode !== 'all' ||
    suburb !== 'all' ||
    attention !== 'all' ||
    buildingFilter !== 'all' ||
    occupancy !== 'all'

  const clearFilters = () => {
    setQ('')
    setStatus('All')
    setType('All')
    setListingMode('all')
    setSuburb('all')
    setAttention('all')
    setBuildingFilter('all')
    setOccupancy('all')
  }

  const resultLabel =
    filtered.length === portfolio.length
      ? `${buildingGroupCount} ${buildingGroupCount === 1 ? 'building' : 'buildings'} · ${filtered.length} ${filtered.length === 1 ? 'unit' : 'units'}`
      : `${filtered.length} of ${portfolio.length} units · ${buildingGroupCount} ${buildingGroupCount === 1 ? 'building' : 'buildings'}`

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Properties"
        subtitle="Browse by building, then open a unit for full detail. Filters work across buildings and unit status."
        actions={
          <ActionButtonRow className="sm:w-auto">
            {has('assets.manage') ? (
              <Link to={createPropertyHref}>
                <Button className="min-h-11 cursor-pointer">
                  <Plus className="h-4 w-4" strokeWidth={1.6} aria-hidden /> Add property
                </Button>
              </Link>
            ) : null}
            {canViewArchive ? (
              <Link to="/workspace/properties/archive">
                <Button variant="secondary" className="min-h-11 cursor-pointer">
                  <Archive className="h-4 w-4" aria-hidden />
                  Deleted{deletedCount > 0 ? ` (${deletedCount})` : ''}
                </Button>
              </Link>
            ) : null}
          </ActionButtonRow>
        }
      />

      <div className="mb-5">
        <VerificationPendingBanner user={user} />
      </div>

      <PropertiesToolbar
        query={q}
        onQueryChange={setQ}
        status={status}
        onStatusChange={setStatus}
        type={type}
        onTypeChange={setType}
        listingMode={listingMode}
        onListingModeChange={setListingMode}
        suburb={suburb}
        onSuburbChange={setSuburb}
        suburbs={suburbs}
        attention={attention}
        onAttentionChange={setAttention}
        building={buildingFilter}
        onBuildingChange={setBuildingFilter}
        buildings={buildingOptions}
        occupancy={occupancy}
        onOccupancyChange={setOccupancy}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={setView}
        resultLabel={resultLabel}
        reducedMotion={reducedMotion}
        propertyTypes={propertyTypes}
        propertyStatuses={propertyStatuses}
        listingModes={listingModes}
        onClearFilters={filtersActive ? clearFilters : undefined}
      />

      {portfolio.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-semibold text-ink">No properties yet</p>
          <p className="mt-2 text-sm text-ink-500">
            Create a property to start listing, or ask your agency admin to assign one to you.
          </p>
          {has('assets.manage') && (
            <Link to={createPropertyHref}>
              <Button className="mt-4 cursor-pointer">
                <Plus className="h-4 w-4" /> Add property
              </Button>
            </Link>
          )}
          {has('assets.manage') && (
            <div className="mt-3">
              <Link
                to={createPropertyHref}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Or open full create form
              </Link>
            </div>
          )}
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-ink-500">No properties match these filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl px-4 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Clear filters
          </button>
        </Card>
      ) : view === 'list' ? (
        <BuildingTreeView
          items={filtered}
          buildings={state.buildings}
          reducedMotion={reducedMotion}
        />
      ) : view === 'map' ? (
        <Card className="overflow-hidden p-0">
          <div className="h-[min(70vh,640px)] min-h-[360px] w-full">
            <PropertyMap
              properties={filtered.map((f) => f.property)}
              mode="all"
              detailBase="/workspace/properties"
              className="h-full rounded-none"
            />
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupPortfolioByBuilding(filtered, state.buildings).map((group) => (
            <div key={group.key}>
              <div className="mb-3 flex flex-wrap items-baseline gap-2">
                <h2 className="font-display text-lg font-semibold text-ink">{group.label}</h2>
                <p className="text-xs font-medium text-ink-400">
                  {group.unitCount} {group.unitCount === 1 ? 'unit' : 'units'}
                  {group.suburbCity ? ` · ${group.suburbCity}` : ''}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((item) => (
                  <PropertyPortfolioCard
                    key={item.property.id}
                    item={item}
                    expanded={expandedId === item.property.id}
                    onToggle={toggleExpand}
                    reducedMotion={reducedMotion}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtersActive && filtered.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-11 cursor-pointer items-center px-2 text-sm font-semibold text-primary transition-colors duration-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
