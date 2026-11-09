import { describe, expect, it } from 'vitest'
import { clampRoomLayoutValue, defaultRoomLayout } from './roomLayout'
import { mapDbRoomsToInfraRooms, roomsToInfraRooms, type DbRoomRow } from './infraRoomsFromBootstrap'
import type { Room } from '../types/domain'

const twoDp = (v: number) => Math.round(v * 100) / 100 === v
const inRange = (v: number) => v >= 0 && v <= 100
const rooms = (n: number): Room[] => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, name: `Room ${i + 1}`, beds: 1, baths: 0 }))

describe('defaultRoomLayout (R1)', () => {
  it('a. every box stays inside 0..100 with 2 decimals, and n <= 6 keeps the old grid', () => {
    for (const n of [1, 6, 7, 12, 30]) {
      for (let i = 0; i < n; i++) {
        const l = defaultRoomLayout(i, n)
        for (const v of [l.x, l.y, l.w, l.h]) {
          expect(inRange(v), `n=${n} i=${i} ${JSON.stringify(l)}`).toBe(true)
          expect(twoDp(v), `n=${n} i=${i} ${JSON.stringify(l)}`).toBe(true)
        }
        expect(l.x + l.w).toBeLessThanOrEqual(100)
        expect(l.y + l.h).toBeLessThanOrEqual(100)
        if (n <= 6) expect(l).toEqual({ x: 5 + (i % 2) * 48, y: 5 + Math.floor(i / 2) * 32, w: 42, h: 28 })
      }
    }
  })
})

describe('room layouts through the existing exports (R1)', () => {
  it('b. 7 rooms without layouts: room 7 is no longer y=101; 30 DB rows of one unit stay in range', () => {
    const seven = roomsToInfraRooms(rooms(7), 'u1', 'c1')
    expect(seven.map((r) => r.layout.y).every((y) => y <= 100)).toBe(true)

    const rows: DbRoomRow[] = Array.from({ length: 30 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      unit_id: 'unit-1', client_id: 'cl-1', name: `R${i}`, room_kind: 'bedroom', beds: 1, baths: 0,
      layout_x: null, layout_y: null, layout_w: null, layout_h: null,
    }))
    const mapped = mapDbRoomsToInfraRooms(rows, { unitUuidToFeId: new Map([['unit-1', 'U-1']]), mapAgencyFe: () => 'AG-1' })
    expect(mapped).toHaveLength(30)
    for (const r of mapped) for (const v of [r.layout.x, r.layout.y, r.layout.w, r.layout.h]) expect(inRange(v), JSON.stringify(r.layout)).toBe(true)
  })

  it('c. an edit keeps saved layouts; a room that brings its own layout keeps it', () => {
    const saved = [{ id: 'r1', layout: { x: 10, y: 60, w: 30, h: 20 } }, { id: 'r3', layout: { x: 1, y: 1, w: 1, h: 1 } }]
    const out = roomsToInfraRooms(
      [...rooms(2), { id: 'r3', name: 'Own', beds: 0, baths: 0, layout: { x: 50, y: 50, w: 20, h: 20 } }],
      'u1', 'c1', saved,
    )
    expect(out[0].layout).toEqual({ x: 10, y: 60, w: 30, h: 20 })
    expect(out[1].layout).toEqual(defaultRoomLayout(1, 3))
    expect(out[2].layout).toEqual({ x: 50, y: 50, w: 20, h: 20 })
    // Two rooms exactly as the prompt states: r2 gets the default for index 1 of 2.
    const two = roomsToInfraRooms(rooms(2), 'u1', 'c1', [saved[0]])
    expect(two.map((r) => r.layout)).toEqual([{ x: 10, y: 60, w: 30, h: 20 }, defaultRoomLayout(1, 2)])
  })
})

describe('clampRoomLayoutValue (R1)', () => {
  it('d. rounds to 2 decimals, then clamps into 0..100; blanks and junk are null', () => {
    expect([101, -3, 42.456, '28', 100.006, 'abc', null, ''].map(clampRoomLayoutValue)).toEqual([100, 0, 42.46, 28, 100, null, null, null])
  })
})
