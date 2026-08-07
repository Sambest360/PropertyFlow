import { describe, expect, it } from 'vitest'
import type { Application, Lead, Viewing } from '../types/domain'
import {
  buildLeadStageContext,
  findLeadApplications,
  leadContactMatches,
  normalizeLeadStageKey,
} from './leadContext'

const lead: Lead = {
  id: 'LD-1',
  agencyId: 'ag-1',
  propertyId: 'PR-1',
  agentId: 'u-1',
  name: 'Amy Visser',
  email: 'amy.visser@propertyflow.demo',
  phone: '+27 73 880 5511',
  channel: 'Web Form',
  stage: 'Application Submitted',
  type: 'Rent',
  value: 12850,
  notes: '',
  createdAt: '2026-07-20',
  updatedAt: '2026-07-22',
}

describe('leadContext', () => {
  it('matches contacts by email or name', () => {
    expect(leadContactMatches(lead, { email: 'amy.visser@propertyflow.demo' })).toBe(true)
    expect(leadContactMatches(lead, { name: 'Amy Visser' })).toBe(true)
    expect(leadContactMatches(lead, { email: 'other@x.com', name: 'Other Person' })).toBe(false)
  })

  it('finds applications for the same property and contact', () => {
    const apps: Application[] = [
      {
        id: 'APP-1',
        agencyId: 'ag-1',
        propertyId: 'PR-1',
        agentId: 'u-1',
        applicantUserId: null,
        applicantName: 'Amy Visser',
        email: 'amy.visser@propertyflow.demo',
        phone: '',
        type: 'Rental',
        stage: 'Application Submitted',
        progress: 40,
        income: 45000,
        employment: 'Employed',
        creditCheck: 'Not Started',
        creditConsent: true,
        documents: [],
        docs: [],
        viewingSlotId: null,
        notes: '',
        submittedAt: '2026-07-21',
        updatedAt: '2026-07-22',
      },
    ]
    expect(findLeadApplications(lead, apps)).toHaveLength(1)
  })

  it('builds application links at application submitted stage', () => {
    const apps: Application[] = [
      {
        id: 'APP-1',
        agencyId: 'ag-1',
        propertyId: 'PR-1',
        agentId: 'u-1',
        applicantUserId: null,
        applicantName: 'Amy Visser',
        email: 'amy.visser@propertyflow.demo',
        phone: '',
        type: 'Rental',
        stage: 'Under Review',
        progress: 55,
        income: 45000,
        employment: 'Employed',
        creditCheck: 'In Progress',
        creditConsent: true,
        documents: [],
        docs: [],
        viewingSlotId: null,
        notes: '',
        submittedAt: '2026-07-21',
        updatedAt: '2026-07-22',
      },
    ]
    const ctx = buildLeadStageContext(lead, {
      property: {
        id: 'PR-1',
        title: '2-bed Gardens apartment',
      } as import('../types/domain').PropertyAsset,
      applications: apps,
      viewings: [] as Viewing[],
      payments: [],
    })
    expect(normalizeLeadStageKey('Application Submitted')).toBe('application_submitted')
    expect(ctx.links.some((l) => l.href.includes('/sales/applications/APP-1'))).toBe(true)
    expect(ctx.facts.some((f) => f.label === 'Application stage')).toBe(true)
  })
})
