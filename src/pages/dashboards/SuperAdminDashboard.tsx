import { useMemo, useState } from 'react'
import { Building2, CreditCard } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { Button, statusTone } from '../../components/ui'
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
  toMarkerTone,
  useEventCycle,
  type CalendarMarker,
  type OpsListItemData,
} from '../../components/dashboard'
import { formatZAR } from '../../data/seed'

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
        detail: `${state.agencies.find((a) => a.id === unpaid[0].clientId)?.name ?? 'Agency'} · unpaid SaaS invoice`,
        badge: 'UNPAID',
        badgeTone: 'danger' as const,
        secondaryBadge: 'Super Admin',
        stats: [
          { label: 'Agencies', value: String(state.agencies.length) },
          { label: 'Unpaid', value: String(unpaid.length) },
          { label: 'Buildings', value: String(state.buildings.length) },
        ],
        cta: { label: 'Collect invoice', to: '/workspace/platform/billing' },
        secondaryCta: { label: 'Agency control', to: '/workspace/admin/agencies' },
        propertyLink: { to: '/workspace/admin/agencies', label: 'Control plane' },
        image: heroProperty?.images[0],
      }
    : {
        eyebrow: 'Platform control plane',
        title: emergencies.length
          ? `${emergencies.length} emergency${emergencies.length === 1 ? '' : 'ies'} across tenants`
          : `${state.agencies.length} agencies live`,
        detail: emergencies.length
          ? 'Triage cross-tenant emergencies, then confirm SaaS billing health.'
          : 'Subscriptions and footprint billing look healthy — manage agencies or run a billing cycle.',
        badge: emergencies.length ? 'Attention' : 'Healthy',
        badgeTone: emergencies.length ? ('danger' as const) : ('success' as const),
        secondaryBadge: 'Super Admin',
        stats: [
          { label: 'Agencies', value: String(state.agencies.length) },
          { label: 'Units', value: String(state.units.length) },
          { label: 'Invoices', value: String(state.invoices.length) },
        ],
        cta: emergencies.length
          ? { label: 'Open emergencies', to: '/workspace/operations/maintenance' }
          : { label: 'Manage agencies', to: '/workspace/admin/agencies' },
        secondaryCta: { label: 'SaaS billing', to: '/workspace/platform/billing' },
        propertyLink: { to: '/workspace/platform/billing', label: 'Billing ledger' },
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
              text: `${unpaid.length} unpaid SaaS invoice${unpaid.length === 1 ? '' : 's'} need collection before the next cycle.`,
            }
          : emergencies.length > 0
            ? {
                tone: 'danger' as const,
                text: `${emergencies.length} emergency ticket${emergencies.length === 1 ? '' : 's'} open across the platform.`,
              }
            : {
                tone: 'info' as const,
                text: 'Control plane is quiet — audit agencies or run a billing cycle when ready.',
              }
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
  }, [
    tab,
    unpaid.length,
    emergencies.length,
    state.invoices.length,
    state.agencies.length,
    state.clientSubscriptions.length,
  ])

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
                      { to: '/workspace/admin/agencies/new', label: 'Onboard agency' },
                      { to: '/workspace/admin/agencies', label: 'Manage agencies' },
                      { to: '/workspace/platform/billing', label: 'Open billing' },
                      { to: '/workspace/admin/users/new', label: 'Create platform user' },
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
                      to: '/workspace/admin/agencies',
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

