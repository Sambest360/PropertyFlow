/** Default room/item lists for a unit inventory. Agencies can replace these. */

export type InventoryTemplateItem = {
  room: string
  name: string
  quantity: number
}

export type InventoryPropertyType = 'house' | 'apartment' | 'room'

const sharedLiving: InventoryTemplateItem[] = [
  { room: 'Entrance', name: 'Front door and locks', quantity: 1 },
  { room: 'Living area', name: 'Walls and paint', quantity: 1 },
  { room: 'Living area', name: 'Flooring', quantity: 1 },
  { room: 'Living area', name: 'Windows and blinds', quantity: 1 },
  { room: 'Kitchen', name: 'Cupboards', quantity: 1 },
  { room: 'Kitchen', name: 'Sink and taps', quantity: 1 },
  { room: 'Kitchen', name: 'Stove', quantity: 1 },
  { room: 'Bathroom', name: 'Basin and taps', quantity: 1 },
  { room: 'Bathroom', name: 'Toilet', quantity: 1 },
]

export function defaultInventoryTemplate(propertyType: InventoryPropertyType): InventoryTemplateItem[] {
  if (propertyType === 'room') {
    return [
      { room: 'Room', name: 'Door and lock', quantity: 1 },
      { room: 'Room', name: 'Bed', quantity: 1 },
      { room: 'Room', name: 'Wardrobe', quantity: 1 },
      { room: 'Room', name: 'Window and blinds', quantity: 1 },
      { room: 'Shared bathroom', name: 'Basin and taps', quantity: 1 },
    ]
  }
  if (propertyType === 'apartment') {
    return [
      ...sharedLiving,
      { room: 'Bedroom', name: 'Bed', quantity: 1 },
      { room: 'Bedroom', name: 'Wardrobe', quantity: 1 },
    ]
  }
  return [
    ...sharedLiving,
    { room: 'Bedroom', name: 'Bed', quantity: 1 },
    { room: 'Bedroom', name: 'Wardrobe', quantity: 1 },
    { room: 'Garden', name: 'Boundary and gate', quantity: 1 },
  ]
}
