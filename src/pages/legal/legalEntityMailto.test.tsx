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
    // Every filled-in address on both pages is a mailto: link, none is bare text.
    const unlinked = (privacy + terms).replace(/<a [^>]*href="mailto:([^"]+)"[^>]*>\1<\/a>/g, '')
    expect(unlinked).not.toContain('@example.test')
  })

  it('a blank email shows the marker and no mailto: link', async () => {
    const { privacy, terms } = await render({ ...FULL, privacyEmail: '', supportEmail: '' })
    expect(privacy).toContain('data-testid="legal-missing-privacyEmail"')
    expect(terms).toContain('data-testid="legal-missing-supportEmail"')
    expect(privacy + terms).not.toContain('mailto:')
  })

  it('a value that is not an email address is never linked, and shows the marker (Angela #118 F7)', async () => {
    const { privacy } = await render({ ...FULL, privacyEmail: 'privacy at lekaya' })
    expect(privacy).toContain('data-testid="legal-missing-privacyEmail"')
    expect(privacy).not.toContain('privacy at lekaya')
    expect(privacy).not.toContain('mailto:')
  })
})

describe('Angela #118 C5 / F7: the pages mark every value the completeness check rejects', () => {
  it.each([
    ['legalName', 'TBC'],
    ['legalName', '[Company name]'],
    ['informationOfficer', 'N/A'],
    ['address', 'pending'],
    ['privacyEmail', 'privacy@lekaya'],
  ])('%s = %j shows the "to be confirmed" marker, not the text', async (field, value) => {
    const { privacy } = await render({ ...FULL, [field]: value })
    expect(privacy).toContain(`data-testid="legal-missing-${field}"`)
    expect(privacy).not.toContain(`>${value}<`)
  })

  it('registrationNumber "not applicable" is shown as written (a sole proprietor has none)', async () => {
    const { privacy } = await render({ ...FULL, registrationNumber: 'not applicable' })
    expect(privacy).toContain('(not applicable)')
    expect(privacy).not.toContain('legal-missing-registrationNumber')
  })
})
