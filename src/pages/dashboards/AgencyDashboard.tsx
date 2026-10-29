import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Users,
  UserCog,
  Wrench,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth, usePropertyScope } from '../../context/AuthContext'
import { opsSignature, useSeenOpsItems } from '../../hooks/useSeenOpsItems'
import { priorityTone, statusTone } from '../../components/ui'
import { OpsPreviewModal, type PreviewTarget } from '../../components/admin/OpsPreviewModal'
import { maintenanceCreateHref } from '../maintenance/MaintenanceCreatePage'
import {
  AttentionHero,
  CalendarWithTray,
  CreateMenu,
  DashboardBreadcrumb,
  DashboardPage,
  DashboardSplit,
  DashboardTabs,
  FilterClearHint,
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
  type CalendarTrayItem,
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
import {
  countDayCalendarEvents,
  formatQuickLinksDayLabel,
  isoDateKey,
} from '../../lib/dashboardDayLinks'

type DashTab = 'overview' | 'properties' | 'maintenance' | 'viewings' | 'applications'
type ListFilter = 'all' | 'attention' | 'high' | 'scheduled' | 'awaiting' | 'listed'

type OpsItem =
  | { kind: 'viewing'; id: string; title: string; meta: string; status: string; date: string; propertyId: string; photos: number; agentIds: string[] }
  | { kind: 'ticket'; id: string; title: string; meta: string; status: string; date: string; propertyId: string; photos: number; agentIds: string[]; priority: string }
  | { kind: 'application'; id: string; title: string; meta: string; status: string; date: string; propertyId: string; photos: number; agentIds: string[] }
  | { kind: 'property'; id: string; title: string; meta: string; status: string; date: string; propertyId: string; photos: number; agentIds: string[] }

/** Property states that need no action, so they stay off the overview to-do list. */
const SETTLED_PROPERTY_STATUSES = new Set(['Published', 'Featured', 'Occupied', 'Let', 'Rented', 'Sold', 'Archived'])

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

export function AgencyDashboard() {
  const { state } = useStore()
  const { allowedPropertyIds, dealVisible, ticketVisible } = usePropertyScope()
  const { has, role, user } = useAuth()
  const { isSeen, markSeen } = useSeenOpsItems(user.id)

  const canProperties = has('assets.view') || has('listings.publish')
  const canMaintenance = has('maintenance.view')
  const canViewings = has('viewings.manage')
  const canApplications = has('applications.view')
  const canManageAssets = has('assets.manage')
  const canManageMaintenance = has('maintenance.manage')
  const canManageLeads = has('leads.view') || has('leads.manage')
  const canManageUsers = has('users.manage')
  const isPrincipal = role === 'client_admin'
  const isAgencyAdmin = role === 'agent_admin'
  const homeLabel = isPrincipal
    ? 'Principal home'
    : isAgencyAdmin
      ? 'Office ops home'
      : 'Agency home'
  const homeEyebrow = isPrincipal
    ? 'Agency leadership'
    : isAgencyAdmin
      ? 'Day-to-day ops'
      : 'Agency desk'
  const searchPlaceholder = isPrincipal
    ? 'Search portfolio risk, applications, or viewings…'
    : 'Search properties, maintenance, viewings…'

  const [tab, setTab] = useState<DashTab>('overview')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => new Date())

  const properties = useMemo(
    () =>
      canProperties
        ? state.properties.filter((p) => allowedPropertyIds.has(p.id))
        : [],
    [state.properties, allowedPropertyIds, canProperties],
  )
  const apps = useMemo(
    () =>
      canApplications ? state.applications.filter((a) => dealVisible(a)) : [],
    [state.applications, dealVisible, canApplications],
  )
  const tickets = useMemo(
    () => (canMaintenance ? state.tickets.filter((t) => ticketVisible(t)) : []),
    [state.tickets, ticketVisible, canMaintenance],
  )
  const viewings = useMemo(
    () => (canViewings ? state.viewings.filter((v) => dealVisible(v)) : []),
    [state.viewings, dealVisible, canViewings],
  )
  const viewingSlots = useMemo(
    () => (canViewings ? state.viewingSlots.filter((s) => dealVisible(s)) : []),
    [state.viewingSlots, dealVisible, canViewings],
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
      // Overview is a to-do list: live listings are not work, so only listings that need something show.
      list = [
        ...ticketItems,
        ...viewingItems.filter((v) => v.status === 'Scheduled'),
        ...appItems,
        ...propertyItems.filter((p) => !SETTLED_PROPERTY_STATUSES.has(p.status)),
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

  const tabs = useMemo(() => {
    const all: Array<{ id: DashTab; label: string; count: number; show: boolean }> = [
      { id: 'overview', label: 'Overview', count: sectionCounts.overview, show: true },
      {
        id: 'properties',
        label: 'Properties',
        count: sectionCounts.properties,
        show: canProperties,
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        count: sectionCounts.maintenance,
        show: canMaintenance,
      },
      {
        id: 'viewings',
        label: 'Viewings',
        count: sectionCounts.viewings,
        show: canViewings,
      },
      {
        id: 'applications',
        label: 'Applications',
        count: sectionCounts.applications,
        show: canApplications,
      },
    ]
    return all.filter((t) => t.show).map(({ id, label, count }) => ({ id, label, count }))
  }, [sectionCounts, canProperties, canMaintenance, canViewings, canApplications])

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) {
      setTab((tabs[0]?.id as DashTab) ?? 'overview')
    }
  }, [tabs, tab])

  const createMenuItems = useMemo(() => {
    const items: Array<{ to: string; label: string }> = []
    if ((isPrincipal || isAgencyAdmin) && canManageUsers) {
      items.push({ to: '/workspace/admin/users/new?intent=team', label: 'Add team member' })
    }
    if (canManageAssets) items.push({ to: '/workspace/properties/new', label: 'New property' })
    if (canManageMaintenance) {
      items.push({
        to: maintenanceCreateHref({ returnTo: '/workspace/dashboard' }),
        label: 'Log maintenance',
      })
    }
    if (canViewings) items.push({ to: '/workspace/sales/viewings?create=1', label: 'Book viewing' })
    if (canApplications) {
      items.push({
        to: '/workspace/sales/applications',
        label: isAgencyAdmin ? 'Review applications' : 'New application',
      })
    }
    if (isAgencyAdmin && canManageLeads) {
      items.push({ to: '/workspace/sales/crm', label: 'Open CRM pipeline' })
    }
    return items
  }, [
    isPrincipal,
    isAgencyAdmin,
    canManageUsers,
    canManageAssets,
    canManageMaintenance,
    canViewings,
    canApplications,
    canManageLeads,
  ])

  const banner = useMemo(() => {
    switch (tab) {
      case 'overview':
        if (sectionCounts.overview <= 0) return null
        return {
          tone: 'warning' as const,
          text: isPrincipal
            ? `${sectionCounts.overview} items need leadership attention across maintenance, viewings, and applications.`
            : isAgencyAdmin
              ? `${sectionCounts.overview} office queue items — clear maintenance, viewings, and app reviews today.`
              : `You have ${sectionCounts.overview} open items across maintenance, viewings, and applications.`,
        }
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
              text: isAgencyAdmin
                ? `${sectionCounts.applications} ${sectionCounts.applications === 1 ? 'application awaits' : 'applications await'} your office review.`
                : `${sectionCounts.applications} ${sectionCounts.applications === 1 ? 'application is' : 'applications are'} waiting for review.`,
            }
          : null
      default:
        return null
    }
  }, [tab, sectionCounts, isPrincipal, isAgencyAdmin])

  const availableFilters = FILTERS.filter((f) => !f.tabs || f.tabs.includes(tab))

  const activeItem = useMemo(() => {
    if (!selectedKey) return null
    const parsed = parseListId(selectedKey)
    if (!parsed) return null
    return opsItems.find((i) => i.kind === parsed.kind && i.id === parsed.id) ?? null
  }, [opsItems, selectedKey])

  const openPreview = (item: OpsItem) => {
    markSeen(listKey(item.kind, item.id), opsSignature(item))
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
  }

  const dayKey = dateKey(selectedDay)

  const calendarEvents: CalendarEvent[] = useMemo(
    () =>
      mergeCalendarEvents(
        buildViewingBookingCalendarEvents(viewings.filter((v) => v.status === 'Scheduled'), properties),
        buildViewingSlotCalendarEvents(
          viewingSlots.filter((s) => s.status === 'Open' || s.status === 'Full'),
          properties,
        ),
        buildMaintenanceCalendarEvents(openTickets, properties),
      ),
    [viewings, viewingSlots, openTickets, properties],
  )

  const calendarMarkers: CalendarMarker[] = useMemo(
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

  const quickLinks = useMemo(() => {
    const items: Array<{
      to: string
      label: string
      icon: ReactNode
      tone?: 'accent'
    }> = []
    const dayViewingCount = countDayCalendarEvents(dayEvents, ['viewing', 'viewing_slot'])
    const dayTickets = openTickets.filter((t) => isoDateKey(t.openedAt) === dayKey)
    const dayUrgent = dayTickets.filter(
      (t) => t.priority === 'High' || t.priority === 'Urgent' || t.priority === 'Emergency',
    )
    const dayApps = awaitingApps.filter((a) => isoDateKey(a.updatedAt) === dayKey)

    if ((isPrincipal || isAgencyAdmin) && canManageUsers) {
      items.push({
        to: '/workspace/people/staff',
        label: 'Team roster',
        icon: <UserCog className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
      })
    }
    if (canViewings) {
      items.push({
        to: `/workspace/sales/viewings?date=${dayKey}`,
        label: `${dayViewingCount} viewings`,
        icon: <CalendarDays className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
      })
    }
    if (canMaintenance) {
      items.push({
        to: '/workspace/operations/maintenance',
        label: `${dayTickets.length} open issues`,
        icon: <Wrench className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
        tone: 'accent',
      })
      items.push({
        to: '/workspace/operations/maintenance',
        label: `${dayUrgent.length} urgent`,
        icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
        tone: 'accent',
      })
    }
    if (canApplications) {
      items.push({
        to: '/workspace/sales/applications',
        label: `${dayApps.length} apps`,
        icon: <ClipboardList className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
      })
    }
    if (canManageLeads) {
      items.push({
        to: '/workspace/sales/crm',
        label: isPrincipal ? 'Pipeline health' : 'CRM board',
        icon: <Users className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
      })
    }
    return items
  }, [
    dayKey,
    dayEvents,
    openTickets,
    awaitingApps,
    isPrincipal,
    isAgencyAdmin,
    canManageUsers,
    canViewings,
    canMaintenance,
    canApplications,
    canManageLeads,
  ])

  const quickLinksDayLabel = formatQuickLinksDayLabel(selectedDay)

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
  const focusAction =
    calendarEventAction(focusEvent) ??
    (focusProperty
      ? { label: 'Open property', to: `/workspace/properties/${focusProperty.id}` }
      : { label: 'View schedule', to: `/workspace/sales/viewings?date=${dayKey}` })

  const trayItems: CalendarTrayItem[] = useMemo(() => {
    if (!focusEvent) return []
    return [
      {
        id: focusEvent.id,
        title: focusEvent.title,
        eyebrow:
          focusEvent.kind === 'viewing_slot'
            ? 'Open slot'
            : focusEvent.kind === 'viewing'
              ? 'Viewing'
              : 'Maintenance',
        subtitle: focusProperty
          ? `${focusProperty.address} · ${focusProperty.suburb}`
          : focusEvent.meta,
        status: focusEvent.kind === 'ticket' ? focusEvent.priority : focusEvent.status,
        statusTone:
          focusEvent.kind === 'ticket'
            ? priorityTone((focusEvent.priority ?? 'Medium') as never)
            : statusTone(focusEvent.status as never),
        requestBy:
          focusEvent.kind === 'viewing'
            ? focusEvent.meta.split('·')[0]?.trim()
            : focusEvent.kind === 'ticket'
              ? focusEvent.meta.split('·').pop()?.trim()
              : undefined,
        action: focusAction,
        children:
          dayEvents.length > 1 ? (
            <div className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3 backdrop-blur-sm">
              <p className="text-sm text-ink-500">
                Event {eventIndex + 1} of {dayEvents.length}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => cycleDayEvent(-1)}
                  className="rounded-lg bg-primary-50 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary-100 disabled:opacity-50"
                  disabled={eventIndex === 0}
                  aria-label="Previous event"
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={() => cycleDayEvent(1)}
                  className="rounded-lg bg-primary-50 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary-100 disabled:opacity-50"
                  disabled={eventIndex === dayEvents.length - 1}
                  aria-label="Next event"
                >
                  Next →
                </button>
              </div>
            </div>
          ) : undefined,
      },
    ]
  }, [focusEvent, focusProperty, focusAction, eventIndex, dayEvents.length, cycleDayEvent])

  const CtaIcon =
    hero?.kind === 'issue'
      ? Wrench
      : hero?.kind === 'viewing'
        ? CalendarDays
        : hero?.kind === 'application'
          ? ClipboardList
          : ArrowRight

  // Opened, unchanged items leave the overview; they come back when something changes.
  const [showHandled, setShowHandled] = useState(false)
  const hidesHandled = tab === 'overview' && listFilter === 'all' && !query.trim()
  const { listItems, handledCount } = useMemo(() => {
    const all = opsItems.map((item) => {
      const id = listKey(item.kind, item.id)
      return { ...toListItem(item, users), unread: !isSeen(id, opsSignature(item)) }
    })
    if (!hidesHandled) return { listItems: all, handledCount: 0 }
    const open = all.filter((i) => i.unread || i.id === selectedKey)
    return { listItems: showHandled ? all : open, handledCount: all.length - open.length }
  }, [opsItems, users, isSeen, hidesHandled, showHandled, selectedKey])

  return (
    <DashboardPage>
      <DashboardBreadcrumb
        items={[
          { label: 'Dashboard', to: '/workspace' },
          { label: homeLabel },
        ]}
      />

      {hero && (
        <AttentionHero
          {...hero}
          propertyLink={has('assets.manage') ? hero.propertyLink : undefined}
          eyebrow={homeEyebrow}
          secondaryBadge={isPrincipal ? 'Principal' : isAgencyAdmin ? 'Agency Admin' : hero.secondaryBadge}
          cta={
            hero.cta
              ? {
                  ...hero.cta,
                  label:
                    isPrincipal && hero.kind === 'issue'
                      ? 'Escalate maintenance'
                      : isAgencyAdmin && hero.kind === 'application'
                        ? 'Review now'
                        : hero.cta.label,
                  icon: <CtaIcon className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                }
              : undefined
          }
          secondaryCta={
            isPrincipal && canManageUsers
              ? { label: 'Review team', to: '/workspace/people/staff' }
              : hero.secondaryCta
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
              placeholder={searchPlaceholder}
              filters={availableFilters}
              filterValue={listFilter}
              onFilterChange={(id) => setListFilter(id as ListFilter)}
              actions={
                createMenuItems.length > 0 ? <CreateMenu items={createMenuItems} /> : undefined
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
                empty={
                  isPrincipal
                    ? 'Portfolio looks clear — check Team or CRM if you need a deeper pulse.'
                    : isAgencyAdmin
                      ? 'Office queue is clear — book a viewing or log maintenance when work lands.'
                      : 'No matches — clear search or filters.'
                }
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
              {handledCount > 0 ? (
              <button
                type="button"
                className="mt-2 w-full cursor-pointer text-center text-xs font-semibold text-ink-500 hover:text-primary"
                onClick={() => setShowHandled((v) => !v)}
              >
                {showHandled ? 'Hide items you have already opened' : `Show ${handledCount} item${handledCount === 1 ? '' : 's'} you have already opened`}
              </button>
            ) : null}
            </div>
          </div>
        }
        right={
          <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
            <CalendarWithTray
              selected={selectedDay}
              onSelect={setSelectedDay}
              markers={calendarMarkers}
              trayItems={trayItems}
              months={2}
              layout="stack"
              dayViewTo={`/workspace/sales/viewings?date=${dayKey}`}
              className="flex flex-col overflow-hidden"
            />

            {quickLinks.length > 0 && (
              <div className="rounded-[1.25rem] border border-primary-100 bg-white p-5 shadow-[0_12px_32px_-24px_rgba(15,39,68,0.3)]">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Quick links · {quickLinksDayLabel}
                </p>
                <QuickLinkChips items={quickLinks} />
              </div>
            )}
          </div>
        }
      />

      <OpsPreviewModal target={preview} onClose={() => setPreview(null)} />
    </DashboardPage>
  )
}
