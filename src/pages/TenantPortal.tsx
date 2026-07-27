import { useMemo, useState, type FormEvent } from 'react'
import { Bell, CreditCard, FileCheck2, FileText, Heart, Home, KeyRound, MessageCircle, Wrench } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { usePublicProperties, useStore } from '../context/AppStore'
import { useAuth } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import {
  AttentionHero,
  DashboardBreadcrumb,
  DashboardPage,
  SectionBanner,
} from '../components/dashboard'
import { Badge, Button, Card, Input, Select, StatCard, statusTone } from '../components/ui'
import { WishlistListView } from '../components/wishlist/WishlistListView'
import { formatZAR } from '../data/seed'
import { blockedPropertyIdsForApplicant } from '../lib/blockedApplicants'
import { tenantHasApprovedOccupancy } from '../lib/tenantOccupancy'
import { useWishlist } from '../hooks/useWishlist'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import type { Application, PropertyAsset } from '../types/domain'

export default function TenantPortal() {
  const { state, createMaintenanceTicket, markPaymentPaid, setDocumentStatus } = useStore()
  const publicProperties = usePublicProperties()
  const { user, agencyId, has } = useAuth()
  const location = useLocation()
  const applicationsOnly = location.pathname.endsWith('/applications')
  const { ids: wishlistIds } = useWishlist(user.id)
  const [title, setTitle] = useState('')
  const [assetLabel, setAssetLabel] = useState('Kitchen tap')
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent' | 'Emergency'>('Medium')
  const [done, setDone] = useState('')

  const occupancyReady = tenantHasApprovedOccupancy(state.applications, state.tenancies, user)
  const canOps = occupancyReady && has('payments.view')

  const blockedIds = useMemo(
    () => blockedPropertyIdsForApplicant(state.applications, user),
    [state.applications, user],
  )

  const apps = useMemo(
    () =>
      state.applications.filter(
        (a) =>
          (a.applicantUserId === user.id || a.email === user.email) &&
          a.stage !== 'Blocked' &&
          !blockedIds.has(a.propertyId),
      ),
    [state.applications, user, blockedIds],
  )
  const app = apps.find((a) => a.stage !== 'Active Tenancy') ?? apps[0]
  const tenancy = state.tenancies.find(
    (t) => t.tenantUserId === user.id && !blockedIds.has(t.propertyId),
  )
  const tickets = state.tickets.filter((t) => t.reportedByUserId === user.id || t.reportedBy === user.name)
  const payments = state.payments.filter((p) => p.partyUserId === user.id || p.partyName === user.name)
  const notes = state.notifications.filter((n) => n.userId === user.id)
  const property = app
    ? state.properties.find((p) => p.id === app.propertyId)
    : tenancy
      ? state.properties.find((p) => p.id === tenancy.propertyId)
      : null

  const wishlistProperties = useMemo(
    () =>
      publicProperties.filter((p) => wishlistIds.includes(p.id) && !blockedIds.has(p.id)),
    [publicProperties, wishlistIds, blockedIds],
  )

  const submitTicket = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !agencyId) return
    const propId = tenancy?.propertyId ?? property?.id
    if (!propId) {
      setDone('No property linked to your tenancy or application yet.')
      return
    }
    const prop = state.properties.find((p) => p.id === propId)
    if (!prop?.unitId) {
      setDone('No unit linked to your occupancy yet.')
      return
    }
    const matchedAsset = state.internalAssets.find(
      (a) =>
        a.unitId === prop.unitId &&
        a.itemName.toLowerCase().includes(assetLabel.trim().toLowerCase().split(' ')[0] || ''),
    )
    const category = /microwave|fridge|washer|appliance/i.test(assetLabel + title)
      ? 'APPLIANCE_FAILURE'
      : /tap|geyser|plumb|leak/i.test(assetLabel + title)
        ? 'PLUMBING'
        : /intercom|plug|light|electric/i.test(assetLabel + title)
          ? 'ELECTRICAL'
          : 'GENERAL'
    const result = createMaintenanceTicket({
      actorUserId: user.id,
      propertyId: propId,
      request: {
        unit_id: prop.unitId,
        internal_asset_id: matchedAsset?.id ?? null,
        category_key: category,
        priority:
          priority === 'Emergency'
            ? 'EMERGENCY'
            : (priority.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'),
        title: title.trim(),
        description: `Tenant-reported via portal (${assetLabel}). Routed to agency/agent — not the landlord. ${title.trim()}`,
      },
    })
    if (result.status === 'ERROR') {
      setDone(result.error)
      return
    }
    setDone(
      `Request ${result.ticket_id} sent${result.warrantyCovered ? ' · warranty detected' : ''}${result.ticket.contractorId ? ' · vendor auto-routed' : ''}.`,
    )
    setTitle('')
  }

  const duePayments = payments.filter((p) => p.status === 'Due' || p.status === 'Overdue')

  return (
    <RequirePermission permission="portal.tenant">
      <DashboardPage>
        <DashboardBreadcrumb
          items={[
            { label: 'Dashboard', to: '/workspace/portals/tenant' },
            ...(applicationsOnly
              ? [{ label: 'My applications' }]
              : [{ label: occupancyReady ? 'Tenant portal' : 'Applicant home' }]),
          ]}
        />

        <AttentionHero
          image={property?.images[0] ?? wishlistProperties[0]?.images[0]}
          eyebrow={occupancyReady ? 'Tenant portal' : 'Applicant home'}
          title={
            occupancyReady
              ? (property?.title ?? `Welcome, ${user.name.split(' ')[0]}`)
              : `Hi ${user.name.split(' ')[0]}`
          }
          detail={
            occupancyReady
              ? 'Pay deposits, report maintenance, and message your agency — never the landlord.'
              : 'Track every place you’ve applied for, and keep a wishlist of homes you want to revisit. Payments and maintenance unlock once you’re approved.'
          }
          badge={app?.stage ?? tenancy?.status ?? 'Applicant'}
          badgeTone={occupancyReady ? 'brand' : 'warning'}
          secondaryBadge={app?.type}
          stats={
            occupancyReady
              ? [
                  { label: 'Applications', value: String(apps.length) },
                  { label: 'Due', value: String(duePayments.length) },
                  {
                    label: 'Tickets',
                    value: String(tickets.filter((t) => t.status !== 'Completed').length),
                  },
                ]
              : [
                  { label: 'Applications', value: String(apps.length) },
                  { label: 'Wishlist', value: String(wishlistIds.length) },
                  { label: 'Approved', value: 'Not yet' },
                ]
          }
          cta={{
            label: apps.length ? 'View applications' : 'Browse homes',
            to: apps.length ? '/workspace/portals/tenant/applications' : '/browse',
            icon: <FileCheck2 className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
          }}
          secondaryCta={{ label: 'Wishlist', to: '/saved' }}
          propertyLink={
            property
              ? { to: `/listing/${property.id}`, label: 'Your listing' }
              : { to: '/browse', label: 'Browse' }
          }
        />

        {canOps && duePayments.length > 0 && (
          <SectionBanner
            tone="danger"
            text={`You have ${duePayments.length} payment${duePayments.length === 1 ? '' : 's'} due — pay the agency only.`}
          />
        )}

        {!occupancyReady && !applicationsOnly && (
          <div className="grid gap-5 lg:grid-cols-2">
            <ApplicationsPanel
              apps={apps}
              properties={state.properties}
              onUpload={(appId, key) => setDocumentStatus(appId, key, 'uploaded')}
            />
            <WishlistPanel properties={wishlistProperties} emptyTo="/browse" />
          </div>
        )}

        {(applicationsOnly || (occupancyReady && !applicationsOnly)) && (
          <div className={applicationsOnly ? 'space-y-5' : 'contents'}>
            {applicationsOnly && (
              <ApplicationsPanel
                apps={apps}
                properties={state.properties}
                onUpload={(appId, key) => setDocumentStatus(appId, key, 'uploaded')}
                expanded
              />
            )}
          </div>
        )}

        {occupancyReady && !applicationsOnly && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Applications" value={apps.length} icon={<Home className="h-5 w-5" />} />
              <StatCard
                label="Latest stage"
                value={app?.stage ?? tenancy?.status ?? '—'}
                icon={<CreditCard className="h-5 w-5" />}
              />
              <StatCard
                label="Open maintenance"
                value={tickets.filter((t) => t.status !== 'Completed').length}
                icon={<Wrench className="h-5 w-5" />}
              />
              <StatCard
                label="Unread updates"
                value={notes.filter((n) => !n.read).length}
                icon={<Bell className="h-5 w-5" />}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <ApplicationsPanel
                apps={apps}
                properties={state.properties}
                onUpload={(appId, key) => setDocumentStatus(appId, key, 'uploaded')}
              />

              <Card className="p-5">
                <h2 className="font-display text-lg font-semibold">Payments due</h2>
                <ul className="mt-3 space-y-2">
                  {payments.slice(0, 5).map((p) => (
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
                        ) : (
                          <Button size="sm" onClick={() => markPaymentPaid(p.id)}>
                            Pay
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                  {payments.length === 0 && <li className="text-sm text-ink-400">No payments yet.</li>}
                </ul>
              </Card>

              <Card className="p-5">
                <h2 className="font-display text-lg font-semibold">Report maintenance</h2>
                <p className="mt-1 text-xs text-ink-400">Goes to your agency/agent — not the landlord.</p>
                <form className="mt-3 space-y-3" onSubmit={submitTicket}>
                  <Input
                    placeholder="What's broken?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <Input
                    placeholder="Asset (e.g. geyser)"
                    value={assetLabel}
                    onChange={(e) => setAssetLabel(e.target.value)}
                  />
                  <Select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as typeof priority)}
                  >
                    {['Low', 'Medium', 'High', 'Urgent', 'Emergency'].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm">
                    Submit to agency
                  </Button>
                  {done && <p className="text-xs text-ink-500">{done}</p>}
                </form>
              </Card>

              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
                  <Bell className="h-5 w-5 text-accent" /> Updates
                </h2>
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-xl border border-primary-100 px-3 py-2 text-sm">
                      <p className="font-medium text-ink">{n.title}</p>
                      <p className="text-ink-500">{n.body}</p>
                    </li>
                  ))}
                  {notes.length === 0 && <li className="text-sm text-ink-400">No notifications yet.</li>}
                </ul>
                {has('messages.manage') && (
                  <Link
                    to="/workspace/operations/communications"
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"
                  >
                    <MessageCircle className="h-4 w-4" /> Message agency
                  </Link>
                )}
                <p className="mt-4 flex items-center gap-1 text-xs text-ink-400">
                  <FileText className="h-3.5 w-3.5" /> Occupancy:{' '}
                  {tenancy ? `${tenancy.status} from ${tenancy.startDate}` : 'Not yet active'}
                </p>
              </Card>
            </div>
          </>
        )}
      </DashboardPage>
    </RequirePermission>
  )
}

function ApplicationsPanel({
  apps,
  properties,
  onUpload,
  expanded,
}: {
  apps: Application[]
  properties: PropertyAsset[]
  onUpload: (appId: string, key: string) => void
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
            return (
              <li key={a.id} className="rounded-2xl border border-primary-100 p-3">
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
                {expanded && (
                  <div className="mt-3 space-y-2">
                    {a.documents.map((d) => (
                      <div
                        key={d.key}
                        className="flex items-center justify-between gap-2 rounded-xl bg-primary-50 px-3 py-2 text-xs"
                      >
                        <span className="text-ink">{d.label}</span>
                        <div className="flex items-center gap-2">
                          <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                          {d.status === 'required' && (
                            <Button size="sm" variant="secondary" onClick={() => onUpload(a.id, d.key)}>
                              Upload
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {a.keyCollection && (
                      <div className="rounded-xl border border-primary-100 p-3 text-sm">
                        <p className="font-semibold">
                          <KeyRound className="mr-1 inline h-4 w-4" /> Key collection
                        </p>
                        <p className="mt-1 text-ink-600">{a.keyCollection.location}</p>
                        <p className="text-ink-500">{a.keyCollection.instructions}</p>
                      </div>
                    )}
                    {prop && (
                      <Link
                        to={`/listing/${prop.id}`}
                        className="inline-flex text-sm font-semibold text-primary"
                      >
                        Open listing
                      </Link>
                    )}
                  </div>
                )}
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
          <Heart className="h-5 w-5 text-accent" /> Wishlist
        </h2>
        <Link
          to="/saved"
          className="min-h-11 cursor-pointer inline-flex items-center text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
            properties={properties}
            expandedId={expandedId}
            onToggle={(p) => setExpandedId((id) => (id === p.id ? null : p.id))}
            reducedMotion={reducedMotion}
          />
        </div>
      )}
    </Card>
  )
}
