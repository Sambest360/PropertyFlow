import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../context/AppStore'

function shouldRefreshMarketplaceRoute(pathname: string): boolean {
  if (pathname === '/' || pathname === '/browse' || pathname === '/saved') return true
  if (pathname.startsWith('/listing/')) return true
  return false
}

/** Re-fetch public listings when guest marketplace routes or query modes change. */
export function useMarketplaceDataRefresh() {
  const { pathname, search } = useLocation()
  const { refreshMarketplaceListings } = useStore()
  const mounted = useRef(false)

  const routeKey = `${pathname}${search}`

  useEffect(() => {
    if (!shouldRefreshMarketplaceRoute(pathname)) return
    if (!mounted.current) {
      mounted.current = true
      return
    }
    void refreshMarketplaceListings({ force: true })
  }, [pathname, routeKey, refreshMarketplaceListings])
}
