import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  KeyRound,
  MapPin,
  Wallet,
} from 'lucide-react'
import type { Application, PropertyAsset } from '../../types/domain'
import { Badge, Button, Card, Input, cn, statusTone } from '../ui'
import { StageRail } from '../WorkflowOverview'
import { APPLICATION_STAGES } from '../../lib/workflow'
import { buildApplicationActions } from '../../lib/api/actions'
import type { HateoasAction } from '../../lib/api/contracts'
import { formatZAR } from '../../data/seed'
import { ICON_STROKE } from './types'

export function ApplicantApplicationPanel({
  application,
  property,
  agentName,
  actor,
  canReview,
  moveInOpen,
  moveInDate,
  keyLoc,
  onMoveInDate,
  onKeyLoc,
  onRunAction,
  onConfirmMoveIn,
  onOpenMoveIn,
}: {
  application: Application
  property: PropertyAsset | null
  agentName: string | null
  actor: {
    userId: string
    role: string
    agencyId: string | null
    permissions: string[]
  }
  canReview: boolean
  moveInOpen: boolean
  moveInDate: string
  keyLoc: string
  onMoveInDate: (v: string) => void
  onKeyLoc: (v: string) => void
  onRunAction: (action: HateoasAction) => void
  onConfirmMoveIn: () => void
  onOpenMoveIn: () => void
}) {
  const actions = buildApplicationActions({
    applicationId: application.id,
    stage: application.stage,
    creditCheck: application.creditCheck,
    creditConsent: application.creditConsent,
    actor: actor as Parameters<typeof buildApplicationActions>[0]['actor'],
  })

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Current application</h2>
        <p className="mt-1 text-sm text-ink-500">
          Apartment under review and position in the system lifecycle.
        </p>

        {property ? (
          <Link
            to={`/workspace/properties/${property.id}`}
            className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-primary-100 bg-primary-50/50 px-4 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MapPin className="h-4 w-4 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{property.title}</span>
              <span className="text-xs text-ink-500">
                {property.suburb}, {property.city}
                {property.rent ? ` · ${formatZAR(property.rent)}/mo` : ''}
              </span>
            </span>
            <Badge tone={statusTone(application.stage)}>{application.stage}</Badge>
          </Link>
        ) : null}

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Meta label="Type" value={application.type} />
          <Meta label="Agent" value={agentName ?? 'Unassigned'} />
          <Meta label="Progress" value={`${application.progress}%`} tabular />
        </dl>

        <div className="mt-5 rounded-xl border border-primary-100 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            System lifecycle
          </p>
          <StageRail
            stages={[...APPLICATION_STAGES]}
            current={application.stage}
            embedded
          />
        </div>

        {application.keyCollection && (
          <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50 p-3 text-sm">
            <p className="font-semibold text-ink">
              <KeyRound className="mr-1 inline h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Key collection
            </p>
            <p className="mt-1 text-ink-600">{application.keyCollection.location}</p>
            <p className="text-ink-500">{application.keyCollection.instructions}</p>
          </div>
        )}
      </Card>

      {canReview && (
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Workflow actions</h2>
          <p className="mt-1 text-sm text-ink-500">Advance or resolve this application.</p>
          <div className="mt-4 space-y-2">
            {actions.map((action) => (
              <Button
                key={action.key}
                className="min-h-11 w-full justify-start"
                variant={
                  action.tone === 'danger' || action.tone === 'ghost'
                    ? 'ghost'
                    : action.tone === 'secondary'
                      ? 'secondary'
                      : 'primary'
                }
                onClick={() => {
                  if (action.key === 'SCHEDULE_MOVE_IN') {
                    onOpenMoveIn()
                    return
                  }
                  if (action.confirm && !window.confirm(action.confirm)) return
                  onRunAction(action)
                }}
              >
                {action.key === 'APPROVE_CREDIT' && (
                  <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                )}
                {action.key === 'COMPLETE_KEY_HANDOVER' && (
                  <KeyRound className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                )}
                {action.key === 'OPEN_CHECKOUT' && (
                  <Wallet className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                )}
                {action.label}
              </Button>
            ))}
            {!actions.length && (
              <p className="text-sm text-ink-500">No actions available at this stage.</p>
            )}
          </div>

          {moveInOpen && (
            <div className="mt-4 space-y-2 rounded-xl border border-accent/30 bg-accent-50 p-3">
              <Input
                type="date"
                className="min-h-11"
                value={moveInDate}
                onChange={(e) => onMoveInDate(e.target.value)}
              />
              <Input
                className="min-h-11"
                value={keyLoc}
                onChange={(e) => onKeyLoc(e.target.value)}
                placeholder="Key collection location"
              />
              <Button className="min-h-11 w-full" onClick={onConfirmMoveIn}>
                Confirm move-in
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function Meta({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="rounded-xl border border-primary-50 px-3 py-2">
      <dt className="text-[11px] font-medium text-ink-400">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-semibold text-ink', tabular && 'tabular')}>{value}</dd>
    </div>
  )
}
