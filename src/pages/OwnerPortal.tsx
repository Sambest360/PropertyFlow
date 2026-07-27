import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Building, Home, TrendingUp, Wrench } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import {
  AttentionHero,
  DashboardBreadcrumb,
  DashboardPage,
  SectionBanner,
} from '../components/dashboard'
import { Badge, Card, StatCard, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'

export default function OwnerPortal() {
  const { state } = useStore()
  const { user } = useAuth()
  const { allowedPropertyIds } = usePropertyScope()

  const scoped = useMemo(() => {
    return state.properties.filter((p) => allowedPropertyIds.has(p.id))
  }, [state.properties, allowedPropertyIds])

  const payments = state.payments.filter((p) => {
    const prop = state.properties.find((x) => x.id === p.propertyId)
    if (!prop || !p.landlordVisible) return false
    return allowedPropertyIds.has(p.propertyId)
  })
  const collected = payments.filter((p) => p.status === 'Paid').reduce((n, p) => n + p.amount, 0)
  const due = payments.filter((p) => p.status === 'Due' || p.status === 'Overdue').reduce((n, p) => n + p.amount, 0)
  const tickets = state.tickets.filter((t) => scoped.some((p) => p.id === t.propertyId) && t.status !== 'Completed')
  const rented = scoped.filter((p) => p.status === 'Rented').length
  const occupancy = scoped.length ? Math.round((rented / scoped.length) * 100) : 0
  const featured = scoped[0]

  return (
    <RequirePermission permission="portal.owner">
      <DashboardPage>
        <DashboardBreadcrumb
          items={[
            { label: 'Dashboard', to: '/workspace' },
            { label: 'Owner portal' },
          ]}
        />

        <AttentionHero
          image={featured?.images[0]}
          eyebrow="Landlord portal"
          title={featured?.title ?? `Welcome, ${user.name.split(' ')[0]}`}
          detail="Your assets and rent receipts only. Tenants and messaging stay with the agency."
          badge={featured?.status ?? 'Owner'}
          badgeTone="brand"
          secondaryBadge={featured?.type}
          stats={[
            { label: 'Assets', value: String(scoped.length) },
            { label: 'Occupancy', value: `${occupancy}%` },
            { label: 'Collected', value: formatZAR(collected) },
          ]}
          cta={{
            label: 'Back to overview',
            to: '/workspace',
            icon: <Home className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
          }}
          secondaryCta={
            featured ? { label: 'Open property', to: `/workspace/properties/${featured.id}` } : undefined
          }
          propertyLink={
            featured
              ? { to: `/workspace/properties/${featured.id}` }
              : { to: '/workspace', label: 'Dashboard' }
          }
        />

        {tickets.length > 0 && (
          <SectionBanner
            tone="warning"
            text={`${tickets.length} open maintenance item${tickets.length === 1 ? '' : 's'} on your assets — agency-managed.`}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Your properties" value={scoped.length} icon={<Building className="h-5 w-5" />} />
          <StatCard label="Occupancy" value={`${occupancy}%`} icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label="Collected" value={formatZAR(collected)} icon={<Banknote className="h-5 w-5" />} />
          <StatCard label="Open works" value={tickets.length} icon={<Wrench className="h-5 w-5" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {scoped.map((p) => {
            const agent = state.users.find((u) => u.id === p.agentId)
            const propPay = payments.filter((x) => x.propertyId === p.id)
            const monthRent = propPay
              .filter((x) => x.type === 'Rent' && x.status === 'Paid')
              .reduce((n, x) => n + x.amount, 0)
            return (
              <Card key={p.id} className="p-4" hover>
                <div className="flex gap-4">
                  <img src={p.images[0]} alt="" className="h-24 w-32 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/workspace/properties/${p.id}`}
                        className="truncate font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {p.title}
                      </Link>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {p.suburb} · Managed by {agent?.name ?? 'agency'}
                    </p>
                    <p className="mt-2 tabular text-sm font-semibold text-ink">
                      {p.rent ? `${formatZAR(p.rent)}/mo` : formatZAR(p.price)}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      Receipts recorded: {formatZAR(monthRent)} · Outstanding on asset: {formatZAR(due)}
                    </p>
                  </div>
                </div>
              </Card>
            )
          })}
          {scoped.length === 0 && (
            <Card className="p-8 text-center">
              <p className="font-semibold text-ink">No properties yet</p>
              <p className="mt-2 text-sm text-ink-500">
                Add a property to your portfolio and publish it so applicants can find it on the marketplace.
              </p>
              <Link
                to="/workspace/properties/new"
                className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Add property
              </Link>
            </Card>
          )}
        </div>
      </DashboardPage>
    </RequirePermission>
  )
}
