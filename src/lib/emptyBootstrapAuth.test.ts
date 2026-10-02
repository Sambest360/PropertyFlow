import { describe, expect, it } from 'vitest'
import {
  isTenantBootstrapActor,
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
        actorRole: 'super_admin',
      }),
    ).toBe(true)
    expect(
      shouldWipeAuthAfterBootstrapMiss({
        boot: { units: [] },
        actorUserId: 'sa-1',
        storedAuthUserId: null,
        actorRole: 'super_admin',
      }),
    ).toBe(false)
  })

  it('accepts empty boot when stored auth user id exists', () => {
    expect(
      shouldAcceptSupabaseBootstrap({
        boot: { units: [] },
        actorUserId: null,
        storedAuthUserId: 'sa-1',
        actorRole: 'super_admin',
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

describe('tenant remint fail-closed (Sipho durable empty)', () => {
  it('isTenantBootstrapActor recognizes FE tenant and DB END_USER', () => {
    expect(isTenantBootstrapActor('tenant')).toBe(true)
    expect(isTenantBootstrapActor('END_USER')).toBe(true)
    expect(isTenantBootstrapActor('applicant')).toBe(true)
    expect(isTenantBootstrapActor('super_admin')).toBe(false)
    expect(isTenantBootstrapActor('client_admin')).toBe(false)
  })

  it('END_USER + empty apps + live session ⇒ NOT silent remint OK', () => {
    expect(
      shouldAcceptSupabaseBootstrap({
        boot: { units: [], applications: [] },
        actorUserId: 'u-50cc6e30',
        storedAuthUserId: 'u-50cc6e30',
        actorRole: 'END_USER',
      }),
    ).toBe(false)
    expect(
      shouldWipeAuthAfterBootstrapMiss({
        boot: { units: [], applications: [] },
        actorUserId: 'u-50cc6e30',
        storedAuthUserId: 'u-50cc6e30',
        actorRole: 'END_USER',
      }),
    ).toBe(false)
  })

  it('FE tenant + empty apps + live session ⇒ NOT silent remint OK', () => {
    expect(
      shouldAcceptSupabaseBootstrap({
        boot: { units: [{ id: 'u1' }], applications: [] },
        actorUserId: 'u-50cc6e30',
        storedAuthUserId: null,
        actorRole: 'tenant',
      }),
    ).toBe(false)
  })

  it('tenant + non-empty apps + live session ⇒ accept', () => {
    expect(
      shouldAcceptSupabaseBootstrap({
        boot: { units: [], applications: [{ id: 'APP-it4z5k' }] },
        actorUserId: 'u-50cc6e30',
        storedAuthUserId: 'u-50cc6e30',
        actorRole: 'tenant',
      }),
    ).toBe(true)
  })

  it('SA empty-units path still accepts with live session (0 apps OK)', () => {
    expect(
      shouldAcceptSupabaseBootstrap({
        boot: { units: [], applications: [] },
        actorUserId: 'sa-1',
        storedAuthUserId: 'sa-1',
        actorRole: 'super_admin',
      }),
    ).toBe(true)
  })
})
