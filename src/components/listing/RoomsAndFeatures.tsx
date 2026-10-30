import type { LucideIcon } from 'lucide-react'
import { Bath, BedDouble, BookOpen, Car, CookingPot, DoorOpen, Ruler, Sofa, UtensilsCrossed, Warehouse } from 'lucide-react'
import type { Room } from '../../types/domain'

type Tile = { key: string; icon: LucideIcon; label: string; value: string | number }

const KIND_ICONS: Record<string, LucideIcon> = {
  kitchen: CookingPot,
  living: Sofa,
  dining: UtensilsCrossed,
  study: BookOpen,
}

const isBedroom = (r: Room) => r.kind === 'bedroom' || (!r.kind && r.beds > 0)
const isBathroom = (r: Room) => r.kind === 'bathroom' || (!r.kind && r.baths > 0)
const sum = (rooms: Room[], pick: (r: Room) => number) => rooms.reduce((n, r) => n + (pick(r) || 0), 0)

/** One block for the listing's counts (beds, baths, parking, size) and its other configured rooms. */
export function buildRoomTiles(p: {
  beds: number
  baths: number
  parking: number
  garages?: number
  area?: number
  rooms: Room[]
}): Tile[] {
  // Fall back to the room configuration when the headline counts were never filled in.
  const beds = p.beds || sum(p.rooms.filter(isBedroom), (r) => r.beds || 1)
  const baths = p.baths || sum(p.rooms.filter(isBathroom), (r) => r.baths || 1)
  const garages = p.garages || p.rooms.filter((r) => r.kind === 'garage').length

  const tiles: Tile[] = []
  if (beds > 0) tiles.push({ key: 'beds', icon: BedDouble, label: beds === 1 ? 'Bedroom' : 'Bedrooms', value: beds })
  if (baths > 0) tiles.push({ key: 'baths', icon: Bath, label: baths === 1 ? 'Bathroom' : 'Bathrooms', value: baths })
  if (garages > 0) tiles.push({ key: 'garages', icon: Warehouse, label: garages === 1 ? 'Garage' : 'Garages', value: garages })
  if (p.parking > 0) tiles.push({ key: 'parking', icon: Car, label: 'Parking', value: p.parking })
  if (p.area && p.area > 0) tiles.push({ key: 'area', icon: Ruler, label: 'Floor area', value: `${p.area} m²` })

  // Remaining rooms (kitchen, lounge, study…) are grouped by name so "Kitchen" twice reads as one tile of 2.
  const others = new Map<string, { label: string; kind?: string; count: number }>()
  for (const r of p.rooms) {
    if (isBedroom(r) || isBathroom(r) || r.kind === 'garage') continue
    const label = r.name.trim() || 'Room'
    const key = label.toLowerCase()
    const existing = others.get(key)
    if (existing) existing.count += 1
    else others.set(key, { label, kind: r.kind, count: 1 })
  }
  for (const [key, o] of others) {
    tiles.push({ key: `room:${key}`, icon: (o.kind && KIND_ICONS[o.kind]) || DoorOpen, label: o.label, value: o.count })
  }
  return tiles
}

export function RoomsAndFeatures(props: Parameters<typeof buildRoomTiles>[0]) {
  const tiles = buildRoomTiles(props)
  if (tiles.length === 0) return null
  return (
    <div className="border-b border-primary-100 py-6">
      <h2 className="text-lg font-semibold">Rooms &amp; features</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.key} className="flex items-center gap-3 rounded-2xl bg-primary-50 p-4">
            <t.icon className="h-5 w-5 shrink-0 text-ink-500" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-xs text-ink-500">{t.label}</p>
              <p className="tabular text-lg font-semibold leading-tight">{t.value}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
