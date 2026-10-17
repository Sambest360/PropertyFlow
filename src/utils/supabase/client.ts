import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublishableKey, getSupabaseUrl } from './env'

type BrowserClient = ReturnType<typeof createBrowserClient>

let browserClient: BrowserClient | null = null

/** Browser Supabase client — singleton for the tab lifetime. */
export function createClient(): BrowserClient {
  if (!browserClient) {
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey())
  }
  return browserClient
}

/** Test-only: reset cached client between cases. */
export function resetSupabaseBrowserClient(): void {
  browserClient = null
}
