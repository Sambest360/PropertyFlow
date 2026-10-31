import { describe, expect, it } from 'vitest'
import { PROPERTY_TYPES } from './BrowseFilters'

describe('BrowseFilters property types (T2)', () => {
  it('offers Industrial, Commercial and Farm as their own filter chips', () => {
    for (const t of ['Industrial', 'Commercial', 'Farm']) expect(PROPERTY_TYPES).toContain(t)
  })
})
