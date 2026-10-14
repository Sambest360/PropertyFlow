import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('property wizard draft photos (issue 16)', () => {
  it('PropertyCreatePage persists buildingImages in wizard draft (no omitFromPersist)', () => {
    const src = readFileSync('src/pages/property/PropertyCreatePage.tsx', 'utf8')
    expect(src).not.toContain("omitFromPersist: ['buildingImages']")
    expect(src).toContain('buildingImages')
  })
})
