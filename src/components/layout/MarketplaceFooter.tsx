import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { BrandWordmark } from './BrandLogo'
import { marketplaceFooter } from './navigation'

/** Cities with the most South African rental demand; each opens a search there. */
const FOOTER_CITIES = ['Gqeberha', 'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Bloemfontein', 'East London', 'Polokwane']

const linkClass =
  'inline-flex min-h-8 items-center py-1 text-sm text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded'

export function MarketplaceFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="bg-[#0f2744] text-white" aria-labelledby="site-footer-title">
      <h2 id="site-footer-title" className="sr-only">
        Lekaya Rentals site links
      </h2>
      <div className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,3fr)]">
          <div className="max-w-sm">
            <div className="inline-block rounded-lg bg-white px-3 py-2">
              <BrandWordmark />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              Lekaya Rentals lists homes, flats, rooms and commercial space across South Africa, and gives agencies and landlords one place to run
              viewings, applications, leases, deposits and rent.
            </p>
            <a href="mailto:info@lekayarentals.site" className={`${linkClass} mt-4 gap-2`}>
              <Mail className="h-4 w-4" aria-hidden />
              info@lekayarentals.site
            </a>
            <div className="mt-5">
              <Link
                to="/register?role=landlord"
                className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[#0f2744] hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f2744]"
              >
                List your property
              </Link>
            </div>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {marketplaceFooter.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-semibold text-white">{col.title}</h3>
                <ul className="mt-3 space-y-0.5">
                  {col.links.map(([label, to]) => (
                    <li key={to}>
                      <Link to={to} className={linkClass}>
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <h3 className="text-sm font-semibold text-white">Property to rent by city</h3>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {FOOTER_CITIES.map((city) => (
              <li key={city}>
                <Link to={`/browse?mode=rent&q=${encodeURIComponent(city)}`} className={linkClass}>
                  {city}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} Lekaya Rentals. Listings are checked by our team before they go live. Personal information is handled under POPIA.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link to="/privacy" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-white">
              Terms of Service
            </Link>
            <a href="#top" className="hover:text-white" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
              Back to top
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
