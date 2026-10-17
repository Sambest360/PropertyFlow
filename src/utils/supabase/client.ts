import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublishableKey, getSupabaseUrl } from './env'

function makeBrowserClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey())
}

type BrowserClient = ReturnType<typeof makeBrowserClient>

let browserClient: BrowserClient | null = null

/** Browser Supabase client — singleton for the tab lifetime. */
export function createClient(): BrowserClient {
  if (!browserClient) {
    browserClient = makeBrowserClient()
  }
  return browserClient
}

/** Test-only: reset cached client between cases. */
export function resetSupabaseBrowserClient(): void {
  browserClient = null
}
