import { CalendarPlus } from 'lucide-react'
import type { Lead, PropertyAsset } from '../../types/domain'
import { useScheduleLeadViewing } from '../../hooks/useScheduleLeadViewing'
import { ScheduleLeadViewingModal } from './ScheduleLeadViewingModal'
import { Button } from '../ui'
import { ICON_STROKE } from './types'

export function CrmLeadViewingBar({
  lead,
  property,
  compact = true,
}: {
  lead: Lead
  property: PropertyAsset | null
  compact?: boolean
}) {
  const {
    canSchedule,
    modalOpen,
    setModalOpen,
    openSchedule,
    bookOntoSlot,
    submitCreate,
    viewingSlots,
    viewings,
    agents,
  } = useScheduleLeadViewing(lead, property)

  if (!canSchedule) return null

  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
      <Button
        type="button"
        variant="secondary"
        className={compact ? 'min-h-9 min-w-9 px-2' : 'min-h-11'}
        title="Schedule viewing"
        onClick={openSchedule}
      >
        <CalendarPlus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        {!compact && 'Schedule'}
      </Button>
      <ScheduleLeadViewingModal
        open={modalOpen}
        lead={lead}
        property={property}
        slots={viewingSlots}
        viewings={viewings}
        agents={agents}
        onClose={() => setModalOpen(false)}
        onBookSlot={bookOntoSlot}
        onCreate={submitCreate}
      />
    </div>
  )
}
