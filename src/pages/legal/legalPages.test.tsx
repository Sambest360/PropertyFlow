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

  it('Angela #118 v3 (N2-N5) + Jim addendum 3: in "Who is responsible", only the two allowed sentences name a responsible party', () => {
    const section = sectionText(html(<PrivacyPage />), '2. Who is responsible')
    const brand = LEGAL_ENTITY.brand
    // Every sentence that mentions "responsib..." must be one of these two, word for word.
    const allowed = [
      `Each estate agency (or landlord) listed on ${brand} is the responsible party for the personal information submitted to it through the platform: enquiries, rental applications and leases.`,
      `${brand} is the responsible party for what it processes for its own purposes, as this policy and our Terms of Service describe: platform accounts and sign-in; our own billing; log records, device and browser details and other technical information; keeping the platform secure, preventing fraud and fixing problems; moderating listings, reviews and conduct reports; and the browser storage described in section 9.`,
    ]
    const mentions = sentences(section).filter((s) => /responsib/i.test(s))
    expect(mentions.length).toBe(2)
    for (const s of mentions) expect(allowed, s).toContain(s)
    // Wording that makes Lekaya a responsible party without using the word.
    expect(section).not.toMatch(/purposes?\s+and\s+(the\s+)?means/i)
    expect(section).not.toMatch(/\b(decides?|determines?|deciding|determining)\b/i)
    expect(section).not.toMatch(/\b(controller|controls?)\b/i)
  })

  it('Oscar W1: privacy s7 sends agency-held breaches to the agency, and only our own to you and the Regulator', () => {
    const s7 = sectionText(html(<PrivacyPage />), '7. How we protect it')
    expect(s7).toContain(
      'If a security compromise affects information an agency or landlord is responsible for, we will tell them immediately. For information we are responsible for, we will notify you and the Information Regulator as POPIA requires.',
    )
    expect(s7).not.toMatch(/compromise affects your information/i)
  })

  it('Oscar W2: privacy s6 leaves retention of agency and landlord records to them, within the law', () => {
    const s6 = sectionText(html(<PrivacyPage />), '6. How long we keep it')
    expect(s6).toContain('Agencies and landlords decide how long to keep the records they are responsible for, within the law.')
    expect(s6).toContain('When information we are responsible for is no longer needed, we delete it or make it anonymous.')
    expect(s6).not.toMatch(/When information is no longer needed/)
  })

  it('Oscar W3: no credit bureau is integrated today, so privacy s3 and s5 say "if an agency runs a check through a provider"', () => {
    const privacy = html(<PrivacyPage />)
    expect(sectionText(privacy, '3. What we collect')).toContain('if an agency runs a check through a provider')
    expect(sectionText(privacy, '5. Who we share it with')).toContain('if an agency runs a check through a provider')
    expect(textOf(privacy)).not.toMatch(/credit bureau/i)
  })

  it('Oscar W5: privacy s9 says we set no advertising or tracking cookies, and Google Maps may set its own', () => {
    const s9 = sectionText(html(<PrivacyPage />), '9. Cookies and local storage')
    expect(s9).toContain('We do not set advertising or tracking cookies ourselves. Embedded Google Maps may set its own.')
    expect(s9).not.toMatch(/cross-site tracking/i)
  })

  it('Oscar W4: terms s8 makes no claim about a published process', () => {
    const terms = html(<TermsPage />)
    expect(textOf(terms)).not.toMatch(/published\s+process/i)
    const s8 = sectionText(terms, '8. Reviews and reports')
    expect(s8).toContain('We review reports about reviews and conduct, and we may moderate or remove reviews or act under section 7.')
    expect(s8).not.toMatch(/\bprocess\b/i)
  })

  it('Oscar W7: a request about agency-held information is passed to the agency (inbox ownership is a human item)', () => {
    const s8 = sectionText(html(<PrivacyPage />), '8. Your rights')
    expect(s8).toContain('For information an agency or landlord controls, we will pass your request to them and help them answer it.')
  })
})

/** Visible text of rendered markup, tags removed and whitespace collapsed. */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim()
}

/** Body text (heading excluded) of the section whose heading starts with `heading`. */
function sectionText(markup: string, heading: string): string {
  const start = markup.indexOf(`>${heading}`)
  expect(start, heading).toBeGreaterThan(-1)
  const bodyStart = markup.indexOf('</h2>', start)
  const end = markup.indexOf('</section>', start)
  expect(bodyStart, heading).toBeGreaterThan(start)
  expect(end, heading).toBeGreaterThan(bodyStart)
  return textOf(markup.slice(bodyStart, end))
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean)
}
