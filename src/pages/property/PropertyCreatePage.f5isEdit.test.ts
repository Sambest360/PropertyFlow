import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shouldReplaceStarterRooms } from '../../lib/propertyTypeLayout'

/**
 * #144 F5 call site: when a type is first picked while editing an existing
 * listing, the wizard keeps its stored rooms. That rests on the type-change
 * effect passing `{ isEdit }` to shouldReplaceStarterRooms (the helper itself
 * is covered in propertyTypeLayout.cr5.test.ts). Source-scan, as in
 * PropertyCreatePage.t2.test.ts, because the page needs the full store.
 */
const src = readFileSync(new URL('./PropertyCreatePage.tsx', import.meta.url), 'utf8')

describe('PropertyCreatePage F5: the type-change effect passes { isEdit }', () => {
  it('calls shouldReplaceStarterRooms with { isEdit } and re-runs when isEdit changes', () => {
    const calls = src.match(/shouldReplaceStarterRooms\(([^)]*)\)/g) ?? []
    expect(calls.length).toBeGreaterThan(0)
    // Every call in the page carries the edit flag; without it an edited
    // listing's stored rooms are replaced by the new type's starter rooms.
    for (const call of calls) expect(call).toMatch(/\{\s*isEdit\s*\}\s*\)$/)
    expect(src).toContain('shouldReplaceStarterRooms(prevType, draft.propertyType, d.rooms, { isEdit })')
    expect(src).toMatch(/\}, \[draft\.propertyType, typeLayout, setDraft, isEdit\]\)/)
  })

  it('the flag is what keeps stored rooms (helper behaviour the call site relies on)', () => {
    const stored = [
      { id: 'r1', kind: 'bedroom', name: 'Main bedroom', beds: 1 },
      { id: 'r2', kind: 'bathroom', name: 'Bathroom' },
    ] as unknown as Parameters<typeof shouldReplaceStarterRooms>[2]
    expect(shouldReplaceStarterRooms('', 'House', stored, { isEdit: true })).toBe(false)
  })
})
