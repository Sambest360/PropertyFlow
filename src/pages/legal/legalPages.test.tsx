import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LEGAL_ENTITY, LEGAL_REQUIRED_FIELDS, legalEntityComplete } from '../../lib/legalEntity'
import ContactPage from '../ContactPage'
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
    // effectiveDate shows a marker too but is deliberately not one of the gate's 6 fields
    // (Michael #118 ruling 5 keeps the spec's 6); the values PR sets it (Jim C5).
    const NOT_GATED = ['effectiveDate']
    for (const field of markers) if (!NOT_GATED.includes(field)) expect(LEGAL_REQUIRED_FIELDS, field).toContain(field)
  })

  it('Angela #118 v2 (B08): an unset detail shows its label and the words "to be confirmed", not just the test id', () => {
    for (const out of [html(<PrivacyPage />), html(<TermsPage />), html(<ContactPage />)]) {
      const markers = out.match(/<span[^>]*data-testid="legal-missing-[A-Za-z]+"[^>]*>[^<]*<\/span>/g) ?? []
      expect(markers.length).toBeGreaterThan(0)
      for (const m of markers) expect(m, m).toMatch(/\[[^\]]+ to be confirmed\]/)
    }
  })

  it('Michael #118 ruling 5: the effective date is pending, shown "to be confirmed", never a made-up date', () => {
    expect(LEGAL_ENTITY.effectiveDate).toBe('')
    for (const out of [html(<PrivacyPage />), html(<TermsPage />)]) {
      expect(out).toContain('data-testid="legal-missing-effectiveDate"')
      expect(out).not.toContain('2026-10-30')
    }
  })

  it('Michael #118 ruling 5: no unproven security, hosting, transfer or deletion claims, and no retired hosts', () => {
    const privacy = html(<PrivacyPage />)
    for (const claim of [/backed up daily/i, /HTTPS/, /encrypted/i, /hosting provider in South Africa/i, /binding agreements/i, /deleted automatically/i]) {
      expect(privacy, String(claim)).not.toMatch(claim)
    }
    for (const out of [privacy, html(<TermsPage />), html(<ContactPage />)]) {
      expect(out).not.toMatch(/vercel|supabase/i)
    }
  })

  it('privacy policy has a "Who is responsible" section splitting agency (responsible party) from Lekaya (operator)', () => {
    const out = html(<PrivacyPage />)
    const start = out.indexOf('Who is responsible</h2>')
    expect(start).toBeGreaterThan(-1)
    const section = out.slice(start, out.indexOf('</section>', start))
    expect(section).toMatch(/Each estate agency[^<]*is the responsible party for the personal information submitted to it/)
    expect(section).toContain('enquiries, rental applications and leases')
    expect(section).toContain('is the operator')
    // Michael #118 ruling 4: no narrower than what the rest of the page says Lekaya does for itself.
    expect(section).toContain('is the responsible party for what it processes for its own purposes')
    for (const own of ['platform accounts', 'our own billing', 'log records, device and browser details', 'preventing fraud', 'moderating listings, reviews and conduct reports', 'section 9']) {
      expect(section, own).toContain(own)
    }
    expect(section).not.toContain('responsible party only for')
    // Angela #118 C4 (A10, A11): Lekaya is never the responsible party for agency data or "the marketplace", nor jointly.
    expect(section).not.toMatch(/jointly/i)
    expect(section).not.toMatch(/public marketplace/i)
    expect(section).not.toMatch(/(?:<p>|\.\s)Lekaya Rentals is (also )?(a|the) responsible party for (the |your )?(personal information submitted|enquir|rental application|application|lease)/i)
    // Angela #118 v2 (B19, B20): no sentence in this section may make Lekaya "also" the responsible party for agency data,
    // or say it "decides why and how" that data is processed, whatever the opening words are.
    expect(section).not.toMatch(/\balso\b[^.<]{0,60}responsible party/i)
    expect(section).not.toMatch(/responsible party[^.<]{0,40}\balso\b/i)
    expect(section).not.toMatch(/decides? why and how/i)
    expect(section).not.toMatch(/(?:<p[^>]*>|[.;]\s+)(we are|we're|lekaya rentals is|lekaya is)\b[^.<]{0,40}responsible party for (the |your |all )?(personal information|enquir|rental|application|lease|agency)/i)
    expect(section).toContain('data-testid="legal-missing-informationOfficer"')
    expect(section).toContain('data-testid="legal-missing-privacyEmail"')
    // Jim #118 C3: the public listing shows only "listed by <agent>", no agency name,
    // so the page must not promise that the agency is named there.
    // Michael #118 ruling 3: true today (listings show only the agent), so "manages the listing".
    expect(section).toMatch(/contact the agency \(or landlord\) that manages the listing; the listing agent can put\s+you in touch/)
    expect(section).not.toMatch(/named on the listing/)
  })
})
