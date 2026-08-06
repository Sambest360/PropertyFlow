import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  Camera,
  ChevronRight,
  HardHat,
  KeyRound,
  MapPin,
  Star,
  Wrench,
} from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import {
  AttentionHero,
  DashboardBreadcrumb,
  DashboardPage,
  SectionBanner,
} from '../components/dashboard'
import { Badge, Button, Card, Select, StatCard, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import { VerificationPendingBanner } from '../components/auth/VerificationBanner'
import { openJobsForContractor, ticketsForContractor } from '../lib/contractors'
import { TicketPhotoGallery } from '../components/maintenance/TicketPhotoGallery'
import { formatAge, ticketAgeHours } from '../components/maintenance/types'

const ICON_STROKE = 1.6

export default function ContractorPortal() {
  const { state, updateTicket, assignContractorToTicket } = useStore()
  const { user } = useAuth()
  const { ticketVisible, canMutate } = usePropertyScope()

  const visible = useMemo(
    () => state.tickets.filter((t) => ticketVisible(t)),
    [state.tickets, ticketVisible],
  )

  const assigned = useMemo(
    () => ticketsForContractor(visible, user.id),
    [visible, user.id],
  )
  const openAssigned = useMemo(() => openJobsForContractor(visible, user.id), [visible, user.id])
  const completed = assigned.filter((t) => t.status === 'Completed')
  const earnings = completed.reduce((n, t) => n + t.cost, 0)
  const available = visible.filter((t) => !t.contractorId && t.status !== 'Completed' && t.status !== 'Cancelled')
  const focus = openAssigned[0] ?? available[0]
  const focusProp = focus ? state.properties.find((p) => p.id === focus.propertyId) : null

  const acceptJob = (ticketId: string) => {
    if (!canMutate(state.tickets.find((t) => t.id === ticketId)?.propertyId ?? '')) return
    assignContractorToTicket({
      ticketId,
      contractorUserId: user.id,
      actorUserId: user.id,
    })
  }

  const declineJob = (ticketId: string) => {
    updateTicket(ticketId, { contractorId: null, contractorAssignedAt: null, status: 'Requested' })
  }

  const renderJobCard = (t: (typeof visible)[0], mode: 'assigned' | 'available' | 'done') => {
    const prop = state.properties.find((p) => p.id === t.propertyId)
    const photos = t.photoUrls ?? []
    const detailHref = `/workspace/operations/maintenance/${encodeURIComponent(t.id)}`

    return (
      <Card key={t.id} className="overflow-hidden" hover>
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={detailHref} className="font-semibold text-ink hover:text-primary">
                {t.title}
              </Link>
              <Badge tone={statusTone(t.status)}>{t.status}</Badge>
              <Badge tone="neutral">{t.priority}</Badge>
            </div>
            <p className="text-sm text-ink-500">
              {prop?.title ?? t.propertyId} · {t.assetLabel}
              {t.locationDetail ? ` · ${t.locationDetail}` : ''}
            </p>
            <p className="text-sm leading-relaxed text-ink">{t.description}</p>

            {t.accessNotes ? (
              <p className="flex items-start gap-2 rounded-xl bg-primary-50/50 px-3 py-2 text-xs text-ink-600">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                {t.accessNotes}
              </p>
            ) : null}

            {t.preferredSchedule ? (
              <p className="flex items-center gap-1.5 text-xs text-ink-500">
                <Calendar className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                Preferred: {t.preferredSchedule}
              </p>
            ) : null}

            {photos.length > 0 ? (
              <div>
                <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  <Camera className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                  Site photos
                </p>
                <TicketPhotoGallery urls={photos.slice(0, 3)} />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 text-xs text-ink-500">
              <span className="tabular">{formatAge(ticketAgeHours(t))} open</span>
              <span>{t.cost ? formatZAR(t.cost) : t.estimatedCost ? `Est. ${formatZAR(t.estimatedCost)}` : 'Quote TBC'}</span>
              {prop ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                  {prop.suburb}, {prop.city}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 lg:w-44">
            <Link to={detailHref}>
              <Button variant="secondary" size="sm" className="min-h-10 w-full">
                View job
                <ChevronRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              </Button>
            </Link>
            {mode === 'available' ? (
              <Button size="sm" className="min-h-10 w-full" onClick={() => acceptJob(t.id)}>
                Accept job
              </Button>
            ) : null}
            {mode === 'assigned' && t.contractorId === user.id && t.status !== 'Completed' ? (
              <>
                <Select
                  className="min-h-10 w-full"
                  value={t.status}
                  onChange={(e) => {
                    if (!canMutate(t.propertyId)) return
                    updateTicket(t.id, { status: e.target.value as typeof t.status })
                  }}
                >
                  {['Requested', 'In Progress', 'Awaiting Parts', 'Completed', 'Cancelled'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
                <Button variant="secondary" size="sm" className="min-h-10 w-full" onClick={() => declineJob(t.id)}>
                  Decline
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <RequirePermission permission="portal.contractor">
      <DashboardPage>
        <DashboardBreadcrumb
          items={[
            { label: 'Dashboard', to: '/workspace' },
            { label: 'Contractor portal' },
          ]}
        />

        <AttentionHero
          image={focusProp?.images[0]}
          eyebrow="Contractor portal"
          title={focus?.title ?? `Welcome, ${user.name.split(' ')[0]}`}
          detail={
            focus
              ? `${focus.assetLabel} · ${focus.priority}${focus.accessNotes ? ' · check access notes' : ''}`
              : 'Accept jobs, update status, and upload completion evidence.'
          }
          badge={focus?.priority ?? 'Idle'}
          badgeTone={focus ? 'warning' : 'neutral'}
          secondaryBadge={focus?.status}
          stats={[
            { label: 'Active', value: String(openAssigned.length) },
            { label: 'Available', value: String(available.length) },
            { label: 'Earnings', value: formatZAR(earnings) },
          ]}
          cta={{
            label: focus ? 'Open job' : 'Workspace home',
            to: focus
              ? `/workspace/operations/maintenance/${encodeURIComponent(focus.id)}`
              : '/workspace',
            icon: <HardHat className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />,
          }}
          propertyLink={
            focusProp
              ? { to: `/workspace/properties/${focusProp.id}`, label: 'Site' }
              : { to: '/workspace', label: 'Dashboard' }
          }
        />

        <VerificationPendingBanner user={user} />

        {openAssigned.length > 0 && (
          <SectionBanner
            tone="info"
            text={`${openAssigned.length} active job${openAssigned.length === 1 ? '' : 's'} assigned to you — tenants and agents are notified when you update status.`}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Assigned" value={assigned.length} icon={<HardHat className="h-5 w-5" />} />
          <StatCard label="Open" value={openAssigned.length} icon={<Wrench className="h-5 w-5" />} />
          <StatCard label="Completed" value={completed.length} icon={<Star className="h-5 w-5" />} />
          <StatCard label="Earnings" value={formatZAR(earnings)} icon={<Star className="h-5 w-5" />} />
        </div>

        {openAssigned.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-ink">Your active jobs</h2>
            {openAssigned.map((t) => renderJobCard(t, 'assigned'))}
          </section>
        )}

        {available.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-ink">Available in your area</h2>
            <p className="text-sm text-ink-500">
              Open jobs on properties you can service — accept to notify the agency and tenant.
            </p>
            {available.map((t) => renderJobCard(t, 'available'))}
          </section>
        )}

        {completed.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-ink">Recently completed</h2>
            {completed.slice(0, 5).map((t) => renderJobCard(t, 'done'))}
          </section>
        )}

        {visible.length === 0 && (
          <Card className="p-6 text-sm text-ink-500">No jobs available right now.</Card>
        )}
      </DashboardPage>
    </RequirePermission>
  )
}
