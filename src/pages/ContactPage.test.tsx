import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LEGAL_ENTITY } from '../lib/legalEntity'
import ContactPage from './ContactPage'

describe('T5 contact page', () => {
  it('renders and shows the to-be-confirmed marker for every contact detail that is still blank', () => {
    const out = renderToStaticMarkup(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>,
    )
    expect(out).toContain('Contact us</h1>')
    // Samuel supplies these (spec r4 T6); until then the page says so, it does not invent an address.
    // A marker shows for each detail that is still blank (and only while it is blank).
    for (const field of ['supportEmail', 'privacyEmail', 'informationOfficer'] as const) {
      if (!LEGAL_ENTITY[field].trim()) expect(out, field).toContain(`data-testid="legal-missing-${field}"`)
    }
    // Angela #117 C4: every email shown is a stored LEGAL_ENTITY value; nothing hard-coded.
    const stored = [LEGAL_ENTITY.supportEmail, LEGAL_ENTITY.privacyEmail].map((e) => e.trim()).filter(Boolean)
    for (const [shown] of out.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) expect(stored, shown).toContain(shown)
    // Jim #118 C3: the listing names the agent, not the agency, so do not claim it does.
    expect(out).toContain('Contact the agency (or landlord) that manages the listing; the listing agent can put you in touch.')
    expect(out).not.toMatch(/named on the listing/)
    expect(out).toContain('href="/privacy"')
    // Angela #118 C2 / Jim T5 C6: landlords land on Landlord, not the Applicant/Tenant default.
    expect(out).toContain('href="/register?role=landlord"')
    expect(out).not.toContain('href="/register"')
  })
})
