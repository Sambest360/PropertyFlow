import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { hasGoogleMapsKey, mapsLoaderConfig } from '../lib/api/mapsLoader'

export type GoogleMapsContextValue = {
  enabled: boolean
  isLoaded: boolean
  loadError: Error | undefined
}

const GoogleMapsContext = createContext<GoogleMapsContextValue>({
  enabled: false,
  isLoaded: false,
  loadError: undefined,
})

function GoogleMapsLoader({ children }: { children: ReactNode }) {
  const [authFailed, setAuthFailed] = useState(false)
  useLayoutEffect(() => {
    const w = window as Window & { gm_authFailure?: () => void }
    const previous = w.gm_authFailure
    w.gm_authFailure = () => setAuthFailed(true)
    return () => {
      if (previous) w.gm_authFailure = previous
      else delete w.gm_authFailure
    }
  }, [])

  const { isLoaded, loadError } = useJsApiLoader(mapsLoaderConfig())
  const effectiveLoadError =
    loadError ?? (authFailed ? new Error('Google Maps authentication failed') : undefined)

  return (
    <GoogleMapsContext.Provider value={{ enabled: true, isLoaded, loadError: effectiveLoadError }}>
      {children}
    </GoogleMapsContext.Provider>
  )
}

/** Loads Maps JS once for Places, Geocoder, and map widgets. */
export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  if (!hasGoogleMapsKey()) {
    return (
      <GoogleMapsContext.Provider value={{ enabled: false, isLoaded: false, loadError: undefined }}>
        {children}
      </GoogleMapsContext.Provider>
    )
  }
  return <GoogleMapsLoader>{children}</GoogleMapsLoader>
}

export function useGoogleMaps(): GoogleMapsContextValue {
  return useContext(GoogleMapsContext)
}
