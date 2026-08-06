export const CLOSED_LEAD_STAGES = ['Lease Signed', 'Sale Completed', 'Rejected'] as const

export type ClosedLeadStage = (typeof CLOSED_LEAD_STAGES)[number]

export function isClosedLeadStage(stage: string): boolean {
  return (CLOSED_LEAD_STAGES as readonly string[]).includes(stage)
}

export function isOpenLeadStage(stage: string): boolean {
  return !isClosedLeadStage(stage)
}

/** Human-readable lead timestamp from ISO date or datetime strings. */
export function formatLeadTime(
  value: string,
  mode: 'absolute' | 'relative' = 'absolute',
): string {
  const raw = value.trim()
  if (!raw) return '—'

  const hasTime = raw.includes('T') || /\d{1,2}:\d{2}/.test(raw)
  const parsed = new Date(hasTime ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return raw

  if (mode === 'relative') {
    const diffMs = Date.now() - parsed.getTime()
    const mins = Math.floor(diffMs / (1000 * 60))
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}
