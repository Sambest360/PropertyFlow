import { describe, expect, it } from 'vitest'
import type { Application } from '../../types/domain'
import { DEFAULT_APPLICATION_PIPELINE, sanitizePipeline, stageApprovalGate } from './applicationPipeline'
import { applicationStopped, currentStage } from './stageProgress'

const app = (workflowStatus: string, extra: Partial<Application> = {}) =>
  ({ id: 'A1', type: 'Rental', workflowStatus, stage: 'x', documents: [], updatedAt: '2026-10-01', ...extra }) as unknown as Application

describe('stage progress', () => {
  it('older applications carry on where their old status left off', () => {
    expect(currentStage(DEFAULT_APPLICATION_PIPELINE, app('application_submitted')).stage?.kind).toBe('submitted')
    expect(currentStage(DEFAULT_APPLICATION_PIPELINE, app('documents_uploaded')).stage?.kind).toBe('documents')
    expect(currentStage(DEFAULT_APPLICATION_PIPELINE, app('credit_check')).stage?.kind).toBe('credit_check')
    expect(currentStage(DEFAULT_APPLICATION_PIPELINE, app('landlord_review')).stage?.kind).toBe('approval')
    expect(currentStage(DEFAULT_APPLICATION_PIPELINE, app('conditionally_approved')).stage?.kind).toBe('deposit')
    const done = currentStage(DEFAULT_APPLICATION_PIPELINE, app('documents_uploaded')).records
    expect(done.viewing?.inferred).toBe(true)
  })

  it('once stages are used, the records are the truth', () => {
    const a = app('deposit_verified', { stageRecords: { viewing: { status: 'approved', at: 'x', byName: 'S' } } })
    expect(currentStage(DEFAULT_APPLICATION_PIPELINE, a).stage?.kind).toBe('submitted')
  })

  it('a decline stops the application', () => {
    const a = app('credit_check', { stageRecords: { viewing: { status: 'declined', at: 'x', byName: 'S', reason: 'No' } } })
    expect(applicationStopped(a, currentStage(DEFAULT_APPLICATION_PIPELINE, a).records)).toBe(true)
  })

  it('documents only need to be in; identity documents never sit on the Documents stage', () => {
    const docs = DEFAULT_APPLICATION_PIPELINE.stages.find((s) => s.kind === 'documents')!
    const gate = stageApprovalGate(docs, { documents: docs.requiredDocs!.map((k) => ({ key: k, status: 'uploaded' })), ticked: [], notes: '' })
    expect(gate.ok).toBe(true)
    const p = sanitizePipeline({ stages: [{ key: 'documents', kind: 'documents', requiredDocs: ['id', 'payslips', 'fica'] }] })
    expect(p.stages[0].requiredDocs).toEqual(['payslips'])
  })

  it('credit check: the findings file or a note is enough', () => {
    const credit = DEFAULT_APPLICATION_PIPELINE.stages.find((s) => s.kind === 'credit_check')!
    expect(stageApprovalGate(credit, { documents: [], ticked: [], notes: '' }).ok).toBe(false)
    expect(stageApprovalGate(credit, { documents: [], ticked: [], notes: '', attachments: 1 }).ok).toBe(true)
    expect(stageApprovalGate(credit, { documents: [], ticked: [], notes: 'Score 680' }).ok).toBe(true)
  })
})
