import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Test-only fixture, NOT Lekaya's real details (Samuel supplies those).
const FULL = {
  brand: 'Lekaya Rentals',
  legalName: 'Test Fixture (Pty) Ltd',
  registrationNumber: '0000/000000/00',
  address: '1 Test Street, Testville',
  informationOfficer: 'Test Officer',
  privacyEmail: 'privacy@example.test',
  supportEmail: 'support@example.test',
  effectiveDate: '2026-10-30',
  website: 'https://example.test',
}

async function render(entity: Record<string, string>) {
  vi.resetModules()
  vi.doMock('../../lib/legalEntity', async (orig) => ({
    ...(await orig<typeof import('../../lib/legalEntity')>()),
    LEGAL_ENTITY: entity,
  }))
  const { default: PrivacyPage } = await import('./PrivacyPage')
  const { default: TermsPage } = await import('./TermsPage')
  const html = (page: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{page}</MemoryRouter>)
  return { privacy: html(<PrivacyPage />), terms: html(<TermsPage />) }
}

afterEach(() => {
  vi.doUnmock('../../lib/legalEntity')
  vi.resetModules()
})

describe('T6 C5: a filled-in email renders as a mailto: link', () => {
  it('privacyEmail and supportEmail link with mailto: once filled in', async () => {
    const { privacy, terms } = await render(FULL)
    expect(privacy).toContain('href="mailto:privacy@example.test"')
    expect(terms).toContain('href="mailto:support@example.test"')
    // Only the email fields link; the officer's name and the address stay plain text.
    expect(privacy).not.toContain('mailto:Test Officer')
    expect(privacy).not.toMatch(/href="mailto:[^"@]*"/)
  })

  it('a blank email shows the marker and no mailto: link', async () => {
    const { privacy, terms } = await render({ ...FULL, privacyEmail: '', supportEmail: '' })
    expect(privacy).toContain('data-testid="legal-missing-privacyEmail"')
    expect(terms).toContain('data-testid="legal-missing-supportEmail"')
    expect(privacy + terms).not.toContain('mailto:')
  })

  it('a value that is not an email address is shown as text, never linked', async () => {
    const { privacy } = await render({ ...FULL, privacyEmail: 'privacy at lekaya' })
    expect(privacy).toContain('privacy at lekaya')
    expect(privacy).not.toContain('mailto:')
  })
})
