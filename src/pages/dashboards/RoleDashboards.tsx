import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileCheck2,
  HardHat,
  Home,
  Wrench,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { isFieldAgent } from '../../lib/permissions'
import { blockedPropertyIdsForApplicant } from '../../lib/blockedApplicants'
import { Badge, Button, priorityTone, statusTone } from '../../components/ui'
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
  parseDay,
  pickAttentionHero,
  toMarkerTone,
  useEventCycle,
  type CalendarMarker,
  type OpsListItemData,
} from '../../components/dashboard'
import { formatZAR } from '../../data/seed'
import { AgencyDashboard } from './AgencyDashboard'

export { AgencyDashboard }

/* ─── Super Admin ─────────────────────────────────────────────────────────── */

type SuperTab = 'overview' | 'billing' | 'agencies'
type SuperFilter = 'all' | 'unpaid' | 'paid' | 'active'

type SuperOpsItem =
  | {
      kind: 'invoice'
      id: string
      title: string
      meta: string
      status: string
      date: string
      amount: number
    }
  | {
      kind: 'sub'
      id: string
      title: string
      meta: string
      status: string
      date: string
      anchorDay: number
    }

const SUPER_FILTERS: { id: SuperFilter; label: string; tabs?: SuperTab[] }[] = [
  { id: 'all', label: 'All items' },
  { id: 'unpaid', label: 'Unpaid only', tabs: ['overview', 'billing'] },
  { id: 'paid', label: 'Paid only', tabs: ['overview', 'billing'] },
  { id: 'active', label: 'Active subs', tabs: ['overview', 'agencies'] },
]

function superToListItem(item: SuperOpsItem): OpsListItemData {
  return {
    id: listKey(item.kind, item.id),
    title: item.title,
    meta: item.meta,
    date: item.date,
    badge: item.status,
    badgeTone: statusTone(item.status),
  }
}

export function SuperAdminDashboard() {
  const { state, runClientBillingCycle, markInvoicePaid } = useStore()
  const unpaid = state.invoices.filter((i) => i.paymentStatus === 'UNPAID')
  const emergencies = state.tickets.filter(
    (t) => t.priority === 'Emergency' && t.status === 'Requested',
  )

  const [tab, setTab] = useState<SuperTab>('overview')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<SuperFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => new Date(2026, 6, 23))
  const [calendarOpen, setCalendarOpen] = useState(true)

  const heroProperty = state.properties[0]
  const hero = unpaid[0]
    ? {
        eyebrow: 'Platform billing',
        title: `Collect ${formatZAR(unpaid[0].totalAmountDue)}`,
        detail: `${state.agencies.find((a) => a.id === unpaid[0].clientId)?.name ?? 'Agency'} · unpaid invoice`,
        badge: 'UNPAID',
        badgeTone: 'danger' as const,
        secondaryBadge: 'SaaS',
        stats: [
          { label: 'Agencies', value: String(state.agencies.length) },
          { label: 'Unpaid', value: String(unpaid.length) },
          { label: 'Buildings', value: String(state.buildings.length) },
        ],
        cta: { label: 'Open billing', to: '/workspace/platform/billing' },
        secondaryCta: { label: 'Agencies', to: '/workspace/platform' },
        propertyLink: { to: '/workspace/platform', label: 'Control plane' },
        image: heroProperty?.images[0],
      }
    : {
        eyebrow: 'Platform health',
        title: `${state.agencies.length} agencies live`,
        detail: emergencies.length
          ? `${emergencies.length} emergency maintenance open across tenants`
          : 'Subscriptions and footprint billing look healthy',
        badge: emergencies.length ? 'Attention' : 'Healthy',
        badgeTone: emergencies.length ? ('danger' as const) : ('success' as const),
        secondaryBadge: 'Super Admin',
        stats: [
          { label: 'Agencies', value: String(state.agencies.length) },
          { label: 'Units', value: String(state.units.length) },
          { label: 'Invoices', value: String(state.invoices.length) },
        ],
        cta: { label: 'Manage agencies', to: '/workspace/platform' },
        secondaryCta: { label: 'Billing', to: '/workspace/platform/billing' },
        propertyLink: { to: '/workspace/platform/billing', label: 'SaaS billing' },
        image: heroProperty?.images[0],
      }

  const opsItems: SuperOpsItem[] = useMemo(() => {
    const invoiceItems: SuperOpsItem[] = state.invoices.map((inv) => {
      const agency = state.agencies.find((a) => a.id === inv.clientId)
      return {
        kind: 'invoice',
        id: inv.id,
        title: agency?.name ?? inv.clientId,
        meta: `${inv.billingPeriodStart} → ${inv.billingPeriodEnd} · ${formatZAR(inv.totalAmountDue)}`,
        status: inv.paymentStatus,
        date: inv.billingPeriodEnd,
        amount: inv.totalAmountDue,
      }
    })
    const unpaidItems: SuperOpsItem[] = unpaid.map((inv) => {
      const agency = state.agencies.find((a) => a.id === inv.clientId)
      return {
        kind: 'invoice',
        id: inv.id,
        title: agency?.name ?? inv.clientId,
        meta: `Due · ${formatZAR(inv.totalAmountDue)}`,
        status: inv.paymentStatus,
        date: inv.billingPeriodEnd,
        amount: inv.totalAmountDue,
      }
    })
    const subItems: SuperOpsItem[] = state.clientSubscriptions.map((s) => {
      const plan = state.billingPlans.find((p) => p.id === s.planId)
      const agency = state.agencies.find((a) => a.id === s.clientId)
      return {
        kind: 'sub',
        id: s.id,
        title: agency?.name ?? s.clientId,
        meta: `${plan?.planName ?? 'Plan'} · day ${s.billingCycleAnchorDay}`,
        status: s.status,
        date: `2026-07-${String(Math.min(28, s.billingCycleAnchorDay)).padStart(2, '0')}`,
        anchorDay: s.billingCycleAnchorDay,
      }
    })

    let list: SuperOpsItem[] = []
    if (tab === 'billing') list = invoiceItems
    else if (tab === 'agencies') list = subItems
    else list = [...unpaidItems, ...subItems]

    if (listFilter === 'unpaid') list = list.filter((i) => i.status === 'UNPAID')
    else if (listFilter === 'paid')
      list = list.filter((i) => i.status === 'PAID' || i.status === 'ACTIVE')
    else if (listFilter === 'active')
      list = list.filter((i) => i.kind === 'sub' && i.status === 'ACTIVE')

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) => i.title.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q),
      )
    }
    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [state, tab, query, unpaid, listFilter])

  const sectionCounts = useMemo(
    () => ({
      overview: unpaid.length + state.clientSubscriptions.length,
      billing: unpaid.length,
      agencies: state.agencies.length,
    }),
    [unpaid.length, state.clientSubscriptions.length, state.agencies.length],
  )

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview', count: sectionCounts.overview },
      { id: 'billing', label: 'Billing', count: sectionCounts.billing },
      { id: 'agencies', label: 'Agencies', count: sectionCounts.agencies },
    ],
    [sectionCounts],
  )

  const banner = useMemo(() => {
    switch (tab) {
      case 'overview':
        return unpaid.length > 0
          ? {
              tone: 'danger' as const,
              text: `${unpaid.length} unpaid SaaS invoice${unpaid.length === 1 ? '' : 's'} need collection.`,
            }
          : null
      case 'billing':
        return unpaid.length > 0
          ? {
              tone: 'warning' as const,
              text: `${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'} awaiting payment.`,
            }
          : {
              tone: 'info' as const,
              text: `${state.invoices.length} invoice${state.invoices.length === 1 ? '' : 's'} on the platform ledger.`,
            }
      case 'agencies':
        return {
          tone: 'info' as const,
          text: `${state.agencies.length} agenc${state.agencies.length === 1 ? 'y' : 'ies'} · ${state.clientSubscriptions.length} subscription${state.clientSubscriptions.length === 1 ? '' : 's'}.`,
        }
      default:
        return null
    }
  }, [tab, unpaid.length, state.invoices.length, state.agencies.length, state.clientSubscriptions.length])

  const availableFilters = SUPER_FILTERS.filter((f) => !f.tabs || f.tabs.includes(tab))

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

  const selectItem = (item: SuperOpsItem) => {
    setSelectedKey(listKey(item.kind, item.id))
    setSelectedDay(parseDay(item.date, selectedDay))
    setCalendarOpen(true)
  }

  const calendarMarkers: CalendarMarker[] = useMemo(
    () =>
      state.invoices.map((inv) => ({
        date: inv.billingPeriodEnd,
        tone: toMarkerTone(statusTone(inv.paymentStatus)),
      })),
    [state.invoices],
  )

  const dayKey = dateKey(selectedDay)

  const calendarEvents: SuperOpsItem[] = useMemo(() => {
    return state.invoices.map((inv) => {
      const agency = state.agencies.find((a) => a.id === inv.clientId)
      return {
        kind: 'invoice' as const,
        id: inv.id,
        title: agency?.name ?? inv.clientId,
        meta: `${formatZAR(inv.totalAmountDue)} · ${inv.billingPeriodStart} → ${inv.billingPeriodEnd}`,
        status: inv.paymentStatus,
        date: inv.billingPeriodEnd,
        amount: inv.totalAmountDue,
      }
    })
  }, [state.invoices, state.agencies])

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
  const focusInvoice =
    focusEvent?.kind === 'invoice'
      ? state.invoices.find((i) => i.id === focusEvent.id)
      : undefined

  const listItems = opsItems.map(superToListItem)

  return (
    <DashboardPage>
      <DashboardBreadcrumb
        items={[
          { label: 'Dashboard', to: '/workspace' },
          { label: 'Platform control plane' },
        ]}
      />

      <AttentionHero
        {...hero}
        cta={{
          ...hero.cta,
          icon: <Building2 className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
        }}
      />

      <DashboardTabs
        tabs={tabs}
        value={tab}
        onChange={(id) => {
          setTab(id as SuperTab)
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
              placeholder="Search agencies, invoices…"
              filters={availableFilters}
              filterValue={listFilter}
              onFilterChange={(id) => setListFilter(id as SuperFilter)}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <CreateMenu
                    items={[
                      { to: '/workspace/platform', label: 'Manage agencies' },
                      { to: '/workspace/platform/billing', label: 'Open billing' },
                    ]}
                  />
                  <Button
                    className="min-h-11 rounded-2xl"
                    variant="secondary"
                    onClick={() => {
                      const id = state.agencies[0]?.id
                      if (id) runClientBillingCycle(id)
                    }}
                  >
                    Invoice first agency
                  </Button>
                </div>
              }
            />

            {listFilter !== 'all' && (
              <FilterClearHint
                label={SUPER_FILTERS.find((f) => f.id === listFilter)?.label ?? listFilter}
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
                  if (item) selectItem(item)
                }}
                empty="No platform queue items."
                limit={5}
                showMoreTo="/workspace/platform/billing"
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
                  dayViewTo={`/workspace/platform/billing?date=${dayKey}`}
                  className="h-full rounded-none border-0 shadow-none"
                />
              </DashboardCalendarShell>
            </CalendarToggle>

            <OpsDetailPanel
              className="flex min-h-0 flex-1 flex-col"
              eyebrow={focusEvent ? (focusEvent.kind === 'invoice' ? 'Invoice' : 'Subscription') : 'Day events'}
              title={focusEvent?.title ?? 'No events this day'}
              subtitle={focusEvent?.meta}
              action={{ label: 'Open billing', to: '/workspace/platform/billing' }}
              status={focusEvent?.status}
              statusTone={focusEvent ? statusTone(focusEvent.status) : undefined}
              chips={
                <QuickLinkChips
                  items={[
                    {
                      to: '/workspace/platform',
                      label: `${state.agencies.length} agencies`,
                      icon: <Building2 className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                    },
                    {
                      to: '/workspace/platform/billing',
                      label: `${unpaid.length} unpaid`,
                      icon: <CreditCard className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                      tone: 'accent',
                    },
                  ]}
                />
              }
            >
              {focusInvoice && focusInvoice.paymentStatus === 'UNPAID' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => markInvoicePaid(focusInvoice.id)}>
                    Mark paid
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => runClientBillingCycle(focusInvoice.clientId)}
                  >
                    Re-run billing
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
    </DashboardPage>
  )
}

/* ─── Ground Agent ────────────────────────────────────────────────────────── */

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
  const { scopeAgency, scopeAgent, role } = useAgencyScope()

  const [tab, setTab] = useState<AgentTab>('overview')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<AgentFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => new Date(2026, 6, 23))
  const [calendarOpen, setCalendarOpen] = useState(true)

  const props = state.properties.filter(
    (p) => scopeAgency(p.agencyId) && (!isFieldAgent(role) || scopeAgent(p.agentId)),
  )
  const viewings = state.viewings.filter(
    (v) => scopeAgency(v.agencyId) && v.agentId === user.id,
  )
  const apps = state.applications.filter((a) => scopeAgency(a.agencyId) && a.agentId === user.id)
  const tickets = state.tickets.filter(
    (t) =>
      scopeAgency(t.agencyId) &&
      (t.assignedAgentId === user.id || props.some((p) => p.id === t.propertyId)),
  )

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
              text: `You have ${sectionCounts.overview} open item${sectionCounts.overview === 1 ? '' : 's'} across viewings and maintenance.`,
            }
          : null
      case 'viewings':
        return sectionCounts.viewings > 0
          ? {
              tone: 'warning' as const,
              text: `${sectionCounts.viewings} scheduled ${sectionCounts.viewings === 1 ? 'viewing' : 'viewings'} coming up.`,
            }
          : null
      case 'tickets':
        return sectionCounts.tickets > 0
          ? {
              tone: 'danger' as const,
              text: `${sectionCounts.tickets} open maintenance.`,
            }
          : null
      default:
        return null
    }
  }, [tab, sectionCounts])

  const availableFilters = AGENT_FILTERS.filter((f) => !f.tabs || f.tabs.includes(tab))

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

  const openPreview = (item: AgentOpsItem) => {
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

  const calendarMarkers: CalendarMarker[] = useMemo(() => {
    const markers: CalendarMarker[] = []
    for (const v of scheduled) {
      markers.push({ date: v.date, tone: toMarkerTone(statusTone(v.status)) })
    }
    for (const t of openTickets) {
      markers.push({ date: t.openedAt, tone: toMarkerTone(priorityTone(t.priority)) })
    }
    return markers
  }, [scheduled, openTickets])

  const dayKey = dateKey(selectedDay)

  const calendarEvents: AgentOpsItem[] = useMemo(() => {
    const events: AgentOpsItem[] = []
    for (const v of scheduled) {
      const prop = state.properties.find((p) => p.id === v.propertyId)
      events.push({
        kind: 'viewing',
        id: v.id,
        title: `Viewing · ${v.time}`,
        meta: `${v.applicantName} · ${prop?.title ?? 'Property'}`,
        status: v.status,
        date: v.date,
        propertyId: v.propertyId,
      })
    }
    for (const t of openTickets) {
      events.push({
        kind: 'ticket',
        id: t.id,
        title: t.title,
        meta: `${t.assetLabel} · ${t.reportedBy}`,
        status: t.status,
        date: t.openedAt,
        propertyId: t.propertyId,
        priority: t.priority,
        photos: t.photos,
      })
    }
    return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
  }, [scheduled, openTickets, state.properties])

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

  const CtaIcon =
    heroBase?.kind === 'issue'
      ? Wrench
      : heroBase?.kind === 'viewing'
        ? CalendarDays
        : heroBase?.kind === 'application'
          ? ClipboardList
          : CalendarDays

  const listItems = opsItems.map((item) =>
    agentToListItem(item, item.kind === 'viewing' ? [{ id: user.id, name: user.name }] : []),
  )

  return (
    <DashboardPage>
      <DashboardBreadcrumb
        items={[
          { label: 'Dashboard', to: '/workspace' },
          { label: 'Field desk' },
        ]}
      />

      {heroBase && (
        <AttentionHero
          {...heroBase}
          cta={
            heroBase.cta
              ? {
                  ...heroBase.cta,
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
              placeholder="Search your viewings and maintenance…"
              filters={availableFilters}
              filterValue={listFilter}
              onFilterChange={(id) => setListFilter(id as AgentFilter)}
              actions={
                <CreateMenu
                  items={[
                    { to: '/workspace/sales/viewings?create=1', label: 'Book viewing' },
                    { to: '/workspace/operations/maintenance?create=1', label: 'Log maintenance' },
                    { to: '/workspace/properties/new', label: 'New property' },
                  ]}
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
                empty="Nothing on your book — check back after assignments land."
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
                  onClose={() => setCalendarOpen(false)}
                  dayViewTo={`/workspace/sales/viewings?date=${dayKey}`}
                  className="h-full rounded-none border-0 shadow-none"
                />
              </DashboardCalendarShell>
            </CalendarToggle>

            <OpsDetailPanel
              className="flex min-h-0 flex-1 flex-col"
              eyebrow={
                focusEvent
                  ? focusEvent.kind === 'viewing'
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
              action={
                focusProperty
                  ? { label: 'Open property', to: `/workspace/properties/${focusProperty.id}` }
                  : { label: 'Viewings calendar', to: '/workspace/sales/viewings' }
              }
              requestBy={
                focusEvent?.kind === 'viewing'
                  ? focusEvent.meta.split('·')[0]?.trim()
                  : focusEvent?.kind === 'ticket'
                    ? focusEvent.meta.split('·').pop()?.trim()
                    : undefined
              }
              status={focusEvent?.kind === 'ticket' ? focusEvent.priority : focusEvent?.status}
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
                  ]}
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

/* ─── Landlord ────────────────────────────────────────────────────────────── */

type LandlordTab = 'overview' | 'payments' | 'maintenance'
type LandlordFilter = 'all' | 'overdue' | 'open' | 'attention'

type LandlordOpsItem =
  | {
      kind: 'property'
      id: string
      title: string
      meta: string
      status: string
      date: string
      propertyId: string
      photos: number
    }
  | {
      kind: 'payment'
      id: string
      title: string
      meta: string
      status: string
      date: string
      propertyId?: string
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
    }

const LANDLORD_FILTERS: { id: LandlordFilter; label: string; tabs?: LandlordTab[] }[] = [
  { id: 'all', label: 'All items' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'overdue', label: 'Overdue', tabs: ['overview', 'payments'] },
  { id: 'open', label: 'Open issues', tabs: ['overview', 'maintenance'] },
]

function landlordToListItem(item: LandlordOpsItem): OpsListItemData {
  return {
    id: listKey(item.kind, item.id),
    title: item.title,
    meta: item.meta,
    date: item.date,
    badge: item.kind === 'ticket' ? item.priority : item.status,
    badgeTone:
      item.kind === 'ticket' ? priorityTone(item.priority) : statusTone(item.status),
    photos: item.kind === 'property' ? item.photos : undefined,
  }
}

export function LandlordDashboard() {
  const { state } = useStore()
  const { user } = useAuth()
  const props = state.properties.filter((p) => p.landlordId === user.id)
  const payments = state.payments.filter(
    (p) => p.landlordVisible && props.some((x) => x.id === p.propertyId),
  )
  const tickets = state.tickets.filter((t) => props.some((p) => p.id === t.propertyId))
  const openTickets = tickets.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled')

  const [tab, setTab] = useState<LandlordTab>('overview')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<LandlordFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => new Date(2026, 6, 23))
  const [calendarOpen, setCalendarOpen] = useState(true)

  const featured = props[0]
  const hero = openTickets[0]
    ? {
        eyebrow: 'Maintenance on your asset',
        title: openTickets[0].title,
        detail: `${props.find((p) => p.id === openTickets[0].propertyId)?.title ?? 'Property'} · agency-managed`,
        badge: openTickets[0].priority,
        badgeTone: 'danger' as const,
        secondaryBadge: openTickets[0].status,
        stats: [
          { label: 'Assets', value: String(props.length) },
          { label: 'Open issues', value: String(openTickets.length) },
          { label: 'Payments', value: String(payments.length) },
        ],
        cta: { label: 'Owner portal', to: '/workspace/portals/owner' },
        secondaryCta: featured
          ? { label: 'Open property', to: `/workspace/properties/${featured.id}` }
          : undefined,
        propertyLink: featured
          ? { to: `/workspace/properties/${featured.id}` }
          : { to: '/workspace/portals/owner', label: 'Owner portal' },
        image: (props.find((p) => p.id === openTickets[0].propertyId) ?? featured)?.images[0],
      }
    : featured
      ? {
          eyebrow: 'Owner overview',
          title: featured.title,
          detail: `${featured.suburb}, ${featured.city} · agency handles tenants`,
          badge: featured.status,
          badgeTone: 'brand' as const,
          secondaryBadge: featured.type,
          stats: [
            {
              label: 'Rent',
              value: featured.rent ? `${formatZAR(featured.rent)}/mo` : formatZAR(featured.price),
            },
            { label: 'Payments', value: String(payments.length) },
            { label: 'Issues', value: String(openTickets.length) },
          ],
          cta: { label: 'Owner portal', to: '/workspace/portals/owner' },
          secondaryCta: {
            label: 'Property details',
            to: `/workspace/properties/${featured.id}`,
          },
          propertyLink: { to: `/workspace/properties/${featured.id}` },
          image: featured.images[0],
        }
      : null

  const opsItems: LandlordOpsItem[] = useMemo(() => {
    const propItems: LandlordOpsItem[] = props.map((p) => ({
      kind: 'property',
      id: p.id,
      title: p.title,
      meta: `${p.suburb} · ${p.status}`,
      status: p.status,
      date: p.createdAt,
      propertyId: p.id,
      photos: p.images.length,
    }))
    const payItems: LandlordOpsItem[] = payments.slice(0, 12).map((p) => ({
      kind: 'payment',
      id: p.id,
      title: `${p.type} · ${p.partyName}`,
      meta: formatZAR(p.amount),
      status: p.status,
      date: (p.dueDate ?? p.paidAt ?? '2026-07-01').slice(0, 10),
      propertyId: p.propertyId,
    }))
    const ticketItems: LandlordOpsItem[] = openTickets.map((t) => ({
      kind: 'ticket',
      id: t.id,
      title: t.title,
      meta: t.assetLabel,
      status: t.status,
      date: t.openedAt,
      propertyId: t.propertyId,
      priority: t.priority,
    }))

    let list: LandlordOpsItem[] =
      tab === 'payments'
        ? payItems
        : tab === 'maintenance'
          ? ticketItems
          : [...propItems, ...payItems.slice(0, 4), ...ticketItems]

    if (listFilter === 'overdue') list = list.filter((i) => i.status === 'Overdue')
    else if (listFilter === 'open') list = list.filter((i) => i.kind === 'ticket')
    else if (listFilter === 'attention') {
      list = list.filter(
        (i) =>
          i.status === 'Overdue' ||
          (i.kind === 'ticket' && ['High', 'Urgent', 'Emergency'].includes(i.priority)),
      )
    }

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) => i.title.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q),
      )
    }
    return list
  }, [props, payments, openTickets, tab, query, listFilter])

  const sectionCounts = useMemo(() => {
    const overdue = payments.filter((p) => p.status === 'Overdue').length
    return {
      overview: props.length + overdue + openTickets.length,
      payments: payments.length,
      maintenance: openTickets.length,
    }
  }, [props.length, payments, openTickets.length])

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview', count: sectionCounts.overview },
      { id: 'payments', label: 'Payments', count: sectionCounts.payments },
      { id: 'maintenance', label: 'Maintenance', count: sectionCounts.maintenance },
    ],
    [sectionCounts],
  )

  const banner = useMemo(() => {
    switch (tab) {
      case 'overview':
        return openTickets.length > 0 || payments.some((p) => p.status === 'Overdue')
          ? {
              tone: 'warning' as const,
              text: `${openTickets.length} open issue${openTickets.length === 1 ? '' : 's'} · ${payments.filter((p) => p.status === 'Overdue').length} overdue payment${payments.filter((p) => p.status === 'Overdue').length === 1 ? '' : 's'}.`,
            }
          : null
      case 'payments':
        return {
          tone: 'info' as const,
          text: `${payments.length} payment${payments.length === 1 ? '' : 's'} visible on your owner ledger.`,
        }
      case 'maintenance':
        return openTickets.length > 0
          ? {
              tone: 'danger' as const,
              text: `${openTickets.length} open maintenance on your assets.`,
            }
          : null
      default:
        return null
    }
  }, [tab, openTickets.length, payments])

  const availableFilters = LANDLORD_FILTERS.filter((f) => !f.tabs || f.tabs.includes(tab))

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

  const openPreview = (item: LandlordOpsItem) => {
    setSelectedKey(listKey(item.kind, item.id))
    if (item.kind === 'ticket') {
      const ticket = tickets.find((t) => t.id === item.id)
      const prop = props.find((p) => p.id === item.propertyId)
      if (ticket) setPreview({ kind: 'ticket', ticket, property: prop })
    } else if (item.kind === 'property') {
      const prop = props.find((p) => p.id === item.id)
      if (prop) setPreview({ kind: 'property', property: prop })
    }
    setSelectedDay(parseDay(item.date, selectedDay))
    setCalendarOpen(true)
  }

  const calendarMarkers: CalendarMarker[] = useMemo(() => {
    const markers: CalendarMarker[] = []
    for (const p of payments) {
      const d = p.dueDate ?? p.paidAt
      if (d) markers.push({ date: d.slice(0, 10), tone: toMarkerTone(statusTone(p.status)) })
    }
    for (const t of openTickets) {
      markers.push({ date: t.openedAt, tone: toMarkerTone(priorityTone(t.priority)) })
    }
    return markers
  }, [payments, openTickets])

  const dayKey = dateKey(selectedDay)

  const calendarEvents: LandlordOpsItem[] = useMemo(() => {
    const events: LandlordOpsItem[] = []
    for (const p of payments) {
      const d = (p.dueDate ?? p.paidAt ?? '').slice(0, 10)
      if (!d) continue
      events.push({
        kind: 'payment',
        id: p.id,
        title: p.type,
        meta: `${p.partyName} · ${formatZAR(p.amount)}`,
        status: p.status,
        date: d,
        propertyId: p.propertyId,
      })
    }
    for (const t of openTickets) {
      events.push({
        kind: 'ticket',
        id: t.id,
        title: t.title,
        meta: t.assetLabel,
        status: t.status,
        date: t.openedAt,
        propertyId: t.propertyId,
        priority: t.priority,
      })
    }
    return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
  }, [payments, openTickets])

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
  const focusProperty = focusEvent?.propertyId
    ? props.find((p) => p.id === focusEvent.propertyId)
    : featured

  const listItems = opsItems.map(landlordToListItem)

  return (
    <DashboardPage>
      <DashboardBreadcrumb
        items={[
          { label: 'Dashboard', to: '/workspace' },
          { label: 'Owner overview' },
        ]}
      />

      {hero && (
        <AttentionHero
          {...hero}
          cta={{
            ...hero.cta,
            icon: <Home className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
          }}
        />
      )}

      <DashboardTabs
        tabs={tabs}
        value={tab}
        onChange={(id) => {
          setTab(id as LandlordTab)
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
              placeholder="Search assets, payments, issues…"
              filters={availableFilters}
              filterValue={listFilter}
              onFilterChange={(id) => setListFilter(id as LandlordFilter)}
              actions={
                <CreateMenu
                  items={[
                    { to: '/workspace/portals/owner', label: 'Owner portal' },
                    { to: '/workspace/operations/maintenance?create=1', label: 'Log maintenance' },
                  ]}
                />
              }
            />

            {listFilter !== 'all' && (
              <FilterClearHint
                label={LANDLORD_FILTERS.find((f) => f.id === listFilter)?.label ?? listFilter}
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
                empty="No owner activity yet."
                limit={5}
                showMoreTo="/workspace/portals/owner"
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
                  dayViewTo={`/workspace/portals/owner?date=${dayKey}`}
                  className="h-full rounded-none border-0 shadow-none"
                />
              </DashboardCalendarShell>
            </CalendarToggle>

            <OpsDetailPanel
              className="flex min-h-0 flex-1 flex-col"
              eyebrow={
                focusEvent
                  ? focusEvent.kind === 'payment'
                    ? 'Payment'
                    : focusEvent.kind === 'ticket'
                      ? 'Maintenance'
                      : 'Property'
                  : 'Day events'
              }
              title={focusEvent?.title ?? 'No events this day'}
              subtitle={
                focusProperty
                  ? `${focusProperty.suburb}, ${focusProperty.city}`
                  : focusEvent?.meta
              }
              action={
                focusProperty
                  ? { label: 'Open property', to: `/workspace/properties/${focusProperty.id}` }
                  : { label: 'Owner portal', to: '/workspace/portals/owner' }
              }
              status={focusEvent?.kind === 'ticket' ? focusEvent.priority : focusEvent?.status}
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
                      to: '/workspace/portals/owner',
                      label: `${props.length} assets`,
                      icon: <Home className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                    },
                    {
                      to: '/workspace/portals/owner',
                      label: `${payments.length} payments`,
                      icon: <Banknote className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                    },
                    {
                      to: '/workspace/operations/maintenance',
                      label: `${openTickets.length} issues`,
                      icon: <Wrench className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                      tone: 'accent',
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

/* ─── Tenant ──────────────────────────────────────────────────────────────── */

type TenantTab = 'overview' | 'payments' | 'applications'
type TenantFilter = 'all' | 'due' | 'apps' | 'overdue'

type TenantOpsItem =
  | {
      kind: 'payment'
      id: string
      title: string
      meta: string
      status: string
      date: string
    }
  | {
      kind: 'application'
      id: string
      title: string
      meta: string
      status: string
      date: string
      propertyId: string
      progress: number
    }
  | {
      kind: 'ticket'
      id: string
      title: string
      meta: string
      status: string
      date: string
      priority: string
    }

const TENANT_FILTERS: { id: TenantFilter; label: string; tabs?: TenantTab[] }[] = [
  { id: 'all', label: 'All items' },
  { id: 'due', label: 'Payments due', tabs: ['overview', 'payments'] },
  { id: 'overdue', label: 'Overdue', tabs: ['overview', 'payments'] },
  { id: 'apps', label: 'Applications', tabs: ['overview', 'applications'] },
]

function tenantToListItem(item: TenantOpsItem): OpsListItemData {
  return {
    id: listKey(item.kind, item.id),
    title: item.title,
    meta: item.meta,
    date: item.date,
    badge: item.kind === 'ticket' ? item.priority : item.status,
    badgeTone:
      item.kind === 'ticket' ? priorityTone(item.priority) : statusTone(item.status),
  }
}

export function TenantDashboard() {
  const { state, markPaymentPaid } = useStore()
  const { user } = useAuth()
  const blockedIds = useMemo(
    () => blockedPropertyIdsForApplicant(state.applications, user),
    [state.applications, user],
  )
  const apps = state.applications.filter(
    (a) =>
      (a.applicantUserId === user.id || a.email === user.email) &&
      a.stage !== 'Blocked' &&
      !blockedIds.has(a.propertyId),
  )
  const payments = state.payments.filter(
    (p) =>
      (p.partyUserId === user.id || p.partyName === user.name) &&
      !blockedIds.has(p.propertyId),
  )
  const tickets = state.tickets.filter(
    (t) => t.reportedByUserId === user.id && !blockedIds.has(t.propertyId),
  )
  const due = payments.filter((p) => p.status === 'Due' || p.status === 'Overdue')

  const [tab, setTab] = useState<TenantTab>('overview')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<TenantFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => new Date(2026, 6, 23))
  const [calendarOpen, setCalendarOpen] = useState(true)

  const focusApp = apps[0]
  const focusProp = focusApp
    ? state.properties.find((p) => p.id === focusApp.propertyId)
    : state.properties.find((p) => !blockedIds.has(p.id))

  const hero = due[0]
    ? {
        eyebrow: 'Payment due',
        title: `${due[0].type} · ${formatZAR(due[0].amount)}`,
        detail: 'Pay the agency — never the landlord directly',
        badge: due[0].status,
        badgeTone: 'danger' as const,
        secondaryBadge: due[0].method ?? 'EFT',
        stats: [
          { label: 'Applications', value: String(apps.length) },
          { label: 'Due', value: String(due.length) },
          { label: 'Maintenance', value: String(tickets.length) },
        ],
        cta: { label: 'Tenant portal', to: '/workspace/portals/tenant' },
        secondaryCta: { label: 'Browse homes', to: '/browse' },
        propertyLink: focusProp
          ? { to: `/workspace/properties/${focusProp.id}`, label: 'Your listing' }
          : { to: '/browse', label: 'Browse' },
        image: focusProp?.images[0],
      }
    : focusApp
      ? {
          eyebrow: 'Your application',
          title: focusProp?.title ?? focusApp.applicantName,
          detail: `${focusApp.stage} · ${focusApp.progress}% complete`,
          badge: focusApp.stage,
          badgeTone: 'warning' as const,
          secondaryBadge: focusApp.type,
          stats: [
            { label: 'Progress', value: `${focusApp.progress}%` },
            { label: 'Payments due', value: String(due.length) },
            { label: 'Maintenance', value: String(tickets.length) },
          ],
          cta: { label: 'Continue application', to: '/workspace/portals/tenant' },
          secondaryCta: { label: 'Browse homes', to: '/browse' },
          propertyLink: focusProp
            ? { to: `/workspace/properties/${focusProp.id}` }
            : { to: '/browse', label: 'Browse' },
          image: focusProp?.images[0],
        }
      : {
          eyebrow: `Hi, ${user.name.split(' ')[0]}`,
          title: 'Find your next home',
          detail: 'Apply, pay, and report maintenance through the agency.',
          badge: 'Tenant',
          badgeTone: 'brand' as const,
          stats: [
            { label: 'Applications', value: '0' },
            { label: 'Due', value: '0' },
            { label: 'Maintenance', value: String(tickets.length) },
          ],
          cta: { label: 'Browse homes', to: '/browse' },
          secondaryCta: { label: 'Tenant portal', to: '/workspace/portals/tenant' },
          propertyLink: { to: '/browse', label: 'Browse' },
          image: state.properties[0]?.images[0],
        }

  const opsItems: TenantOpsItem[] = useMemo(() => {
    const appItems: TenantOpsItem[] = apps.map((a) => {
      const prop = state.properties.find((p) => p.id === a.propertyId)
      return {
        kind: 'application',
        id: a.id,
        title: prop?.title ?? a.applicantName,
        meta: `${a.stage} · ${a.progress}%`,
        status: a.stage,
        date: a.updatedAt.slice(0, 10),
        propertyId: a.propertyId,
        progress: a.progress,
      }
    })
    const dueItems: TenantOpsItem[] = due.map((p) => ({
      kind: 'payment',
      id: p.id,
      title: p.type,
      meta: formatZAR(p.amount),
      status: p.status,
      date: (p.dueDate ?? '2026-07-23').slice(0, 10),
    }))
    const ticketItems: TenantOpsItem[] = tickets.map((t) => ({
      kind: 'ticket',
      id: t.id,
      title: t.title,
      meta: t.status,
      status: t.status,
      date: t.openedAt,
      priority: t.priority,
    }))

    let list: TenantOpsItem[] =
      tab === 'payments'
        ? dueItems
        : tab === 'applications'
          ? appItems
          : [...dueItems, ...appItems, ...ticketItems.slice(0, 2)]

    if (listFilter === 'due') list = list.filter((i) => i.kind === 'payment')
    else if (listFilter === 'overdue') list = list.filter((i) => i.status === 'Overdue')
    else if (listFilter === 'apps') list = list.filter((i) => i.kind === 'application')

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) => i.title.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q),
      )
    }
    return list
  }, [apps, due, tickets, tab, query, listFilter, state.properties])

  const sectionCounts = useMemo(
    () => ({
      overview: due.length + apps.length,
      payments: due.length,
      applications: apps.length,
    }),
    [due.length, apps.length],
  )

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview', count: sectionCounts.overview },
      { id: 'payments', label: 'Payments', count: sectionCounts.payments },
      { id: 'applications', label: 'Applications', count: sectionCounts.applications },
    ],
    [sectionCounts],
  )

  const banner = useMemo(() => {
    switch (tab) {
      case 'overview':
        return due.length > 0
          ? {
              tone: 'danger' as const,
              text: `${due.length} payment${due.length === 1 ? '' : 's'} due — pay via the agency portal.`,
            }
          : apps.length > 0
            ? {
                tone: 'warning' as const,
                text: `${apps.length} application${apps.length === 1 ? '' : 's'} in progress.`,
              }
            : null
      case 'payments':
        return due.length > 0
          ? {
              tone: 'warning' as const,
              text: `${due.length} outstanding payment${due.length === 1 ? '' : 's'}.`,
            }
          : null
      case 'applications':
        return apps.length > 0
          ? {
              tone: 'info' as const,
              text: `${apps.length} application${apps.length === 1 ? '' : 's'} on file.`,
            }
          : null
      default:
        return null
    }
  }, [tab, due.length, apps.length])

  const availableFilters = TENANT_FILTERS.filter((f) => !f.tabs || f.tabs.includes(tab))

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

  const openPreview = (item: TenantOpsItem) => {
    setSelectedKey(listKey(item.kind, item.id))
    if (item.kind === 'application') {
      const application = apps.find((a) => a.id === item.id)
      const prop = state.properties.find((p) => p.id === item.propertyId)
      if (application) setPreview({ kind: 'application', application, property: prop })
    } else if (item.kind === 'ticket') {
      const ticket = tickets.find((t) => t.id === item.id)
      if (ticket) setPreview({ kind: 'ticket', ticket })
    }
    setSelectedDay(parseDay(item.date, selectedDay))
    setCalendarOpen(true)
  }

  const calendarMarkers: CalendarMarker[] = useMemo(() => {
    const markers: CalendarMarker[] = []
    for (const p of due) {
      if (p.dueDate) markers.push({ date: p.dueDate.slice(0, 10), tone: toMarkerTone(statusTone(p.status)) })
    }
    for (const t of tickets) {
      markers.push({ date: t.openedAt, tone: toMarkerTone(priorityTone(t.priority)) })
    }
    return markers
  }, [due, tickets])

  const dayKey = dateKey(selectedDay)

  const calendarEvents: TenantOpsItem[] = useMemo(() => {
    const events: TenantOpsItem[] = []
    for (const p of due) {
      const d = (p.dueDate ?? '').slice(0, 10)
      if (!d) continue
      events.push({
        kind: 'payment',
        id: p.id,
        title: p.type,
        meta: formatZAR(p.amount),
        status: p.status,
        date: d,
      })
    }
    for (const t of tickets) {
      events.push({
        kind: 'ticket',
        id: t.id,
        title: t.title,
        meta: t.status,
        status: t.status,
        date: t.openedAt,
        priority: t.priority,
      })
    }
    return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
  }, [due, tickets])

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
  const focusPayment =
    focusEvent?.kind === 'payment' ? due.find((p) => p.id === focusEvent.id) : undefined

  const listItems = opsItems.map(tenantToListItem)

  return (
    <DashboardPage>
      <DashboardBreadcrumb
        items={[
          { label: 'Dashboard', to: '/workspace' },
          { label: 'Tenant home' },
        ]}
      />

      <AttentionHero
        {...hero}
        cta={{
          ...hero.cta,
          icon: <FileCheck2 className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
        }}
      />

      <DashboardTabs
        tabs={tabs}
        value={tab}
        onChange={(id) => {
          setTab(id as TenantTab)
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
              placeholder="Search applications, payments…"
              filters={availableFilters}
              filterValue={listFilter}
              onFilterChange={(id) => setListFilter(id as TenantFilter)}
              actions={
                <CreateMenu
                  items={[
                    { to: '/browse', label: 'Browse homes' },
                    { to: '/workspace/portals/tenant', label: 'Tenant portal' },
                  ]}
                />
              }
            />

            {listFilter !== 'all' && (
              <FilterClearHint
                label={TENANT_FILTERS.find((f) => f.id === listFilter)?.label ?? listFilter}
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
                empty="Nothing here yet — browse and apply."
                limit={5}
                showMoreTo={
                  tab === 'applications' ? '/browse' : '/workspace/portals/tenant'
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
                  dayViewTo={`/workspace/portals/tenant?date=${dayKey}`}
                  className="h-full rounded-none border-0 shadow-none"
                />
              </DashboardCalendarShell>
            </CalendarToggle>

            <OpsDetailPanel
              className="flex min-h-0 flex-1 flex-col"
              eyebrow={
                focusEvent
                  ? focusEvent.kind === 'payment'
                    ? 'Payment'
                    : focusEvent.kind === 'application'
                      ? 'Application'
                      : 'Maintenance'
                  : 'Day events'
              }
              title={focusEvent?.title ?? 'No events this day'}
              subtitle={focusEvent?.meta}
              action={{ label: 'Tenant portal', to: '/workspace/portals/tenant' }}
              status={focusEvent?.kind === 'ticket' ? focusEvent.priority : focusEvent?.status}
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
                      to: '/workspace/portals/tenant',
                      label: `${apps.length} applications`,
                      icon: <ClipboardList className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                    },
                    {
                      to: '/workspace/portals/tenant',
                      label: `${due.length} due`,
                      icon: <CreditCard className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                      tone: 'accent',
                    },
                  ]}
                />
              }
            >
              {focusPayment && (
                <div className="mt-4">
                  <Button size="sm" onClick={() => markPaymentPaid(focusPayment.id, 'EFT')}>
                    Mark paid
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

/* ─── Contractor ──────────────────────────────────────────────────────────── */

type ContractorTab = 'overview' | 'assigned' | 'pool'
type ContractorFilter = 'all' | 'urgent' | 'mine'

type ContractorOpsItem = {
  kind: 'ticket'
  id: string
  title: string
  meta: string
  status: string
  date: string
  propertyId: string
  priority: string
  photos: number
  pool: boolean
}

const CONTRACTOR_FILTERS: { id: ContractorFilter; label: string; tabs?: ContractorTab[] }[] = [
  { id: 'all', label: 'All jobs' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'mine', label: 'Assigned to me', tabs: ['overview', 'assigned'] },
]

function contractorToListItem(item: ContractorOpsItem): OpsListItemData {
  return {
    id: listKey(item.kind, item.id),
    title: item.title,
    meta: item.meta,
    date: item.date,
    badge: item.priority,
    badgeTone: priorityTone(item.priority),
    photos: item.photos,
  }
}

export function ContractorDashboard() {
  const { state, updateTicket } = useStore()
  const { user } = useAuth()
  const mine = state.tickets.filter((t) => t.contractorId === user.id || t.contractorId === null)
  const assigned = mine.filter((t) => t.contractorId === user.id)
  const openPool = mine.filter(
    (t) => !t.contractorId && t.status !== 'Completed' && t.status !== 'Cancelled',
  )
  const openAssigned = assigned.filter((t) => t.status !== 'Completed')

  const [tab, setTab] = useState<ContractorTab>('overview')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<ContractorFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => new Date(2026, 6, 23))
  const [calendarOpen, setCalendarOpen] = useState(true)

  const focus = openAssigned[0] ?? openPool[0]
  const focusProp = focus
    ? state.properties.find((p) => p.id === focus.propertyId)
    : state.properties[0]

  const hero = focus
    ? {
        eyebrow: openAssigned[0] ? 'Your next job' : 'Available job',
        title: focus.title,
        detail: `${focus.assetLabel} · ${focus.priority}`,
        badge: focus.priority,
        badgeTone: priorityTone(focus.priority),
        secondaryBadge: focus.status,
        stats: [
          { label: 'Assigned', value: String(openAssigned.length) },
          { label: 'Pool', value: String(openPool.length) },
          { label: 'Cost', value: focus.cost > 0 ? formatZAR(focus.cost) : 'TBD' },
        ],
        cta: { label: 'Full job board', to: '/workspace/portals/contractor' },
        secondaryCta: focusProp
          ? { label: 'Property', to: `/workspace/properties/${focusProp.id}` }
          : undefined,
        propertyLink: focusProp
          ? { to: `/workspace/properties/${focusProp.id}`, label: 'Site' }
          : { to: '/workspace/portals/contractor', label: 'Job board' },
        image: focusProp?.images[0],
      }
    : {
        eyebrow: 'Contractor desk',
        title: 'No open jobs',
        detail: 'Claim work from the pool when agencies post maintenance.',
        badge: 'Idle',
        badgeTone: 'neutral' as const,
        stats: [
          { label: 'Assigned', value: '0' },
          { label: 'Pool', value: String(openPool.length) },
          {
            label: 'Done',
            value: String(assigned.filter((t) => t.status === 'Completed').length),
          },
        ],
        cta: { label: 'Job board', to: '/workspace/portals/contractor' },
        propertyLink: { to: '/workspace/portals/contractor', label: 'Job board' },
        image: state.properties[0]?.images[0],
      }

  const opsItems: ContractorOpsItem[] = useMemo(() => {
    const assignedItems: ContractorOpsItem[] = openAssigned.map((t) => ({
      kind: 'ticket',
      id: t.id,
      title: t.title,
      meta: t.assetLabel,
      status: t.status,
      date: t.openedAt,
      propertyId: t.propertyId,
      priority: t.priority,
      photos: t.photos,
      pool: false,
    }))
    const poolItems: ContractorOpsItem[] = openPool.map((t) => ({
      kind: 'ticket',
      id: t.id,
      title: t.title,
      meta: `${t.assetLabel} · claimable`,
      status: t.status,
      date: t.openedAt,
      propertyId: t.propertyId,
      priority: t.priority,
      photos: t.photos,
      pool: true,
    }))

    let list: ContractorOpsItem[] =
      tab === 'assigned'
        ? assignedItems
        : tab === 'pool'
          ? poolItems
          : [...assignedItems, ...poolItems]

    if (listFilter === 'urgent') {
      list = list.filter((i) => ['Urgent', 'Emergency', 'High'].includes(i.priority))
    } else if (listFilter === 'mine') {
      list = list.filter((i) => !i.pool)
    }

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) => i.title.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q),
      )
    }
    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [openAssigned, openPool, tab, query, listFilter])

  const sectionCounts = useMemo(
    () => ({
      overview: openAssigned.length + openPool.length,
      assigned: openAssigned.length,
      pool: openPool.length,
    }),
    [openAssigned.length, openPool.length],
  )

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview', count: sectionCounts.overview },
      { id: 'assigned', label: 'Assigned', count: sectionCounts.assigned },
      { id: 'pool', label: 'Pool', count: sectionCounts.pool },
    ],
    [sectionCounts],
  )

  const banner = useMemo(() => {
    switch (tab) {
      case 'overview':
        return sectionCounts.overview > 0
          ? {
              tone: 'warning' as const,
              text: `${openAssigned.length} assigned · ${openPool.length} available in the pool.`,
            }
          : null
      case 'assigned':
        return openAssigned.length > 0
          ? {
              tone: 'info' as const,
              text: `${openAssigned.length} job${openAssigned.length === 1 ? '' : 's'} assigned to you.`,
            }
          : null
      case 'pool':
        return openPool.length > 0
          ? {
              tone: 'warning' as const,
              text: `${openPool.length} claimable job${openPool.length === 1 ? '' : 's'} in the pool.`,
            }
          : null
      default:
        return null
    }
  }, [tab, sectionCounts.overview, openAssigned.length, openPool.length])

  const availableFilters = CONTRACTOR_FILTERS.filter((f) => !f.tabs || f.tabs.includes(tab))

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

  const openPreview = (item: ContractorOpsItem) => {
    setSelectedKey(listKey(item.kind, item.id))
    const ticket = mine.find((t) => t.id === item.id)
    const prop = state.properties.find((p) => p.id === item.propertyId)
    if (ticket) setPreview({ kind: 'ticket', ticket, property: prop })
    setSelectedDay(parseDay(item.date, selectedDay))
    setCalendarOpen(true)
  }

  const calendarMarkers: CalendarMarker[] = useMemo(
    () =>
      [...openAssigned, ...openPool].map((t) => ({
        date: t.openedAt,
        tone: toMarkerTone(priorityTone(t.priority)),
      })),
    [openAssigned, openPool],
  )

  const dayKey = dateKey(selectedDay)

  const calendarEvents: ContractorOpsItem[] = useMemo(() => {
    return [...openAssigned, ...openPool]
      .map((t) => ({
        kind: 'ticket' as const,
        id: t.id,
        title: t.title,
        meta: `${t.priority} · ${t.assetLabel}`,
        status: t.status,
        date: t.openedAt,
        propertyId: t.propertyId,
        priority: t.priority,
        photos: t.photos,
        pool: !t.contractorId,
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
  }, [openAssigned, openPool])

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
  const focusTicket = focusEvent ? mine.find((t) => t.id === focusEvent.id) : undefined
  const focusProperty = focusTicket
    ? state.properties.find((p) => p.id === focusTicket.propertyId)
    : focusProp

  const listItems = opsItems.map(contractorToListItem)

  return (
    <DashboardPage>
      <DashboardBreadcrumb
        items={[
          { label: 'Dashboard', to: '/workspace' },
          { label: 'Contractor jobs' },
        ]}
      />

      <AttentionHero
        {...hero}
        cta={{
          ...hero.cta,
          icon: <HardHat className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
        }}
      />

      <DashboardTabs
        tabs={tabs}
        value={tab}
        onChange={(id) => {
          setTab(id as ContractorTab)
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
              placeholder="Search jobs…"
              filters={availableFilters}
              filterValue={listFilter}
              onFilterChange={(id) => setListFilter(id as ContractorFilter)}
              actions={
                <CreateMenu
                  items={[{ to: '/workspace/portals/contractor', label: 'Full job board' }]}
                />
              }
            />

            {listFilter !== 'all' && (
              <FilterClearHint
                label={
                  CONTRACTOR_FILTERS.find((f) => f.id === listFilter)?.label ?? listFilter
                }
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
                empty="No jobs in this queue."
                limit={5}
                showMoreTo="/workspace/portals/contractor"
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
                  dayViewTo={`/workspace/portals/contractor?date=${dayKey}`}
                  className="h-full rounded-none border-0 shadow-none"
                />
              </DashboardCalendarShell>
            </CalendarToggle>

            <OpsDetailPanel
              className="flex min-h-0 flex-1 flex-col"
              eyebrow={focusEvent ? (focusEvent.pool ? 'Pool job' : 'Assigned job') : 'Day events'}
              title={focusEvent?.title ?? 'No events this day'}
              subtitle={
                focusProperty
                  ? `${focusProperty.address} · ${focusProperty.suburb}`
                  : focusEvent?.meta
              }
              action={
                focusProperty
                  ? { label: 'Open property', to: `/workspace/properties/${focusProperty.id}` }
                  : { label: 'Job board', to: '/workspace/portals/contractor' }
              }
              requestBy={focusTicket?.reportedBy}
              status={focusTicket?.status ?? focusEvent?.status}
              statusTone={
                focusTicket
                  ? statusTone(focusTicket.status)
                  : focusEvent
                    ? priorityTone(focusEvent.priority)
                    : undefined
              }
              chips={
                <QuickLinkChips
                  items={[
                    {
                      to: '/workspace/portals/contractor',
                      label: `${openAssigned.length} assigned`,
                      icon: <HardHat className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                    },
                    {
                      to: '/workspace/portals/contractor',
                      label: `${openPool.length} in pool`,
                      icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                      tone: 'accent',
                    },
                  ]}
                />
              }
            >
              {focusTicket && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {focusTicket.contractorId === user.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => updateTicket(focusTicket.id, { status: 'In Progress' })}
                      >
                        Start
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateTicket(focusTicket.id, { status: 'Completed' })}
                      >
                        Complete
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateTicket(focusTicket.id, {
                          contractorId: user.id,
                          status: 'In Progress',
                        })
                      }
                    >
                      Claim job
                    </Button>
                  )}
                  {focusTicket.priority && (
                    <Badge tone={priorityTone(focusTicket.priority)}>{focusTicket.priority}</Badge>
                  )}
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

/* ─── Role switcher ───────────────────────────────────────────────────────── */

export function RoleHomeDashboard() {
  const { role } = useAuth()
  return useMemo(() => {
    switch (role) {
      case 'super_admin':
        return <SuperAdminDashboard />
      case 'client_admin':
      case 'agent_admin':
        return <AgencyDashboard />
      case 'ground_agent':
      case 'agent':
        return <GroundAgentDashboard />
      case 'landlord':
        return <LandlordDashboard />
      case 'tenant':
        return <TenantDashboard />
      case 'contractor':
        return <ContractorDashboard />
      default:
        return <AgencyDashboard />
    }
  }, [role])
}
