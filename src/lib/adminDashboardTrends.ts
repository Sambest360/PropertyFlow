/** Trend series for the admin dashboard charts (data from GET /api/admin/dashboard). */
import type { TrendPoint } from './api/adminDashboardApi'

/**
 * Points for one metric over the chosen range (daily for 30 days, weekly sums
 * for 90, each week dated by its first day), plus the total of the range
 * before it when the series reaches back that far.
 */
export function seriesFor(trends: TrendPoint[], key: keyof Omit<TrendPoint, 'date'>, days: number) {
  const values = trends.map((t) => ({ date: t.date, value: (t[key] as number | null) ?? 0 }))
  const daily = values.slice(-days)
  const before = values.slice(-days * 2, -days)
  const previousTotal = before.length === days ? before.reduce((a, p) => a + p.value, 0) : null
  if (days <= 31) return { points: daily, previousTotal, unit: 'day' as const }
  const points: typeof daily = []
  // Weeks end on the latest day, so the newest bucket is always a full week.
  for (let end = daily.length; end > 0; end -= 7) {
    const week = daily.slice(Math.max(0, end - 7), end)
    points.unshift({ date: week[0].date, value: week.reduce((a, p) => a + p.value, 0) })
  }
  return { points, previousTotal, unit: 'week' as const }
}
