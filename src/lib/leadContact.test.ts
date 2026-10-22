import { describe, expect, it } from 'vitest'
import {
  findExistingLeadThread,
  leadThreadSubject,
  mailtoUrlForLead,
  resolveLeadPortalUser,
  whatsappUrlForLead,
} from './leadContact'
import type { Lead, MessageThread } from '../types/domain'

const lead: Lead = {
  id: 'LD-1',
  agencyId: 'AG-1',
  propertyId: 'PR-1',
  agentId: 'u-agent',
  name: 'Thabo',
  email: 'thabo@example.com',
  phone: '+27 82 123 4567',
  channel: 'Web',
  stage: 'New Lead',
  type: 'Rent',
  value: 10000,
  notes: '',
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
}

describe('leadContact', () => {
  it('whatsappUrlForLead normalizes SA phone', () => {
    expect(whatsappUrlForLead(lead)).toBe('https://wa.me/27821234567')
    expect(whatsappUrlForLead({ phone: '123' })).toBeNull()
  })

  it('mailtoUrlForLead includes property subject', () => {
    const url = mailtoUrlForLead(lead, { title: 'Flat 1' })
    expect(url).toContain('mailto:thabo%40example.com')
    expect(url).toContain('Enquiry')
  })

  it('resolveLeadPortalUser matches email and prefers tenant', () => {
    const users = [
      { id: 'u-tenant', email: 'thabo@example.com', role: 'tenant', name: 'T', agencyId: null, active: true },
      { id: 'u-agent', email: 'agent@example.com', role: 'agent_admin', name: 'A', agencyId: 'AG-1', active: true },
    ]
    expect(resolveLeadPortalUser(users, lead)?.id).toBe('u-tenant')
  })

  it('resolveLeadPortalUser uses application applicantUserId', () => {
    const users = [
      { id: 'u-app', email: 'other@example.com', role: 'tenant', name: 'T', agencyId: null, active: true },
    ]
    const apps = [
      {
        id: 'APP-1',
        propertyId: 'PR-1',
        email: 'thabo@example.com',
        applicantUserId: 'u-app',
        agencyId: 'AG-1',
      },
    ] as import('../types/domain').Application[]
    expect(resolveLeadPortalUser(users, lead, apps)?.id).toBe('u-app')
  })

  it('findExistingLeadThread matches agency property and lead id in subject', () => {
    const threads: MessageThread[] = [
      {
        id: 'TH-1',
        agencyId: 'AG-1',
        propertyId: 'PR-1',
        applicationId: null,
        subject: leadThreadSubject(lead, { title: 'Flat' }),
        participantIds: ['u-agent', 'u-tenant'],
        routesTo: 'agent',
        updatedAt: '',
      },
    ]
    expect(findExistingLeadThread(threads, lead, 'u-tenant')?.id).toBe('TH-1')
    expect(findExistingLeadThread(threads, lead, 'u-other')).toBeNull()
  })
})
