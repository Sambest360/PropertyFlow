import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// Test-only fixture, NOT Lekaya's real details (Samuel supplies those).
vi.mock('../../lib/legalEntity', async (orig) => ({
  ...(await orig<typeof import('../../lib/legalEntity')>()),
  LEGAL_ENTITY: {
    brand: 'Lekaya Rentals',
    legalName: 'Test Fixture (Pty) Ltd',
    registrationNumber: '0000/000000/00',
    address: '1 Test Street, Testville',
    informationOfficer: 'Test Officer',
    privacyEmail: 'privacy@example.test',
    supportEmail: 'support@example.test',
    effectiveDate: '2026-10-30',
    website: 'https://example.test',
  },
}))

const { default: PrivacyPage } = await import('./PrivacyPage')
const { default: TermsPage } = await import('./TermsPage')
const html = (page: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{page}</MemoryRouter>)

describe('T6 legal pages with every detail filled in', () => {
  it('show no "to be confirmed" marker and render the supplied values', () => {
    for (const out of [html(<PrivacyPage />), html(<TermsPage />)]) {
      expect(out).not.toContain('legal-missing-')
      expect(out).not.toContain('to be confirmed')
      expect(out).toContain('Test Fixture (Pty) Ltd')
    }
    expect(html(<PrivacyPage />)).toContain('Test Officer')
    expect(html(<TermsPage />)).toContain('support@example.test')
  })
})
