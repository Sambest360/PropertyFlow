import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Application } from '../../types/domain'

vi.mock('../../hooks/useLookupOptions', () => ({
  useLookupOptions: () => [
    { value: 'Teacher', label: 'Teacher' },
    { value: 'NURSE', label: 'Nurse' },
  ],
}))

import { TenantApplicationDetailsForm } from './TenantApplicationDetailsForm'

describe('TenantApplicationDetailsForm', () => {
  it('saves only on the Save button, which is disabled until something changes', () => {
    const onSave = vi.fn()
    const app = {
      id: 'APP-1',
      applicantName: 'Alec Powers',
      email: 'a@example.com',
      phone: '0820000000',
      income: 0,
      employment: 'To be completed',
      documents: [],
    } as unknown as Application
    const html = renderToStaticMarkup(<TenantApplicationDetailsForm application={app} onSave={onSave} />)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save details<\/button>/)
    expect(html).not.toContain('save automatically')
    expect(onSave).not.toHaveBeenCalled()
  })

  it("offers the agency's job titles, and shows an unlisted saved title as Other", () => {
    const app = {
      id: 'APP-2',
      agencyId: 'ag-1',
      applicantName: 'A',
      email: 'a@example.com',
      phone: '1',
      income: 1,
      jobTitle: 'Astronaut',
      documents: [],
    } as unknown as Application
    const html = renderToStaticMarkup(<TenantApplicationDetailsForm application={app} onSave={() => {}} />)
    expect(html).toContain('<option value="Nurse">Nurse</option>')
    expect(html).toMatch(/<option value="__other__" selected="">Other \(type it\)<\/option>/)
    expect(html).toContain('value="Astronaut"')
  })
})
