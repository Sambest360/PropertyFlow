import { describe, expect, it, vi } from 'vitest'
import { resolveLandlordAssignment, validateLandlordAssignment, type LandlordDraft } from './LandlordPicker'

const baseDraft: LandlordDraft = {
  linkLandlord: false,
  landlordId: '',
  landlordManualName: '',
  landlordManualEmail: '',
  landlordManualPhone: '',
  landlordEntryMode: 'search',
}

describe('validateLandlordAssignment', () => {
  it('allows agency-owned listings without a landlord', () => {
    expect(validateLandlordAssignment(baseDraft, false)).toBeNull()
  })

  it('requires a selection when linking via search', () => {
    expect(
      validateLandlordAssignment({ ...baseDraft, linkLandlord: true, landlordEntryMode: 'search' }, false),
    ).toMatch(/Select a landlord/)
  })
})

describe('resolveLandlordAssignment', () => {
  it('returns empty string for agency-owned property', () => {
    expect(
      resolveLandlordAssignment(baseDraft, {
        isLandlordUser: false,
        currentUserId: 'u-1',
        agencyId: 'ag-1',
        users: [],
        createUser: vi.fn(),
      }),
    ).toBe('')
  })

  it('creates a landlord when manual details are provided', () => {
    const createUser = vi.fn(() => ({
      id: 'u-new',
      name: 'Jane Owner',
      email: 'jane@example.com',
      role: 'landlord' as const,
      agencyId: 'ag-1',
      active: true,
    }))

    const id = resolveLandlordAssignment(
      {
        ...baseDraft,
        linkLandlord: true,
        landlordEntryMode: 'manual',
        landlordManualName: 'Jane Owner',
        landlordManualEmail: 'jane@example.com',
      },
      {
        isLandlordUser: false,
        currentUserId: 'u-1',
        agencyId: 'ag-1',
        users: [],
        createUser,
      },
    )

    expect(id).toBe('u-new')
    expect(createUser).toHaveBeenCalledOnce()
    const created = createUser.mock.calls[0][0]
    expect(created.role).toBe('landlord')
    expect(created.verification?.status).toBe('pending')
    expect(created.verification?.status).not.toBe('not_required')
    expect(created.verification?.submittedAt).toEqual(expect.any(String))
  })

  it('Michael #96: a new landlord hands the server-generated temp password to the one-time modal', async () => {
    const shown: Array<{ tempPassword: string; title: string }> = []
    const { onTempPasswordShown, showTempPasswordOnce } = await import('../../lib/auth/tempPasswordBus')
    const off = onTempPasswordShown((x) => shown.push(x))
    const fixture = ['gen', 'temp', 'fixture'].join('-')
    const createUser = vi.fn((input: { onTempPassword?: (pw: string) => void }) => {
      // AppStore.createUser calls this once the server create answers with tempPassword.
      input.onTempPassword?.(fixture)
      return { id: 'u-new2', name: 'Lee Owner', email: 'lee@example.com', role: 'landlord' as const, agencyId: 'ag-1', active: true }
    })
    resolveLandlordAssignment(
      { ...baseDraft, linkLandlord: true, landlordEntryMode: 'manual', landlordManualName: 'Lee Owner', landlordManualEmail: 'lee@example.com' },
      {
        isLandlordUser: false,
        currentUserId: 'u-1',
        agencyId: 'ag-1',
        users: [],
        createUser,
        onTempPassword: (pw) => showTempPasswordOnce(pw, 'Landlord created: temporary password'),
      },
    )
    off()
    expect(createUser.mock.calls[0][0]).not.toHaveProperty('tempPassword')
    expect(createUser.mock.calls[0][0]).not.toHaveProperty('password')
    expect(shown).toEqual([{ tempPassword: fixture, title: 'Landlord created: temporary password' }])
  })
})
