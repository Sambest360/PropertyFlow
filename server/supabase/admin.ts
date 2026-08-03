import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey, getSupabaseUrl } from './env.js'

/** Service-role client — server only. Never import from the Vite client bundle. */
export function createAdminClient() {
  const secret = getSupabaseSecretKey()
  if (!secret) {
    throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(getSupabaseUrl(), secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
