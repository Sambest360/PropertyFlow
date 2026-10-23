import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  FileCheck2,
  FileText,
  Heart,
  KeyRound,
  MessageCircle,
  Wrench,
} from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { usePublicProperties, useStore } from '../context/AppStore'
import { useAuth } from '../context/AuthContext'
import { startPayfastCheckout } from '../lib/payfast/checkout'
import { RequirePermission } from '../components/RequirePermission'
import {
  AttentionHero,
  DashboardBreadcrumb,
  DashboardPage,
  SectionBanner,
} from '../components/dashboard'
import { Badge, Button, Card, statusTone } from '../components/ui'
import { WishlistListView } from '../components/wishlist/WishlistListView'
import { formatZAR } from '../data/seed'
import { ACCOUNT_WISHLIST_PATH } from '../lib/accountRoutes'
import { defaultWorkspacePath } from '../lib/workspaceRoutes'
import { useTenantPortalState } from '../hooks/useTenantPortalState'
import { useWishlist } from '../hooks/useWishlist'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import type { Application, PropertyAsset } from '../types/domain'
import { TenantComplaintsView } from './tenant/TenantComplaintsView'
import { TenantViewingsView } from './tenant/TenantViewingsView'
import { TenantMaintenanceView } from './tenant/TenantMaintenanceView'
import { TenantMessagesView } from './tenant/TenantMessagesView'
import { PortalHydrationGate } from '../components/PortalHydrationGate'
import { OccupiedHomeAdvertCard } from '../components/tenant/OccupiedHomeAdvertCard'

type TenantView =
  | 'home'
  | 'applications'
  | 'maintenance'
  | 'messages'
  | 'complaints'
  | 'viewings'
  | 'leases'
  | 'payments'

function resolveTenantView(pathname: string): TenantView {
  if (pathname.includes('/applications')) return 'applications'
  if (pathname.includes('/maintenance')) return 'maintenance'
  if (pathname.includes('/messages')) return 'messages'
  if (pathname.includes('/complaints')) return 'complaints'
  if (pathname.includes('/viewings')) return 'viewings'
  if (pathname.includes('/leases')) return 'leases'
  if (pathname.includes('/payments')) return 'payments'
  return 'home'
}

export default function TenantPortal() {
  return (
    <PortalHydrationGate>
      <TenantPortalContent />
    </PortalHydrationGate>
  )
}

function TenantPortalContent() {
  const { state, setDocumentStatus, hydratedForUserId } = useStore()
  const publicProperties = usePublicProperties()
  const { user, has, authReady } = useAuth()
  const dashboardPending =
    authReady && user.id !== 'guest' && hydratedForUserId !== user.id
  const location = useLocation()
  const view = resolveTenantView(location.pathname)
  const portal = useTenantPortalState()
  const { ids: wishlistIds } = useWishlist(user.id)
  const [payBusyId, setPayBusyId] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  /** Portal Pay button: launches PayFast checkout; ledger settles via ITN. */
  const handlePortalPay = async (id: string) => {
    if (payBusyId) return
    setPayBusyId(id)
    setPayError(null)
    const result = await startPayfastCheckout(id, {
      itemName: `Lekaya · ${state.payments.find((p) => p.id === id)?.type ?? 'Payment'}`,
    })
    if (!result.ok) {
      setPayBusyId(null)
      setPayError(result.userMessage ?? 'Checkout could not be started.')
    }
    // On success the browser navigates to PayFast's hosted page.
  }

  const wishlistProperties = useMemo(
    () =>
      publicProperties.filter((p) => wishlistIds.includes(p.id) && !portal.blockedIds.has(p.id)),
    [publicProperties, wishlistIds, portal.blockedIds],
  )

  const duePayments = portal.payments.filter((p) => p.status === 'Due' || p.status === 'Overdue')
  const openMaintenance = portal.tickets.filter(
    (t) => t.status !== 'Completed' && !t.title.startsWith('Complaint:'),
  ).length
  const openComplaints = portal.tickets.filter(
    (t) => t.status !== 'Completed' && t.title.startsWith('Complaint:'),
  ).length

  const breadcrumbLabel =
    view === 'applications'
      ? 'My applications'
      : view === 'maintenance'
        ? 'Maintenance'
        : view === 'messages'
          ? 'Messages'
          : view === 'complaints'
            ? 'Complaints'
            : view === 'viewings'
              ? 'Viewings'
              : view === 'leases'
                ? 'My lease'
                : view === 'payments'
                  ? 'Payments'
                  : portal.occupancyReady
                    ? 'Tenant portal'
                    : 'Applicant home'

  if (user.role === 'super_admin') {
    return <Navigate to={defaultWorkspacePath('super_admin')} replace />
  }

  return (
    <RequirePermission permission="portal.tenant">
      <DashboardPage>
        <DashboardBreadcrumb
          items={[
            { label: 'Dashboard', to: '/workspace/portals/tenant' },
            ...(view !== 'home' ? [{ label: breadcrumbLabel }] : []),
          ]}
        />

        {view === 'maintenance' ? (
          <TenantMaintenanceView portal={portal} />
        ) : view === 'messages' ? (
          <TenantMessagesView portal={portal} />
        ) : view === 'complaints' ? (
          <TenantComplaintsView portal={portal} />
        ) : view === 'viewings' ? (
          <TenantViewingsView portal={portal} />
        ) : view === 'leases' ? (
          <div data-tip-target="tenant-leases" className="space-y-5">
            {portal.tenancy ? (
              <LinkedTenancyCard tenancy={portal.tenancy} />
            ) : (
              <Card className="p-5" data-testid="tenant-lease-empty">
                <h2 className="font-display text-lg font-semibold text-ink">My lease</h2>
                <p className="mt-2 text-sm text-ink-500">
                  Lease details appear here once your application is approved and you have an active tenancy.
                </p>
                {portal.apps.length > 0 ? (
                  <Link
                    to="/workspace/portals/tenant/applications"
                    className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-primary-200 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-50"
                  >
                    View applications
                  </Link>
                ) : (
                  <Link
                    to="/browse"
                    className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-primary-200 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-50"
                  >
                    Browse homes
                  </Link>
                )}
              </Card>
            )}
          </div>
        ) : view === 'payments' ? (
          <div data-tip-target="tenant-payments" className="space-y-5">
            {payError && (
              <p
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {payError}
              </p>
            )}
            <PaymentsPanel
              payments={portal.payments}
              onPay={handlePortalPay}
              canPay={has('payments.manage')}
              payBusyId={payBusyId}
              expanded
            />
          </div>
        ) : (
          <>
            {payError && (
              <p
                className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {payError}
              </p>
            )}
            {view === 'home' && (
              <>
                {portal.occupancyReady && portal.tenancy && portal.property?.advertiseWhileOccupied && (
                  <OccupiedHomeAdvertCard
                    tenancy={portal.tenancy}
                    property={portal.property}
                  />
                )}
                <div data-tip-target="tenant-hero">
                <AttentionHero
                  image={portal.property?.images[0] ?? wishlistProperties[0]?.images[0]}
                  eyebrow={portal.occupancyReady ? 'Tenant portal' : 'Applicant home'}
                  title={
                    portal.occupancyReady
                      ? (portal.property?.title ?? `Welcome, ${user.name.split(' ')[0]}`)
                      : `Hi ${user.name.split(' ')[0]}`
                  }
                  detail={
                    portal.occupancyReady
                      ? 'Pay deposits, report maintenance, message your agency, and lodge complaints — never the landlord.'
                      : 'Track every place you’ve applied for, and keep a wishlist of homes you want to revisit. Tenant tools unlock once you’re approved.'
                  }
                  badge={
                    portal.tenancy?.status ?? portal.app?.stage ?? 'Applicant'
                  }
                  badgeTone={portal.occupancyReady ? 'brand' : 'warning'}
                  secondaryBadge={
                    portal.tenancy ? portal.tenancy.id : portal.app?.type
                  }
                  stats={
                    portal.occupancyReady
                      ? [
                          {
                            label: 'Applications',
                            value: dashboardPending ? '…' : String(portal.apps.length),
                          },
                          { label: 'Due', value: String(duePayments.length) },
                          { label: 'Open tickets', value: String(openMaintenance) },
                        ]
                      : [
                          {
                            label: 'Applications',
                            value: dashboardPending ? '…' : String(portal.apps.length),
                          },
                          {
                            label: 'Wishlist',
                            value:
                              dashboardPending && wishlistIds.length > 0 && wishlistProperties.length === 0
                                ? '…'
                                : String(wishlistIds.length),
                          },
                          { label: 'Approved', value: portal.occupancyReady ? 'Yes' : 'Not yet' },
                        ]
                  }
                  cta={{
                    label: portal.apps.length ? 'View applications' : 'Browse homes',
                    to: portal.apps.length
                      ? '/workspace/portals/tenant/applications'
                      : '/browse',
                    icon: <FileCheck2 className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
                  }}
                  secondaryCta={{ label: 'Wishlist', to: ACCOUNT_WISHLIST_PATH }}
                  propertyLink={
                    portal.property
                      ? { to: `/listing/${portal.property.id}`, label: 'Your listing' }
                      : { to: '/browse', label: 'Browse' }
                  }
                />
                </div>

                {portal.occupancyReady && duePayments.length > 0 && (
                  <SectionBanner
                    tone="danger"
                    text={`You have ${duePayments.length} payment${duePayments.length === 1 ? '' : 's'} due — pay the agency only.`}
                  />
                )}

                {portal.tenancy ? <LinkedTenancyCard tenancy={portal.tenancy} /> : null}

                {portal.occupancyReady ? (
                  <OccupancyQuickLinks
                    openMaintenance={openMaintenance}
                    openComplaints={openComplaints}
                    unread={portal.notes.filter((n) => !n.read).length}
                    threadCount={portal.threads.length}
                  />
                ) : (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <ApplicationsPanel
                      apps={portal.apps}
                      properties={state.properties}
                      onUpload={(appId, key) => setDocumentStatus(appId, key, 'uploaded')}
                    />
                    <WishlistPanel properties={wishlistProperties} emptyTo="/browse" />
                  </div>
                )}

                {portal.occupancyReady && (
                  <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <ApplicationsPanel
                      apps={portal.apps}
                      properties={state.properties}
                      onUpload={(appId, key) => setDocumentStatus(appId, key, 'uploaded')}
                    />
                    <PaymentsPanel
                      payments={portal.payments}
                      onPay={handlePortalPay}
                      canPay={has('payments.manage')}
                      payBusyId={payBusyId}
                    />
                  </div>
                )}
              </>
            )}

            {view === 'applications' && (
              <div data-tip-target="tenant-applications">
              <ApplicationsPanel
                apps={portal.apps}
                properties={state.properties}
                onUpload={(appId, key) => setDocumentStatus(appId, key, 'uploaded')}
                expanded
              />
              </div>
            )}
          </>
        )}
      </DashboardPage>
    </RequirePermission>
  )
}

function LinkedTenancyCard({
  tenancy,
}: {
  tenancy: NonNullable<ReturnType<typeof useTenantPortalState>['tenancy']>
}) {
  const hasKeys = Boolean(
    tenancy.keyCollection?.location?.trim() ||
      tenancy.keyCollection?.instructions?.trim(),
  )
  const keys = hasKeys ? tenancy.keyCollection : null
  const leaseHref = tenancy.leasePdfUrl?.trim() || null

  return (
    <Card className="mb-5 p-4" data-testid="tenant-linked-tenancy">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
            Your tenancy
          </p>
          <p className="mt-1 font-semibold tabular text-ink">{tenancy.id}</p>
          <p className="mt-0.5 text-sm text-ink-500">
            {tenancy.startDate}
            {tenancy.endDate ? ` → ${tenancy.endDate}` : ' · open-ended'}
            {tenancy.rent ? ` · ${formatZAR(tenancy.rent)}/mo` : ''}
          </p>
        </div>
        <Badge tone={statusTone(tenancy.status)}>{tenancy.status}</Badge>
      </div>
      {(keys || leaseHref) && (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-primary-50 pt-3 text-sm">
          {keys ? (
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">
                <KeyRound className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} aria-hidden />
                Keys
              </p>
              <p className="mt-1 font-semibold text-ink">{keys.location || 'Key collection'}</p>
              {keys.instructions ? (
                <p className="mt-0.5 text-xs text-ink-500">{keys.instructions}</p>
              ) : null}
            </div>
          ) : null}
          {leaseHref ? (
            <a
              href={leaseHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <FileText className="h-4 w-4" strokeWidth={1.6} aria-hidden />
              Lease PDF
            </a>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function OccupancyQuickLinks({
  openMaintenance,
  openComplaints,
  unread,
  threadCount,
}: {
  openMaintenance: number
  openComplaints: number
  unread: number
  threadCount: number
}) {
  const links = [
    {
      to: '/workspace/portals/tenant/maintenance',
      label: 'Maintenance',
      detail: 'Report repairs and track open requests',
      icon: Wrench,
      stat: `${openMaintenance} open`,
    },
    {
      to: '/workspace/portals/tenant/messages',
      label: 'Messages',
      detail: 'Chat directly with your agency or agent',
      icon: MessageCircle,
      stat: `${threadCount} thread${threadCount === 1 ? '' : 's'}`,
    },
    {
      to: '/workspace/portals/tenant/complaints',
      label: 'Complaints',
      detail: 'Escalate service or conduct issues',
      icon: AlertTriangle,
      stat: `${openComplaints} open`,
    },
    {
      to: ACCOUNT_WISHLIST_PATH,
      label: 'Wishlist',
      detail: 'Saved homes you are still considering',
      icon: Heart,
      stat: 'Saved listings',
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {links.map((link) => {
        const Icon = link.icon
        return (
          <Link
            key={link.to}
            to={link.to}
            className="group cursor-pointer rounded-2xl border border-primary-100 bg-white p-4 shadow-sm transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon className="h-5 w-5 text-primary" strokeWidth={1.6} aria-hidden />
            <p className="mt-3 font-semibold text-ink group-hover:text-primary">{link.label}</p>
            <p className="mt-1 text-xs text-ink-500">{link.detail}</p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {link.stat}
            </p>
          </Link>
        )
      })}
      <Card className="p-4 sm:col-span-2 xl:col-span-4">
        <div className="flex flex-wrap items-center gap-3">
          <Bell className="h-5 w-5 text-accent" strokeWidth={1.6} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Agency updates</p>
            <p className="text-sm text-ink-500">
              {unread > 0
                ? `${unread} unread notification${unread === 1 ? '' : 's'}`
                : 'You are up to date with agency notifications.'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function PaymentsPanel({
  payments,
  onPay,
  canPay,
  payBusyId,
  expanded,
}: {
  payments: ReturnType<typeof useTenantPortalState>['payments']
  onPay: (id: string) => void
  canPay: boolean
  payBusyId: string | null
  expanded?: boolean
}) {
  const list = expanded ? payments : payments.slice(0, 5)
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">{expanded ? 'Payments' : 'Payments due'}</h2>
      <ul className="mt-3 space-y-2">
        {list.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-xl bg-primary-50 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium">{p.type}</p>
              <p className="text-xs text-ink-400">Due {p.dueDate}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular font-semibold">{formatZAR(p.amount)}</span>
              {p.status === 'Paid' ? (
                <Badge tone="success">Paid</Badge>
              ) : canPay ? (
                <Button
                  size="sm"
                  className="cursor-pointer"
                  disabled={payBusyId === p.id}
                  onClick={() => void onPay(p.id)}
                >
                  {payBusyId === p.id ? 'Opening…' : 'Pay'}
                </Button>
              ) : (
                <Badge tone="warning">{p.status}</Badge>
              )}
            </div>
          </li>
        ))}
        {payments.length === 0 && <li className="text-sm text-ink-400">No payments yet.</li>}
      </ul>
    </Card>
  )
}

function ApplicationsPanel({
  apps,
  properties,
  expanded,
}: {
  apps: Application[]
  properties: PropertyAsset[]
  onUpload?: (appId: string, key: string) => void
  expanded?: boolean
}) {
  const list = expanded ? apps : apps.slice(0, 4)
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Places you’ve applied</h2>
        {!expanded && apps.length > 0 && (
          <Link
            to="/workspace/portals/tenant/applications"
            className="text-sm font-semibold text-primary"
          >
            View all
          </Link>
        )}
      </div>
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">
          No applications yet.{' '}
          <Link className="font-semibold text-primary" to="/browse">
            Browse listings
          </Link>{' '}
          to apply.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((a) => {
            const prop = properties.find((p) => p.id === a.propertyId)
            const href = `/workspace/portals/tenant/applications/${encodeURIComponent(a.id)}`
            return (
              <li key={a.id}>
                <Link
                  to={href}
                  className="block rounded-2xl border border-primary-100 p-3 transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{prop?.title ?? a.propertyId}</p>
                      <p className="text-xs text-ink-400">
                        {a.id}
                        {prop ? ` · ${prop.suburb}, ${prop.city}` : ''}
                      </p>
                    </div>
                    <Badge tone={statusTone(a.stage)}>{a.stage}</Badge>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-50">
                    <div className="h-full bg-primary" style={{ width: `${a.progress}%` }} />
                  </div>
                  {expanded ? (
                    <p className="mt-3 text-sm font-semibold text-primary">Open application →</p>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function WishlistPanel({
  properties,
  emptyTo,
}: {
  properties: PropertyAsset[]
  emptyTo: string
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Heart className="h-5 w-5 text-accent" strokeWidth={1.6} aria-hidden /> Wishlist
        </h2>
        <Link
          to={ACCOUNT_WISHLIST_PATH}
          className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Open wishlist
        </Link>
      </div>
      {properties.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">
          Save homes while you browse — tap the heart on any listing.{' '}
          <Link className="font-semibold text-primary" to={emptyTo}>
            Browse now
          </Link>
        </p>
      ) : (
        <div className="mt-4">
          <WishlistListView
            properties={properties.slice(0, 4)}
            expandedId={expandedId}
            onToggle={(p) => setExpandedId((id) => (id === p.id ? null : p.id))}
            reducedMotion={reducedMotion}
          />
        </div>
      )}
    </Card>
  )
}
