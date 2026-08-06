import { describe, expect, it } from 'vitest'
import type { AgencyContractor, AppUser } from '../types/domain'
import { isContractorApprovedForAgency, listApprovedContractors, listContractorsAvailableForRoster } from './contractors'

const users: AppUser[] = [
  {
    id: 'c1',
    name: 'AquaFix',
    email: 'a@x.com',
    role: 'contractor',
    agencyId: 'ag-1',
    active: true,
  },
  {
    id: 'c2',
    name: 'Bayfix',
    email: 'b@x.com',
    role: 'contractor',
    agencyId: 'ag-2',
    active: true,
  },
]

const roster: AgencyContractor[] = [
  {
    id: 'r1',
    agencyId: 'ag-1',
    contractorUserId: 'c1',
    status: 'approved',
    trades: ['PLUMBING'],
    addedAt: '2026-01-01',
    addedByUserId: null,
  },
]

describe('contractors', () => {
  it('lists approved agency contractors', () => {
    expect(listApprovedContractors(roster, users, 'ag-1')).toHaveLength(1)
    expect(listApprovedContractors(roster, users, 'ag-1', 'ELECTRICAL')).toHaveLength(0)
  })

  it('checks roster approval', () => {
    expect(isContractorApprovedForAgency(roster, 'ag-1', 'c1')).toBe(true)
    expect(isContractorApprovedForAgency(roster, 'ag-1', 'other')).toBe(false)
  })

  it('lists contractors available for roster including other agencies', () => {
    expect(listContractorsAvailableForRoster(roster, users, 'ag-1')).toEqual([users[1]])
    expect(listContractorsAvailableForRoster(roster, users, 'ag-2')).toEqual(users)
  })
})
