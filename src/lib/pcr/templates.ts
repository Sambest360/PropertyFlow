/**
 * Lite room/item templates for Mode A PCR inspections.
 * Intentionally small — not a full PropertyInspect catalogue.
 */

import type { PcrInspectionItem, PcrInspectionRoom } from './types'

function item(id: string, label: string): PcrInspectionItem {
  return {
    id,
    label,
    condition: 'not_checked',
    notes: '',
    photos: [],
    needsMaintenance: false,
  }
}

function room(id: string, name: string, items: PcrInspectionItem[]): PcrInspectionRoom {
  return { id, name, notes: '', items }
}

/** Default lite template for a typical SA residential unit (Mode A). */
export function defaultResidentialTemplate(prefix = 'tpl'): PcrInspectionRoom[] {
  return [
    room(`${prefix}-entrance`, 'Entrance / passage', [
      item(`${prefix}-entrance-door`, 'Front door & locks'),
      item(`${prefix}-entrance-floor`, 'Flooring'),
      item(`${prefix}-entrance-lights`, 'Lights / switches'),
    ]),
    room(`${prefix}-living`, 'Living area', [
      item(`${prefix}-living-walls`, 'Walls & paint'),
      item(`${prefix}-living-floor`, 'Flooring'),
      item(`${prefix}-living-windows`, 'Windows & blinds'),
      item(`${prefix}-living-lights`, 'Lights / plugs'),
    ]),
    room(`${prefix}-kitchen`, 'Kitchen', [
      item(`${prefix}-kitchen-cupboards`, 'Cupboards'),
      item(`${prefix}-kitchen-sink`, 'Sink & taps'),
      item(`${prefix}-kitchen-stove`, 'Stove / hob'),
      item(`${prefix}-kitchen-fridge`, 'Fridge space / appliance'),
      item(`${prefix}-kitchen-floor`, 'Flooring'),
    ]),
    room(`${prefix}-bedroom`, 'Bedroom', [
      item(`${prefix}-bedroom-walls`, 'Walls & paint'),
      item(`${prefix}-bedroom-floor`, 'Flooring'),
      item(`${prefix}-bedroom-cupboards`, 'Built-in cupboards'),
      item(`${prefix}-bedroom-windows`, 'Windows & blinds'),
    ]),
    room(`${prefix}-bathroom`, 'Bathroom', [
      item(`${prefix}-bathroom-toilet`, 'Toilet'),
      item(`${prefix}-bathroom-basin`, 'Basin & taps'),
      item(`${prefix}-bathroom-shower`, 'Shower / bath'),
      item(`${prefix}-bathroom-tiles`, 'Tiles / seals'),
    ]),
    room(`${prefix}-exterior`, 'Exterior / meter', [
      item(`${prefix}-exterior-keys`, 'Keys / remotes handed'),
      item(`${prefix}-exterior-meter`, 'Meter readings (note only)'),
      item(`${prefix}-exterior-garden`, 'Garden / balcony (if any)'),
    ]),
  ]
}

/** Clone template rooms with fresh ids for a new inspection. */
export function cloneTemplateRooms(
  rooms: PcrInspectionRoom[],
  idPrefix: string,
): PcrInspectionRoom[] {
  return rooms.map((r, ri) => ({
    ...r,
    id: `${idPrefix}-r${ri}`,
    notes: '',
    items: r.items.map((it, ii) => ({
      ...it,
      id: `${idPrefix}-r${ri}-i${ii}`,
      condition: 'not_checked' as const,
      notes: '',
      photos: [],
      needsMaintenance: false,
    })),
  }))
}

/**
 * Rooms from an agency's "PCR rooms & items" list (Admin → Configuration).
 * Rooms without items are skipped; an empty result means "use the default".
 */
export function templateFromConfiguredRooms(
  rooms: Array<{ name: string; items: string[] }>,
  prefix = 'cfg',
): PcrInspectionRoom[] {
  return rooms
    .map((r) => ({ name: r.name.trim(), items: r.items.map((i) => i.trim()).filter(Boolean) }))
    .filter((r) => r.name && r.items.length)
    .map((r, ri) =>
      room(
        `${prefix}-r${ri}`,
        r.name,
        r.items.map((label, ii) => item(`${prefix}-r${ri}-i${ii}`, label)),
      ),
    )
}
