import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../components/ui'

/**
 * Shown for a public address that matches no page (a mistyped or old link).
 * These used to bounce to the home page with no explanation. The robots tag
 * keeps search engines from indexing the missing address; it is removed again
 * when the visitor moves on.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation()

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Page not found — Lekaya Rentals'
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    return () => {
      document.title = previousTitle
      robots.remove()
    }
  }, [])

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Page not found</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">We can’t find that page</h1>
      <p className="mt-3 text-sm text-ink-500">
        Nothing lives at <span className="break-all font-mono text-ink">{pathname}</span>. The link may be old or
        mistyped.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/browse">
          <Button>Browse properties</Button>
        </Link>
        <Link to="/stays">
          <Button variant="secondary">Guest houses</Button>
        </Link>
        <Link to="/">
          <Button variant="secondary">Home</Button>
        </Link>
      </div>
    </section>
  )
}
