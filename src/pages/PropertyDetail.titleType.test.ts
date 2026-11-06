import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const detail = readFileSync(new URL('./PropertyDetail.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../context/AppStore.tsx', import.meta.url), 'utf8')

function upsertSlice(src: string, marker: string): string {
  const i = src.indexOf(marker)
  expect(i, `missing persist upsert ${marker}`).toBeGreaterThan(-1)
  return src.slice(i, i + 480)
}

describe('PropertyDetail and publishProperty title/type confirm wiring', () => {
  it('handleMakeLive opens the same dialog and Change type goes to the edit wizard', () => {
    expect(detail).toContain('sweetTitleTypeConfirm')
    expect(detail).toContain('titleTypeConfirmPrompt')
    const makeLive = detail.slice(detail.indexOf('const handleMakeLive'), detail.indexOf('setPublishBusy'))
    expect(makeLive + detail.slice(detail.indexOf('handleMakeLive'))).toContain('sweetTitleTypeConfirm')
    expect(detail).toMatch(/\/workspace\/properties\/\${.*}\/edit/)
    expect(detail).toMatch(/titleTypeConfirmed:\s*true/)
  })
  it('AV3-13: pins titleTypeConfirmed on the property, unit-patch, AND fallback persist upserts', () => {
    const publish = store.slice(store.indexOf('publishProperty: async'))
    const impl = publish.slice(0, publish.indexOf('deleteProperty:'))
    const flag = /titleTypeConfirmed:\s*opts\?\.titleTypeConfirmed === true/

    const propertyCall = upsertSlice(impl, "persistUpsert(\n          'property',\n          id,")
    expect(propertyCall).toMatch(flag)

    const unitPatchCall = upsertSlice(impl, "persistUpsert(\n          'unit',\n          unitPatch.id,")
    expect(unitPatchCall).toMatch(flag)

    const fallbackCall = upsertSlice(impl, "persistUpsert(\n          'unit',\n          targetUnitId,")
    expect(fallbackCall).toMatch(flag)
    expect(impl).toContain('fallbackUnit')
  })
  it('AV3-3: publishProperty does not send a prefilled inferred type', () => {
    const publish = store.slice(store.indexOf('publishProperty: async'))
    const both = publish.slice(0, publish.indexOf('deleteProperty:') || 8000)
    expect(both).toMatch(/typeInferred/)
    expect(both).not.toMatch(/\{ \.\.\.prev, status, id \}/)
  })
})
