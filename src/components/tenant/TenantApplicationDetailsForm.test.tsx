import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Application } from '../../types/domain'
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
})
