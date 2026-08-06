import { describe, expect, it } from 'vitest'
import {
  collectViewingAttendeeUserIds,
  describeViewingSlotChanges,
  slotPatchIsMaterial,
} from './viewingNotifications'
import type { Application, AppUser, Viewing, ViewingSlot } from '../types/domain'

const users: AppUser[] = [
  {
    id: 'u-thabo',
    name: 'Thabo Mokoena',
    email: 'thabo.mokoena@propertyflow.demo',
    role: 'tenant',
    agencyId: 'a-seeff',
    active: true,
  },
]

const applications: Application[] = [
  {
    id: 'app-1',
    agencyId: 'a-seeff',
    propertyId: 'p-1',
    applicantUserId: 'u-thabo',
    applicantName: 'Thabo Mokoena',
    email: 'thabo.mokoena@propertyflow.demo',
    phone: '',
    type: 'Rent',
    stage: 'Viewing Booked',
    progress: 40,
    creditCheck: 'Pending',
    creditConsent: true,
    submittedAt: '2026-07-01',
    updatedAt: '2026-07-01',
  },
]

const slot: ViewingSlot = {
  id: 'vs-1',
  agencyId: 'a-seeff',
  propertyId: 'p-1',
  agentId: 'u-james',
  date: '2026-08-06',
  time: '13:00',
  capacity: 5,
  booked: 1,
  status: 'Open',
  title: 'Sam - Test Viewing 1',
  durationMinutes: 30,
}

const viewing: Viewing = {
  id: 'vw-1',
  agencyId: 'a-seeff',
  propertyId: 'p-1',
  agentId: 'u-james',
  slotId: 'vs-1',
  applicantName: 'Thabo Mokoena',
  applicantEmail: 'thabo.mokoena@propertyflow.demo',
  date: '2026-08-06',
  time: '13:00',
  status: 'Scheduled',
  attendance: '—',
}

describe('viewingNotifications', () => {
  it('detects material slot changes', () => {
    expect(slotPatchIsMaterial(slot, { time: '14:00' })).toBe(true)
    expect(slotPatchIsMaterial(slot, { capacity: 6 })).toBe(false)
    expect(slotPatchIsMaterial(slot, { status: 'Cancelled' })).toBe(true)
  })

  it('describes schedule updates', () => {
    const message = describeViewingSlotChanges(slot, { time: '14:30' }, {
      id: 'p-1',
      title: '2-bed Gardens apartment',
    } as never)
    expect(message.title).toBe('Viewing updated')
    expect(message.body).toContain('14:30')
  })

  it('collects attendee user ids from applications', () => {
    expect(collectViewingAttendeeUserIds(users, applications, [viewing])).toEqual(['u-thabo'])
  })
})
