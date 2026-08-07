import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { useAuth, usePropertyScope } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { ActionButtonRow } from '../../components/ActionButtonRow'
import { BackButton } from '../../components/BackButton'
import {
  MaintenanceTicketForm,
  type EditTicketInput,
} from '../../components/maintenance/MaintenanceTicketForm'
import { Button, Card } from '../../components/ui'
import { getLookups } from '../../lib/lookups'
import { readReturnTo } from '../../lib/returnTo'
import { useSuiteAlert } from '../../components/alerts/SuiteAlert'

const FORM_ID = 'maintenance-edit-form'

export default function MaintenanceEditPage() {
  const { id } = useParams()
  const { state, updateMaintenanceTicketDetails, assignContractorToTicket, updateTicket } = useStore()
  const { user, has, role, agencyId } = useAuth()
  const { ticketVisible, canMutate } = usePropertyScope()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const alert = useSuiteAlert()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ticket = state.tickets.find((t) => t.id === id)
  const returnTo =
    readReturnTo(searchParams) ??
    (id ? `/workspace/operations/maintenance/${encodeURIComponent(id)}` : '/workspace/operations/maintenance')

  const properties = useMemo(() => {
    if (!ticket) return []
    const p = state.properties.find((x) => x.id === ticket.propertyId)
    return p ? [p] : []
  }, [ticket, state.properties])

  const categories = useMemo(
    () => getLookups(state.lookups, agencyId, 'TICKET_CATEGORY'),
    [state.lookups, agencyId],
  )

  const canManage = has('maintenance.manage') && ticket && (canMutate(ticket.propertyId) || role === 'contractor')
  const canEdit =
    ticket &&
    (canManage ||
      (has('contractors.manage') && canMutate(ticket.propertyId)) ||
      (role === 'tenant' && ticket.reportedByUserId === user.id))

  if (!ticket || !ticketVisible(ticket)) {
    return <Navigate to="/workspace/operations/maintenance" replace />
  }

  if (!canEdit) {
    return <Navigate to={returnTo} replace />
  }

  const handleSubmit = (input: EditTicketInput) => {
    setBusy(true)
    const selectedAsset = state.internalAssets.find((a) => a.id === input.assetId)
    updateMaintenanceTicketDetails(ticket.id, {
      title: input.title,
      description: input.description,
      priority: input.priority,
      categoryKey: input.categoryKey,
      locationDetail: input.locationDetail,
      accessNotes: input.accessNotes,
      preferredSchedule: input.preferredSchedule,
      internalAssetId: input.assetId,
      assetLabel: selectedAsset?.itemName ?? ticket.assetLabel,
      estimatedCost: input.estimatedCost ?? null,
      issueTags: input.issueTags,
      photoUrls: input.photoUrls,
      photos: input.photoUrls?.length ?? 0,
    })

    if (input.contractorId !== (ticket.contractorId ?? '')) {
      if (input.contractorId) {
        const ok = assignContractorToTicket({
          ticketId: ticket.id,
          contractorUserId: input.contractorId,
          actorUserId: user.id,
        })
        if (!ok) {
          setBusy(false)
          setError('That contractor is not on the agency approved roster.')
          return
        }
      } else {
        updateTicket(ticket.id, { contractorId: null, contractorAssignedAt: null })
      }
    }

    setBusy(false)
    void alert.success({
      title: 'Maintenance updated',
      text: `"${input.title}" was saved.`,
    })
    navigate(returnTo)
  }

  return (
    <RequirePermission permission="maintenance.view">
      <div className="animate-fade-in">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              Edit maintenance
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-500">
              Update location, access, photos, linked assets, and contractor assignment for{' '}
              <span className="font-medium text-ink">{ticket.title}</span>.
            </p>
          </div>
          <ActionButtonRow className="sm:w-auto">
            <BackButton to={returnTo} label="Back to record" />
          </ActionButtonRow>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-primary-100 bg-primary-50/40 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-ink">Record details</h2>
            <p className="mt-0.5 text-sm text-ink-500">{ticket.id} · {properties[0]?.title ?? ticket.propertyId}</p>
          </div>
          <div className="p-5 sm:p-6">
            <MaintenanceTicketForm
              mode="edit"
              formId={FORM_ID}
              ticket={ticket}
              properties={properties}
              assets={state.internalAssets}
              categories={categories}
              agencyId={agencyId}
              onSubmitEdit={handleSubmit}
              error={error}
            />
          </div>
          <ActionButtonRow className="border-t border-primary-100 bg-primary-50/30 px-5 py-4">
            <Button className="min-h-11 cursor-pointer" form={FORM_ID} type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
            <Link to={returnTo}>
              <Button variant="secondary" className="min-h-11 cursor-pointer" disabled={busy}>
                Cancel
              </Button>
            </Link>
          </ActionButtonRow>
        </Card>
      </div>
    </RequirePermission>
  )
}

export function maintenanceEditHref(ticketId: string, returnTo?: string): string {
  const base = `/workspace/operations/maintenance/${encodeURIComponent(ticketId)}/edit`
  if (!returnTo) return base
  return `${base}?returnTo=${encodeURIComponent(returnTo)}`
}
