import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Lead, PropertyAsset, Viewing } from '../../types/domain'

const lead: Lead = {
  id: 'LD-1',
  agencyId: 'ag-1',
  propertyId: 'PR-1',
  agentId: 'u-1',
  name: 'Amy Visser',
  email: 'amy@example.com',
  phone: '+27 73 880 5511',
  channel: 'Web Form',
  stage: 'Viewing Scheduled',
  type: 'Rent',
  value: 12850,
  notes: '',
  createdAt: '2026-07-20',
  updatedAt: '2026-07-22',
}

const property = {
  id: 'PR-1',
  title: '2 Bedroom Apartment',
  suburb: 'Pinelands',
  city: 'Cape Town',
  rent: 12850,
} as PropertyAsset

const scheduledViewing: Viewing = {
  id: 'V-1',
  agencyId: 'ag-1',
  propertyId: 'PR-1',
  slotId: 'slot-1',
  applicantName: 'Amy Visser',
  applicantEmail: 'amy@example.com',
  date: '2026-10-19',
  time: '10:00',
  status: 'Scheduled',
  attendance: 'Pending',
  feedback: '',
}

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, has: () => true }),
}))
vi.mock('../../hooks/useAgentDisplay', () => ({
  useAgentDisplay: () => ({ label: () => 'Agent' }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  }
})

import { LeadOverviewPanel } from './LeadOverviewPanel'

describe('LeadOverviewPanel viewings', () => {
  it('does not show Schedule viewing when a scheduled booking exists', () => {
    const html = renderToStaticMarkup(
      <LeadOverviewPanel
        lead={lead}
        property={property}
        agentName="Agent"
        viewings={[scheduledViewing]}
        applications={[]}
        canSchedule
        onScheduleViewing={() => {}}
      />,
    )
    expect(html).toContain('2026-10-19')
    expect(html).not.toContain('Schedule viewing')
  })

  it('shows one Schedule viewing when none booked', () => {
    const html = renderToStaticMarkup(
      <LeadOverviewPanel
        lead={{ ...lead, stage: 'Contacted' }}
        property={property}
        agentName="Agent"
        viewings={[]}
        applications={[]}
        canSchedule
        onScheduleViewing={() => {}}
      />,
    )
    expect((html.match(/Schedule viewing/g) ?? []).length).toBe(1)
  })
})
