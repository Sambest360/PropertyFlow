import { useState } from 'react'
import { DoorOpen } from 'lucide-react'
import type { Application, PropertyAsset } from '../../types/domain'
import { useStore } from '../../context/AppStore'
import { isSharedAccommodation, sharedBedSlots, takenBedLabels } from '../../lib/sharedAccommodation'
import { Badge, Button, Card, Input, Select } from '../ui'

const ASSIGN_STAGES = new Set(['deposit_paid', 'deposit_verified', 'first_rent_paid', 'rent_verified', 'inspection_scheduled', 'inspection_completed', 'keys_ready', 'keys_handed_over', 'active_tenancy'])

/**
 * Shared accommodation: applicants apply for "a room"; staff assign which one
 * once the deposit is in. Rooms come from the property's floor plan (rooms to let).
 */
export function AssignRoomCard({ application, property, actorName, onSave }: { application: Application; property: PropertyAsset | undefined; actorName: string; onSave: (patch: Partial<Application>) => void }) {
  const { state, updateTenancy } = useStore()
  const [choice, setChoice] = useState(application.assignedRoom?.label ?? '')
  if (!property || !isSharedAccommodation(property.type)) return null
  const ready = ASSIGN_STAGES.has(String(application.workflowStatus ?? '')) || Boolean(application.depositProof)
  const slots = sharedBedSlots(property)
  const tenancy = state.tenancies.find((t) => t.applicationId === application.id)
  const taken = takenBedLabels(property.id, state.tenancies, state.applications, { tenancyId: tenancy?.id, applicationId: application.id })
  const free = slots.filter((s) => !taken.has(s.label)).length
  const rooms = [...new Set(slots.map((s) => s.roomName))]

  const assign = () => {
    const label = choice.trim()
    if (!label) return
    onSave({ assignedRoom: { label, assignedAt: new Date().toISOString(), assignedByName: actorName } })
    // The lease is for that bed too (other tenants can share the property).
    if (tenancy && tenancy.status !== 'Ended') updateTenancy(tenancy.id, { roomSlot: label })
  }

  return (
    <Card className="space-y-2 p-4" data-testid="assign-room">
      <div className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 font-semibold text-ink">
          <DoorOpen className="h-5 w-5 text-primary" aria-hidden /> Room and bed
        </h3>
        {application.assignedRoom ? <Badge tone="success">{application.assignedRoom.label}</Badge> : <Badge>{free} of {slots.length} free</Badge>}
      </div>
      {!ready ? (
        <p className="text-sm text-ink-500">Shared accommodation: assign the applicant a room and bed once their deposit is in.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          {slots.length ? (
            <Select className="w-auto" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Room and bed">
              <option value="">Choose a bed…</option>
              {rooms.map((room) => (
                <optgroup key={room} label={room}>
                  {slots
                    .filter((s) => s.roomName === room)
                    .map((s) => (
                      <option key={s.label} value={s.label} disabled={taken.has(s.label)}>
                        {s.label}
                        {taken.has(s.label) ? ' (taken)' : ''}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          ) : (
            <Input className="w-48" placeholder="e.g. Room 2 · Bed 1" value={choice} onChange={(e) => setChoice(e.target.value)} />
          )}
          <Button size="sm" disabled={!choice.trim()} onClick={assign}>
            {application.assignedRoom ? 'Change bed' : 'Assign bed'}
          </Button>
        </div>
      )}
      {slots.length === 0 ? <p className="text-xs text-ink-500">Add rooms and beds on the property&apos;s floor plan to pick from a list.</p> : null}
    </Card>
  )
}
