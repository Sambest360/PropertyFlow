import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, matchPath } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { MarketplaceFooter } from './MarketplaceFooter'
import { marketplaceFooter } from './navigation'

// T5 (spec r4; Jim C9; Oscar A4). The public footer is the same for signed-in
// and signed-out visitors: it reads no auth state, so rendering it with no
// providers is the signed-out footer.
const html = renderToStaticMarkup(
  <MemoryRouter>
    <MarketplaceFooter />
  </MemoryRouter>,
)
const hrefs = [...html.matchAll(/<a[^>]*href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))

function linkTo(label: string): string | undefined {
  const re = new RegExp(`<a[^>]*href="([^"]*)"[^>]*>${label}</a>`)
  return html.match(re)?.[1]
}

/** Top-level + marketplace route patterns in src/App.tsx (everything before the workspace shell), minus the 404 catch-all. */
function publicRoutePatterns(): string[] {
  const src = readFileSync(fileURLToPath(new URL('../../App.tsx', import.meta.url)), 'utf8')
  const cut = src.indexOf('path="workspace"')
  expect(cut).toBeGreaterThan(0)
  const pats = [...src.slice(0, cut).matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
  return ['/', ...pats.map((p) => `/${p}`)]
}

describe('T5 public footer', () => {
  it('signed-out footer has no /workspace links', () => {
    expect(hrefs.length).toBeGreaterThan(0)
    expect(hrefs.filter((h) => h.startsWith('/workspace'))).toEqual([])
  })

  it("drops only the 'For agents' and 'Portals' groups (C9)", () => {
    const titles = marketplaceFooter.map((g) => g.title)
    expect(titles).not.toContain('For agents')
    expect(titles).not.toContain('Portals')
    expect(html).not.toContain('>For agents<')
    expect(html).not.toContain('>Portals<')
  })

  it("keeps the public 'Explore' and 'Home loans' groups unchanged (C9)", () => {
    const byTitle = Object.fromEntries(marketplaceFooter.map((g) => [g.title, g.links.map(([l, t]) => [l, t])]))
    expect(byTitle['Explore']).toEqual([
      ['Buy', '/browse?mode=buy'],
      ['Rent', '/browse?mode=rent'],
      ['Commercial', '/browse?mode=commercial'],
      ['Calculators', '/calculators'],
    ])
    expect(byTitle['Home loans']).toEqual([
      ['Mortgage bond', '/calculators/mortgage-bond'],
      ['Affordability', '/calculators/affordability'],
      ['Additional payments', '/calculators/additional-payment'],
      ['Bond & transfer', '/calculators/bond-transfer'],
    ])
  })

  it('adds Sign in, List with us, Contact, Privacy and Terms', () => {
    expect(linkTo('Sign in')).toBe('/login')
    expect(linkTo('List with us')).toBe('/register')
    expect(linkTo('Contact')).toBe('/contact')
    expect(linkTo('Privacy')).toBe('/privacy')
    expect(linkTo('Terms')).toBe('/terms')
  })

  it('every footer link resolves to a public route, not the 404 catch-all (Oscar A4)', () => {
    const patterns = publicRoutePatterns()
    expect(patterns).toContain('/privacy')
    expect(patterns).toContain('/terms')
    const unresolved = hrefs
      .map((h) => h.split(/[?#]/)[0])
      .filter((path) => !patterns.some((p) => matchPath({ path: p, end: true }, path)))
    expect(unresolved).toEqual([])
  })
})
