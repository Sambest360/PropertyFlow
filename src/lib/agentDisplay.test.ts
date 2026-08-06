import { describe, expect, it } from 'vitest'
import {
  agentAssigneeLabel,
  agentMetaRow,
  agentsForProperty,
  isSelfAgent,
  listedByAgentPhrase,
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

  it('locks property agent field for the linked agent', () => {
    expect(shouldLockPropertyAgentField('u-james', 'u-james')).toBe(true)
    expect(shouldLockPropertyAgentField('u-lerato', 'u-james')).toBe(false)
  })
})
