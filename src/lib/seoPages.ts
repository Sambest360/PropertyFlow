/**
 * Search pages for "property to rent in <city>" style searches, and the
 * title / description of every public page. Shared by:
 *  - the app (SeoLandingPage, usePageMeta),
 *  - the build (vite.config.ts writes a pre-filled index.html per page, so
 *    crawlers that do not run JavaScript still get the right title and text),
 *  - the sitemap (server/sitemap.ts).
 * Plain data only: no React, no browser APIs.
 */

export type SeoKind = 'rent' | 'sale' | 'rooms'

export type SeoCity = {
  slug: string
  name: string
  province: string
  /** Other names the listings may use for the same place. */
  aliases?: string[]
  /** Nearby cities (slugs) for internal links. */
  near: string[]
}

export const SEO_CITIES: SeoCity[] = [
  { slug: 'gqeberha', name: 'Gqeberha', province: 'Eastern Cape', aliases: ['Port Elizabeth', 'PE'], near: ['east-london', 'george', 'makhanda'] },
  { slug: 'east-london', name: 'East London', province: 'Eastern Cape', near: ['gqeberha', 'makhanda'] },
  { slug: 'makhanda', name: 'Makhanda', province: 'Eastern Cape', aliases: ['Grahamstown'], near: ['gqeberha', 'east-london'] },
  { slug: 'johannesburg', name: 'Johannesburg', province: 'Gauteng', aliases: ['Joburg', 'Jhb'], near: ['sandton', 'randburg', 'soweto', 'midrand', 'pretoria'] },
  { slug: 'sandton', name: 'Sandton', province: 'Gauteng', near: ['johannesburg', 'randburg', 'midrand'] },
  { slug: 'randburg', name: 'Randburg', province: 'Gauteng', near: ['johannesburg', 'sandton'] },
  { slug: 'soweto', name: 'Soweto', province: 'Gauteng', near: ['johannesburg'] },
  { slug: 'midrand', name: 'Midrand', province: 'Gauteng', near: ['centurion', 'sandton', 'pretoria'] },
  { slug: 'pretoria', name: 'Pretoria', province: 'Gauteng', aliases: ['Tshwane'], near: ['centurion', 'midrand', 'johannesburg'] },
  { slug: 'centurion', name: 'Centurion', province: 'Gauteng', near: ['pretoria', 'midrand'] },
  { slug: 'cape-town', name: 'Cape Town', province: 'Western Cape', near: ['stellenbosch', 'george'] },
  { slug: 'stellenbosch', name: 'Stellenbosch', province: 'Western Cape', near: ['cape-town'] },
  { slug: 'george', name: 'George', province: 'Western Cape', near: ['gqeberha', 'cape-town'] },
  { slug: 'durban', name: 'Durban', province: 'KwaZulu-Natal', aliases: ['eThekwini'], near: ['umhlanga', 'pietermaritzburg'] },
  { slug: 'umhlanga', name: 'Umhlanga', province: 'KwaZulu-Natal', near: ['durban'] },
  { slug: 'pietermaritzburg', name: 'Pietermaritzburg', province: 'KwaZulu-Natal', near: ['durban'] },
  { slug: 'bloemfontein', name: 'Bloemfontein', province: 'Free State', aliases: ['Mangaung'], near: ['kimberley'] },
  { slug: 'kimberley', name: 'Kimberley', province: 'Northern Cape', near: ['bloemfontein'] },
  { slug: 'polokwane', name: 'Polokwane', province: 'Limpopo', near: ['mbombela', 'pretoria'] },
  { slug: 'mbombela', name: 'Mbombela', province: 'Mpumalanga', aliases: ['Nelspruit'], near: ['polokwane', 'pretoria'] },
  { slug: 'rustenburg', name: 'Rustenburg', province: 'North West', near: ['pretoria', 'johannesburg'] },
]

export const SEO_KIND_PATH: Record<SeoKind, string> = { rent: 'to-rent', sale: 'for-sale', rooms: 'rooms-to-rent' }

export function seoPath(kind: SeoKind, citySlug: string): string {
  return `/${SEO_KIND_PATH[kind]}/${citySlug}`
}

export function seoCity(slug: string | undefined): SeoCity | undefined {
  return SEO_CITIES.find((c) => c.slug === (slug ?? '').toLowerCase())
}

/**
 * Any place, not only the listed cities: /to-rent/nairobi or /to-rent/london
 * work too. Unknown slugs become a title-cased name with no province.
 */
export function seoPlace(slug: string | undefined): SeoCity | undefined {
  const clean = (slug ?? '').toLowerCase().trim()
  if (!clean || !/^[a-z0-9-]{2,60}$/.test(clean)) return undefined
  const known = seoCity(clean)
  if (known) return known
  const name = clean
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return { slug: clean, name, province: '', near: [] }
}

/** Browse section for each landing kind. */
export const SEO_KIND_MODE: Record<SeoKind, 'rent' | 'buy' | 'shared'> = { rent: 'rent', sale: 'buy', rooms: 'shared' }

export type SeoPageMeta = {
  path: string
  title: string
  description: string
  h1: string
  intro: string
  keywords: string[]
}

export function seoLandingMeta(kind: SeoKind, city: SeoCity): SeoPageMeta {
  const where = city.province ? `${city.name}, ${city.province}` : city.name
  if (kind === 'sale') {
    return {
      path: seoPath(kind, city.slug),
      title: `Property for sale in ${city.name}`,
      description: `Houses, apartments, townhouses and land for sale in ${where}. Listings from verified agencies and landlords on Lekaya Rentals, with bond and transfer cost calculators.`,
      h1: `Property for sale in ${city.name}`,
      intro: `Browse homes for sale in ${city.name}. Every listing is checked by the Lekaya Rentals team before it goes live. Work out your bond repayments and transfer costs before you make an offer.`,
      keywords: [`property for sale in ${city.name}`, `houses for sale ${city.name}`, `${city.name} property`, `buy a house in ${city.name}`],
    }
  }
  if (kind === 'rooms') {
    return {
      path: seoPath(kind, city.slug),
      title: `Rooms to rent in ${city.name}: shared accommodation`,
      description: `Rooms to rent and shared accommodation in ${where}. See how many rooms are free, apply online for a room, sign the lease electronically and pay the deposit on Lekaya Rentals.`,
      h1: `Rooms to rent in ${city.name}`,
      intro: `Looking for a room rather than a whole house? Shared homes in ${city.name} show how many rooms are free. Apply for a room online and the agency or landlord assigns your room once your deposit is in.`,
      keywords: [`rooms to rent in ${city.name}`, `room to let ${city.name}`, `shared accommodation ${city.name}`, `student accommodation ${city.name}`],
    }
  }
  return {
    path: seoPath(kind, city.slug),
    title: `Property to rent in ${city.name}: houses, flats and apartments`,
    description: `Houses, flats, apartments and townhouses to rent in ${where}. Book a viewing, apply online, sign your lease electronically and pay the deposit with Lekaya Rentals.`,
    h1: `Property to rent in ${city.name}`,
    intro: `Find your next rental in ${city.name}. Filter by price, bedrooms, pets and furnishing, book a viewing, and apply online with your documents uploaded once. Listings come from agencies and landlords checked by our team.`,
    keywords: [`property to rent in ${city.name}`, `houses to rent in ${city.name}`, `flats to rent in ${city.name}`, `apartments to rent ${city.name}`, `rentals ${city.name}`],
  }
}

/** Questions and answers shown on landing pages (and as FAQPage structured data). */
export function seoLandingFaq(kind: SeoKind, city: SeoCity): Array<{ q: string; a: string }> {
  const common = [
    {
      q: 'Are the listings on Lekaya Rentals checked?',
      a: 'Yes. Agencies and landlords cannot publish on their own: our team reviews every listing before it goes live.',
    },
  ]
  if (kind === 'sale') {
    return [
      { q: `How much can I afford to spend on a home in ${city.name}?`, a: 'Use the free affordability and bond repayment calculators to see the bond you could qualify for and the monthly repayment.' },
      { q: 'What does it cost to buy a property?', a: 'Besides the price, budget for transfer duty, conveyancing fees and bond registration. The bond and transfer cost calculator adds them up.' },
      ...common,
    ]
  }
  return [
    { q: `How do I rent ${kind === 'rooms' ? 'a room' : 'a property'} in ${city.name} on Lekaya Rentals?`, a: 'Search the area, book a viewing, then apply online with your ID, payslips and bank statements. If you are approved you sign the lease electronically and upload proof of your deposit.' },
    { q: 'Is signing a lease online legal in South Africa?', a: 'Yes. Leases on Lekaya Rentals are signed electronically in line with the Electronic Communications and Transactions Act (ECTA) of 2002.' },
    { q: 'What documents do I need to apply?', a: 'Usually a copy of your ID or passport, your latest payslips and three months of bank statements. The application shows exactly what the agency asks for.' },
    ...common,
  ]
}

/** Every public page with its own title and description (for the build and the sitemap). */
export function staticSeoPages(): SeoPageMeta[] {
  const base = (path: string, title: string, description: string, h1: string, intro: string): SeoPageMeta => ({ path, title, description, h1, intro, keywords: [] })
  return [
    base(
      '/',
      'Property to rent & buy, and property management in South Africa',
      'Lekaya Rentals: search homes, flats, rooms and shared accommodation to rent or buy across South Africa, book viewings and apply online. Agencies and landlords manage tenants, leases and rent in one place.',
      'Find a place to call home',
      'Search homes for sale and to rent across South Africa, then manage viewings, applications and leases in one place.',
    ),
    base('/browse?mode=rent', 'Property to rent in South Africa', 'Houses, flats, apartments and townhouses to rent across South Africa on Lekaya Rentals. Book viewings and apply online.', 'Property to rent', 'Browse rentals from agencies and landlords checked by our team.'),
    base('/browse?mode=buy', 'Property for sale in South Africa', 'Houses, apartments, townhouses, land and farms for sale across South Africa on Lekaya Rentals.', 'Property for sale', 'Browse homes for sale from verified agencies and landlords.'),
    base('/browse?mode=shared', 'Rooms to rent and shared accommodation in South Africa', 'Rooms to rent and shared accommodation across South Africa. Apply online for a room on Lekaya Rentals.', 'Rooms to rent', 'Rent a room in a shared home and apply online.'),
    base('/browse?mode=commercial', 'Commercial property to rent and for sale in South Africa', 'Offices, retail and industrial property to rent or buy across South Africa on Lekaya Rentals.', 'Commercial property', 'Offices, shops and industrial space.'),
    base('/calculators', 'Bond and affordability calculators', 'Free South African bond repayment, affordability, extra payment and bond and transfer cost calculators.', 'Property calculators', 'Work out what you can afford before you buy.'),
    base('/calculators/mortgage-bond', 'Bond repayment calculator', 'Work out the monthly repayment on a South African home loan.', 'Bond repayment calculator', 'Monthly repayment on a home loan.'),
    base('/calculators/affordability', 'Bond affordability calculator', 'See how much you could borrow for a home loan from your income and expenses.', 'Affordability calculator', 'How much you could borrow.'),
    base('/calculators/additional-payment', 'Extra bond payment calculator', 'See how much time and interest extra bond payments save you.', 'Extra payment calculator', 'Time and interest saved by paying more.'),
    base('/calculators/bond-transfer', 'Bond and transfer cost calculator', 'Add up transfer duty, conveyancing and bond registration costs when you buy property in South Africa.', 'Bond and transfer costs', 'Once-off costs when you buy.'),
    base('/contact', 'Contact Lekaya Rentals', 'How to reach Lekaya Rentals: email info@lekayarentals.site.', 'Contact us', 'Email info@lekayarentals.site.'),
  ]
}

/** All landing pages (every city for each kind). */
export function allSeoLandingPages(): SeoPageMeta[] {
  const kinds: SeoKind[] = ['rent', 'sale', 'rooms']
  return kinds.flatMap((k) => SEO_CITIES.map((c) => seoLandingMeta(k, c)))
}

/** Does a listing's suburb / city belong to this city? */
export function listingInCity(p: { city?: string | null; suburb?: string | null }, city: SeoCity): boolean {
  const names = [city.name, ...(city.aliases ?? [])].map((n) => n.toLowerCase())
  const hay = `${p.city ?? ''} ${p.suburb ?? ''}`.toLowerCase()
  return names.some((n) => hay.includes(n))
}
