import { describe, expect, it } from 'vitest'
import {
  shouldAcceptSupabaseBootstrap,
  shouldWipeAuthAfterBootstrapMiss,
} from './emptyBootstrapAuth'

describe('empty-bootstrap ≠ stale-auth (P0 SA empty DB)', () => {
  it('accepts boot with units (legacy P0-2 happy path)', () => {
    expect(
      shouldAcceptSupabaseBootstrap({
        boot: { units: [{ id: 'u1' }] },
        actorUserId: null,
        storedAuthUserId: null,
      }),
    ).toBe(true)
    expect(
      shouldWipeAuthAfterBootstrapMiss({
        boot: { units: [{ id: 'u1' }] },
        actorUserId: null,
        storedAuthUserId: null,
      }),
    ).toBe(false)
  })

  it('accepts empty boot (0 units) when live SA actor exists', () => {
    expect(
      shouldAcceptSupabaseBootstrap({
        boot: { units: [] },
        actorUserId: 'sa-1',
        storedAuthUserId: null,
      }),
    ).toBe(true)
    expect(
      shouldWipeAuthAfterBootstrapMiss({
        boot: { units: [] },
        actorUserId: 'sa-1',
        storedAuthUserId: null,
      }),
    ).toBe(false)
  })

  it('accepts empty boot when stored auth user id exists', () => {
    expect(
      shouldAcceptSupabaseBootstrap({
        boot: { units: [] },
        actorUserId: null,
        storedAuthUserId: 'sa-1',
      }),
    ).toBe(true)
    expect(
      shouldWipeAuthAfterBootstrapMiss({
        boot: { units: [] },
        actorUserId: null,
        storedAuthUserId: 'sa-1',
      }),
    ).toBe(false)
  })

  it('wipes only when empty/missing boot AND no live session proof', () => {
    expect(
      shouldWipeAuthAfterBootstrapMiss({
        boot: { units: [] },
        actorUserId: null,
        storedAuthUserId: null,
      }),
    ).toBe(true)
    expect(
      shouldWipeAuthAfterBootstrapMiss({
        boot: null,
        actorUserId: null,
        storedAuthUserId: null,
      }),
    ).toBe(true)
  })

  it('never wipes when live session exists even if boot is null', () => {
    expect(
      shouldWipeAuthAfterBootstrapMiss({
        boot: null,
        actorUserId: 'sa-1',
        storedAuthUserId: 'sa-1',
      }),
    ).toBe(false)
    expect(
      shouldAcceptSupabaseBootstrap({
        boot: null,
        actorUserId: 'sa-1',
        storedAuthUserId: 'sa-1',
      }),
    ).toBe(false)
  })
})
