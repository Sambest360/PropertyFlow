/**
 * Where an application is in its Application Pipeline, including applications
 * started before the pipeline existed. Those have no stage records, so the
 * stages their old workflow status already passed count as done ("approved
 * earlier"), and the first one not passed is where staff carry on.
 *
 * Also: the old workflow status each approved stage moves the application to,
 * so lists, filters and the tenant portal stay in step.
 */
import type { Application } from '../../types/domain'
import { getStageDef, resolveWorkflowStatus, type WorkflowStatusKey } from '../applicationWorkflow'
import type { ApplicationPipeline, PipelineStage, StageKind, StageRecord } from './applicationPipeline'

/** The old workflow status at which each stage was already finished. */
const DONE_AT: Partial<Record<StageKind, WorkflowStatusKey>> = {
  viewing: 'application_started',
  submitted: 'documents_requested',
  documents: 'fica_verification',
  identity: 'employment_verification',
  credit_check: 'agent_review',
  agent_review: 'landlord_review',
  approval: 'conditionally_approved',
  deposit: 'deposit_verified',
  lease: 'landlord_signed',
  move_in: 'active_tenancy',
}

/** Old workflow status after staff approve a stage of this kind. */
export const STATUS_AFTER_APPROVAL: Partial<Record<StageKind, WorkflowStatusKey>> = {
  viewing: 'application_started',
  submitted: 'documents_requested',
  documents: 'documents_uploaded',
  identity: 'credit_check',
  credit_check: 'agent_review',
  agent_review: 'landlord_review',
  // approval: the approve call itself moves the application on.
  deposit: 'deposit_verified',
  lease: 'inspection_scheduled',
  move_in: 'active_tenancy',
}

const STOPPED: ReadonlySet<string> = new Set(['rejected', 'withdrawn', 'cancelled'])

function order(app: Application, status: WorkflowStatusKey): number {
  return getStageDef(app.type, status)?.order ?? -1
}

/**
 * Stage records with earlier progress filled in. Only for applications with no
 * records yet: once staff use the stages, the records are the truth (approving
 * a stage saves the filled-in ones with it).
 */
export function effectiveStageRecords(pipeline: ApplicationPipeline, app: Application): Record<string, StageRecord> {
  const own = app.stageRecords ?? {}
  if (Object.keys(own).length) return own
  const status = resolveWorkflowStatus(app)
  if (STOPPED.has(status)) return own
  const at = order(app, status)
  const out: Record<string, StageRecord> = {}
  for (const s of pipeline.stages) {
    const doneAt = DONE_AT[s.kind]
    if (s.enabled && doneAt && at >= order(app, doneAt)) {
      out[s.key] = { status: 'approved', at: app.updatedAt || app.submittedAt || new Date().toISOString(), byName: 'Earlier', inferred: true }
    }
  }
  // Stages count in order: stop at the first one not done.
  const enabled = pipeline.stages.filter((s) => s.enabled)
  const firstOpen = enabled.findIndex((s) => !out[s.key])
  if (firstOpen >= 0) for (const s of enabled.slice(firstOpen)) delete out[s.key]
  return out
}

export function currentStage(pipeline: ApplicationPipeline, app: Application): { index: number; stage: PipelineStage | null; records: Record<string, StageRecord> } {
  const records = effectiveStageRecords(pipeline, app)
  const enabled = pipeline.stages.filter((s) => s.enabled)
  const index = enabled.findIndex((s) => records[s.key]?.status !== 'approved')
  return { index: index === -1 ? enabled.length : index, stage: index === -1 ? null : enabled[index], records }
}

/** True when the application was declined or withdrawn. */
export function applicationStopped(app: Application, records: Record<string, StageRecord>): boolean {
  if (Object.values(records).some((r) => r.status === 'declined')) return true
  return STOPPED.has(resolveWorkflowStatus(app)) || app.stage === 'Rejected'
}
