import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { scoreAssetHealth } from '../lib/api/ticketsApi'
import { isWarrantyCovered } from '../lib/maintenanceApi'
import type { AssetCondition } from '../data/infrastructure'
import type { MaintenanceTicket } from '../types/domain'
import type { TicketCompletionFields } from '../lib/maintenanceApi'
import { CompleteTicketModal } from '../components/maintenance/CompleteTicketModal'
import { MaintenanceDetailHeader } from '../components/maintenance-detail/MaintenanceDetailHeader'
import { MaintenanceOverviewPanel } from '../components/maintenance-detail/MaintenanceOverviewPanel'
import {
  resolveUserName,
  ticketAgeHours,
  urgencyScore,
  type PortfolioTicket,
} from '../components/maintenance/types'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { isVerificationApproved } from '../lib/verification'

export default function MaintenanceDetail() {
  const { id } = useParams()
  const {
    state,
    patchMaintenanceTicket,
    updateTicket,
    addPropertyEvent,
  } = useStore()
  const { user, has, role } = useAuth()
  const { ticketVisible, canMutate, agencyId } = usePropertyScope()
  const alert = useSuiteAlert()
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
    () =>
      state.users.filter(
        (u) =>
          u.role === 'contractor' &&
          u.active &&
          isVerificationApproved(u.verification, u.role) &&
          (has('platform.manage') || u.agencyId === agencyId),
      ),
    [state.users, has, agencyId],
  )

  if (!ticket || !item) return <Navigate to="/workspace/operations/maintenance" replace />
  if (!inScope) return <Navigate to="/workspace/operations/maintenance" replace />

  const canManage = has('maintenance.manage')

  const changeStatus = (ticketId: string, next: MaintenanceTicket['status']) => {
    if (next === 'Completed') {
      setCompleteOpen(true)
      return
    }
    const prev = state.tickets.find((t) => t.id === ticketId)
    if (!prev || prev.status === next) return
    if (!canMutate(prev.propertyId) && role !== 'contractor' && role !== 'tenant') return
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

  const submitCompletion = (fields: TicketCompletionFields): string | null => {
    const prev = item.ticket
    const result = patchMaintenanceTicket({
      actorUserId: user.id,
      ticketId: prev.id,
      patch: {
        status: 'RESOLVED',
        actual_cost: fields.cost,
        resolution_notes: fields.workNotes.trim(),
        contractor_id: fields.contractorId,
        photos: fields.photos,
        internal_asset_condition: fields.condition,
      },
    })
    if (result.status === 'ERROR') return result.error
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
          onComplete={() => setCompleteOpen(true)}
        />

        <MaintenanceOverviewPanel
          item={item}
          canManage={canManage}
          contractors={contractors}
          onUpdateStatus={changeStatus}
          onAssignContractor={(ticketId, contractorId) =>
            updateTicket(ticketId, { contractorId })
          }
          onRequestComplete={() => setCompleteOpen(true)}
        />

        <CompleteTicketModal
          open={completeOpen}
          ticket={item.ticket}
          propertyTitle={item.property.title}
          contractors={contractors}
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
