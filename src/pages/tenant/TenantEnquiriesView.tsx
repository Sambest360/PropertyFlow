import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FileText, Home, MessageSquare } from 'lucide-react'
import { usePublicProperties, useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { formatZAR } from '../../data/seed'
import { enquiryStatus } from '../../lib/enquiryStatus'
import { Badge, Card, EmptyState } from '../../components/ui'

const ICON_STROKE = 1.6
type Filter = 'open' | 'closed' | 'all'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Every enquiry the signed-in tenant has sent, so they can keep track of them. */
export function TenantEnquiriesView() {
  const { state } = useStore()
  const { user } = useAuth()
  const publicProperties = usePublicProperties()
  const [filter, setFilter] = useState<Filter>('open')

  const email = user.email?.toLowerCase() ?? ''
  const enquiries = useMemo(
    () =>
      state.leads
        .filter((l) => Boolean(email) && l.email?.toLowerCase() === email)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [state.leads, email],
  )

  const withStatus = enquiries.map((lead) => ({ lead, status: enquiryStatus(lead) }))
  const counts = {
    open: withStatus.filter((e) => e.status.open).length,
    closed: withStatus.filter((e) => !e.status.open).length,
    all: withStatus.length,
  }
  const list = withStatus.filter((e) => (filter === 'all' ? true : filter === 'open' ? e.status.open : !e.status.open))

  const propertyFor = (id: string) =>
    publicProperties.find((p) => p.id === id) ?? state.properties.find((p) => p.id === id) ?? null
  const agentName = (id: string | null) => (id ? state.users.find((u) => u.id === id)?.name ?? null : null)

  if (!enquiries.length) {
    return (
      <div data-tip-target="tenant-enquiries">
        <EmptyState
          title="No enquiries yet"
          description="Ask about any listing with “Enquire” — every enquiry you send shows up here so you can follow it."
        />
        <div className="mt-4 flex justify-center">
          <Link
            to="/browse"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-primary-200 px-4 text-sm font-semibold text-primary hover:bg-primary-50"
          >
            <Home className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Browse homes
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div data-tip-target="tenant-enquiries" className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">My enquiries</h1>
        <p className="mt-1 text-sm text-ink-500">Every listing you&apos;ve asked about, and where each one stands.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Enquiry filter">
        {(
          [
            ['open', `Open (${counts.open})`],
            ['closed', `Closed (${counts.closed})`],
            ['all', `All (${counts.all})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={
              'min-h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
              (filter === key
                ? 'border-primary bg-primary text-white'
                : 'border-primary-100 bg-white text-ink-600 hover:bg-primary-50')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card className="p-6 text-center text-sm text-ink-500">Nothing here.</Card>
      ) : (
        <ul className="space-y-3">
          {list.map(({ lead, status }) => {
            const prop = propertyFor(lead.propertyId)
            const agent = agentName(lead.agentId)
            return (
              <li key={lead.id}>
                <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                  {prop?.images?.[0] ? (
                    <img src={prop.images[0]} alt="" className="h-20 w-28 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                      <Home className="h-6 w-6" strokeWidth={ICON_STROKE} aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-ink">{prop?.title ?? 'Listing'}</p>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {lead.type === 'Buy' ? 'To buy' : 'To rent'}
                      {prop ? ` · ${prop.suburb}, ${prop.city}` : ''}
                      {prop?.rent && lead.type !== 'Buy' ? ` · ${formatZAR(prop.rent)}/mo` : ''}
                      {prop?.price && lead.type === 'Buy' ? ` · ${formatZAR(prop.price)}` : ''}
                      {` · Sent ${fmtDate(lead.createdAt)}`}
                    </p>
                    {lead.notes?.trim() ? (
                      <p className="mt-2 line-clamp-2 text-sm text-ink-600">“{lead.notes.trim()}”</p>
                    ) : null}
                    <p className="mt-2 text-xs text-ink-500">
                      {agent ? `Agent: ${agent}` : 'An agent will pick this up'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {prop ? (
                        <Link
                          to={`/listing/${prop.id}`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary-200 px-3 text-sm font-semibold text-ink hover:bg-primary-50"
                        >
                          <Home className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                          View listing
                        </Link>
                      ) : null}
                      {prop && status.next === 'viewing' ? (
                        <Link
                          to={`/listing/${prop.id}?viewing=1`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-700"
                        >
                          <CalendarDays className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                          Book a viewing
                        </Link>
                      ) : null}
                      {prop && status.next === 'apply' ? (
                        <Link
                          to={`/listing/${prop.id}?apply=1`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-700"
                        >
                          <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                          Apply
                        </Link>
                      ) : null}
                      <Link
                        to="/workspace/portals/tenant/messages"
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary-50"
                      >
                        <MessageSquare className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                        Message agent
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
