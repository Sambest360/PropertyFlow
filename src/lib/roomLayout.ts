/**
 * Default floor-plan box for a room with no saved layout, and the clamp the
 * server applies before saving one. rooms.layout_* is NUMERIC(5,2) with a
 * CHECK of 0..100, so every value must stay inside that range.
 *
 * Formula: a 2-column grid whose rows shrink as the room count grows. For up
 * to 6 rooms this gives the old fixed grid exactly (y 5 / 37 / 69, h 28).
 * Dependency-free on purpose: imports nothing (the server imports it too).
 */
export type RoomLayout = { x: number; y: number; w: number; h: number }

const fit = (v: number) => Math.min(100, Math.max(0, Math.round(v * 100) / 100))

export function defaultRoomLayout(index: number, count?: number): RoomLayout {
  const i = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0))
  const n = Math.max(i + 1, Math.floor(Number.isFinite(count ?? 0) ? (count ?? 0) : 0), 1)
  const rows = Math.max(3, Math.ceil(n / 2))
  const pitch = 96 / rows
  return {
    x: fit(5 + (i % 2) * 48),
    y: fit(5 + Math.floor(i / 2) * pitch),
    w: fit(42),
    h: fit(pitch - Math.min(4, pitch / 2)),
  }
}

/** null / undefined / '' / non-numeric -> null; otherwise rounded to 2 decimals, then clamped into 0..100. */
export function clampRoomLayoutValue(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return fit(n)
}
