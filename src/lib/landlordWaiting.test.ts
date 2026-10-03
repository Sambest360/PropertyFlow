import { describe, expect, it } from 'vitest'
import { seedUsers } from '../data/seed'
import { buildLandlordWaitingList } from './landlordWaiting'
import { isVerificationApproved } from './verification'
import type { AppUser } from '../types/domain'

const landlord = (patch: Partial<AppUser> & Pick<AppUser, 'id' | 'name'>): AppUser => ({
  email: `${patch.id}@example.com`,
  role: 'landlord',
  agencyId: 'ag-1',
  active: true,
  ...patch,
})

describe('landlord waiting list', () => {
  it('shows pending landlords with name, submitted time, role, and status', () => {
    const view = buildLandlordWaitingList([
      landlord({
        id: 'u-new',
        name: 'New Owner',
        verification: { status: 'pending', submittedAt: '2026-10-03T08:15:00.000Z' },
      }),
      landlord({
        id: 'u-contractor-shaped',
        name: 'Not A Landlord',
        role: 'contractor',
        verification: { status: 'pending', submittedAt: '2026-10-01T00:00:00.000Z' },
      }),
      landlord({
        id: 'u-approved',
        name: 'Already Approved',
        verification: { status: 'approved', submittedAt: '2026-09-01T00:00:00.000Z' },
      }),
    ])

    expect(view.rows).toEqual([
      {
        userId: 'u-new',
        name: 'New Owner',
        submittedAt: '2026-10-03T08:15:00.000Z',
        role: 'landlord',
        status: 'pending',
        href: '/workspace/admin/users/u-new',
      },
    ])
    expect(view.actions).toEqual([])
    expect(JSON.stringify(view)).not.toMatch(/approve|decline/i)
  })

  it('shows nothing when there are no pending landlords', () => {
    const view = buildLandlordWaitingList([
      landlord({ id: 'u-seed', name: 'Horizon Trust' }),
      landlord({
        id: 'u-ok',
        name: 'Approved Owner',
        verification: { status: 'approved' },
      }),
    ])
    expect(view.rows).toEqual([])
    expect(view.actions).toEqual([])
  })

  it('does not treat seed landlords with no verification object as pending', () => {
    const landlords = seedUsers.filter((user) => user.role === 'landlord')
    expect(landlords.length).toBeGreaterThan(0)
    for (const user of landlords) {
      expect(user.verification).toBeUndefined()
      expect(isVerificationApproved(user.verification, user.role)).toBe(true)
    }
    expect(buildLandlordWaitingList(seedUsers).rows).toEqual([])
  })
})
