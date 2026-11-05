import { describe, expect, it } from 'vitest'
import { DEFAULT_APPLICATION_PIPELINE, currentStageIndex, resolvePipeline, sanitizePipeline, stageApprovalGate } from './applicationPipeline'

describe('application pipeline', () => {
  it('has the 10 default stages with the right ones locked', () => {
    expect(DEFAULT_APPLICATION_PIPELINE.stages.map((s) => s.key)).toEqual([
      'viewing', 'submitted', 'documents', 'identity', 'credit_check', 'agent_review', 'approval', 'deposit', 'lease', 'move_in',
    ])
    expect(DEFAULT_APPLICATION_PIPELINE.stages.filter((s) => !s.locked).map((s) => s.key)).toEqual(['credit_check', 'agent_review', 'approval'])
  })

  it('keeps locked stages as the platform set them, whatever the agency sends', () => {
    const agency = sanitizePipeline({
      stages: [
        { key: 'viewing', kind: 'viewing', label: 'Hacked', enabled: false },
        { key: 'pets', kind: 'custom', label: 'Pet interview', checklist: ['Met the dog'] },
        { key: 'credit_check', kind: 'credit_check', label: 'TPN check', enabled: true },
      ],
    })
    const r = resolvePipeline(DEFAULT_APPLICATION_PIPELINE, agency)
    expect(r.stages[0]).toMatchObject({ key: 'viewing', label: 'Viewing', enabled: true, locked: true })
    expect(r.stages.find((s) => s.key === 'pets')?.checklist).toEqual(['Met the dog'])
    for (const k of ['submitted', 'documents', 'identity', 'deposit', 'lease', 'move_in']) expect(r.stages.some((s) => s.key === k)).toBe(true)
    expect(r.stages.find((s) => s.key === 'credit_check')?.label).toBe('TPN check')
  })

  it('gates approval on verified documents, checklist and notes', () => {
    const docs = DEFAULT_APPLICATION_PIPELINE.stages.find((s) => s.key === 'identity')!
    expect(stageApprovalGate(docs, { documents: [{ key: 'id', status: 'uploaded' }], ticked: [], notes: '' }).ok).toBe(false)
    expect(
      stageApprovalGate(docs, { documents: ['id', 'address', 'fica'].map((key) => ({ key, status: 'verified' })), ticked: [], notes: '' }).ok,
    ).toBe(true)
    const credit = DEFAULT_APPLICATION_PIPELINE.stages.find((s) => s.key === 'credit_check')!
    expect(stageApprovalGate(credit, { documents: [], ticked: [], notes: '' }).ok).toBe(false)
  })

  it('finds the current stage', () => {
    const now = '2026-11-05T00:00:00Z'
    expect(currentStageIndex(DEFAULT_APPLICATION_PIPELINE, { viewing: { status: 'approved', at: now, byName: 'A' } })).toBe(1)
  })
})

describe('seed migration 039', () => {
  it('seeds exactly the default pipeline', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync('database/postgres/migrations/039_application_pipeline.sql', 'utf8')
    const json = sql.match(/'(\{"version".*\})'::jsonb/)?.[1]
    expect(json && JSON.parse(json)).toEqual(DEFAULT_APPLICATION_PIPELINE)
  })
})
