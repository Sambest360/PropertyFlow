import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEGAL_REQUIRED_FIELDS } from '../lib/legalEntity'

/**
 * T6 / Jim's T5 review C2: /contact shows no placeholder marker once every
 * detail is set. ContactPage.tsx arrives with PR #117 (T5, harden/t5), which is
 * not on main yet, so these tests SKIP until #117 merges and then run on their
 * own. Once both are on main, drop the skipIf guard (follow-up noted in the PR).
 */
const contactLoaders = import.meta.glob('./ContactPage.tsx')
const loadContact = contactLoaders['./ContactPage.tsx']

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
const BLANK = { ...FULL, legalName: '', registrationNumber: '', address: '', informationOfficer: '', privacyEmail: '', supportEmail: '' }

async function renderContact(entity: Record<string, string>) {
  vi.resetModules()
  vi.doMock('../lib/legalEntity', async (orig) => ({
    ...(await orig<typeof import('../lib/legalEntity')>()),
    LEGAL_ENTITY: entity,
  }))
  const mod = (await loadContact()) as { default: () => React.ReactElement }
  const ContactPage = mod.default
  return renderToStaticMarkup(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.doUnmock('../lib/legalEntity')
  vi.resetModules()
})

describe.skipIf(!loadContact)('T6 /contact legal details (needs PR #117 merged first)', () => {
  it('shows no "to be confirmed" marker once every detail is set, and links the emails', async () => {
    const out = await renderContact(FULL)
    expect(out).not.toContain('legal-missing-')
    expect(out).not.toContain('to be confirmed')
    expect(out).toContain('Test Officer')
    expect(out).toContain('href="mailto:support@example.test"')
    expect(out).toContain('href="mailto:privacy@example.test"')
    // Every address on the page comes through Entity as a mailto: link, none as bare text.
    const unlinked = out.replace(/<a [^>]*href="mailto:([^"]+)"[^>]*>\1<\/a>/g, '')
    expect(unlinked).not.toContain('@example.test')
  })

  it('every marker /contact shows while blank is a field the completeness check requires', async () => {
    const out = await renderContact(BLANK)
    const markers = [...out.matchAll(/data-testid="legal-missing-([A-Za-z]+)"/g)].map((m) => m[1])
    expect(markers).toContain('supportEmail')
    for (const field of markers) expect(LEGAL_REQUIRED_FIELDS, field).toContain(field)
  })
})
