/**
 * Guest marketplace bootstrap — anon-safe RPC (see migration 006).
 */
import type { PostgresBootstrap } from '../api/postgresClient'
import { createClient } from '../../utils/supabase/client'
import { mapGuestMarketplacePayload } from './mapGuestMarketplace'

type PublicRpcPayload = {
  clients?: Record<string, unknown>[]
  buildings?: Record<string, unknown>[]
  units?: Record<string, unknown>[]
  users?: Record<string, unknown>[]
  entity_id_map?: { entity_type: string; backend_id: string; frontend_id: string }[]
}

export async function fetchPublicMarketplaceBootstrap(lite = true): Promise<PostgresBootstrap | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('get_public_marketplace_bootstrap', {
      p_lite: lite,
    })
    if (error || !data) {
      console.warn('[publicMarketplace] RPC unavailable:', error?.message ?? 'empty payload')
      return null
    }
    const payload = data as PublicRpcPayload
    if (!payload.units?.length) return null
    return mapGuestMarketplacePayload(payload)
  } catch (err) {
    console.warn('[publicMarketplace] fetch failed', err)
    return null
  }
}
