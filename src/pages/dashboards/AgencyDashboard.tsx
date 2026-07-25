import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Users,
  Wrench,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope } from '../../context/AuthContext'
import { priorityTone, statusTone } from '../../components/ui'
import { OpsPreviewModal, type PreviewTarget } from '../../components/admin/OpsPreviewModal'
import {
  AttentionHero,
  CalendarToggle,
  CreateMenu,
  DashboardBreadcrumb,
  DashboardCalendarShell,
  DashboardPage,
  DashboardSplit,
  DashboardTabs,
  EventCycleNav,
  FilterClearHint,
  MiniCalendar,
  OpsDetailPanel,
  OpsList,
  OpsToolbar,
  QuickLinkChips,
  SectionBanner,
  dateKey,
  listKey,
  parseListId,
  pickAttentionHero,
  toMarkerTone,
  useEventCycle,
  type CalendarMarker,
  type OpsListItemData,
} from '../../components/dashboard'
import type { Application, MaintenanceTicket, PropertyAsset, Viewing } from '../../types/domain'

type DashTab = 'overview' | 'properties' | 'maintenance' | 'viewings' | 'applications'
type ListFilter = 'all' | 'attention' | 'high' | 'scheduled' | 'awaiting' | 'listed'

type OpsItem =
  | { kind: 'viewing'; id: string; title: string; meta: string; status: string; date: string; propertyId: string; photos: number; agentIds: string[] }
  | { kind: 'ticket'; id: string; title: string; meta: string; status: string; date: string; propertyId: string; photos: number; agentIds: string[]; priority: string }
  | { kind: 'application'; id: string; title: string; meta: string; status: string; date: string; propertyId: string; photos: number; agentIds: string[] }
  | { kind: 'property'; id: string; title: string; meta: string; status: string; date: string; propertyId: string; photos: number; agentIds: string[] }

const KIND_LABEL: Record<OpsItem['kind'], string> = {
  viewing: 'Viewing',
  ticket: 'Maintenance',
  application: 'Application',
  property: 'Property',
}

const FILTERS: { id: ListFilter; label: string; tabs?: DashTab[] }[] = [
  { id: 'all', label: 'All items' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'high', label: 'High priority', tabs: ['overview', 'maintenance'] },
  { id: 'scheduled', label: 'Scheduled', tabs: ['overview', 'viewings'] },
  { id: 'awaiting', label: 'Awaiting review', tabs: ['overview', 'applications'] },
  { id: 'listed', label: 'Active listings', tabs: ['overview', 'properties'] },
]

function toListItem(
  item: OpsItem,
  users: Array<{ id: string; name: string }>,
): OpsListItemData {
  return {
    id: listKey(item.kind, item.id),
    title: item.title,
    meta: item.meta,
    date: item.date,
    badge: item.kind === 'ticket' ? item.priority : item.status,
    badgeTone:
      item.kind === 'ticket' ? priorityTone(item.priority) : statusTone(item.status),
    photos: item.photos,
    people: item.agentIds
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is { id: string; name: string } => Boolean(u)),
  }
}

function requestByLabel(item: OpsItem) {
  if (item.kind === 'application') return item.title
  if (item.kind === 'viewing') return item.meta.split('·')[0]?.trim() ?? '—'
  if (item.kind === 'property') return item.meta
  return item.meta.split('·').pop()?.trim() ?? '—'
}

export function AgencyDashboard() {
  const { state } = useStore()
  const { scopeAgency } = useAgencyScope()

  const [tab, setTab] = useState<DashTab>('overview')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => new Date(2026, 6, 23))
  const [calendarOpen, setCalendarOpen] = useState(true)

  const properties = useMemo(
    () => state.properties.filter((p) => scopeAgency(p.agencyId)),
    [state.properties, scopeAgency],
  )
  const apps = useMemo(
    () => state.applications.filter((a) => scopeAgency(a.agencyId)),
    [state.applications, scopeAgency],
  )
  const tickets = useMemo(
    () => state.tickets.filter((t) => scopeAgency(t.agencyId)),
    [state.tickets, scopeAgency],
  )
  const viewings = useMemo(
    () => state.viewings.filter((v) => scopeAgency(v.agencyId)),
    [state.viewings, scopeAgency],
  )
  const users = state.users

  const hero = useMemo(
    () => pickAttentionHero(properties, tickets, viewings, apps),
    [properties, tickets, viewings, apps],
  )

  const openTickets = tickets.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled')
  const scheduledViewings = viewings.filter((v) => v.status === 'Scheduled')
  const awaitingApps = apps.filter(
    (a) => a.progress < 100 && a.stage !== 'Active Tenancy' && a.stage !== 'Rejected',
  )

  const opsItems: OpsItem[] = useMemo(() => {
    const viewingItems: OpsItem[] = viewings.map((v) => {
      const prop = properties.find((p) => p.id === v.propertyId)
      return {
        kind: 'viewing',
        id: v.id,
        title: prop?.title ?? 'Viewing',
        meta: `${v.applicantName} · ${v.time}`,
        status: v.status,
        date: v.date,
        propertyId: v.propertyId,
        photos: 0,
        agentIds: v.agentId ? [v.agentId] : [],
      }
    })
    const ticketItems: OpsItem[] = openTickets.map((t) => {
      const prop = properties.find((p) => p.id === t.propertyId)
      return {
        kind: 'ticket',
        id: t.id,
        title: t.title,
        meta: `${prop?.title ?? t.assetLabel} · ${t.reportedBy}`,
        status: t.status,
        date: t.openedAt,
        propertyId: t.propertyId,
        photos: t.photos,
        agentIds: t.assignedAgentId ? [t.assignedAgentId] : [],
        priority: t.priority,
      }
    })
    const appItems: OpsItem[] = awaitingApps.map((a) => {
      const prop = properties.find((p) => p.id === a.propertyId)
      return {
        kind: 'application',
        id: a.id,
        title: a.applicantName,
        meta: `${prop?.title ?? 'Property'} · ${a.type}`,
        status: a.stage,
        date: a.updatedAt.slice(0, 10),
        propertyId: a.propertyId,
        photos: a.documents.filter((d) => d.status !== 'required').length,
        agentIds: a.agentId ? [a.agentId] : [],
      }
    })
    const propertyItems: OpsItem[] = properties.map((p) => ({
      kind: 'property',
      id: p.id,
      title: p.title,
      meta: `${p.suburb}, ${p.city} · ${p.status}`,
      status: p.status,
      date: p.createdAt,
      propertyId: p.id,
      photos: p.images.length,
      agentIds: p.agentId ? [p.agentId] : [],
    }))

    let list: OpsItem[] = []
    if (tab === 'viewings') list = viewingItems
    else if (tab === 'maintenance') list = ticketItems
    else if (tab === 'applications') list = appItems
    else if (tab === 'properties') list = propertyItems
    else {
      list = [
        ...ticketItems,
        ...viewingItems.filter((v) => v.status === 'Scheduled'),
        ...appItems,
        ...propertyItems,
      ]
    }

    if (listFilter === 'attention') {
      list = list.filter(
        (i) =>
          (i.kind === 'ticket' && ['High', 'Urgent', 'Emergency'].includes(i.priority)) ||
          (i.kind === 'viewing' && i.status === 'Scheduled') ||
          (i.kind === 'application' && !['Active Tenancy', 'Approved'].includes(i.status)) ||
          (i.kind === 'property' && ['Under Offer', 'Maintenance'].includes(i.status)),
      )
    } else if (listFilter === 'high') {
      list = list.filter(
        (i) => i.kind === 'ticket' && ['High', 'Urgent', 'Emergency'].includes(i.priority),
      )
    } else if (listFilter === 'scheduled') {
      list = list.filter((i) => i.kind === 'viewing' && i.status === 'Scheduled')
    } else if (listFilter === 'awaiting') {
      list = list.filter((i) => i.kind === 'application')
    } else if (listFilter === 'listed') {
      list = list.filter(
        (i) => i.kind === 'property' && ['Published', 'Featured', 'Under Offer'].includes(i.status),
      )
    }

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((i) => {
        const prop = properties.find((p) => p.id === i.propertyId)
        const hay = [
          i.title,
          i.meta,
          i.status,
          i.kind,
          prop?.address,
          prop?.suburb,
          prop?.city,
          prop?.id,
          'priority' in i ? i.priority : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }

    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [viewings, openTickets, awaitingApps, properties, tab, query, listFilter])

  const sectionCounts = useMemo(() => {
    const highTickets = openTickets.filter((t) =>
      ['High', 'Urgent', 'Emergency'].includes(t.priority),
    ).length
    return {
      overview: openTickets.length + scheduledViewings.length + awaitingApps.length,
      properties: properties.filter((p) => ['Under Offer', 'Maintenance'].includes(p.status)).length,
      maintenance: openTickets.length,
      viewings: scheduledViewings.length,
      applications: awaitingApps.length,
      highTickets,
    }
  }, [openTickets, scheduledViewings, awaitingApps, properties])

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview', count: sectionCounts.overview },
      { id: 'properties', label: 'Properties', count: sectionCounts.properties },
      { id: 'maintenance', label: 'Maintenance', count: sectionCounts.maintenance },
      { id: 'viewings', label: 'Viewings', count: sectionCounts.viewings },
      { id: 'applications', label: 'Applications', count: sectionCounts.applications },
    ],
    [sectionCounts],
  )

  const banner = useMemo(() => {
    switch (tab) {
      case 'overview':
        return sectionCounts.overview > 0
          ? {
              tone: 'warning' as const,
              text: `You have ${sectionCounts.overview} open items across maintenance, viewings, and applications.`,
            }
          : null
      case 'properties':
        return sectionCounts.properties > 0
          ? {
              tone: 'info' as const,
              text: `${sectionCounts.properties} ${sectionCounts.properties === 1 ? 'property needs' : 'properties need'} follow-up (under offer or maintenance).`,
            }
          : null
      case 'maintenance':
        return sectionCounts.maintenance > 0
          ? {
              tone: 'danger' as const,
              text: `${sectionCounts.maintenance} open maintenance${sectionCounts.highTickets ? ` · ${sectionCounts.highTickets} high priority` : ''}.`,
            }
          : null
      case 'viewings':
        return sectionCounts.viewings > 0
          ? {
              tone: 'warning' as const,
              text: `${sectionCounts.viewings} scheduled ${sectionCounts.viewings === 1 ? 'viewing' : 'viewings'} coming up.`,
            }
          : null
      case 'applications':
        return sectionCounts.applications > 0
          ? {
              tone: 'warning' as const,
              text: `${sectionCounts.applications} ${sectionCounts.applications === 1 ? 'application is' : 'applications are'} waiting for review.`,
            }
          : null
      default:
        return null
    }
  }, [tab, sectionCounts])

  const availableFilters = FILTERS.filter((f) => !f.tabs || f.tabs.includes(tab))

  const activeItem = useMemo(() => {
    if (selectedKey) {
      const parsed = parseListId(selectedKey)
      if (parsed) {
        const found = opsItems.find((i) => i.kind === parsed.kind && i.id === parsed.id)
        if (found) return found
      }
    }
    return opsItems[0] ?? null
  }, [opsItems, selectedKey])

  const openPreview = (item: OpsItem) => {
    setSelectedKey(listKey(item.kind, item.id))
    const prop = properties.find((p) => p.id === item.propertyId)
    if (item.kind === 'ticket') {
      const ticket = tickets.find((t) => t.id === item.id)
      if (ticket) setPreview({ kind: 'ticket', ticket, property: prop })
    } else if (item.kind === 'viewing') {
      const viewing = viewings.find((v) => v.id === item.id)
      if (viewing) setPreview({ kind: 'viewing', viewing, property: prop })
    } else if (item.kind === 'application') {
      const application = apps.find((a) => a.id === item.id)
      if (application) setPreview({ kind: 'application', application, property: prop })
    } else if (item.kind === 'property' && prop) {
      setPreview({ kind: 'property', property: prop })
    }
    const [y, m, d] = item.date.split('-').map(Number)
    if (y && m && d) setSelectedDay(new Date(y, m - 1, d))
    setCalendarOpen(true)
  }

  const calendarMarkers: CalendarMarker[] = useMemo(() => {
    const markers: CalendarMarker[] = []
    for (const v of viewings) {
      markers.push({ date: v.date, tone: toMarkerTone(statusTone(v.status)) })
    }
    for (const t of openTickets) {
      markers.push({ date: t.openedAt, tone: toMarkerTone(priorityTone(t.priority)) })
    }
    for (const a of awaitingApps) {
      markers.push({
        date: a.updatedAt.slice(0, 10),
        tone: toMarkerTone(statusTone(a.stage)),
      })
    }
    return markers
  }, [viewings, openTickets, awaitingApps])

  const dayKey = dateKey(selectedDay)

  const calendarEvents = useMemo(() => {
    const events: OpsItem[] = []
    for (const v of viewings) {
      const prop = properties.find((p) => p.id === v.propertyId)
      events.push({
        kind: 'viewing',
        id: v.id,
        title: `Viewing · ${v.time}`,
        meta: `${v.applicantName} · ${prop?.title ?? 'Property'}`,
        status: v.status,
        date: v.date,
        propertyId: v.propertyId,
        photos: 0,
        agentIds: v.agentId ? [v.agentId] : [],
      })
    }
    for (const t of openTickets) {
      const prop = properties.find((p) => p.id === t.propertyId)
      events.push({
        kind: 'ticket',
        id: t.id,
        title: t.title,
        meta: `${prop?.title ?? t.assetLabel} · ${t.reportedBy}`,
        status: t.status,
        date: t.openedAt,
        propertyId: t.propertyId,
        photos: t.photos,
        agentIds: t.assignedAgentId ? [t.assignedAgentId] : [],
        priority: t.priority,
      })
    }
    return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
  }, [viewings, openTickets, properties])

  const dayEvents = useMemo(
    () => calendarEvents.filter((e) => e.date === dayKey),
    [calendarEvents, dayKey],
  )

  const { eventIndex, cycleDayEvent } = useEventCycle(
    dayKey,
    dayEvents.length,
    calendarEvents.map((e) => e.date),
    setSelectedDay,
  )

  const focusEvent = dayEvents[eventIndex] ?? null
  const focusProperty = focusEvent
    ? properties.find((p) => p.id === focusEvent.propertyId)
    : undefined

  const CtaIcon =
    hero?.kind === 'issue'
      ? Wrench
      : hero?.kind === 'viewing'
        ? CalendarDays
        : hero?.kind === 'application'
          ? ClipboardList
          : ArrowRight

  const listItems = opsItems.map((item) => toListItem(item, users))

  return (
    <DashboardPage>
      <DashboardBreadcrumb
        items={[
          { label: 'Dashboard', to: '/workspace' },
          { label: 'Overview' },
        ]}
      />

      {hero && (
        <AttentionHero
          {...hero}
          cta={
            hero.cta
              ? {
                  ...hero.cta,
                  icon: <CtaIcon className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                }
              : undefined
          }
        />
      )}

      <DashboardTabs
        tabs={tabs}
        value={tab}
        onChange={(id) => {
          setTab(id as DashTab)
          setSelectedKey(null)
          setListFilter('all')
        }}
      />

      {banner && (
        <SectionBanner
          tone={banner.tone}
          text={banner.text}
          trailing={
            <span className="tabular text-xs font-semibold opacity-80">{opsItems.length} shown</span>
          }
        />
      )}

      <DashboardSplit
        left={
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <OpsToolbar
              query={query}
              onQueryChange={setQuery}
              placeholder="Search properties, maintenance, viewings…"
              filters={availableFilters}
              filterValue={listFilter}
              onFilterChange={(id) => setListFilter(id as ListFilter)}
              actions={
                <CreateMenu
                  items={[
                    { to: '/workspace/properties/new', label: 'New property' },
                    { to: '/workspace/operations/maintenance?create=1', label: 'Log maintenance' },
                    { to: '/workspace/sales/viewings?create=1', label: 'Book viewing' },
                    { to: '/workspace/sales/applications', label: 'New application' },
                  ]}
                />
              }
            />

            {listFilter !== 'all' && (
              <FilterClearHint
                label={FILTERS.find((f) => f.id === listFilter)?.label ?? listFilter}
                onClear={() => setListFilter('all')}
              />
            )}

            <div className="min-h-0 flex-1">
              <OpsList
                items={listItems}
                activeId={activeItem ? listKey(activeItem.kind, activeItem.id) : null}
                onSelect={(compositeId) => {
                  const parsed = parseListId(compositeId)
                  if (!parsed) return
                  const item = opsItems.find((i) => i.kind === parsed.kind && i.id === parsed.id)
                  if (item) openPreview(item)
                }}
                empty="No matches — clear search or filters."
                limit={5}
                showMoreTo={
                  tab === 'properties'
                    ? '/workspace/properties'
                    : tab === 'maintenance'
                      ? '/workspace/operations/maintenance'
                      : tab === 'viewings'
                        ? '/workspace/sales/viewings'
                        : tab === 'applications'
                          ? '/workspace/sales/applications'
                          : '/workspace/operations/maintenance'
                }
                showMoreLabel="Show more"
              />
            </div>
          </div>
        }
        right={
          <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
            <CalendarToggle open={calendarOpen} onOpen={() => setCalendarOpen(true)}>
              <DashboardCalendarShell>
                <MiniCalendar
                  selected={selectedDay}
                  onSelect={setSelectedDay}
                  markers={calendarMarkers}
                  months={2}
                  onClose={() => setCalendarOpen(false)}
                  dayViewTo={`/workspace/sales/viewings?date=${dayKey}`}
                  className="h-full rounded-none border-0 shadow-none"
                />
              </DashboardCalendarShell>
            </CalendarToggle>

            <OpsDetailPanel
              className="flex min-h-0 flex-1 flex-col"
              eyebrow={focusEvent ? KIND_LABEL[focusEvent.kind] : 'Day events'}
              title={focusEvent?.title ?? 'No events this day'}
              subtitle={
                focusProperty
                  ? `${focusProperty.address} · ${focusProperty.suburb}`
                  : focusEvent?.meta
              }
              action={
                focusProperty
                  ? { label: 'Edit Profile', to: `/workspace/properties/${focusProperty.id}` }
                  : undefined
              }
              requestBy={focusEvent ? requestByLabel(focusEvent) : undefined}
              status={focusEvent?.status}
              statusTone={
                focusEvent
                  ? focusEvent.kind === 'ticket'
                    ? priorityTone(focusEvent.priority)
                    : statusTone(focusEvent.status)
                  : undefined
              }
              chips={
                <QuickLinkChips
                  items={[
                    {
                      to: '/workspace/sales/viewings',
                      label: `${scheduledViewings.length} viewings`,
                      icon: <CalendarDays className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                    },
                    {
                      to: '/workspace/operations/maintenance',
                      label: `${openTickets.length} open issues`,
                      icon: <Wrench className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                      tone: 'accent',
                    },
                    {
                      to: '/workspace/operations/maintenance',
                      label: `${openTickets.filter((t) => t.priority === 'High' || t.priority === 'Urgent' || t.priority === 'Emergency').length} urgent`,
                      icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                      tone: 'accent',
                    },
                    {
                      to: '/workspace/sales/applications',
                      label: `${awaitingApps.length} apps`,
                      icon: <ClipboardList className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                    },
                    {
                      to: '/workspace/sales/crm',
                      label: 'CRM',
                      icon: <Users className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                    },
                  ]}
                />
              }
            >
              <EventCycleNav
                index={eventIndex}
                dayCount={dayEvents.length}
                hasMultiDay={calendarEvents.length > 1}
                onPrev={() => cycleDayEvent(-1)}
                onNext={() => cycleDayEvent(1)}
              />
            </OpsDetailPanel>
          </div>
        }
      />

      <OpsPreviewModal target={preview} onClose={() => setPreview(null)} />
    </DashboardPage>
  )
}

/** Shared helper for role dashboards that need scoped agency data. */
export function useAgencyOpsData() {
  const { state } = useStore()
  const { scopeAgency } = useAgencyScope()
  const properties = useMemo(
    () => state.properties.filter((p: PropertyAsset) => scopeAgency(p.agencyId)),
    [state.properties, scopeAgency],
  )
  const apps = useMemo(
    () => state.applications.filter((a: Application) => scopeAgency(a.agencyId)),
    [state.applications, scopeAgency],
  )
  const tickets = useMemo(
    () => state.tickets.filter((t: MaintenanceTicket) => scopeAgency(t.agencyId)),
    [state.tickets, scopeAgency],
  )
  const viewings = useMemo(
    () => state.viewings.filter((v: Viewing) => scopeAgency(v.agencyId)),
    [state.viewings, scopeAgency],
  )
  return { state, properties, apps, tickets, viewings }
}
