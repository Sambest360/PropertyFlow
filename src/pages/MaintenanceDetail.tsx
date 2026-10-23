import { useMemo, useState } from 'react'
import { checkTicketPhotos } from '../lib/photoLimits'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { scoreAssetHealth } from '../lib/api/ticketsApi'
import { isWarrantyCovered } from '../lib/maintenanceApi'
import type { AssetCondition } from '../data/infrastructure'
import type { MaintenanceTicket } from '../types/domain'
import type { TicketCompletionFields } from '../lib/maintenanceApi'
import { CompleteTicketModal } from '../components/maintenance/CompleteTicketModal'
import { maintenanceEditHref } from './maintenance/MaintenanceEditPage'
import { MaintenanceDetailHeader } from '../components/maintenance-detail/MaintenanceDetailHeader'
import { MaintenanceOverviewPanel } from '../components/maintenance-detail/MaintenanceOverviewPanel'
import { ContractorMaintenancePreview } from '../components/maintenance-detail/ContractorMaintenancePreview'
import {
  resolveUserName,
  ticketAgeHours,
  urgencyScore,
  type PortfolioTicket,
} from '../components/maintenance/types'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { TicketResponsibilityCard } from '../components/maintenance/TicketResponsibilityCard'
import { canContractorClaimTicket, listApprovedContractors } from '../lib/contractors'
import { isVerificationPending } from '../lib/verification'

export default function MaintenanceDetail() {
  const { id } = useParams()
  const {
    state,
    patchMaintenanceTicket,
    updateTicket,
    addPropertyEvent,
    assignContractorToTicket,
    updateMaintenanceTicketDetails,
  } = useStore()
  const { user, has, role, agencyId } = useAuth()
  const { ticketVisible, canMutate } = usePropertyScope()
  const alert = useSuiteAlert()
  const navigate = useNavigate()
  const [completeOpen, setCompleteOpen] = useState(false)

  const ticket = state.tickets.find((t) => t.id === id)

  const item: PortfolioTicket | null = useMemo(() => {
    if (!ticket) return null
    const property = state.properties.find((p) => p.id === ticket.propertyId)
    if (!property) return null
    const asset = ticket.internalAssetId
      ? state.internalAssets.find((a) => a.id === ticket.internalAssetId)
      : undefined
    const warranty = ticket.warrantyCovered ?? isWarrantyCovered(asset)
    const assetHealth = scoreAssetHealth(asset, warranty)
    if (!asset && ticket.assetLabel) {
      assetHealth.item_name = ticket.assetLabel
    }
    return {
      ticket,
      property,
      assetHealth,
      contractorName: resolveUserName(ticket.contractorId, state.users),
      agentName: resolveUserName(ticket.assignedAgentId, state.users),
      urgencyScore: urgencyScore(ticket, assetHealth),
      ageHours: ticketAgeHours(ticket),
    }
  }, [ticket, state.properties, state.internalAssets, state.users])

  const inScope = useMemo(() => {
    if (!item) return false
    return ticketVisible(item.ticket)
  }, [item, ticketVisible])

  const contractors = useMemo(
    () => listApprovedContractors(state.agencyContractors, state.users, agencyId, item?.ticket.categoryKey),
    [state.agencyContractors, state.users, agencyId, item?.ticket.categoryKey],
  )

  if (!ticket || !item) return <Navigate to="/workspace/operations/maintenance" replace />
  if (!inScope) return <Navigate to="/workspace/operations/maintenance" replace />

  const isAssignedContractor = role === 'contractor' && ticket.contractorId === user.id
  const isContractorPreview =
    role === 'contractor' && !ticket.contractorId && ticket.status !== 'Completed' && ticket.status !== 'Cancelled'
  const assignedToOtherContractor =
    role === 'contractor' && ticket.contractorId != null && ticket.contractorId !== user.id

  if (assignedToOtherContractor) {
    return <Navigate to="/workspace/portals/contractor" replace />
  }

  const verificationPending = isVerificationPending(user.verification, user.role)
  const canClaimJob =
    isContractorPreview &&
    !verificationPending &&
    canContractorClaimTicket(user, ticket, state.agencyContractors)

  const acceptJob = async () => {
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
      ticketId: ticket.id,
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

  const canManage =
    (has('maintenance.manage') && canMutate(ticket.propertyId)) ||
    (role === 'contractor' && isAssignedContractor)
  const canAssignContractor =
    (has('contractors.manage') || has('maintenance.manage')) && canMutate(ticket.propertyId)
  const canEdit =
    canManage ||
    (has('contractors.manage') && canMutate(ticket.propertyId)) ||
    (role === 'tenant' && ticket.reportedByUserId === user.id)

  const changeStatus = (ticketId: string, next: MaintenanceTicket['status']) => {
    if (next === 'Completed') {
      setCompleteOpen(true)
      return
    }
    const prev = state.tickets.find((t) => t.id === ticketId)
    if (!prev || prev.status === next) return
    if (!canMutate(prev.propertyId) && role !== 'tenant') {
      if (role !== 'contractor' || prev.contractorId !== user.id) return
    }
    updateTicket(ticketId, { status: next })
    addPropertyEvent({
      agencyId: prev.agencyId,
      propertyId: prev.propertyId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'changed the Maintenance status',
      changes: [{ field: 'Status', from: prev.status, to: next }],
    })
  }

  const handleAssignContractor = (ticketId: string, contractorUserId: string | null) => {
    if (contractorUserId) {
      const ok = assignContractorToTicket({
        ticketId,
        contractorUserId,
        actorUserId: user.id,
      })
      if (!ok) {
        void alert.success({
          title: 'Contractor not approved',
          text: 'That vendor is not on the agency approved roster. Add them from the Contractors page first.',
          tone: 'danger',
        })
        return false
      }
      void alert.success({
        title: 'Contractor booked',
        text: 'The contractor was notified about this job.',
      })
      return true
    }
    updateTicket(ticketId, { contractorId: null, contractorAssignedAt: null })
    return true
  }

  const submitCompletion = (fields: TicketCompletionFields): string | null => {
    const prev = item.ticket
    const mergedPhotos = fields.completionPhotoUrls?.length
      ? [...(prev.photoUrls ?? []), ...fields.completionPhotoUrls]
      : prev.photoUrls
    // Same rule as the server (TICKET_PHOTO_INVALID) before anything is saved.
    if (fields.completionPhotoUrls?.length && mergedPhotos) {
      const check = checkTicketPhotos(mergedPhotos)
      if (check.ok === false) return `Photos not saved: ${check.reason}.`
    }
    const photoCount = fields.completionPhotoUrls?.length ?? fields.photos

    const result = patchMaintenanceTicket({
      actorUserId: user.id,
      ticketId: prev.id,
      patch: {
        status: 'RESOLVED',
        actual_cost: fields.cost,
        resolution_notes: fields.workNotes.trim(),
        contractor_id: fields.contractorId,
        photos: photoCount,
        internal_asset_condition: fields.condition,
      },
    })
    if (result.status === 'ERROR') return result.error

    if (mergedPhotos && mergedPhotos.length !== (prev.photoUrls?.length ?? 0)) {
      updateMaintenanceTicketDetails(prev.id, {
        photoUrls: mergedPhotos,
        photos: mergedPhotos.length,
      })
    }

    addPropertyEvent({
      agencyId: prev.agencyId,
      propertyId: prev.propertyId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'resolved maintenance',
      changes: [
        { field: 'Status', from: prev.status, to: 'Completed' },
        { field: 'Cost', from: String(prev.cost), to: String(fields.cost) },
      ],
    })
    setCompleteOpen(false)
    void alert.success({
      title: 'Maintenance completed',
      text: 'Cost, work notes, contractor, and photos were recorded.',
    })
    return null
  }

  return (
    <RequirePermission permission="maintenance.view">
      <div className="animate-fade-in">
        <MaintenanceDetailHeader
          item={item}
          canManage={canManage}
          canEdit={canEdit && !isContractorPreview}
          onComplete={() => setCompleteOpen(true)}
        />

        {isContractorPreview ? (
          <ContractorMaintenancePreview
            ticket={ticket}
            property={item.property}
            onAccept={() => void acceptJob()}
            acceptDisabled={!canClaimJob}
            acceptHint={
              verificationPending
                ? 'Verification must be approved before accepting jobs.'
                : undefined
            }
          />
        ) : (
          <>
          <div className="mb-4">
            <TicketResponsibilityCard
              ticket={ticket}
              canManage={canManage}
              onChanged={(patch) => updateTicket(ticket.id, patch)}
            />
          </div>
          <MaintenanceOverviewPanel
            item={item}
            canManage={canManage}
            canAssignContractor={canAssignContractor}
            agencyId={agencyId}
            onUpdateStatus={changeStatus}
            onAssignContractor={handleAssignContractor}
            onRequestComplete={() => setCompleteOpen(true)}
            onEdit={
              canEdit
                ? () => navigate(maintenanceEditHref(ticket.id, `/workspace/operations/maintenance/${encodeURIComponent(ticket.id)}`))
                : undefined
            }
          />
          </>
        )}

        <CompleteTicketModal
          open={completeOpen}
          ticket={item.ticket}
          propertyTitle={item.property.title}
          contractors={contractors}
          agencyId={agencyId}
          defaultCondition={
            (item.assetHealth.condition as AssetCondition | null | undefined) ?? 'Good'
          }
          onClose={() => setCompleteOpen(false)}
          onComplete={submitCompletion}
        />
      </div>
    </RequirePermission>
  )
}
