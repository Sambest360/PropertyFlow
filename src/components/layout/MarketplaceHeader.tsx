import { Link, useNavigate } from 'react-router-dom'
import { Heart, Menu, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { BrandLogo } from './BrandLogo'
import { MobileDrawer } from './MobileDrawer'
import { marketplaceCategories } from './navigation'
import { cn } from '../ui'

export function MarketplaceHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/browse?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-primary-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <BrandLogo />

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Marketplace">
            {marketplaceCategories.map((c) => {
              const Icon = c.icon
              return (
                <Link
                  key={c.label}
                  to={c.to}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                  {c.label}
                </Link>
              )
            })}
          </nav>

          <form
            onSubmit={submitSearch}
            className="relative ml-auto hidden min-w-0 max-w-sm flex-1 lg:block"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="City, suburb, or keyword"
              className="h-11 w-full rounded-full border border-primary-100 bg-primary-50 pl-9 pr-4 text-sm outline-none transition-colors duration-200 focus:border-primary focus:bg-white focus-visible:ring-2 focus-visible:ring-primary"
            />
          </form>

          <div className={cn('flex items-center gap-1.5 md:ml-0', !q && 'lg:ml-2')}>
            <Link
              to="/saved"
              className="hidden min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
              aria-label="Saved homes"
            >
              <Heart className="h-4 w-4" />
            </Link>
            <Link
              to="/workspace"
              className="hidden min-h-11 cursor-pointer items-center rounded-full px-3.5 text-sm font-semibold text-ink-600 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
            >
              Agent login
            </Link>
            <Link
              to="/browse"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Find a home
            </Link>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-primary-100 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} title="Menu" side="right">
        <form onSubmit={submitSearch} className="relative mb-4">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search homes…"
            className="h-11 w-full rounded-xl border border-primary-100 bg-primary-50 pl-9 pr-3 text-sm outline-none focus:border-primary focus:bg-white focus-visible:ring-2 focus-visible:ring-primary"
          />
        </form>
        <div className="space-y-1">
          {marketplaceCategories.map((c) => {
            const Icon = c.icon
            return (
              <Link
                key={c.label}
                to={c.to}
                onClick={() => setMobileOpen(false)}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-ink transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon className="h-4 w-4 text-ink-400" aria-hidden />
                {c.label}
              </Link>
            )
          })}
          <Link
            to="/workspace"
            onClick={() => setMobileOpen(false)}
            className="mt-4 flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-primary px-3 py-3 text-center text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Agent Workspace
          </Link>
        </div>
      </MobileDrawer>
    </>
  )
}
