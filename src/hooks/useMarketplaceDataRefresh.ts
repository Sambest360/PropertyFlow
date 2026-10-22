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
  const prevPathnameRef = useRef<string | null>(null)
  const prevSearchRef = useRef<string | null>(null)

  useEffect(() => {
    if (!shouldRefreshMarketplaceRoute(pathname)) return
    if (!mounted.current) {
      mounted.current = true
      prevPathnameRef.current = pathname
      prevSearchRef.current = search
      void refreshMarketplaceListings({ force: false })
      return
    }

    const searchChanged = pathname === '/browse' && prevSearchRef.current !== search
    const listingChanged =
      pathname.startsWith('/listing/') && prevPathnameRef.current !== pathname
    const homeOrSavedEntered =
      (pathname === '/' || pathname === '/saved') && prevPathnameRef.current !== pathname

    prevPathnameRef.current = pathname
    prevSearchRef.current = search

    if (!searchChanged && !listingChanged && !homeOrSavedEntered) return

    void refreshMarketplaceListings({ force: false })
  }, [pathname, search, refreshMarketplaceListings])
}
