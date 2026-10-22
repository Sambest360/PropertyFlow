import type { Application } from '../../types/domain.js'
import { resolveWorkflowStatus, type WorkflowStatusKey } from '../applicationWorkflow.js'
import { hasAllAdultCreditConsents } from '../screening/creditConsent.js'
import type { JourneyStep } from './types.js'

function journeySteps(app: Application): JourneyStep[] {
  return app.journeySnapshot?.steps ?? []
}

function enabledSteps(app: Application): JourneyStep[] {
  return journeySteps(app).filter((s) => s.enabled)
}

function statusInStep(step: JourneyStep, status: WorkflowStatusKey): boolean {
  return step.statusKeys.includes(status)
}

function stepForStatus(app: Application, status: WorkflowStatusKey): JourneyStep | undefined {
  return enabledSteps(app).find((s) => statusInStep(s, status))
}

export function documentKeysForApp(app: Application): string[] {
  const keys = new Set<string>()
  for (const step of enabledSteps(app)) {
    for (const k of step.docKeys ?? []) keys.add(k)
  }
  return [...keys]
}

function resolveStatus(app: Application): WorkflowStatusKey {
  return resolveWorkflowStatus(app)
}

export function requiredStepsComplete(app: Application): boolean {
  const status = resolveStatus(app)
  for (const step of enabledSteps(app)) {
    if (!step.required) continue
    if (step.gate === 'credit_consent' && !hasAllAdultCreditConsents(app)) return false
    const maxOrder = Math.max(...step.statusKeys.map((k) => statusRank(k)))
    const currentRank = statusRank(status)
    if (currentRank < maxOrder && step.required) {
      // Step not yet reached — only block forward transitions via canTransition
      continue
    }
  }
  return true
}

function statusRank(status: WorkflowStatusKey): number {
  const order: WorkflowStatusKey[] = [
    'application_started',
    'application_submitted',
    'documents_requested',
    'documents_uploaded',
    'fica_verification',
    'employment_verification',
    'income_verification',
    'reference_checks',
    'credit_check',
    'affordability_assessment',
    'agent_review',
    'landlord_review',
    'conditionally_approved',
    'deposit_invoice_sent',
    'deposit_paid',
    'deposit_verified',
    'lease_sent',
    'tenant_signed',
    'landlord_signed',
    'inspection_scheduled',
    'inspection_completed',
    'keys_handed_over',
    'active_tenancy',
  ]
  const idx = order.indexOf(status)
  return idx >= 0 ? idx : 0
}

/**
 * Returns false when the journey snapshot disables the target status step.
 */
export function canTransition(
  app: Application,
  from: WorkflowStatusKey,
  to: WorkflowStatusKey,
): true | string {
  if (!app.journeySnapshot?.steps?.length) return true
  if (to === 'rejected' || to === 'withdrawn' || to === 'cancelled') return true

  const targetStep = stepForStatus(app, to)
  if (targetStep && !targetStep.enabled) {
    return 'This step is disabled for your agency journey.'
  }

  if (to === 'credit_check' || from === 'documents_uploaded' || to === 'affordability_assessment') {
    const consentStep = enabledSteps(app).find((s) => s.gate === 'credit_consent')
    if (consentStep?.required && !hasAllAdultCreditConsents(app)) {
      return 'All adults must provide NCA credit consent before a bureau check.'
    }
  }

  void from
  return true
}
