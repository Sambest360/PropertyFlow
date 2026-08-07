export const CLOSED_LEAD_STAGES = ['Lease Signed', 'Sale Completed', 'Rejected'] as const

export type ClosedLeadStage = (typeof CLOSED_LEAD_STAGES)[number]

export type LeadCloseInput = {
  stage: ClosedLeadStage
  reason: string
}

export function isClosedLeadStage(stage: string): boolean {
  return (CLOSED_LEAD_STAGES as readonly string[]).includes(stage)
}

export function isOpenLeadStage(stage: string): boolean {
  return !isClosedLeadStage(stage)
}

/** Closed stages an agent may pick when manually closing a lead. */
export function closeOutcomesForLeadType(type: 'Buy' | 'Rent'): ClosedLeadStage[] {
  return type === 'Rent' ? ['Lease Signed', 'Rejected'] : ['Sale Completed', 'Rejected']
}

export function closeOutcomeMeta(stage: ClosedLeadStage): {
  label: string
  blurb: string
  tone: 'success' | 'danger'
} {
  if (stage === 'Lease Signed') {
    return {
      label: 'Lease signed',
      blurb: 'The enquiry converted — tenancy agreed and lease signed.',
      tone: 'success',
    }
  }
  if (stage === 'Sale Completed') {
    return {
      label: 'Sale completed',
      blurb: 'The enquiry converted — property sold to this buyer.',
      tone: 'success',
    }
  }
  return {
    label: 'Rejected / lost',
    blurb: 'The enquiry closed without converting — budget, timing, or another property.',
    tone: 'danger',
  }
}

export function closeOutcomeHistoryLabel(stage: ClosedLeadStage): string {
  if (stage === 'Rejected') return 'rejected'
  if (stage === 'Lease Signed') return 'lease signed'
  return 'sale completed'
}

/** Managers or the assigned agent may close an open lead. */
export function canCloseLead(
  lead: { stage: string; agentId: string | null },
  opts: { userId: string; canManageLeads: boolean },
): boolean {
  if (isClosedLeadStage(lead.stage)) return false
  return opts.canManageLeads || lead.agentId === opts.userId
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
