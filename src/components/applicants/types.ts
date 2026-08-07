import type { Application } from '../../types/domain'
import {
  applicationPipelineBucket,
  matchesPipelineBucket,
  type ApplicationPipelineBucket,
} from '../../lib/applicationPipeline'

export const VIEW_STORAGE_KEY = 'propertyflow-applications-view'

/** @deprecated use ApplicationPipelineBucket */
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
  const bucket = applicationPipelineBucket(item.application)
  if (bucket === 'rejected') return 'rejected'
  if (bucket === 'completed') return 'tenancy'
  if (bucket === 'credit_checks') return 'credit'
  return 'progress'
}

export function matchesApplicantAttention(
  item: PortfolioApplicant,
  attention: ApplicantAttentionFilter,
) {
  if (attention === 'all') return true
  return applicantAttention(item) === attention
}

export function matchesPipelineBucketFilter(
  item: PortfolioApplicant,
  bucket: ApplicationPipelineBucket,
): boolean {
  return matchesPipelineBucket(item.application, bucket)
}

export type { ApplicationPipelineBucket }
