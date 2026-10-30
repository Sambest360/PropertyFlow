import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LEGAL_REQUIRED_FIELDS, legalEntityComplete } from '../../lib/legalEntity'
import PrivacyPage from './PrivacyPage'
import TermsPage from './TermsPage'

const html = (page: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{page}</MemoryRouter>)

describe('legal pages', () => {
  it('privacy policy renders and marks company details that are still blank', () => {
    const out = html(<PrivacyPage />)
    expect(out).toContain('Privacy Policy</h1>')
    expect(out).toContain('Protection of Personal Information Act')
    expect(out).toContain('data-testid="legal-missing-informationOfficer"')
    expect(out).toContain('https://inforegulator.org.za')
  })

  it('terms render with the South African law clause', () => {
    const out = html(<TermsPage />)
    expect(out).toContain('Terms of Service</h1>')
    expect(out).toContain('laws of the Republic of South Africa')
  })

  it('legalEntityComplete needs every named company detail', () => {
    const full = {
      legalName: 'Lekaya Rentals (Pty) Ltd',
      registrationNumber: '2026/000000/07',
      address: '1 Main Rd, Gqeberha',
      informationOfficer: 'A Person',
      privacyEmail: 'privacy@lekayarentals.site',
      supportEmail: 'support@lekayarentals.site',
    }
    expect(legalEntityComplete(full)).toBe(true)
    expect(legalEntityComplete({ ...full, informationOfficer: ' ' })).toBe(false)
    expect(legalEntityComplete({ ...full, supportEmail: '' })).toBe(false)
  })

  it('every company detail a legal page marks as "to be confirmed" is one the completeness check requires', () => {
    const markers = new Set<string>()
    for (const out of [html(<PrivacyPage />), html(<TermsPage />)]) {
      for (const m of out.matchAll(/data-testid="legal-missing-([A-Za-z]+)"/g)) markers.add(m[1])
    }
    expect(markers.size).toBeGreaterThan(0)
    for (const field of markers) expect(LEGAL_REQUIRED_FIELDS, field).toContain(field)
  })

  it('privacy policy has a "Who is responsible" section splitting agency (responsible party) from Lekaya (operator)', () => {
    const out = html(<PrivacyPage />)
    const start = out.indexOf('Who is responsible</h2>')
    expect(start).toBeGreaterThan(-1)
    const section = out.slice(start, out.indexOf('</section>', start))
    expect(section).toMatch(/Each estate agency[^<]*is the responsible party for the personal information submitted to it/)
    expect(section).toContain('enquiries, rental applications and leases')
    expect(section).toContain('is the operator')
    expect(section).toContain('responsible party only for platform accounts and our own billing')
    expect(section).toContain('data-testid="legal-missing-informationOfficer"')
    expect(section).toContain('data-testid="legal-missing-privacyEmail"')
    // Jim #118 C3: the public listing shows only "listed by <agent>", no agency name,
    // so the page must not promise that the agency is named there.
    expect(section).toContain('contact the agent or agency that listed the property')
    expect(section).not.toMatch(/named on the listing/)
  })
})
