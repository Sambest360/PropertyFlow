import { describe, expect, it } from 'vitest'
import {
  agentAssigneeLabel,
  agentMetaRow,
  agentsForProperty,
  isSelfAgent,
  listedByAgentPhrase,
  resolveApplicationAgentName,
  shouldLockPropertyAgentField,
} from './agentDisplay'

const AGENTS = [
  { id: 'u-james', name: 'James Okonkwo' },
  { id: 'u-lerato', name: 'Lerato Nkosi' },
]

describe('agentDisplay', () => {
  it('detects self agent', () => {
    expect(isSelfAgent('u-james', 'u-james')).toBe(true)
    expect(isSelfAgent('u-james', 'u-priya')).toBe(false)
    expect(isSelfAgent(null, 'u-james')).toBe(false)
  })

  it('hides label for self agent', () => {
    expect(agentAssigneeLabel('u-james', 'u-james', 'James Okonkwo')).toBeNull()
    expect(agentAssigneeLabel('u-lerato', 'u-james', 'James Okonkwo')).toBe('James Okonkwo')
    expect(agentAssigneeLabel('u-lerato', null, null, 'Unassigned')).toBe('Unassigned')
  })

  it('builds meta rows only for other agents', () => {
    expect(agentMetaRow('u-james', 'u-james', 'James Okonkwo')).toBeNull()
    expect(agentMetaRow('u-lerato', 'u-james', 'James Okonkwo')).toEqual({
      label: 'Agent',
      value: 'James Okonkwo',
    })
  })

  it('builds listed-by phrase for others only', () => {
    expect(listedByAgentPhrase('u-james', 'u-james', 'James Okonkwo')).toBeNull()
    expect(listedByAgentPhrase('u-lerato', 'u-james', 'James Okonkwo')).toBe('James Okonkwo')
  })

  it('limits property agent options to the linked agent', () => {
    expect(agentsForProperty('u-james', AGENTS)).toEqual([{ id: 'u-james', name: 'James Okonkwo' }])
    expect(agentsForProperty('u-unknown', AGENTS)).toEqual([])
    expect(agentsForProperty(null, AGENTS)).toEqual([])
  })

  // P0-agent (R8): application agent comes from the LISTING only — never the
  // application row's stale agent_id ("James Okonkwo with no assignment").
  describe('resolveApplicationAgentName', () => {
    it('returns the listing agent', () => {
      expect(
        resolveApplicationAgentName({ agentId: 'u-james' }, { id: 'APP-1' }, AGENTS),
      ).toBe('James Okonkwo')
    })

    it('returns null when the listing has no agent (Unassigned) — even with a stale row agent', () => {
      expect(
        resolveApplicationAgentName({ agentId: null }, { id: 'APP-1', agentId: 'u-james' }, AGENTS),
      ).toBeNull()
      expect(
        resolveApplicationAgentName({ agentId: '' }, { id: 'APP-1', agentId: 'u-james' }, AGENTS),
      ).toBeNull()
    })

    it('returns null without a listing — no fallback to the row agent', () => {
      expect(resolveApplicationAgentName(null, { id: 'APP-1', agentId: 'u-james' }, AGENTS)).toBeNull()
    })

    it('returns null when the listing agent id has no user row (no invented people)', () => {
      expect(
        resolveApplicationAgentName({ agentId: 'u-ghost' }, { id: 'APP-1' }, AGENTS),
      ).toBeNull()
    })
  })

  it('locks property agent field for the linked agent', () => {
    expect(shouldLockPropertyAgentField('u-james', 'u-james')).toBe(true)
    expect(shouldLockPropertyAgentField('u-lerato', 'u-james')).toBe(false)
  })
})
