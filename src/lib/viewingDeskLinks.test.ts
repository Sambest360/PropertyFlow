import { describe, expect, it } from 'vitest'
import {
  agendaPortfolioItems,
  viewingDeskLinkLabel,
  viewingDeskPath,
  type PortfolioViewing,
} from '../components/viewings/types'
import type { PropertyAsset, Viewing, ViewingSlot } from '../types/domain'

const property = { id: 'p-1', title: '2-bed Gardens apartment' } as PropertyAsset
const slot: ViewingSlot = {
  id: 'vs-1',
  agencyId: 'a-1',
  propertyId: 'p-1',
  agentId: 'u-james',
  date: '2026-08-06',
  time: '13:00',
  capacity: 5,
  booked: 3,
  status: 'Open',
  title: 'Sam - Test Viewing 1',
}
const slotBooking: Viewing = {
  id: 'vw-1',
  agencyId: 'a-1',
  propertyId: 'p-1',
  agentId: 'u-james',
  slotId: 'vs-1',
  applicantName: 'Thabo Mokoena',
  date: '2026-08-06',
  time: '13:00',
  status: 'Scheduled',
  attendance: '—',
}
const directBooking: Viewing = {
  ...slotBooking,
  id: 'vw-2',
  slotId: null,
  applicantName: 'Walk-in Guest',
}

describe('viewing desk deep links', () => {
  it('hides slot-attached bookings from the agenda list', () => {
    const items: PortfolioViewing[] = [
      { kind: 'slot', id: 'slot:vs-1', slot, property, agentName: 'James', bookings: [slotBooking] },
      {
        kind: 'booking',
        id: 'booking:vw-1',
        viewing: slotBooking,
        property,
        agentName: 'James',
        slot,
      },
      {
        kind: 'booking',
        id: 'booking:vw-2',
        viewing: directBooking,
        property,
        agentName: 'James',
        slot: null,
      },
    ]
    expect(agendaPortfolioItems(items)).toHaveLength(2)
  })

  it('builds slot and booking desk paths', () => {
    const slotItem: PortfolioViewing = {
      kind: 'slot',
      id: 'slot:vs-1',
      slot,
      property,
      agentName: 'James',
      bookings: [],
    }
    const directItem: PortfolioViewing = {
      kind: 'booking',
      id: 'booking:vw-2',
      viewing: directBooking,
      property,
      agentName: 'James',
      slot: null,
    }
    expect(viewingDeskPath(slotItem)).toBe('/workspace/sales/viewings/property/p-1?slot=vs-1')
    expect(viewingDeskPath(directItem)).toBe('/workspace/sales/viewings/property/p-1?booking=vw-2')
    expect(viewingDeskLinkLabel(slotItem)).toBe('Open slot')
    expect(viewingDeskLinkLabel(directItem)).toBe('View invite')
  })
})
