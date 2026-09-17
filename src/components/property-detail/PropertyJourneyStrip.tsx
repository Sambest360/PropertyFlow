import { Link } from 'react-router-dom'
import {
  ClipboardList,
  CreditCard,
  Eye,
  Home,
  KeyRound,
  Wrench,
} from 'lucide-react'
import type {
  Application,
  MaintenanceTicket,
  PaymentRecord,
  PropertyAsset,
  Tenancy,
  ViewingSlot,
} from '../../types/domain'
import { Badge, Card, statusTone } from '../ui'

const ICON_STROKE = 1.6

/**
 * P1-8: one property, one trail — listing ↔ viewings ↔ applications ↔
 * tenancy ↔ tickets ↔ payments without rekeying IDs. Every node links
 * into its existing workspace tab.
 */
export function PropertyJourneyStrip({
  property,
  slots,
  applications,
  tenancies,
  tickets,
  payments,
}: {
  property: PropertyAsset
  slots: ViewingSlot[]
  applications: Application[]
  tenancies: Tenancy[]
  tickets: MaintenanceTicket[]
  payments: PaymentRecord[]
}) {
  const openSlots = slots.filter((s) => s.status === 'Open').length
  const liveApps = applications.filter(
    (a) => a.stage !== 'Rejected' && a.stage !== 'Withdrawn' && a.stage !== 'Blocked',
  )
  const activeTenancy = tenancies.find((t) => t.status === 'Active') ?? tenancies[0]
  const openTickets = tickets.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled')
  const money = payments.filter((pay) => pay.status !== 'Cancelled')

  const nodes: Array<{
    label: string
    icon: typeof Home
    to: string
    count: number | null
    detail: string | null
    tone: 'brand' | 'success' | 'warning' | 'neutral'
  }> = [
    {
      label: 'Listing',
      icon: Home,
      to: '/browse',
      count: property.status === 'Published' || property.status === 'Featured' ? 1 : 0,
      detail: property.status,
      tone: ['Published', 'Featured', 'Under Offer'].includes(property.status) ? 'brand' : 'neutral',
    },
    {
      label: 'Viewings',
      icon: Eye,
      to: '/workspace/properties/' + property.id + '?tab=viewings',
      count: slots.length,
      detail: openSlots > 0 ? `${openSlots} open slot${openSlots === 1 ? '' : 's'}` : 'no open slots',
      tone: openSlots > 0 ? 'success' : 'neutral',
    },
    {
      label: 'Applications',
      icon: ClipboardList,
      to: '/workspace/properties/' + property.id + '?tab=applicants',
      count: applications.length,
      detail:
        liveApps.length > 0
          ? liveApps.length === 1
            ? liveApps[0].stage
            : `${liveApps.length} live`
          : 'none',
      tone: liveApps.length > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Tenancy',
      icon: KeyRound,
      to: '/workspace/properties/' + property.id,
      count: tenancies.length,
      detail: activeTenancy ? `${activeTenancy.status} · ${activeTenancy.tenantName}` : 'vacant',
      tone: activeTenancy?.status === 'Active' ? 'success' : 'neutral',
    },
    {
      label: 'Jobs',
      icon: Wrench,
      to: '/workspace/properties/' + property.id + '?tab=maintenance',
      count: tickets.length,
      detail: openTickets.length > 0 ? `${openTickets.length} open` : 'all closed',
      tone: openTickets.length > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Money',
      icon: CreditCard,
      to: '/workspace/properties/' + property.id + '?tab=payments',
      count: payments.length,
      detail: money.length > 0 ? `${money.length} recorded` : 'none',
      tone: money.length > 0 ? 'success' : 'neutral',
    },
  ]

  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        Listing-to-lease trail
      </p>
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        {nodes.map((n, i) => {
          const Icon = n.icon
          return (
            <div key={n.label} className="flex min-w-0 items-stretch gap-2">
              {i > 0 && <span className="my-auto hidden h-px w-4 bg-primary-100 sm:block" aria-hidden />}
              <Link
                to={n.to}
                className="flex min-w-[8.5rem] flex-1 flex-col gap-1 rounded-xl border border-primary-100 px-3 py-2 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <Icon className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                  {n.label}
                  {n.count != null && n.count > 0 && (
                    <span className="rounded-full bg-primary-100 px-1.5 text-[10px] font-bold text-primary">
                      {n.count}
                    </span>
                  )}
                </span>
                {n.detail && (
                  <Badge tone={n.tone} className="w-fit max-w-full truncate">
                    {n.detail}
                  </Badge>
                )}
              </Link>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// Re-export for tone typing parity with the rest of the detail panels.
export { statusTone }
