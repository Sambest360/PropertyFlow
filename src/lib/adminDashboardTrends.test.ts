import { describe, expect, it } from 'vitest'
import { seriesFor } from './adminDashboardTrends'
import type { TrendPoint } from './api/adminDashboardApi'

const trends: TrendPoint[] = Array.from({ length: 90 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 7, 3 + i)).toISOString().slice(0, 10),
  leads: 1,
  applications: i >= 60 ? 2 : 0,
  payments: null,
  paymentsAmount: null,
  users: null,
}))

describe('seriesFor', () => {
  it('30 days: daily points and the 30 days before as the comparison', () => {
    const s = seriesFor(trends, 'applications', 30)
    expect(s.unit).toBe('day')
    expect(s.points).toHaveLength(30)
    expect(s.points.at(-1)?.date).toBe(trends[89].date)
    expect(s.previousTotal).toBe(0)
  })

  it('90 days: weekly sums ending on the latest day, no comparison', () => {
    const s = seriesFor(trends, 'leads', 90)
    expect(s.unit).toBe('week')
    expect(s.points).toHaveLength(13)
    expect(s.points.at(-1)).toEqual({ date: trends[83].date, value: 7 })
    expect(s.points[0].value).toBe(6)
    expect(s.points.reduce((a, p) => a + p.value, 0)).toBe(90)
    expect(s.previousTotal).toBeNull()
  })

  it('treats a hidden series (null) as zero', () => {
    expect(seriesFor(trends, 'payments', 30).points.every((p) => p.value === 0)).toBe(true)
  })
})
