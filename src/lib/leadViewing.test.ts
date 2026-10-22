import { describe, expect, it } from 'vitest'
import type { Lead, Viewing, ViewingSlot } from '../types/domain'
import {
  bookableSlotsForProperty,
  leadAlreadyOnSlot,
  leadToViewingGuest,
  leadViewingDeskHref,
  remainingSlotPlaces,
} from './leadViewing'

const lead: Lead = {
  id: 'LD-1',
  agencyId: 'a-1',
  propertyId: 'p-1',
  agentId: 'u-1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+27 82 000 0000',
  channel: 'Web',
  type: 'Rent',
  stage: 'Contacted',
  value: 0,
  notes: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

describe('leadToViewingGuest', () => {
  it('maps name and email', () => {
    expect(leadToViewingGuest(lead)).toEqual({ name: 'Jane Doe', email: 'jane@example.com' })
  })
})

describe('bookableSlotsForProperty', () => {
  const future = '2099-12-01'
  const slots: ViewingSlot[] = [
    {
      id: 'vs-1',
      agencyId: 'a-1',
      propertyId: 'p-1',
      agentId: 'u-1',
      date: future,
      time: '10:00',
      capacity: 4,
      booked: 2,
      status: 'Open',
    },
    {
      id: 'vs-2',
      agencyId: 'a-1',
      propertyId: 'p-1',
      agentId: 'u-1',
      date: future,
      time: '09:00',
      capacity: 2,
      booked: 2,
      status: 'Full',
    },
    {
      id: 'vs-3',
      agencyId: 'a-1',
      propertyId: 'p-2',
      agentId: 'u-1',
      date: future,
      time: '11:00',
      capacity: 4,
      booked: 0,
      status: 'Open',
    },
  ]

  it('filters open future slots with capacity for property', () => {
    const result = bookableSlotsForProperty(slots, 'p-1', new Date('2026-01-01'))
    expect(result.map((s) => s.id)).toEqual(['vs-1'])
  })
})

describe('leadViewingDeskHref', () => {
  it('uses slot param when booked on slot', () => {
    const v: Viewing = {
      id: 'vw-1',
      agencyId: 'a-1',
      propertyId: 'p-1',
      agentId: 'u-1',
      slotId: 'vs-1',
      applicantName: 'Jane',
      date: '2026-08-01',
      time: '10:00',
      status: 'Scheduled',
      attendance: '—',
    }
    expect(leadViewingDeskHref(v)).toBe('/workspace/sales/viewings/property/p-1?slot=vs-1')
  })

  it('uses booking param for direct bookings', () => {
    const v: Viewing = {
      id: 'vw-2',
      agencyId: 'a-1',
      propertyId: 'p-1',
      agentId: 'u-1',
      slotId: null,
      applicantName: 'Jane',
      date: '2026-08-01',
      time: '10:00',
      status: 'Scheduled',
      attendance: '—',
    }
    expect(leadViewingDeskHref(v)).toBe('/workspace/sales/viewings/property/p-1?booking=vw-2')
  })
})

describe('leadAlreadyOnSlot', () => {
  const viewings: Viewing[] = [
    {
      id: 'vw-1',
      agencyId: 'a-1',
      propertyId: 'p-1',
      agentId: 'u-1',
      slotId: 'vs-1',
      applicantName: 'Jane Doe',
      applicantEmail: 'jane@example.com',
      date: '2026-08-01',
      time: '10:00',
      status: 'Scheduled',
      attendance: '—',
    },
  ]

  it('detects matching attendee', () => {
    expect(leadAlreadyOnSlot(lead, 'vs-1', viewings)).toBe(true)
    expect(leadAlreadyOnSlot(lead, 'vs-2', viewings)).toBe(false)
  })
})

describe('remainingSlotPlaces', () => {
  it('returns capacity minus booked', () => {
    expect(
      remainingSlotPlaces({
        id: 'vs',
        agencyId: 'a',
        propertyId: 'p',
        agentId: 'u',
        date: '2026-01-01',
        time: '10:00',
        capacity: 5,
        booked: 3,
        status: 'Open',
      }),
    ).toBe(2)
  })
})
