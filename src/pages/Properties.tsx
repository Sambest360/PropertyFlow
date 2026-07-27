import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { Button, Card, PageHeader } from '../components/ui'
import { CreatePropertyModal } from '../components/admin/CreatePropertyModal'
import { PropertyMap } from '../components/PropertyMap'
import { PropertiesToolbar } from '../components/properties/PropertiesToolbar'
import { PropertyListView } from '../components/properties/PropertyListView'
import { PropertyPortfolioCard } from '../components/properties/PropertyPortfolioCard'
import {
  VIEW_STORAGE_KEY,
  type AttentionFilter,
  type PortfolioProperty,
  type PropertiesViewMode,
  type SortKey,
} from '../components/properties/types'
import { useLookupOptions } from '../hooks/useLookupOptions'
import { VerificationPendingBanner } from '../components/auth/VerificationBanner'

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
  const [createOpen, setCreateOpen] = useState(false)

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const [type, setType] = useState('All')
  const [listingMode, setListingMode] = useState('all')
  const [suburb, setSuburb] = useState('all')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [sort, setSort] = useState<SortKey>('name')
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
    return state.properties.filter((p) => allowedPropertyIds.has(p.id))
  }, [state.properties, allowedPropertyIds])

  const portfolio: PortfolioProperty[] = useMemo(() => {
    return scoped.map((property) => {
      const unit = property.unitId ? state.units.find((u) => u.id === property.unitId) : undefined
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
      }
    })
  }, [scoped, state.units, state.tickets, state.viewings, state.applications, state.users])

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
        p.type.toLowerCase().includes(needle)
      )
    })

    rows = [...rows].sort((a, b) => {
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
  }, [portfolio, q, status, type, listingMode, suburb, attention, sort])

  const filtersActive =
    Boolean(q.trim()) ||
    status !== 'All' ||
    type !== 'All' ||
    listingMode !== 'all' ||
    suburb !== 'all' ||
    attention !== 'all'

  const clearFilters = () => {
    setQ('')
    setStatus('All')
    setType('All')
    setListingMode('all')
    setSuburb('all')
    setAttention('all')
  }

  const resultLabel =
    filtered.length === portfolio.length
      ? `${filtered.length} ${filtered.length === 1 ? 'property' : 'properties'}`
      : `${filtered.length} of ${portfolio.length} properties`

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Properties"
        subtitle="Scan your portfolio, spot what needs attention, and open a property for full detail."
        actions={
          has('assets.manage') ? (
            <Button className="min-h-11 cursor-pointer" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.6} aria-hidden /> Add property
            </Button>
          ) : undefined
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
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={setView}
        resultLabel={resultLabel}
        reducedMotion={reducedMotion}
        propertyTypes={propertyTypes}
        propertyStatuses={propertyStatuses}
        listingModes={listingModes}
      />

      {portfolio.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-semibold text-ink">No properties yet</p>
          <p className="mt-2 text-sm text-ink-500">
            Create a property to start listing, or ask your agency admin to assign one to you.
          </p>
          {has('assets.manage') && (
            <Button className="mt-4 cursor-pointer" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add property
            </Button>
          )}
          {has('assets.manage') && (
            <div className="mt-3">
              <Link
                to="/workspace/properties/new"
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
        <PropertyListView
          items={filtered}
          expandedId={expandedId}
          onToggle={toggleExpand}
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <PropertyPortfolioCard
              key={item.property.id}
              item={item}
              expanded={expandedId === item.property.id}
              onToggle={toggleExpand}
              reducedMotion={reducedMotion}
            />
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

      <CreatePropertyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultAgencyId={agencyId ?? undefined}
        lockAgency={!has('platform.manage')}
      />
    </div>
  )
}
