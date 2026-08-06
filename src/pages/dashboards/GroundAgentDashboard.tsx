import { useMemo, useState } from 'react'
import { CalendarDays, ClipboardList, FileCheck2, Wrench } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth, usePropertyScope } from '../../context/AuthContext'
import { useSeenOpsItems } from '../../hooks/useSeenOpsItems'
import { Button, priorityTone, statusTone } from '../../components/ui'
import { OpsPreviewModal, type PreviewTarget } from '../../components/admin/OpsPreviewModal'
import { maintenanceCreateHref } from '../maintenance/MaintenanceCreatePage'
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
  parseDay,
  parseListId,
  pickAttentionHero,
  toMarkerTone,
  useEventCycle,
  type OpsListItemData,
} from '../../components/dashboard'
import {
  buildCalendarMarkers,
  buildMaintenanceCalendarEvents,
  buildViewingBookingCalendarEvents,
  buildViewingSlotCalendarEvents,
  calendarEventAction,
  mergeCalendarEvents,
  type CalendarEvent,
} from '../../lib/calendarEvents'

type AgentTab = 'overview' | 'viewings' | 'tickets'
type AgentFilter = 'all' | 'attention' | 'scheduled' | 'high'

type AgentOpsItem =
  | {
      kind: 'viewing'
      id: string
      title: string
      meta: string
      status: string
      date: string
      propertyId: string
    }
  | {
      kind: 'ticket'
      id: string
      title: string
      meta: string
      status: string
      date: string
      propertyId: string
      priority: string
      photos: number
    }

const AGENT_FILTERS: { id: AgentFilter; label: string; tabs?: AgentTab[] }[] = [
  { id: 'all', label: 'All items' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'scheduled', label: 'Scheduled', tabs: ['overview', 'viewings'] },
  { id: 'high', label: 'High priority', tabs: ['overview', 'tickets'] },
]

function agentToListItem(
  item: AgentOpsItem,
  people: Array<{ id: string; name: string }>,
): OpsListItemData {
  return {
    id: listKey(item.kind, item.id),
    title: item.title,
    meta: item.meta,
    date: item.date,
    badge: item.kind === 'ticket' ? item.priority : item.status,
    badgeTone:
      item.kind === 'ticket' ? priorityTone(item.priority) : statusTone(item.status),
    photos: item.kind === 'ticket' ? item.photos : 0,
    people,
  }
}

export function GroundAgentDashboard() {
  const { state, updateViewing } = useStore()
  const { user } = useAuth()
  const { isSeen, markSeen } = useSeenOpsItems(user.id)
  const { allowedPropertyIds, dealVisible, ticketVisible, role } = usePropertyScope()
  const isCandidate = role === 'agent'
  const fieldLabel = isCandidate ? 'Candidate desk' : 'Field agent home'
  const homeEyebrow = isCandidate ? 'Supervised queue' : 'Your field book'
  const searchPlaceholder = isCandidate
    ? 'Search assigned viewings and supervised tickets…'
    : 'Search your viewings and maintenance…'

  const [tab, setTab] = useState<AgentTab>('overview')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<AgentFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [calendarOpen, setCalendarOpen] = useState(true)

  const props = state.properties.filter((p) => allowedPropertyIds.has(p.id))
  const viewings = state.viewings.filter((v) => dealVisible(v))
  const viewingSlots = state.viewingSlots.filter((s) => dealVisible(s))
  const apps = state.applications.filter((a) => dealVisible(a))
  const tickets = state.tickets.filter((t) => ticketVisible(t))

  const scheduled = viewings.filter((v) => v.status === 'Scheduled')
  const openTickets = tickets.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled')
  const heroBase = pickAttentionHero(props, tickets, scheduled, apps)

  const opsItems: AgentOpsItem[] = useMemo(() => {
    const viewingItems: AgentOpsItem[] = scheduled.map((v) => {
      const prop = state.properties.find((p) => p.id === v.propertyId)
      return {
        kind: 'viewing',
        id: v.id,
        title: prop?.title ?? 'Viewing',
        meta: `${v.applicantName} · ${v.time}`,
        status: v.status,
        date: v.date,
        propertyId: v.propertyId,
      }
    })
    const ticketItems: AgentOpsItem[] = openTickets.map((t) => ({
      kind: 'ticket',
      id: t.id,
      title: t.title,
      meta: `${t.assetLabel} · ${t.reportedBy}`,
      status: t.status,
      date: t.openedAt,
      propertyId: t.propertyId,
      priority: t.priority,
      photos: t.photos,
    }))

    let list: AgentOpsItem[] =
      tab === 'viewings' ? viewingItems : tab === 'tickets' ? ticketItems : [...viewingItems, ...ticketItems]

    if (listFilter === 'attention') {
      list = list.filter(
        (i) =>
          (i.kind === 'ticket' && ['High', 'Urgent', 'Emergency'].includes(i.priority)) ||
          (i.kind === 'viewing' && i.status === 'Scheduled'),
      )
    } else if (listFilter === 'scheduled') {
      list = list.filter((i) => i.kind === 'viewing' && i.status === 'Scheduled')
    } else if (listFilter === 'high') {
      list = list.filter(
        (i) => i.kind === 'ticket' && ['High', 'Urgent', 'Emergency'].includes(i.priority),
      )
    }

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) => i.title.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q),
      )
    }
    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [scheduled, openTickets, tab, query, listFilter, state.properties])

  const sectionCounts = useMemo(
    () => ({
      overview: scheduled.length + openTickets.length,
      viewings: scheduled.length,
      tickets: openTickets.length,
    }),
    [scheduled.length, openTickets.length],
  )

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview', count: sectionCounts.overview },
      { id: 'viewings', label: 'Viewings', count: sectionCounts.viewings },
      { id: 'tickets', label: 'Maintenance', count: sectionCounts.tickets },
    ],
    [sectionCounts],
  )

  const banner = useMemo(() => {
    switch (tab) {
      case 'overview':
        return sectionCounts.overview > 0
          ? {
              tone: 'warning' as const,
              text: isCandidate
                ? `${sectionCounts.overview} supervised item${sectionCounts.overview === 1 ? '' : 's'} on your book — confirm with your mentor before closing deals.`
                : `You have ${sectionCounts.overview} open item${sectionCounts.overview === 1 ? '' : 's'} across viewings and maintenance.`,
            }
          : null
      case 'viewings':
        return sectionCounts.viewings > 0
          ? {
              tone: 'warning' as const,
              text: isCandidate
                ? `${sectionCounts.viewings} assigned ${sectionCounts.viewings === 1 ? 'viewing' : 'viewings'} — arrive early and log attendance.`
                : `${sectionCounts.viewings} scheduled ${sectionCounts.viewings === 1 ? 'viewing' : 'viewings'} coming up.`,
            }
          : null
      case 'tickets':
        return sectionCounts.tickets > 0
          ? {
              tone: 'danger' as const,
              text: isCandidate
                ? `${sectionCounts.tickets} maintenance ${sectionCounts.tickets === 1 ? 'ticket needs' : 'tickets need'} a site check — escalate if blocked.`
                : `${sectionCounts.tickets} open maintenance.`,
            }
          : null
      default:
        return null
    }
  }, [tab, sectionCounts, isCandidate])

  const availableFilters = AGENT_FILTERS.filter((f) => !f.tabs || f.tabs.includes(tab))

  const activeItem = useMemo(() => {
    if (!selectedKey) return null
    const parsed = parseListId(selectedKey)
    if (!parsed) return null
    return opsItems.find((i) => i.kind === parsed.kind && i.id === parsed.id) ?? null
  }, [opsItems, selectedKey])

  const openPreview = (item: AgentOpsItem) => {
    markSeen(listKey(item.kind, item.id))
    setSelectedKey(listKey(item.kind, item.id))
    const prop = state.properties.find((p) => p.id === item.propertyId)
    if (item.kind === 'ticket') {
      const ticket = tickets.find((t) => t.id === item.id)
      if (ticket) setPreview({ kind: 'ticket', ticket, property: prop })
    } else {
      const viewing = viewings.find((v) => v.id === item.id)
      if (viewing) setPreview({ kind: 'viewing', viewing, property: prop })
    }
    setSelectedDay(parseDay(item.date, selectedDay))
    setCalendarOpen(true)
  }

  const dayKey = dateKey(selectedDay)

  const calendarEvents: CalendarEvent[] = useMemo(
    () =>
      mergeCalendarEvents(
        buildViewingBookingCalendarEvents(scheduled, state.properties),
        buildViewingSlotCalendarEvents(
          viewingSlots.filter((s) => s.status === 'Open' || s.status === 'Full'),
          state.properties,
        ),
        buildMaintenanceCalendarEvents(openTickets, state.properties),
      ),
    [scheduled, viewingSlots, openTickets, state.properties],
  )

  const calendarMarkers = useMemo(
    () =>
      buildCalendarMarkers(calendarEvents, (event) =>
        event.kind === 'ticket'
          ? toMarkerTone(priorityTone((event.priority ?? 'Medium') as never))
          : toMarkerTone(statusTone(event.status as never)),
      ),
    [calendarEvents],
  )

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
    ? state.properties.find((p) => p.id === focusEvent.propertyId)
    : undefined
  const focusViewing =
    focusEvent?.kind === 'viewing' ? scheduled.find((v) => v.id === focusEvent.id) : undefined
  const focusAction = calendarEventAction(focusEvent) ?? (
    focusProperty
      ? { label: 'Open property', to: `/workspace/properties/${focusProperty.id}` }
      : { label: 'Viewings calendar', to: `/workspace/sales/viewings?date=${dayKey}` }
  )

  const CtaIcon =
    heroBase?.kind === 'issue'
      ? Wrench
      : heroBase?.kind === 'viewing'
        ? CalendarDays
        : heroBase?.kind === 'application'
          ? ClipboardList
          : CalendarDays

  const listItems = useMemo(
    () =>
      opsItems.map((item) => {
        const id = listKey(item.kind, item.id)
        return {
          ...agentToListItem(
            item,
            item.kind === 'viewing' ? [{ id: user.id, name: user.name }] : [],
          ),
          unread: !isSeen(id),
        }
      }),
    [opsItems, user.id, user.name, isSeen],
  )

  return (
    <DashboardPage>
      <DashboardBreadcrumb
        items={[
          { label: 'Dashboard', to: '/workspace' },
          { label: fieldLabel },
        ]}
      />

      {heroBase && (
        <AttentionHero
          {...heroBase}
          eyebrow={homeEyebrow}
          secondaryBadge={isCandidate ? 'Candidate' : 'Full agent'}
          detail={
            isCandidate
              ? [heroBase.detail, 'Mentor-approved actions only'].filter(Boolean).join(' · ')
              : heroBase.detail
          }
          cta={
            heroBase.cta
              ? {
                  ...heroBase.cta,
                  label:
                    isCandidate && heroBase.kind === 'viewing'
                      ? 'Open assigned viewing'
                      : isCandidate && heroBase.kind === 'issue'
                        ? 'Check ticket'
                        : heroBase.cta.label,
                  icon: <CtaIcon className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                }
              : undefined
          }
          secondaryCta={
            isCandidate
              ? { label: 'My applications', to: '/workspace/sales/applications' }
              : heroBase.secondaryCta ?? {
                  label: 'Log maintenance',
                  to: maintenanceCreateHref({ returnTo: '/workspace/dashboard' }),
                }
          }
        />
      )}

      <DashboardTabs
        tabs={tabs}
        value={tab}
        onChange={(id) => {
          setTab(id as AgentTab)
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
              placeholder={searchPlaceholder}
              filters={availableFilters}
              filterValue={listFilter}
              onFilterChange={(id) => setListFilter(id as AgentFilter)}
              actions={
                <CreateMenu
                  items={
                    isCandidate
                      ? [
                          { to: '/workspace/sales/viewings?create=1', label: 'Request viewing slot' },
                          {
                            to: maintenanceCreateHref({ returnTo: '/workspace/dashboard' }),
                            label: 'Report site issue',
                          },
                        ]
                      : [
                          { to: '/workspace/sales/viewings?create=1', label: 'Book viewing' },
                          {
                            to: maintenanceCreateHref({ returnTo: '/workspace/dashboard' }),
                            label: 'Log maintenance',
                          },
                          { to: '/workspace/properties/new', label: 'New property' },
                        ]
                  }
                />
              }
            />

            {listFilter !== 'all' && (
              <FilterClearHint
                label={AGENT_FILTERS.find((f) => f.id === listFilter)?.label ?? listFilter}
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
                empty={
                  isCandidate
                    ? 'Nothing assigned yet — your mentor will push viewings and tickets here.'
                    : 'Nothing on your book — check back after assignments land.'
                }
                limit={5}
                showMoreTo={
                  tab === 'tickets'
                    ? '/workspace/operations/maintenance'
                    : '/workspace/sales/viewings'
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
                  layout="stack"
                  onClose={() => setCalendarOpen(false)}
                  dayViewTo={`/workspace/sales/viewings?date=${dayKey}`}
                  className="rounded-none border-0 shadow-none"
                />
              </DashboardCalendarShell>
            </CalendarToggle>

            <OpsDetailPanel
              className="flex min-h-0 flex-1 flex-col"
              eyebrow={
                focusEvent
                  ? focusEvent.kind === 'viewing_slot'
                    ? 'Open slot'
                    : focusEvent.kind === 'viewing'
                      ? 'Viewing'
                      : 'Maintenance'
                  : 'Day events'
              }
              title={focusEvent?.title ?? 'No events this day'}
              subtitle={
                focusProperty
                  ? `${focusProperty.address} · ${focusProperty.suburb}`
                  : focusEvent?.meta
              }
              action={focusAction}
              requestBy={
                focusEvent?.kind === 'viewing'
                  ? focusEvent.meta.split('·')[0]?.trim()
                  : focusEvent?.kind === 'ticket'
                    ? focusEvent.meta.split('·').pop()?.trim()
                    : undefined
              }
              status={
                focusEvent?.kind === 'ticket' ? focusEvent.priority : focusEvent?.status
              }
              statusTone={
                focusEvent
                  ? focusEvent.kind === 'ticket'
                    ? priorityTone((focusEvent.priority ?? 'Medium') as never)
                    : statusTone(focusEvent.status as never)
                  : undefined
              }
              chips={
                <QuickLinkChips
                  items={
                    isCandidate
                      ? [
                          {
                            to: '/workspace/sales/viewings',
                            label: `${scheduled.length} assigned`,
                            icon: <CalendarDays className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                          },
                          {
                            to: '/workspace/operations/maintenance',
                            label: `${openTickets.length} to check`,
                            icon: <Wrench className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                            tone: 'accent',
                          },
                          {
                            to: '/workspace/sales/applications',
                            label: `${apps.length} apps`,
                            icon: <FileCheck2 className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                          },
                        ]
                      : [
                          {
                            to: '/workspace/sales/viewings',
                            label: `${scheduled.length} viewings`,
                            icon: <CalendarDays className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                          },
                          {
                            to: '/workspace/operations/maintenance',
                            label: `${openTickets.length} maintenance`,
                            icon: <Wrench className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                            tone: 'accent',
                          },
                          {
                            to: '/workspace/sales/applications',
                            label: `${apps.length} apps`,
                            icon: <FileCheck2 className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                          },
                        ]
                  }
                />
              }
            >
              {focusViewing && (
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      updateViewing(focusViewing.id, {
                        status: 'Completed',
                        attendance: 'Attended',
                      })
                    }
                  >
                    Mark attended
                  </Button>
                </div>
              )}
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

