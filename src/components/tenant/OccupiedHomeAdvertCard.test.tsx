import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatStartsAt } from './OccupiedHomeAdvertCard'

// T10 (Angela r5): starts_at is the SAST wall clock stored with a Z label (app convention),
// so the tenant card must format it in UTC, never in the browser's own zone.
const SRC = readFileSync(resolve(__dirname, 'OccupiedHomeAdvertCard.tsx'), 'utf8')

describe('OccupiedHomeAdvertCard: viewing request times (T10)', () => {
  it('formats with timeZone UTC (shows the stored wall clock)', () => {
    const body = SRC.slice(SRC.indexOf('export function formatStartsAt'), SRC.indexOf('export function OccupiedHomeAdvertCard'))
    expect(body).toMatch(/toLocaleString\('en-ZA', \{[^}]*timeZone: 'UTC',[^}]*\}\)/s)
  })

  it('the wall clock is shown as stored, whatever zone the browser is in', () => {
    // 14:00 SAST stored as 14:00Z: the tenant sees 14:00, not 16:00 (SAST browser) or 09:00 (New York).
    const out = formatStartsAt('2027-02-01T14:00:00.000Z')
    expect(out).toContain('14:00')
    for (const zone of ['Africa/Johannesburg', 'America/New_York', 'Asia/Tokyo']) {
      const local = new Date('2027-02-01T14:00:00.000Z').toLocaleString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: zone })
      expect(out.includes(local), zone).toBe(false)
    }
  })

  it('a late-evening slot keeps its own day (no shift past midnight)', () => {
    const out = formatStartsAt('2027-02-01T23:30:00.000Z')
    expect(out).toContain('23:30')
    expect(out).toMatch(/Mon/)
    expect(out).toMatch(/\b0?1 Feb\b/)
    expect(out).not.toMatch(/Tue/)
  })

  it('an unparseable value is returned unchanged', () => {
    expect(formatStartsAt('not-a-date')).toBe('not-a-date')
  })
})
