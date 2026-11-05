/**
 * "How long ago" labels that stay right past the first day: just now,
 * 5 min ago, 3 h ago, yesterday, 2 days ago, 3 days ago … then the date.
 * Accepts ISO timestamps and plain YYYY-MM-DD dates (read as local midnight).
 */
function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input == null || input === '') return null
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input
  if (typeof input === 'number') return new Date(input)
  const s = String(input).trim()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

const DAY = 86_400_000

/** Whole calendar days between then and now (local time). */
export function calendarDaysAgo(then: Date, now: Date = new Date()): number {
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((b - a) / DAY)
}

export function relativeAge(input: string | number | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(input)
  if (!d) return '—'
  const dateOnly = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())
  const diff = now.getTime() - d.getTime()
  if (diff < 0) {
    // Future (scheduled things)
    const days = -calendarDaysAgo(d, now)
    if (days === 0) return dateOnly ? 'today' : `today ${d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`
    if (days === 1) return 'tomorrow'
    if (days < 7) return `in ${days} days`
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
  }
  const days = calendarDaysAgo(d, now)
  if (!dateOnly && days === 0) {
    const min = Math.floor(diff / 60_000)
    if (min < 1) return 'just now'
    if (min < 60) return `${min} min ago`
    return `${Math.floor(min / 60)} h ago`
  }
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}
