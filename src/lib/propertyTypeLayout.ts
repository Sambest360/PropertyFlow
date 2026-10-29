/**
 * How the "Unit & rooms" step looks for each property type. Room kinds stay
 * the stored set (rooms.room_kind); commercial types show them under names
 * that fit (a "study" is an Office, a "dining" room a Boardroom, …).
 */
import type { RoomKind } from '../data/infrastructure'
import { roomKindLabel } from '../data/infrastructure'
import { uid } from '../data/seed'
import type { WizardRoomDraft } from './propertyWizardDraft'

export type LayoutStat = 'bedrooms' | 'beds' | 'bathrooms' | 'garages' | 'parking' | 'spaces' | 'area'

export type PropertyTypeLayout = {
  family: 'residential' | 'apartment' | 'student' | 'commercial' | 'land'
  title: string
  description: string
  stats: LayoutStat[]
  /** Room kinds offered, in order, with the label shown for this type. */
  kinds: Array<{ kind: RoomKind; label: string }>
  showBeds: boolean
  showBaths: boolean
  showFurnished: boolean
  /** Land: no rooms, just the erf size and zoning. */
  landOnly: boolean
  roomWord: string
  starterRooms: () => WizardRoomDraft[]
}

const room = (name: string, kind: RoomKind, beds = 0, baths = 0, areaSqm = ''): WizardRoomDraft => ({
  id: uid('r'),
  name,
  kind,
  beds,
  baths,
  areaSqm,
})

const ALL_KINDS: RoomKind[] = ['bedroom', 'bathroom', 'kitchen', 'living', 'dining', 'study', 'garage', 'other']
const plain = (kinds: RoomKind[]) => kinds.map((kind) => ({ kind, label: roomKindLabel(kind) }))

export const ZONING_OPTIONS = ['Residential 1', 'Residential 2', 'Residential 3', 'Business', 'Commercial', 'Industrial', 'Agricultural', 'Mixed use'] as const
export const LAND_ROOM_NAME = 'Land (erf)'

export function propertyTypeLayout(type: string | null | undefined): PropertyTypeLayout {
  const t = (type ?? '').trim().toLowerCase()
  if (t === 'vacant land' || t === 'land' || t === 'farm') {
    return {
      family: 'land',
      title: 'Land',
      description: 'Vacant land has no rooms. Give the erf size and zoning so buyers can compare.',
      stats: ['area'],
      kinds: plain(['other']),
      showBeds: false,
      showBaths: false,
      showFurnished: false,
      landOnly: true,
      roomWord: 'area',
      starterRooms: () => [room(LAND_ROOM_NAME, 'other')],
    }
  }
  if (t === 'office' || t === 'commercial' || t === 'retail' || t === 'industrial' || t === 'warehouse') {
    const office = t === 'office'
    return {
      family: 'commercial',
      title: office ? 'Office space' : 'Commercial space',
      description: office
        ? 'List the offices, boardrooms and shared spaces with their sizes. The total floor area is worked out for you.'
        : 'List the trading floor, storage, offices and loading areas with their sizes. The total floor area is worked out for you.',
      stats: ['spaces', 'bathrooms', 'parking', 'area'],
      kinds: [
        { kind: 'living', label: office ? 'Open-plan floor' : 'Trading floor' },
        { kind: 'study', label: 'Office' },
        { kind: 'dining', label: 'Boardroom' },
        { kind: 'kitchen', label: 'Kitchenette' },
        { kind: 'bathroom', label: 'Restroom' },
        { kind: 'garage', label: office ? 'Storage' : 'Storage / loading' },
        { kind: 'other', label: 'Other' },
      ],
      showBeds: false,
      showBaths: true,
      showFurnished: false,
      landOnly: false,
      roomWord: 'space',
      starterRooms: () =>
        office
          ? [room('Open-plan floor', 'living'), room('Office 1', 'study'), room('Boardroom', 'dining'), room('Restroom', 'bathroom', 0, 1), room('Kitchenette', 'kitchen')]
          : [room('Trading floor', 'living'), room('Storage', 'garage'), room('Office', 'study'), room('Restroom', 'bathroom', 0, 1)],
    }
  }
  if (t === 'student accommodation' || t === 'room' || t === 'commune') {
    return {
      family: 'student',
      title: 'Rooms & shared spaces',
      description: 'Add each room to let with its number of beds, then the shared bathrooms, kitchen and common areas.',
      stats: ['bedrooms', 'beds', 'bathrooms', 'parking'],
      kinds: [
        { kind: 'bedroom', label: 'Room to let' },
        { kind: 'bathroom', label: 'Shared bathroom' },
        { kind: 'kitchen', label: 'Shared kitchen' },
        { kind: 'living', label: 'Common room' },
        { kind: 'study', label: 'Study area' },
        { kind: 'other', label: 'Other' },
      ],
      showBeds: true,
      showBaths: true,
      showFurnished: true,
      landOnly: false,
      roomWord: 'room',
      starterRooms: () => [
        room('Room 1', 'bedroom', 1),
        room('Room 2', 'bedroom', 1),
        room('Shared bathroom', 'bathroom', 0, 1),
        room('Shared kitchen', 'kitchen'),
        room('Common room', 'living'),
      ],
    }
  }
  if (t === 'apartment' || t === 'flat' || t === 'penthouse') {
    return {
      family: 'apartment',
      title: 'Unit & rooms',
      description: 'Add each room by name and kind. Bedrooms and bathrooms are counted for the listing.',
      stats: ['bedrooms', 'bathrooms', 'parking', 'area'],
      kinds: plain(ALL_KINDS),
      showBeds: true,
      showBaths: true,
      showFurnished: true,
      landOnly: false,
      roomWord: 'room',
      starterRooms: () => [room('Bedroom', 'bedroom', 1), room('Bathroom', 'bathroom', 0, 1), room('Kitchen', 'kitchen'), room('Lounge', 'living')],
    }
  }
  return {
    family: 'residential',
    title: 'Unit & rooms',
    description: 'Add each room by name and kind. Bedrooms, bathrooms and garages are counted for the listing.',
    stats: ['bedrooms', 'bathrooms', 'garages', 'parking'],
    kinds: plain(ALL_KINDS),
    showBeds: true,
    showBaths: true,
    showFurnished: true,
    landOnly: false,
    roomWord: 'room',
    starterRooms: () => [
      room('Main bedroom', 'bedroom', 1),
      room('Bedroom 2', 'bedroom', 1),
      room('Bathroom', 'bathroom', 0, 1),
      room('Kitchen', 'kitchen'),
      room('Lounge', 'living'),
      room('Garage', 'garage'),
    ],
  }
}

/** True when the rooms are still a starter set (nothing typed yet), so a type change may replace them. */
export function roomsLookUntouched(rooms: WizardRoomDraft[]): boolean {
  return rooms.every((r) => !r.areaSqm && (r.kind !== 'bedroom' || r.beds <= 1) && (r.kind !== 'bathroom' || r.baths <= 1))
}

export function kindLabelFor(layout: PropertyTypeLayout, kind: RoomKind): string {
  return layout.kinds.find((k) => k.kind === kind)?.label ?? roomKindLabel(kind)
}
