import { describe, expect, it } from 'vitest'
import {
  agencyBlocksStaffAccess,
  agencyIsSelectable,
  mapAgencyStatusFromDb,
  mapAgencyStatusToDb,
} from './agencyStatus'

describe('agencyStatus', () => {
  it('maps DB statuses to front-end', () => {
    expect(mapAgencyStatusFromDb('active')).toBe('Active')
    expect(mapAgencyStatusFromDb('trial')).toBe('Active')
    expect(mapAgencyStatusFromDb('suspended')).toBe('Suspended')
    expect(mapAgencyStatusFromDb('cancelled')).toBe('Cancelled')
    expect(mapAgencyStatusFromDb('unknown')).toBe('Suspended')
  })

  it('maps front-end statuses to DB', () => {
    expect(mapAgencyStatusToDb('Active')).toBe('active')
    expect(mapAgencyStatusToDb('Suspended')).toBe('suspended')
    expect(mapAgencyStatusToDb('Cancelled')).toBe('cancelled')
  })

  it('blocks staff for suspended and cancelled', () => {
    expect(agencyBlocksStaffAccess('Active')).toBe(false)
    expect(agencyBlocksStaffAccess('Suspended')).toBe(true)
    expect(agencyBlocksStaffAccess('Cancelled')).toBe(true)
  })

  it('excludes cancelled from selectable agencies', () => {
    expect(agencyIsSelectable('Active')).toBe(true)
    expect(agencyIsSelectable('Suspended')).toBe(true)
    expect(agencyIsSelectable('Cancelled')).toBe(false)
  })
})
