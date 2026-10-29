import { describe, expect, it } from 'vitest'
import { buildIdMapCache } from './idMap'
import {
  mapDbRoomRowToInfraRoom,
  mapDbRoomsToInfraRooms,
  resolveInfraRoomsForUnit,
  roomsToInfraRooms,
} from './infraRoomsFromBootstrap'
import type { PropertyAsset } from '../types/domain'
import type { Unit } from '../data/infrastructure'

describe('mapDbRoomRowToInfraRoom', () => {
  it('maps backend unit uuid to FE unit id and layout columns', () => {
    const cache = buildIdMapCache([], [])
    const row = {
      id: 'room-uuid-1',
      unit_id: 'unit-uuid-1',
      client_id: 'client-uuid',
      name: 'Main bedroom',
      room_kind: 'bedroom',
      beds: 1,
      baths: '1',
      area_sqm: '12',
      layout_x: 10,
      layout_y: 20,
      layout_w: 30,
      layout_h: 40,
    }
    const infra = mapDbRoomRowToInfraRoom(row, {
      cache,
      unitFeId: 'unt-fe-1',
      clientFeId: 'ag-test',
      layoutIndex: 0,
    })
    expect(infra.unitId).toBe('unt-fe-1')
    expect(infra.clientId).toBe('ag-test')
    expect(infra.kind).toBe('bedroom')
    expect(infra.layout).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })
})

describe('mapDbRoomsToInfraRooms', () => {
  it('skips rows whose unit is not in the map', () => {
    const cache = buildIdMapCache([], [])
    const rows = [
      {
        id: 'r1',
        unit_id: 'known-unit',
        client_id: 'c1',
        name: 'Bath',
        room_kind: 'bathroom',
        beds: 0,
        baths: '1',
      },
      {
        id: 'r2',
        unit_id: 'unknown-unit',
        client_id: 'c1',
        name: 'Spare',
        room_kind: 'bedroom',
        beds: 1,
        baths: '0',
      },
    ]
    const mapped = mapDbRoomsToInfraRooms(rows, {
      cache,
      unitUuidToFeId: new Map([['known-unit', 'unt-1']]),
      mapAgencyFe: () => 'ag-1',
    })
    expect(mapped).toHaveLength(1)
    expect(mapped[0].name).toBe('Bath')
  })
})

describe('resolveInfraRoomsForUnit', () => {
  const unit: Unit = {
    id: 'unt-1',
    clientId: 'ag-1',
    buildingId: 'bld-1',
    agentId: null,
    unitNumber: '1',
    title: 'Unit 1',
    squareMeters: 50,
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    listingType: 'rent',
    price: null,
    rent: 10000,
    statusKey: 'DRAFT',
    description: '',
    amenities: [],
    images: [],
    featured: false,
    lat: 0,
    lng: 0,
    createdAt: '2026-01-01',
  }

  const property: PropertyAsset = {
    id: 'prop-1',
    agencyId: 'ag-1',
    landlordId: 'll-1',
    agentId: null,
    buildingId: 'bld-1',
    unitId: 'unt-1',
    title: 'Test',
    type: 'Apartment',
    status: 'Draft',
    listingMode: 'rent',
    price: null,
    rent: 10000,
    beds: 2,
    baths: 1,
    parking: 0,
    area: 50,
    city: 'Cape Town',
    suburb: 'CBD',
    address: '1 Main',
    lat: 0,
    lng: 0,
    images: [],
    rooms: [
      {
        id: 'rm-1',
        name: 'Bedroom',
        beds: 1,
        baths: 0,
        kind: 'bedroom',
      },
    ],
    amenities: [],
    description: '',
    featured: false,
    createdAt: '2026-01-01',
  }

  it('prefers infraRooms when present', () => {
    const infra = [
      {
        id: 'rm-db',
        clientId: 'ag-1',
        unitId: 'unt-1',
        name: 'From DB',
        kind: 'bedroom' as const,
        beds: 1,
        baths: 0,
        layout: { x: 1, y: 2, w: 3, h: 4 },
      },
    ]
    const resolved = resolveInfraRoomsForUnit(property, unit, infra)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].name).toBe('From DB')
  })

  it('falls back to property.rooms when infraRooms empty', () => {
    const resolved = resolveInfraRoomsForUnit(property, unit, [])
    expect(resolved).toHaveLength(1)
    expect(resolved[0].id).toBe('rm-1')
    expect(resolved[0].layout.w).toBe(42)
  })
})

describe('roomsToInfraRooms', () => {
  it('assigns default layout grid positions', () => {
    const out = roomsToInfraRooms(
      [
        { id: 'a', name: 'A', beds: 1, baths: 0 },
        { id: 'b', name: 'B', beds: 0, baths: 1 },
      ],
      'unt-1',
      'ag-1',
    )
    expect(out[0].layout.x).toBe(5)
    expect(out[1].layout.x).toBe(53)
  })
})
