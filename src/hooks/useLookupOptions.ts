import { useMemo } from 'react'
import { useStore } from '../context/AppStore'
import { useAgencyScope } from '../context/AuthContext'
import { getLookupOptions, getLookups } from '../lib/lookups'

/** Resolve active lookup options for the current agency (or platform fallback). */
export function useLookupOptions(configType: string, agencyIdOverride?: string | null) {
  const { state } = useStore()
  const { agencyId } = useAgencyScope()
  const id = agencyIdOverride !== undefined ? agencyIdOverride : agencyId

  return useMemo(
    () => getLookupOptions(state.lookups, id, configType),
    [state.lookups, id, configType],
  )
}

export function useAgencyLookups(configType: string, agencyIdOverride?: string | null) {
  const { state } = useStore()
  const { agencyId } = useAgencyScope()
  const id = agencyIdOverride !== undefined ? agencyIdOverride : agencyId

  return useMemo(() => getLookups(state.lookups, id, configType), [state.lookups, id, configType])
}
