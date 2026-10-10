import { describe, expect, it } from 'vitest'
import { getAvailableTransitions } from './applicationWorkflow'
import type { Application, Permission } from '../types/domain'

describe('CR10 nit 5: staff modal never offers TENANT_SIGNED', () => {
  it('at lease_sent staff get "Mark signed (paper)" (MARK_LEASE_SIGNED), not TENANT_SIGNED', () => {
    const app = { id: 'A', type: 'rental', status: 'Lease Sent', workflowStatus: 'lease_sent' } as unknown as Application
    const t = getAvailableTransitions(app, ['applications.review'] as Permission[])
    expect(t.map((x) => x.actionKey)).not.toContain('TENANT_SIGNED')
    const paper = t.find((x) => x.actionKey === 'MARK_LEASE_SIGNED')
    expect(paper?.label).toBe('Mark signed (paper)')
    expect(paper?.to).toBe('tenant_signed')
  })
})
