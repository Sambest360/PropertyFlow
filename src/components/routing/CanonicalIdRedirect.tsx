import type { ReactNode } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { isBackendUuid } from '../../lib/displayIds'
import { findByListingId } from '../../lib/listingIds'
import { resolveFrontendRouteId } from '../../lib/idMap'
import { useStore } from '../../context/AppStore'

function swapPathSegment(pathname: string, from: string, to: string): string {
  const parts = pathname.split('/')
  const idx = parts.findIndex((p) => p === from)
  if (idx === -1) return pathname
  parts[idx] = to
  return parts.join('/')
}

type CanonicalIdRedirectProps = {
  entityTypes: string[]
  /** Also try state.properties when entity_id_map misses (listings / units). */
  propertyLookup?: boolean
  paramKey?: string
  children: ReactNode
}

/**
 * Replaces a backend UUID in the URL with the mapped frontend id (replace navigation).
 */
export function CanonicalIdRedirect({
  entityTypes,
  propertyLookup = false,
  paramKey = 'id',
  children,
}: CanonicalIdRedirectProps) {
  const params = useParams()
  const location = useLocation()
  const { state } = useStore()
  const raw = params[paramKey]
  const id = raw?.trim()

  if (!id || !isBackendUuid(id)) return <>{children}</>

  let fe = resolveFrontendRouteId(state.idMapCache, entityTypes, id)
  if (!fe && propertyLookup) {
    const property = findByListingId(state.properties, id)
    if (property?.id && !isBackendUuid(property.id)) fe = property.id
  }

  if (fe && fe !== id) {
    const pathname = swapPathSegment(location.pathname, id, fe)
    return (
      <Navigate
        to={{ pathname, search: location.search, hash: location.hash }}
        replace
      />
    )
  }

  return <>{children}</>
}
