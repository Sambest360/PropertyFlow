import { useMemo, useState, type FormEvent } from 'react'
import { Bell, CreditCard, FileCheck2, FileText, Home, KeyRound, MessageCircle, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import {
  AttentionHero,
  DashboardBreadcrumb,
  DashboardPage,
  SectionBanner,
} from '../components/dashboard'
import { Badge, Button, Card, Input, Select, StatCard, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import { blockedPropertyIdsForApplicant } from '../lib/blockedApplicants'

export default function TenantPortal() {
  const { state, createMaintenanceTicket, markPaymentPaid, setDocumentStatus } = useStore()
  const { user, agencyId } = useAuth()
  const [title, setTitle] = useState('')
  const [assetLabel, setAssetLabel] = useState('Kitchen tap')
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent' | 'Emergency'>('Medium')
  const [done, setDone] = useState('')

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

  const submitTicket = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !agencyId) return
    const propId = tenancy?.propertyId ?? property?.id ?? state.properties.find((p) => p.agencyId === agencyId)?.id
    if (!propId) return
    const prop = state.properties.find((p) => p.id === propId)
    if (!prop?.unitId) {
      setDone('No unit linked to your occupancy yet.')
      return
    }
    const matchedAsset = state.internalAssets.find(
      (a) => a.unitId === prop.unitId && a.itemName.toLowerCase().includes(assetLabel.trim().toLowerCase().split(' ')[0] || ''),
    )
    const category =
      /microwave|fridge|washer|appliance/i.test(assetLabel + title) ? 'APPLIANCE_FAILURE'
      : /tap|geyser|plumb|leak/i.test(assetLabel + title) ? 'PLUMBING'
      : /intercom|plug|light|electric/i.test(assetLabel + title) ? 'ELECTRICAL'
      : 'GENERAL'
    const result = createMaintenanceTicket({
      actorUserId: user.id,
      propertyId: propId,
      request: {
        unit_id: prop.unitId,
        internal_asset_id: matchedAsset?.id ?? null,
        category_key: category,
        priority: priority === 'Emergency' ? 'EMERGENCY' : (priority.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'),
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
            { label: 'Dashboard', to: '/workspace' },
            { label: 'Tenant portal' },
          ]}
        />

        <AttentionHero
          image={property?.images[0] ?? state.properties[0]?.images[0]}
          eyebrow="Applicant / Tenant portal"
          title={property?.title ?? `Welcome, ${user.name.split(' ')[0]}`}
          detail="Apply, upload documents, pay deposits, and message your agency — never the landlord."
          badge={app?.stage ?? tenancy?.status ?? 'Tenant'}
          badgeTone={app ? 'warning' : 'brand'}
          secondaryBadge={app?.type}
          stats={[
            { label: 'Applications', value: String(apps.length) },
            { label: 'Due', value: String(duePayments.length) },
            {
              label: 'Tickets',
              value: String(tickets.filter((t) => t.status !== 'Completed').length),
            },
          ]}
          cta={{
            label: app ? 'Continue application' : 'Browse homes',
            to: app ? '/workspace/portals/tenant' : '/browse',
            icon: <FileCheck2 className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
          }}
          secondaryCta={{ label: 'Browse homes', to: '/browse' }}
          propertyLink={
            property
              ? { to: `/workspace/properties/${property.id}`, label: 'Your listing' }
              : { to: '/browse', label: 'Browse' }
          }
        />

        {duePayments.length > 0 && (
          <SectionBanner
            tone="danger"
            text={`You have ${duePayments.length} payment${duePayments.length === 1 ? '' : 's'} due — pay the agency only.`}
          />
        )}

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
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Application & documents</h2>
            {app ? (
              <>
                <p className="mt-1 text-sm text-ink-500">
                  {app.id} · {property?.title ?? app.propertyId}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={statusTone(app.stage)}>{app.stage}</Badge>
                  <Badge tone="success">Credit {app.creditCheck}</Badge>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary-50">
                  <div className="h-full bg-primary" style={{ width: `${app.progress}%` }} />
                </div>
                <div className="mt-4 space-y-2">
                  {app.documents.map((d) => (
                    <div key={d.key} className="flex items-center justify-between gap-2 rounded-xl bg-primary-50 px-3 py-2 text-xs">
                      <span className="text-ink">{d.label}</span>
                      <div className="flex items-center gap-2">
                        <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                        {d.status === 'required' && (
                          <Button size="sm" variant="secondary" onClick={() => setDocumentStatus(app.id, d.key, 'uploaded')}>
                            Upload
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {app.keyCollection && (
                  <div className="mt-4 rounded-xl border border-primary-100 p-3 text-sm">
                    <p className="font-semibold">
                      <KeyRound className="mr-1 inline h-4 w-4" /> Key collection
                    </p>
                    <p className="mt-1 text-ink-600">{app.keyCollection.location}</p>
                    <p className="text-ink-500">{app.keyCollection.instructions}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-500">
                No applications yet. <Link className="font-semibold text-primary" to="/browse">Browse listings</Link> to apply.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Payments due</h2>
            <ul className="mt-3 space-y-2">
              {payments.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-xl bg-primary-50 px-3 py-2 text-sm">
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
              <Input placeholder="What's broken?" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input placeholder="Asset (e.g. geyser)" value={assetLabel} onChange={(e) => setAssetLabel(e.target.value)} />
              <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
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
            <Link
              to="/workspace/operations/communications"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              <MessageCircle className="h-4 w-4" /> Message agency
            </Link>
            <p className="mt-4 flex items-center gap-1 text-xs text-ink-400">
              <FileText className="h-3.5 w-3.5" /> Occupancy: {tenancy ? `${tenancy.status} from ${tenancy.startDate}` : 'Not yet active'}
            </p>
          </Card>
        </div>
      </DashboardPage>
    </RequirePermission>
  )
}
