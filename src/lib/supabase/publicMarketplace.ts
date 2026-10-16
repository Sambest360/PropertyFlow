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
  rooms?: Record<string, unknown>[]
  entity_id_map?: { entity_type: string; backend_id: string; frontend_id: string }[]
  viewing_slots?: Record<string, unknown>[]
}

export async function fetchPublicMarketplaceBootstrap(lite = true): Promise<PostgresBootstrap | null> {
  try {
    const supabase = createClient()
    // Prefer the lite RPC (cover image only) — the full variant serializes whole
    // image arrays, which can exceed Supabase's statement timeout when photos
    // are stored as large data URLs (see migration 008).
    const liteRes = await supabase.rpc('get_public_marketplace_bootstrap_lite', {
      p_lite: lite,
    })
    if (!liteRes.error && liteRes.data) {
      const payload = liteRes.data as PublicRpcPayload
      if (payload.units?.length) return mapGuestMarketplacePayload(payload)
    } else if (liteRes.error) {
      console.warn('[publicMarketplace] lite RPC unavailable, falling back:', liteRes.error.message)
    }
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
