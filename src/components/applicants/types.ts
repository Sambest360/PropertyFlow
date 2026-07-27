import type { Application } from '../../types/domain'

export const VIEW_STORAGE_KEY = 'propertyflow-applications-view'

export type ApplicantAttentionFilter =
  | 'all'
  | 'progress'
  | 'credit'
  | 'tenancy'
  | 'rejected'

export type PortfolioApplicant = {
  application: Application
  propertyTitle: string
  agentName: string | null
  gridIndependent: boolean
  premium: boolean
}

export function applicantAttention(item: PortfolioApplicant): ApplicantAttentionFilter {
  const stage = item.application.stage
  if (stage === 'Rejected' || stage === 'Blocked') return 'rejected'
  if (stage === 'Active Tenancy') return 'tenancy'
  if (stage === 'Credit Check') return 'credit'
  return 'progress'
}

export function matchesApplicantAttention(
  item: PortfolioApplicant,
  attention: ApplicantAttentionFilter,
) {
  if (attention === 'all') return true
  return applicantAttention(item) === attention
}
