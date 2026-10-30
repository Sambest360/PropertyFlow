import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
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
    expect(out).toContain('data-testid="legal-missing-supportEmail"')
    expect(out).toContain('data-testid="legal-missing-privacyEmail"')
    expect(out).toContain('data-testid="legal-missing-informationOfficer"')
    // No address may be hard-coded on the page while LEGAL_ENTITY's emails are blank.
    expect(out).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
    expect(out).toContain('agency or landlord named on the listing')
    expect(out).toContain('href="/privacy"')
  })
})
