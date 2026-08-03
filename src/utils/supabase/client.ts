import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublishableKey, getSupabaseUrl } from './env'

/** Browser Supabase client — use in React components and client-side data fetching. */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey())
}
