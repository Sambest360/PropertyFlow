import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync(new URL('./ContactPage.tsx', import.meta.url), 'utf8')
const TENANT = 'Already renting through an agency on Lekaya? Sign in to report maintenance or upload proof of payment.'

describe('ContactPage addendum1 tenant line', () => {
  it('shows the verbatim tenant sentence with a sign-in link to the tenant portal', () => {
    expect(src).toContain(TENANT)
    expect(src).toMatch(/to=\{?[`'"]\/login\?next=/)
    expect(src).toContain("encodeURIComponent('/workspace/portals/tenant')")
    expect(src).not.toMatch(/next=\/help/)
    expect(src).not.toContain('next=/workspace/help')
    expect(src).not.toContain('next=/help')
  })
})
