import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { erfSizeForUnitPersist } from '../lib/unitErfSizeSupport'

/**
 * T2 C-1 (Angela D03/D04, Jim J16): the app-to-server erf step. The payload
 * part is a pure helper (behaviour below); AppStore is too large to mount
 * here, so its wiring is pinned in the same source-scan style as
 * leaseSignatureOrdering.test.ts / ProposePayoutPanel.test.tsx.
 */
const src = readFileSync(new URL('./AppStore.tsx', import.meta.url), 'utf8')

describe('erfSizeForUnitPersist (unit save payload)', () => {
  it('carries the erf size, and null to clear it', () => {
    expect(erfSizeForUnitPersist({ erfSizeSqm: 600 })).toEqual({ erfSizeSqm: 600 })
    expect(erfSizeForUnitPersist({ erfSizeSqm: null })).toEqual({ erfSizeSqm: null })
  })
  it('omits the key when the draft has none (server keeps the stored value)', () => {
    expect(erfSizeForUnitPersist({})).toEqual({})
    expect('erfSizeSqm' in erfSizeForUnitPersist({ erfSizeSqm: undefined })).toBe(false)
  })
})

describe('AppStore createProperty sends the erf size to the server', () => {
  it('the unit persist payload spreads erfSizeForUnitPersist(property)', () => {
    const start = src.indexOf('const unitPersistBase = {')
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, src.indexOf('} as Record<string, unknown>', start))
    expect(block).toContain('...erfSizeForUnitPersist(property),')
    expect(block).toContain('area: property.area,')
    // that payload is what goes to the server as the unit upsert
    expect(src.slice(start)).toMatch(/let unitPersistData = \{ \.\.\.unitPersistBase,[^\n]*\}\s*\n\s*let unitResult = await persistUpsertResult\('unit', unit\.id, unitPersistData\)/)
  })
})

describe('AppStore sets the erf flag at every bootstrap point', () => {
  const count = (re: RegExp) => (src.match(re) ?? []).length
  it('each bootstrap that sets the access-notes flag also sets the erf flag from the same boot', () => {
    const fromBoot = count(/setTicketAccessNotesSupported\(ticketAccessNotesSupportedFromBootstrap\(boot\)\)/g)
    expect(fromBoot).toBe(3)
    expect(
      count(/setTicketAccessNotesSupported\(ticketAccessNotesSupportedFromBootstrap\(boot\)\)\s*\n\s*setUnitErfSizeSupported\(unitErfSizeSupportedFromBootstrap\(boot\)\)/g),
    ).toBe(fromBoot)
  })
  it('a failed bootstrap turns the erf flag off wherever it turns access notes off', () => {
    const off = count(/setTicketAccessNotesSupported\(false\)/g)
    expect(off).toBe(3)
    expect(count(/setTicketAccessNotesSupported\(false\)\s*\n\s*setUnitErfSizeSupported\(false\)/g)).toBe(off)
  })
})
