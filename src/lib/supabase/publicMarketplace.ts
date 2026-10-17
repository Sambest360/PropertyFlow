/**
 * Guest marketplace bootstrap — anon-safe RPC (see migration 006).
 */
import type { PostgresBootstrap } from '../api/postgresClient'
import { createClient } from '../../utils/supabase/client'
import { mapGuestMarketplacePayload } from './mapGuestMarketplace'
import { emptyPublicMarketplaceBootstrap } from '../publicMarketplaceDemo'

type PublicRpcPayload = {
  clients?: Record<string, unknown>[]
  buildings?: Record<string, unknown>[]
  units?: Record<string, unknown>[]
  users?: Record<string, unknown>[]
  rooms?: Record<string, unknown>[]
  entity_id_map?: { entity_type: string; backend_id: string; frontend_id: string }[]
  viewing_slots?: Record<string, unknown>[]
}

const DEFAULT_TIMEOUT_MS = 15_000

function rpcTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('public marketplace timeout')), ms)
  })
}

async function callRpc(
  fn: 'get_public_marketplace_bootstrap_lite' | 'get_public_marketplace_bootstrap',
  lite: boolean,
  timeoutMs: number,
) {
  const supabase = createClient()
  return Promise.race([
    supabase.rpc(fn, { p_lite: lite }),
    rpcTimeout(timeoutMs),
  ])
}

export async function fetchPublicMarketplaceBootstrap(
  lite = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<PostgresBootstrap | null> {
  try {
    const liteRes = await callRpc('get_public_marketplace_bootstrap_lite', lite, timeoutMs)
    if (!liteRes.error && liteRes.data) {
      const payload = liteRes.data as PublicRpcPayload
      if (payload.units?.length) return mapGuestMarketplacePayload(payload)
      if (payload.units && !payload.units.length) {
        return { ...emptyPublicMarketplaceBootstrap(), marketplaceFetchFailed: false }
      }
    } else if (liteRes.error) {
      console.warn('[publicMarketplace] lite RPC unavailable, falling back:', liteRes.error.message)
    }
    const fullRes = await callRpc('get_public_marketplace_bootstrap', lite, timeoutMs)
    if (fullRes.error || !fullRes.data) {
      console.warn('[publicMarketplace] RPC unavailable:', fullRes.error?.message ?? 'empty payload')
      return null
    }
    const payload = fullRes.data as PublicRpcPayload
    if (!payload.units?.length) {
      return { ...emptyPublicMarketplaceBootstrap(), marketplaceFetchFailed: false }
    }
    return mapGuestMarketplacePayload(payload)
  } catch (err) {
    console.warn('[publicMarketplace] fetch failed', err)
    return null
  }
}
