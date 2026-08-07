import { describe, expect, it } from 'vitest'
import { canCloseLead, formatLeadTime, isClosedLeadStage, isOpenLeadStage } from './leadLifecycle'

describe('leadLifecycle', () => {
  it('classifies closed stages', () => {
    expect(isClosedLeadStage('Lease Signed')).toBe(true)
    expect(isClosedLeadStage('Sale Completed')).toBe(true)
    expect(isClosedLeadStage('Rejected')).toBe(true)
    expect(isOpenLeadStage('New Lead')).toBe(true)
    expect(isOpenLeadStage('Viewing Scheduled')).toBe(true)
  })

  it('allows managers or assigned agents to close open leads', () => {
    const lead = { stage: 'Contacted', agentId: 'u-agent' }
    expect(canCloseLead(lead, { userId: 'u-agent', canManageLeads: false })).toBe(true)
    expect(canCloseLead(lead, { userId: 'u-other', canManageLeads: true })).toBe(true)
    expect(canCloseLead(lead, { userId: 'u-other', canManageLeads: false })).toBe(false)
    expect(
      canCloseLead({ stage: 'Rejected', agentId: 'u-agent' }, { userId: 'u-agent', canManageLeads: true }),
    ).toBe(false)
  })

  it('formats date-only lead timestamps', () => {
    expect(formatLeadTime('2026-07-20')).toMatch(/Jul/)
  })
})
