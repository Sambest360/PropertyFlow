import type { WorkflowStatusKey } from '../applicationWorkflow'

export type JourneyStepSource = 'regulation' | 'best_practice' | 'unknown'

export type JourneyStep = {
  key: string
  label: string
  applicantCopy?: string
  staffCopy?: string
  enabled: boolean
  required: boolean
  locked: boolean
  source: JourneyStepSource
  statusKeys: WorkflowStatusKey[]
  docKeys?: string[]
  gate?: string
}

export type ResolvedJourney = {
  version: number
  templateId: 'rental_sa_default'
  steps: JourneyStep[]
}

export type AgencyJourneyOverride = {
  version?: number
  steps?: Array<{
    key: string
    enabled?: boolean
    required?: boolean
    label?: string
    order?: number
  }>
}

export type JourneySnapshot = ResolvedJourney
