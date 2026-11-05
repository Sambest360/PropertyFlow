import { describe, expect, it } from 'vitest'
import { sharedBedSlots, sharedCapacity, sharedRoomsLabel, takenBedLabels } from './sharedAccommodation'

const room = (id: string, name: string, beds: number, kind = 'bedroom') => ({ id, name, beds, baths: 0, kind })

describe('shared accommodation beds', () => {
  it('one place per bed, room by room', () => {
    const p = { beds: 3, rooms: [room('r1', 'Room 1', 1), room('r2', 'Room 2', 3), room('k', 'Kitchen', 0, 'kitchen')] }
    expect(sharedBedSlots(p).map((s) => s.label)).toEqual(['Room 1', 'Room 2 · Bed 1', 'Room 2 · Bed 2', 'Room 2 · Bed 3'])
    expect(sharedCapacity(p)).toBe(4)
  })
  it('no floor plan: one place per bedroom', () => {
    expect(sharedBedSlots({ beds: 5 }).length).toBe(5)
  })
  it('counts beds in the listing label and knows taken beds', () => {
    const p = { beds: 2, type: 'Shared Accommodation', roomsLet: 1, rooms: [room('r1', 'Room 1', 2), room('r2', 'Room 2', 1)] }
    expect(sharedRoomsLabel(p)).toBe('2 of 3 beds available')
    const taken = takenBedLabels(
      'P1',
      [{ id: 't1', propertyId: 'P1', status: 'Active', roomSlot: 'Room 1 · Bed 1' }, { id: 't2', propertyId: 'P1', status: 'Ended', roomSlot: 'Room 2' }],
      [{ id: 'a1', propertyId: 'P1', workflowStatus: 'deposit_paid', assignedRoom: { label: 'Room 1 · Bed 2' } }],
    )
    expect([...taken].sort()).toEqual(['Room 1 · Bed 1', 'Room 1 · Bed 2'])
  })
})
