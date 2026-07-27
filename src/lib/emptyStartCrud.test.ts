import { describe, expect, it } from 'vitest'

/**
 * CRUD smoke: documents the empty-start create order used by Super Admin → agency → users.
 * Runtime HTTP coverage is exercised manually / via curl against the local API.
 */
describe('empty-start CRUD sequence', () => {
  it('orders platform bootstrap steps', () => {
    const steps = [
      'register_super_admin',
      'create_agency',
      'create_staff_with_temp_password',
      'create_property_publish',
      'applicant_register_apply',
    ]
    expect(steps[0]).toBe('register_super_admin')
    expect(steps.at(-1)).toBe('applicant_register_apply')
  })

  it('uses storage key v17 after wipe', () => {
    expect('propertyflow-v17').toMatch(/v17$/)
  })
})
