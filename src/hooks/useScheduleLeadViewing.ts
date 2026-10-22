import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateViewingPayload } from '../components/viewings/CreateViewingModal'
import { LEAD_STAGES } from '../components/lead-detail/types'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { leadToViewingGuest, leadViewingDeskHref } from '../lib/leadViewing'
import type { Lead, PropertyAsset, Viewing } from '../types/domain'

const VIEWING_SCHEDULED_STAGE = 'Viewing Scheduled'

function shouldAdvanceToViewingScheduled(stage: string): boolean {
  const idx = LEAD_STAGES.indexOf(stage as (typeof LEAD_STAGES)[number])
  const target = LEAD_STAGES.indexOf(VIEWING_SCHEDULED_STAGE)
  if (target < 0) return false
  if (idx < 0) return true
  return idx < target
}

export function useScheduleLeadViewing(lead: Lead, property: PropertyAsset | null) {
  const navigate = useNavigate()
  const { user, has, agencyId } = useAuth()
  const { canMutate } = usePropertyScope()
  const {
    state,
    bookViewingSlot,
    createViewingSlot,
    createViewing,
    addActivity,
    addPropertyEvent,
    updateLeadStage,
  } = useStore()
  const [modalOpen, setModalOpen] = useState(false)

  const canSchedule = Boolean(
    property && has('viewings.manage') && canMutate(lead.propertyId),
  )

  const afterBooked = useCallback(
    (viewing: Viewing) => {
      addActivity(
        `Scheduled viewing for ${lead.name} · ${viewing.date} ${viewing.time}`,
        user.name,
        lead.agencyId,
      )
      addPropertyEvent({
        agencyId: lead.agencyId,
        propertyId: lead.propertyId,
        actorUserId: user.id,
        actorName: user.name,
        action: 'scheduled a Viewing for lead',
        changes: [
          { field: 'Lead', from: lead.id, to: lead.name },
          { field: 'When', from: '—', to: `${viewing.date} ${viewing.time}` },
        ],
      })
      if (has('leads.manage') && shouldAdvanceToViewingScheduled(lead.stage)) {
        updateLeadStage(lead.id, VIEWING_SCHEDULED_STAGE)
      }
      setModalOpen(false)
      navigate(leadViewingDeskHref(viewing))
    },
    [
      lead,
      user.id,
      user.name,
      addActivity,
      addPropertyEvent,
      has,
      updateLeadStage,
      navigate,
    ],
  )

  const bookOntoSlot = useCallback(
    (slotId: string) => {
      const guest = leadToViewingGuest(lead)
      const created = bookViewingSlot(slotId, guest.name, guest.email)
      if (created) afterBooked(created)
      return created
    },
    [lead, bookViewingSlot, afterBooked],
  )

  const submitCreate = useCallback(
    (payload: CreateViewingPayload) => {
      if (!agencyId || !property || !canMutate(property.id)) return

      let lastViewing: Viewing | null = null

      if (payload.mode === 'slot') {
        const slot = createViewingSlot({
          agencyId,
          propertyId: property.id,
          agentId: payload.agentId,
          date: payload.date,
          time: payload.time,
          capacity: payload.capacity,
          title: payload.title || undefined,
          notes: payload.notes || undefined,
          durationMinutes: payload.durationMinutes,
        })
        for (const guest of payload.guests) {
          const v = bookViewingSlot(slot.id, guest.name, guest.email)
          if (v) lastViewing = v
        }
      } else {
        for (const guest of payload.guests) {
          lastViewing = createViewing({
            agencyId,
            propertyId: property.id,
            agentId: payload.agentId,
            applicantName: guest.name,
            applicantEmail: guest.email,
            date: payload.date,
            time: payload.time,
            notes: payload.notes || undefined,
          })
        }
      }

      if (lastViewing) afterBooked(lastViewing)
    },
    [
      agencyId,
      property,
      canMutate,
      createViewingSlot,
      bookViewingSlot,
      createViewing,
      afterBooked,
    ],
  )

  const agents = useMemo(
    () =>
      state.users.filter(
        (u) =>
          (u.role === 'ground_agent' || u.role === 'agent_admin' || u.role === 'agent') &&
          (has('platform.manage') || u.agencyId === agencyId),
      ),
    [state.users, has, agencyId],
  )

  const openSchedule = useCallback(() => {
    if (!canSchedule) return
    setModalOpen(true)
  }, [canSchedule])

  return {
    canSchedule,
    modalOpen,
    setModalOpen,
    openSchedule,
    bookOntoSlot,
    submitCreate,
    viewingSlots: state.viewingSlots,
    viewings: state.viewings,
    agents,
    properties: property ? [property] : [],
  }
}
