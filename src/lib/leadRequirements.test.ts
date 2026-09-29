import { describe, expect, it } from 'vitest'
import type { Lead, LeadStageRequirement, LookupConfig } from '../types/domain'
import {
  isRequirementMet,
  makeCompletion,
  requirementsForStage,
  requirementsFromLookupMeta,
  stageProgressFor,
  stageRequirementsMet,
  unmetRequiredBetween,
} from './leadRequirements'

function row(keyValue: string, requirements: unknown): LookupConfig {
  return {
    id: `lk-${keyValue}`,
    clientId: 'ag-test',
    configType: 'LEAD_STAGE',
    keyValue,
    displayLabel: keyValue,
    isActive: true,
    sortOrder: 0,
    meta: { requirements },
  }
}

const ID_DOC: LeadStageRequirement = {
  id: 'req-1',
  kind: 'document',
  label: 'ID document',
  docType: 'ID',
  required: true,
}
const FEE: LeadStageRequirement = {
  id: 'req-2',
  kind: 'payment',
  label: 'Credit check fee',
  required: true,
}
const OPTIONAL_NOTE: LeadStageRequirement = {
  id: 'req-3',
  kind: 'note',
  label: 'Instructions',
  required: false,
}

function lead(stage: string, metadata?: Lead['metadata']): Lead {
  return {
    id: 'lead-1',
    agencyId: 'ag-test',
    propertyId: 'p-1',
    agentId: null,
    name: 'Test Lead',
    email: 't@example.com',
    phone: '',
    channel: '',
    stage,
    type: 'Rent',
    value: 0,
    notes: '',
    createdAt: '2026-09-20',
    updatedAt: '2026-09-20',
    metadata,
  }
}

describe('requirementsFromLookupMeta', () => {
  it('normalizes configured requirements and drops invalid rows', () => {
    const reqs = requirementsFromLookupMeta({
      requirements: [
        { kind: 'document', label: ' ID document ', docType: 'ID', required: true },
        { label: '' },
        'junk',
        { kind: 'payment', label: 'Fee' },
      ],
    })
    expect(reqs).toHaveLength(2)
    expect(reqs[0]).toMatchObject({ kind: 'document', label: 'ID document', docType: 'ID' })
    expect(reqs[1]).toMatchObject({ kind: 'payment', required: true })
    // Fallback ids exist and are stable strings (editor-assigned ids take precedence).
    expect(reqs.every((r) => r.id.length > 0)).toBe(true)
  })

  it('defaults unknown kinds to check and defaults to required', () => {
    const reqs = requirementsFromLookupMeta({ requirements: [{ label: 'Sign consent' }] })
    expect(reqs[0]).toMatchObject({ kind: 'check', required: true })
  })

  it('returns empty for absent or malformed meta', () => {
    expect(requirementsFromLookupMeta(null)).toEqual([])
    expect(requirementsFromLookupMeta({ requirements: 'nope' })).toEqual([])
  })
})

describe('requirementsForStage', () => {
  it('finds the active row by stage value', () => {
    const lookups = [row('Application Submitted', [{ kind: 'document', label: 'ID' }])]
    expect(requirementsForStage(lookups, 'Application Submitted')).toHaveLength(1)
    expect(requirementsForStage(lookups, 'Contacted')).toEqual([])
  })
})

describe('isRequirementMet', () => {
  it('is false until marked done', () => {
    expect(isRequirementMet(undefined, ID_DOC)).toBe(false)
    expect(isRequirementMet({ done: false }, ID_DOC)).toBe(false)
  })

  it('documents need a file or a note', () => {
    expect(isRequirementMet({ done: true }, ID_DOC)).toBe(false)
    expect(isRequirementMet({ done: true, file: { name: 'id.pdf', mimeType: 'application/pdf', dataUrl: 'data:' } }, ID_DOC)).toBe(true)
    expect(isRequirementMet({ done: true, note: 'Verified in person' }, ID_DOC)).toBe(true)
  })

  it('non-document kinds only need done', () => {
    expect(isRequirementMet({ done: true }, FEE)).toBe(true)
  })
})

describe('unmetRequiredBetween', () => {
  const stages = ['New Lead', 'Contacted', 'Viewing Scheduled', 'Viewing Completed', 'Application Submitted', 'Credit Check']
  const reqConfig = (stage: string) => {
    if (stage === 'Application Submitted') return [ID_DOC, OPTIONAL_NOTE]
    if (stage === 'Credit Check') return [FEE]
    return []
  }

  it('collects unmet required items across the forward path', () => {
    const l = lead('Viewing Completed')
    const unmet = unmetRequiredBetween(l, stages, 'Credit Check', reqConfig)
    expect(unmet.map((u) => u.requirement.id)).toEqual(['req-1', 'req-2'])
    expect(unmet[0].stage).toBe('Application Submitted')
  })

  it('respects satisfied completions', () => {
    const l = lead('Viewing Completed', {
      stageProgress: {
        'Application Submitted': { 'req-1': makeCompletion({ done: true, note: 'seen' }) },
        'Credit Check': { 'req-2': makeCompletion({ done: true, amount: 350 }) },
      },
    })
    expect(unmetRequiredBetween(l, stages, 'Credit Check', reqConfig)).toEqual([])
  })

  it('ignores optional requirements and backward/same-stage moves', () => {
    const l = lead('Application Submitted')
    expect(unmetRequiredBetween(l, stages, 'Contacted', reqConfig)).toEqual([])
    // Same stage — no path is crossed, so nothing is demanded.
    expect(unmetRequiredBetween(l, stages, 'Application Submitted', reqConfig)).toEqual([])
  })

  it('handles stages not in the pipeline', () => {
    expect(unmetRequiredBetween(lead('X'), stages, 'Credit Check', reqConfig)).toEqual([])
  })
})

describe('stageRequirementsMet', () => {
  it('null when the stage has no required items', () => {
    expect(stageRequirementsMet(lead('New Lead'), 'New Lead', () => [OPTIONAL_NOTE])).toBeNull()
    expect(stageRequirementsMet(lead('New Lead'), 'New Lead', () => [])).toBeNull()
  })

  it('reflects progress', () => {
    const l = lead('Credit Check')
    expect(stageRequirementsMet(l, 'Credit Check', () => [FEE])).toBe(false)
    const done = lead('Credit Check', {
      stageProgress: stageProgressFor(l, 'Credit Check'),
    })
    void done
    const satisfied = lead('Credit Check', {
      stageProgress: { 'Credit Check': { 'req-2': makeCompletion({ done: true }) } },
    })
    expect(stageRequirementsMet(satisfied, 'Credit Check', () => [FEE])).toBe(true)
  })
})
