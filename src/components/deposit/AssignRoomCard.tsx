import { useState } from 'react'
import { DoorOpen } from 'lucide-react'
import type { Application, PropertyAsset } from '../../types/domain'
import { useStore } from '../../context/AppStore'
import { isSharedAccommodation, sharedRoomsAvailable } from '../../lib/sharedAccommodation'
import { Badge, Button, Card, Input, Select } from '../ui'

const ASSIGN_STAGES = new Set(['deposit_paid', 'deposit_verified', 'first_rent_paid', 'rent_verified', 'inspection_scheduled', 'inspection_completed', 'keys_ready', 'keys_handed_over', 'active_tenancy'])

/**
 * Shared accommodation: applicants apply for "a room"; staff assign which one
 * once the deposit is in. Rooms come from the property's floor plan (rooms to let).
 */
export function AssignRoomCard({ application, property, actorName, onSave }: { application: Application; property: PropertyAsset | undefined; actorName: string; onSave: (patch: Partial<Application>) => void }) {
  const { state } = useStore()
  const [choice, setChoice] = useState(application.assignedRoom?.label ?? '')
  if (!property || !isSharedAccommodation(property.type)) return null
  const ready = ASSIGN_STAGES.has(String(application.workflowStatus ?? '')) || Boolean(application.depositProof)
  const roomNames = (property.rooms ?? []).filter((r) => (r.kind ?? 'bedroom') === 'bedroom').map((r) => r.name).filter(Boolean)
  const taken = new Set(
    state.applications
      .filter((a) => a.propertyId === property.id && a.id !== application.id && a.assignedRoom)
      .map((a) => a.assignedRoom!.label),
  )
  return (
    <Card className="space-y-2 p-4" data-testid="assign-room">
      <div className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 font-semibold text-ink">
          <DoorOpen className="h-5 w-5 text-primary" aria-hidden /> Room
        </h3>
        {application.assignedRoom ? <Badge tone="success">{application.assignedRoom.label}</Badge> : <Badge>{sharedRoomsAvailable(property)} free</Badge>}
      </div>
      {!ready ? (
        <p className="text-sm text-ink-500">Shared accommodation: assign the applicant a room once their deposit is in.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          {roomNames.length ? (
            <Select className="w-auto" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Room">
              <option value="">Choose a room…</option>
              {roomNames.map((n) => (
                <option key={n} value={n} disabled={taken.has(n)}>
                  {n}
                  {taken.has(n) ? ' (taken)' : ''}
                </option>
              ))}
            </Select>
          ) : (
            <Input className="w-48" placeholder="e.g. Room 2" value={choice} onChange={(e) => setChoice(e.target.value)} />
          )}
          <Button
            size="sm"
            disabled={!choice.trim()}
            onClick={() => onSave({ assignedRoom: { label: choice.trim(), assignedAt: new Date().toISOString(), assignedByName: actorName } })}
          >
            {application.assignedRoom ? 'Change room' : 'Assign room'}
          </Button>
        </div>
      )}
    </Card>
  )
}
