import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addSaBusinessDays, isSaPublicHoliday, saBusinessDaysBetween } from './saPublicHolidays.js'
import {
  AVAILABLE_FROM_REQUIRED,
  LEASE_OVERLAP,
  NOTICE_TOO_SHORT,
  OUTSIDE_VIEWING_WINDOW,
  PUBLIC_OCCUPIED_ADVERT_SQL,
  computeAvailableFrom,
  computeNoticeEndDate,
  refuseOccupiedBooking,
  sanitizePublicUnit,
  shouldClearAdvert,
  successorStartAllowed,
} from './occupiedListing.js'

const MIGRATION = readFileSync('database/postgres/migrations/024_advertise_while_occupied.sql', 'utf8')

describe('advertise while occupied', () => {
  it('active lease ending 31 Jan with turnover 1 is available 1 Feb and the public RPC includes it', () => {
    const result = computeAvailableFrom({
      status: 'ACTIVE',
      endDate: '2027-01-31',
      noticeEndDate: null,
      turnoverDays: 1,
    })
    expect(result).toEqual({ availableFrom: '2027-02-01', reason: 'Lease ends 31 Jan 2027' })
    expect(MIGRATION).toContain('u.advertise_while_occupied = true')
    expect(MIGRATION).toContain('u.available_from IS NOT NULL')
    expect(MIGRATION).toContain(PUBLIC_OCCUPIED_ADVERT_SQL.split('\n')[0])
    expect(MIGRATION).not.toContain('tenant_id')
    expect(MIGRATION).not.toContain('visitor_email')
    expect(MIGRATION).not.toContain('visitor_phone')
    expect(MIGRATION).not.toContain('visitor_name')
  })

  it('rejects a booking 10 hours ahead and a slot outside the tenant window', () => {
    const now = new Date('2027-02-01T08:00:00Z')
    const windows = [{ weekday: 1, windowDate: null, startTime: '10:00', endTime: '12:00' }]
    expect(() =>
      refuseOccupiedBooking({
        occupiedAdvert: true,
        noticeHours: 24,
        startsAt: new Date(now.getTime() + 10 * 60 * 60 * 1000),
        now,
        slotDate: '2027-02-01',
        slotTime: '18:00',
        windows,
      }),
    ).toThrow(expect.objectContaining({ status: 400, code: NOTICE_TOO_SHORT }))

    expect(() =>
      refuseOccupiedBooking({
        occupiedAdvert: true,
        noticeHours: 24,
        startsAt: new Date('2027-02-03T09:00:00Z'),
        now,
        slotDate: '2027-02-03',
        slotTime: '09:00',
        windows,
      }),
    ).toThrow(expect.objectContaining({ status: 400, code: OUTSIDE_VIEWING_WINDOW }))
  })

  it('blocks a move-in that overlaps and allows 1 Feb', () => {
    const open = [{ start: '2026-06-01', end: '2027-01-31' }]
    expect(
      successorStartAllowed({ start: '2027-01-15', end: '2028-01-14', availableFrom: '2027-02-01', openLeases: open }),
    ).toBe(false)
    expect(
      successorStartAllowed({ start: '2027-02-01', end: '2028-01-31', availableFrom: '2027-02-01', openLeases: open }),
    ).toBe(true)
    expect(LEASE_OVERLAP).toBe('LEASE_OVERLAP')
  })

  it('fixed-term tenant notice is 20 SA business days, skipping public holidays', () => {
    const givenAt = '2026-12-14'
    const noticeEnd = computeNoticeEndDate({ givenAt, endDate: '2027-06-30' })
    expect(saBusinessDaysBetween(givenAt, noticeEnd)).toBe(20)
    expect(isSaPublicHoliday(noticeEnd)).toBe(false)
    expect(addSaBusinessDays('2026-09-23', 1)).toBe('2026-09-25')
    expect(computeNoticeEndDate({ givenAt: '2027-01-15', endDate: null })).toBe('2027-02-15')
  })

  it('public unit payload drops tenant PII', () => {
    const clean = sanitizePublicUnit({
      id: 'unit-1',
      available_from: '2027-02-01',
      tenant_id: 'hidden',
      tenant_name: 'E2E TEST',
      visitor_email: 'e2e-tenant@example.com',
      visitor_phone: '000',
    })
    expect(Object.keys(clean).sort()).toEqual(['available_from', 'id'])
    expect(JSON.stringify(clean)).not.toContain('e2e-tenant@example.com')
    expect(JSON.stringify(clean)).not.toContain('tenant_id')
  })

  it('refuses a month-to-month advert with no expected date and clears the advert when notice is withdrawn', () => {
    expect(
      computeAvailableFrom({
        status: 'ACTIVE',
        endDate: null,
        noticeEndDate: null,
        turnoverDays: 1,
      }),
    ).toEqual({ error: AVAILABLE_FROM_REQUIRED })
    expect(
      computeAvailableFrom({
        status: 'ACTIVE',
        endDate: null,
        noticeEndDate: null,
        turnoverDays: 1,
        expectedAvailableFrom: '2027-03-01',
        expectedReason: 'E2E TEST expected vacancy',
      }).availableFrom,
    ).toBe('2027-03-01')
    expect(shouldClearAdvert({ advertising: true, noticeWithdrawn: true })).toBe(true)
    expect(shouldClearAdvert({ advertising: true, previousEnd: '2027-01-31', nextEnd: '2028-01-31' })).toBe(true)
    expect(shouldClearAdvert({ advertising: false, noticeWithdrawn: true })).toBe(false)
  })
})
