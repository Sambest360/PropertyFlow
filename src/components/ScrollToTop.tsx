import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Scroll to top whenever the route changes. */
export function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname, search])

  return null
}
