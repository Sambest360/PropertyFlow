import { Link } from 'react-router-dom'
import { BrandWordmark } from './BrandLogo'
import { marketplaceFooter } from './navigation'

export function MarketplaceFooter() {
  return (
    <footer className="border-t border-primary-100 bg-primary-50">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-5 lg:px-8">
        <div>
          <BrandWordmark />
          <p className="mt-2 text-sm text-ink-500">Buy, rent, and manage property — marketplace + agency workspace.</p>
        </div>
        {marketplaceFooter.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold text-ink">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map(([label, to]) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="inline-flex min-h-9 cursor-pointer items-center text-sm text-ink-500 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-primary-100 py-4 text-center text-xs text-ink-400">© 2026 PropertyFlow</div>
    </footer>
  )
}
