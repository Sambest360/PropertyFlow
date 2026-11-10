import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Scroll to top when the visitor goes to another page. A filter change that
 * only rewrites the query in place (a replace, e.g. picking stay dates) keeps
 * the scroll position, so the page doesn't jump while they choose.
 */
export function ScrollToTop() {
  const { pathname, search } = useLocation()
  const navType = useNavigationType()
  const lastPath = useRef(pathname)

  useEffect(() => {
    const samePage = lastPath.current === pathname
    lastPath.current = pathname
    if (samePage && navType === 'REPLACE') return
    window.scrollTo(0, 0)
  }, [pathname, search, navType])

  return null
}
