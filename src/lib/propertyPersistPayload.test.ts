import { describe, expect, it } from 'vitest'

/**
 * CR-4 behavioural pins for the shared persist helper.
 * The module is introduced with the F4 fix; until then this file fails to load
 * (red on tip). After the fix, payloads omit an inferred type unless the patch
 * chose one.
 */
describe('CR-4: propertyPersistPayload', () => {
  it('omits type when prev is inferred and the patch did not choose a type', async () => {
    const { propertyPersistPayload } = await import('./propertyPersistPayload')
    const prev = {
      id: 'p-1',
      title: 'Garden flat behind main house',
      type: 'Apartment',
      typeInferred: true,
      featured: false,
      agentId: 'u-a',
      rooms: [],
      beds: 1,
      baths: 1,
    }
    expect(propertyPersistPayload(prev, { featured: true })).not.toHaveProperty('type')
    expect(propertyPersistPayload(prev, { agentId: 'u-b' })).not.toHaveProperty('type')
    expect(propertyPersistPayload(prev, { rooms: [], beds: 2, baths: 1 })).not.toHaveProperty('type')
    expect(propertyPersistPayload(prev, { status: 'Rented' })).not.toHaveProperty('type')
  })

  it('keeps a user-chosen type from the patch and preserves an explicit stored type', async () => {
    const { propertyPersistPayload } = await import('./propertyPersistPayload')
    const inferred = {
      id: 'p-2',
      type: 'Apartment',
      typeInferred: true,
      title: 'x',
    }
    expect(propertyPersistPayload(inferred, { type: 'House', typeInferred: false }).type).toBe('House')
    const explicit = {
      id: 'p-3',
      type: 'House',
      typeInferred: false,
      title: 'x',
    }
    expect(propertyPersistPayload(explicit, { featured: true }).type).toBe('House')
  })
})
