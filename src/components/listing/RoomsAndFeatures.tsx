import type { LucideIcon } from 'lucide-react'
import { Bath, BedDouble, BookOpen, Car, CookingPot, DoorOpen, Ruler, Sofa, UtensilsCrossed, Warehouse } from 'lucide-react'
import type { Room } from '../../types/domain'
import { hidesBedsBathsFamily, isFarmType } from '../../lib/listingSizes'

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
  type?: string | null
}): Tile[] {
  // Fall back to the room configuration when the headline counts were never filled in.
  // Bedrooms are rooms, not beds: a bedroom with two beds is still one bedroom.
  // T4: a bedroom room with beds: 0 does not count as 1.
  const beds = p.beds || p.rooms.filter(isBedroom).filter((r) => (Number(r.beds) || 0) > 0).length
  const baths = p.baths || sum(p.rooms.filter(isBathroom), (r) => Number(r.baths) || 0)
  const garages = p.garages || p.rooms.filter((r) => r.kind === 'garage').length

  const tiles: Tile[] = []
  const hideBeds = hidesBedsBathsFamily(p.type) || (isFarmType(p.type) && !(p.beds > 0))
  const hideBaths = hidesBedsBathsFamily(p.type) || (isFarmType(p.type) && !(p.baths > 0))
  if (!hideBeds && beds > 0) tiles.push({ key: 'beds', icon: BedDouble, label: beds === 1 ? 'Bedroom' : 'Bedrooms', value: beds })
  if (!hideBaths && baths > 0) tiles.push({ key: 'baths', icon: Bath, label: baths === 1 ? 'Bathroom' : 'Bathrooms', value: baths })
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
