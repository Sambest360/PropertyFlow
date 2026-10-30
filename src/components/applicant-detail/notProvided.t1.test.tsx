import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/useAgentDisplay', () => ({
  useAgentDisplay: () => ({ label: (id: string | null, name: string | null) => name ?? id ?? '' }),
}))
vi.mock('../JobTitleSelect', () => ({ JobTitleSelect: () => null }))
import type { Application } from '../../types/domain'
import { ApplicantDetailsPanel } from './ApplicantDetailsPanel'
import { TenantApplicationDetailsForm } from '../tenant/TenantApplicationDetailsForm'

/** T1: empty applicant details read "Not provided"; employer stays optional. */
const app = (over: Partial<Application> = {}): Application =>
  ({
    id: 'APP-1',
    agencyId: 'ag-a',
    propertyId: 'p-a1',
    agentId: 'u-james',
    applicantName: 'Thandi Tenant',
    email: 'tenant@example.com',
    phone: '',
    type: 'Rental',
    status: 'submitted',
    income: 25000,
    employment: 'To be completed',
    documents: [],
    createdAt: '2026-10-30',
    ...over,
  }) as unknown as Application

const count = (html: string, s: string) => html.split(s).length - 1

describe('T1: "Not provided" for empty applicant details', () => {
  it('the agency panel says Not provided for phone, ID, employer and job title', () => {
    const html = renderToStaticMarkup(<ApplicantDetailsPanel application={app()} agentName={null} />)
    expect(count(html, 'Not provided')).toBe(4)
    expect(html).not.toContain('To be completed')
  })

  it('the agency panel shows the values (ID masked) when present', () => {
    const html = renderToStaticMarkup(
      <ApplicantDetailsPanel
        application={app({ phone: '0821234567', idNumberOrPassport: '8001015009087', employerName: 'Acme', jobTitle: 'Clerk' })}
        agentName={null}
      />,
    )
    expect(html).not.toContain('Not provided')
    expect(html).toContain('0821234567')
    expect(html).toContain('Acme')
    expect(html).toContain('9087')
    expect(html).not.toContain('8001015009087')
  })

  it("the applicant's form flags each empty field and keeps employer optional", () => {
    const html = renderToStaticMarkup(<TenantApplicationDetailsForm application={app()} onSave={() => {}} />)
    expect(count(html, 'Not provided')).toBe(4)
    expect(html).toContain('Employer (optional)')
    expect(html).not.toMatch(/placeholder="Company or organisation"[^>]*required/)
  })

  it('the form has no Not provided hint once the fields hold values', () => {
    const html = renderToStaticMarkup(
      <TenantApplicationDetailsForm
        application={app({ phone: '0821234567', idNumberOrPassport: '8001015009087', employerName: 'Acme', jobTitle: 'Clerk' })}
        onSave={() => {}}
      />,
    )
    expect(html).not.toContain('Not provided')
  })
})
