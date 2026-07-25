/**
 * Human-friendly date-time aggregations for display_metadata blocks.
 * Always Africa/Johannesburg for ZA demo tenants unless overridden.
 */

const DEFAULT_TZ = 'Africa/Johannesburg'

function parseDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input
  const raw = input.includes('T') || input.includes(' ') ? input : `${input}T12:00:00`
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** "Updated 2 mins ago", "Updated yesterday", "Updated 12 Jul 2026" */
export function relativeUpdated(input: string | Date | null | undefined, now = new Date()): string {
  const d = parseDate(input)
  if (!d) return 'Updated recently'
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 0) return `Updated ${formatWeekdayTime(d)}`
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Updated just now'
  if (mins < 60) return `Updated ${plural(mins, 'min')} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Updated ${plural(hours, 'hour')} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Updated yesterday'
  if (days < 7) return `Updated ${plural(days, 'day')} ago`
  return `Updated ${formatShortDate(d)}`
}

export function relativeCreated(input: string | Date | null | undefined): string {
  const d = parseDate(input)
  if (!d) return 'Created recently'
  return `Submitted ${formatShortDate(d)}`
}

/** "Scheduled for Tuesday at 14:00" */
export function relativeScheduled(
  dateInput: string | Date | null | undefined,
  timeInput?: string | null,
): string | null {
  const d = parseDate(dateInput)
  if (!d) return null
  if (timeInput && /^\d{1,2}:\d{2}/.test(timeInput)) {
    const [hh, mm] = timeInput.split(':')
    d.setHours(Number(hh), Number(mm), 0, 0)
  }
  return `Scheduled for ${formatWeekdayTime(d)}`
}

export function formatWeekdayTime(d: Date, timeZone = DEFAULT_TZ): string {
  const weekday = new Intl.DateTimeFormat('en-ZA', { weekday: 'long', timeZone }).format(d)
  const time = new Intl.DateTimeFormat('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(d)
  return `${weekday} at ${time}`
}

export function formatShortDate(d: Date, timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(d)
}

export function formatZARLabel(amount: number | null | undefined, suffix = ''): string | null {
  if (amount == null || Number.isNaN(amount)) return null
  const formatted = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
  return suffix ? `${formatted}${suffix}` : formatted
}

export function buildDisplayMetadata(params: {
  updatedAt?: string | Date | null
  createdAt?: string | Date | null
  scheduledAt?: string | Date | null
  scheduledTime?: string | null
  statusLabel: string
  primaryAmount?: number | null
  primarySuffix?: string
  secondaryAmount?: number | null
  secondarySuffix?: string
  timezone?: string
  now?: Date
}): import('./contracts').DisplayMetadata {
  return {
    updated_relative: relativeUpdated(params.updatedAt ?? params.createdAt, params.now),
    scheduled_relative: relativeScheduled(params.scheduledAt, params.scheduledTime),
    created_relative: params.createdAt ? relativeCreated(params.createdAt) : null,
    status_label: params.statusLabel,
    primary_amount_label: formatZARLabel(params.primaryAmount, params.primarySuffix ?? ''),
    secondary_amount_label: formatZARLabel(params.secondaryAmount, params.secondarySuffix ?? ''),
    timezone: params.timezone ?? DEFAULT_TZ,
  }
}
