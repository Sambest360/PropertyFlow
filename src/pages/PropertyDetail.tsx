import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { BackButton } from '../components/BackButton'
import { Card } from '../components/ui'
import { normalizeApplication } from '../lib/applicationWorkflow'
import { rolePermissions } from '../lib/permissions'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { PropertyDetailHeader } from '../components/property-detail/PropertyDetailHeader'
import { PropertyOverviewPanel } from '../components/property-detail/PropertyOverviewPanel'
import { PropertyMapPanel } from '../components/property-detail/PropertyMapPanel'
import { PropertyFloorPlanPanel } from '../components/property-detail/PropertyFloorPlanPanel'
import { PropertyInventoryPanel } from '../components/property-detail/PropertyInventoryPanel'
import { PropertyApplicantsPanel } from '../components/property-detail/PropertyApplicantsPanel'
import { PropertyViewingsPanel } from '../components/property-detail/PropertyViewingsPanel'
import { PropertyMaintenancePanel } from '../components/property-detail/PropertyMaintenancePanel'
import { PropertyPaymentsPanel } from '../components/property-detail/PropertyPaymentsPanel'
import { PropertyDocumentsPanel } from '../components/property-detail/PropertyDocumentsPanel'
import { PropertyMessagesPanel } from '../components/property-detail/PropertyMessagesPanel'
import { PropertyHistoryTimeline } from '../components/property-detail/PropertyHistoryTimeline'
import { PropertySyndicationPanel } from '../components/syndication/PropertySyndicationPanel'
import { siblingUnitsInBuilding } from '../lib/buildingHierarchy'
import {
  isPropertyDetailTab,
  type PropertyDetailTab,
} from '../components/property-detail/types'
import type { AssetCondition } from '../data/infrastructure'
import { isVerificationApproved } from '../lib/verification'
import { validatePropertyReadyToPublish } from '../lib/propertyStatus'
import {
  canDeletePropertyRole,
  getPropertyDeleteBlockReason,
  isPropertyDeleted,
} from '../lib/propertyDeletion'
import { sweetConfirm, sweetSuccess, sweetWarning } from '../lib/sweetAlert'

export default function PropertyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const {
    state,
    updateProperty,
    publishProperty,
    deleteProperty,
    restoreProperty,
    updateInternalAsset,
    addInternalAsset,
    removeInternalAsset,
    updateInfraRoom,
    addInfraRoom,
    removeInfraRoom,
    patchMaintenanceTicket,
    updateTicket,
    removeTicket,
    approveApplication,
    advanceApplicationWorkflow,
    updateApplication,
    blockApplication,
    setDocumentStatus,
    updateViewing,
    createViewingSlot,
    updateViewingSlot,
    removeViewingSlot,
    transferViewingSlot,
    createPayment,
    createThread,
    sendMessage,
    addPropertyEvent,
  } = useStore()
  const { has, user } = useAuth()
  const { inPropertyScope } = usePropertyScope()
  const alert = useSuiteAlert()
  const reviewPermissions = rolePermissions[user.role] ?? []

  const p = state.properties.find((x) => x.id === id)

  const inScope = useMemo(() => {
    if (!p) return false
    return inPropertyScope(p.id)
  }, [p, inPropertyScope])

  const tabParam = params.get('tab')
  const tab: PropertyDetailTab = isPropertyDetailTab(tabParam) ? tabParam : 'overview'
  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === 'overview') sp.delete('tab')
    else sp.set('tab', next)
    setParams(sp, { replace: true })
  }

  const unit = useMemo(
    () => (p?.unitId ? state.units.find((u) => u.id === p.unitId) : undefined),
    [p, state.units],
  )
  const building = useMemo(
    () => (p?.buildingId ? state.buildings.find((b) => b.id === p.buildingId) : undefined),
    [p, state.buildings],
  )
  const siblingUnits = useMemo(() => {
    if (!p?.buildingId) return []
    return siblingUnitsInBuilding(
      state.properties.filter((x) => !isPropertyDeleted(x) && inPropertyScope(x.id)),
      p.buildingId,
      p.id,
    )
  }, [p, state.properties, inPropertyScope])
  const rooms = useMemo(
    () => (unit ? state.infraRooms.filter((r) => r.unitId === unit.id) : []),
    [state.infraRooms, unit],
  )
  const assets = useMemo(
    () => (unit ? state.internalAssets.filter((a) => a.unitId === unit.id) : []),
    [state.internalAssets, unit],
  )
  const apps = useMemo(
    () => (p ? state.applications.filter((a) => a.propertyId === p.id) : []),
    [state.applications, p],
  )
  const tickets = useMemo(
    () => (p ? state.tickets.filter((t) => t.propertyId === p.id) : []),
    [state.tickets, p],
  )
  const viewings = useMemo(
    () => (p ? state.viewings.filter((v) => v.propertyId === p.id) : []),
    [state.viewings, p],
  )
  const viewingSlots = useMemo(
    () => (p ? state.viewingSlots.filter((s) => s.propertyId === p.id) : []),
    [state.viewingSlots, p],
  )
  const payments = useMemo(
    () => (p ? state.payments.filter((pay) => pay.propertyId === p.id) : []),
    [state.payments, p],
  )
  const threads = useMemo(
    () => (p ? state.threads.filter((t) => t.propertyId === p.id) : []),
    [state.threads, p],
  )
  const threadIds = useMemo(() => new Set(threads.map((t) => t.id)), [threads])
  const messages = useMemo(
    () => state.messages.filter((m) => threadIds.has(m.threadId)),
    [state.messages, threadIds],
  )
  const events = useMemo(
    () => (p ? state.propertyEvents.filter((e) => e.propertyId === p.id) : []),
    [state.propertyEvents, p],
  )

  const landlord = p ? state.users.find((u) => u.id === p.landlordId) : undefined
  const agent = p ? state.users.find((u) => u.id === p.agentId) : undefined
  const agents = state.users.filter(
    (u) =>
      u.agencyId === p?.agencyId &&
      u.active &&
      (u.role === 'agent' ||
        u.role === 'ground_agent' ||
        u.role === 'agent_admin' ||
        u.role === 'client_admin'),
  )

  const contractors = state.users.filter(
    (u) =>
      u.active &&
      u.role === 'contractor' &&
      isVerificationApproved(u.verification, u.role) &&
      (u.agencyId === p?.agencyId || !u.agencyId),
  )

  const canManage = has('assets.manage')
  const canAdminDelete = canManage && canDeletePropertyRole(user.role)
  const deleteBlockedReason = p
    ? getPropertyDeleteBlockReason(p, state.tenancies, state.applications)
    : null
  const canPublishListing = has('listings.publish') && isVerificationApproved(user.verification, user.role)
  const [publishBusy, setPublishBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const canReview = has('applications.review')
  const canMaintenance = has('maintenance.manage')
  const canPayments = has('payments.manage')
  const canMessages = has('messages.manage')
  const canDocs = has('documents.view') || canManage

  if (!p) {
    return (
      <Card className="p-10 text-center">
        <p className="font-semibold">Property not found</p>
        <div className="mt-3 flex justify-center">
          <BackButton to="/workspace/properties" label="Back to properties" />
        </div>
      </Card>
    )
  }

  if (!inScope) {
    return <Navigate to="/workspace/properties" replace />
  }

  const openTickets = tickets.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled').length
  const openSlots = viewingSlots.filter((s) => s.status === 'Open').length
  const waitingApps = apps.filter((a) => a.stage !== 'Active Tenancy' && a.stage !== 'Keys Handed Over').length
  const overduePayments = payments.filter((pay) => pay.status === 'Due' || pay.status === 'Overdue').length
  const acceptedDocCount = apps
    .filter((a) =>
      [
        'Approved',
        'Awaiting Payment',
        'Deposit Paid',
        'Lease Signed',
        'Move-In Scheduled',
        'Keys Handed Over',
        'Active Tenancy',
      ].includes(a.stage),
    )
    .reduce((n, a) => n + a.documents.length, 0)

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'map', label: 'Map' },
    { id: 'floorplan', label: 'Floor plan', count: rooms.length },
    { id: 'inventory', label: 'Inventory', count: assets.length },
    { id: 'applicants', label: 'Applicants', count: waitingApps },
    { id: 'viewings', label: 'Viewings', count: openSlots },
    { id: 'maintenance', label: 'Maintenance', count: openTickets },
    { id: 'payments', label: 'Payments', count: overduePayments },
    { id: 'documents', label: 'Documents', count: acceptedDocCount },
    { id: 'messages', label: 'Messages', count: threads.length },
    { id: 'portals', label: 'Portals' },
    { id: 'history', label: 'History', count: events.length },
  ]

  const publishBlockedReason = validatePropertyReadyToPublish(p)

  const handleMakeLive = async () => {
    const blockReason = validatePropertyReadyToPublish(p)
    if (blockReason) {
      await sweetWarning('Not ready to publish', blockReason)
      return
    }
    setPublishBusy(true)
    try {
      const published = await publishProperty(p.id, 'Published')
      if (!published) {
        await sweetWarning(
          'Could not publish',
          'The listing status did not save. Try again from this page.',
        )
        return
      }
      await sweetSuccess('Listing is live', `${p.title} is now visible on the marketplace.`)
    } finally {
      setPublishBusy(false)
    }
  }

  const handleDelete = async () => {
    if (deleteBlockedReason) {
      await sweetWarning('Cannot delete', deleteBlockedReason)
      return
    }
    const ok = await sweetConfirm(
      'Delete property?',
      `“${p.title}” will be removed from your active portfolio. You can restore it from Deleted properties.`,
      'Delete property',
    )
    if (!ok) return
    setDeleteBusy(true)
    try {
      const result = deleteProperty(p.id)
      if (result.ok === false) {
        await sweetWarning('Could not delete', result.reason)
        return
      }
      await sweetSuccess('Property deleted', `${p.title} was moved to the archive.`)
      navigate('/workspace/properties/archive')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleRestore = async () => {
    const ok = await sweetConfirm(
      'Restore property?',
      `“${p.title}” will return as a draft listing.`,
      'Restore',
    )
    if (!ok) return
    setDeleteBusy(true)
    try {
      const result = restoreProperty(p.id)
      if (result.ok === false) {
        await sweetWarning('Could not restore', result.reason)
        return
      }
      await sweetSuccess('Property restored', `${p.title} is back as a draft.`)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <PropertyDetailHeader
        property={p}
        occupancy={unit?.statusKey}
        unitLabel={unit?.unitNumber}
        buildingName={building?.name}
        buildingGrading={building?.grading}
        buildingAddress={building?.addressLine1}
        unitCount={building ? siblingUnits.length + 1 : undefined}
        siblingUnits={siblingUnits}
        canManage={canManage}
        canPublish={canPublishListing}
        publishBlockedReason={publishBlockedReason}
        onPublish={handleMakeLive}
        publishBusy={publishBusy}
        canDelete={canAdminDelete}
        deleteBlockedReason={deleteBlockedReason}
        onDelete={handleDelete}
        onRestore={isPropertyDeleted(p) ? handleRestore : undefined}
        deleteBusy={deleteBusy}
        onToggleFeatured={() => updateProperty(p.id, { featured: !p.featured })}
      />

      <div className="sticky top-0 z-20 -mx-1 mb-5 bg-white/95 px-1 backdrop-blur-md">
        <DashboardTabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {tab === 'overview' && (
        <PropertyOverviewPanel
          property={p}
          occupancy={unit?.statusKey}
          agent={agent}
          landlord={landlord}
          roomCount={rooms.length}
          assetCount={assets.length}
          appCount={apps.length}
        />
      )}

      {tab === 'map' && <PropertyMapPanel property={p} />}

      {tab === 'floorplan' && (
        <PropertyFloorPlanPanel
          rooms={rooms}
          assets={assets}
          unitId={p.unitId}
          clientId={p.agencyId}
          canManage={canManage}
          onUpdateRoom={updateInfraRoom}
          onAddRoom={(input) => {
            addInfraRoom(input)
            addPropertyEvent({
              agencyId: p.agencyId,
              propertyId: p.id,
              actorUserId: user.id,
              actorName: user.name,
              action: 'added a Room',
              changes: [{ field: 'Room', from: 'None', to: input.name }],
            })
          }}
          onRemoveRoom={(roomId) => {
            const room = rooms.find((r) => r.id === roomId)
            removeInfraRoom(roomId)
            if (room) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'deleted a Room',
                changes: [{ field: 'Room', from: room.name, to: 'Removed' }],
              })
            }
          }}
        />
      )}

      {tab === 'inventory' && (
        <PropertyInventoryPanel
          assets={assets}
          rooms={rooms}
          unitId={p.unitId}
          clientId={p.agencyId}
          canManage={canManage}
          onUpdate={updateInternalAsset}
          onAdd={(input) => {
            addInternalAsset(input)
            addPropertyEvent({
              agencyId: p.agencyId,
              propertyId: p.id,
              actorUserId: user.id,
              actorName: user.name,
              action: 'added an Inventory item',
              changes: [{ field: 'Asset', from: 'None', to: input.itemName }],
            })
          }}
          onRemove={(assetId) => {
            const asset = assets.find((a) => a.id === assetId)
            removeInternalAsset(assetId)
            if (asset) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'deleted an Inventory item',
                changes: [{ field: 'Asset', from: asset.itemName, to: 'Removed' }],
              })
            }
          }}
        />
      )}

      {tab === 'applicants' && (
        <PropertyApplicantsPanel
          applications={apps}
          canReview={canReview}
          reviewPermissions={reviewPermissions}
          leaseExistsForApplication={(appId) =>
            state.tenancies.some((t) => t.applicationId === appId)
          }
          onAdvance={async (appId, targetStatus) => {
            const result = await advanceApplicationWorkflow({
              applicationId: appId,
              actorUserId: user.id,
              targetStatus,
            })
            if (result.status === 'ERROR') {
              await alert.success({
                title: 'Could not advance',
                text: result.error ?? 'This workflow step is not available yet.',
                tone: 'danger',
              })
              return
            }
            const prev = apps.find((a) => a.id === appId)
            if (prev && result.application.stage !== prev.stage) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'advanced an Application',
                changes: [{ field: 'Stage', from: prev.stage, to: result.application.stage }],
              })
            }
            await alert.success({
              title: 'Application updated',
              text: result.application.stage,
            })
          }}
          onApprove={async (appId) => {
            // P0-approve: approveApplication now awaits the durable write and
            // returns ERROR when it fails, so the success dialog (and the
            // property-event log entry) only run after the stage is committed.
            const result = await approveApplication(appId)
            if (result.status === 'ERROR') {
              await alert.success({
                title: 'Approval failed',
                text: result.error ?? 'Could not approve this application.',
                tone: 'danger',
              })
              return
            }
            const prev = apps.find((a) => a.id === appId)
            if (prev) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'approved an Applicant',
                changes: [{ field: 'Stage', from: prev.stage, to: result.application.stage }],
              })
            }
            await alert.success({
              title: 'Applicant approved',
              text: 'Deposit invoice and lease steps are ready on the application profile.',
            })
          }}
          onSetDocStatus={setDocumentStatus}
          onSetWorkflowStage={(appId, workflowStatus) => {
            const prev = apps.find((a) => a.id === appId)
            if (!prev) return
            const updated = normalizeApplication({ ...prev, workflowStatus })
            updateApplication(appId, {
              workflowStatus: updated.workflowStatus,
              stage: updated.stage,
              progress: updated.progress,
              documents: updated.documents,
              docs: updated.docs,
            })
            if (prev.stage !== updated.stage) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'changed the Application stage',
                changes: [{ field: 'Stage', from: prev.stage, to: updated.stage }],
              })
            }
          }}
          onBlock={(appId, reason) => {
            const prev = apps.find((a) => a.id === appId)
            blockApplication(appId, reason)
            if (prev) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'blocked an Applicant',
                changes: [
                  { field: 'Stage', from: prev.stage, to: 'Blocked' },
                  { field: 'Reason', from: '—', to: reason },
                ],
              })
            }
          }}
        />
      )}

      {tab === 'viewings' && (
        <PropertyViewingsPanel
          slots={viewingSlots}
          viewings={viewings}
          agencyId={p.agencyId}
          propertyId={p.id}
          agentId={p.agentId}
          agents={agents}
          canManage={canManage}
          onCreateSlot={createViewingSlot}
          onUpdateSlot={updateViewingSlot}
          onUpdateAttendee={updateViewing}
          onRemoveSlot={(slotId) => {
            const slot = viewingSlots.find((s) => s.id === slotId)
            removeViewingSlot(slotId)
            if (slot) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'deleted a Viewing slot',
                changes: [
                  {
                    field: 'Slot',
                    from: slot.title?.trim() || `${slot.date} ${slot.time}`,
                    to: 'Removed',
                  },
                ],
              })
            }
          }}
          onTransferSlot={(fromSlotId, toSlotId) => {
            const from = viewingSlots.find((s) => s.id === fromSlotId)
            const to = viewingSlots.find((s) => s.id === toSlotId)
            const ok = transferViewingSlot(fromSlotId, toSlotId)
            if (ok && from && to) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'transferred a Viewing slot',
                changes: [
                  {
                    field: 'From',
                    from: from.title?.trim() || `${from.date} ${from.time}`,
                    to: to.title?.trim() || `${to.date} ${to.time}`,
                  },
                ],
              })
            }
            return ok
          }}
        />
      )}

      {tab === 'maintenance' && (
        <PropertyMaintenancePanel
          propertyId={p.id}
          tickets={tickets}
          unitId={p.unitId}
          agents={agents}
          contractors={contractors}
          canManage={canMaintenance}
          onUpdate={(ticketId, patch) => {
            const prev = tickets.find((t) => t.id === ticketId)
            updateTicket(ticketId, patch)
            if (prev && patch.status && patch.status !== prev.status) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'changed the Maintenance status',
                changes: [{ field: 'Status', from: prev.status, to: patch.status }],
              })
            }
          }}
          onComplete={(ticketId, fields) => {
            const prev = tickets.find((t) => t.id === ticketId)
            const result = patchMaintenanceTicket({
              actorUserId: user.id,
              ticketId,
              patch: {
                status: 'RESOLVED',
                actual_cost: fields.cost,
                resolution_notes: fields.workNotes.trim(),
                contractor_id: fields.contractorId,
                photos: fields.photos,
                internal_asset_condition: fields.condition as AssetCondition,
              },
            })
            if (result.status === 'ERROR') return result.error
            if (prev) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'resolved maintenance',
                changes: [{ field: 'Status', from: prev.status, to: 'Completed' }],
              })
            }
            return null
          }}
          onRemove={(ticketId) => {
            const prev = tickets.find((t) => t.id === ticketId)
            const ok = removeTicket(ticketId)
            if (ok && prev) {
              addPropertyEvent({
                agencyId: p.agencyId,
                propertyId: p.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'deleted maintenance',
                changes: [{ field: 'Ticket', from: prev.title, to: 'Removed' }],
              })
            }
            return ok
          }}
        />
      )}

      {tab === 'payments' && (
        <PropertyPaymentsPanel
          payments={payments}
          agencyId={p.agencyId}
          propertyId={p.id}
          canManage={canPayments}
          onCreate={createPayment}
        />
      )}

      {tab === 'documents' && canDocs && (
        <PropertyDocumentsPanel
          propertyDocuments={state.propertyDocuments.filter((d) => d.propertyId === p.id)}
          applications={apps}
          canManage={canManage}
          onUpdateDoc={(applicationId, key, status, note) =>
            setDocumentStatus(applicationId, key, status, note)
          }
        />
      )}

      {tab === 'messages' && (
        <PropertyMessagesPanel
          threads={threads}
          messages={messages}
          users={state.users}
          agencyId={p.agencyId}
          propertyId={p.id}
          currentUser={user}
          canManage={canMessages}
          onCreateThread={(subject, body) => {
            const thread = createThread({
              agencyId: p.agencyId,
              propertyId: p.id,
              applicationId: null,
              subject,
              participantIds: [user.id, ...(p.agentId ? [p.agentId] : [])].filter(
                (v, i, arr) => arr.indexOf(v) === i,
              ),
              routesTo: 'agent',
              initialMessage: body,
              fromUserId: user.id,
            })
            addPropertyEvent({
              agencyId: p.agencyId,
              propertyId: p.id,
              actorUserId: user.id,
              actorName: user.name,
              action: 'started a Message thread',
              changes: [{ field: 'Thread', from: 'None', to: subject }],
            })
            void thread
          }}
          onSend={(threadId, body) => sendMessage(threadId, user.id, body)}
        />
      )}

      {tab === 'portals' && (
        <PropertySyndicationPanel
          property={p}
          canManage={canManage}
          onPropertyPatch={(patch) => updateProperty(p.id, patch)}
        />
      )}

      {tab === 'history' && (
        <PropertyHistoryTimeline events={events} propertyTitle={p.title} />
      )}
    </div>
  )
}
