import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const detail = readFileSync(new URL('./PropertyDetail.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../context/AppStore.tsx', import.meta.url), 'utf8')

describe('PropertyDetail and publishProperty title/type confirm wiring', () => {
  it('handleMakeLive opens the same dialog and Change type goes to the edit wizard', () => {
    expect(detail).toContain('sweetTitleTypeConfirm')
    expect(detail).toContain('titleTypeConfirmPrompt')
    const makeLive = detail.slice(detail.indexOf('const handleMakeLive'), detail.indexOf('setPublishBusy'))
    expect(makeLive + detail.slice(detail.indexOf('handleMakeLive'))).toContain('sweetTitleTypeConfirm')
    expect(detail).toMatch(/\/workspace\/properties\/\${.*}\/edit/)
    expect(detail).toMatch(/titleTypeConfirmed:\s*true/)
  })
  it('publishProperty puts titleTypeConfirmed on property, unit, AND fallback persist', () => {
    const publish = store.slice(store.indexOf('publishProperty: async'))
    const both = publish.slice(0, publish.indexOf('deleteProperty:') || 2500)
    const flags = both.split('titleTypeConfirmed').length - 1
    expect(flags).toBeGreaterThanOrEqual(3)
    expect(both).toContain('persistUpsert')
  })
  it('AV3-3: publishProperty does not send a prefilled inferred type', () => {
    const publish = store.slice(store.indexOf('publishProperty: async'), store.indexOf('deleteProperty:'))
    expect(publish).toMatch(/typeInferred/)
    expect(publish).not.toMatch(/\{ \.\.\.prev, status, id \}/)
  })
})
