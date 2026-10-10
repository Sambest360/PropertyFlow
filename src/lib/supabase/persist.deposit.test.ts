import { describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/supabase/client', () => ({ createClient: () => ({}) }))

import { buildSupabaseDepositRow } from './persist'

/** D2: Supabase mode never writes deposit status or approvers from the browser. */
describe('buildSupabaseDepositRow (Supabase strip)', () => {
  const base = { id: 'uuid-1', clientId: 'client-1', occupancyId: null, unitId: null }
  const forged = {
    agencyId: 'ag-horizon',
    heldCents: 100000,
    expectedCents: 100000,
    status: 'release_approved',
    releaseProposedBy: 'u-a',
    releaseApprovedBy: 'u-b',
  }

  it('drops status and release_*_by from the payload; a new row is held or expected only', () => {
    const row = buildSupabaseDepositRow(base, forged, null)
    expect(row.status).toBe('held')
    expect(row).not.toHaveProperty('release_proposed_by')
    expect(row).not.toHaveProperty('release_approved_by')
    expect(buildSupabaseDepositRow(base, { ...forged, heldCents: 0 }, null).status).toBe('expected')
  })

  it('an existing row keeps its stored status (only expected -> held when money arrives)', () => {
    expect(buildSupabaseDepositRow(base, forged, { status: 'held', held_cents: 100000 })).not.toHaveProperty('status')
    expect(buildSupabaseDepositRow(base, forged, { status: 'expected', held_cents: 0 }).status).toBe('held')
  })

  it('held_cents is locked once a release is proposed (409)', () => {
    for (const status of ['release_proposed', 'release_approved', 'refunded']) {
      expect(() => buildSupabaseDepositRow(base, { ...forged, heldCents: 90000 }, { status, held_cents: 100000 })).toThrow(
        /locked/,
      )
      const row = buildSupabaseDepositRow(base, forged, { status, held_cents: '100000' })
      expect(row).not.toHaveProperty('status')
    }
  })
})
