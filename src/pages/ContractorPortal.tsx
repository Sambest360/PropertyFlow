import { useMemo, useState } from 'react'
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
import { CompleteTicketModal } from '../components/maintenance/CompleteTicketModal'
import {
  canContractorClaimTicket,
  openJobsForContractor,
  ticketsForContractor,
} from '../lib/contractors'
import { isVerificationPending } from '../lib/verification'
import { TicketPhotoGallery } from '../components/maintenance/TicketPhotoGallery'
import { formatAge, ticketAgeHours } from '../components/maintenance/types'
import type { TicketCompletionFields } from '../lib/maintenanceApi'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'

const ICON_STROKE = 1.6

export default function ContractorPortal() {
  const { state, updateTicket, assignContractorToTicket, addPropertyEvent } = useStore()
  const { user } = useAuth()
  const { ticketVisible, canMutate } = usePropertyScope()
  const alert = useSuiteAlert()
  const verificationPending = isVerificationPending(user.verification, user.role)

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

  const acceptJob = async (ticketId: string) => {
    const ticket = state.tickets.find((t) => t.id === ticketId)
    if (!ticket) return

    if (verificationPending) {
      await alert.success({
        title: 'Verification pending',
        text: 'Your documents must be approved before you can accept jobs.',
        tone: 'warning',
      })
      return
    }

    if (!canContractorClaimTicket(user, ticket, state.agencyContractors)) {
      await alert.success({
        title: 'Cannot accept job',
        text: 'This job is no longer available or you are not on the agency approved roster.',
        tone: 'danger',
      })
      return
    }

    const ok = assignContractorToTicket({
      ticketId,
      contractorUserId: user.id,
      actorUserId: user.id,
    })

    if (!ok) {
      await alert.success({
        title: 'Could not accept job',
        text: 'The agency roster may not include your profile yet. Contact the agency or try again.',
        tone: 'danger',
      })
      return
    }

    await alert.success({
      title: 'Job accepted',
      text: 'You can now view access notes, update status, and upload completion evidence.',
    })
  }

  const declineJob = (ticketId: string) => {
    updateTicket(ticketId, { contractorId: null, contractorAssignedAt: null, status: 'Requested' })
  }

  // P0-4: completing work requires evidence — route through the completion
  // modal instead of a bare status flip the store would silently reject.
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completeTicketId, setCompleteTicketId] = useState<string | null>(null)
  const completeTicket = state.tickets.find((t) => t.id === completeTicketId) ?? null

  const submitContractorCompletion = (fields: TicketCompletionFields): string | null => {
    const ticket = state.tickets.find((t) => t.id === completeTicketId)
    if (!ticket) return 'Ticket not found.'
    updateTicket(ticket.id, {
      status: 'Completed',
      resolutionNotes: fields.workNotes.trim(),
      cost: fields.cost,
      photos: Math.max(fields.photos, ticket.photos),
      photoUrls:
        fields.completionPhotoUrls?.length
          ? [...(ticket.photoUrls ?? []), ...fields.completionPhotoUrls]
          : ticket.photoUrls,
    })
    addPropertyEvent({
      agencyId: ticket.agencyId,
      propertyId: ticket.propertyId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'resolved maintenance',
      changes: [
        { field: 'Status', from: ticket.status, to: 'Completed' },
        { field: 'Work performed', from: '—', to: fields.workNotes.trim().slice(0, 120) },
      ],
    })
    setCompleteOpen(false)
    setCompleteTicketId(null)
    void alert.success({
      title: 'Job completed',
      text: 'Work notes and photos were recorded — the agency has been notified.',
    })
    return null
  }

  const renderJobCard = (t: (typeof visible)[0], mode: 'assigned' | 'available' | 'done') => {
    const prop = state.properties.find((p) => p.id === t.propertyId)
    const photos = t.photoUrls ?? []
    const detailHref = `/workspace/operations/maintenance/${encodeURIComponent(t.id)}`
    const previewOnly = mode === 'available'
    const canAccept =
      !verificationPending &&
      canContractorClaimTicket(user, t, state.agencyContractors)

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
              {prop?.title ?? t.propertyId}
              {previewOnly ? '' : ` · ${t.assetLabel}`}
              {!previewOnly && t.locationDetail ? ` · ${t.locationDetail}` : ''}
            </p>
            <p className={`text-sm leading-relaxed text-ink${previewOnly ? ' line-clamp-2' : ''}`}>
              {t.description}
            </p>

            {!previewOnly && t.accessNotes ? (
              <p className="flex items-start gap-2 rounded-xl bg-primary-50/50 px-3 py-2 text-xs text-ink-600">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                {t.accessNotes}
              </p>
            ) : null}

            {!previewOnly && t.preferredSchedule ? (
              <p className="flex items-center gap-1.5 text-xs text-ink-500">
                <Calendar className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                Preferred: {t.preferredSchedule}
              </p>
            ) : null}

            {!previewOnly && photos.length > 0 ? (
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
              {!previewOnly ? (
                <span>{t.cost ? formatZAR(t.cost) : t.estimatedCost ? `Est. ${formatZAR(t.estimatedCost)}` : 'Quote TBC'}</span>
              ) : (
                <span>Accept to view quote & access details</span>
              )}
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
                {previewOnly ? 'Preview job' : 'View job'}
                <ChevronRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              </Button>
            </Link>
            {mode === 'available' ? (
              <>
                <Button
                  size="sm"
                  className="min-h-10 w-full"
                  disabled={!canAccept}
                  onClick={() => void acceptJob(t.id)}
                >
                  Accept job
                </Button>
                {verificationPending ? (
                  <p className="text-[11px] leading-snug text-amber-800">
                    Verification must be approved before accepting jobs.
                  </p>
                ) : null}
              </>
            ) : null}
            {mode === 'assigned' && t.contractorId === user.id && t.status !== ('Completed' as typeof t.status) ? (
              <>
                <Select
                  className="min-h-10 w-full"
                  value={t.status}
                  onChange={(e) => {
                    if (!canMutate(t.propertyId)) return
                    const next = e.target.value as typeof t.status
                    if (next === 'Completed') {
                      // P0-4: completing requires work notes + photos — open the modal.
                      setCompleteTicketId(t.id)
                      setCompleteOpen(true)
                      return
                    }
                    updateTicket(t.id, { status: next })
                    addPropertyEvent({
                      agencyId: t.agencyId,
                      propertyId: t.propertyId,
                      actorUserId: user.id,
                      actorName: user.name,
                      action: 'changed the Maintenance status',
                      changes: [{ field: 'Status', from: t.status, to: next }],
                    })
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

  const focusDetail = focus
    ? [
        focus.assetLabel || focus.categoryKey || 'Maintenance',
        focus.priority,
        focus.contractorId === user.id && focus.accessNotes ? 'check access notes' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Accept jobs, update status, and upload completion evidence.'

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
          detail={focusDetail}
          badge={focus?.priority ?? 'Idle'}
          badgeTone={focus ? 'warning' : 'neutral'}
          secondaryBadge={focus?.status}
          stats={[
            { label: 'Active', value: String(openAssigned.length) },
            { label: 'Available', value: String(available.length) },
            { label: 'Earnings', value: formatZAR(earnings) },
          ]}
          cta={{
            label: focus ? (focus.contractorId === user.id ? 'Open job' : 'Preview job') : 'Workspace home',
            to: focus
              ? `/workspace/operations/maintenance/${encodeURIComponent(focus.id)}`
              : '/workspace',
            icon: <HardHat className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />,
          }}
          propertyLink={
            focusProp && focus?.contractorId === user.id
              ? { to: `/workspace/properties/${focusProp.id}`, label: 'Site' }
              : undefined
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
              Open jobs on properties you can service — preview details, then accept to unlock access notes and site photos.
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

        <CompleteTicketModal
          open={completeOpen}
          ticket={completeTicket}
          propertyTitle={
            completeTicket
              ? state.properties.find((p) => p.id === completeTicket.propertyId)?.title
              : undefined
          }
          contractors={[]}
          onClose={() => {
            setCompleteOpen(false)
            setCompleteTicketId(null)
          }}
          onComplete={submitContractorCompletion}
        />
      </DashboardPage>
    </RequirePermission>
  )
}
